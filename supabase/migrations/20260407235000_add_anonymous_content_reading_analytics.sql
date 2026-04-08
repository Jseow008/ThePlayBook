-- Allow anonymous public readers to contribute to content-level analytics.

create table if not exists public.content_reader_visitor_daily (
    id uuid not null default gen_random_uuid(),
    content_id uuid not null references public.content_item(id) on delete cascade,
    visitor_id text not null,
    activity_date date not null default current_date,
    created_at timestamptz not null default now(),

    constraint content_reader_visitor_daily_pkey primary key (id),
    constraint content_reader_visitor_daily_content_visitor_date_unique unique (content_id, visitor_id, activity_date)
);

create index if not exists idx_content_reader_visitor_daily_activity_date
    on public.content_reader_visitor_daily(activity_date);

create index if not exists idx_content_reader_visitor_daily_content_date
    on public.content_reader_visitor_daily(content_id, activity_date);

alter table public.content_reader_visitor_daily enable row level security;

create or replace function public.log_anonymous_reading_activity(
    p_activity_date date,
    p_duration_seconds integer,
    p_content_id uuid,
    p_visitor_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_reader_inserted integer;
begin
    if p_content_id is null then
        raise exception 'content_id is required';
    end if;

    if p_visitor_id is null or length(trim(p_visitor_id)) = 0 then
        raise exception 'visitor_id is required';
    end if;

    if p_duration_seconds is null or p_duration_seconds <= 0 then
        raise exception 'duration_seconds must be greater than 0';
    end if;

    insert into public.content_reading_activity (content_id, activity_date, duration_seconds, reader_count)
    values (p_content_id, p_activity_date, p_duration_seconds, 0)
    on conflict (content_id, activity_date)
    do update set
        duration_seconds = public.content_reading_activity.duration_seconds + excluded.duration_seconds,
        updated_at = now();

    insert into public.content_reader_visitor_daily (content_id, visitor_id, activity_date)
    values (p_content_id, p_visitor_id, p_activity_date)
    on conflict (content_id, visitor_id, activity_date) do nothing;

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

revoke execute on function public.log_anonymous_reading_activity(date, integer, uuid, text)
from public;

grant execute on function public.log_anonymous_reading_activity(date, integer, uuid, text)
to anon, authenticated, service_role;
