# Project Overview — MediVoice

## Business Problem

Hospital front desks are a bottleneck. Receptionists spend a significant portion of their working hours answering repetitive calls — "Is Dr. X available tomorrow?", "Can I book at 10 AM?", "I need to cancel my appointment." These calls require no clinical judgment; they're pure lookup-and-write operations against a schedule database. Yet they tie up human staff, create hold queues during peak hours, and introduce errors when bookings are taken verbally and entered manually.

The same problem exists on the patient side: calling during office hours, waiting on hold, and navigating phone menus to accomplish a task that should take 30 seconds.

## Solution

MediVoice replaces the routine scheduling function of a receptionist with an AI agent named **Maya**. Maya runs as a web chat interface and is designed to serve as the backend for a voice assistant (Vapi) as well — both channels use the exact same tool-calling engine.

The core insight is that scheduling is a well-defined, bounded problem: a small set of operations (find doctor, check availability, book, cancel, confirm) with clear business rules (no double-booking, no past-date bookings, working hours per doctor). This makes it an excellent candidate for an LLM with function-calling rather than a fully general agent.

The system also provides hospital staff with a complete admin panel — appointment management, analytics, AI conversation inspection, and a tamper-evident audit log.

---

## System Architecture

MediVoice is built as a **full-stack SSR application** using TanStack Start, which co-locates server and client code in the same file tree while maintaining a clear server/client boundary.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Browser)                                               │
│  React 19 + TanStack Router + shadcn/ui + Tailwind CSS v4       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐  │
│  │/receptionist│ │  /book   │  │     /admin/* (protected)     │  │
│  │  Maya chat│ │  Self-   │  │  Appointments / Analytics /  │  │
│  │  (stream) │ │  booking │  │  Conversations / Doctors /   │  │
│  │           │ │  form    │  │  Patients / Audit Logs       │  │
│  └──────────┘  └──────────┘  └──────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP (SSR + API routes + Server Fns)
┌───────────────────────────▼─────────────────────────────────────┐
│  Server (TanStack Start / Nitro)                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  POST /api/chat                                         │   │
│  │  Streams Maya's response using Vercel AI SDK            │   │
│  │  Model: Google Gemini via Lovable AI Gateway            │   │
│  │  Tools: receptionistTools (8 tools)                     │   │
│  │  Logs: call_logs + ai_conversation_logs (Supabase)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  POST /api/public/ai/* (Vapi-compatible endpoints)      │   │
│  │  Auth: x-ai-secret shared header                        │   │
│  │  book-appointment  cancel-appointment  check-avail      │   │
│  │  create-patient  find-doctor  next-available-slot       │   │
│  │  send-sms                                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  createServerFn (type-safe server RPC)                  │   │
│  │  hospital.functions.ts  analytics.functions.ts          │   │
│  │  admin-auth.ts  admin-auth.server.ts                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Supabase JS client (service-role)
┌───────────────────────────▼─────────────────────────────────────┐
│  Supabase (PostgreSQL + Auth + RLS)                             │
│  doctors │ patients │ appointments │ call_logs                  │
│  ai_conversation_logs │ user_roles │ admin_audit_logs           │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow for a chat booking:**

1. Browser sends `POST /api/chat` with the conversation history and a `sessionId`.
2. The server creates/updates a `call_logs` row and logs the user message to `ai_conversation_logs`.
3. `streamText` runs the AI model with the system prompt and 8 tools. The response streams back to the browser via the AI SDK's `UIMessageStreamResponse`.
4. For each tool the model calls, the corresponding `execute` function runs server-side against Supabase.
5. On completion, all tool calls/results and the final assistant message are logged. The `call_logs` row is patched with booking outcome if a booking occurred.

---

## Database Architecture

Seven tables organized into three conceptual layers:

### Core Clinical Data
**`doctors`** — The clinic's doctor registry. Each doctor has a specialty (one of 10 supported), a list of working days, and a start/end time. The `active` flag allows soft-disabling without deleting historical data.

**`patients`** — Identified by phone number (E.164). The AI creates or retrieves patients by phone on first contact; the self-booking form does the same.

**`appointments`** — The central booking record. Links a patient to a doctor at a specific date and time. Status transitions: `scheduled` → `completed` or `cancelled`. Two constraints enforce integrity:
- A **partial unique index** on `(doctor_id, appointment_date, appointment_time) WHERE status = 'scheduled'` prevents double-booking at the database level.
- A **unique index** on `idempotency_key` (when not null) prevents duplicate AI bookings on retried requests.

### AI Observability
**`call_logs`** — One row per AI session. Tracks the channel (`chat` or `voice`), whether a booking succeeded, and links to the resulting appointment. Acts as the session index for the admin conversations view.

**`ai_conversation_logs`** — Granular event log: every user message, assistant response, and tool invocation (with full `tool_input` and `tool_output` JSON). Enables full conversation replay in the admin panel.

### Security & Governance
**`user_roles`** — RBAC table linking Supabase Auth user IDs to roles (`admin`, `moderator`, `user`). A `SECURITY DEFINER` Postgres function `has_role()` provides a safe way to check roles without exposing the table directly.

**`admin_audit_logs`** — Append-only audit trail. Written server-side on every mutating admin action (appointment status change, doctor schedule update, toggle active). Captures actor email, resource type and ID, action payload, IP address, and user agent.

---

## AI Agent Design

### Model
Google Gemini (accessed through the Lovable AI Gateway using an OpenAI-compatible interface via `@ai-sdk/openai-compatible`). The gateway is a thin proxy that handles authentication; the AI SDK treats it like any other OpenAI-compatible provider.

### System Prompt
Maya's persona and workflow are defined in `RECEPTIONIST_SYSTEM_PROMPT`. Key behavioral constraints enforced in the prompt:
- Confirm all details before booking or cancelling ("warm confirmation" step).
- Never invent doctor names, IDs, or time slots — only use what tools return.
- Treat "today"/"tomorrow" in Asia/Kolkata timezone.
- Phone numbers default to India (+91) if no country code is given.
- Always call `send_confirmation_sms` after a successful booking.

### Tool Definitions
All 8 tools are defined using the AI SDK's `tool()` helper with Zod schemas for input validation. This generates a JSON Schema that the model uses for structured function calling.

| Tool | Purpose |
|---|---|
| `find_doctor` | Lookup active doctors by specialty (partial/case-insensitive match) |
| `check_availability` | List all open 30-minute slots for a doctor on a given date |
| `next_available_slot` | Find the earliest open slot, optionally across all doctors in a specialty |
| `create_patient` | Create or retrieve a patient record by phone number |
| `book_appointment` | Insert an appointment with full validation and idempotency |
| `lookup_appointments` | Retrieve a patient's appointments by phone (for cancellation flow) |
| `cancel_appointment` | Mark an appointment as cancelled by ID |
| `send_confirmation_sms` | Send or simulate a Twilio SMS and mark `sms_sent = true` |

### Correctness Properties
- **No phantom slots:** Available slots are computed from actual working hours minus all currently `scheduled` appointments.
- **Timezone correctness:** All date comparisons use `Asia/Kolkata` via `Intl.DateTimeFormat`. Past slots on the current day are filtered out in real time.
- **Idempotency:** The `book_appointment` tool accepts an optional `idempotency_key`. If the same key is seen again, it replays the original result without creating a duplicate.
- **Step limit:** `stopWhen: stepCountIs(50)` caps the agent's tool-call loop to prevent runaway execution.

---

## Security Features

### Authentication & Authorization
- Admin routes (`/admin/*`) perform a server-side role check using `has_role()` before any data is returned. Non-admin users are shown an access-denied screen; the backend `requireAdmin` middleware throws before any query runs.
- The `has_role()` function is `SECURITY DEFINER` — it runs with elevated privileges so the caller cannot read the `user_roles` table directly, only query membership.
- Supabase Auth handles session management. Auth state changes (sign-out) are observed via `onAuthStateChange` and redirect the browser to `/auth`.

### Server/Client Key Separation
- The **service-role key** (which bypasses RLS) is only ever used in server-only files (`*.server.ts`, server function handlers, API route handlers). It is never passed to the browser.
- The **anon key** is used in the browser exclusively for Auth session management.

### AI Endpoint Authentication
- The `/api/public/ai/*` endpoints (designed for Vapi webhook calls) authenticate using a shared secret: the `x-ai-secret` header must match `AI_SHARED_SECRET`. In development, missing the secret logs a warning but allows requests through so the voice agent can be wired up before configuration is complete.

### Audit Logging
- All mutating admin actions (appointment status changes, doctor schedule changes, active toggles) are written to `admin_audit_logs` with the actor's user ID, email, IP address, and full details payload. The table is append-only from the application layer (only `service_role` has write access; authenticated users have SELECT via an admin-gated RLS policy).

### Row-Level Security
All tables have RLS enabled. `patients` and `appointments` block all direct anon/authenticated client access — writes must go through server functions using the service-role client. `doctors` allows public SELECT (for the booking form doctor list) but no direct writes. `call_logs` and `ai_conversation_logs` are service-role-only.

---

## Challenges Faced

**1. Timezone correctness across the full stack.**
"Today" and "tomorrow" mean different things in UTC versus Asia/Kolkata. The solution was to centralize all date/time resolution in `ai-tools.server.ts` using `Intl.DateTimeFormat` with the `Asia/Kolkata` timezone, and share these helpers between the AI tool handlers and the Vapi endpoint handlers. Any path that accepts a date string must pass through `resolveDate()`.

**2. Preventing double-bookings under concurrency.**
A pre-insert check (`SELECT … WHERE status = 'scheduled'`) is a TOCTOU race — two concurrent requests can both read "no clash" and then both insert. The solution is a **partial unique index** at the Postgres level; the application-layer pre-check exists only to return a friendly error message before the constraint fires. On insert conflict (Postgres error code `23505`), the handler returns a user-facing "slot just taken" message.

**3. Keeping the AI chat and voice endpoints in sync.**
The voice (Vapi) endpoints and the chat agent must behave identically. This was solved by extracting all shared logic — slot generation, phone normalization, doctor lookup, slot validation, idempotency-aware booking insert — into `ai-tools.server.ts`, and having both the `/api/public/ai/*` route handlers and the AI SDK `receptionistTools` execute functions import from that single module.

**4. Logging without blocking the response.**
AI conversation logs are best-effort: if a database write fails during logging, the chat response should still stream to the user. The logging calls in the `/api/chat` handler are wrapped in `try/catch` blocks and never awaited in a blocking manner before the response is sent.

**5. Vapi payload format variations.**
Vapi sends tool-call payloads in slightly different shapes depending on the API version. The `parseArgs()` helper in `ai-tools.server.ts` handles both the `message.toolCalls[0].function.arguments` shape and the `functionCall.parameters` shape, with a fallback to treating the body itself as the arguments.

---

## Lessons Learned

- **LLM + tools > LLM alone for bounded domains.** Giving the model a small, well-defined set of typed tools with Zod validation is far more reliable than asking it to generate SQL or format phone numbers itself. The model's job is orchestration and conversation; the tools handle correctness.
- **Idempotency is not optional for AI agents.** AI models can retry tool calls on transient errors. Without an idempotency key on the booking tool, a retry would create a duplicate appointment. Adding an optional `idempotency_key` field to the tool schema costs almost nothing and prevents a class of subtle data integrity bugs.
- **System prompts are behavioral contracts.** The `RECEPTIONIST_SYSTEM_PROMPT` defines Maya's confirmation step, timezone assumptions, and default country code. Removing any of those instructions would change the agent's behavior in ways that are hard to detect in testing but obvious in production.
- **Shared business logic between AI and UI is the real moat.** The slot generation, availability calculation, and booking validation logic is the same whether it's called by the AI agent or the self-service booking form. Keeping it in a single module means fixing a bug in one place fixes it everywhere.

---

## Scalability Considerations

**Database:**
- The `appointments_doctor_date_idx` index on `(doctor_id, appointment_date)` keeps availability queries fast as the appointments table grows.
- The `call_logs` and `ai_conversation_logs` tables will grow with usage. For production, a periodic archival job (moving records older than N months to cold storage) should be added.
- The `admin_audit_logs` table is append-only and has a `created_at DESC` index, which keeps paginated queries fast.

**AI:**
- The chat endpoint streams a single LLM call per user message. Each tool execution is a Supabase query, typically sub-100ms. The `stopWhen: stepCountIs(50)` guard prevents any single session from consuming unbounded LLM tokens.
- For multi-tenant deployments (multiple hospitals), adding a `clinic_id` foreign key to `doctors`, `patients`, and `appointments`, and scoping all queries by `clinic_id`, is the minimal change needed.

**Application:**
- TanStack Start / Nitro deploys as a standard Node.js server. Horizontal scaling (multiple instances behind a load balancer) works without modification because all state is in Supabase.
- The Lovable AI Gateway handles LLM request routing; swapping to a different model or provider requires changing one line in `ai-gateway.server.ts`.
