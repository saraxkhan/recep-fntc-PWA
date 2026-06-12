# Deploying MediVoice to Vercel

Zero config required beyond adding your environment variables. Follow these steps exactly.

---

## 1 — Push to GitHub

Create a new GitHub repository and push this folder to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## 2 — Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"** and select your repo
3. Vercel will auto-detect the settings from `vercel.json` — **do not change them**
4. Click **"Deploy"** — it will fail on the first deploy because env vars aren't set yet (that's fine)

---

## 3 — Add Environment Variables

In your Vercel project: **Settings → Environment Variables**

Add every variable from `.env.example`. The ones marked **Required** must be set or the app will crash.

| Variable | Required | Where to find it |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase → Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase → Settings → API → anon/public key |
| `SUPABASE_PROJECT_ID` | ✅ | Supabase → Settings → General → Reference ID |
| `VITE_SUPABASE_URL` | ✅ | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Same as `SUPABASE_PUBLISHABLE_KEY` |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Same as `SUPABASE_PROJECT_ID` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → service_role key |
| `LOVABLE_API_KEY` | ✅ | lovable.dev → account → API keys |
| `AI_SHARED_SECRET` | ⚠️ | Any random string (e.g. output of `openssl rand -hex 32`) |
| `TWILIO_ACCOUNT_SID` | Optional | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Optional | Twilio Console |
| `TWILIO_FROM_NUMBER` | Optional | Twilio Console |

Set each variable for **Production**, **Preview**, and **Development** environments.

---

## 4 — Redeploy

After adding env vars: **Deployments → your latest deployment → ⋯ → Redeploy**

The build takes ~60 seconds. Once green, your app is live.

---

## 5 — Verify the PWA

Open your Vercel URL in Chrome on Android or desktop Chrome, then:

1. Open DevTools → **Application** tab
2. Check **Manifest** — should show MediVoice with all icons ✅
3. Check **Service Workers** — should show `sw.js` as active ✅
4. On Android Chrome, the **"Add to Home Screen"** banner appears automatically
5. On iOS Safari: tap Share → Add to Home Screen

---

## Supabase CORS (if you get auth errors)

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/**`

---

## Troubleshooting

**Build fails with "Cannot find module"**
→ Make sure all env vars are set. The build needs `VITE_*` vars at build time.

**App loads but AI chat doesn't work**
→ Check `LOVABLE_API_KEY` is set correctly in Vercel env vars.

**Admin login doesn't work**
→ Check Supabase CORS settings above. Also ensure `SUPABASE_SERVICE_ROLE_KEY` is set.

**PWA install banner doesn't appear**
→ Must be on HTTPS (Vercel provides this) and Chrome/Edge. iOS requires manual "Add to Home Screen" via the Share menu.
