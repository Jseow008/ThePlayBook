export const GEMINI_SEGMENT_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_SEGMENT_EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_SEGMENT_SYNC_BATCH_SIZE = 50;
export const MAX_SEGMENT_SYNC_BATCH_SIZE = 50;
export const LOCAL_SEGMENT_SYNC_COMMAND = "npm run embeddings:sync-segments";
export const LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND = "npm run embeddings:sync-segments -- --dry-run";

export type CoverageSummary = {
    total_library_content_items: number;
    embedded_content_items: number;
    missing_segments: number;
    estimated_remaining_characters: number;
};

export type MissingSegmentRow = {
    id: string;
    content_item_id: string;
    markdown_body: string | null;
};

export type PreparedSegment = {
    id: string;
    content_item_id: string;
    text: string;
    characterCount: number;
};

export type SegmentSyncProgress = {
    processedSegments: number;
    processedCharacters: number;
    success: number;
    failed: number;
    batchRequests: number;
};

type RpcResult<T> = Promise<{ data: T | null; error: unknown }>;

export type SegmentSyncSupabaseClient = {
    rpc: (fn: string, args?: Record<string, unknown>) => RpcResult<unknown>;
    from: (table: "segment_embedding_gemini") => {
        upsert: (
            values: Array<{
                segment_id: string;
                content_item_id: string;
                embedding: number[];
            }>,
            options?: { onConflict?: string }
        ) => Promise<{ error: unknown }>;
    };
};

export type RunGeminiSegmentBackfillOptions = {
    supabase: SegmentSyncSupabaseClient;
    embedBatch: (contents: string[]) => Promise<Array<number[] | undefined>>;
    batchSize?: number;
    maxSegments?: number;
};

export class SegmentEmbeddingSyncError extends Error {
    progress: SegmentSyncProgress;

    constructor(message: string, progress: SegmentSyncProgress, options?: { cause?: unknown }) {
        super(message);
        this.name = "SegmentEmbeddingSyncError";
        this.progress = progress;

        if (options?.cause !== undefined) {
            (this as Error & { cause?: unknown }).cause = options.cause;
        }
    }
}

function toErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === "string" && error.trim()) {
        return error;
    }

    return fallback;
}

export function clampSegmentSyncBatchSize(batchSize?: number) {
    if (!Number.isFinite(batchSize) || !batchSize || batchSize < 1) {
        return DEFAULT_SEGMENT_SYNC_BATCH_SIZE;
    }

    return Math.min(Math.floor(batchSize), MAX_SEGMENT_SYNC_BATCH_SIZE);
}

export function normalizeMaxSegments(maxSegments?: number) {
    if (!Number.isFinite(maxSegments) || !maxSegments || maxSegments < 1) {
        return null;
    }

    return Math.floor(maxSegments);
}

export function prepareSegments(rows: MissingSegmentRow[]) {
    return rows
        .map((row) => {
            const text = row.markdown_body?.trim() ?? "";

            return {
                id: row.id,
                content_item_id: row.content_item_id,
                text,
                characterCount: text.length,
            };
        })
        .filter((segment): segment is PreparedSegment => segment.characterCount > 0);
}

export async function getGeminiSegmentCoverage(supabase: Pick<SegmentSyncSupabaseClient, "rpc">): Promise<CoverageSummary> {
    const { data, error } = await supabase.rpc("get_gemini_segment_embedding_coverage");

    if (error) {
        throw new Error(toErrorMessage(error, "Failed to load Gemini segment embedding coverage"));
    }

    const row = Array.isArray(data) ? data[0] : data;

    return {
        total_library_content_items: Number((row as CoverageSummary | undefined)?.total_library_content_items ?? 0),
        embedded_content_items: Number((row as CoverageSummary | undefined)?.embedded_content_items ?? 0),
        missing_segments: Number((row as CoverageSummary | undefined)?.missing_segments ?? 0),
        estimated_remaining_characters: Number((row as CoverageSummary | undefined)?.estimated_remaining_characters ?? 0),
    };
}

export async function fetchMissingGeminiSegments(
    supabase: Pick<SegmentSyncSupabaseClient, "rpc">,
    limit: number
) {
    const { data, error } = await supabase.rpc("get_segments_missing_gemini_embeddings", {
        p_limit: clampSegmentSyncBatchSize(limit),
    });

    if (error) {
        throw new Error(toErrorMessage(error, "Failed to load segments missing Gemini embeddings"));
    }

    return prepareSegments(((data as MissingSegmentRow[] | null) ?? []));
}

function validateEmbeddingBatch(
    embeddings: Array<number[] | undefined>,
    expectedCount: number,
    progress: SegmentSyncProgress
) {
    if (embeddings.length !== expectedCount) {
        const nextProgress = {
            ...progress,
            processedSegments: progress.processedSegments + expectedCount,
            failed: progress.failed + expectedCount,
            batchRequests: progress.batchRequests + 1,
        };

        throw new SegmentEmbeddingSyncError(
            `Expected ${expectedCount} embeddings but received ${embeddings.length}`,
            nextProgress
        );
    }

    embeddings.forEach((embedding, index) => {
        if (!embedding || embedding.length !== GEMINI_SEGMENT_EMBEDDING_DIMENSIONS) {
            const nextProgress = {
                ...progress,
                processedSegments: progress.processedSegments + expectedCount,
                failed: progress.failed + expectedCount,
                batchRequests: progress.batchRequests + 1,
            };

            throw new SegmentEmbeddingSyncError(
                `Invalid embedding at index ${index}; expected ${GEMINI_SEGMENT_EMBEDDING_DIMENSIONS} dimensions`,
                nextProgress
            );
        }
    });
}

export async function upsertGeminiSegmentEmbeddings(
    supabase: SegmentSyncSupabaseClient,
    segments: PreparedSegment[],
    embeddings: Array<number[] | undefined>,
    progress: SegmentSyncProgress
) {
    validateEmbeddingBatch(embeddings, segments.length, progress);

    const rows = segments.map((segment, index) => ({
        segment_id: segment.id,
        content_item_id: segment.content_item_id,
        embedding: embeddings[index] as number[],
    }));

    const { error } = await supabase
        .from("segment_embedding_gemini")
        .upsert(rows, { onConflict: "segment_id" });

    if (error) {
        const nextProgress = {
            ...progress,
            processedSegments: progress.processedSegments + segments.length,
            failed: progress.failed + segments.length,
            batchRequests: progress.batchRequests + 1,
        };

        throw new SegmentEmbeddingSyncError(
            toErrorMessage(error, "Failed to upsert Gemini segment embeddings"),
            nextProgress,
            { cause: error }
        );
    }
}

export async function runGeminiSegmentBackfill({
    supabase,
    embedBatch,
    batchSize,
    maxSegments,
}: RunGeminiSegmentBackfillOptions): Promise<SegmentSyncProgress> {
    const progress: SegmentSyncProgress = {
        processedSegments: 0,
        processedCharacters: 0,
        success: 0,
        failed: 0,
        batchRequests: 0,
    };
    const effectiveBatchSize = clampSegmentSyncBatchSize(batchSize);
    const remainingLimit = normalizeMaxSegments(maxSegments);

    while (remainingLimit === null || progress.success < remainingLimit) {
        const nextLimit = remainingLimit === null
            ? effectiveBatchSize
            : Math.min(effectiveBatchSize, remainingLimit - progress.success);

        if (nextLimit <= 0) {
            break;
        }

        const segments = await fetchMissingGeminiSegments(supabase, nextLimit);
        if (segments.length === 0) {
            break;
        }

        let embeddings: Array<number[] | undefined>;

        try {
            embeddings = await embedBatch(segments.map((segment) => segment.text));
        } catch (error) {
            const nextProgress = {
                ...progress,
                processedSegments: progress.processedSegments + segments.length,
                failed: progress.failed + segments.length,
                batchRequests: progress.batchRequests + 1,
            };

            throw new SegmentEmbeddingSyncError(
                toErrorMessage(error, "Gemini embedding request failed"),
                nextProgress,
                { cause: error }
            );
        }

        await upsertGeminiSegmentEmbeddings(supabase, segments, embeddings, progress);

        progress.processedSegments += segments.length;
        progress.processedCharacters += segments.reduce((sum, segment) => sum + segment.characterCount, 0);
        progress.success += segments.length;
        progress.batchRequests += 1;
    }

    return progress;
}
