create table if not exists public.ai_message_usage (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    feature text not null check (char_length(feature) between 1 and 80),
    created_at timestamptz not null default now()
);

create index if not exists ai_message_usage_user_created_at_idx
    on public.ai_message_usage (user_id, created_at desc);

create index if not exists ai_message_usage_feature_created_at_idx
    on public.ai_message_usage (feature, created_at desc);

alter table public.ai_message_usage enable row level security;

drop policy if exists "Users can read own AI usage" on public.ai_message_usage;
create policy "Users can read own AI usage"
    on public.ai_message_usage
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "Users can record own AI usage" on public.ai_message_usage;
create policy "Users can record own AI usage"
    on public.ai_message_usage
    for insert
    to authenticated
    with check (auth.uid() = user_id);
