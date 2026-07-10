"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PreparedShareImage = {
    blob: Blob;
    file: File;
    fileName: string;
};

export type ShareImagePreparationStatus = "idle" | "preparing" | "ready" | "failed";

type SharePreparedImageResult =
    | { status: "shared" | "downloaded"; copiedLink: boolean }
    | { status: "cancelled" }
    | { status: "failed"; error: unknown };

function buildStoryImageUrl(contentId: string) {
    return new URL(`/api/og/content/${contentId}/story`, window.location.origin).toString();
}

function buildStoryFileName(title: string) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return `${slug || "netflux-read"}-story.png`;
}

async function copyShareLink(url: string) {
    if (!url || !navigator.clipboard) return false;

    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch {
        return false;
    }
}

function canShareFiles(files: File[]) {
    try {
        return typeof navigator.share === "function"
            && typeof navigator.canShare === "function"
            && navigator.canShare({ files });
    } catch {
        return false;
    }
}

function downloadBlob(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export async function sharePreparedImage(
    preparedImage: PreparedShareImage,
    url: string
): Promise<SharePreparedImageResult> {
    if (!canShareFiles([preparedImage.file])) {
        const copiedLink = copyShareLink(url);
        downloadBlob(preparedImage.blob, preparedImage.fileName);
        return { status: "downloaded", copiedLink: await copiedLink };
    }

    let copiedLink: Promise<boolean> | null = null;

    try {
        // This must happen synchronously in the tap handler on iOS.
        const nativeShare = navigator.share({ files: [preparedImage.file] });
        copiedLink = copyShareLink(url);
        await nativeShare;
        return { status: "shared", copiedLink: await copiedLink };
    } catch (error) {
        if (copiedLink) await copiedLink;

        if ((error as Error).name === "AbortError") {
            return { status: "cancelled" };
        }

        return { status: "failed", error };
    }
}

export function usePreparedShareImage(contentId: string | undefined, title: string) {
    const [status, setStatus] = useState<ShareImagePreparationStatus>("idle");
    const preparedImageRef = useRef<PreparedShareImage | null>(null);
    const preparationRef = useRef<Promise<PreparedShareImage | null> | null>(null);
    const requestVersionRef = useRef(0);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        requestVersionRef.current += 1;
        preparedImageRef.current = null;
        preparationRef.current = null;
        setStatus("idle");
    }, [contentId, title]);

    const prepare = useCallback(async () => {
        if (!contentId) return null;

        if (preparedImageRef.current) return preparedImageRef.current;
        if (preparationRef.current) return preparationRef.current;

        const requestVersion = requestVersionRef.current;
        setStatus("preparing");

        const preparation = (async () => {
            try {
                const response = await fetch(buildStoryImageUrl(contentId), {
                    headers: { Accept: "image/png" },
                });

                if (!response.ok) {
                    throw new Error(`Share image request failed with ${response.status}`);
                }

                const blob = await response.blob();
                const preparedImage = {
                    blob,
                    file: new File([blob], buildStoryFileName(title), {
                        type: blob.type || "image/png",
                        lastModified: Date.now(),
                    }),
                    fileName: buildStoryFileName(title),
                };

                if (isMountedRef.current && requestVersion === requestVersionRef.current) {
                    preparedImageRef.current = preparedImage;
                    setStatus("ready");
                }

                return preparedImage;
            } catch {
                if (isMountedRef.current && requestVersion === requestVersionRef.current) {
                    setStatus("failed");
                }

                return null;
            }
        })();

        preparationRef.current = preparation;
        void preparation.then(() => {
            if (preparationRef.current === preparation) {
                preparationRef.current = null;
            }
        });

        return preparation;
    }, [contentId, title]);

    const getPreparedImage = useCallback(() => preparedImageRef.current, []);

    return { status, prepare, getPreparedImage };
}
