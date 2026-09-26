-- Disposable-only behavioral proof. The inner subtransaction always rolls back.
DO $book_identity$
DECLARE
  prefix text := 'Replay ' || gen_random_uuid()::text;
  original_id uuid;
  new_id uuid;
  signature regprocedure := 'public.insert_generated_content(text,public.content_type,text,text,public.content_status,jsonb,jsonb,text)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', signature, 'EXECUTE')
     OR has_function_privilege('authenticated', signature, 'EXECUTE')
     OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected generated-content RPC grants';
  END IF;
  IF to_regprocedure('public.insert_generated_content(text,public.content_type,text,text,public.content_status,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous legacy overload remains';
  END IF;
  BEGIN
    INSERT INTO public.content_item(title,type,author,isbn,status)
    VALUES(prefix || ' Café: First', 'book', 'Proof Author', '9780000000001', 'draft') RETURNING id INTO original_id;
    BEGIN
      INSERT INTO public.content_item(title,type,author,status)
      VALUES(prefix || ' Cafe — Second', 'book', 'Proof-Author', 'draft');
      RAISE EXCEPTION 'Canonical duplicate book was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.content_item(title,type,author,isbn,status)
      VALUES(prefix || ' ISBN duplicate', 'book', 'Different Author', '9780000000001', 'draft');
      RAISE EXCEPTION 'Duplicate active ISBN was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO public.content_item(title,type,isbn,status)
      VALUES(prefix || ' Invalid ISBN', 'book', 'bad', 'draft');
      RAISE EXCEPTION 'Invalid ISBN was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE public.content_item SET deleted_at = now() WHERE id = original_id;
    INSERT INTO public.content_item(title,type,author,isbn,status)
    VALUES(prefix || ' Cafe: Replacement', 'book', 'Proof Author', '9780000000001', 'draft');
    BEGIN
      UPDATE public.content_item SET deleted_at = NULL WHERE id = original_id;
      RAISE EXCEPTION 'Conflicting restoration was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    BEGIN
      PERFORM public.insert_generated_content(prefix || ' Denied', 'book');
      RAISE EXCEPTION 'Missing service-role claim was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'insert_generated_content requires service role' THEN RAISE; END IF;
    END;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.insert_generated_content(prefix || ' Browser denied', 'book');
      RAISE EXCEPTION 'Browser execution was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    EXECUTE 'SET LOCAL ROLE service_role';
    -- Existing seven-argument callers keep working via the new default argument.
    new_id := public.insert_generated_content(prefix || ' Legacy call', 'book', 'Legacy Author', NULL, 'draft', '{}'::jsonb, '[]'::jsonb);
    IF NOT EXISTS (SELECT 1 FROM public.content_item WHERE id=new_id AND isbn IS NULL) THEN
      RAISE EXCEPTION 'Legacy call did not retain NULL ISBN';
    END IF;
    new_id := public.insert_generated_content(prefix || ' ISBN call', 'book', 'ISBN Author', NULL, 'draft', '{}'::jsonb, '[{"title":"Fixture","content":"Synthetic passage"}]'::jsonb, '9780000000002');
    IF NOT EXISTS (SELECT 1 FROM public.content_item WHERE id=new_id AND isbn='9780000000002')
       OR NOT EXISTS (SELECT 1 FROM public.segment WHERE item_id=new_id AND markdown_body='Synthetic passage') THEN
      RAISE EXCEPTION 'ISBN call or segment assembly failed';
    END IF;
    EXECUTE 'RESET ROLE';
    RAISE SQLSTATE 'ZB001' USING MESSAGE = 'Rollback successful fixtures';
  EXCEPTION WHEN SQLSTATE 'ZB001' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.content_item WHERE title LIKE prefix || '%') THEN
    RAISE EXCEPTION 'Fixture cleanup failed';
  END IF;
  RAISE NOTICE 'Book identity, ISBN, RPC compatibility, authorization and cleanup checks passed';
END;
$book_identity$;
