-- Reproduce existing production behavior that predates recorded migrations.
-- No production history repair or content rewrite. The old seven-argument RPC
-- is replaced by the deployed eight-argument form; p_isbn defaults to NULL.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
ALTER TABLE public.content_item ADD COLUMN IF NOT EXISTS isbn text;
DO $isbn_constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.content_item'::regclass AND conname = 'content_item_isbn_format_check') THEN
    ALTER TABLE public.content_item ADD CONSTRAINT content_item_isbn_format_check CHECK (isbn IS NULL OR isbn ~ '^[0-9]{13}$'::text);
  END IF;
END;
$isbn_constraint$;

CREATE OR REPLACE FUNCTION public.normalize_book_identity_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select regexp_replace(lower(extensions.unaccent(coalesce(p_value, ''))), '[^a-z0-9]+', '', 'g'); $function$;

CREATE OR REPLACE FUNCTION public.canonical_book_base_title(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select public.normalize_book_identity_text(
    regexp_replace(
      coalesce(p_title, ''),
      '([[:space:]]*:[[:space:]]*|[[:space:]]+[–—][[:space:]]+).*$',
      ''
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_book()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_author text;
  v_title text;
  v_conflicting_id uuid;
begin
  if new.type <> 'book'::public.content_type or new.deleted_at is not null then
    return new;
  end if;

  v_author := public.normalize_book_identity_text(new.author);
  v_title := public.canonical_book_base_title(new.title);

  if v_author = '' or v_title = '' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_title || '|' || v_author, 0)
  );

  select item.id
    into v_conflicting_id
  from public.content_item as item
  where item.type = 'book'::public.content_type
    and item.deleted_at is null
    and item.id is distinct from new.id
    and public.canonical_book_base_title(item.title) = v_title
    and public.normalize_book_identity_text(item.author) = v_author
  limit 1;

  if v_conflicting_id is not null then
    raise exception using
      errcode = '23505',
      message = 'duplicate active book title and author',
      detail = 'Existing content_item id: ' || v_conflicting_id::text,
      constraint = 'content_item_active_book_identity_guard';
  end if;

  return new;
end;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_item_active_book_isbn_unique
ON public.content_item USING btree (isbn)
WHERE type = 'book'::public.content_type AND isbn IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS prevent_duplicate_active_book_trigger ON public.content_item;
CREATE TRIGGER prevent_duplicate_active_book_trigger
BEFORE INSERT OR UPDATE OF title, author, type, deleted_at ON public.content_item
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_book();

DROP FUNCTION IF EXISTS public.insert_generated_content(text, public.content_type, text, text, public.content_status, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.insert_generated_content(p_title text, p_type content_type, p_author text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_status content_status DEFAULT 'draft'::content_status, p_quick_mode_json jsonb DEFAULT '{}'::jsonb, p_segments jsonb DEFAULT '[]'::jsonb, p_isbn text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_content_id uuid;
  v_segment jsonb;
  v_index integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'insert_generated_content requires service role';
  end if;

  insert into public.content_item (
    title,
    type,
    author,
    isbn,
    category,
    status,
    quick_mode_json
  )
  values (
    p_title,
    p_type,
    p_author,
    p_isbn,
    p_category,
    p_status,
    p_quick_mode_json
  )
  returning id into v_content_id;

  for v_segment in
    select value from jsonb_array_elements(p_segments)
  loop
    insert into public.segment (item_id, order_index, title, markdown_body)
    values (
      v_content_id,
      v_index,
      v_segment ->> 'title',
      v_segment ->> 'content'
    );
    v_index := v_index + 1;
  end loop;

  return v_content_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.normalize_book_identity_text(text), public.canonical_book_base_title(text),
  public.prevent_duplicate_active_book(),
  public.insert_generated_content(text, public.content_type, text, text, public.content_status, jsonb, jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_book_identity_text(text), public.canonical_book_base_title(text),
  public.prevent_duplicate_active_book(),
  public.insert_generated_content(text, public.content_type, text, text, public.content_status, jsonb, jsonb, text)
TO service_role;

-- Explicitly preserve the existing production server-role grants. Browser grants
-- stay unchanged; restricted snapshot-worker connections remain mandatory.
GRANT ALL ON TABLE public.account_library_state, public.user_reflections TO service_role;
GRANT UPDATE ON SEQUENCE public.story_image_job_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION
  public.catalog_search_plain_text(text),
  public.prevent_overlapping_user_highlights(),
  public.refresh_catalog_search_documents(uuid),
  public.refresh_catalog_search_documents_from_content(),
  public.refresh_catalog_search_documents_from_segment(),
  public.search_catalog(text, text[], public.content_type, numeric, uuid, numeric, uuid, integer),
  public.search_user_highlights(text, uuid, text, text, text, timestamptz, uuid, integer),
  public.set_content_item_published_at()
TO service_role;
