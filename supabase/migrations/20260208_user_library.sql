create table if not exists public.user_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.content_item(id) on delete cascade,
  is_bookmarked boolean default false,
  progress jsonb default '{}'::jsonb,
  last_interacted_at timestamptz default now(),
  primary key (user_id, content_id)
);

-- Enable RLS
alter table public.user_library enable row level security;

-- Policies
DROP POLICY IF EXISTS "Users can view their own library" on public.user_library;
create policy "Users can view their own library"
on public.user_library for select
to authenticated
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert into their own library" on public.user_library;
create policy "Users can insert into their own library"
on public.user_library for insert
to authenticated
with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own library" on public.user_library;
create policy "Users can update their own library"
on public.user_library for update
to authenticated
using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete from their own library" on public.user_library;
create policy "Users can delete from their own library"
on public.user_library for delete
to authenticated
using (auth.uid() = user_id);
