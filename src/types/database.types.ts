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
    PostgrestVersion: "14.18"
  }
  private: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_event_role: { Args: { allowed_roles: string[] }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_roles: {
        Row: {
          created_at: string
          created_by: string | null
          is_active: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_method: string
          checked_in_at: string
          checked_in_by: string
          participant_id: string
        }
        Insert: {
          check_in_method?: string
          checked_in_at?: string
          checked_in_by: string
          participant_id: string
        }
        Update: {
          check_in_method?: string
          checked_in_at?: string
          checked_in_by?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: []
      }
      development_log_entries: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string
          github_commit: string | null
          github_url: string | null
          id: string
          occurred_at: string | null
          session_id: string | null
          status: string
          supabase_reference: string | null
          time_precision: string
          title: string
          updated_at: string
          work_date: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description: string
          github_commit?: string | null
          github_url?: string | null
          id?: string
          occurred_at?: string | null
          session_id?: string | null
          status?: string
          supabase_reference?: string | null
          time_precision?: string
          title: string
          updated_at?: string
          work_date?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          github_commit?: string | null
          github_url?: string | null
          id?: string
          occurred_at?: string | null
          session_id?: string | null
          status?: string
          supabase_reference?: string | null
          time_precision?: string
          title?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_log_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "development_log_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      development_log_sessions: {
        Row: {
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          notes: string | null
          paused_at: string | null
          paused_seconds: number
          started_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          paused_seconds?: number
          started_at?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          paused_seconds?: number
          started_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      display_devices: {
        Row: {
          created_at: string
          created_by: string | null
          device_name: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          paired_at: string | null
          pairing_token_hash: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_name: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          paired_at?: string | null
          pairing_token_hash: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_name?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          paired_at?: string | null
          pairing_token_hash?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      display_state: {
        Row: {
          active_controller_user_id: string | null
          controller_lease_expires_at: string | null
          id: number
          payload: Json
          scene: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_controller_user_id?: string | null
          controller_lease_expires_at?: string | null
          id?: number
          payload?: Json
          scene?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_controller_user_id?: string | null
          controller_lease_expires_at?: string | null
          id?: number
          payload?: Json
          scene?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      draw_entries: {
        Row: {
          created_at: string
          draw_round_id: string
          id: string
          participant_id: string
        }
        Insert: {
          created_at?: string
          draw_round_id: string
          id?: string
          participant_id: string
        }
        Update: {
          created_at?: string
          draw_round_id?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_entries_draw_round_id_fkey"
            columns: ["draw_round_id"]
            isOneToOne: false
            referencedRelation: "draw_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_entries_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_rounds: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          pool_type: string
          prize_category_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          pool_type: string
          prize_category_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          pool_type?: string
          prize_category_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_rounds_prize_category_id_fkey"
            columns: ["prize_category_id"]
            isOneToOne: false
            referencedRelation: "prize_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_winners: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          draw_round_id: string
          drawn_at: string
          id: string
          notes: string | null
          participant_id: string
          prize_category_id: string
          skipped_at: string | null
          skipped_by: string | null
          status: string
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          draw_round_id: string
          drawn_at?: string
          id?: string
          notes?: string | null
          participant_id: string
          prize_category_id: string
          skipped_at?: string | null
          skipped_by?: string | null
          status?: string
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          draw_round_id?: string
          drawn_at?: string
          id?: string
          notes?: string | null
          participant_id?: string
          prize_category_id?: string
          skipped_at?: string | null
          skipped_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_winners_draw_round_id_prize_category_id_fkey"
            columns: ["draw_round_id", "prize_category_id"]
            isOneToOne: false
            referencedRelation: "draw_rounds"
            referencedColumns: ["id", "prize_category_id"]
          },
          {
            foreignKeyName: "draw_winners_must_be_draw_entry"
            columns: ["draw_round_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "draw_entries"
            referencedColumns: ["draw_round_id", "participant_id"]
          },
          {
            foreignKeyName: "draw_winners_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_invitations: {
        Row: {
          last_error: string | null
          participant_id: string
          sent_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          last_error?: string | null
          participant_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          last_error?: string | null
          participant_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_invitations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          category: string
          created_at: string
          email: string | null
          form_timestamp: string | null
          full_name: string
          gender: string | null
          ic_number: string | null
          id: string
          is_active: boolean
          manual_revised_at: string | null
          notes: string | null
          organisation: string | null
          participant_code: string
          race: string | null
          student_id: string | null
          university_name: string | null
          phone: string | null
          qr_token: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          email?: string | null
          form_timestamp?: string | null
          full_name: string
          gender?: string | null
          ic_number?: string | null
          id?: string
          is_active?: boolean
          manual_revised_at?: string | null
          notes?: string | null
          organisation?: string | null
          participant_code: string
          race?: string | null
          student_id?: string | null
          university_name?: string | null
          phone?: string | null
          qr_token?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          form_timestamp?: string | null
          full_name?: string
          gender?: string | null
          ic_number?: string | null
          id?: string
          is_active?: boolean
          manual_revised_at?: string | null
          notes?: string | null
          organisation?: string | null
          participant_code?: string
          race?: string | null
          student_id?: string | null
          university_name?: string | null
          phone?: string | null
          qr_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      prize_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          is_enabled: boolean
          p256dh: string
          participant_id: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          is_enabled?: boolean
          p256dh: string
          participant_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_enabled?: boolean
          p256dh?: string
          participant_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_display_controller: {
        Args: { p_lease_seconds?: number }
        Returns: { acquired: boolean; controller_user_id: string | null; lease_expires_at: string | null }[]
      }
      release_display_controller: { Args: Record<PropertyKey, never>; Returns: boolean }
      clear_participant_directory: { Args: Record<PropertyKey, never>; Returns: Json }
      delete_participant_permanently: { Args: { p_participant_id: string }; Returns: boolean }
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
  private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
