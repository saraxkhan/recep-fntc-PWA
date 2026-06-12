
-- call_logs: one row per AI session (chat or voice)
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'chat',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  message_count int NOT NULL DEFAULT 0,
  tool_call_count int NOT NULL DEFAULT 0,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  booking_succeeded boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- ai_conversation_logs: each message/tool event in the session
CREATE TABLE public.ai_conversation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  role text NOT NULL, -- user | assistant | tool
  content text,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_conversation_logs TO service_role;
ALTER TABLE public.ai_conversation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX ai_conversation_logs_session_idx
  ON public.ai_conversation_logs (session_id, created_at);
CREATE INDEX call_logs_started_idx
  ON public.call_logs (started_at DESC);
