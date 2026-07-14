# Deploying `focusmeeting` to Netlify (SSR via Nitro)

This README shows the exact Netlify, Google Cloud, and Supabase settings to deploy the `focusmeeting` app (Nitro SSR output). Follow the sections in order.

## Prerequisites

- Git repository connected to Netlify (the repo containing this project).
- Netlify account.
- Google Cloud project with OAuth credentials (OAuth client).
- Supabase project (you already have `udwnsfxkekmvoczcwonp`).

Files you should already have in the repo:
- `netlify.toml` (created in repo)
- `.output/public` (built static assets)
- `.output/server` (Nitro server functions)
- `src/routes/auth.tsx` and `src/integrations/supabase/client.ts`

## 1) Netlify — Create site and connect repo

1. In Netlify, click **New site from Git** → choose your Git provider → select the `focusmeeting` repo and the branch to deploy (e.g., `main`).
2. In the **Build settings** set the following copy-paste values:

Build command:

```bash
npm run build
```

Publish directory:

```.output/public
```

Functions directory:

```.output/server
```

3. Save and continue. Netlify will ask for environment variables — set them now (see next section).

## 2) Netlify — Environment variables (Build & deploy → Environment)

Add these exact variables (replace placeholders where noted):

- `NITRO_PRESET` = `netlify`
- `VITE_SUPABASE_URL` = `https://udwnsfxkekmvoczcwonp.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd25zZnhrZWttdm9jemN3b25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjM5MTIsImV4cCI6MjA5NzE5OTkxMn0.C8zgQF3CxWkkVNlfleHGwdfIAJbIify2kQfgEoVaHjo`
- `SUPABASE_URL` = `https://udwnsfxkekmvoczcwonp.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = same value as `VITE_SUPABASE_PUBLISHABLE_KEY`
- (optional) `NODE_ENV` = `production`

Notes:
- The publishable key above is already present in your local `.env`. Do NOT store any Supabase service role secret here — that belongs only in Supabase dashboard or secure server-only variables.

## 3) Google Cloud — create OAuth client

1. In Google Cloud Console, go to **APIs & Services → Credentials** and create an **OAuth 2.0 Client ID** (Web application).
2. Copy the generated **Client ID** and **Client Secret** (you will paste these into Supabase).
3. Set these exact Authorized origins / redirect URIs:

- Authorized JavaScript origins:

```
https://<your-netlify-domain>
```

Replace `<your-netlify-domain>` with the Netlify site domain that will be assigned (for example `your-site.netlify.app`).

- Authorized redirect URIs (exact):

```
https://udwnsfxkekmvoczcwonp.supabase.co/auth/v1/callback
```

> Important: the redirect URI points to Supabase's callback endpoint, not your local `/auth` route.

## 4) Supabase — enable Google provider

1. In Supabase Dashboard → **Authentication → Sign In / Providers** → **Google** → click to configure.
2. Paste the **Client ID** and **Client Secret** from Google Cloud into Supabase.
3. Save and enable the provider.

## 5) Trigger a Netlify deploy and test

1. On Netlify, trigger a deploy (Deploys → Trigger deploy → Deploy site).
2. After deploy completes, open your site at `https://<your-netlify-domain>` and click **Continue with Google** on the auth page.

Expected flow:
- Browser goes to Google consent screen → Google redirects to Supabase callback (`/auth/v1/callback`) → Supabase creates session and redirects back to your app (your Netlify origin).

## Local build & preview commands

Run these locally to verify the build before pushing to Netlify:

```bash
cd c:\Users\varap\TEST\focusmeeting
npm run build
npm run preview
```

If `npm run preview` is not defined in your package.json, use `vite preview` or inspect `.output/public` directly.

## Troubleshooting

- If you see `Unsupported provider: missing OAuth secret` from Supabase, verify the Client ID and Client Secret are pasted in Supabase and that Google credentials are enabled.
- If Google rejects the redirect, confirm the exact Netlify origin (`https://...`) is in **Authorized JavaScript origins** and the Supabase callback URI is listed in **Authorized redirect URIs**.
- If the app renders but login doesn't persist, confirm the environment variables were set on Netlify and redeploy.

## Files to inspect in this repo

- `netlify.toml` — Netlify publish/functions config (already added)
- `src/routes/auth.tsx` — client auth flows and `redirectTo` values
- `src/integrations/supabase/client.ts` — client creation and env var usage
- `.env` — local copy of publishable key (do not commit secrets)

---

If you want, I can also:
- produce the exact Netlify UI copy-paste checklist as a single clipboard block, or
- walk you through the Netlify UI step-by-step interactively.

Happy to continue — tell me which option you prefer.
