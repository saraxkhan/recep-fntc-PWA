import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCallLogs, getCallTranscript } from "@/lib/analytics.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Wrench, User, Bot, CheckCircle2, X } from "lucide-react";

export const Route = createFileRoute("/admin/conversations")({
  component: ConversationsPage,
});

function ConversationsPage() {
  const fetchAll = useServerFn(listCallLogs);
  const fetchTranscript = useServerFn(getCallTranscript);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["call-logs"],
    queryFn: () => fetchAll(),
  });

  const { data: transcript, isLoading: tLoading } = useQuery({
    queryKey: ["call-transcript", selected],
    queryFn: () => fetchTranscript({ data: { session_id: selected! } }),
    enabled: !!selected,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sessions ({sessions?.length ?? 0})
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && sessions?.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No AI conversations yet.
            </div>
          )}
          {sessions?.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.session_id)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-muted/40 ${selected === s.session_id ? "bg-muted/60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-mono truncate text-muted-foreground">
                  {s.session_id.slice(0, 8)}…
                </div>
                {s.booking_succeeded ? (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <CheckCircle2 className="w-3 h-3" /> Booked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {s.channel}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(s.last_activity_at).toLocaleString()}
              </div>
              {s.appointments && (
                <div className="text-xs mt-1">
                  {s.appointments.doctors?.name} ·{" "}
                  {s.appointments.patients?.name}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card min-h-[70vh] flex flex-col">
        {!selected && (
          <div className="m-auto text-sm text-muted-foreground text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Select a session to view the transcript.
          </div>
        )}
        {selected && tLoading && (
          <div className="m-auto text-sm text-muted-foreground">Loading…</div>
        )}
        {selected && transcript && (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">Session {selected.slice(0, 8)}…</div>
                <div className="text-xs text-muted-foreground">
                  {transcript.session?.message_count ?? transcript.messages.length} events ·{" "}
                  {transcript.session?.channel ?? "chat"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {transcript.messages.map((m: any) => (
                <LogEntry key={m.id} entry={m} />
              ))}
              {transcript.messages.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No messages recorded.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: any }) {
  if (entry.role === "user") {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-muted grid place-items-center shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex-1">
          {entry.content}
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(entry.created_at).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  }
  if (entry.role === "assistant") {
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-sm flex-1 whitespace-pre-wrap">
          {entry.content}
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(entry.created_at).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  }
  // tool
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">
        <Wrench className="w-3.5 h-3.5" />
      </div>
      <div className="rounded-lg border bg-card px-3 py-2 text-xs flex-1 space-y-2">
        <div className="font-mono font-semibold">{entry.tool_name}</div>
        {entry.tool_input && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Input</div>
            <pre className="whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(entry.tool_input, null, 2)}
            </pre>
          </div>
        )}
        {entry.tool_output && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Output</div>
            <pre className="whitespace-pre-wrap break-all text-[11px]">
              {JSON.stringify(entry.tool_output, null, 2)}
            </pre>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          {new Date(entry.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}