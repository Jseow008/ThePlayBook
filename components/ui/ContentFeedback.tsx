"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ThumbsUp, ThumbsDown, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthUser } from "@/hooks/useAuthUser";

interface ContentFeedbackProps {
    contentId: string;
}

const FEEDBACK_REASONS = [
    "Typos",
    "Grammatical errors",
    "Missing content / Incomplete section",
    "Inaccurate information",
    "Other"
];

function resetDownvoteForm(setReason: (value: string) => void, setDetails: (value: string) => void) {
    setReason("");
    setDetails("");
}

export function ContentFeedback({ contentId }: ContentFeedbackProps) {
    const user = useAuthUser();
    const [voteStatus, setVoteStatus] = useState<'up' | 'down' | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Lock body scroll while modal is open
    useEffect(() => {
        if (isModalOpen) {
            const original = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = original; };
        }
    }, [isModalOpen]);

    // Form state
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");

    const parseResponseError = async (response: Response) => {
        try {
            const payload = await response.json() as { error?: { message?: string } };
            return payload.error?.message || "Could not save feedback";
        } catch {
            return "Could not save feedback";
        }
    };

    const ensureOk = async (response: Response, fallbackMessage: string) => {
        if (response.ok) {
            return;
        }

        const apiMessage = await parseResponseError(response);
        throw new Error(apiMessage || fallbackMessage);
    };

    // Fetch initial status once auth is already known.
    useEffect(() => {
        const fetchStatus = async () => {
            if (!user) {
                setVoteStatus(null);
                return;
            }

            try {
                const res = await fetch(`/api/feedback/content?contentId=${contentId}`);
                if (res.ok) {
                    const { data } = await res.json();
                    if (data?.status) setVoteStatus(data.status);
                }
            } catch (err) {
                console.error("Failed to load feedback status", err);
            }
        };
        void fetchStatus();
    }, [contentId, user]);

    const handleVote = async (type: 'up' | 'down') => {
        if (isSubmitting) return;
        const previousVote = voteStatus;

        // If clicking the same button, remove the vote
        if (voteStatus === type) {
            setVoteStatus(null);
            setIsSubmitting(true);
            try {
                const response = await fetch("/api/feedback/content", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content_id: contentId })
                });
                await ensureOk(response, "Failed to remove feedback");
            } catch (err) {
                console.error("Failed to remove vote", err);
                setVoteStatus(previousVote);
                toast.error("Could not update feedback right now.");
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (type === 'up') {
            setVoteStatus(type);
            setIsSubmitting(true);
            try {
                const response = await fetch("/api/feedback/content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content_id: contentId,
                        is_positive: true
                    })
                });
                await ensureOk(response, "Failed to save feedback");
                toast.success("Thanks for the feedback! 👍");
            } catch (err) {
                console.error("Failed to submit upvote", err);
                setVoteStatus(previousVote);
                toast.error("Could not save feedback right now.");
            } finally {
                setIsSubmitting(false);
            }
        } else if (type === 'down') {
            // Open modal to gather more context
            setIsModalOpen(true);
        }
    };

    const submitDownvote = async (withDetails: boolean) => {
        setIsSubmitting(true);
        try {
            const response = await fetch("/api/feedback/content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content_id: contentId,
                    is_positive: false,
                    reason: withDetails ? (reason || null) : null,
                    details: withDetails ? (details || null) : null
                })
            });
            await ensureOk(response, "Failed to save feedback");
            setVoteStatus("down");
            setIsModalOpen(false);
            toast.success("Feedback received. We'll use it to improve!");
            resetDownvoteForm(setReason, setDetails);
        } catch (err) {
            console.error("Failed to submit downvote", err);
            toast.error("Could not save feedback right now.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user) return null;

    return (
        <div className="flex flex-col items-center justify-center pt-8 pb-4 mt-8 border-t border-border/40">
            <p className="text-sm font-medium text-muted-foreground mb-4">
                Was the content good?
            </p>
            <div className="flex items-center gap-4">
                <button
                    onClick={() => handleVote('up')}
                    disabled={isSubmitting}
                    className={cn(
                        "p-3 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                        voteStatus === 'up'
                            ? "bg-primary/20 text-primary hover:bg-primary/30"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-label="Thumbs Up"
                >
                    <ThumbsUp className="w-6 h-6" fill={voteStatus === 'up' ? "currentColor" : "none"} strokeWidth={2} />
                </button>
                <button
                    onClick={() => handleVote('down')}
                    disabled={isSubmitting}
                    className={cn(
                        "p-3 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                        voteStatus === 'down'
                            ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-label="Thumbs Down"
                >
                    <ThumbsDown className="w-6 h-6" fill={voteStatus === 'down' ? "currentColor" : "none"} strokeWidth={2} />
                </button>
            </div>

            {/* Modal Overlay via Portal */}
            {isModalOpen && mounted && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div
                        className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-foreground">Help us improve</h2>
                            <button
                                onClick={() => {
                                    setIsModalOpen(false);
                                    resetDownvoteForm(setReason, setDetails);
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <label htmlFor="reason" className="text-sm font-medium text-foreground">Select an issue (Optional)</label>
                                <div className="relative">
                                    <select
                                        id="reason"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="appearance-none h-10 w-full rounded-md border border-input bg-background/50 pl-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <option value="" disabled>Select an option...</option>
                                        {FEEDBACK_REASONS.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none opacity-50" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="details" className="text-sm font-medium text-foreground">Explain more (Optional)</label>
                                <textarea
                                    id="details"
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                    placeholder="Tell us what went wrong..."
                                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 mt-2">
                            <Button
                                variant="ghost"
                                onClick={() => submitDownvote(false)}
                                disabled={isSubmitting}
                            >
                                Skip
                            </Button>
                            <Button
                                onClick={() => submitDownvote(true)}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Submitting..." : "Submit"}
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
