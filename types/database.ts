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
          quick_mode_json: Json | null
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
          quick_mode_json?: Json | null
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
          quick_mode_json?: Json | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
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
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
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
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_embedding: {
        Row: {
          content_item_id: string
          created_at: string | null
          embedding: string | null
          id: string
          segment_id: string
        }
        Insert: {
          content_item_id: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          segment_id: string
        }
        Update: {
          content_item_id?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_embedding_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_embedding_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segment"
            referencedColumns: ["id"]
          },
        ]
      }
      user_highlights: {
        Row: {
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
            referencedRelation: "content_item"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_category_stats: {
        Args: never
        Returns: {
          category: string
          count: number
        }[]
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
      match_library_segments: {
        Args: {
          match_count: number
          match_threshold: number
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
        Args: { completed_ids: string[]; match_count?: number }
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
          quick_mode_json: Json
          similarity: number
          source_url: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
        }[]
      }
    }
    Enums: {
      artifact_type: "checklist" | "plan" | "script"
      content_status: "draft" | "verified"
      content_type: "podcast" | "book" | "article" | "video"
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
      content_status: ["draft", "verified"],
      content_type: ["podcast", "book", "article", "video"],
      user_role: ["user", "admin"],
    },
  },
} as const

export type ContentType = Database["public"]["Enums"]["content_type"];
export type ArtifactType = Database["public"]["Enums"]["artifact_type"];
export type ContentStatus = Database["public"]["Enums"]["content_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];

// Convenience types for table rows
export type ContentItem = Database["public"]["Tables"]["content_item"]["Row"];
export type Segment = Database["public"]["Tables"]["segment"]["Row"];
export type Artifact = Database["public"]["Tables"]["artifact"]["Row"];
export type HomepageSection = Database["public"]["Tables"]["homepage_section"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ContentFeedback = Database["public"]["Tables"]["content_feedback"]["Row"];
export type UserHighlight = Database["public"]["Tables"]["user_highlights"]["Row"];
