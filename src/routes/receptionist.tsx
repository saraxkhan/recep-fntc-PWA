import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Wrench,
  CheckCircle2,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/receptionist")({
  head: () => ({
    meta: [
      { title: "AI Receptionist · MediVoice" },
      {
        name: "description",
        content:
          "Chat with Maya, the AI receptionist. She uses the same booking, availability, and cancellation tools as the phone voice assistant.",
      },
    ],
  }),
  component: ReceptionistPage,
});

const GREETING =
  "Hi! I'm Maya, the MediVoice receptionist. I can book, check, or cancel appointments — what can I help you with?";

function ReceptionistPage() {
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const KEY = "medivoice.chat.session";
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  }, []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { sessionId },
      }),
    [sessionId],
  );
  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [isBusy]);
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const submit = async () => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    await sendMessage({ text });
  };

  const quickPrompts = [
    "I'd like to see a cardiologist tomorrow",
    "What's the next available pediatrician slot?",
    "I need to cancel an appointment",
    "Any dermatologist open today?",
  ];

  return (
    <div className="flex flex-col h-dvh bg-muted/30 overflow-hidden">
      <header className="border-b bg-card shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Home</span>
            </Link>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">Maya</div>
                <div className="text-xs text-muted-foreground leading-tight">
                  AI Receptionist · Asia/Kolkata
                </div>
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Online
          </Badge>
        </div>
      </header>

      <main className="flex-1 overflow-hidden max-w-4xl w-full mx-auto px-2 sm:px-4 py-3 sm:py-6">
        <div className="rounded-xl border bg-card flex flex-col h-full">
          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-4">
                <AssistantBubble text={GREETING} />
                <div className="flex flex-wrap gap-2 pl-11">
                  {quickPrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => sendMessage({ text: p })}
                      className="text-xs rounded-full border px-3 py-1.5 bg-background hover:bg-muted transition touch-manipulation"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}

            {status === "submitted" && (
              <div className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Maya is thinking…
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive border border-destructive/30 rounded-md p-3 bg-destructive/5">
                {error.message || "Something went wrong. Please try again."}
              </div>
            )}
          </div>

          <form
            className="border-t p-3 flex gap-2 items-end shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}              placeholder="Type your message…"
              className="resize-none min-h-[44px] max-h-40"
              rows={1}
              disabled={isBusy}
            />
            {isBusy ? (
              <Button type="button" variant="outline" size="icon" className="shrink-0 h-11 w-11" onClick={() => stop()}>
                <span className="sr-only">Stop</span>
                <span aria-hidden>■</span>
              </Button>
            ) : (
              <Button type="submit" size="icon" className="shrink-0 h-11 w-11" disabled={!input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}

function MessageView({ message }: { message: any }) {
  const isUser = message.role === "user";
  const text = (message.parts ?? [])
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("");
  const toolParts = (message.parts ?? []).filter((p: any) =>
    typeof p.type === "string" && p.type.startsWith("tool-"),
  );

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 max-w-[80%] text-sm whitespace-pre-wrap">
          {text}
        </div>
        <div className="w-8 h-8 rounded-full bg-muted grid place-items-center shrink-0">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
        <Bot className="w-4 h-4" />
      </div>
      <div className="space-y-2 max-w-[80%]">
        {toolParts.map((p: any, i: number) => (
          <ToolCard key={i} part={p} />
        ))}
        {text && (
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ part }: { part: any }) {
  const [open, setOpen] = useState(false);
  const name = String(part.type ?? "tool").replace(/^tool-/, "");
  const state = part.state as string | undefined;
  const isDone = state === "output-available" || state === "result";
  const isError = state === "output-error" || !!part.errorText;
  return (
    <div className="rounded-lg border bg-muted/40 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/70"
      >
        {isError ? (
          <span className="text-destructive">⚠</span>
        ) : isDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {state ?? "running"}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t bg-background space-y-2">
          {part.input && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">
                Input
              </div>
              <pre className="text-[11px] whitespace-pre-wrap break-all">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output !== undefined && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">
                Output
              </div>
              <pre className="text-[11px] whitespace-pre-wrap break-all">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.errorText && (
            <div className="text-destructive text-[11px]">{part.errorText}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
        <Bot className="w-4 h-4" />
      </div>
      <div className="text-sm text-foreground leading-relaxed">{text}</div>
    </div>
  );
}