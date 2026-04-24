import type { NarrationCostEstimate } from "@/lib/narration-cost";

const narrationCostFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatNarrationDuration(seconds: number) {
    const safeSeconds = Math.max(1, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;

    if (minutes === 0) {
        return `${remainingSeconds}s`;
    }

    if (remainingSeconds === 0) {
        return `${minutes}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}

export function formatNarrationCostEstimate(estimate: NarrationCostEstimate) {
    return `Approx ${narrationCostFormatter.format(estimate.estimatedCostUsd)} for ${formatNarrationDuration(estimate.estimatedDurationSeconds)} API audio.`;
}
