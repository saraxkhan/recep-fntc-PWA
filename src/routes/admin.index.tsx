import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAppointments, updateAppointmentStatus } from "@/lib/hospital.functions";
import { formatTime12h } from "@/lib/slots";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, X, CheckCircle2 } from "lucide-react";
import { BookAppointmentDialog } from "@/components/admin/BookAppointmentDialog";

export const Route = createFileRoute("/admin/")({
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listAppointments);
  const updateStatus = useServerFn(updateAppointmentStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["appointments-all"],
    queryFn: () => fetchAll(),
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "cancelled" | "completed" }) => {
      await updateStatus({ data: { id, status } });
    },
    onSuccess: (_, v) => {
      toast.success(`Appointment ${v.status}`);
      qc.invalidateQueries({ queryKey: ["appointments-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = {
    total: data?.length ?? 0,
    scheduled: data?.filter((a: any) => a.status === "scheduled").length ?? 0,
    today: data?.filter((a: any) => a.appointment_date === new Date().toISOString().slice(0, 10)).length ?? 0,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <StatCard label="Total appointments" value={stats.total} />
          <StatCard label="Scheduled" value={stats.scheduled} accent />
          <StatCard label="Today" value={stats.today} />
        </div>
      </div>
      <div className="flex justify-end mb-4"><BookAppointmentDialog /></div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Date & Time</th>
              <th className="text-left px-4 py-3">Patient</th>
              <th className="text-left px-4 py-3">Doctor</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">SMS</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && data?.length === 0 && (
              <tr><td colSpan={6} className="text-center py-16 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No appointments yet. Try booking one from the public page.
              </td></tr>
            )}
            {data?.map((a: any) => (
              <tr key={a.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{a.appointment_date}</div>
                  <div className="text-xs text-muted-foreground">{formatTime12h(a.appointment_time)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.patients?.name}</div>
                  <div className="text-xs text-muted-foreground">{a.patients?.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{a.doctors?.name}</div>
                  <div className="text-xs text-muted-foreground">{a.doctors?.specialty}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3">{a.sms_sent ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Sent</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-right">
                  {a.status === "scheduled" && (
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, status: "completed" })}>Complete</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => update.mutate({ id: a.id, status: "cancelled" })}><X className="w-4 h-4" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>
      <div className={`text-xs uppercase tracking-wide ${accent ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-primary/10 text-primary",
    completed: "bg-success/15 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}
