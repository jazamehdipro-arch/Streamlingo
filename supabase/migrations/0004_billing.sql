-- Monétisation : plan par profil + compteur d'usage mensuel.
-- Le quota ne compte que les analyses LLM fraîches (les rejeux depuis le
-- cache ne coûtent rien et ne consomment donc rien).

alter table profiles add column plan text not null default 'free' check (plan in ('free', 'pro'));
alter table profiles add column stripe_customer_id text;
alter table profiles add column stripe_subscription_id text;
alter table profiles add column plan_expires_at timestamptz;

create table usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  analyzed_seconds numeric not null default 0,
  primary key (user_id, month)
);

alter table usage_monthly enable row level security;
-- Écrit uniquement par la clé service (API routes) ; lecture par l'utilisateur.
create policy "own usage" on usage_monthly for select using (auth.uid() = user_id);
