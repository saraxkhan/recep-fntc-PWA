-- ---------------------------------------------------------------------------
-- Phase 2: Add voice-call columns to call_logs
-- ---------------------------------------------------------------------------
-- All additions use ADD COLUMN IF NOT EXISTS so the migration is safe to
-- re-run and will not fail on a database that already has the column.
-- Existing chat-session rows are unaffected: nullable columns stay NULL,
-- boolean columns default to false.
-- ---------------------------------------------------------------------------
ALTER TABLE public.call_logs
  -- Telephony identity ---------------------------------------------------------
  -- E.164 phone of the incoming caller (from Vapi call.customer.number).
  ADD COLUMN IF NOT EXISTS caller_phone            TEXT,
  -- Vapi's own unique call ID. Used as the dedup key on the webhook upsert
  -- so a retried end-of-call-report never creates a duplicate row.
  ADD COLUMN IF NOT EXISTS vapi_call_id            TEXT,
  -- Duration & media -----------------------------------------------------------
  -- Seconds the call lasted, populated from Vapi end-of-call-report.
  ADD COLUMN IF NOT EXISTS duration_seconds        INTEGER,
  -- Vapi recording URL (populated only when recording is enabled in the
  -- assistant config; NULL for calls with recording off).
  ADD COLUMN IF NOT EXISTS recording_url           TEXT,
  -- Full conversation transcript as a flat string (speaker-labelled lines).
  -- Stored as TEXT (not jsonb) so it can be displayed without parsing.
  ADD COLUMN IF NOT EXISTS transcript              TEXT,
  -- Human handoff (production feature) ----------------------------------------
  -- Set true when the caller explicitly asks for a human, or when Maya flags
  -- that she cannot confidently complete the request after several attempts.
  ADD COLUMN IF NOT EXISTS needs_human_followup    BOOLEAN NOT NULL DEFAULT false,
  -- Admin marks this true once a staff member has called the patient back.
  ADD COLUMN IF NOT EXISTS human_followup_resolved BOOLEAN NOT NULL DEFAULT false,
  -- Interrupted call recovery (production feature) ----------------------------
  -- Set true when the call ends (or errors) before a booking was completed
  -- AND the session contained at least one tool call (partial progress).
  ADD COLUMN IF NOT EXISTS interrupted             BOOLEAN NOT NULL DEFAULT false,
  -- Set true once the recovery SMS ("Please call back or book online") has
  -- been sent to the caller's number, preventing duplicate sends.
  ADD COLUMN IF NOT EXISTS followup_sms_sent       BOOLEAN NOT NULL DEFAULT false;
-- Unique index on vapi_call_id -----------------------------------------------
-- Secondary storage-layer guard: prevents two rows ever sharing the same
-- Vapi call ID at the DB level.
-- NOTE: the webhook upsert conflict target is session_id (the table-level
-- UNIQUE constraint), NOT this index. PostgREST cannot use partial indexes
-- (those with a WHERE clause) as upsert conflict targets. For voice calls
-- session_id = vapi_call_id = the Vapi call ID, so both constraints are
-- satisfied simultaneously by the same upsert.
-- The WHERE clause keeps the index sparse: chat rows (vapi_call_id IS NULL)
-- are excluded and do not consume index space.
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_vapi_call_id_uidx
  ON public.call_logs (vapi_call_id)
  WHERE vapi_call_id IS NOT NULL;
-- Partial indexes for admin Voice Calls page filters --------------------------
-- "Action required: human handoff" queue
CREATE INDEX IF NOT EXISTS call_logs_needs_human_idx
  ON public.call_logs (started_at DESC)
  WHERE needs_human_followup = true AND human_followup_resolved = false;
-- "Action required: send recovery SMS" queue
CREATE INDEX IF NOT EXISTS call_logs_interrupted_idx
  ON public.call_logs (started_at DESC)
  WHERE interrupted = true AND followup_sms_sent = false;
-- Index to support fast voice-only listing in the admin page
CREATE INDEX IF NOT EXISTS call_logs_voice_channel_idx
  ON public.call_logs (started_at DESC)
  WHERE channel = 'voice';
