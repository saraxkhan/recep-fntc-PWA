// AI SDK tools for the receptionist chat. Mirror the exact workflow the
// voice assistant uses by reusing the same helpers as the public AI endpoints.
import { tool } from "ai";
import { z } from "zod";
import {
  supabaseAdmin,
  loadDoctor,
  validateSlot,
  resolveDate,
  normalizePhoneE164,
  generateSlots,
  dayNameFromDate,
  kolkataDateString,
  kolkataTimeString,
  addDaysToDateString,
  matchSpecialty,
  SPECIALTIES,
} from "@/lib/ai-tools.server";

export const receptionistTools = {
  find_doctor: tool({
    description:
      "Find active doctors by medical specialty (e.g. 'cardiologist', 'pediatrician'). Use this first when the caller asks for a kind of doctor.",
    inputSchema: z.object({
      specialty: z.string().describe("Specialty name, partial matches allowed"),
    }),
    execute: async ({ specialty }) => {
      const matched = matchSpecialty(specialty);
      if (!matched) {
        return {
          error: "specialty_not_found",
          message: `No specialty matches "${specialty}".`,
          supported_specialties: SPECIALTIES,
        };
      }
      const { data, error } = await supabaseAdmin
        .from("doctors")
        .select("id, name, specialty, working_days, start_time, end_time")
        .ilike("specialty", matched)
        .eq("active", true)
        .order("name");
      if (error) return { error: error.message };
      return { specialty: matched, doctors: data ?? [] };
    },
  }),

  check_availability: tool({
    description:
      "List open 30-minute slots for a doctor on a specific date. Accepts 'today', 'tomorrow', or YYYY-MM-DD.",
    inputSchema: z.object({
      doctor_id: z.string(),
      date: z.string().describe("today | tomorrow | YYYY-MM-DD"),
    }),
    execute: async ({ doctor_id, date }) => {
      let resolved: string;
      try {
        resolved = resolveDate(date);
      } catch (e: any) {
        return { error: "invalid_date", message: e.message };
      }
      const doctor = await loadDoctor(doctor_id);
      if (!doctor) return { error: "doctor_not_found" };
      const day = dayNameFromDate(resolved);
      if (!doctor.working_days.includes(day)) {
        return {
          doctor: doctor.name,
          date: resolved,
          available_slots: [],
          reason: `${doctor.name} does not work on ${day}.`,
        };
      }
      const { data: booked } = await supabaseAdmin
        .from("appointments")
        .select("appointment_time")
        .eq("doctor_id", doctor_id)
        .eq("appointment_date", resolved)
        .eq("status", "scheduled");
      const taken = new Set(
        (booked ?? []).map((a: any) => a.appointment_time.slice(0, 5)),
      );
      let slots = generateSlots(
        doctor.start_time.slice(0, 5),
        doctor.end_time.slice(0, 5),
      ).filter((s) => !taken.has(s));
      if (resolved === kolkataDateString()) {
        const now = kolkataTimeString();
        slots = slots.filter((s) => s > now);
      }
      return {
        doctor: doctor.name,
        doctor_id,
        date: resolved,
        available_slots: slots,
      };
    },
  }),

  next_available_slot: tool({
    description:
      "Find the soonest open slot. Provide either a specific doctor_id or a specialty.",
    inputSchema: z.object({
      doctor_id: z.string().optional(),
      specialty: z.string().optional(),
      from_date: z.string().optional().describe("today | tomorrow | YYYY-MM-DD"),
      max_days: z.number().int().min(1).max(60).optional(),
    }),
    execute: async ({ doctor_id, specialty, from_date, max_days }) => {
      const maxD = Math.min(Math.max(max_days ?? 14, 1), 60);
      let from: string;
      try {
        from = resolveDate(from_date);
      } catch (e: any) {
        return { error: "invalid_date", message: e.message };
      }
      let doctors: any[] = [];
      if (doctor_id) {
        const d = await loadDoctor(doctor_id);
        if (!d) return { error: "doctor_not_found" };
        doctors = [d];
      } else if (specialty) {
        const matched = matchSpecialty(specialty);
        if (!matched) return { error: "specialty_not_found" };
        const { data } = await supabaseAdmin
          .from("doctors")
          .select("*")
          .ilike("specialty", matched)
          .eq("active", true);
        doctors = data ?? [];
      } else {
        return { error: "doctor_id_or_specialty_required" };
      }
      if (doctors.length === 0) return { error: "no_doctors_available" };
      const today = kolkataDateString();
      const nowHM = kolkataTimeString();
      let best: { doctor: any; date: string; time: string } | null = null;
      for (const doctor of doctors) {
        for (let i = 0; i < maxD; i++) {
          const date = addDaysToDateString(from, i);
          if (date < today) continue;
          const day = dayNameFromDate(date);
          if (!doctor.working_days.includes(day)) continue;
          const { data: booked } = await supabaseAdmin
            .from("appointments")
            .select("appointment_time")
            .eq("doctor_id", doctor.id)
            .eq("appointment_date", date)
            .eq("status", "scheduled");
          const taken = new Set(
            (booked ?? []).map((a: any) => a.appointment_time.slice(0, 5)),
          );
          let slots = generateSlots(
            doctor.start_time.slice(0, 5),
            doctor.end_time.slice(0, 5),
          ).filter((s) => !taken.has(s));
          if (date === today) slots = slots.filter((s) => s > nowHM);
          if (slots.length === 0) continue;
          const candidate = { doctor, date, time: slots[0] };
          if (
            !best ||
            candidate.date < best.date ||
            (candidate.date === best.date && candidate.time < best.time)
          ) {
            best = candidate;
          }
          break;
        }
      }
      if (!best) return { error: "no_slot_found" };
      return {
        doctor_id: best.doctor.id,
        doctor: best.doctor.name,
        specialty: best.doctor.specialty,
        appointment_date: best.date,
        appointment_time: best.time,
      };
    },
  }),

  create_patient: tool({
    description: "Create or look up a patient by phone number (normalized to E.164).",
    inputSchema: z.object({
      name: z.string().min(1),
      phone: z.string().min(4),
    }),
    execute: async ({ name, phone }) => {
      let normalized: string;
      try {
        normalized = normalizePhoneE164(phone);
      } catch (e: any) {
        return { error: "invalid_phone", message: e.message };
      }
      const { data: existing } = await supabaseAdmin
        .from("patients")
        .select("*")
        .eq("phone", normalized)
        .maybeSingle();
      if (existing) return { patient: existing, existed: true };
      const { data, error } = await supabaseAdmin
        .from("patients")
        .insert({ name: name.trim(), phone: normalized })
        .select()
        .single();
      if (error) return { error: error.message };
      return { patient: data, existed: false };
    },
  }),

  book_appointment: tool({
    description:
      "Book an appointment. Always confirm patient name, phone, doctor, date and time with the caller before calling this. Provide an idempotency_key (e.g. a UUID) to prevent duplicate bookings.",
    inputSchema: z.object({
      doctor_id: z.string(),
      appointment_date: z.string().describe("today | tomorrow | YYYY-MM-DD"),
      appointment_time: z.string().describe("HH:MM, 24-hour"),
      name: z.string().optional(),
      phone: z.string().optional(),
      patient_id: z.string().optional(),
      idempotency_key: z.string().optional(),
    }),
    execute: async (args) => {
      let appointment_date: string;
      try {
        appointment_date = resolveDate(args.appointment_date);
      } catch (e: any) {
        return { error: "invalid_date", message: e.message };
      }
      const idempotency_key = args.idempotency_key ?? null;
      if (idempotency_key) {
        const { data: existing } = await supabaseAdmin
          .from("appointments")
          .select("*, doctors(name, specialty), patients(name, phone)")
          .eq("idempotency_key", idempotency_key)
          .maybeSingle();
        if (existing)
          return { ok: true, idempotent_replay: true, appointment: existing };
      }
      let patientId = args.patient_id ?? null;
      if (!patientId) {
        if (!args.name || !args.phone)
          return { error: "patient_id, or both name and phone, are required" };
        let phone: string;
        try {
          phone = normalizePhoneE164(args.phone);
        } catch (e: any) {
          return { error: "invalid_phone", message: e.message };
        }
        const { data: existingPatient } = await supabaseAdmin
          .from("patients")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();
        if (existingPatient) {
          patientId = (existingPatient as any).id;
        } else {
          const { data: created, error: pErr } = await supabaseAdmin
            .from("patients")
            .insert({ name: args.name.trim(), phone })
            .select("id")
            .single();
          if (pErr) return { error: pErr.message };
          patientId = (created as any).id;
        }
      }
      const doctor = await loadDoctor(args.doctor_id);
      if (!doctor) return { error: "doctor_not_found" };
      if (!patientId) return { error: "patient_not_resolved" };
      const check = await validateSlot(doctor, appointment_date, args.appointment_time);
      if (!check.ok) return { error: check.code, message: check.message };
      const { data: inserted, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          patient_id: patientId,
          doctor_id: args.doctor_id,
          appointment_date,
          appointment_time: args.appointment_time.slice(0, 5),
          status: "scheduled",
          sms_sent: false,
          idempotency_key,
        })
        .select("*, doctors(name, specialty), patients(name, phone)")
        .single();
      if (error) {
        if ((error as any).code === "23505")
          return { error: "slot_taken", message: "That slot was just taken." };
        return { error: error.message };
      }
      return { ok: true, appointment: inserted };
    },
  }),

  lookup_appointments: tool({
    description:
      "Look up a patient's existing appointments by phone number. Use this when a caller asks to check or cancel an existing booking.",
    inputSchema: z.object({
      phone: z.string().min(4),
    }),
    execute: async ({ phone }) => {
      let normalized: string;
      try {
        normalized = normalizePhoneE164(phone);
      } catch (e: any) {
        return { error: "invalid_phone", message: e.message };
      }
      const { data: patient } = await supabaseAdmin
        .from("patients")
        .select("id, name, phone")
        .eq("phone", normalized)
        .maybeSingle();
      if (!patient) return { error: "patient_not_found", phone: normalized };
      const { data: appts, error } = await supabaseAdmin
        .from("appointments")
        .select("id, appointment_date, appointment_time, status, doctors(name, specialty)")
        .eq("patient_id", (patient as any).id)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(20);
      if (error) return { error: error.message };
      return { patient, appointments: appts ?? [] };
    },
  }),

  cancel_appointment: tool({
    description: "Cancel an appointment by its id. Confirm with the caller before calling this.",
    inputSchema: z.object({
      appointment_id: z.string(),
    }),
    execute: async ({ appointment_id }) => {
      const { error } = await supabaseAdmin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointment_id);
      if (error) return { error: error.message };
      return { ok: true, appointment_id };
    },
  }),

  send_confirmation_sms: tool({
    description:
      "Send a confirmation SMS to the patient after a successful booking. Marks the appointment's sms_sent flag.",
    inputSchema: z.object({
      appointment_id: z.string(),
      phone: z.string(),
      message: z.string().optional(),
    }),
    execute: async ({ appointment_id, phone, message }) => {
      let to: string;
      try {
        to = normalizePhoneE164(phone);
      } catch (e: any) {
        return { error: "invalid_phone", message: e.message };
      }
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;
      const body = message ?? "Your appointment is confirmed.";
      let provider: any = { simulated: true };
      if (sid && token && from) {
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: from, Body: body }),
          },
        );
        provider = await resp.json();
        if (!resp.ok) return { error: "twilio_failed", details: provider };
      } else {
        console.log(`[SMS simulated] to=${to} :: ${body}`);
      }
      await supabaseAdmin
        .from("appointments")
        .update({ sms_sent: true })
        .eq("id", appointment_id);
      return { ok: true, to, simulated: !!provider.simulated };
    },
  }),
};

export const RECEPTIONIST_SYSTEM_PROMPT = `You are Maya, the AI receptionist at MediVoice Hospital. You handle bookings, cancellations, and availability questions exactly like the phone voice assistant does.

Style:
- Warm, concise, and professional. Speak as if on a phone call: short sentences, no markdown lists unless explicitly helpful in chat.
- Always confirm details (name, phone, doctor, date, time) back to the caller before booking or cancelling.
- The clinic timezone is Asia/Kolkata. Treat "today" / "tomorrow" in that timezone.
- Phone numbers default to India (+91) if no country code is provided.

Workflow:
1. Greet briefly and ask how you can help.
2. For bookings: gather specialty (or doctor name) → call find_doctor → ask preferred date → call check_availability or next_available_slot → propose a slot → collect name + phone → confirm everything → call book_appointment with a fresh idempotency_key → then call send_confirmation_sms.
3. For cancellations: ask for phone → call lookup_appointments → confirm which one → call cancel_appointment.
4. For "what's available" / "any cardiologist tomorrow": use check_availability or next_available_slot.
5. Never invent doctor names, times, or IDs. Only mention what the tools return.
6. If a tool returns an error, explain it in plain language and offer a next step.

Available specialties: Cardiologist, Neurologist, Gynecologist, General Physician, Radiologist, Orthopedic, Dermatologist, Pediatrician, ENT Specialist, Ophthalmologist.

Working hours are doctor-specific; rely on tool results. Slots are 30 minutes.`;