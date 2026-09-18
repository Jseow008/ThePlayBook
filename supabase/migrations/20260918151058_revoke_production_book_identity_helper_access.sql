-- These legacy production helpers are used by the service-role publishing
-- path, but are absent from clean migration replay. Remove only browser and
-- PUBLIC execution; preserve their definitions and explicit service_role grant.
DO $book_identity_helper_acl$
BEGIN
    IF pg_catalog.to_regprocedure('public.canonical_book_base_title(text)') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.canonical_book_base_title(text) FROM PUBLIC, anon, authenticated';
    END IF;

    IF pg_catalog.to_regprocedure('public.normalize_book_identity_text(text)') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.normalize_book_identity_text(text) FROM PUBLIC, anon, authenticated';
    END IF;
END;
$book_identity_helper_acl$;
