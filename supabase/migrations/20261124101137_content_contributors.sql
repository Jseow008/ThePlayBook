begin;

create table public.content_contributor (
    id uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references public.content_item(id) on delete cascade,
    name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
    role text not null check (role in ('author', 'host', 'guest', 'interviewer', 'interviewee', 'moderator', 'contributor')),
    position integer not null check (position > 0),
    is_default_speaker boolean not null default false,
    unique (content_item_id, position)
);

create unique index content_contributor_one_default_speaker
    on public.content_contributor (content_item_id) where is_default_speaker;

comment on table public.content_contributor is
    'Editorial credits for a source. An optional single contributor is designated for first-person chat.';

alter table public.content_contributor enable row level security;
revoke all on table public.content_contributor from public, anon, authenticated, service_role;
grant select on table public.content_contributor to anon, authenticated;
grant select, insert, update, delete on table public.content_contributor to service_role;

create policy content_contributor_published_read on public.content_contributor
    for select to anon, authenticated using (
        exists (
            select 1 from public.content_item c
            where c.id = content_item_id and c.status = 'verified' and c.deleted_at is null
        )
    );

create function public.replace_content_contributors(p_content_id uuid, p_contributors jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
    if jsonb_typeof(p_contributors) is distinct from 'array' then
        raise exception 'Expected a contributor list' using errcode = '22023';
    end if;
    if jsonb_array_length(p_contributors) > 100 then
        raise exception 'Contributor list is too long' using errcode = '22023';
    end if;
    perform 1 from public.content_item
        where id = p_content_id and deleted_at is null for update;
    if not found then
        raise exception 'Content item unavailable' using errcode = 'P0002';
    end if;

    delete from public.content_contributor where content_item_id = p_content_id;
    insert into public.content_contributor (content_item_id, name, role, position, is_default_speaker)
    select p_content_id, item->>'name', item->>'role', ordinal::integer,
        coalesce((item->>'is_default_speaker')::boolean, false)
    from jsonb_array_elements(p_contributors) with ordinality as rows(item, ordinal);
end;
$$;

revoke all on function public.replace_content_contributors(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.replace_content_contributors(uuid, jsonb) to service_role;

-- An updated edition gets independently editable credits before publication.
create function private.copy_content_version_contributors()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    insert into public.content_contributor (content_item_id, name, role, position, is_default_speaker)
    select new.id, name, role, position, is_default_speaker
    from public.content_contributor where content_item_id = new.update_source_id;
    return new;
end;
$$;

revoke all on function private.copy_content_version_contributors() from public, anon, authenticated;
grant execute on function private.copy_content_version_contributors() to service_role;

create trigger copy_content_version_contributors
after insert on public.content_item for each row when (new.update_source_id is not null)
execute function private.copy_content_version_contributors();

-- This known interview summary attributes its positions to White.
insert into public.content_contributor (content_item_id, name, role, position, is_default_speaker)
select c.id, credits.name, credits.role, credits.position, credits.is_default_speaker
from public.content_item c
cross join (values ('Steven Bartlett', 'host', 1, false), ('Dana White', 'guest', 2, true))
    as credits(name, role, position, is_default_speaker)
where c.id = '00e8bb55-845a-4c15-b17f-deb0d698e6f5'::uuid
    and c.title = 'Brutal Realities of Building Iconic Businesses'
    and c.author = 'Steven Bartlett with Dana White'
    and c.deleted_at is null;

commit;
