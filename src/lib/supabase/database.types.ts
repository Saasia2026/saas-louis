// Généré depuis Supabase (MCP generate_typescript_types). Ne pas éditer à la main.

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          created_at: string
          error: string | null
          id: string
          name: string
          sora_character_id: string | null
          status: string
          user_id: string
          video_path: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          name: string
          sora_character_id?: string | null
          status?: string
          user_id: string
          video_path: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          name?: string
          sora_character_id?: string | null
          status?: string
          user_id?: string
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purchases: {
        Row: {
          amount_total: number
          created_at: string
          credits: number
          currency: string
          pack_id: string
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          amount_total: number
          created_at?: string
          credits: number
          currency: string
          pack_id: string
          stripe_session_id: string
          user_id: string
        }
        Update: {
          amount_total?: number
          created_at?: string
          credits?: number
          currency?: string
          pack_id?: string
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      director_conversations: {
        Row: {
          created_at: string
          handoff: Json | null
          id: string
          ideas: Json
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          handoff?: Json | null
          id?: string
          ideas?: Json
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          handoff?: Json | null
          id?: string
          ideas?: Json
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      director_usage: {
        Row: {
          day: string
          messages: number
          user_id: string
        }
        Insert: {
          day?: string
          messages?: number
          user_id: string
        }
        Update: {
          day?: string
          messages?: number
          user_id?: string
        }
        Relationships: []
      }
      generation_shots: {
        Row: {
          attempts: number
          clip_path: string | null
          created_at: string
          duration_seconds: number
          end_image_attempts: number
          end_image_path: string | null
          end_image_prediction_id: string | null
          end_image_prompt: string | null
          generation_id: string
          id: string
          image_path: string | null
          image_prediction_id: string | null
          image_prompt: string
          motion_prompt: string
          position: number
          stage: string
          summary: string
          user_id: string
          video_attempts: number
          video_prediction_id: string | null
        }
        Insert: {
          attempts?: number
          clip_path?: string | null
          created_at?: string
          duration_seconds: number
          end_image_attempts?: number
          end_image_path?: string | null
          end_image_prediction_id?: string | null
          end_image_prompt?: string | null
          generation_id: string
          id?: string
          image_path?: string | null
          image_prediction_id?: string | null
          image_prompt: string
          motion_prompt: string
          position: number
          stage?: string
          summary?: string
          user_id: string
          video_attempts?: number
          video_prediction_id?: string | null
        }
        Update: {
          attempts?: number
          clip_path?: string | null
          created_at?: string
          duration_seconds?: number
          end_image_attempts?: number
          end_image_path?: string | null
          end_image_prediction_id?: string | null
          end_image_prompt?: string | null
          generation_id?: string
          id?: string
          image_path?: string | null
          image_prediction_id?: string | null
          image_prompt?: string
          motion_prompt?: string
          position?: number
          stage?: string
          summary?: string
          user_id?: string
          video_attempts?: number
          video_prediction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_shots_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_shots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          created_at: string
          credits_cost: number
          duration_seconds: number | null
          error: string | null
          storyboard: Json | null
          id: string
          image_url: string | null
          kind: string
          metadata: Json
          negative_prompt: string | null
          poster_path: string | null
          prompt: string
          replicate_prediction_id: string | null
          stage: string
          status: string
          storage_path: string | null
          twin_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_cost?: number
          duration_seconds?: number | null
          error?: string | null
          storyboard?: Json | null
          id?: string
          image_url?: string | null
          kind?: string
          metadata?: Json
          negative_prompt?: string | null
          poster_path?: string | null
          prompt: string
          replicate_prediction_id?: string | null
          stage?: string
          status?: string
          storage_path?: string | null
          twin_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          credits_cost?: number
          duration_seconds?: number | null
          error?: string | null
          storyboard?: Json | null
          id?: string
          image_url?: string | null
          kind?: string
          metadata?: Json
          negative_prompt?: string | null
          poster_path?: string | null
          prompt?: string
          replicate_prediction_id?: string | null
          stage?: string
          status?: string
          storage_path?: string | null
          twin_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits_remaining: number
          email: string
          full_name: string | null
          id: string
          plan: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits_remaining?: number
          email: string
          full_name?: string | null
          id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits_remaining?: number
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_photos: {
        Row: {
          file_name: string
          id: string
          storage_path: string
          twin_id: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_name: string
          id?: string
          storage_path: string
          twin_id: string
          uploaded_at?: string
          user_id?: string
        }
        Update: {
          file_name?: string
          id?: string
          storage_path?: string
          twin_id?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_photos_twin_id_fkey"
            columns: ["twin_id"]
            isOneToOne: false
            referencedRelation: "twins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      twins: {
        Row: {
          appearance: string | null
          consent_confirmed_at: string | null
          created_at: string
          fal_lora_url: string | null
          id: string
          model_attempts: number
          model_image_path: string | null
          model_path: string | null
          model_prediction_id: string | null
          model_status: string | null
          name: string
          replicate_model_version: string | null
          replicate_training_id: string | null
          status: string
          training_completed_at: string | null
          training_started_at: string | null
          user_id: string
        }
        Insert: {
          appearance?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          fal_lora_url?: string | null
          id?: string
          model_attempts?: number
          model_image_path?: string | null
          model_path?: string | null
          model_prediction_id?: string | null
          model_status?: string | null
          name?: string
          replicate_model_version?: string | null
          replicate_training_id?: string | null
          status?: string
          training_completed_at?: string | null
          training_started_at?: string | null
          user_id?: string
        }
        Update: {
          appearance?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          fal_lora_url?: string | null
          id?: string
          model_attempts?: number
          model_image_path?: string | null
          model_path?: string | null
          model_prediction_id?: string | null
          model_status?: string | null
          name?: string
          replicate_model_version?: string | null
          replicate_training_id?: string | null
          status?: string
          training_completed_at?: string | null
          training_started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_credit_purchase: {
        Args: {
          p_amount_total: number
          p_credits: number
          p_currency: string
          p_pack_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      fail_generation: { Args: { p_generation_id: string }; Returns: undefined }
      max_video_seconds: { Args: { p_plan: string }; Returns: number }
      start_generation: {
        Args: {
          p_duration_seconds?: number
          p_kind?: string
          p_metadata?: Json
          p_prompt: string
          p_twin_id: string | null
        }
        Returns: string
      }
      start_swap_generation: {
        Args: {
          p_billed_seconds?: number
          p_duration_seconds: number
          p_engine?: string
          p_frames_per_second: number
          p_metadata?: Json
          p_user_id: string
        }
        Returns: string
      }
      start_swap_redo: {
        Args: { p_credits: number; p_generation_id: string; p_user_id: string }
        Returns: undefined
      }
      refund_swap_redo: {
        Args: { p_credits: number; p_generation_id: string }
        Returns: undefined
      }
      use_director_message: { Args: never; Returns: number }
      video_model_credits_per_second: {
        Args: { p_video_model: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
