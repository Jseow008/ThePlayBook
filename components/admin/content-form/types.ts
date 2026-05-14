import type { Artifact } from "@/components/admin/ArtifactEditor";
import type { NarrationJobStatus } from "@/lib/narration-job";

export interface Segment {
    id?: string;
    client_id: string;
    order_index: number;
    title: string;
    markdown_body: string;
    start_time_sec?: number;
    end_time_sec?: number;
}

export interface QuickModeJson {
    hook: string;
    big_idea: string;
    key_takeaways: string[];
}

export type UploadZone = "cover" | "hero" | "audio";

export interface ContentFormData {
    id?: string;
    title: string;
    author: string;
    type: "podcast" | "book" | "article" | "video";
    category: string;
    series_id: string;
    series_order: number | null;
    source_url: string;
    cover_image_url: string;
    hero_image_url: string;
    audio_url: string;
    narration_status: NarrationJobStatus;
    narration_error: string | null;
    narration_requested_at: string | null;
    narration_started_at: string | null;
    narration_completed_at: string | null;
    duration_seconds: number | null;
    status: "draft" | "verified";
    is_featured: boolean;
    quick_mode_json: QuickModeJson | null;
    segments: Segment[];
    artifacts: Artifact[];
}
