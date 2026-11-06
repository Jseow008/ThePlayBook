"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
    CheckCircle2,
    ChevronDown,
    Loader2,
    Plus,
    Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SignInLink } from "@/components/ui/SignInLink";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";
import { buildLoginHref } from "@/lib/auth-redirect";
import type { ContentType } from "@/types/database";
import type { ContentRequestMutationResult } from "@/types/content-requests";

const TYPE_OPTIONS: Array<{ value: ContentType; label: string }> = [
    { value: "book", label: "Book" },
    { value: "video", label: "Video" },
];
const REQUEST_DRAFT_KEY = "netflux_request_draft:v1";

type SubmissionState = "idle" | "new" | "duplicate";

function parseApiError(response: Response) {
    return response.json()
        .then((payload: { error?: { message?: string } }) => payload.error?.message || "Request failed.")
        .catch(() => "Request failed.");
}

export function RequestBoard({
    initialInput = "",
}: {
    initialInput?: string;
}) {
    const user = useAuthUser();
    const [input, setInput] = useState(initialInput);
    const [author, setAuthor] = useState("");
    const [contentType, setContentType] = useState<ContentType | "">("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");

    useEffect(() => {
        try {
            const raw = window.sessionStorage.getItem(REQUEST_DRAFT_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as Record<string, unknown>;
            if (saved.returnPath !== `${window.location.pathname}${window.location.search}`) return;
            if (typeof saved.input === "string") setInput(saved.input);
            if (typeof saved.author === "string") setAuthor(saved.author);
            if (saved.contentType === "book" || saved.contentType === "video") setContentType(saved.contentType);
        } catch {
            // An unavailable or malformed browser draft leaves the initial form intact.
        }
    }, []);

    const persistRequestDraft = () => {
        try {
            window.sessionStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({
                returnPath: `${window.location.pathname}${window.location.search}`,
                input,
                author,
                contentType,
            }));
            return true;
        } catch {
            return false;
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        if (!contentType) {
            toast.error("Select a format before submitting.");
            return;
        }

        if (!user) {
            if (!persistRequestDraft()) {
                toast.error("Your browser could not keep this request. Copy it before signing in.");
                return;
            }
            window.location.assign(buildLoginHref(`${window.location.pathname}${window.location.search}`));
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/content-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input,
                    author: author || null,
                    content_type: contentType,
                }),
            });

            if (!response.ok) {
                throw new Error(await parseApiError(response));
            }

            const payload = await response.json() as { data: ContentRequestMutationResult };
            const nextState: SubmissionState = payload.data.duplicate ? "duplicate" : "new";
            setSubmissionState(nextState);
            setInput("");
            setAuthor("");
            try {
                window.sessionStorage.removeItem(REQUEST_DRAFT_KEY);
            } catch {
                // The submitted request is already saved on the server.
            }

            if (payload.data.duplicate) {
                toast.success("We already have this request.", {
                    description: "We noted your interest.",
                });
            } else {
                toast.success("Request received.", {
                    description: "We will use it to guide upcoming summaries.",
                });
            }
        } catch (error) {
            setSubmissionState("idle");
            toast.error(error instanceof Error ? error.message : "Could not submit this request.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-background text-foreground lg:min-h-screen">
            <section className="mx-auto flex min-h-[calc(100dvh-var(--mobile-header-height)-var(--mobile-bottom-nav-height)-var(--safe-area-bottom))] w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6 lg:min-h-screen lg:px-8">
                <div className="mb-6 text-center">
                    <h1 className="text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
                        Request a summary.
                    </h1>
                </div>

                <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur sm:p-5">
                    <div className="grid gap-4">
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                            Format
                            <div className="relative">
                                <select
                                    name="content_type"
                                    value={contentType}
                                    required
                                    onChange={(event) => {
                                        setContentType(event.target.value as ContentType | "");
                                        setSubmissionState("idle");
                                    }}
                                    className={cn(
                                        "h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-10 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                                        !contentType && "text-muted-foreground"
                                    )}
                                >
                                    <option value="">Please Select</option>
                                    {TYPE_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-foreground">
                            Title or URL
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={input}
                                    onChange={(event) => {
                                        setInput(event.target.value);
                                        setSubmissionState("idle");
                                    }}
                                    placeholder="Paste a URL or type a title by author"
                                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    required
                                />
                            </div>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-foreground">
                            Creator
                            <input
                                value={author}
                                onChange={(event) => setAuthor(event.target.value)}
                                placeholder="Optional"
                                autoComplete="off"
                                className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </label>

                        {submissionState !== "idle" ? (
                            <div className="flex gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                                <div>
                                    <p className="font-semibold">
                                        {submissionState === "duplicate" ? "We already have this request." : "Request received."}
                                    </p>
                                    <p className="mt-1 text-emerald-100/80">
                                        {submissionState === "duplicate"
                                            ? "We noted your interest."
                                            : "We will use it to guide upcoming summaries."}
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {user ? (
                            <Button type="submit" disabled={isSubmitting} className="h-11 gap-2 rounded-lg">
                                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                                Submit request
                            </Button>
                        ) : (
                            <SignInLink
                                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                onClick={(event) => {
                                    if (persistRequestDraft()) return;
                                    event.preventDefault();
                                    toast.error("Your browser could not keep this request. Copy it before signing in.");
                                }}
                            >
                                Sign in to submit
                            </SignInLink>
                        )}
                    </div>
                </form>
            </section>
        </div>
    );
}
