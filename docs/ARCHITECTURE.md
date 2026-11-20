# JARVIS Cloud Architecture

JARVIS Cloud is a cross-device personal AI assistant.

## Components

- **Cloud backend:** Supabase Auth, Postgres, and Edge Functions.
- **Web hosting:** Vercel.
- **Android client:** Flutter.
- **Windows agent:** Python, with explicit approval for sensitive actions.
- **AI providers:** OpenAI, Gemini, and Anthropic through a server-side provider router.

## Security principles

- Keep provider API keys out of source control and client applications.
- Enforce per-user data isolation with PostgreSQL Row Level Security.
- Never expose Supabase service-role or secret keys to clients.
- Require confirmation before sensitive Windows-agent actions.
- Treat the Windows agent as offline whenever its PC is off or disconnected.

## Cost model

Hosting may have free tiers, but AI inference can incur separate provider charges. Users supply their own provider credentials (BYOK).
