import { createFileRoute } from "@tanstack/react-router";
// AI tool: look up a patient's existing appointments by phone number.
// Used by Vapi (voice) when the caller wants to check or cancel a booking.
// Returns the same shape as the AI SDK `lookup_appointments` tool so that
// the Vapi assistant and the chat assistant behave identically.
export const Route = createFileRoute("/api/public/ai/lookup-appointments")({
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
          normalizePhoneE164,
        } = await import("@/lib/ai-tools.server");
        // Verify x-ai-secret header (same auth as every other AI tool endpoint).
        const unauthorized = requireAiAuth(request);
        if (unauthorized) return unauthorized;
        const args = await parseArgs(request);
        const phoneRaw = String(args.phone ?? "").trim();
        if (!phoneRaw) {
          return jsonResponse({ error: "phone is required" }, 400);
        }
        // Normalize to E.164 (defaults to +91 for bare 10-digit Indian numbers).
        let phone: string;
        try {
          phone = normalizePhoneE164(phoneRaw);
        } catch (e: any) {
          return jsonResponse({ error: "invalid_phone", message: e.message }, 400);
        }
        // Look up the patient record by their E.164 phone number.
        const { data: patient, error: patientErr } = await supabaseAdmin
          .from("patients")
          .select("id, name, phone")
          .eq("phone", phone)
          .maybeSingle();
        if (patientErr) {
          return jsonResponse({ error: patientErr.message }, 500);
        }
        if (!patient) {
          return jsonResponse({ error: "patient_not_found", phone }, 404);
        }
        // Fetch up to 20 most-recent appointments for this patient,
        // joining doctor name and specialty for the voice agent to read back.
        const { data: appointments, error: apptErr } = await supabaseAdmin
          .from("appointments")
          .select(
            "id, appointment_date, appointment_time, status, doctors(name, specialty)",
          )
          .eq("patient_id", (patient as any).id)
          .order("appointment_date", { ascending: false })
          .order("appointment_time", { ascending: false })
          .limit(20);
        if (apptErr) {
          return jsonResponse({ error: apptErr.message }, 500);
        }
        // Return the same JSON shape as the AI SDK lookup_appointments.execute()
        // so the system prompt and tool instructions need no changes.
        return jsonResponse({ patient, appointments: appointments ?? [] });
      },
    },
  },
});
