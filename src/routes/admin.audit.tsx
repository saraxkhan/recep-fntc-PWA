import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs } from "@/lib/admin-auth";
import { FileClock } from "lucide-react";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const fetchAll = useServerFn(listAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => fetchAll(),
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3">When</th>
            <th className="text-left px-4 py-3">Actor</th>
            <th className="text-left px-4 py-3">Action</th>
            <th className="text-left px-4 py-3">Resource</th>
            <th className="text-left px-4 py-3">Details</th>
            <th className="text-left px-4 py-3">IP</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
          )}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <tr><td colSpan={6} className="text-center py-16 text-muted-foreground">
              <FileClock className="w-8 h-8 mx-auto mb-2 opacity-40" />No admin actions yet.
            </td></tr>
          )}
          {data?.map((l: any) => (
            <tr key={l.id} className="border-t hover:bg-muted/30 align-top">
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
              <td className="px-4 py-3">{l.actor_email ?? l.actor_id?.slice(0, 8)}</td>
              <td className="px-4 py-3 font-medium">{l.action}</td>
              <td className="px-4 py-3 text-muted-foreground">{l.resource_type ?? "—"} {l.resource_id ? <span className="text-xs">({l.resource_id.slice(0, 8)})</span> : null}</td>
              <td className="px-4 py-3"><pre className="text-xs bg-muted/40 rounded px-2 py-1 max-w-md overflow-x-auto">{JSON.stringify(l.details ?? {}, null, 0)}</pre></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{l.ip_address ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}