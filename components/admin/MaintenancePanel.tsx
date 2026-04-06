"use client";

import { useState } from "react";
import { ChevronDown, Clock3, Wrench } from "lucide-react";
import { SyncEmbeddingsButton } from "@/components/admin/SyncEmbeddingsButton";
import { SyncSegmentEmbeddingsButton } from "@/components/admin/SyncSegmentEmbeddingsButton";
import { DrainNarrationJobsButton } from "@/components/admin/DrainNarrationJobsButton";

export function MaintenancePanel() {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <section className="rounded-xl border border-border bg-card px-6 py-5 text-card-foreground shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-border bg-background/50 p-2 text-muted-foreground">
                        <Wrench className="size-4" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-foreground">Maintenance</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Run recovery and AI sync actions from one operator area.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setIsExpanded((current) => !current)}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    aria-expanded={isExpanded}
                >
                    {isExpanded ? "Hide details" : "Show details"}
                    <ChevronDown className={`size-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
            </div>

            <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">Content embeddings</p>
                        <p className="text-xs text-muted-foreground">Manual refresh and sync when verified items drift.</p>
                    </div>
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Primary</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">AI segment coverage</p>
                        <p className="text-xs text-muted-foreground">Run local segment sync, then refresh coverage.</p>
                    </div>
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Primary</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">Narration recovery</p>
                        <p className="text-xs text-muted-foreground">Only needed when queued jobs look stuck.</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        Advanced
                    </span>
                </div>
            </div>

            {isExpanded ? (
                <div className="mt-5 space-y-4 border-t border-border pt-5">
                    <SyncEmbeddingsButton />
                    <SyncSegmentEmbeddingsButton />
                    <div className="rounded-xl border border-border bg-background/30 p-4">
                        <div className="mb-3">
                            <h3 className="text-sm font-semibold text-foreground">Advanced recovery</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Keep narration recovery tucked away unless you are actively investigating stuck jobs.
                            </p>
                        </div>
                        <DrainNarrationJobsButton />
                    </div>
                </div>
            ) : null}
        </section>
    );
}
