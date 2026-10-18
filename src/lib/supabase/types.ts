// src/lib/supabase/types.ts — P2-S01-T03
// Tipos do schema public gerados do catálogo REAL do Supabase psestetica
// (pg_class/pg_attribute/pg_proc consultados ao vivo em 2026-10-18).
// Equivale à saída de `supabase gen types typescript --linked`; regenerar via
// CLI na P2-S01-T04 (prova formal do diff vazio).
// NOTA: substitui o stub vazio auto-gerado — atualizado pela task, não pelo gerador.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      clinic_settings: {
        Row: {
          id: string
          clinic_id: string
          setting_key: string
          value_json: Json
          inherits_org: boolean
          version: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          setting_key: string
          value_json?: Json
          inherits_org?: boolean
          version?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clinic_settings']['Insert']>
      }
      clinics: {
        Row: {
          id: string
          organization_id: string
          name: string
          code: string
          timezone: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          code: string
          timezone?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clinics']['Insert']>
      }
      config_audit_logs: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string | null
          connection_id: string | null
          action: string
          actor_id: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id?: string | null
          connection_id?: string | null
          action: string
          actor_id?: string | null
          details?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['config_audit_logs']['Insert']>
      }
      config_versions: {
        Row: {
          id: string
          connection_id: string
          organization_id: string
          clinic_id: string | null
          version: number
          config_sanitized: Json
          secret_ref: string
          published_at: string
          published_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          organization_id: string
          clinic_id?: string | null
          version: number
          config_sanitized?: Json
          secret_ref: string
          published_at?: string
          published_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['config_versions']['Insert']>
      }
      contact_identities: {
        Row: {
          id: string
          contact_id: string
          channel: string
          external_id: string | null
          normalized_value: string
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contact_id: string
          channel: string
          external_id?: string | null
          normalized_value: string
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['contact_identities']['Insert']>
      }
      contacts: {
        Row: {
          id: string
          organization_id: string
          name: string
          primary_phone_e164: string | null
          email: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          primary_phone_e164?: string | null
          email?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
      }
      expert_patients_cache: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          phone_e164: string
          payload: Json
          result_class: string
          fetched_at: string
          expires_at: string
          invalidated: boolean
          correlation_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          phone_e164: string
          payload?: Json
          result_class?: string
          fetched_at?: string
          expires_at: string
          invalidated?: boolean
          correlation_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['expert_patients_cache']['Insert']>
      }
      external_patient_links: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          contact_id: string
          expert_patient_uuid: string
          match_method: string
          confidence: number
          linked_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          contact_id: string
          expert_patient_uuid: string
          match_method?: string
          confidence?: number
          linked_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['external_patient_links']['Insert']>
      }
      integration_connections: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string | null
          provider: string
          connection_key: string
          secret_ref: string
          config_sanitized: Json
          health_status: string
          last_tested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id?: string | null
          provider: string
          connection_key: string
          secret_ref: string
          config_sanitized?: Json
          health_status?: string
          last_tested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['integration_connections']['Insert']>
      }
      memberships: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          clinic_id: string
          role: string
          active: boolean
          created_at: string
          updated_at: string
          invite_status: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          clinic_id: string
          role: string
          active?: boolean
          created_at?: string
          updated_at?: string
          invite_status?: string
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
      }
      organizations: {
        Row: {
          id: string
          name: string
          status: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          name: string
          email: string
          clinic_name: string | null
          role: string | null
          created_at: string
          updated_at: string
          status: string
        }
        Insert: {
          id: string
          name?: string
          email?: string
          clinic_name?: string | null
          role?: string | null
          created_at?: string
          updated_at?: string
          status?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      team_members: {
        Row: {
          id: string
          team_id: string
          user_id: string
          capacity: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          capacity?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
      }
      teams: {
        Row: {
          id: string
          clinic_id: string
          name: string
          queue_type: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          name: string
          queue_type: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_connection_status: {
        Args: { p_clinic_id: string | null; p_provider: string; p_connection_key: string }
        Returns: {
          connection_id: string
          secret_ref: string
          secret_hint: string
          health_status: string
          last_tested_at: string | null
          updated_at: string
        }[]
      }
      admin_invite_user: {
        Args: { p_email: string; p_name: string; p_clinic_roles: Json }
        Returns: string
      }
      admin_list_config_versions: {
        Args: { p_clinic_id: string | null; p_provider: string; p_connection_key: string }
        Returns: { version: number; config_sanitized: Json; published_at: string }[]
      }
      admin_rollback_config: {
        Args: { p_connection_id: string; p_version: number }
        Returns: {
          connection_id: string
          restored_version: number
          health_status: string
          updated_at: string
        }[]
      }
      admin_save_integration_secret: {
        Args: {
          p_clinic_id: string | null
          p_provider: string
          p_connection_key: string
          p_secret: string
          p_config_sanitized?: Json
        }
        Returns: {
          connection_id: string
          secret_ref: string
          secret_hint: string
          health_status: string
          created: boolean
          version: number
          updated_at: string
        }[]
      }
      admin_test_connection: {
        Args: { p_clinic_id: string | null; p_provider: string; p_connection_key: string }
        Returns: {
          connection_id: string
          health_status: string
          last_tested_at: string | null
          diagnostico: Json
        }[]
      }
      effective_clinic_setting: {
        Args: { p_clinic: string; p_key: string }
        Returns: { value_json: Json | null; origin: string; setting_version: number }[]
      }
      invalidate_expert_cache: {
        Args: { p_clinic_id: string; p_phone: string }
        Returns: number
      }
      is_active_member: {
        Args: { p_org: string; p_clinic: string }
        Returns: boolean
      }
      is_clinic_member: {
        Args: { p_clinic: string }
        Returns: boolean
      }
      is_clinic_writer: {
        Args: { p_org: string; p_clinic: string }
        Returns: boolean
      }
      is_colleague: {
        Args: { p_user: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { p_org: string }
        Returns: boolean
      }
      is_org_member_for_user: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { p_org: string }
        Returns: boolean
      }
      is_org_writer: {
        Args: { p_org: string }
        Returns: boolean
      }
      link_expert_patient: {
        Args: {
          p_clinic_id: string
          p_contact_id: string
          p_expert_patient_uuid: string
          p_match_method?: string
        }
        Returns: Json
      }
      normalize_e164: {
        Args: { p_raw: string }
        Returns: string
      }
      user_org_ids: {
        Args: Record<string, never>
        Returns: string[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchemaTableNameOrOptions extends keyof DatabaseWithoutInternals['public']['Tables']
      ? DatabaseWithoutInternals['public']['Tables'][DefaultSchemaTableNameOrOptions] extends {
          Insert: infer I
        }
        ? I
        : never
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchemaTableNameOrOptions extends keyof DatabaseWithoutInternals['public']['Tables']
      ? DatabaseWithoutInternals['public']['Tables'][DefaultSchemaTableNameOrOptions] extends {
          Update: infer U
        }
        ? U
        : never
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchemaEnumNameOrOptions extends keyof DatabaseWithoutInternals['public']['Enums']
      ? DatabaseWithoutInternals['public']['Enums'][DefaultSchemaEnumNameOrOptions]
      : never
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? PublicCompositeTypeNameOrOptions extends keyof DatabaseWithoutInternals['public']['CompositeTypes']
      ? DatabaseWithoutInternals['public']['CompositeTypes'][PublicCompositeTypeNameOrOptions]
      : never
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Papéis válidos (SPEC P1-S02; CHECK memberships_role_check)
export type Papel =
  | 'owner'
  | 'clinic_admin'
  | 'manager'
  | 'sales'
  | 'reception'
  | 'post_sales'
  | 'viewer'
