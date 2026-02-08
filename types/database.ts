/**
 * Database Types - Auto-generated from Supabase schema
 * 
 * These types match the database schema defined in migrations.
 * In production, regenerate with: npx supabase gen types typescript
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type ContentStatus = "draft" | "verified";
export type ContentType = "podcast" | "book" | "article";
export type ArtifactType = "checklist" | "plan" | "script";

export interface Database {
    public: {
        Tables: {
            content_item: {
                Row: {
                    id: string;
                    type: ContentType;
                    title: string;
                    source_url: string | null;
                    status: ContentStatus;
                    quick_mode_json: Json | null;
                    duration_seconds: number | null;
                    author: string | null;
                    cover_image_url: string | null;
                    category: string | null;
                    is_featured: boolean;
                    created_at: string;
                    updated_at: string;
                    deleted_at: string | null;
                };
                Insert: {
                    id?: string;
                    type: ContentType;
                    title: string;
                    source_url?: string | null;
                    status?: ContentStatus;
                    quick_mode_json?: Json | null;
                    duration_seconds?: number | null;
                    author?: string | null;
                    cover_image_url?: string | null;
                    category?: string | null;
                    is_featured?: boolean;
                    created_at?: string;
                    updated_at?: string;
                    deleted_at?: string | null;
                };
                Update: {
                    id?: string;
                    type?: ContentType;
                    title?: string;
                    source_url?: string | null;
                    status?: ContentStatus;
                    quick_mode_json?: Json | null;
                    duration_seconds?: number | null;
                    author?: string | null;
                    cover_image_url?: string | null;
                    category?: string | null;
                    is_featured?: boolean;
                    created_at?: string;
                    updated_at?: string;
                    deleted_at?: string | null;
                };
            };
            segment: {
                Row: {
                    id: string;
                    item_id: string;
                    order_index: number;
                    title: string | null;
                    markdown_body: string;
                    start_time_sec: number | null;
                    end_time_sec: number | null;
                    created_at: string;
                    updated_at: string;
                    deleted_at: string | null;
                };
                Insert: {
                    id?: string;
                    item_id: string;
                    order_index: number;
                    title?: string | null;
                    markdown_body: string;
                    start_time_sec?: number | null;
                    end_time_sec?: number | null;
                    created_at?: string;
                    updated_at?: string;
                    deleted_at?: string | null;
                };
                Update: {
                    id?: string;
                    item_id?: string;
                    order_index?: number;
                    title?: string | null;
                    markdown_body?: string;
                    start_time_sec?: number | null;
                    end_time_sec?: number | null;
                    created_at?: string;
                    updated_at?: string;
                    deleted_at?: string | null;
                };
            };
            artifact: {
                Row: {
                    id: string;
                    item_id: string;
                    type: ArtifactType;
                    payload_schema: Json;
                    version: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    item_id: string;
                    type: ArtifactType;
                    payload_schema: Json;
                    version?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    item_id?: string;
                    type?: ArtifactType;
                    payload_schema?: Json;
                    version?: string;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            homepage_section: {
                Row: {
                    id: string;
                    title: string;
                    filter_type: "author" | "category" | "title" | "featured";
                    filter_value: string;
                    order_index: number;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    title: string;
                    filter_type: "author" | "category" | "title" | "featured";
                    filter_value: string;
                    order_index?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    title?: string;
                    filter_type?: "author" | "category" | "title" | "featured";
                    filter_value?: string;
                    order_index?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: {
            content_status: ContentStatus;
            content_type: ContentType;
            artifact_type: ArtifactType;
        };
    };
}

// Convenience types for table rows
export type ContentItem = Database["public"]["Tables"]["content_item"]["Row"];
export type Segment = Database["public"]["Tables"]["segment"]["Row"];
export type Artifact = Database["public"]["Tables"]["artifact"]["Row"];
export type HomepageSection = Database["public"]["Tables"]["homepage_section"]["Row"];
