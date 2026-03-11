-- Flag internal/test accounts so product analytics can exclude them.

alter table public.profiles
    add column if not exists is_internal boolean not null default false;

create index if not exists idx_profiles_is_internal
    on public.profiles(is_internal);

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
    v_is_internal boolean;
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

    select coalesce(is_internal, false)
    into v_is_internal
    from public.profiles
    where id = v_user_id;

    if coalesce(v_is_internal, false) then
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
