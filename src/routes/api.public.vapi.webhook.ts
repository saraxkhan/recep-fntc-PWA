import { createFileRoute } from "@tanstack/react-router";
// ---------------------------------------------------------------------------
// POST /api/public/vapi/webhook  —  Vapi lifecycle event receiver
// ---------------------------------------------------------------------------
//
// Vapi calls this URL for every call-lifecycle event. We handle two:
//
//   call-start          Fired when the phone call connects.
//                       → Upserts a call_logs row (channel = "voice").
//
//   end-of-call-report  Fired when the call ends (normally or via error).
//                       → Populates analytics columns: duration, transcript,
//                         recording_url, booking outcome, interrupted flag,
//                         and human-handoff flag.
//
// All other Vapi event types are acknowledged with HTTP 200 and ignored.
// Returning non-2xx would cause Vapi to retry; we never want that for events
// we intentionally skip.
//
// ── Auth ─────────────────────────────────────────────────────────────────────
// Vapi sends the "Server URL Secret" you configure in the assistant as the
// value of the X-Vapi-Secret request header (plain string, not HMAC).
// We compare it to process.env.VAPI_WEBHOOK_SECRET.
// If VAPI_WEBHOOK_SECRET is unset we log a warning and allow through so you
// can test locally before setting the secret in production.
//
// ── Idempotency ──────────────────────────────────────────────────────────────
// Both handlers upsert on session_id (= the Vapi call ID).
// A retried webhook delivery overwrites the same data; no duplicate rows.
//
// ── Graceful missing-field handling ──────────────────────────────────────────
// Every optional field from Vapi (recording_url, transcript, durationSeconds,
// toolCallResults) uses nullish coalescing or type-guards so a missing field
// never throws or returns a non-200 response.
// ---------------------------------------------------------------------------
// ── Constants ────────────────────────────────────────────────────────────────
// endedReason values that mean the call finished normally with no follow-up.
const CLEAN_END_REASONS = new Set([
  "customer-ended-call",       // caller pressed hang-up
  "assistant-ended-call",      // Maya said goodbye and hung up
  "assistant-said-end-call-phrase", // Maya used a configured end phrase
  "voicemail",                 // caller hit voicemail — not a mid-booking drop
]);
// endedReason values that mean Maya explicitly transferred to a human agent.
// We set needs_human_followup = true for these.
const FORWARDED_END_REASONS = new Set([
  "assistant-forwarded-call",
]);
// Transcript phrases (checked case-insensitively) that indicate the caller
// wanted a human even if Vapi did not formally record a forwarding event.
const HUMAN_INTENT_PHRASES = [
  "speak to a human",
  "talk to a human",
  "speak to a person",
  "talk to a person",
  "speak to an agent",
  "talk to an agent",
  "speak to a representative",
  "talk to a representative",
  "real person",
  "actual person",
  "human agent",
  "connect me to",
  "transfer me to",
  "i want a human",
  "get a human",
  "can i speak to",
  "can i talk to",
];
// ── Route handler ─────────────────────────────────────────────────────────────
export const Route = createFileRoute("/api/public/vapi/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { optionsResponse } = await import("@/lib/ai-tools.server");
        return optionsResponse();
      },
      POST: async ({ request }) => {
        const { supabaseAdmin, jsonResponse } = await import(
          "@/lib/ai-tools.server"
        );
        // ── Step 1: Read raw body ─────────────────────────────────────────
        // Must be read before any other access; request body can only be
        // consumed once.
        const rawBody = await request.text();
        // ── Step 2: Verify X-Vapi-Secret header ───────────────────────────
        const secret = process.env.VAPI_WEBHOOK_SECRET;
        if (secret) {
          const provided =
            request.headers.get("x-vapi-secret") ??
            request.headers.get("X-Vapi-Secret") ??
            "";
          if (provided !== secret) {
            console.warn("[vapi-webhook] rejected: X-Vapi-Secret mismatch");
            return jsonResponse({ error: "unauthorized" }, 401);
          }
        } else {
          console.warn(
            "[vapi-webhook] VAPI_WEBHOOK_SECRET is not set — " +
              "accepting unauthenticated request. Set it in production."
          );
        }
        // ── Step 3: Parse JSON ────────────────────────────────────────────
        let body: any;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }
        // Vapi wraps all events inside a top-level `message` object.
        const msg: any = body?.message ?? body ?? {};
        const eventType: string = String(msg?.type ?? "").trim();
        // ── Step 4: Handle call-start ─────────────────────────────────────
        if (eventType === "call-start") {
          return handleCallStart(msg, supabaseAdmin, jsonResponse);
        }
        // ── Step 5: Handle end-of-call-report ─────────────────────────────
        if (eventType === "end-of-call-report") {
          return handleEndOfCall(msg, supabaseAdmin, jsonResponse);
        }
        // ── Step 6: Acknowledge all other event types ─────────────────────
        // Vapi sends: speech-update, transcript, hang, tool-calls (server tool
        // mode), status-update, etc. We don't process them. Returning 200
        // prevents Vapi from retrying.
        return jsonResponse({ ok: true, type: eventType, ignored: true });
      },
    },
  },
});
// ── call-start handler ────────────────────────────────────────────────────────
async function handleCallStart(
  msg: any,
  supabaseAdmin: any,
  jsonResponse: (body: unknown, status?: number) => Response
): Promise<Response> {
  const call = msg?.call ?? {};
  const callId: string = String(call?.id ?? "").trim();
  if (!callId) {
    return jsonResponse({ error: "missing call.id in call-start event" }, 400);
  }
  // Caller phone may be absent for SIP / anonymous calls — store null gracefully.
  const callerPhone: string | null =
    call?.customer?.number ?? call?.customer?.numberE164CheckEnabled ?? null;
  try {
    // Upsert on session_id so a retried call-start event is idempotent.
    // For voice calls session_id = vapi_call_id (Vapi's own unique call ID).
    await supabaseAdmin.from("call_logs").upsert(
      {
        session_id:       callId,
        vapi_call_id:     callId,
        channel:          "voice",
        status:           "active",
        caller_phone:     callerPhone,
        started_at:       new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
  } catch (err) {
    console.error("[vapi-webhook] call-start upsert failed:", err);
    // Return 200 even on a logging failure so Vapi does not retry the call-start
    // event, which could interrupt the live call.
    return jsonResponse({ ok: true, warning: "logging_failed" });
  }
  console.log(`[vapi-webhook] call started | id=${callId} | caller=${callerPhone ?? "unknown"}`);
  return jsonResponse({ ok: true });
}
// ── end-of-call-report handler ────────────────────────────────────────────────
async function handleEndOfCall(
  msg: any,
  supabaseAdmin: any,
  jsonResponse: (body: unknown, status?: number) => Response
): Promise<Response> {
  const call = msg?.call ?? {};
  const callId: string = String(call?.id ?? "").trim();
  if (!callId) {
    return jsonResponse({ error: "missing call.id in end-of-call-report" }, 400);
  }
  // ── Extract optional fields ────────────────────────────────────────────────
  // Every field uses a nullish fallback so a missing/undefined value from Vapi
  // never causes a runtime error.
  const endedReason: string = String(msg?.endedReason ?? "unknown");
  const callerPhone: string | null =
    call?.customer?.number ?? call?.customer?.numberE164CheckEnabled ?? null;
  // Vapi sends duration as a float (e.g. 245.3 seconds) — round to integer.
  const durationSeconds: number | null =
    typeof msg?.durationSeconds === "number"
      ? Math.round(msg.durationSeconds)
      : null;
  // Recording URL: present only when recording is enabled on the assistant.
  const recordingUrl: string | null =
    typeof msg?.recordingUrl === "string" && msg.recordingUrl.trim()
      ? msg.recordingUrl.trim()
      : null;
  // Flat transcript: may be absent for very short or immediately-dropped calls.
  const transcript: string | null =
    typeof msg?.transcript === "string" && msg.transcript.trim()
      ? msg.transcript.trim()
      : null;
  // ── Parse tool call results ───────────────────────────────────────────────
  // Vapi returns an array of { name, result } where `result` is a JSON string
  // matching the body our /api/public/ai/* endpoints return.
  const toolCallResults: any[] = Array.isArray(msg?.toolCallResults)
    ? msg.toolCallResults
    : [];
  // Detect a successful booking.
  let bookingSucceeded = false;
  let appointmentId: string | null = null;
  for (const r of toolCallResults) {
    const name: string = String(r?.name ?? r?.toolName ?? "");
    if (name === "book_appointment") {
      try {
        const parsed =
          typeof r.result === "string" ? JSON.parse(r.result) : (r.result ?? {});
        if (parsed?.ok && typeof parsed?.appointment?.id === "string") {
          bookingSucceeded = true;
          appointmentId = parsed.appointment.id;
          break;
        }
      } catch {
        // result was not valid JSON — skip without throwing
      }
    }
  }
  // Detect a successful cancellation (the session is "complete" even though
  // no new appointment was made, so we don't flag it as interrupted).
  let cancellationSucceeded = false;
  if (!bookingSucceeded) {
    for (const r of toolCallResults) {
      const name: string = String(r?.name ?? r?.toolName ?? "");
      if (name === "cancel_appointment") {
        try {
          const parsed =
            typeof r.result === "string" ? JSON.parse(r.result) : (r.result ?? {});
          if (parsed?.ok) {
            cancellationSucceeded = true;
            break;
          }
        } catch {
          // skip
        }
      }
    }
  }
  // ── Human handoff detection ───────────────────────────────────────────────
  // Check 1: Vapi's ended reason (most reliable — Maya explicitly transferred).
  let needsHumanFollowup = FORWARDED_END_REASONS.has(endedReason);
  // Check 2: Scan transcript for explicit human-request phrases.
  if (!needsHumanFollowup && transcript) {
    const lower = transcript.toLowerCase();
    needsHumanFollowup = HUMAN_INTENT_PHRASES.some((phrase) =>
      lower.includes(phrase)
    );
  }
  // ── Interrupted call detection ────────────────────────────────────────────
  // A call is "interrupted" (warrants a recovery SMS) when ALL of:
  //   1. The call did NOT end cleanly (not a normal hang-up or human handoff).
  //   2. No booking or cancellation was completed (partial progress in flow).
  //   3. At least one tool was called (caller was mid-flow, not just idle).
  //   4. We have the caller's phone number to send the SMS to.
  const endedCleanly =
    CLEAN_END_REASONS.has(endedReason) || needsHumanFollowup;
  const hadPartialProgress = toolCallResults.length > 0;
  const canSendSms = callerPhone !== null;
  const interrupted =
    !endedCleanly &&
    !bookingSucceeded &&
    !cancellationSucceeded &&
    hadPartialProgress &&
    canSendSms;
  // ── Upsert call_logs ──────────────────────────────────────────────────────
  // Idempotent upsert on session_id:
  //   • If call-start already created the row → update it with final values.
  //   • If call-start was missed (e.g. network error) → create the full row.
  //   • If end-of-call-report is retried → overwrite with identical values.
  try {
    await supabaseAdmin.from("call_logs").upsert(
      {
        session_id:              callId,
        vapi_call_id:            callId,
        channel:                 "voice",
        status:                  "ended",
        caller_phone:            callerPhone,
        ended_at:                new Date().toISOString(),
        last_activity_at:        new Date().toISOString(),
        duration_seconds:        durationSeconds,
        recording_url:           recordingUrl,
        transcript:              transcript,
        booking_succeeded:       bookingSucceeded,
        appointment_id:          appointmentId,
        needs_human_followup:    needsHumanFollowup,
        interrupted:             interrupted,
        // Do not set followup_sms_sent here — that is set by the admin
        // "Send recovery SMS" action (Phase 4 server function).
      },
      { onConflict: "session_id" }
    );
  } catch (err) {
    console.error("[vapi-webhook] end-of-call upsert failed:", err);
    // Return 200 to prevent Vapi from retrying a completed call indefinitely.
    return jsonResponse({ ok: true, warning: "logging_failed" });
  }
  console.log(
    `[vapi-webhook] call ended | id=${callId} | ` +
      `duration=${durationSeconds ?? "?"}s | reason=${endedReason} | ` +
      `booked=${bookingSucceeded} | cancelled=${cancellationSucceeded} | ` +
      `human=${needsHumanFollowup} | interrupted=${interrupted}`
  );
  return jsonResponse({
    ok: true,
    callId,
    bookingSucceeded,
    cancellationSucceeded,
    needsHumanFollowup,
    interrupted,
  });
}