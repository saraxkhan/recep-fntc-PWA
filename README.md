# MediVoice — AI Receptionist for Hospital Clinics

> **One AI assistant. Voice + web chat. Real appointment bookings.**

MediVoice is a full-stack hospital appointment management system featuring **Maya**, an AI receptionist that can book, check, and cancel appointments through a web chat interface — using the exact same tool-calling engine designed for integration with voice assistants (e.g. Vapi). Patients can also self-book through a manual booking flow, and hospital staff get a full admin dashboard with analytics, audit logs, and AI conversation inspection.

---

## Highlights

- 🤖 AI-powered receptionist (Maya) with multi-step tool calling
- 📅 Real-time appointment booking with slot collision prevention
- 🚫 Double-booking prevention via partial unique index at the database level
- 💬 Full conversation logging with admin transcript viewer
- 📊 Analytics dashboard — booking trends, specialty breakdown, top doctors
- 🔐 Role-based admin access with immutable audit logs
- 📱 SMS-ready architecture via Twilio (gracefully simulated when unconfigured)

---

## Project Status

**Version:** v1.0

| Area | Status |
|---|---|
| Web application (chat + self-booking + admin) | ✅ Complete |
| Voice integration (Vapi) | 🔜 Planned — endpoints already built |
| Twilio SMS | ✅ Prepared — live with credentials, simulated without |
| Patient authentication portal | 🔜 Planned |
| Multi-language support | 🔜 Planned |

---

## Features

### Patient-Facing
- **AI Chat Receptionist (Maya)** — Conversational booking via a streaming chat UI. Maya understands natural language: "I'd like to see a cardiologist tomorrow" triggers a full multi-step booking workflow.
- **Self-Service Booking Page** — Step-by-step form to pick a specialty, doctor, available date/slot, and enter contact details.
- **Quick Prompts** — Pre-built conversation starters on the chat interface for common tasks.
- **SMS Confirmations** — Twilio integration sends confirmation SMS after booking; gracefully falls back to a simulated log if credentials are absent.

### AI Receptionist Engine
- **8 AI tools** powering Maya: `find_doctor`, `check_availability`, `next_available_slot`, `create_patient`, `book_appointment`, `lookup_appointments`, `cancel_appointment`, `send_confirmation_sms`.
- **Idempotency keys** on bookings to prevent duplicate appointments on retries.
- **Asia/Kolkata timezone awareness** — "today" and "tomorrow" always resolve correctly for the clinic.
- **E.164 phone normalization** — Defaults to India (+91); handles trunk-prefixed, unformatted, and international numbers.
- **Slot collision prevention** — Partial unique index at the database level prevents double-bookings even under concurrent requests; the app layer returns a human-friendly error on conflict.
- **Step limit** — AI agent stops after 50 tool-call steps to prevent runaway loops.

### Admin Dashboard
- **Appointments** — Full list with status management (scheduled → completed / cancelled).
- **Analytics** — Daily booking trend (line chart), appointments by specialty (bar chart), top doctors leaderboard, AI booking success rate.
- **AI Conversations** — Browse every chat session, view full transcript with tool inputs/outputs, and see which session led to a booking.
- **Doctors** — Toggle active status, update working days and hours per doctor.
- **Patients** — Patient registry with linked appointment counts.
- **Audit Logs** — Immutable log of every admin action with actor email, IP address, user agent, and resource details.
- **Role-based access** — `has_role()` Postgres function gates the admin section; non-admin users see a friendly access-denied screen.

---

## Architecture

```
Browser (React 19 + TanStack Router)
        │
        ├── /receptionist  → Chat UI (useChat + AI SDK streaming)
        ├── /book           → Self-service booking form (server functions)
        ├── /admin/*        → Protected admin dashboard
        │
        ▼
TanStack Start SSR Server (Vite + Nitro)
        │
        ├── POST /api/chat             → Streams Maya's responses (Google Gemini via Lovable AI Gateway)
        ├── POST /api/public/ai/*      → Vapi-compatible tool endpoints (shared-secret auth)
        │       ├── book-appointment
        │       ├── cancel-appointment
        │       ├── check-availability
        │       ├── create-patient
        │       ├── find-doctor
        │       ├── next-available-slot
        │       └── send-sms
        │
        └── Server Functions (createServerFn)
                ├── hospital.functions.ts   → bookAppointment, listDoctors, listAppointments, ...
                ├── analytics.functions.ts  → getAnalytics, listCallLogs, getCallTranscript
                └── admin-auth.ts           → requireAdmin middleware, listAuditLogs
        │
        ▼
Supabase (PostgreSQL + Auth + RLS)
        ├── doctors
        ├── patients
        ├── appointments
        ├── call_logs
        ├── ai_conversation_logs
        ├── user_roles
        └── admin_audit_logs
```

**Key architectural choices:**
- All database writes from the AI and admin paths use the **service-role Supabase client** (server-only). The public anon key is used only for the Auth session check in the browser.
- The AI chat endpoint and the Vapi tool endpoints share the **same business logic** — `ai-tools.server.ts` — ensuring the voice assistant and web chat behave identically.
- TanStack Start `createServerFn` calls are type-safe RPC functions that run exclusively on the server and are called from React components without a manually written API layer.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) (React 19, SSR) |
| Routing | TanStack Router (file-based, type-safe) |
| AI SDK | [Vercel AI SDK](https://sdk.vercel.ai/) v6 (`ai`, `@ai-sdk/react`) |
| LLM | Google Gemini (via Lovable AI Gateway) |
| Database | Supabase (PostgreSQL + Row-Level Security) |
| Auth | Supabase Auth |
| UI Components | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| SMS | Twilio (optional, simulated when unconfigured) |
| Validation | Zod |
| Forms | React Hook Form |
| Build | Vite 7 + Nitro |
| Package Manager | Bun |

---

## Installation

### Prerequisites
- [Bun](https://bun.sh/) >= 1.0
- A [Supabase](https://supabase.com/) project
- A [Lovable](https://lovable.dev/) account (for the AI gateway key)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-username/medivoice.git
cd medivoice

# 2. Install dependencies
bun install

# 3. Copy the environment file and fill in your values
cp .env.example .env

# 4. Run Supabase migrations
# Apply all files under supabase/migrations/ in your Supabase project
# via the Supabase dashboard SQL editor or the Supabase CLI:
supabase db push

# 5. Start the development server
bun dev
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase `anon` key (used in the browser for Auth) |
| `SUPABASE_PROJECT_ID` | ✅ | Supabase project reference ID |
| `VITE_SUPABASE_URL` | ✅ | Same URL, exposed to the client bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Same anon key, exposed to the client bundle |
| `LOVABLE_API_KEY` | ✅ | API key for the Lovable AI Gateway (LLM access) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service-role key (server-only, never sent to browser) |
| `AI_SHARED_SECRET` | ⚠️ Recommended | Shared secret for authenticating Vapi tool-call webhooks. Falls back to unauthenticated in dev if unset. |
| `TWILIO_ACCOUNT_SID` | Optional | Twilio Account SID for real SMS. If absent, SMS is simulated. |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Optional | Twilio phone number to send from |

---

## Database Design

The schema is managed through versioned migrations in `supabase/migrations/`.

### Tables

**`doctors`**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | |
| `specialty` | TEXT | One of 10 defined specialties |
| `working_days` | TEXT[] | e.g. `['Mon','Tue','Wed']` |
| `start_time` | TIME | Doctor's working hours start |
| `end_time` | TIME | Doctor's working hours end |
| `active` | BOOLEAN | Soft-disable without deleting |
| `created_at` | TIMESTAMPTZ | |

**`patients`**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `name` | TEXT | |
| `phone` | TEXT | Normalized to E.164 |
| `created_at` | TIMESTAMPTZ | |

Index on `phone` for fast lookup by AI tools.

**`appointments`**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `patient_id` | UUID (FK → patients) | Cascade delete |
| `doctor_id` | UUID (FK → doctors) | Cascade delete |
| `appointment_date` | DATE | |
| `appointment_time` | TIME | |
| `status` | TEXT | `scheduled` / `completed` / `cancelled` |
| `sms_sent` | BOOLEAN | Tracks whether confirmation was sent |
| `idempotency_key` | TEXT | Optional; prevents duplicate AI bookings |
| `created_at` | TIMESTAMPTZ | |

**Double-booking prevention:** A partial unique index `(doctor_id, appointment_date, appointment_time) WHERE status = 'scheduled'` enforces that no doctor can have two active bookings at the same slot, even under concurrent requests.

**`call_logs`** — One row per AI session (chat or voice). Tracks channel, booking success, last activity, and links to the resulting appointment.

**`ai_conversation_logs`** — Every message event in a session: user messages, assistant responses, and tool calls with their full input/output JSON.

**`user_roles`** — Maps Supabase Auth users to roles (`admin`, `moderator`, `user`). Queried via a `SECURITY DEFINER` function `has_role()` to prevent privilege escalation.

**`admin_audit_logs`** — Append-only log of admin actions with actor, resource, details, IP, and user agent.

---

## AI Receptionist Workflow

Maya (the AI receptionist) is backed by a system prompt and 8 callable tools. The flow for a typical booking looks like this:

```
User: "I'd like to see a cardiologist tomorrow"
                │
                ▼
  [tool: find_doctor { specialty: "cardiologist" }]
  → Returns list of active cardiologists with IDs
                │
                ▼
  Maya: "I found Dr. Aanya Kapoor. What time works for you?"
                │
  User: "Any open slot"
                │
                ▼
  [tool: next_available_slot { specialty: "Cardiologist", from_date: "tomorrow" }]
  → Returns earliest open 30-min slot across all cardiologists
                │
                ▼
  Maya: "Dr. Kapoor has 10:00 AM available. May I have your name and phone number?"
                │
  User: "Rahul Sharma, 9876543210"
                │
                ▼
  Maya: "Confirming: Rahul Sharma, +91 9876543210, Dr. Kapoor, tomorrow at 10:00 AM. Shall I book?"
                │
  User: "Yes"
                │
                ▼
  [tool: book_appointment { doctor_id, date, time, name, phone, idempotency_key }]
  → Creates patient (or finds existing by phone), inserts appointment
                │
                ▼
  [tool: send_confirmation_sms { appointment_id, phone }]
  → Sends Twilio SMS (or simulates), marks sms_sent = true
                │
                ▼
  Maya: "Done! Your appointment with Dr. Kapoor is confirmed for tomorrow at 10:00 AM."
```

**Cancellation flow:** User provides phone → `lookup_appointments` → Maya lists upcoming bookings → user confirms which one → `cancel_appointment` updates status to `cancelled`.

**Availability check:** `check_availability` returns all open slots for a doctor on a given date; `next_available_slot` searches up to 60 days ahead across multiple doctors.

All tool calls and responses are persisted to `ai_conversation_logs` so admins can replay any session in full.

---

## Future Improvements

- **Vapi voice integration** — Wire the `/api/public/ai/*` endpoints to a live Vapi voice assistant for phone-based bookings (the endpoints are already built for this).
- **Patient authentication** — Allow patients to log in and view/manage their own appointments without calling in.
- **Email notifications** — Add appointment reminder emails (e.g. 24 hours before) alongside SMS.
- **Doctor self-service portal** — Let doctors view their own schedule and mark slots as blocked.
- **Multi-language support** — The AI system prompt and UI currently target English/India; adding locale support would broaden reach.
- **Slot duration flexibility** — Currently fixed at 30 minutes; allowing per-doctor or per-specialty slot durations would increase real-world applicability.
- **Webhook for Vapi call end** — Update `call_logs` status to `ended` when a Vapi call concludes.
- **Rate limiting** — Add per-IP rate limiting on the public AI endpoints and the chat API.
- **Test coverage** — Unit tests for the slot generation, phone normalization, and date resolution utilities.
