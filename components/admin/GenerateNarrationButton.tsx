"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateNarrationButtonProps {
    contentId: string;
    audioUrl: string;
    disabled?: boolean;
    onGenerated: (url: string) => void;
}

type GenerateNarrationResponse = {
    data?: {
        url?: string;
        chunk_count?: number;
        message?: string;
    };
    error?: {
        message?: string;
    };
};

const FALLBACK_GENERATION_ERROR = "AI narration could not be completed right now. Please try again.";
const FALLBACK_NETWORK_ERROR = "Could not reach the narration service. Please try again.";

async function parseNarrationResponse(response: Response): Promise<GenerateNarrationResponse | null> {
    try {
        return await response.json() as GenerateNarrationResponse;
    } catch {
        return null;
    }
}

function getClientSafeErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
        return FALLBACK_GENERATION_ERROR;
    }

    const message = error.message.trim();
    if (!message) {
        return FALLBACK_GENERATION_ERROR;
    }

    const normalized = message.toLowerCase();
    if (
        normalized.includes("failed to fetch")
        || normalized.includes("networkerror")
        || normalized.includes("load failed")
        || normalized.includes("unexpected token")
    ) {
        return FALLBACK_NETWORK_ERROR;
    }

    return message;
}

export function GenerateNarrationButton({
    contentId,
    audioUrl,
    disabled = false,
    onGenerated,
}: GenerateNarrationButtonProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleGenerate = async () => {
        try {
            setIsGenerating(true);
            setStatusText("Generating AI narration...");

            const response = await fetch(`/api/admin/content/${contentId}/narration`, {
                method: "POST",
            });
            const data = await parseNarrationResponse(response);

            if (!response.ok || !data?.data?.url) {
                throw new Error(data?.error?.message || FALLBACK_GENERATION_ERROR);
            }

            onGenerated(data.data.url);
            const chunkSuffix = data.data.chunk_count ? ` using ${data.data.chunk_count} audio chunk${data.data.chunk_count === 1 ? "" : "s"}.` : ".";
            setStatusText(`AI narration saved to this content item${chunkSuffix}`);
        } catch (error) {
            setStatusText(`Error: ${getClientSafeErrorMessage(error)}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                        <Sparkles className="size-4 text-zinc-700" />
                        <span>AI narration</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Generate one AI narration audio file from the published summary, upload it to Supabase audio storage,
                        and save the resulting URL to this content item automatically.
                    </p>
                    {audioUrl && (
                        <p className="mt-2 text-xs font-medium text-zinc-600">
                            A narration file already exists. Generating again will replace the stored audio file.
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={disabled || isGenerating}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Loader2 className={`size-4 ${isGenerating ? "animate-spin" : "hidden"}`} />
                    {!isGenerating && <Sparkles className="size-4" />}
                    {isGenerating ? "Generating..." : audioUrl ? "Regenerate AI Narration" : "Generate AI Narration"}
                </button>
            </div>

            {statusText && (
                <p className={`mt-3 text-xs font-medium ${statusText.startsWith("Error:") ? "text-red-600" : "text-emerald-600"}`}>
                    {statusText}
                </p>
            )}
        </div>
    );
}
