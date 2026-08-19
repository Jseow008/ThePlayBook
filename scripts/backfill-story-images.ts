#!/usr/bin/env node

import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
    buildStoryImageRenderVersion,
    buildStoryImageStoragePath,
    renderStoryImageJpeg,
    type StoryImageContent,
} from "../lib/server/story-image-renderer";
import { markStoryImageVersionCompleted } from "../lib/server/story-image-queue";
import {
    cleanupOldStoryImageVersions,
    getStoryImagePublicUrl,
    storedStoryImageExists,
    storeStoryImage,
} from "../lib/server/story-image-storage";

for (const envFile of [".env.local", ".env"]) {
    if (existsSync(envFile)) loadEnv({ path: envFile, override: false });
}

type CliOptions = {
    dryRun: boolean;
    cleanup: boolean;
    limit: number | null;
};

const PAGE_SIZE = 100;

function parsePositiveInteger(rawValue: string, flag: string) {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value) || value < 1) throw new Error(`${flag} must be a positive integer`);
    return value;
}

function parseCliArgs(argv: string[]): CliOptions {
    const options: CliOptions = { dryRun: false, cleanup: false, limit: null };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--dry-run") {
            options.dryRun = true;
        } else if (arg === "--cleanup") {
            options.cleanup = true;
        } else if (arg === "--limit") {
            const value = argv[index + 1];
            if (!value) throw new Error("--limit requires a value");
            options.limit = parsePositiveInteger(value, "--limit");
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_KEY") {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

async function loadVerifiedContent(
    supabase: ReturnType<typeof createClient<Database>>,
    limit: number | null
) {
    const rows: StoryImageContent[] = [];

    while (limit === null || rows.length < limit) {
        const pageSize = Math.min(PAGE_SIZE, limit === null ? PAGE_SIZE : limit - rows.length);
        const start = rows.length;
        const { data, error } = await supabase
            .from("content_item")
            .select("id, title, author, category, cover_image_url, type, duration_seconds")
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(start, start + pageSize - 1);

        if (error) throw error;
        rows.push(...((data ?? []) as StoryImageContent[]));
        if (!data || data.length < pageSize) break;
    }

    return rows;
}

async function main() {
    const options = parseCliArgs(process.argv.slice(2));
    const supabase = createClient<Database>(
        requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
        requiredEnv("SUPABASE_SERVICE_KEY"),
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const contentItems = await loadVerifiedContent(supabase, options.limit);
    const result = { discovered: contentItems.length, generated: 0, reused: 0, failed: 0, cleaned: 0 };

    console.log(`Story image backfill: ${contentItems.length} verified item(s)${options.dryRun ? " (dry run)" : ""}.`);

    for (const content of contentItems) {
        const renderVersion = buildStoryImageRenderVersion(content);
        const storagePath = buildStoryImageStoragePath(content.id, renderVersion);

        if (options.dryRun) {
            console.log(`- ${content.id}: ${storagePath}`);
            continue;
        }

        try {
            const publicUrl = getStoryImagePublicUrl(storagePath, supabase);
            if (await storedStoryImageExists(publicUrl)) {
                result.reused += 1;
            } else {
                const jpegBuffer = await renderStoryImageJpeg(content);
                await storeStoryImage({ supabase, storagePath, jpegBuffer });
                result.generated += 1;
            }

            await markStoryImageVersionCompleted({
                supabase,
                contentId: content.id,
                renderVersion,
                storagePath,
            });

            if (options.cleanup) {
                const cleanup = await cleanupOldStoryImageVersions({
                    supabase,
                    contentId: content.id,
                    currentStoragePath: storagePath,
                    retainCount: 2,
                });
                result.cleaned += cleanup.removed;
            }

            console.log(`- ${content.id}: ready`);
        } catch (error) {
            result.failed += 1;
            console.error(`- ${content.id}: ${error instanceof Error ? error.message : "failed"}`);
        }
    }

    console.log("Story image backfill complete.");
    console.log(result);
    if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unexpected story image backfill failure");
    process.exitCode = 1;
});
