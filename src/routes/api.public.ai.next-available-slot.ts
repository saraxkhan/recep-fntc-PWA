import { createFileRoute } from "@tanstack/react-router";

// AI tool: find the next available slot for a doctor (or for any active doctor
// in a specialty). Scans forward up to `max_days` (default 14) starting from
// the requested date (defaults to today in Asia/Kolkata).
//
// Body: { doctor_id?, specialty?, from_date?, max_days? }
// Exactly one of doctor_id or specialty is required.
export const Route = createFileRoute("/api/public/ai/next-available-slot")({
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
          generateSlots,
          dayNameFromDate,
          resolveDate,
          addDaysToDateString,
          kolkataDateString,
          kolkataTimeString,
          loadDoctor,
          matchSpecialty,
        } = await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const doctor_id = String(args.doctor_id ?? "").trim();
        const specialtyRaw = String(args.specialty ?? "").trim();
        const max_days = Math.min(Math.max(Number(args.max_days ?? 14) || 14, 1), 60);

        let from_date: string;
        try {
          from_date = resolveDate(args.from_date);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_date", message: e.message }, 400);
        }

        // Resolve candidate doctors
        let doctors: Array<{
          id: string; name: string; specialty: string;
          working_days: string[]; start_time: string; end_time: string; active: boolean;
        }> = [];
        if (doctor_id) {
          const d = await loadDoctor(doctor_id);
          if (!d) return jsonResponse({ error: "doctor_not_found" }, 404);
          doctors = [d];
        } else if (specialtyRaw) {
          const specialty = matchSpecialty(specialtyRaw);
          if (!specialty) {
            return jsonResponse(
              { error: "specialty_not_found", message: `No specialty matches "${specialtyRaw}".` },
              404,
            );
          }
          const { data } = await supabaseAdmin
            .from("doctors")
            .select("*")
            .ilike("specialty", specialty)
            .eq("active", true);
          doctors = (data as any[]) ?? [];
        } else {
          return jsonResponse(
            { error: "doctor_id_or_specialty_required" },
            400,
          );
        }
        if (doctors.length === 0) {
          return jsonResponse({ error: "no_doctors_available" }, 404);
        }

        const todayKolkata = kolkataDateString();
        const nowHM = kolkataTimeString();

        // Find the soonest (date, time) across all candidate doctors.
        let best: { doctor: typeof doctors[number]; date: string; time: string } | null = null;

        for (const doctor of doctors) {
          for (let i = 0; i < max_days; i++) {
            const date = addDaysToDateString(from_date, i);
            if (date < todayKolkata) continue;
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
            if (date === todayKolkata) slots = slots.filter((s) => s > nowHM);
            if (slots.length === 0) continue;

            const candidate = { doctor, date, time: slots[0] };
            if (
              !best ||
              candidate.date < best.date ||
              (candidate.date === best.date && candidate.time < best.time)
            ) {
              best = candidate;
            }
            // Only need each doctor's earliest slot; move to next doctor.
            break;
          }
        }

        if (!best) {
          return jsonResponse({
            error: "no_slot_found",
            message: `No available slot in the next ${max_days} days.`,
            searched_from: from_date,
          });
        }

        return jsonResponse({
          doctor_id: best.doctor.id,
          doctor: best.doctor.name,
          specialty: best.doctor.specialty,
          appointment_date: best.date,
          appointment_time: best.time,
          timezone: "Asia/Kolkata",
        });
      },
    },
  },
});
