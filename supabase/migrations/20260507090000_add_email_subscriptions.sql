-- Store explicit weekly newsletter subscription consent and lifecycle state.

do $$ begin
    create type public.email_subscription_status as enum ('subscribed', 'unsubscribed');
exception
    when duplicate_object then null;
end $$;

create table if not exists public.email_subscription (
    id uuid not null default gen_random_uuid(),
    email text not null,
    email_normalized text generated always as (lower(btrim(email))) stored,
    status public.email_subscription_status not null default 'subscribed',
    source text not null default 'unknown',
    page_path text null,
    referrer text null,
    user_agent text null,
    consent_text text not null,
    consent_version text not null,
    subscribed_at timestamptz not null default now(),
    unsubscribed_at timestamptz null,
    unsubscribe_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint email_subscription_pkey primary key (id),
    constraint email_subscription_email_normalized_unique unique (email_normalized),
    constraint email_subscription_unsubscribe_token_unique unique (unsubscribe_token),
    constraint email_subscription_email_length check (char_length(email_normalized) between 3 and 254),
    constraint email_subscription_email_shape check (email_normalized ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    constraint email_subscription_unsubscribe_state check (
        (status = 'subscribed' and unsubscribed_at is null)
        or (status = 'unsubscribed' and unsubscribed_at is not null)
    )
);

create index if not exists idx_email_subscription_created_at
    on public.email_subscription(created_at desc);

create index if not exists idx_email_subscription_status
    on public.email_subscription(status);

create index if not exists idx_email_subscription_source
    on public.email_subscription(source);

alter table public.email_subscription enable row level security;

drop policy if exists "Service role has full access to email subscriptions" on public.email_subscription;
create policy "Service role has full access to email subscriptions"
    on public.email_subscription for all
    to service_role
    using (true)
    with check (true);

do $$ begin
    if not exists (select 1 from pg_trigger where tgname = 'update_email_subscription_updated_at') then
        create trigger update_email_subscription_updated_at
            before update on public.email_subscription
            for each row
            execute function public.update_updated_at_column();
    end if;
end $$;
