-- Durable, versioned generation queue for public story share images.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE public.story_image_job (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content_id uuid NOT NULL REFERENCES public.content_item(id) ON DELETE CASCADE,
    render_version text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts smallint NOT NULL DEFAULT 0,
    max_attempts smallint NOT NULL DEFAULT 3,
    storage_path text,
    error text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT story_image_job_content_version_key UNIQUE (content_id, render_version),
    CONSTRAINT story_image_job_render_version_check CHECK (render_version ~ '^[a-f0-9]{24}$'),
    CONSTRAINT story_image_job_status_check CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'superseded')
    ),
    CONSTRAINT story_image_job_attempts_check CHECK (
        attempts >= 0 AND max_attempts BETWEEN 1 AND 10 AND attempts <= max_attempts
    ),
    CONSTRAINT story_image_job_storage_path_check CHECK (
        storage_path IS NULL
        OR storage_path ~ '^story-images/[0-9a-f-]{36}/[a-f0-9]{24}\.jpg$'
    )
);

CREATE INDEX story_image_job_content_id_idx
    ON public.story_image_job (content_id);

CREATE INDEX story_image_job_ready_queue_idx
    ON public.story_image_job (next_attempt_at, requested_at)
    WHERE status IN ('pending', 'failed');

CREATE INDEX story_image_job_stale_processing_idx
    ON public.story_image_job (started_at)
    WHERE status = 'processing';

ALTER TABLE public.story_image_job ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.story_image_job FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.story_image_job_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.story_image_job TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.story_image_job_id_seq TO service_role;

COMMENT ON TABLE public.story_image_job IS
    'Server-only durable queue and manifest for immutable story share image generations.';
COMMENT ON COLUMN public.story_image_job.render_version IS
    'SHA-256-derived version of image-affecting content fields and the story template version.';
