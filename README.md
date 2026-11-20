# JARVIS Cloud

A cross-device personal AI workspace powered by Supabase.

## Repository layout

- `web/` — Vite web app (sign-in, account creation, conversation UI).
- `supabase/functions/chat/` — authenticated chat Edge Function.
- `supabase/schema.sql` — database schema snapshot.
- `docs/` — architecture and backend notes.

## Run the web app locally

1. Install Node.js 20.19+ or 22.12+.
2. Open a terminal in `web/`.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local`.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project URL and publishable/anon key.
6. Run `npm run dev`.

Only the Supabase publishable (or legacy anon) key belongs in the browser. Never use a Supabase secret or service-role key here.

## Deploy to Vercel

- Import this GitHub repository into Vercel.
- Set the Root Directory to `web`.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables for the required environments.
- Deploy.

## Current limitations

The web app supports Supabase authentication and conversation creation. The chat Edge Function currently validates the signed-in user and request, but intentionally returns `provider_not_configured` until an AI provider adapter and secure server-side credentials are added. Message persistence is not yet implemented.

See [docs/BACKEND.md](docs/BACKEND.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
