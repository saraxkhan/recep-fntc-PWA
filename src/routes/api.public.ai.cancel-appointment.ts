import { createFileRoute } from "@tanstack/react-router";

// AI tool: cancel an appointment by id.
export const Route = createFileRoute("/api/public/ai/cancel-appointment")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { optionsResponse } = await import("@/lib/ai-tools.server");
        return optionsResponse();
      },
      POST: async ({ request }) => {
        const { jsonResponse, parseArgs, requireAiAuth, supabaseAdmin } =
          await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const appointment_id = String(args.appointment_id ?? "").trim();
        if (!appointment_id) return jsonResponse({ error: "appointment_id required" }, 400);

        const { error } = await supabaseAdmin
          .from("appointments")
          .update({ status: "cancelled" })
          .eq("id", appointment_id);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true });
      },
    },
  },
});
