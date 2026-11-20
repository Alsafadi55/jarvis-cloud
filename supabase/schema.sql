-- JARVIS Cloud database baseline
-- Snapshot of the existing Supabase schema, reconstructed from live catalog inspection.
-- Apply only to a NEW/empty project. This is not a migration to run against the existing project.
-- Existing project ref: sxparozeejuyjiuqpbqq

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_id_key unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint messages_conversation_user_fk
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id) on delete cascade
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null default 'general',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_provider text check (preferred_provider in ('openai', 'gemini', 'anthropic')),
  preferred_model text,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index messages_user_created_idx
  on public.messages (user_id, created_at desc);
-- Covers the composite foreign key (conversation_id, user_id).
create index messages_conversation_user_idx
  on public.messages (conversation_id, user_id);
create index memories_user_active_created_idx
  on public.memories (user_id, is_active, created_at desc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.user_settings enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

create policy conversations_select_own on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy conversations_insert_own on public.conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy conversations_update_own on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy conversations_delete_own on public.conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy messages_select_own on public.messages
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
create policy messages_update_own on public.messages
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
create policy messages_delete_own on public.messages
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy memories_select_own on public.memories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy memories_insert_own on public.memories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy memories_update_own on public.memories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy memories_delete_own on public.memories
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_settings_select_own on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_settings_delete_own on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Public/anonymous users receive no table access.
revoke all on table
  public.profiles,
  public.conversations,
  public.messages,
  public.memories,
  public.user_settings
from anon;

-- Signed-in users can access rows only through the ownership policies above.
grant select, insert, update, delete on table
  public.profiles,
  public.conversations,
  public.messages,
  public.memories,
  public.user_settings
to authenticated;

-- Server-side service role access; never expose its key to a client.
grant all on table
  public.profiles,
  public.conversations,
  public.messages,
  public.memories,
  public.user_settings
to service_role;
