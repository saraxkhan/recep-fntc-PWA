// Admin server functions for AI conversation inspection + analytics.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin-auth";

export const listCallLogs = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("call_logs")
    .select("*, appointments(id, appointment_date, appointment_time, doctors(name, specialty), patients(name, phone))")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getCallTranscript = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ session_id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: session }, { data: messages }] = await Promise.all([
      (supabaseAdmin as any)
        .from("call_logs")
        .select("*, appointments(id, appointment_date, appointment_time, status, doctors(name, specialty), patients(name, phone))")
        .eq("session_id", data.session_id)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("ai_conversation_logs")
        .select("*")
        .eq("session_id", data.session_id)
        .order("created_at", { ascending: true }),
    ]);
    return { session, messages: messages ?? [] };
  });

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: appts }, { data: calls }] = await Promise.all([
    supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, created_at, doctor_id, doctors(name, specialty)"),
    (supabaseAdmin as any)
      .from("call_logs")
      .select("id, booking_succeeded, appointment_id, started_at"),
  ]);

  const appointments = (appts ?? []) as any[];
  const callLogs = (calls ?? []) as any[];

  const total = appointments.length;
  const cancelled = appointments.filter((a) => a.status === "cancelled").length;
  const completed = appointments.filter((a) => a.status === "completed").length;
  const scheduled = appointments.filter((a) => a.status === "scheduled").length;
  const cancellationRate = total ? cancelled / total : 0;

  const specialtyMap = new Map<string, number>();
  const doctorMap = new Map<string, { name: string; specialty: string; count: number }>();
  const dailyMap = new Map<string, number>();
  for (const a of appointments) {
    const spec = a.doctors?.specialty ?? "Unknown";
    specialtyMap.set(spec, (specialtyMap.get(spec) ?? 0) + 1);
    const dKey = a.doctor_id;
    const prev = doctorMap.get(dKey);
    if (prev) prev.count++;
    else
      doctorMap.set(dKey, {
        name: a.doctors?.name ?? "—",
        specialty: spec,
        count: 1,
      });
    const day = (a.created_at as string).slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }

  // last 14 days inclusive of today
  const today = new Date();
  const daily: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key.slice(5), count: dailyMap.get(key) ?? 0 });
  }

  const bySpecialty = [...specialtyMap.entries()]
    .map(([specialty, count]) => ({ specialty, count }))
    .sort((a, b) => b.count - a.count);

  const topDoctors = [...doctorMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const aiSessions = callLogs.length;
  const aiBookings = callLogs.filter((c) => c.booking_succeeded).length;
  const aiSuccessRate = aiSessions ? aiBookings / aiSessions : 0;

  return {
    totals: { total, scheduled, completed, cancelled },
    cancellationRate,
    bySpecialty,
    topDoctors,
    daily,
    ai: { sessions: aiSessions, bookings: aiBookings, successRate: aiSuccessRate },
  };
});