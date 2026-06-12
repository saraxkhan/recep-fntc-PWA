import { createFileRoute } from "@tanstack/react-router";

// AI tool: book an appointment.
// Runs the same validation as the public booking flow and supports an
// idempotency key so voice retries don't create duplicate bookings.
export const Route = createFileRoute("/api/public/ai/book-appointment")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { optionsResponse } = await import("@/lib/ai-tools.server");
        return optionsResponse();
      },
      POST: async ({ request }) => {
        const {
          jsonResponse,
          parseArgs,
          requireAiAuth,
          supabaseAdmin,
          loadDoctor,
          validateSlot,
          resolveDate,
          normalizePhoneE164,
        } = await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const doctor_id = String(args.doctor_id ?? "").trim();
        const appointment_time = String(args.appointment_time ?? "").trim();
        const name = String(args.name ?? args.patient_name ?? "").trim();
        const phoneRaw = String(args.phone ?? "").trim();
        const patient_id_raw = String(args.patient_id ?? "").trim();
        const idempotency_key =
          String(args.idempotency_key ?? request.headers.get("idempotency-key") ?? "").trim() || null;

        if (!doctor_id || !appointment_time) {
          return jsonResponse(
            { error: "doctor_id and appointment_time are required" },
            400,
          );
        }

        // Date: accepts "today"/"tomorrow"/ISO/DMY; resolves in Asia/Kolkata.
        let appointment_date: string;
        try {
          appointment_date = resolveDate(args.appointment_date);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_date", message: e.message }, 400);
        }

        // Idempotency: short-circuit if we've already booked this exact tool call.
        if (idempotency_key) {
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("*, doctors(name, specialty), patients(name, phone)")
            .eq("idempotency_key", idempotency_key)
            .maybeSingle();
          if (existing) {
            return jsonResponse({ ok: true, idempotent_replay: true, appointment: existing });
          }
        }

        // Resolve patient: either by patient_id, or upsert by (name, phone).
        let patientId = patient_id_raw || null;
        let phone: string | null = null;
        if (!patientId) {
          if (!name || !phoneRaw) {
            return jsonResponse(
              { error: "patient_id, or both name and phone, are required" },
              400,
            );
          }
          try {
            phone = normalizePhoneE164(phoneRaw);
          } catch (e: any) {
            return jsonResponse({ error: "invalid_phone", message: e.message }, 400);
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
              .insert({ name, phone })
              .select("id")
              .single();
            if (pErr) return jsonResponse({ error: pErr.message }, 500);
            patientId = (created as any).id;
          }
        }

        // Same checks as the public booking flow.
        const doctor = await loadDoctor(doctor_id);
        if (!doctor) return jsonResponse({ error: "doctor_not_found" }, 404);
        const check = await validateSlot(doctor, appointment_date, appointment_time);
        if (!check.ok) {
          return jsonResponse({ error: check.code, message: check.message }, 409);
        }

        if (!patientId) return jsonResponse({ error: "patient_not_resolved" }, 500);
        const { data: inserted, error } = await supabaseAdmin
          .from("appointments")
          .insert({
            patient_id: patientId,
            doctor_id,
            appointment_date,
            appointment_time: appointment_time.slice(0, 5),
            status: "scheduled",
            sms_sent: false,
            idempotency_key,
          })
          .select("*, doctors(name, specialty), patients(name, phone)")
          .single();

        if (error) {
          if (
            (error as any).code === "23505" ||
            error.message.includes("duplicate") ||
            error.message.includes("appointments_idempotency_key_uidx")
          ) {
            // Race: another request with the same idempotency key or slot won.
            if (idempotency_key) {
              const { data: existing } = await supabaseAdmin
                .from("appointments")
                .select("*, doctors(name, specialty), patients(name, phone)")
                .eq("idempotency_key", idempotency_key)
                .maybeSingle();
              if (existing) {
                return jsonResponse({ ok: true, idempotent_replay: true, appointment: existing });
              }
            }
            return jsonResponse(
              { error: "slot_taken", message: "That slot was just taken." },
              409,
            );
          }
          return jsonResponse({ error: error.message }, 500);
        }
        return jsonResponse({ ok: true, appointment: inserted });
      },
    },
  },
});
