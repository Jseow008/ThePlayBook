-- Add content-level reading analytics without replacing per-user daily activity.

create table if not exists public.content_reading_activity (
    id uuid not null default gen_random_uuid(),
    content_id uuid not null references public.content_item(id) on delete cascade,
    activity_date date not null default current_date,
    duration_seconds integer not null default 0,
    reader_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint content_reading_activity_pkey primary key (id),
    constraint content_reading_activity_content_date_unique unique (content_id, activity_date)
);

create index if not exists idx_content_reading_activity_activity_date
    on public.content_reading_activity(activity_date);

create index if not exists idx_content_reading_activity_content_date
    on public.content_reading_activity(content_id, activity_date);

create table if not exists public.content_reader_daily (
    id uuid not null default gen_random_uuid(),
    content_id uuid not null references public.content_item(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    activity_date date not null default current_date,
    created_at timestamptz not null default now(),

    constraint content_reader_daily_pkey primary key (id),
    constraint content_reader_daily_content_user_date_unique unique (content_id, user_id, activity_date)
);

create index if not exists idx_content_reader_daily_activity_date
    on public.content_reader_daily(activity_date);

create index if not exists idx_content_reader_daily_content_date
    on public.content_reader_daily(content_id, activity_date);

alter table public.content_reading_activity enable row level security;
alter table public.content_reader_daily enable row level security;

create or replace function public.log_reading_activity(
    p_activity_date date,
    p_duration_seconds integer,
    p_content_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_user_id uuid;
    v_reader_inserted integer;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Unauthorized';
    end if;

    if p_duration_seconds is null or p_duration_seconds <= 0 then
        raise exception 'duration_seconds must be greater than 0';
    end if;

    insert into public.reading_activity (user_id, activity_date, duration_seconds)
    values (v_user_id, p_activity_date, p_duration_seconds)
    on conflict (user_id, activity_date)
    do update set
        duration_seconds = public.reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    if p_content_id is null then
        return;
    end if;

    insert into public.content_reading_activity (content_id, activity_date, duration_seconds, reader_count)
    values (p_content_id, p_activity_date, p_duration_seconds, 0)
    on conflict (content_id, activity_date)
    do update set
        duration_seconds = public.content_reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    insert into public.content_reader_daily (content_id, user_id, activity_date)
    values (p_content_id, v_user_id, p_activity_date)
    on conflict (content_id, user_id, activity_date) do nothing;

    get diagnostics v_reader_inserted = row_count;

    if v_reader_inserted > 0 then
        update public.content_reading_activity
        set
            reader_count = reader_count + 1,
            updated_at = now()
        where content_id = p_content_id
          and activity_date = p_activity_date;
    end if;
end;
$$;

revoke execute on function public.log_reading_activity(date, integer, uuid)
from public, anon;
grant execute on function public.log_reading_activity(date, integer, uuid)
to authenticated, service_role;
