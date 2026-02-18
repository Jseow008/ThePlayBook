-- Atomic increment helper for reading activity logs
-- Prevents lost updates under concurrent writes.

create or replace function public.increment_reading_activity(
    p_activity_date date,
    p_duration_seconds integer
)
returns void
language plpgsql
security invoker
as $$
declare
    v_user_id uuid;
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
end;
$$;

grant execute on function public.increment_reading_activity(date, integer) to authenticated;
