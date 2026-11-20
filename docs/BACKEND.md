# JARVIS Cloud backend

## Current state

- Supabase project: `jarvis-cloud`
- Database: five public tables protected by Row Level Security.
- Edge Function: `chat` authenticates the caller and validates the request.
- AI generation is not enabled yet. The function returns `503 provider_not_configured` until a server-side provider is configured.

## Chat endpoint

`POST /functions/v1/chat`

Headers:
- `Authorization: Bearer <Supabase user access token>`
- `Content-Type: application/json`

Body:
```json
{
  "message": "Hello JARVIS",
  "conversation_id": null
}
```

The function verifies the access token with Supabase Auth. If a conversation ID is supplied, it checks access through a user-scoped Supabase client and the database RLS policies. It does not use the service-role/secret key.

## Security

- Keep provider API keys in Supabase Edge Function secrets only.
- Never put provider keys, Supabase secret keys, or service-role keys in GitHub, Android, or browser code.
- Keep JWT verification enabled at the Edge Function gateway.
- All database reads use the caller's JWT and therefore remain subject to RLS.
- Add explicit rate limiting and provider spend controls before enabling paid inference.

## Next implementation steps

1. Add server-side provider adapters and secret management.
2. Persist user and assistant messages with idempotency and failure handling.
3. Add per-user rate limits and usage accounting.
4. Add client integration after backend tests pass.
