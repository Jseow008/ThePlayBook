import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_COVER_IMAGE_URL =
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";

const PNG_FIXTURE_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUswAAAAASUVORK5CYII=";

export interface AdminPublishE2EConfig {
    allowMutations: boolean;
    coverImageUrl: string;
    email: string | null;
    exerciseUpload: boolean;
    password: string | null;
    skipReason: string | null;
}

export function getAdminPublishE2EConfig(): AdminPublishE2EConfig {
    const email = process.env.E2E_ADMIN_EMAIL?.trim() || null;
    const password = process.env.E2E_ADMIN_PASSWORD?.trim() || null;
    const allowMutations = process.env.E2E_ADMIN_ALLOW_MUTATIONS === "1";
    const exerciseUpload = process.env.E2E_ADMIN_EXERCISE_UPLOAD === "1";

    let skipReason: string | null = null;

    if (!allowMutations) {
        skipReason =
            "Set E2E_ADMIN_ALLOW_MUTATIONS=1 to opt into a test that creates real admin content.";
    } else if (!email || !password) {
        skipReason =
            "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the admin publish E2E flow.";
    }

    return {
        allowMutations,
        coverImageUrl:
            process.env.E2E_ADMIN_COVER_IMAGE_URL?.trim() || DEFAULT_COVER_IMAGE_URL,
        email,
        exerciseUpload,
        password,
        skipReason,
    };
}

export async function createImageUploadFixture() {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "netflux-admin-publish-"));
    const filePath = path.join(tmpDir, "cover.png");

    await fs.writeFile(filePath, Buffer.from(PNG_FIXTURE_BASE64, "base64"));

    return {
        filePath,
        async cleanup() {
            await fs.rm(tmpDir, { force: true, recursive: true });
        },
    };
}
