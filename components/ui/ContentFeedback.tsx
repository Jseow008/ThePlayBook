"use client";

import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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

export function ContentFeedback({ contentId }: ContentFeedbackProps) {
    const [voteStatus, setVoteStatus] = useState<'up' | 'down' | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

    // Form state
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");

    // Fetch initial status on mount
    useEffect(() => {
        const checkAuthAndFetchStatus = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setIsLoggedIn(false);
                return;
            }

            setIsLoggedIn(true);

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
        checkAuthAndFetchStatus();
    }, [contentId]);

    const handleVote = async (type: 'up' | 'down') => {
        if (isSubmitting) return;

        // If clicking the same button, remove the vote
        if (voteStatus === type) {
            setVoteStatus(null);
            setIsSubmitting(true);
            try {
                await fetch("/api/feedback/content", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content_id: contentId })
                });
            } catch (err) {
                console.error("Failed to remove vote", err);
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // Switching vote or creating new vote
        setVoteStatus(type);

        if (type === 'up') {
            setIsSubmitting(true);
            try {
                await fetch("/api/feedback/content", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content_id: contentId,
                        is_positive: true
                    })
                });
            } catch (err) {
                console.error("Failed to submit upvote", err);
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
            await fetch("/api/feedback/content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content_id: contentId,
                    is_positive: false,
                    reason: withDetails ? (reason || null) : null,
                    details: withDetails ? (details || null) : null
                })
            });
        } catch (err) {
            console.error("Failed to submit downvote", err);
        } finally {
            setIsSubmitting(false);
            setIsModalOpen(false);
            // Reset modal state
            setReason("");
            setDetails("");
        }
    };

    if (!isLoggedIn) return null;

    return (
        <div className="flex flex-col items-center justify-center pt-8 pb-12 mt-8 border-t border-border/40">
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

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div
                        className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-foreground">Help us improve</h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <label htmlFor="reason" className="text-sm font-medium text-foreground">Select an issue (Optional)</label>
                                <select
                                    id="reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <option value="" disabled>Select an option...</option>
                                    {FEEDBACK_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
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
                </div>
            )}
        </div>
    );
}
