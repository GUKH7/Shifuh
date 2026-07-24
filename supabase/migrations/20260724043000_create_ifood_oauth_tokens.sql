create table if not exists public.ifood_oauth_tokens (
  environment text primary key,
  access_token_encrypted text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ifood_oauth_tokens enable row level security;

comment on table public.ifood_oauth_tokens is
  'Tokens OAuth oficiais do iFood criptografados no servidor e separados por ambiente.';

revoke all on table public.ifood_oauth_tokens from anon, authenticated;
