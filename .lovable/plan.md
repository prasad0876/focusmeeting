## Fix Google sign-in

The error `Unsupported provider: missing OAuth secret` means the Google auth provider is not enabled on the backend. Lovable Cloud offers a managed Google OAuth — no credentials needed from you.

### Steps
1. Enable managed Google OAuth via `configure_social_auth` with `providers: ["google"]` (keeping email/password enabled).
2. Verify the sign-in flow uses `lovable.auth.signInWithOAuth("google", ...)` with `redirect_uri: window.location.origin` (public route, not `/dashboard`).
3. Ask you to retry Google sign-in.

No code changes are expected unless the current auth page still calls `supabase.auth.signInWithOAuth` directly — in that case I'll switch it to the Lovable managed helper.