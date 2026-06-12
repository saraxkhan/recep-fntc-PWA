import { createFileRoute } from "@tanstack/react-router";

// AI tool: list available time slots for a doctor on a date.
// Date accepts "today" / "tomorrow" / ISO; resolved in Asia/Kolkata.
export const Route = createFileRoute("/api/public/ai/check-availability")({
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
          kolkataDateString,
          kolkataTimeString,
          loadDoctor,
        } = await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const doctor_id = String(args.doctor_id ?? "").trim();
        if (!doctor_id) return jsonResponse({ error: "doctor_id is required" }, 400);

        let date: string;
        try {
          date = resolveDate(args.date);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_date", message: e.message }, 400);
        }

        const doctor = await loadDoctor(doctor_id);
        if (!doctor) return jsonResponse({ error: "doctor_not_found" }, 404);

        const day = dayNameFromDate(date);
        if (!doctor.working_days.includes(day)) {
          return jsonResponse({
            doctor: doctor.name,
            date,
            available_slots: [],
            reason: `${doctor.name} does not work on ${day}.`,
          });
        }

        const { data: booked } = await supabaseAdmin
          .from("appointments")
          .select("appointment_time")
          .eq("doctor_id", doctor_id)
          .eq("appointment_date", date)
          .eq("status", "scheduled");

        const taken = new Set(
          (booked ?? []).map((a: any) => a.appointment_time.slice(0, 5)),
        );
        let slots = generateSlots(
          doctor.start_time.slice(0, 5),
          doctor.end_time.slice(0, 5),
        ).filter((s) => !taken.has(s));

        // Hide slots that have already passed today (Kolkata time).
        if (date === kolkataDateString()) {
          const nowHM = kolkataTimeString();
          slots = slots.filter((s) => s > nowHM);
        }

        return jsonResponse({
          doctor: doctor.name,
          doctor_id,
          date,
          timezone: "Asia/Kolkata",
          available_slots: slots,
        });
      },
    },
  },
});
