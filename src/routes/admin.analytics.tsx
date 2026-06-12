import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/analytics.functions";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const fetchAnalytics = useServerFn(getAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => fetchAnalytics(),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading analytics…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total appointments" value={data.totals.total} />
        <Stat label="Scheduled" value={data.totals.scheduled} accent />
        <Stat label="Cancellation rate" value={`${Math.round(data.cancellationRate * 100)}%`} />
        <Stat
          label="AI booking success"
          value={`${Math.round(data.ai.successRate * 100)}%`}
          sub={`${data.ai.bookings}/${data.ai.sessions} sessions`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Daily bookings (last 14 days)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Appointments by specialty">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bySpecialty} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="specialty" width={120} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Most requested doctors">
        {data.topDoctors.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No bookings yet.</div>
        ) : (
          <ul className="divide-y">
            {data.topDoctors.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-medium text-sm">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.specialty}</div>
                </div>
                <div className="text-sm font-semibold">{d.count}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${accent ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
    >
      <div className={`text-xs uppercase tracking-wide ${accent ? "opacity-80" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${accent ? "opacity-80" : "text-muted-foreground"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}