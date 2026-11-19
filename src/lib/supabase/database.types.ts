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
    PostgrestVersion: "14.17"
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
      feed_items: {
        Row: {
          active: boolean
          before_url: string | null
          caption: string | null
          category: string
          created_at: string
          creator_avatar_url: string | null
          creator_handle: string | null
          creator_name: string | null
          creator_url: string | null
          has_sound: boolean
          id: string
          like_count: number
          position: number
          poster_url: string | null
          ratio: string
          recreate_count: number
          reveal_at: number | null
          rights_note: string | null
          slug: string
          source: string
          tiktok_id: string | null
          video_url: string | null
        }
        Insert: {
          active?: boolean
          before_url?: string | null
          caption?: string | null
          category?: string
          created_at?: string
          creator_avatar_url?: string | null
          creator_handle?: string | null
          creator_name?: string | null
          creator_url?: string | null
          has_sound?: boolean
          id?: string
          like_count?: number
          position?: number
          poster_url?: string | null
          ratio?: string
          recreate_count?: number
          reveal_at?: number | null
          rights_note?: string | null
          slug: string
          source: string
          tiktok_id?: string | null
          video_url?: string | null
        }
        Update: {
          active?: boolean
          before_url?: string | null
          caption?: string | null
          category?: string
          created_at?: string
          creator_avatar_url?: string | null
          creator_handle?: string | null
          creator_name?: string | null
          creator_url?: string | null
          has_sound?: boolean
          id?: string
          like_count?: number
          position?: number
          poster_url?: string | null
          ratio?: string
          recreate_count?: number
          reveal_at?: number | null
          rights_note?: string | null
          slug?: string
          source?: string
          tiktok_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      feed_reactions: {
        Row: {
          created_at: string
          item_id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_scores: {
        Row: {
          category: string
          likes: number
          recreates: number
          rewatches: number
          updated_at: string
          user_id: string
          watch_seconds: number
        }
        Insert: {
          category: string
          likes?: number
          recreates?: number
          rewatches?: number
          updated_at?: string
          user_id: string
          watch_seconds?: number
        }
        Update: {
          category?: string
          likes?: number
          recreates?: number
          rewatches?: number
          updated_at?: string
          user_id?: string
          watch_seconds?: number
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
          storyboard: Json | null
          twin_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_cost?: number
          duration_seconds?: number | null
          error?: string | null
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
          storyboard?: Json | null
          twin_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          credits_cost?: number
          duration_seconds?: number | null
          error?: string | null
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
          storyboard?: Json | null
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
      influencers: {
        Row: {
          created_at: string
          credits_cost: number
          description: string | null
          from_photo: boolean
          gender: string | null
          id: string
          image_path: string | null
          kind: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_cost?: number
          description?: string | null
          from_photo?: boolean
          gender?: string | null
          id?: string
          image_path?: string | null
          kind: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_cost?: number
          description?: string | null
          from_photo?: boolean
          gender?: string | null
          id?: string
          image_path?: string | null
          kind?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          code: string
          created_at: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      posting_plans: {
        Row: {
          account_ids: string[]
          alert_days: number
          alert_email: boolean
          last_alert_at: string | null
          locale: string
          times: string[]
          timezone: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          account_ids?: string[]
          alert_days?: number
          alert_email?: boolean
          last_alert_at?: string | null
          locale?: string
          times?: string[]
          timezone?: string
          updated_at?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          account_ids?: string[]
          alert_days?: number
          alert_email?: boolean
          last_alert_at?: string | null
          locale?: string
          times?: string[]
          timezone?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_recharge_at: string | null
          auto_recharge_failed: boolean
          auto_recharge_pack: string | null
          auto_recharge_threshold: number
          avatar_url: string | null
          created_at: string
          credits_remaining: number
          email: string
          full_name: string | null
          id: string
          onboarded_at: string | null
          onboarding: Json | null
          pay_as_you_go: boolean
          plan: string
          referred_by: string | null
          stripe_customer_id: string | null
          subscription_credits: number
          subscription_credits_expire_at: string | null
          updated_at: string
          zernio_profile_id: string | null
        }
        Insert: {
          auto_recharge_at?: string | null
          auto_recharge_failed?: boolean
          auto_recharge_pack?: string | null
          auto_recharge_threshold?: number
          avatar_url?: string | null
          created_at?: string
          credits_remaining?: number
          email: string
          full_name?: string | null
          id: string
          onboarded_at?: string | null
          onboarding?: Json | null
          pay_as_you_go?: boolean
          plan?: string
          referred_by?: string | null
          stripe_customer_id?: string | null
          subscription_credits?: number
          subscription_credits_expire_at?: string | null
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Update: {
          auto_recharge_at?: string | null
          auto_recharge_failed?: boolean
          auto_recharge_pack?: string | null
          auto_recharge_threshold?: number
          avatar_url?: string | null
          created_at?: string
          credits_remaining?: number
          email?: string
          full_name?: string | null
          id?: string
          onboarded_at?: string | null
          onboarding?: Json | null
          pay_as_you_go?: boolean
          plan?: string
          referred_by?: string | null
          stripe_customer_id?: string | null
          subscription_credits?: number
          subscription_credits_expire_at?: string | null
          updated_at?: string
          zernio_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["code"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          account_ids: string[]
          caption: string
          created_at: string
          error: string | null
          generation_id: string | null
          id: string
          results: Json | null
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string
          zernio_post_id: string | null
        }
        Insert: {
          account_ids?: string[]
          caption?: string
          created_at?: string
          error?: string | null
          generation_id?: string | null
          id?: string
          results?: Json | null
          scheduled_for: string
          status?: string
          updated_at?: string
          user_id: string
          zernio_post_id?: string | null
        }
        Update: {
          account_ids?: string[]
          caption?: string
          created_at?: string
          error?: string | null
          generation_id?: string | null
          id?: string
          results?: Json | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_id?: string
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
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
      trend_cache: {
        Row: {
          data: Json
          fetched_at: string
          key: string
        }
        Insert: {
          data: Json
          fetched_at?: string
          key: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          key?: string
        }
        Relationships: []
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
      viral_messages: {
        Row: {
          content: string
          created_at: string
          credits_cost: number
          hidden: boolean
          id: number
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          credits_cost?: number
          hidden?: boolean
          id?: never
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          credits_cost?: number
          hidden?: boolean
          id?: never
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_messages: {
        Row: {
          bot: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          bot: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          bot?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_picks: {
        Row: {
          author: string
          caption: string
          created_at: string
          day: string
          followers: number | null
          hook: Json
          how: Json
          id: string
          likes: number | null
          platform: string
          posted_at: string | null
          rank: number
          seconds: number | null
          shares: number | null
          url: string
          video_id: string
          views: number
          why: Json
        }
        Insert: {
          author: string
          caption?: string
          created_at?: string
          day: string
          followers?: number | null
          hook: Json
          how: Json
          id?: string
          likes?: number | null
          platform?: string
          posted_at?: string | null
          rank: number
          seconds?: number | null
          shares?: number | null
          url: string
          video_id: string
          views: number
          why: Json
        }
        Update: {
          author?: string
          caption?: string
          created_at?: string
          day?: string
          followers?: number | null
          hook?: Json
          how?: Json
          id?: string
          likes?: number | null
          platform?: string
          posted_at?: string | null
          rank?: number
          seconds?: number | null
          shares?: number | null
          url?: string
          video_id?: string
          views?: number
          why?: Json
        }
        Relationships: []
      }
      virality_analyses: {
        Row: {
          created_at: string
          credits_cost: number
          facts: Json | null
          generation_id: string | null
          id: string
          report: Json | null
          seconds: number | null
          status: string
          user_id: string
          video_path: string | null
        }
        Insert: {
          created_at?: string
          credits_cost?: number
          facts?: Json | null
          generation_id?: string | null
          id?: string
          report?: Json | null
          seconds?: number | null
          status?: string
          user_id: string
          video_path?: string | null
        }
        Update: {
          created_at?: string
          credits_cost?: number
          facts?: Json | null
          generation_id?: string | null
          id?: string
          report?: Json | null
          seconds?: number | null
          status?: string
          user_id?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virality_analyses_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virality_analyses_user_id_fkey"
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
      apply_subscription_credits: {
        Args: {
          p_amount_total: number
          p_credits: number
          p_currency: string
          p_expires_at: string
          p_invoice_id: string
          p_plan_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      claim_auto_recharge: {
        Args: { p_needed?: number; p_user_id: string }
        Returns: string
      }
      claim_referral: { Args: { p_code: string }; Returns: boolean }
      expire_subscription_credits: {
        Args: { p_user_id?: string }
        Returns: number
      }
      fail_generation: { Args: { p_generation_id: string }; Returns: undefined }
      fail_influencer: { Args: { p_id: string }; Returns: undefined }
      fail_virality_analysis: { Args: { p_id: string }; Returns: undefined }
      feed_track: {
        Args: {
          p_category: string
          p_likes: number
          p_recreates: number
          p_rewatches: number
          p_watch: number
        }
        Returns: undefined
      }
      max_video_seconds: { Args: { p_plan: string }; Returns: number }
      refund_swap_redo: {
        Args: { p_credits: number; p_generation_id: string }
        Returns: undefined
      }
      refund_viral_question: {
        Args: { p_message_id: number }
        Returns: undefined
      }
      social_background_tick: { Args: never; Returns: undefined }
      spend_credits: {
        Args: { p_cost: number; p_user_id: string }
        Returns: boolean
      }
      start_generation: {
        Args: {
          p_duration_seconds?: number
          p_kind?: string
          p_metadata?: Json
          p_prompt: string
          p_twin_id: string
        }
        Returns: string
      }
      start_influencer: {
        Args: {
          p_credits: number
          p_description: string
          p_from_photo: boolean
          p_gender: string
          p_kind: string
          p_user_id: string
        }
        Returns: string
      }
      start_swap_generation: {
        Args: {
          p_billed_seconds?: number
          p_characters?: number
          p_duration_seconds: number
          p_engine?: string
          p_face?: boolean
          p_frames_per_second: number
          p_hd?: boolean
          p_light?: boolean
          p_metadata?: Json
          p_quality?: string
          p_user_id: string
          p_vessel?: boolean
        }
        Returns: string
      }
      start_swap_redo: {
        Args: { p_credits: number; p_generation_id: string; p_user_id: string }
        Returns: undefined
      }
      start_virality_analysis: {
        Args: {
          p_credits: number
          p_generation_id: string
          p_seconds: number
          p_user_id: string
          p_video_path: string
        }
        Returns: string
      }
      start_viral_question: {
        Args: { p_content: string; p_credits: number; p_user_id: string }
        Returns: number
      }
      swap_background_tick: { Args: never; Returns: undefined }
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
