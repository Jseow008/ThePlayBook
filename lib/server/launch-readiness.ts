import { getAdminAiReadinessMap, getAdminAiReadinessWorkflow, summarizeAdminAiReadiness, type AdminAiReadinessSummary } from "@/lib/server/admin-ai-readiness";
import { getGeminiSegmentCoverage, type CoverageSummary } from "@/lib/server/gemini-segment-sync";
import { getRuntimeReadiness, type RuntimeReadiness } from "@/lib/server/health";
import { getAdminClient } from "@/lib/supabase/admin";

type BucketRow = {
    name?: string | null;
    public?: boolean | null;
};

type LaunchReadinessSupabaseClient = {
    from: (table: string) => any;
    rpc: (...args: any[]) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
    storage: {
        listBuckets: () => PromiseLike<{ data: BucketRow[] | null; error: unknown }>;
    };
};

type VerifiedContentRow = {
    id: string;
    status: string;
    embedding: unknown;
};

export type LaunchReadinessBucketCheck = {
    present: boolean;
    public: boolean | null;
    status: "ready" | "degraded";
};

export type LaunchReadinessAiReadiness = {
    status: "ready" | "degraded";
    summary: AdminAiReadinessSummary | null;
    workflow: ReturnType<typeof getAdminAiReadinessWorkflow>;
    issues: string[];
};

export type LaunchReadinessSegmentCoverage = {
    status: "ready" | "degraded";
    summary: CoverageSummary | null;
    issues: string[];
};

export type LaunchReadinessStorageReadiness = {
    status: "ready" | "degraded";
    buckets: {
        media: LaunchReadinessBucketCheck;
        audio: LaunchReadinessBucketCheck;
    };
    issues: string[];
};

export type LaunchReadinessReport = {
    status: "ready" | "degraded";
    timestamp: string;
    runtime: RuntimeReadiness;
    database: {
        status: "ready" | "degraded";
        ai_readiness: LaunchReadinessAiReadiness;
        segment_coverage: LaunchReadinessSegmentCoverage;
        storage: LaunchReadinessStorageReadiness;
    };
    issues: string[];
};

function uniqueIssues(issues: string[]) {
    return [...new Set(issues.filter((issue) => issue.trim().length > 0))];
}

function buildBucketCheck(buckets: BucketRow[], name: string) {
    const bucket = buckets.find((row) => row.name === name);

    if (!bucket) {
        return {
            check: {
                present: false,
                public: null,
                status: "degraded" as const,
            },
            issues: [`Supabase storage bucket "${name}" is missing.`],
        };
    }

    if (bucket.public !== true) {
        return {
            check: {
                present: true,
                public: Boolean(bucket.public),
                status: "degraded" as const,
            },
            issues: [`Supabase storage bucket "${name}" is not public.`],
        };
    }

    return {
        check: {
            present: true,
            public: true,
            status: "ready" as const,
        },
        issues: [],
    };
}

export async function getLaunchReadinessReport(
    env: NodeJS.ProcessEnv = process.env
): Promise<LaunchReadinessReport> {
    const runtime = getRuntimeReadiness(env);
    const runtimeIssues = [...runtime.issues];
    const workflow = getAdminAiReadinessWorkflow();

    const aiReadiness: LaunchReadinessAiReadiness = {
        status: "degraded",
        summary: null,
        workflow,
        issues: [],
    };

    const segmentCoverage: LaunchReadinessSegmentCoverage = {
        status: "degraded",
        summary: null,
        issues: [],
    };

    const storage: LaunchReadinessStorageReadiness = {
        status: "degraded",
        buckets: {
            media: {
                present: false,
                public: null,
                status: "degraded",
            },
            audio: {
                present: false,
                public: null,
                status: "degraded",
            },
        },
        issues: [],
    };

    let supabase: LaunchReadinessSupabaseClient | null = null;

    if (runtime.checks.supabase_admin === "ready") {
        try {
            supabase = getAdminClient() as unknown as LaunchReadinessSupabaseClient;
        } catch {
            const issue = "Supabase admin client could not be created.";
            runtimeIssues.push(issue);
            aiReadiness.issues.push(issue);
            segmentCoverage.issues.push(issue);
            storage.issues.push(issue);
        }
    } else {
        const issue = "Supabase admin client configuration is incomplete; database-backed launch checks were skipped.";
        aiReadiness.issues.push(issue);
        segmentCoverage.issues.push(issue);
        storage.issues.push(issue);
    }

    if (supabase) {
        try {
            const { data: items, error } = await supabase
                .from("content_item")
                .select("id, status, embedding")
                .eq("status", "verified")
                .is("deleted_at", null);

            if (error) {
                throw error;
            }

            const verifiedItems: VerifiedContentRow[] = Array.isArray(items)
                ? items.map((item: any) => ({
                    id: item.id,
                    status: item.status,
                    embedding: item.embedding,
                }))
                : [];

            const aiReadinessById = await getAdminAiReadinessMap(
                supabase as any,
                verifiedItems
            );
            const aiReadinessSummary = summarizeAdminAiReadiness(Object.values(aiReadinessById));

            aiReadiness.summary = aiReadinessSummary;
            aiReadiness.status = aiReadinessSummary.verified_items > 0 && aiReadinessSummary.ai_stale_items === 0
                ? "ready"
                : "degraded";

            if (aiReadinessSummary.verified_items === 0) {
                aiReadiness.issues.push("No verified content items were found for AI readiness.");
            }

            if (aiReadinessSummary.stale_content_embeddings > 0) {
                aiReadiness.issues.push(
                    `${aiReadinessSummary.stale_content_embeddings} verified content item(s) are missing content embeddings.`
                );
            }

            if (aiReadinessSummary.stale_segment_embeddings > 0) {
                aiReadiness.issues.push(
                    `${aiReadinessSummary.stale_segment_embeddings} verified content item(s) are missing segment embeddings.`
                );
            }

            if (aiReadinessSummary.items_without_published_segments > 0) {
                aiReadiness.issues.push(
                    `${aiReadinessSummary.items_without_published_segments} verified content item(s) have no published segments.`
                );
            }
        } catch {
            aiReadiness.issues.push("Failed to load AI readiness details.");
        }

        try {
            const coverage = await getGeminiSegmentCoverage(supabase as any);
            segmentCoverage.summary = coverage;
            segmentCoverage.status = coverage.total_library_content_items > 0 && coverage.missing_segments === 0
                ? "ready"
                : "degraded";

            if (coverage.total_library_content_items === 0) {
                segmentCoverage.issues.push("No library content items were found for Gemini segment coverage.");
            }

            if (coverage.missing_segments > 0) {
                segmentCoverage.issues.push(
                    `${coverage.missing_segments} Gemini segment embedding(s) are still missing.`
                );
            }
        } catch {
            segmentCoverage.issues.push("Failed to load Gemini segment coverage.");
        }

        try {
            const { data: buckets, error } = await supabase.storage.listBuckets();

            if (error) {
                throw error;
            }

            const bucketRows = Array.isArray(buckets) ? buckets : [];
            const media = buildBucketCheck(bucketRows, "media");
            const audio = buildBucketCheck(bucketRows, "audio");

            storage.buckets = {
                media: media.check,
                audio: audio.check,
            };
            storage.issues.push(...media.issues, ...audio.issues);
            storage.status = media.check.status === "ready" && audio.check.status === "ready"
                ? "ready"
                : "degraded";
        } catch {
            storage.issues.push("Failed to list Supabase storage buckets.");
        }
    }

    const databaseIssues = uniqueIssues([
        ...aiReadiness.issues,
        ...segmentCoverage.issues,
        ...storage.issues,
    ]);

    const databaseStatus = aiReadiness.status === "ready"
        && segmentCoverage.status === "ready"
        && storage.status === "ready"
        ? "ready"
        : "degraded";

    return {
        status: runtime.status === "ready" && databaseStatus === "ready" ? "ready" : "degraded",
        timestamp: new Date().toISOString(),
        runtime,
        database: {
            status: databaseStatus,
            ai_readiness: aiReadiness,
            segment_coverage: segmentCoverage,
            storage,
        },
        issues: uniqueIssues([...runtimeIssues, ...databaseIssues]),
    };
}
