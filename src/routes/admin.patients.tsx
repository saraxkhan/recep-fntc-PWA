import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPatients } from "@/lib/hospital.functions";
import { Users } from "lucide-react";
import { NewPatientDialog } from "@/components/admin/NewPatientDialog";

export const Route = createFileRoute("/admin/patients")({
  component: PatientsPage,
});

function PatientsPage() {
  const fetchAll = useServerFn(listPatients);
  const { data, isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => fetchAll(),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><NewPatientDialog /></div>
      <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Phone</th>
            <th className="text-left px-4 py-3">Appointments</th>
            <th className="text-left px-4 py-3">Joined</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Loading…</td></tr>}
          {!isLoading && data?.length === 0 && (
            <tr><td colSpan={4} className="text-center py-16 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No patients yet.
            </td></tr>
          )}
          {data?.map((p: any) => (
            <tr key={p.id} className="border-t hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{p.phone}</td>
              <td className="px-4 py-3">{p.appointments?.length ?? 0}</td>
              <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
