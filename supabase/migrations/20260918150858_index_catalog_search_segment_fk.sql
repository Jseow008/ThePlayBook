-- Support segment foreign-key cascade lookups without scanning the full
-- catalog search projection for each deleted segment.
CREATE INDEX catalog_search_document_segment_idx
    ON public.catalog_search_document (segment_id);
