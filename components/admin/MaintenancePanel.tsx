"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown, Clock3, Wrench } from "lucide-react";
import { SyncEmbeddingsButton } from "@/components/admin/SyncEmbeddingsButton";
import { SyncSegmentEmbeddingsButton } from "@/components/admin/SyncSegmentEmbeddingsButton";
import { DrainNarrationJobsButton } from "@/components/admin/DrainNarrationJobsButton";

type MaintenanceSectionKey = "contentEmbeddings" | "segmentCoverage" | "narrationRecovery";

type MaintenanceSectionProps = {
    id: string;
    title: string;
    description: string;
    label: ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    children: ReactNode;
};

function MaintenanceSection({
    id,
    title,
    description,
    label,
    isExpanded,
    onToggle,
    children,
}: MaintenanceSectionProps) {
    const detailsId = `${id}-details`;

    return (
        <div className="overflow-hidden rounded-lg border border-border bg-background/40">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {label}
                    <button
                        type="button"
                        onClick={onToggle}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                    >
                        {isExpanded ? "Hide details" : "Show details"}
                        <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                </div>
            </div>

            {isExpanded ? (
                <div id={detailsId} className="border-t border-border bg-card p-4">
                    {children}
                </div>
            ) : null}
        </div>
    );
}

export function MaintenancePanel() {
    const [expandedSections, setExpandedSections] = useState<Record<MaintenanceSectionKey, boolean>>({
        contentEmbeddings: false,
        segmentCoverage: false,
        narrationRecovery: false,
    });
    const allExpanded = Object.values(expandedSections).every(Boolean);

    const toggleSection = (section: MaintenanceSectionKey) => {
        setExpandedSections((current) => ({
            ...current,
            [section]: !current[section],
        }));
    };

    const toggleAllSections = () => {
        const nextExpanded = !allExpanded;
        setExpandedSections({
            contentEmbeddings: nextExpanded,
            segmentCoverage: nextExpanded,
            narrationRecovery: nextExpanded,
        });
    };

    return (
        <section className="rounded-xl border border-border bg-card px-6 py-5 text-card-foreground shadow-sm">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
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
                    onClick={toggleAllSections}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    aria-expanded={allExpanded}
                    aria-controls="content-embeddings-details segment-coverage-details narration-recovery-details"
                >
                    {allExpanded ? "Hide all details" : "Show all details"}
                    <ChevronDown className={`size-4 transition-transform ${allExpanded ? "rotate-180" : ""}`} />
                </button>
            </div>

            <div className="mt-4 grid gap-3">
                <MaintenanceSection
                    id="content-embeddings"
                    title="Content embeddings"
                    description="Manual refresh and sync when verified items drift."
                    label={<span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Primary</span>}
                    isExpanded={expandedSections.contentEmbeddings}
                    onToggle={() => toggleSection("contentEmbeddings")}
                >
                    <SyncEmbeddingsButton />
                </MaintenanceSection>

                <MaintenanceSection
                    id="segment-coverage"
                    title="AI segment coverage"
                    description="Run local segment sync, then refresh coverage."
                    label={<span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Primary</span>}
                    isExpanded={expandedSections.segmentCoverage}
                    onToggle={() => toggleSection("segmentCoverage")}
                >
                    <SyncSegmentEmbeddingsButton />
                </MaintenanceSection>

                <MaintenanceSection
                    id="narration-recovery"
                    title="Narration recovery"
                    description="Only needed when queued jobs look stuck."
                    label={(
                        <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            <Clock3 className="size-3.5" />
                            Advanced
                        </span>
                    )}
                    isExpanded={expandedSections.narrationRecovery}
                    onToggle={() => toggleSection("narrationRecovery")}
                >
                    <DrainNarrationJobsButton />
                </MaintenanceSection>
            </div>
        </section>
    );
}
