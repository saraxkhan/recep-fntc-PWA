import { createFileRoute } from "@tanstack/react-router";

// AI tool: find doctors by specialty (fuzzy match).
// Returns matching active doctors with their working schedules.
export const Route = createFileRoute("/api/public/ai/find-doctor")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { optionsResponse } = await import("@/lib/ai-tools.server");
        return optionsResponse();
      },
      POST: async ({ request }) => {
        const { jsonResponse, parseArgs, requireAiAuth, supabaseAdmin, matchSpecialty, SPECIALTIES } =
          await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const specialtyRaw = String(args.specialty ?? "").trim();
        if (!specialtyRaw) {
          return jsonResponse(
            { error: "specialty_required", supported_specialties: SPECIALTIES },
            400,
          );
        }
        const specialty = matchSpecialty(specialtyRaw);
        if (!specialty) {
          return jsonResponse(
            {
              error: "specialty_not_found",
              message: `No specialty matches "${specialtyRaw}".`,
              supported_specialties: SPECIALTIES,
            },
            404,
          );
        }

        const { data, error } = await supabaseAdmin
          .from("doctors")
          .select("id, name, specialty, working_days, start_time, end_time")
          .ilike("specialty", specialty)
          .eq("active", true)
          .order("name");
        if (error) return jsonResponse({ error: error.message }, 500);

        return jsonResponse({ specialty, doctors: data ?? [] });
      },
    },
  },
});
