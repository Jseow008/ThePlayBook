#!/usr/bin/env node

import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import type { Database } from "../types/database";
import {
    GEMINI_SEGMENT_EMBEDDING_DIMENSIONS,
    GEMINI_SEGMENT_EMBEDDING_MODEL,
    LOCAL_SEGMENT_SYNC_COMMAND,
    SegmentEmbeddingSyncError,
    clampSegmentSyncBatchSize,
    getGeminiSegmentCoverage,
    normalizeMaxSegments,
    runGeminiSegmentBackfill,
} from "../lib/server/gemini-segment-sync";

const envFiles = [".env.local", ".env"];

for (const envFile of envFiles) {
    if (existsSync(envFile)) {
        loadEnv({ path: envFile, override: false });
    }
}

type CliOptions = {
    dryRun: boolean;
    batchSize?: number;
    maxSegments?: number;
};

function parsePositiveInteger(rawValue: string, flag: string) {
    const parsed = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`${flag} must be a positive integer`);
    }

    return parsed;
}

function parseCliArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        dryRun: false,
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];

        if (arg === "--dry-run") {
            options.dryRun = true;
            continue;
        }

        if (arg === "--batch-size") {
            const value = argv[index + 1];

            if (!value) {
                throw new Error("--batch-size requires a value");
            }

            options.batchSize = parsePositiveInteger(value, "--batch-size");
            index++;
            continue;
        }

        if (arg === "--max-segments") {
            const value = argv[index + 1];

            if (!value) {
                throw new Error("--max-segments requires a value");
            }

            options.maxSegments = parsePositiveInteger(value, "--max-segments");
            index++;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat().format(value);
}

function printUsage(error?: string) {
    if (error) {
        console.error(error);
        console.error("");
    }

    console.error("Usage:");
    console.error(`  ${LOCAL_SEGMENT_SYNC_COMMAND} [--dry-run] [--batch-size <n>] [--max-segments <n>]`);
}

function getRequiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_KEY" | "GEMINI_API_KEY") {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

async function main() {
    let options: CliOptions;

    try {
        options = parseCliArgs(process.argv.slice(2));
    } catch (error) {
        printUsage(error instanceof Error ? error.message : "Invalid arguments");
        process.exitCode = 1;
        return;
    }

    try {
        const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
        const supabaseServiceKey = getRequiredEnv("SUPABASE_SERVICE_KEY");
        const geminiApiKey = getRequiredEnv("GEMINI_API_KEY");

        const effectiveBatchSize = clampSegmentSyncBatchSize(options.batchSize);
        const effectiveMaxSegments = normalizeMaxSegments(options.maxSegments);
        const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        const coverageBefore = await getGeminiSegmentCoverage(supabase);

        console.log("Gemini Segment Coverage");
        console.log(`- Library items referenced: ${formatNumber(coverageBefore.total_library_content_items)}`);
        console.log(`- Content items with embeddings: ${formatNumber(coverageBefore.embedded_content_items)}`);
        console.log(`- Missing segments: ${formatNumber(coverageBefore.missing_segments)}`);
        console.log(`- Estimated remaining characters: ${formatNumber(coverageBefore.estimated_remaining_characters)}`);
        console.log(`- Batch size: ${formatNumber(effectiveBatchSize)}`);
        if (effectiveMaxSegments !== null) {
            console.log(`- Max segments this run: ${formatNumber(effectiveMaxSegments)}`);
        }

        if (options.dryRun) {
            console.log("");
            console.log("Dry run complete. No embeddings were generated or uploaded.");
            return;
        }

        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        try {
            const result = await runGeminiSegmentBackfill({
                supabase,
                batchSize: effectiveBatchSize,
                maxSegments: effectiveMaxSegments ?? undefined,
                embedBatch: async (contents) => {
                    const response = await ai.models.embedContent({
                        model: GEMINI_SEGMENT_EMBEDDING_MODEL,
                        contents,
                        config: { outputDimensionality: GEMINI_SEGMENT_EMBEDDING_DIMENSIONS },
                    });

                    return (response.embeddings ?? []).map((item) => item.values);
                },
            });
            const coverageAfter = await getGeminiSegmentCoverage(supabase);

            console.log("");
            console.log("Sync complete");
            console.log(`- Processed: ${formatNumber(result.processedSegments)}`);
            console.log(`- Succeeded: ${formatNumber(result.success)}`);
            console.log(`- Failed: ${formatNumber(result.failed)}`);
            console.log(`- Batch requests: ${formatNumber(result.batchRequests)}`);
            console.log(`- Uploaded characters: ${formatNumber(result.processedCharacters)}`);
            console.log(`- Remaining segments: ${formatNumber(coverageAfter.missing_segments)}`);
            return;
        } catch (error) {
            const coverageAfter = await getGeminiSegmentCoverage(supabase).catch(() => null);

            console.error("");
            console.error("Sync failed");

            if (error instanceof SegmentEmbeddingSyncError) {
                console.error(`- Processed: ${formatNumber(error.progress.processedSegments)}`);
                console.error(`- Succeeded: ${formatNumber(error.progress.success)}`);
                console.error(`- Failed: ${formatNumber(error.progress.failed)}`);
                console.error(`- Batch requests: ${formatNumber(error.progress.batchRequests)}`);
                console.error(`- Uploaded characters: ${formatNumber(error.progress.processedCharacters)}`);
            }

            if (coverageAfter) {
                console.error(`- Remaining segments: ${formatNumber(coverageAfter.missing_segments)}`);
            }

            console.error(`- Error: ${error instanceof Error ? error.message : "Unknown sync error"}`);
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : "Unexpected sync error");
        process.exitCode = 1;
    }
}

void main();
