-- Create reading_activity table
create table if not exists reading_activity (
    id uuid not null default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    activity_date date not null default current_date,
    duration_seconds integer not null default 0,
    pages_read integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    
    constraint reading_activity_pkey primary key (id),
    constraint reading_activity_user_date_unique unique (user_id, activity_date)
);

-- RLS Policies
alter table reading_activity enable row level security;

create policy "Users can view their own activity"
    on reading_activity for select
    using (auth.uid() = user_id);

create policy "Users can insert their own activity"
    on reading_activity for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own activity"
    on reading_activity for update
    using (auth.uid() = user_id);
