-- Extension pairing: the web app's /connect-extension page mints a short-lived
-- code tied to the logged-in user; the extension exchanges it (POST
-- /api/extension/pair) for a long-lived bearer access token.

create table extension_pairing_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index extension_pairing_codes_user_idx on extension_pairing_codes(user_id);

-- Bearer tokens the extension stores in chrome.storage.local and sends as
-- `Authorization: Bearer <token>` on every request; apps/web/src/lib/auth.ts
-- checks this table first before falling back to treating the header as a
-- Supabase access token (so the same header path works for both clients).
create table extension_tokens (
  access_token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index extension_tokens_user_idx on extension_tokens(user_id);

alter table extension_pairing_codes enable row level security;
alter table extension_tokens enable row level security;

-- Both tables are only ever read/written via the service-role key in API
-- routes (pairing codes are minted/consumed server-side; tokens are minted
-- and checked server-side) — RLS enabled with zero policies denies all
-- anon/authenticated access by default, which is what we want here.
