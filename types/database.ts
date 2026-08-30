export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_message_usage: {
        Row: {
          created_at: string
          feature: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      artifact: {
        Row: {
          created_at: string
          id: string
          item_id: string
          payload_schema: Json
          type: Database["public"]["Enums"]["artifact_type"]
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          payload_schema: Json
          type: Database["public"]["Enums"]["artifact_type"]
          updated_at?: string
          version?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          payload_schema?: Json
          type?: Database["public"]["Enums"]["artifact_type"]
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_feedback: {
        Row: {
          content_id: string
          created_at: string
          details: string | null
          id: string
          is_positive: boolean
          reason: string | null
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          details?: string | null
          id?: string
          is_positive: boolean
          reason?: string | null
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          details?: string | null
          id?: string
          is_positive?: boolean
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_item: {
        Row: {
          audio_url: string | null
          author: string | null
          category: string | null
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          embedding: string | null
          hero_image_url: string | null
          id: string
          is_featured: boolean
          narration_completed_at: string | null
          narration_error: string | null
          narration_requested_at: string | null
          narration_started_at: string | null
          narration_status: string
          published_at: string | null
          quick_mode_json: Json | null
          series_id: string | null
          series_order: number | null
          source_url: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          author?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          embedding?: string | null
          hero_image_url?: string | null
          id?: string
          is_featured?: boolean
          narration_completed_at?: string | null
          narration_error?: string | null
          narration_requested_at?: string | null
          narration_started_at?: string | null
          narration_status?: string
          published_at?: string | null
          quick_mode_json?: Json | null
          series_id?: string | null
          series_order?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          author?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          embedding?: string | null
          hero_image_url?: string | null
          id?: string
          is_featured?: boolean
          narration_completed_at?: string | null
          narration_error?: string | null
          narration_requested_at?: string | null
          narration_started_at?: string | null
          narration_status?: string
          published_at?: string | null
          quick_mode_json?: Json | null
          series_id?: string | null
          series_order?: number | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_item_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "content_series"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reader_daily: {
        Row: {
          activity_date: string
          content_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          content_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reader_daily_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reader_daily_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reader_visitor_daily: {
        Row: {
          activity_date: string
          content_id: string
          created_at: string
          id: string
          visitor_id: string
        }
        Insert: {
          activity_date?: string
          content_id: string
          created_at?: string
          id?: string
          visitor_id: string
        }
        Update: {
          activity_date?: string
          content_id?: string
          created_at?: string
          id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reader_visitor_daily_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reader_visitor_daily_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reading_activity: {
        Row: {
          activity_date: string
          content_id: string
          created_at: string
          duration_seconds: number
          id: string
          reader_count: number
          updated_at: string
        }
        Insert: {
          activity_date?: string
          content_id: string
          created_at?: string
          duration_seconds?: number
          id?: string
          reader_count?: number
          updated_at?: string
        }
        Update: {
          activity_date?: string
          content_id?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          reader_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reading_activity_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reading_activity_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_request_notifications: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          processing_started_at: string | null
          provider_message_id: string | null
          queued_at: string
          request_id: string
          sent_at: string | null
          skipped_at: string | null
          status: Database["public"]["Enums"]["content_request_notification_status"]
          type: Database["public"]["Enums"]["content_request_notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          processing_started_at?: string | null
          provider_message_id?: string | null
          queued_at?: string
          request_id: string
          sent_at?: string | null
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["content_request_notification_status"]
          type?: Database["public"]["Enums"]["content_request_notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          processing_started_at?: string | null
          provider_message_id?: string | null
          queued_at?: string
          request_id?: string
          sent_at?: string | null
          skipped_at?: string | null
          status?: Database["public"]["Enums"]["content_request_notification_status"]
          type?: Database["public"]["Enums"]["content_request_notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_request_notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_request_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_request_votes: {
        Row: {
          created_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      content_requests: {
        Row: {
          admin_note: string | null
          author: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          normalized_author: string | null
          normalized_title: string
          normalized_url: string | null
          published_content_id: string | null
          source_availability_note: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["content_request_status"]
          submitted_by: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          admin_note?: string | null
          author?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          normalized_author?: string | null
          normalized_title: string
          normalized_url?: string | null
          published_content_id?: string | null
          source_availability_note?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["content_request_status"]
          submitted_by?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          admin_note?: string | null
          author?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          normalized_author?: string | null
          normalized_title?: string
          normalized_url?: string | null
          published_content_id?: string | null
          source_availability_note?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["content_request_status"]
          submitted_by?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_requests_published_content_id_fkey"
            columns: ["published_content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_requests_published_content_id_fkey"
            columns: ["published_content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      content_series: {
        Row: {
          created_at: string
          description: string | null
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_subscription: {
        Row: {
          consent_text: string
          consent_version: string
          created_at: string
          email: string
          email_normalized: string | null
          id: string
          metadata: Json
          page_path: string | null
          referrer: string | null
          source: string
          status: Database["public"]["Enums"]["email_subscription_status"]
          subscribed_at: string
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          consent_text: string
          consent_version: string
          created_at?: string
          email: string
          email_normalized?: string | null
          id?: string
          metadata?: Json
          page_path?: string | null
          referrer?: string | null
          source?: string
          status?: Database["public"]["Enums"]["email_subscription_status"]
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          consent_text?: string
          consent_version?: string
          created_at?: string
          email?: string
          email_normalized?: string | null
          id?: string
          metadata?: Json
          page_path?: string | null
          referrer?: string | null
          source?: string
          status?: Database["public"]["Enums"]["email_subscription_status"]
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      homepage_section: {
        Row: {
          created_at: string | null
          filter_type: string
          filter_value: string
          id: string
          is_active: boolean
          order_index: number
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          filter_type: string
          filter_value: string
          id?: string
          is_active?: boolean
          order_index?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          filter_type?: string
          filter_value?: string
          id?: string
          is_active?: boolean
          order_index?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_internal: boolean
          onboarding_state: Json
          reader_settings: Json | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          is_internal?: boolean
          onboarding_state?: Json
          reader_settings?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean
          onboarding_state?: Json
          reader_settings?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      reading_activity: {
        Row: {
          activity_date: string
          created_at: string
          duration_seconds: number
          id: string
          pages_read: number
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          pages_read?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          pages_read?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      segment: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_time_sec: number | null
          id: string
          item_id: string
          markdown_body: string
          order_index: number
          start_time_sec: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_time_sec?: number | null
          id?: string
          item_id: string
          markdown_body: string
          order_index: number
          start_time_sec?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_time_sec?: number | null
          id?: string
          item_id?: string
          markdown_body?: string
          order_index?: number
          start_time_sec?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_embedding_gemini: {
        Row: {
          content_item_id: string
          created_at: string | null
          embedding: string
          id: string
          segment_id: string
        }
        Insert: {
          content_item_id: string
          created_at?: string | null
          embedding: string
          id?: string
          segment_id: string
        }
        Update: {
          content_item_id?: string
          created_at?: string | null
          embedding?: string
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_embedding_gemini_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_embedding_gemini_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_embedding_gemini_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segment"
            referencedColumns: ["id"]
          },
        ]
      }
      story_image_job: {
        Row: {
          attempts: number
          completed_at: string | null
          content_id: string
          error: string | null
          id: number
          max_attempts: number
          next_attempt_at: string
          render_version: string
          requested_at: string
          started_at: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          content_id: string
          error?: string | null
          id?: never
          max_attempts?: number
          next_attempt_at?: string
          render_version: string
          requested_at?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          content_id?: string
          error?: string | null
          id?: never
          max_attempts?: number
          next_attempt_at?: string
          render_version?: string
          requested_at?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_image_job_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_image_job_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      user_highlights: {
        Row: {
          anchor_end: number | null
          anchor_start: number | null
          color: string | null
          content_item_id: string
          created_at: string | null
          highlighted_text: string
          id: string
          note_body: string | null
          segment_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          anchor_end?: number | null
          anchor_start?: number | null
          color?: string | null
          content_item_id: string
          created_at?: string | null
          highlighted_text: string
          id?: string
          note_body?: string | null
          segment_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          anchor_end?: number | null
          anchor_start?: number | null
          color?: string | null
          content_item_id?: string
          created_at?: string | null
          highlighted_text?: string
          id?: string
          note_body?: string | null
          segment_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_highlights_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_highlights_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_highlights_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segment"
            referencedColumns: ["id"]
          },
        ]
      }
      user_library: {
        Row: {
          content_id: string
          is_bookmarked: boolean | null
          last_interacted_at: string | null
          progress: Json | null
          user_id: string
        }
        Insert: {
          content_id: string
          is_bookmarked?: boolean | null
          last_interacted_at?: string | null
          progress?: Json | null
          user_id: string
        }
        Update: {
          content_id?: string
          is_bookmarked?: boolean | null
          last_interacted_at?: string | null
          progress?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_library_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content_workbench_readiness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_library_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      user_topic_preferences: {
        Row: {
          created_at: string
          source: string
          topic_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          source?: string
          topic_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          source?: string
          topic_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          request_published_email_enabled: boolean
          unsubscribe_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          request_published_email_enabled?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          request_published_email_enabled?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_content_workbench_readiness: {
        Row: {
          ai_status: string | null
          audio_url: string | null
          author: string | null
          category: string | null
          created_at: string | null
          deleted_at: string | null
          embedded_segments: number | null
          embedding: string | null
          has_content_embedding: boolean | null
          id: string | null
          is_featured: boolean | null
          missing_segments: number | null
          narration_completed_at: string | null
          narration_error: string | null
          narration_requested_at: string | null
          narration_started_at: string | null
          narration_status: string | null
          status: Database["public"]["Enums"]["content_status"] | null
          title: string | null
          total_segments: number | null
          type: Database["public"]["Enums"]["content_type"] | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_finalize_narration_generation: {
        Args: {
          p_audio_url: string
          p_completed_at: string
          p_content_id: string
          p_expected_started_at: string
          p_segment_timings?: Json
        }
        Returns: boolean
      }
      admin_update_content_graph: {
        Args: {
          p_artifacts?: Json
          p_content_id: string
          p_content_patch?: Json
          p_segments?: Json
        }
        Returns: undefined
      }
      claim_content_request_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          processing_started_at: string | null
          provider_message_id: string | null
          queued_at: string
          request_id: string
          sent_at: string | null
          skipped_at: string | null
          status: Database["public"]["Enums"]["content_request_notification_status"]
          type: Database["public"]["Enums"]["content_request_notification_type"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "content_request_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_ai_readiness_summary: {
        Args: never
        Returns: {
          ai_ready_items: number
          ai_stale_items: number
          items_without_published_segments: number
          stale_content_embeddings: number
          stale_segment_embeddings: number
          verified_items: number
        }[]
      }
      get_category_stats: {
        Args: never
        Returns: {
          category: string
          count: number
        }[]
      }
      get_gemini_segment_embedding_coverage: {
        Args: never
        Returns: {
          embedded_content_items: number
          estimated_remaining_characters: number
          missing_segments: number
          total_library_content_items: number
        }[]
      }
      get_homepage_sections_with_items: {
        Args: { p_limit?: number }
        Returns: {
          filter_type_out: string
          filter_value_out: string
          is_active_out: boolean
          items: Json
          order_index_out: number
          section_id: string
          section_title: string
        }[]
      }
      get_random_verified_content: {
        Args: never
        Returns: {
          author: string
          category: string
          cover_image_url: string
          created_at: string
          duration_seconds: number
          id: string
          quick_mode_json: Json
          source_url: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
        }[]
      }
      get_segments_missing_gemini_embeddings: {
        Args: { p_limit?: number }
        Returns: {
          content_item_id: string
          id: string
          markdown_body: string
        }[]
      }
      get_trending_content: {
        Args: {
          p_categories?: string[]
          p_limit?: number
          p_type?: Database["public"]["Enums"]["content_type"]
        }
        Returns: {
          author: string
          category: string
          cover_image_url: string
          created_at: string
          duration_seconds: number
          id: string
          quick_mode_json: Json
          title: string
          type: Database["public"]["Enums"]["content_type"]
        }[]
      }
      increment_reading_activity: {
        Args: { p_activity_date: string; p_duration_seconds: number }
        Returns: undefined
      }
      increment_reading_activity_for_user: {
        Args: {
          p_activity_date: string
          p_duration_seconds: number
          p_user_id: string
        }
        Returns: undefined
      }
      insert_generated_content: {
        Args: {
          p_author?: string
          p_category?: string
          p_quick_mode_json?: Json
          p_segments?: Json
          p_status?: Database["public"]["Enums"]["content_status"]
          p_title: string
          p_type: Database["public"]["Enums"]["content_type"]
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      log_anonymous_reading_activity: {
        Args: {
          p_activity_date: string
          p_content_id: string
          p_duration_seconds: number
          p_visitor_id: string
        }
        Returns: undefined
      }
      log_reading_activity: {
        Args: {
          p_activity_date: string
          p_content_id: string
          p_duration_seconds: number
        }
        Returns: undefined
      }
      log_reading_activity_for_user: {
        Args: {
          p_activity_date: string
          p_content_id: string
          p_duration_seconds: number
          p_user_id: string
        }
        Returns: undefined
      }
      match_library_segments_gemini: {
        Args: {
          match_count: number
          match_threshold: number
          p_boost_completed?: boolean
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          content_item_id: string
          segment_id: string
          similarity: number
        }[]
      }
      match_recommendations: {
        Args: {
          exclude_ids?: string[]
          match_count?: number
          seed_ids: string[]
        }
        Returns: {
          audio_url: string
          author: string
          category: string
          cover_image_url: string
          created_at: string
          deleted_at: string
          duration_seconds: number
          hero_image_url: string
          id: string
          is_featured: boolean
          published_at: string
          quick_mode_json: Json
          similarity: number
          source_url: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
        }[]
      }
      queue_content_request_published_notifications: {
        Args: { p_request_id: string }
        Returns: number
      }
      set_onboarding_state: {
        Args: { p_status: string; p_tour: string; p_version: string }
        Returns: Json
      }
      submit_content_request: {
        Args: {
          p_author: string
          p_content_type: Database["public"]["Enums"]["content_type"]
          p_normalized_author: string
          p_normalized_title: string
          p_normalized_url: string
          p_source_url: string
          p_thumbnail_url: string
          p_title: string
          p_user_id: string
        }
        Returns: {
          duplicate: boolean
          request_id: string
          voted: boolean
        }[]
      }
      subscribe_email_subscription: {
        Args: {
          p_consent_text: string
          p_consent_version: string
          p_email: string
          p_page_path: string | null
          p_referrer: string | null
          p_source: string
          p_user_agent: string | null
        }
        Returns: undefined
      }
      unsubscribe_email_subscription_by_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      unsubscribe_request_published_notifications_by_token: {
        Args: { p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      artifact_type: "checklist" | "plan" | "script"
      content_request_notification_status:
        | "queued"
        | "processing"
        | "sent"
        | "failed"
        | "skipped"
      content_request_notification_type: "published"
      content_request_status:
        | "pending"
        | "processing"
        | "published"
        | "skipped"
        | "failed"
      content_status: "draft" | "verified"
      content_type: "podcast" | "book" | "article" | "video"
      email_subscription_status: "subscribed" | "unsubscribed"
      user_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      artifact_type: ["checklist", "plan", "script"],
      content_request_notification_status: [
        "queued",
        "processing",
        "sent",
        "failed",
        "skipped",
      ],
      content_request_notification_type: ["published"],
      content_request_status: [
        "pending",
        "processing",
        "published",
        "skipped",
        "failed",
      ],
      content_status: ["draft", "verified"],
      content_type: ["podcast", "book", "article", "video"],
      email_subscription_status: ["subscribed", "unsubscribed"],
      user_role: ["user", "admin"],
    },
  },
} as const

export type ContentType = Database["public"]["Enums"]["content_type"];
export type ArtifactType = Database["public"]["Enums"]["artifact_type"];
export type ContentStatus = Database["public"]["Enums"]["content_status"];
export type EmailSubscriptionStatus = Database["public"]["Enums"]["email_subscription_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];

// Convenience types for table rows
export type ContentItem = Database["public"]["Tables"]["content_item"]["Row"];
export type ContentSeries = Database["public"]["Tables"]["content_series"]["Row"];
export type Segment = Database["public"]["Tables"]["segment"]["Row"];
export type Artifact = Database["public"]["Tables"]["artifact"]["Row"];
export type HomepageSection = Database["public"]["Tables"]["homepage_section"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ContentFeedback = Database["public"]["Tables"]["content_feedback"]["Row"];
export type UserHighlight = Database["public"]["Tables"]["user_highlights"]["Row"];
