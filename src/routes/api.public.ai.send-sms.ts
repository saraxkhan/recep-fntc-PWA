import { createFileRoute } from "@tanstack/react-router";

// AI tool: send a confirmation SMS via Twilio (or simulate it for the demo).
// Phone is normalized to E.164 before sending.
export const Route = createFileRoute("/api/public/ai/send-sms")({
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
        const appointment_id = String(args.appointment_id ?? "").trim();
        const phoneRaw = String(args.phone ?? "").trim();
        const message = String(args.message ?? "Your appointment is confirmed.");
        if (!phoneRaw) return jsonResponse({ error: "phone required" }, 400);

        let to: string;
        try {
          to = normalizePhoneE164(phoneRaw);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_phone", message: e.message }, 400);
        }

        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM_NUMBER;

        let providerResult: any = { simulated: true };
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
            },
          );
          providerResult = await resp.json();
          if (!resp.ok) return jsonResponse({ error: "twilio_failed", details: providerResult }, 502);
        } else {
          console.log(`[SMS simulated] to=${to} :: ${message}`);
        }

        if (appointment_id) {
          await supabaseAdmin
            .from("appointments")
            .update({ sms_sent: true })
            .eq("id", appointment_id);
        }
        return jsonResponse({ ok: true, provider: providerResult });
      },
    },
  },
});
