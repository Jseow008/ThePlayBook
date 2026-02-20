create table if not exists public.content_feedback (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    content_id uuid not null references public.content_item(id) on delete cascade,
    is_positive boolean not null,
    reason text,
    details text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.content_feedback add constraint content_feedback_user_content_key unique (user_id, content_id);

alter table public.content_feedback enable row level security;

create policy "Users can view their own feedback"
    on public.content_feedback for select
    using (auth.uid() = user_id);

create policy "Users can insert their own feedback"
    on public.content_feedback for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own feedback"
    on public.content_feedback for update
    using (auth.uid() = user_id);

create policy "Users can delete their own feedback"
    on public.content_feedback for delete
    using (auth.uid() = user_id);
