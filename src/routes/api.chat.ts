import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createGeminiProvider } from "@/lib/ai-gateway.server";
import {
  receptionistTools,
  RECEPTIONIST_SYSTEM_PROMPT,
} from "@/lib/ai-receptionist-tools.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          messages?: UIMessage[];
          sessionId?: string;
        };

        const messages = body.messages;
        const sessionId = body.sessionId;

        if (!Array.isArray(messages)) {
          return new Response("messages required", { status: 400 });
        }

        const key = process.env.GEMINI_API_KEY;

        if (!key) {
          return new Response("Missing GEMINI_API_KEY", {
            status: 500,
          });
        }

        // Best-effort logging — never block the chat if logging fails.
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        if (sessionId) {
          try {
            await supabaseAdmin.from("call_logs").upsert(
              {
                session_id: sessionId,
                channel: "chat",
                status: "active",
                last_activity_at: new Date().toISOString(),
              },
              { onConflict: "session_id" }
            );

            const lastUser = [...messages]
              .reverse()
              .find((m: any) => m.role === "user");

            if (lastUser) {
              const text = (lastUser.parts ?? [])
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("");

              if (text) {
                await supabaseAdmin.from("ai_conversation_logs").insert({
                  session_id: sessionId,
                  role: "user",
                  content: text,
                });
              }
            }
          } catch (e) {
            console.error("[chat log] user log error", e);
          }
        }

        const gateway = createGeminiProvider(key);

        const result = streamText({
          model: gateway("gemini-2.5-flash"),
          system: RECEPTIONIST_SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          tools: receptionistTools,
          stopWhen: stepCountIs(50),

          onError: ({ error }) => {
            console.error("[receptionist chat] stream error:", error);
          },

          onFinish: async ({ text, toolCalls, toolResults }) => {
            if (!sessionId) return;

            try {
              let appointmentId: string | null = null;
              let bookingSucceeded = false;

              const calls = toolCalls ?? [];
              const results = toolResults ?? [];

              const resultByCallId = new Map<string, any>();

              for (const r of results as any[]) {
                resultByCallId.set(r.toolCallId, r);
              }

              for (const call of calls as any[]) {
                const res: any = resultByCallId.get(call.toolCallId);
                const output = res?.output ?? res?.result;

                if (
                  call.toolName === "book_appointment" &&
                  output?.ok &&
                  output?.appointment?.id
                ) {
                  appointmentId = output.appointment.id;
                  bookingSucceeded = true;
                }

                await supabaseAdmin.from("ai_conversation_logs").insert({
                  session_id: sessionId,
                  role: "tool",
                  tool_name: call.toolName,
                  tool_input: call.input ?? call.args ?? null,
                  tool_output: output ?? null,
                  appointment_id:
                    call.toolName === "book_appointment" &&
                    output?.appointment?.id
                      ? output.appointment.id
                      : null,
                });
              }

              if (text && text.trim()) {
                await supabaseAdmin.from("ai_conversation_logs").insert({
                  session_id: sessionId,
                  role: "assistant",
                  content: text,
                });
              }

              const patch: any = {
                last_activity_at: new Date().toISOString(),
              };

              if (appointmentId) {
                patch.appointment_id = appointmentId;
                patch.booking_succeeded = bookingSucceeded;
              }

              await supabaseAdmin
                .from("call_logs")
                .update(patch)
                .eq("session_id", sessionId);
            } catch (e) {
              console.error("[chat log] finish log error", e);
            }
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
        });
      },
    },
  },
});