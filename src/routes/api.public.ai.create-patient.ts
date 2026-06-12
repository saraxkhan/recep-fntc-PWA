import { createFileRoute } from "@tanstack/react-router";

// AI tool: create or upsert a patient by phone (E.164 normalized).
export const Route = createFileRoute("/api/public/ai/create-patient")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { optionsResponse } = await import("@/lib/ai-tools.server");
        return optionsResponse();
      },
      POST: async ({ request }) => {
        const { jsonResponse, parseArgs, requireAiAuth, supabaseAdmin, normalizePhoneE164 } =
          await import("@/lib/ai-tools.server");

        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;

        const args = await parseArgs(request);
        const name = String(args.name ?? "").trim();
        const phoneRaw = String(args.phone ?? "").trim();
        if (!name || !phoneRaw) {
          return jsonResponse({ error: "name and phone are required" }, 400);
        }
        let phone: string;
        try {
          phone = normalizePhoneE164(phoneRaw);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_phone", message: e.message }, 400);
        }

        const { data: existing } = await supabaseAdmin
          .from("patients")
          .select("*")
          .eq("phone", phone)
          .maybeSingle();
        if (existing) return jsonResponse({ patient: existing, existed: true });

        const { data, error } = await supabaseAdmin
          .from("patients")
          .insert({ name, phone })
          .select()
          .single();
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ patient: data, existed: false });
      },
    },
  },
});
