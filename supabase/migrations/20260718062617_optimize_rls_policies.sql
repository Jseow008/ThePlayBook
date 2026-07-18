-- DB-103: make the live RLS contract explicit, least-privilege, and
-- init-plan friendly without changing which application users may access rows.
--
-- Recovery: this migration changes catalog policy definitions only and does not
-- rewrite table data. If verification fails, restore the 48 pre-migration policy
-- definitions captured in the DB-103 production audit before retrying.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $preflight$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'service_role'
          AND rolbypassrls
    ) THEN
        RAISE EXCEPTION
            'DB-103 requires service_role to retain BYPASSRLS before redundant service policies are removed';
    END IF;

    IF (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
    ) <> 48 THEN
        RAISE EXCEPTION
            'DB-103 expected exactly 48 public policies before reconciliation';
    END IF;
END;
$preflight$;

-- service_role bypasses RLS in both hosted and local Supabase. Keeping separate
-- allow-all policies adds no protection and was responsible for all 27
-- multiple-permissive-policy findings in production.
DROP POLICY "Service role has full access to artifact" ON public.artifact;
DROP POLICY "Service role has full access to content_item" ON public.content_item;
DROP POLICY "Service role has full access to content_series" ON public.content_series;
DROP POLICY "Service role has full access to email subscriptions" ON public.email_subscription;
DROP POLICY "Service role has full access to profiles" ON public.profiles;
DROP POLICY "Service role has full access to segment" ON public.segment;
DROP POLICY "Service role has full access to content request notifications"
    ON public.content_request_notifications;
DROP POLICY "Service role has full access to request votes"
    ON public.content_request_votes;
DROP POLICY "Service role has full access to content requests"
    ON public.content_requests;
DROP POLICY "Service role has full access to notification preferences"
    ON public.user_notification_preferences;

-- Keep service-only tables explicitly policy-covered. With no allow policy,
-- anon/authenticated would still be denied, but named deny policies document the
-- boundary and prevent rls_enabled_no_policy advisor findings.
CREATE POLICY "Service-only email subscriptions: deny public access"
    ON public.email_subscription
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "Service-only request notifications: deny public access"
    ON public.content_request_notifications
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- Public content remains readable by signed-out and signed-in clients, while
-- avoiding the broader PostgreSQL PUBLIC pseudo-role.
ALTER POLICY "Public can read artifacts of verified content"
    ON public.artifact TO anon, authenticated;
ALTER POLICY "Public can read verified content"
    ON public.content_item TO anon, authenticated;
ALTER POLICY "Anyone can view visible content requests"
    ON public.content_requests TO anon, authenticated;
ALTER POLICY "Public can read content series"
    ON public.content_series TO anon, authenticated;
ALTER POLICY "Public read"
    ON public.homepage_section TO anon, authenticated;
ALTER POLICY "Public can read segments of verified content"
    ON public.segment TO anon, authenticated;

-- Evaluate the request identity once per statement and scope ownership policies
-- to authenticated sessions only.
ALTER POLICY "Users can read own AI usage"
    ON public.ai_message_usage
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can record own AI usage"
    ON public.ai_message_usage
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view their own feedback"
    ON public.content_feedback
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert their own feedback"
    ON public.content_feedback
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own feedback"
    ON public.content_feedback
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can delete their own feedback"
    ON public.content_feedback
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view own request votes"
    ON public.content_request_votes
    TO authenticated
    USING ((SELECT auth.uid()) = content_request_votes.user_id);

ALTER POLICY "Users can vote on visible requests"
    ON public.content_request_votes
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = content_request_votes.user_id
        AND EXISTS (
            SELECT 1
            FROM public.content_requests
            WHERE content_requests.id = content_request_votes.request_id
              AND content_requests.hidden_at IS NULL
              AND content_requests.status IN ('pending', 'processing')
        )
    );

ALTER POLICY "Users can remove own request votes"
    ON public.content_request_votes
    TO authenticated
    USING ((SELECT auth.uid()) = content_request_votes.user_id);

ALTER POLICY "Admin insert"
    ON public.homepage_section
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = 'admin'
        )
    );

ALTER POLICY "Admin update"
    ON public.homepage_section
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = 'admin'
        )
    );

ALTER POLICY "Admin delete"
    ON public.homepage_section
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role = 'admin'
        )
    );

ALTER POLICY "Users can view own profile"
    ON public.profiles
    TO authenticated
    USING ((SELECT auth.uid()) = id);

ALTER POLICY "Users can update own onboarding state"
    ON public.profiles
    TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "Users can view their own activity"
    ON public.reading_activity
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert their own activity"
    ON public.reading_activity
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own activity"
    ON public.reading_activity
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view their own highlights"
    ON public.user_highlights
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert their own highlights"
    ON public.user_highlights
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own highlights"
    ON public.user_highlights
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can delete their own highlights"
    ON public.user_highlights
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view their own library"
    ON public.user_library
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert into their own library"
    ON public.user_library
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update their own library"
    ON public.user_library
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can delete from their own library"
    ON public.user_library
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view own notification preferences"
    ON public.user_notification_preferences
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert own notification preferences"
    ON public.user_notification_preferences
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update own notification preferences"
    ON public.user_notification_preferences
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- The view is already unreadable by anon/authenticated. Security-invoker makes
-- that service-only boundary survive a future accidental SELECT grant.
ALTER VIEW public.admin_content_workbench_readiness
    SET (security_invoker = true);

DO $postcondition$
BEGIN
    IF (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
    ) <> 40 THEN
        RAISE EXCEPTION 'DB-103 expected exactly 40 public policies after reconciliation';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND ('public' = ANY (roles) OR 'service_role' = ANY (roles))
    ) THEN
        RAISE EXCEPTION 'DB-103 left a PUBLIC or service_role policy behind';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              COALESCE(qual, '') LIKE '%auth.role()%'
              OR COALESCE(with_check, '') LIKE '%auth.role()%'
          )
    ) THEN
        RAISE EXCEPTION 'DB-103 left deprecated auth.role() in a live policy';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND cmd = 'UPDATE'
          AND (qual IS NULL OR with_check IS NULL)
    ) THEN
        RAISE EXCEPTION 'DB-103 left an UPDATE policy without USING and WITH CHECK';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'admin_content_workbench_readiness'
          AND c.relkind = 'v'
          AND 'security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[]))
    ) THEN
        RAISE EXCEPTION 'DB-103 failed to set the admin readiness view to security_invoker';
    END IF;
END;
$postcondition$;

RESET statement_timeout;
RESET lock_timeout;
