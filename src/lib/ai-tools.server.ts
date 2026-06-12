// Shared helpers for the AI tool endpoints (Vapi voice agent callbacks).
// All endpoints accept JSON and return JSON.
//
// Concerns owned by this module:
//   - Shared-secret auth (require x-ai-secret header == AI_SHARED_SECRET)
//   - Phone normalization to E.164 (defaults to India +91)
//   - Asia/Kolkata timezone handling ("today" / "tomorrow" resolution)
//   - Specialty matching (case-insensitive, partial)
//   - Slot generation + booking validation (same checks as the public booking flow)
//   - Idempotency-key-aware booking insert
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateSlots, dayNameFromDate, SPECIALTIES } from "@/lib/slots";

// -------------------- response helpers --------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ai-secret",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: CORS });
}

// -------------------- shared-secret auth --------------------
// Vapi sends a configured custom header on every tool call.
// In dev, if AI_SHARED_SECRET is unset, we allow requests through and log a warning
// so the voice agent can still be wired up before the secret is configured.
export function requireAiAuth(request: Request): Response | null {
  const expected = process.env.AI_SHARED_SECRET;
  if (!expected) {
    console.warn("[ai-tools] AI_SHARED_SECRET not set — accepting unauthenticated request");
    return null;
  }
  const got =
    request.headers.get("x-ai-secret") ??
    request.headers.get("X-AI-Secret") ??
    (request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null);
  if (got !== expected) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  return null;
}

// -------------------- Vapi payload parsing --------------------
// Vapi sends function-call payloads in different shapes depending on version.
export async function parseArgs(request: Request): Promise<Record<string, any>> {
  try {
    const body = await request.json();
    if (body?.message?.toolCalls?.[0]?.function?.arguments) {
      const a = body.message.toolCalls[0].function.arguments;
      return typeof a === "string" ? JSON.parse(a) : a;
    }
    if (body?.functionCall?.parameters) return body.functionCall.parameters;
    return body ?? {};
  } catch {
    return {};
  }
}

// -------------------- phone E.164 normalization --------------------
// Defaults to India country code +91 since the clinic is in Asia/Kolkata.
// Accepts: "9876543210", "09876543210", "+91 98765 43210", "(987) 654-3210", etc.
// Throws a friendly error on shapes we can't confidently normalize.
const DEFAULT_COUNTRY_CODE = "91";

export function normalizePhoneE164(raw: string): string {
  if (!raw) throw new Error("phone is required");
  const trimmed = String(raw).trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) throw new Error("phone has no digits");

  if (hadPlus) {
    // already in international form — just keep digits
  } else if (digits.length === 10) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // strip Indian trunk prefix
    digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    // already +91XXXXXXXXXX worth
  } else if (digits.length < 8 || digits.length > 15) {
    throw new Error(`phone number "${raw}" is not a valid length`);
  }

  const e164 = "+" + digits;
  // RFC 3966 / E.164: + followed by 8-15 digits
  if (!/^\+\d{8,15}$/.test(e164)) {
    throw new Error(`could not normalize phone "${raw}" to E.164`);
  }
  return e164;
}

// -------------------- Asia/Kolkata timezone helpers --------------------
export const CLINIC_TZ = "Asia/Kolkata";

// Returns YYYY-MM-DD in Asia/Kolkata for the given Date (defaults to now).
export function kolkataDateString(d: Date = new Date()): string {
  // en-CA -> YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Returns HH:MM (24h) in Asia/Kolkata for the given Date (defaults to now).
export function kolkataTimeString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// Add `days` calendar days to a YYYY-MM-DD string (interpreted in Kolkata).
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Resolves "today" / "tomorrow" / "YYYY-MM-DD" / "DD-MM-YYYY" to YYYY-MM-DD
// using Asia/Kolkata as the reference timezone.
export function resolveDate(raw: string | undefined): string {
  const today = kolkataDateString();
  if (!raw || !String(raw).trim()) return today;
  const s = String(raw).trim().toLowerCase();
  if (s === "today") return today;
  if (s === "tomorrow") return addDaysToDateString(today, 1);
  if (s === "day after tomorrow") return addDaysToDateString(today, 2);
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  throw new Error(`could not parse date "${raw}"`);
}

// -------------------- specialty matching --------------------
export function matchSpecialty(query: string): string | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  // exact (case-insensitive)
  const exact = SPECIALTIES.find((s) => s.toLowerCase() === q);
  if (exact) return exact;
  // partial (either side contains the other)
  const partial = SPECIALTIES.find(
    (s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase()),
  );
  return partial ?? null;
}

// -------------------- slot validation + booking --------------------
export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  working_days: string[];
  start_time: string;
  end_time: string;
  active: boolean;
};

export async function loadDoctor(doctorId: string): Promise<Doctor | null> {
  const { data } = await supabaseAdmin
    .from("doctors")
    .select("*")
    .eq("id", doctorId)
    .maybeSingle();
  return (data as Doctor | null) ?? null;
}

export type SlotValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

// Runs the same checks the public booking flow runs:
//   - doctor exists and is active
//   - date is not in the past (Asia/Kolkata)
//   - doctor works on that weekday
//   - time falls on a 30-min slot boundary inside the doctor's working hours
//   - slot is not already booked
export async function validateSlot(
  doctor: Doctor,
  date: string,
  time: string,
): Promise<SlotValidation> {
  if (!doctor.active) {
    return { ok: false, code: "doctor_inactive", message: `${doctor.name} is not accepting appointments.` };
  }
  const today = kolkataDateString();
  if (date < today) {
    return { ok: false, code: "date_in_past", message: "That date is in the past." };
  }
  const day = dayNameFromDate(date);
  if (!doctor.working_days.includes(day)) {
    return {
      ok: false,
      code: "doctor_off",
      message: `${doctor.name} does not work on ${day}.`,
    };
  }
  const validSlots = generateSlots(
    doctor.start_time.slice(0, 5),
    doctor.end_time.slice(0, 5),
  );
  const requested = time.slice(0, 5);
  if (!validSlots.includes(requested)) {
    return {
      ok: false,
      code: "invalid_slot",
      message: `${requested} is not a valid slot for ${doctor.name}. Working hours: ${doctor.start_time.slice(0, 5)}-${doctor.end_time.slice(0, 5)}.`,
    };
  }
  // For today, also reject slots that have already passed (Kolkata time).
  if (date === today) {
    const nowHM = kolkataTimeString();
    if (requested <= nowHM) {
      return { ok: false, code: "slot_in_past", message: `${requested} has already passed today.` };
    }
  }
  const { data: clash } = await supabaseAdmin
    .from("appointments")
    .select("id")
    .eq("doctor_id", doctor.id)
    .eq("appointment_date", date)
    .eq("appointment_time", requested)
    .eq("status", "scheduled")
    .maybeSingle();
  if (clash) {
    return { ok: false, code: "slot_taken", message: "That slot is already booked." };
  }
  return { ok: true };
}

// -------------------- re-exports for endpoints --------------------
export { supabaseAdmin, generateSlots, dayNameFromDate, SPECIALTIES };
