# Vapi Voice Integration — Setup Guide

This guide walks you through connecting Vapi to your existing MediVoice deployment.
All tool endpoints already exist in your codebase. You are only configuring Vapi to
call them.

---

## Prerequisites

| Item | Where to get it |
|---|---|
| Deployed MediVoice URL | Your Vercel project URL, e.g. `https://medivoice.vercel.app` |
| Vapi account | [vapi.ai](https://vapi.ai) — free tier works for testing |
| Twilio account with phone number | Already set up for SMS; same account used here |
| `AI_SHARED_SECRET` value | Already in your Vercel env vars |
| New `VAPI_WEBHOOK_SECRET` value | Generate any strong random string (e.g. `openssl rand -hex 32`) |

---

## Step 1 — Add environment variables to Vercel

In your Vercel project → **Settings → Environment Variables**, add:

```
VAPI_WEBHOOK_SECRET = <your-new-random-secret>
```

All other required variables (`TWILIO_*`, `AI_SHARED_SECRET`, `SUPABASE_*`, `GEMINI_API_KEY`)
should already be present from your original deployment.

After adding, redeploy or trigger a new build for the variable to take effect.

---

## Step 2 — Create the Vapi Assistant

1. Log in to [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Click **Assistants → + Create Assistant**
3. Choose **Blank Assistant**

### 2a — Model settings

| Setting | Value |
|---|---|
| Model Provider | **Google Gemini** |
| Model | `gemini-2.0-flash` (or `gemini-1.5-pro` for higher quality) |
| Temperature | `0.3` |
| Max tokens | `1024` |

### 2b — System prompt

Paste this **exactly** into the System Prompt field (it mirrors the chat assistant):

```
You are Maya, the AI receptionist at MediVoice Hospital. You handle bookings, cancellations, and availability questions exactly like the phone voice assistant does.

Style:
- Warm, concise, and professional. Speak as if on a phone call: short sentences, no markdown lists unless explicitly helpful in chat.
- Always confirm details (name, phone, doctor, date, time) back to the caller before booking or cancelling.
- The clinic timezone is Asia/Kolkata. Treat "today" / "tomorrow" in that timezone.
- Phone numbers default to India (+91) if no country code is provided.

Workflow:
1. Greet briefly and ask how you can help.
2. For bookings: gather specialty (or doctor name) → call find_doctor → ask preferred date → call check_availability or next_available_slot → propose a slot → collect name + phone → confirm everything → call book_appointment with a fresh idempotency_key → then call send_confirmation_sms.
3. For cancellations: ask for phone → call lookup_appointments → confirm which one → call cancel_appointment.
4. For "what's available" / "any cardiologist tomorrow": use check_availability or next_available_slot.
5. Never invent doctor names, times, or IDs. Only mention what the tools return.
6. If a tool returns an error, explain it in plain language and offer a next step.
7. If the caller asks to speak to a human, or if you cannot help after two attempts, say: "Let me connect you with one of our staff members. Please hold on." Then end the call gracefully.

Available specialties: Cardiologist, Neurologist, Gynecologist, General Physician, Radiologist, Orthopedic, Dermatologist, Pediatrician, ENT Specialist, Ophthalmologist.

Working hours are doctor-specific; rely on tool results. Slots are 30 minutes.
```

> **Note:** Rule 7 is the human-handoff instruction. It causes the webhook to set
> `needs_human_followup = true` in your database, which surfaces in the admin Voice Calls page.

### 2c — Voice settings

| Setting | Value |
|---|---|
| Voice Provider | ElevenLabs (recommended) or Vapi native |
| Voice | `Rachel` or any natural English voice |
| Background noise | Off |

### 2d — Call settings

| Setting | Value |
|---|---|
| Max duration | `600` seconds (10 min) |
| Recording enabled | **Yes** — required for `recording_url` in your admin page |
| End call phrases | `goodbye`, `have a good day`, `take care` |

### 2e — Server URL (webhook)

| Setting | Value |
|---|---|
| Server URL | `https://your-domain.vercel.app/api/public/vapi/webhook` |
| Server URL Secret | The value you set as `VAPI_WEBHOOK_SECRET` in Step 1 |

Vapi will send this secret in the `X-Vapi-Secret` header on every webhook call.

---

## Step 3 — Define the 8 Tools

In the assistant editor, go to **Tools → + Add Tool** for each tool below.
All tools use:
- **Type:** `function`
- **Server URL:** same as above (or leave blank to use the assistant's Server URL)
- **Method:** `POST`
- **Headers:** `x-ai-secret: <your AI_SHARED_SECRET value>`

Replace `https://your-domain.vercel.app` with your actual Vapi domain throughout.

---

### Tool 1: `find_doctor`

```json
{
  "type": "function",
  "function": {
    "name": "find_doctor",
    "description": "Find active doctors by medical specialty (e.g. 'cardiologist', 'pediatrician'). Use this first when the caller asks for a kind of doctor.",
    "parameters": {
      "type": "object",
      "properties": {
        "specialty": {
          "type": "string",
          "description": "Specialty name, partial matches allowed"
        }
      },
      "required": ["specialty"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/find-doctor",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 2: `check_availability`

```json
{
  "type": "function",
  "function": {
    "name": "check_availability",
    "description": "List open 30-minute slots for a doctor on a specific date. Accepts 'today', 'tomorrow', or YYYY-MM-DD.",
    "parameters": {
      "type": "object",
      "properties": {
        "doctor_id": { "type": "string", "description": "Doctor UUID from find_doctor" },
        "date": { "type": "string", "description": "today | tomorrow | YYYY-MM-DD" }
      },
      "required": ["doctor_id", "date"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/check-availability",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 3: `next_available_slot`

```json
{
  "type": "function",
  "function": {
    "name": "next_available_slot",
    "description": "Find the earliest available slot for a doctor or any doctor in a specialty, scanning forward up to 14 days.",
    "parameters": {
      "type": "object",
      "properties": {
        "doctor_id": { "type": "string", "description": "Doctor UUID (use if specific doctor requested)" },
        "specialty": { "type": "string", "description": "Specialty name (use if no specific doctor)" },
        "from_date": { "type": "string", "description": "Start date: today | tomorrow | YYYY-MM-DD" },
        "max_days": { "type": "integer", "description": "How many days to scan (default 14, max 60)" }
      }
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/next-available-slot",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 4: `create_patient`

```json
{
  "type": "function",
  "function": {
    "name": "create_patient",
    "description": "Create or look up a patient by their phone number. Call this after collecting the caller's name and phone number.",
    "parameters": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Patient's full name" },
        "phone": { "type": "string", "description": "Patient's phone number (any format, defaults to +91)" }
      },
      "required": ["name", "phone"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/create-patient",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 5: `book_appointment`

```json
{
  "type": "function",
  "function": {
    "name": "book_appointment",
    "description": "Book an appointment for a patient with a doctor. Always confirm all details with the caller before calling this.",
    "parameters": {
      "type": "object",
      "properties": {
        "patient_id": { "type": "string", "description": "Patient UUID from create_patient" },
        "doctor_id": { "type": "string", "description": "Doctor UUID from find_doctor" },
        "appointment_date": { "type": "string", "description": "YYYY-MM-DD" },
        "appointment_time": { "type": "string", "description": "HH:MM (24-hour, e.g. 09:30)" },
        "idempotency_key": { "type": "string", "description": "A unique string to prevent duplicate bookings on retry. Use a new UUID each time." }
      },
      "required": ["patient_id", "doctor_id", "appointment_date", "appointment_time", "idempotency_key"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/book-appointment",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 6: `lookup_appointments`

```json
{
  "type": "function",
  "function": {
    "name": "lookup_appointments",
    "description": "Look up a patient's existing appointments by phone number. Use this when a caller wants to check or cancel a booking.",
    "parameters": {
      "type": "object",
      "properties": {
        "phone": { "type": "string", "description": "Patient's phone number" }
      },
      "required": ["phone"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/lookup-appointments",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 7: `cancel_appointment`

```json
{
  "type": "function",
  "function": {
    "name": "cancel_appointment",
    "description": "Cancel a scheduled appointment by its ID. Always confirm with the caller before cancelling.",
    "parameters": {
      "type": "object",
      "properties": {
        "appointment_id": { "type": "string", "description": "Appointment UUID from lookup_appointments" }
      },
      "required": ["appointment_id"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/cancel-appointment",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

### Tool 8: `send_confirmation_sms`

```json
{
  "type": "function",
  "function": {
    "name": "send_confirmation_sms",
    "description": "Send a confirmation SMS to the patient after a successful booking or cancellation.",
    "parameters": {
      "type": "object",
      "properties": {
        "phone": { "type": "string", "description": "Patient's phone number" },
        "appointment_id": { "type": "string", "description": "Appointment UUID (marks sms_sent = true in DB)" },
        "message": { "type": "string", "description": "The SMS message text" }
      },
      "required": ["phone", "message"]
    }
  },
  "server": {
    "url": "https://your-domain.vercel.app/api/public/ai/send-sms",
    "headers": { "x-ai-secret": "YOUR_AI_SHARED_SECRET" }
  }
}
```

---

## Step 4 — Connect your Twilio phone number

1. In the Vapi dashboard, go to **Phone Numbers → + Add Phone Number**
2. Choose **Import from Twilio**
3. Enter your:
   - Twilio Account SID
   - Twilio Auth Token
   - Twilio phone number (E.164, e.g. `+911234567890`)
4. Vapi will update your Twilio number's webhook URL automatically
5. Assign the phone number to the assistant you created in Step 2

> **Important:** After Vapi imports the number, your Twilio number's voice webhook
> will point to Vapi. Do not change it back. Twilio is now used purely as the
> carrier; all call logic runs through Vapi → your endpoints.

---

## Step 5 — Test the end-to-end flow

### 5a — Test one tool endpoint directly

```bash
curl -X POST https://your-domain.vercel.app/api/public/ai/find-doctor \
  -H "Content-Type: application/json" \
  -H "x-ai-secret: YOUR_AI_SHARED_SECRET" \
  -d '{ "specialty": "cardiologist" }'
# Expected: { "specialty": "Cardiologist", "doctors": [...] }
```

### 5b — Test the webhook

```bash
curl -X POST https://your-domain.vercel.app/api/public/vapi/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-secret: YOUR_VAPI_WEBHOOK_SECRET" \
  -d '{
    "message": {
      "type": "call-start",
      "call": { "id": "test-001", "customer": { "number": "+919876543210" } }
    }
  }'
# Expected: { "ok": true }
# Check Supabase call_logs table for a new row with session_id = "test-001"
```

### 5c — Make a real test call

Dial your Twilio number. Maya should:
1. Answer and greet you within 2–3 seconds
2. Understand your request ("I'd like to book a cardiologist appointment")
3. Call your `find_doctor` endpoint, read back matching doctors
4. Walk through the booking flow
5. Send a confirmation SMS to the number you give her
6. Say goodbye and hang up

After the call, check:
- **Supabase** `call_logs`: new row with `channel='voice'`, transcript, duration, `booking_succeeded=true`
- **Admin dashboard** → **Voice Calls**: call appears with booking card
- **SMS**: confirmation received on patient phone

---

## Step 6 — Production checklist

- [ ] `VAPI_WEBHOOK_SECRET` set in Vercel (not empty)
- [ ] `AI_SHARED_SECRET` set in Vercel (protects all tool endpoints)
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` set
- [ ] `GEMINI_API_KEY` set (chat assistant still needs this)
- [ ] Vapi assistant recording is **enabled** (required for recording_url)
- [ ] Vapi Server URL secret matches `VAPI_WEBHOOK_SECRET` exactly
- [ ] All 8 tool `x-ai-secret` headers match `AI_SHARED_SECRET` exactly
- [ ] Twilio number assigned to the Vapi assistant
- [ ] Test call completed successfully end-to-end

---

## Environment variables — complete reference

| Variable | Required | Used by |
|---|---|---|
| `SUPABASE_URL` | Yes | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server |
| `VITE_SUPABASE_URL` | Yes | Browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser |
| `GEMINI_API_KEY` | Yes | `/api/chat` |
| `AI_SHARED_SECRET` | Yes | All `/api/public/ai/*` endpoints |
| `VAPI_WEBHOOK_SECRET` | Yes | `/api/public/vapi/webhook` |
| `TWILIO_ACCOUNT_SID` | Yes (SMS) | `send-sms`, `sendFollowupSms` |
| `TWILIO_AUTH_TOKEN` | Yes (SMS) | Same |
| `TWILIO_FROM_NUMBER` | Yes (SMS) | Same |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Webhook returns 401 | `X-Vapi-Secret` mismatch | Verify `VAPI_WEBHOOK_SECRET` in Vercel matches Vapi dashboard Server URL Secret exactly |
| Tool call returns 401 | `x-ai-secret` header missing/wrong | Check all 8 tool definitions have the correct header value |
| `find_doctor` returns 404 | No doctors in DB | Seed doctors via the admin Doctors page |
| Call connects but Maya is silent | Gemini API key issue or model unavailable | Check Vapi logs for model errors; try `gemini-1.5-flash` |
| No row in `call_logs` after call | Webhook URL wrong or server not redeployed | Verify Server URL in Vapi matches your deployed URL; redeploy after adding env vars |
| Booking succeeded but SMS not sent | Twilio env vars missing | Add all three `TWILIO_*` vars to Vercel |
| Voice Calls admin page empty | No voice calls yet, or `channel` filter | Make a test call first; check Supabase `call_logs` for `channel='voice'` rows |
