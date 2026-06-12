// Server functions for admin + booking flows. All execute on the server with
// the service-role client; the public anon key cannot reach patients/appointments
// directly (RLS denies it).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./admin-auth";

export const createPatient = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(4).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("patients").select("*").eq("phone", data.phone).maybeSingle();
    if (existing) return { patient: existing, existed: true };
    const { data: created, error } = await supabaseAdmin
      .from("patients").insert({ name: data.name, phone: data.phone }).select().single();
    if (error) throw new Error(error.message);
    return { patient: created, existed: false };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*, patients(name,phone), doctors(name,specialty)")
    .order("appointment_date", { ascending: false })
    .order("appointment_time", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["cancelled", "completed", "scheduled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAuditLog } = await import("./admin-auth.server");
    await writeAuditLog({
      actorId: context.adminId,
      actorEmail: context.adminEmail,
      action: "appointment.update_status",
      resourceType: "appointment",
      resourceId: data.id,
      details: { status: data.status },
    });
    return { ok: true };
  });

export const listPatients = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("*, appointments(id)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listDoctors = createServerFn({ method: "GET" }).handler(async () => {
  // Public read: doctor directory is shown to patients booking online.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("doctors")
    .select("*")
    .order("specialty");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const toggleDoctorActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("doctors")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAuditLog } = await import("./admin-auth.server");
    await writeAuditLog({
      actorId: context.adminId,
      actorEmail: context.adminEmail,
      action: "doctor.toggle_active",
      resourceType: "doctor",
      resourceId: data.id,
      details: { active: data.active },
    });
    return { ok: true };
  });

export const updateDoctorSchedule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      working_days: z.array(z.string().min(1).max(8)).max(7),
      start_time: z.string().regex(/^\d{2}:\d{2}$/),
      end_time: z.string().regex(/^\d{2}:\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("doctors")
      .update({
        working_days: data.working_days,
        start_time: data.start_time,
        end_time: data.end_time,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { writeAuditLog } = await import("./admin-auth.server");
    await writeAuditLog({
      actorId: context.adminId,
      actorEmail: context.adminEmail,
      action: "doctor.update_schedule",
      resourceType: "doctor",
      resourceId: data.id,
      details: { working_days: data.working_days, start_time: data.start_time, end_time: data.end_time },
    });
    return { ok: true };
  });

export const getBookedTimes = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({
      doctor_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("appointments")
      .select("appointment_time")
      .eq("doctor_id", data.doctor_id)
      .eq("appointment_date", data.date)
      .eq("status", "scheduled");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((a: any) => a.appointment_time.slice(0, 5));
  });

export const bookAppointment = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(4).max(20),
      doctor_id: z.string().uuid(),
      appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("patients")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    let patientId = existing?.id;
    if (!patientId) {
      const { data: created, error } = await supabaseAdmin
        .from("patients")
        .insert({ name: data.name, phone: data.phone })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      patientId = created.id;
    }
    // Pre-check: is this slot already taken by a scheduled appointment?
    // The authoritative protection is the partial unique index
    // (doctor_id, appointment_date, appointment_time) WHERE status='scheduled',
    // but this returns a friendly error before we try to insert.
    const { data: clash } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("doctor_id", data.doctor_id)
      .eq("appointment_date", data.appointment_date)
      .eq("appointment_time", data.appointment_time)
      .eq("status", "scheduled")
      .maybeSingle();
    if (clash) {
      throw new Error("That slot was just taken. Pick another.");
    }

    const { error: apptErr } = await supabaseAdmin.from("appointments").insert({
      patient_id: patientId,
      doctor_id: data.doctor_id,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      status: "scheduled",
      sms_sent: true,
    });
    if (apptErr) {
      // 23505 = unique_violation — race with another concurrent booking
      if ((apptErr as any).code === "23505" || apptErr.message.includes("duplicate")) {
        throw new Error("That slot was just taken. Pick another.");
      }
      throw new Error(apptErr.message);
    }
    return { ok: true };
  });
