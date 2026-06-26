import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listVoiceCalls,
  resolveHumanHandoff,
  sendFollowupSms,
} from "@/lib/analytics.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  PhoneMissed,
  PhoneCall,
  Clock,
  CalendarCheck,
  UserCheck,
  AlertTriangle,
  MessageSquareWarning,
  Play,
  ChevronRight,
  Loader2,
} from "lucide-react";
export const Route = createFileRoute("/admin/voice-calls")({
  component: VoiceCallsPage,
});
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function CallStatusBadge({ call }: { call: any }) {
  if (call.needs_human_followup && !call.human_followup_resolved) {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <AlertTriangle className="w-3 h-3" /> Human needed
      </Badge>
    );
  }
  if (call.needs_human_followup && call.human_followup_resolved) {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
        <UserCheck className="w-3 h-3" /> Resolved
      </Badge>
    );
  }
  if (call.interrupted && !call.followup_sms_sent) {
    return (
      <Badge className="gap-1 text-xs bg-amber-500/15 text-amber-600 border-amber-300 hover:bg-amber-500/20">
        <MessageSquareWarning className="w-3 h-3" /> Interrupted
      </Badge>
    );
  }
  if (call.interrupted && call.followup_sms_sent) {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
        <MessageSquareWarning className="w-3 h-3" /> SMS sent
      </Badge>
    );
  }
  if (call.booking_succeeded) {
    return (
      <Badge className="gap-1 text-xs bg-emerald-500/15 text-emerald-700 border-emerald-300 hover:bg-emerald-500/20">
        <CalendarCheck className="w-3 h-3" /> Booked
      </Badge>
    );
  }
  if (call.status === "ended") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
        <PhoneOff className="w-3 h-3" /> Ended
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <PhoneCall className="w-3 h-3" /> Active
    </Badge>
  );
}
// ── Page ──────────────────────────────────────────────────────────────────────
function VoiceCallsPage() {
  const fetchAll       = useServerFn(listVoiceCalls);
  const resolveHandoff = useServerFn(resolveHumanHandoff);
  const sendSms        = useServerFn(sendFollowupSms);
  const qc = useQueryClient();
  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["voice-calls"],
    queryFn: () => fetchAll(),
    refetchInterval: 30_000, // poll every 30 s to catch newly-ended calls
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (calls as any[]).find((c) => c.session_id === selectedId) ?? null;
  const resolveMutation = useMutation({
    mutationFn: (session_id: string) =>
      resolveHandoff({ data: { session_id } }),
    onSuccess: () => {
      toast.success("Marked as resolved");
      qc.invalidateQueries({ queryKey: ["voice-calls"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to resolve"),
  });
  const smsMutation = useMutation({
    mutationFn: (session_id: string) => sendSms({ data: { session_id } }),
    onSuccess: (res: any) => {
      if (res?.alreadySent) toast.info("Recovery SMS was already sent");
      else toast.success("Recovery SMS sent");
      qc.invalidateQueries({ queryKey: ["voice-calls"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send SMS"),
  });
  // Summary stats
  const total             = (calls as any[]).length;
  const booked            = (calls as any[]).filter((c) => c.booking_succeeded).length;
  const humanPending      = (calls as any[]).filter((c) => c.needs_human_followup && !c.human_followup_resolved).length;
  const interruptedPending = (calls as any[]).filter((c) => c.interrupted && !c.followup_sms_sent).length;
  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total calls",      value: total,              icon: Phone,                alert: false },
          { label: "Bookings made",    value: booked,             icon: CalendarCheck,        alert: false },
          { label: "Human needed",     value: humanPending,       icon: AlertTriangle,        alert: humanPending > 0 },
          { label: "Recovery SMS due", value: interruptedPending, icon: MessageSquareWarning, alert: interruptedPending > 0 },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border bg-card p-4 flex flex-col gap-1 ${
              s.alert ? "border-destructive/40 bg-destructive/5" : ""
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className={`w-3.5 h-3.5 ${s.alert ? "text-destructive" : ""}`} />
              {s.label}
            </div>
            <div className={`text-2xl font-semibold tabular-nums ${s.alert ? "text-destructive" : ""}`}>
              {isLoading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>
      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* Left: call list */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Voice Calls
          </div>
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && (calls as any[]).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Phone className="w-8 h-8 opacity-25" />
              <p className="text-sm">No voice calls yet.</p>
              <p className="text-xs opacity-60">Calls appear here after Vapi is connected.</p>
            </div>
          )}
          <ul className="divide-y max-h-[72vh] overflow-y-auto">
            {(calls as any[]).map((c) => (
              <li key={c.session_id}>
                <button
                  id={`call-${c.session_id}`}
                  onClick={() => setSelectedId(c.session_id === selectedId ? null : c.session_id)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3 ${
                    selectedId === c.session_id ? "bg-muted/60" : ""
                  }`}
                >
                  {/* Icon dot */}
                  <div className={`mt-0.5 rounded-full p-1.5 shrink-0 ${
                    c.booking_succeeded
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : c.needs_human_followup && !c.human_followup_resolved
                      ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                      : c.interrupted && !c.followup_sms_sent
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {c.booking_succeeded
                      ? <CalendarCheck className="w-3.5 h-3.5" />
                      : c.interrupted
                      ? <PhoneMissed className="w-3.5 h-3.5" />
                      : <Phone className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {c.caller_phone ?? "Unknown caller"}
                      </span>
                      <CallStatusBadge call={c} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{formatTime(c.started_at)}</span>
                      {c.duration_seconds !== null && (
                        <><span>·</span><span>{formatDuration(c.duration_seconds)}</span></>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
                    selectedId === c.session_id ? "rotate-90" : ""
                  }`} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* Right: detail panel */}
        {selected ? (
          <CallDetailPanel
            call={selected}
            onResolve={() => resolveMutation.mutate(selected.session_id)}
            onSendSms={() => smsMutation.mutate(selected.session_id)}
            isResolving={resolveMutation.isPending}
            isSendingSms={smsMutation.isPending}
          />
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-center rounded-xl border bg-card py-24 text-muted-foreground gap-3">
            <Phone className="w-10 h-10 opacity-20" />
            <p className="text-sm">Select a call to view its details</p>
          </div>
        )}
      </div>
    </div>
  );
}
// ── Detail panel ──────────────────────────────────────────────────────────────
function CallDetailPanel({
  call,
  onResolve,
  onSendSms,
  isResolving,
  isSendingSms,
}: {
  call: any;
  onResolve: () => void;
  onSendSms: () => void;
  isResolving: boolean;
  isSendingSms: boolean;
}) {
  const appt = call.appointments ?? null;
  return (
    <div className="rounded-xl border bg-card overflow-hidden divide-y">
      {/* Header */}
      <div className="px-5 py-4 bg-muted/20 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-base">{call.caller_phone ?? "Unknown caller"}</h2>
            <CallStatusBadge call={call} />
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{formatTime(call.started_at)}
            </span>
            {call.duration_seconds !== null && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />{formatDuration(call.duration_seconds)}
              </span>
            )}
            {call.vapi_call_id && (
              <span className="font-mono text-[10px] opacity-40 truncate max-w-[180px]">
                {call.vapi_call_id}
              </span>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap items-center">
          {call.needs_human_followup && !call.human_followup_resolved && (
            <Button
              id={`resolve-${call.session_id}`}
              size="sm"
              variant="outline"
              onClick={onResolve}
              disabled={isResolving}
              className="gap-1.5"
            >
              {isResolving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <UserCheck className="w-3.5 h-3.5" />}
              Mark resolved
            </Button>
          )}
          {call.interrupted && !call.followup_sms_sent && call.caller_phone && (
            <Button
              id={`sms-${call.session_id}`}
              size="sm"
              onClick={onSendSms}
              disabled={isSendingSms}
              className="gap-1.5"
            >
              {isSendingSms
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <MessageSquareWarning className="w-3.5 h-3.5" />}
              Send recovery SMS
            </Button>
          )}
          {call.interrupted && call.followup_sms_sent && (
            <span className="text-xs text-muted-foreground">Recovery SMS sent ✓</span>
          )}
        </div>
      </div>
      {/* Recording player — only shown when Vapi recording is enabled */}
      {call.recording_url && (
        <div className="px-5 py-3 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <Play className="w-3 h-3" /> Recording
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={call.recording_url} className="w-full h-8" />
        </div>
      )}
      {/* Booked appointment summary */}
      {appt && (
        <div className="px-5 py-4 bg-emerald-50/60 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1">
            <CalendarCheck className="w-3.5 h-3.5" /> Appointment Booked
          </p>
          <div className="text-sm space-y-0.5">
            <p>
              <span className="font-medium">{appt.doctors?.name ?? "—"}</span>{" "}
              <span className="text-muted-foreground text-xs">({appt.doctors?.specialty ?? "—"})</span>
            </p>
            <p className="text-muted-foreground">
              {appt.appointment_date} at {appt.appointment_time?.slice(0, 5)}
            </p>
            {appt.patients && (
              <p className="text-muted-foreground text-xs">
                Patient: {appt.patients.name} · {appt.patients.phone}
              </p>
            )}
          </div>
        </div>
      )}
      {/* Transcript */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Transcript</p>
        {call.transcript ? (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground/80 max-h-96 overflow-y-auto rounded-lg bg-muted/30 px-3 py-2.5">
            {call.transcript}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            {call.status === "active"
              ? "Call is in progress — transcript appears after it ends."
              : "No transcript available for this call."}
          </p>
        )}
      </div>
    </div>
  );
}
