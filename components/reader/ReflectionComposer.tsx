"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { useSaveReflection, type ReflectionWithContent } from "@/hooks/useReflections";
import { buildLoginHref } from "@/lib/auth-redirect";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";

const REFLECTION_PROMPT = "What idea do you want to remember from this?";
const REFLECTION_MAX_LENGTH = 1_000;

function getDraftKey(contentId: string) {
    return `netflux_reflection_draft:v1:${contentId}`;
}

interface ReflectionComposerProps {
    contentId: string;
    contentTitle: string;
    isOpen: boolean;
    isAuthenticated: boolean;
    existingReflection: ReflectionWithContent | null;
    onClose: () => void;
    onSaved: () => void;
}

export function ReflectionComposer({
    contentId,
    contentTitle,
    isOpen,
    isAuthenticated,
    existingReflection,
    onClose,
    onSaved,
}: ReflectionComposerProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [draft, setDraft] = useState("");
    const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
    const [showSignInPrompt, setShowSignInPrompt] = useState(false);
    const saveReflection = useSaveReflection();

    useOverlayInteractions({
        enabled: isOpen,
        containerRef: dialogRef,
        initialFocusRef: textareaRef,
        onEscape: saveReflection.isPending ? undefined : onClose,
        scrollLock: { lockDocumentElement: true },
    });

    useEffect(() => {
        try {
            const storedDraft = window.sessionStorage.getItem(getDraftKey(contentId));
            if (storedDraft !== null) {
                setDraft(storedDraft);
            } else if (existingReflection?.reflection_text) {
                setDraft(existingReflection.reflection_text);
            }
        } catch {
            // Private browsing or disabled storage should not block reflection writing.
        } finally {
            setHasLoadedDraft(true);
        }
    }, [contentId, existingReflection?.reflection_text]);

    useEffect(() => {
        if (!hasLoadedDraft) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            try {
                if (draft) {
                    window.sessionStorage.setItem(getDraftKey(contentId), draft);
                } else {
                    window.sessionStorage.removeItem(getDraftKey(contentId));
                }
            } catch {
                // A draft is a convenience, not a requirement for the feature.
            }
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [contentId, draft, hasLoadedDraft]);

    const discardDraft = () => {
        setDraft("");
        try {
            window.sessionStorage.removeItem(getDraftKey(contentId));
        } catch {
            // Ignore unavailable session storage.
        }
    };

    const handleSave = async () => {
        const reflectionText = draft.trim();
        if (!reflectionText) {
            textareaRef.current?.focus();
            return;
        }

        if (!isAuthenticated) {
            if (!showSignInPrompt) {
                setShowSignInPrompt(true);
                return;
            }
            const returnTo = `${window.location.pathname}${window.location.search}`;
            window.location.assign(buildLoginHref(returnTo));
            return;
        }

        try {
            await saveReflection.mutateAsync({
                content_item_id: contentId,
                prompt: REFLECTION_PROMPT,
                reflection_text: reflectionText,
            });
            discardDraft();
            toast.success(existingReflection ? "Reflection updated" : "Reflection saved to your notes");
            onSaved();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save reflection");
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className={cn("fixed inset-0", OVERLAY_LAYER_CLASS.panel)}>
            <button
                type="button"
                aria-label="Close reflection"
                onClick={onClose}
                disabled={saveReflection.isPending}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            <div className="absolute inset-x-0 bottom-0 flex justify-center sm:inset-0 sm:items-center sm:px-4">
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reflection-composer-title"
                    tabIndex={-1}
                    className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-background/96 shadow-[0_-20px_60px_-28px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:max-h-[80vh] sm:rounded-[1.75rem]"
                >
                    <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/14 sm:hidden" />
                    <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-primary">
                                <Lightbulb className="size-4" aria-hidden="true" />
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em]">Reflection</p>
                            </div>
                            <h2 id="reflection-composer-title" className="mt-1 text-lg font-semibold text-foreground">
                                Take a moment to reflect
                            </h2>
                            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{contentTitle}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saveReflection.isPending}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                            aria-label="Close reflection"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="overflow-y-auto px-5 py-5 sm:px-6">
                        <p className="text-base font-medium leading-7 text-foreground">{REFLECTION_PROMPT}</p>
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            maxLength={REFLECTION_MAX_LENGTH}
                            placeholder="A few sentences is enough."
                            className="mt-4 min-h-40 w-full resize-none rounded-2xl border border-white/10 bg-card/35 px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>Private to you</span>
                            <span aria-live="polite">{draft.length} / {REFLECTION_MAX_LENGTH}</span>
                        </div>
                        {showSignInPrompt && !isAuthenticated && (
                            <p role="status" className="mt-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                                Sign in to save your reflection. Your draft will still be here when you return.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-white/8 bg-background/92 px-5 py-4 safe-area-pb-md sm:px-6 sm:pb-4">
                        <div>
                            {draft && (
                                <button
                                    type="button"
                                    onClick={discardDraft}
                                    disabled={saveReflection.isPending}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                                >
                                    <Trash2 className="size-3.5" />
                                    Discard draft
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (!saveReflection.isPending) {
                                    captureAnalyticsEvent("reflection_skipped", {
                                        content_id: contentId,
                                        route: "/read/[id]",
                                        user_state: isAuthenticated ? "authenticated" : "anonymous",
                                    });
                                    onClose();
                                }
                            }}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-foreground/84 transition-colors hover:bg-card/50 hover:text-foreground"
                        >
                            Not now
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={!draft.trim() || saveReflection.isPending}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {saveReflection.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            {isAuthenticated ? "Save reflection" : showSignInPrompt ? "Continue to sign in" : "Save reflection"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
