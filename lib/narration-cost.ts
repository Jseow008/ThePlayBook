export interface NarrationCostEstimate {
    model: string;
    speed: number;
    scriptCharacters: number;
    scriptWords: number;
    chunkCount: number;
    estimatedDurationSeconds: number;
    estimatedCostUsd: number;
}
