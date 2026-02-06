/**
 * Domain Types & Zod Schemas
 * 
 * Business logic types with runtime validation.
 * All API inputs must be validated using these schemas.
 */

import { z } from "zod";

// ==========================================================================
// CONTENT TYPES
// ==========================================================================

export const ContentStatusSchema = z.enum(["draft", "verified"]);
export const ContentTypeSchema = z.enum(["podcast", "book", "article"]);
export const ArtifactTypeSchema = z.enum(["checklist", "plan", "script"]);

// Quick Mode JSON structure
export const QuickModeSchema = z.object({
    hook: z.string(),
    big_idea: z.string(),
    key_takeaways: z.array(z.string()),
});

export type QuickMode = z.infer<typeof QuickModeSchema>;

// ==========================================================================
// ARTIFACT PAYLOAD SCHEMAS
// ==========================================================================

// Type A: Checklist
export const ChecklistItemSchema = z.object({
    id: z.string(),
    label: z.string(),
    mandatory: z.boolean().optional().default(false),
});

export const ChecklistPayloadSchema = z.object({
    title: z.string(),
    items: z.array(ChecklistItemSchema),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type ChecklistPayload = z.infer<typeof ChecklistPayloadSchema>;

// Type B: Script/Template
export const ScriptFieldSchema = z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "textarea"]),
    placeholder: z.string().optional(),
});

export const ScriptPayloadSchema = z.object({
    title: z.string(),
    fields: z.array(ScriptFieldSchema),
});

export type ScriptField = z.infer<typeof ScriptFieldSchema>;
export type ScriptPayload = z.infer<typeof ScriptPayloadSchema>;

// ==========================================================================
// PUBLIC API SCHEMAS
// ==========================================================================

// GET /api/content query params
export const ContentQuerySchema = z.object({
    category: z.string().optional(),
    type: ContentTypeSchema.optional(),
    limit: z.coerce.number().min(1).max(100).optional().default(20),
    offset: z.coerce.number().min(0).optional().default(0),
});

export type ContentQuery = z.infer<typeof ContentQuerySchema>;

// ==========================================================================
// API RESPONSE TYPES
// ==========================================================================

export interface ContentListItem {
    id: string;
    title: string;
    type: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    duration_seconds: number | null;
    quick_mode_json: QuickMode | null;
}

export interface ContentListResponse {
    data: ContentListItem[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
}

// ==========================================================================
// DOMAIN TYPES FOR COMPONENTS
// ==========================================================================

export interface ContentItemWithSegments {
    id: string;
    type: string;
    title: string;
    source_url: string | null;
    status: string;
    category: string | null;
    quick_mode_json: QuickMode | null;
    duration_seconds: number | null;
    author: string | null;
    cover_image_url: string | null;
    segments: SegmentFull[];
    artifacts: ArtifactSummary[];
}

export interface SegmentSummary {
    id: string;
    order_index: number;
    title: string | null;
    start_time_sec: number | null;
}

export interface SegmentFull {
    id: string;
    item_id: string;
    order_index: number;
    title: string | null;
    markdown_body: string;
    start_time_sec: number | null;
    end_time_sec: number | null;
}

export interface ArtifactSummary {
    id: string;
    type: string;
    payload_schema: ChecklistPayload | ScriptPayload;
    version: number;
}

// ==========================================================================
// LOCAL STORAGE TYPES (for client-side progress tracking)
// ==========================================================================

export interface LocalProgress {
    itemId: string;
    lastSegmentId: string | null;
    completedAt: string | null;
    savedAt: string;
}

export interface LocalProgressStore {
    [itemId: string]: LocalProgress;
}
