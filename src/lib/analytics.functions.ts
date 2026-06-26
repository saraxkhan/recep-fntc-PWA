// Admin server functions for AI conversation inspection + analytics.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin-auth";
export const listCallLogs = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("call_logs")
    .select("*, appointments(id, appointment_date, appointment_time, doctors(name, specialty), patients(name, phone))")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
});
export const getCallTranscript = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ session_id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: session }, { data: messages }] = await Promise.all([
      (supabaseAdmin as any)
        .from("call_logs")
        .select("*, appointments(id, appointment_date, appointment_time, status, doctors(name, specialty), patients(name, phone))")
        .eq("session_id", data.session_id)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("ai_conversation_logs")
        .select("*")
        .eq("session_id", data.session_id)
        .order("created_at", { ascending: true }),
    ]);
    return { session, messages: messages ?? [] };
  });
export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: appts }, { data: calls }] = await Promise.all([
    supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, created_at, doctor_id, doctors(name, specialty)"),
    (supabaseAdmin as any)
      .from("call_logs")
      .select("id, booking_succeeded, appointment_id, started_at"),
  ]);
  const appointments = (appts ?? []) as any[];
  const callLogs = (calls ?? []) as any[];
  const total = appointments.length;
  const cancelled = appointments.filter((a) => a.status === "cancelled").length;
  const completed = appointments.filter((a) => a.status === "completed").length;
  const scheduled = appointments.filter((a) => a.status === "scheduled").length;
  const cancellationRate = total ? cancelled / total : 0;
  const specialtyMap = new Map<string, number>();
  const doctorMap = new Map<string, { name: string; specialty: string; count: number }>();
  const dailyMap = new Map<string, number>();
  for (const a of appointments) {
    const spec = a.doctors?.specialty ?? "Unknown";
    specialtyMap.set(spec, (specialtyMap.get(spec) ?? 0) + 1);
    const dKey = a.doctor_id;
    const prev = doctorMap.get(dKey);
    if (prev) prev.count++;
    else
      doctorMap.set(dKey, {
        name: a.doctors?.name ?? "—",
        specialty: spec,
        count: 1,
      });
    const day = (a.created_at as string).slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  // last 14 days inclusive of today
  const today = new Date();
  const daily: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key.slice(5), count: dailyMap.get(key) ?? 0 });
  }
  const bySpecialty = [...specialtyMap.entries()]
    .map(([specialty, count]) => ({ specialty, count }))
    .sort((a, b) => b.count - a.count);
  const topDoctors = [...doctorMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const aiSessions = callLogs.length;
  const aiBookings = callLogs.filter((c) => c.booking_succeeded).length;
  const aiSuccessRate = aiSessions ? aiBookings / aiSessions : 0;
  return {
    totals: { total, scheduled, completed, cancelled },
    cancellationRate,
    bySpecialty,
    topDoctors,
    daily,
    ai: { sessions: aiSessions, bookings: aiBookings, successRate: aiSuccessRate },
  };
});
// ---------------------------------------------------------------------------
// listVoiceCalls
// ---------------------------------------------------------------------------
// Returns all call_logs rows where channel = 'voice', newest first, with the
// joined appointment (doctor + patient names) when a booking was made.
// Used by the /admin/voice-calls page.
// ---------------------------------------------------------------------------
export const listVoiceCalls = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("call_logs")
      .select(
        `id, session_id, vapi_call_id, caller_phone,
         started_at, ended_at, duration_seconds,
         status, booking_succeeded, interrupted,
         needs_human_followup, human_followup_resolved,
         followup_sms_sent, recording_url, transcript,
         appointments(
           id, appointment_date, appointment_time, status,
           doctors(name, specialty),
           patients(name, phone)
         )`
      )
      .eq("channel", "voice")
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });
// ---------------------------------------------------------------------------
// resolveHumanHandoff
// ---------------------------------------------------------------------------
// Admin marks a voice call's human-handoff flag as resolved after a staff
// member has followed up with the patient. Writes an audit log entry.
// ---------------------------------------------------------------------------
export const resolveHumanHandoff = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z.object({ session_id: z.string().min(1).max(200) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAuditLog } = await import("@/lib/admin-auth.server");
    const { error } = await (supabaseAdmin as any)
      .from("call_logs")
      .update({ human_followup_resolved: true })
      .eq("session_id", data.session_id)
      .eq("channel", "voice");
    if (error) throw new Error(error.message);
    await writeAuditLog({
      actorId: context.adminId,
      actorEmail: context.adminEmail,
      action: "voice_call.human_handoff_resolved",
      resourceType: "call_log",
      resourceId: data.session_id,
      details: { session_id: data.session_id },
    });
    return { ok: true };
  });
// ---------------------------------------------------------------------------
// sendFollowupSms
// ---------------------------------------------------------------------------
// Sends a recovery SMS to a caller whose call was interrupted before a
// booking was completed. Uses the same Twilio credentials and request pattern
// as the existing /api/public/ai/send-sms endpoint — no new SMS logic.
//
// Guards:
//   • Only works on voice calls flagged as interrupted = true.
//   • Refuses to send if followup_sms_sent is already true (idempotent).
//   • Requires caller_phone to be present on the row.
//
// After a successful send, sets followup_sms_sent = true and writes an
// audit log entry.
// ---------------------------------------------------------------------------
export const sendFollowupSms = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z.object({ session_id: z.string().min(1).max(200) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAuditLog } = await import("@/lib/admin-auth.server");
    // ── Fetch the call row ──────────────────────────────────────────────────
    const { data: row, error: fetchErr } = await (supabaseAdmin as any)
      .from("call_logs")
      .select("caller_phone, interrupted, followup_sms_sent, channel")
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("call_log not found");
    if (row.channel !== "voice") throw new Error("sendFollowupSms is only valid for voice calls");
    if (!row.interrupted) throw new Error("Call is not flagged as interrupted");
    if (row.followup_sms_sent) return { ok: true, alreadySent: true };
    if (!row.caller_phone) throw new Error("No caller phone number on this call — cannot send SMS");
    // ── Send via Twilio (same implementation as /api/public/ai/send-sms) ───
    const to: string = row.caller_phone;
    const message =
      "Hi! We noticed your call with our AI receptionist Maya was cut short. " +
      "Please call us back or visit our website to complete your appointment booking. " +
      "We're sorry for any inconvenience.";
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_FROM_NUMBER;
    if (sid && token && from) {
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: from, Body: message }),
        }
      );
      if (!resp.ok) {
        const details = await resp.json().catch(() => ({}));
        throw new Error(`Twilio error: ${JSON.stringify(details)}`);
      }
    } else {
      // Graceful degradation in dev/staging: log but don't fail.
      console.log(`[sendFollowupSms simulated] to=${to} :: ${message}`);
    }
    // ── Mark as sent ────────────────────────────────────────────────────────
    await (supabaseAdmin as any)
      .from("call_logs")
      .update({ followup_sms_sent: true })
      .eq("session_id", data.session_id);
    await writeAuditLog({
      actorId: context.adminId,
      actorEmail: context.adminEmail,
      action: "voice_call.followup_sms_sent",
      resourceType: "call_log",
      resourceId: data.session_id,
      details: { to, session_id: data.session_id },
    });
    return { ok: true, alreadySent: false };
  });
