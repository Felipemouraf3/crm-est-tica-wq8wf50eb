// src/lib/supabase/types.ts — P2-S01-T03 + P2-S04-T02
// Tipos do schema public gerados do catálogo REAL do Supabase psestetica
// (pg_class/pg_attribute/pg_proc consultados ao vivo em 2026-10-18;
// atualizado em 2026-10-24 com conversations/messages/consents da P2-S04-T01).
// Equivale à saída de `supabase gen types typescript --linked`; regenerar via
// CLI na P2-S01-T04 (prova formal do diff vazio).

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
      consents: {
        Row: {
          id: string
          organization_id: string
          contact_id: string
          channel: string
          purpose: string
          status: string
          source: string
          captured_at: string
          captured_by: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          contact_id: string
          channel: string
          purpose: string
          status: string
          source: string
          captured_at?: string
          captured_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['consents']['Insert']>
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
      conversations: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          contact_id: string
          channel_account_id: string
          status: string
          identification: string
          expert_patient_uuid: string | null
          owner_user_id: string | null
          team_id: string | null
          automation_paused: boolean
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_message_at: string | null
          next_action_at: string | null
          unread_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          contact_id: string
          channel_account_id: string
          status?: string
          identification?: string
          expert_patient_uuid?: string | null
          owner_user_id?: string | null
          team_id?: string | null
          automation_paused?: boolean
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_message_at?: string | null
          next_action_at?: string | null
          unread_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
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
          fetched_at: string
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
          match_method: string
          confidence: number
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
      messages: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          conversation_id: string
          direction: string
          sender_type: string
          sender_user_id: string | null
          provider: string
          provider_message_id: string | null
          content_type: string
          body: string | null
          status: string
          outbound_request_id: string | null
          sent_at: string | null
          delivered_at: string | null
          read_at: string | null
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          conversation_id: string
          direction: string
          sender_type: string
          sender_user_id?: string | null
          provider: string
          provider_message_id?: string | null
          content_type?: string
          body?: string | null
          status: string
          outbound_request_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          occurred_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
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
          skills: string[]
          max_concurrent: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          capacity?: number
          skills?: string[]
          max_concurrent?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
      }
      attendant_presence: {
        Row: {
          id: string
          user_id: string
          clinic_id: string
          state: string
          active_load: number
          last_seen_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          clinic_id: string
          state?: string
          active_load?: number
          last_seen_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['attendant_presence']['Insert']>
      }
      business_closures: {
        Row: {
          id: string
          clinic_id: string
          date: string
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          date: string
          reason: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['business_closures']['Insert']>
      }
      business_hours: {
        Row: {
          id: string
          clinic_id: string
          team_id: string | null
          weekday: number
          opens_at: string
          closes_at: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          team_id?: string | null
          weekday: number
          opens_at: string
          closes_at: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['business_hours']['Insert']>
      }
      routing_policies: {
        Row: {
          id: string
          clinic_id: string
          queue_id: string
          strategy: string
          skills: string[]
          accept_timeout_seconds: number
          max_reoffers: number
          first_response_sla_minutes: number
          backup_queue_id: string | null
          escalation_role: string
          after_hours_text: string | null
          fallback_mode: string
          version: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          queue_id: string
          strategy?: string
          skills?: string[]
          accept_timeout_seconds?: number
          max_reoffers?: number
          first_response_sla_minutes?: number
          backup_queue_id?: string | null
          escalation_role?: string
          after_hours_text?: string | null
          fallback_mode?: string
          version?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['routing_policies']['Insert']>
      }
      ticket_events: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          ticket_id: string
          event_type: string
          from_user_id: string | null
          to_user_id: string | null
          reason_code: string | null
          metadata_sanitized: Json
          occurred_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          ticket_id: string
          event_type: string
          from_user_id?: string | null
          to_user_id?: string | null
          reason_code?: string | null
          metadata_sanitized?: Json
          occurred_at?: string
        }
        Update: Partial<Database['public']['Tables']['ticket_events']['Insert']>
      }
      ticket_queues: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          team_id: string
          name: string
          purpose: string
          priority_default: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          team_id: string
          name: string
          purpose: string
          priority_default?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['ticket_queues']['Insert']>
      }
      ticket_sla_events: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          ticket_id: string
          metric: string
          due_at: string
          breached_at: string | null
          acknowledged_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          ticket_id: string
          metric: string
          due_at: string
          breached_at?: string | null
          acknowledged_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['ticket_sla_events']['Insert']>
      }
      tickets: {
        Row: {
          id: string
          organization_id: string
          clinic_id: string
          conversation_id: string
          queue_id: string
          status: string
          priority: number
          handoff_reason: string
          intent: string | null
          assigned_to: string | null
          offered_to: string | null
          offer_expires_at: string | null
          reoffer_count: number
          sla_due_at: string | null
          accepted_at: string | null
          first_response_at: string | null
          resolved_at: string | null
          resolution_code: string | null
          resolution_note: string | null
          next_action_at: string | null
          version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          clinic_id: string
          conversation_id: string
          queue_id: string
          status?: string
          priority?: number
          handoff_reason: string
          intent?: string | null
          assigned_to?: string | null
          offered_to?: string | null
          offer_expires_at?: string | null
          reoffer_count?: number
          sla_due_at?: string | null
          accepted_at?: string | null
          first_response_at?: string | null
          resolved_at?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          next_action_at?: string | null
          version?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>
      }
      user_shifts: {
        Row: {
          id: string
          user_id: string
          clinic_id: string
          starts_at: string
          ends_at: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          clinic_id: string
          starts_at: string
          ends_at: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_shifts']['Insert']>
      }
      teams: {
        Row: {
>>>>>>>
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
          queue_type?: string
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
        Args: { p_connection_id: string }
        Returns: Json
      }
      admin_invite_user: {
        Args: {
          p_email: string
          p_organization_id: string
          p_clinic_id: string
          p_role: string
          p_display_name?: string
        }
        Returns: Json
      }
      admin_list_config_versions: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      admin_rollback_config: {
        Args: { p_connection_id: string; p_to_version: number }
        Returns: Json
      }
      admin_save_channel_account: {
        Args: {
          p_clinic_id: string
          p_provider: string
          p_phone_e164: string
          p_external_account_id: string
          p_external_business_id?: string
          p_display_name?: string
          p_capabilities?: Json
          p_token?: string
          p_app_secret?: string
          p_instance_token?: string
          p_client_token?: string
        }
        Returns: Json
      }
      admin_save_integration_secret: {
        Args: {
          p_provider: string
          p_connection_key: string
          p_secret: string
          p_organization_id: string
          p_clinic_id?: string
          p_config?: Json
        }
        Returns: Json
      }
      admin_set_channel_status: {
        Args: { p_channel_account_id: string; p_status: string }
        Returns: Json
      }
      admin_test_channel: {
        Args: { p_channel_account_id: string }
        Returns: Json
      }
      admin_test_connection: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      effective_clinic_setting: {
        Args: { p_clinic: string; p_key: string }
        Returns: Json
      }
      invalidate_expert_cache: {
        Args: { p_clinic: string; p_phone?: string }
        Returns: void
      }
      link_expert_patient: {
        Args: {
          p_contact: string
          p_clinic: string
          p_expert_uuid: string
          p_method: string
          p_confidence: number
        }
        Returns: uuid
      }
      normalize_e164: {
        Args: { p_raw: string }
        Returns: string
      }
      register_consent: {
        Args: {
          p_contact: string
          p_channel: string
          p_purpose: string
          p_status: string
          p_source: string
        }
        Returns: void
      }
      send_human_message: {
        Args: { p_conversation: string; p_body: string }
        Returns: string
      }
      unlink_expert_patient: {
        Args: { p_contact: string; p_clinic: string }
        Returns: void
      }
      update_presence: {
        Args: { p_clinic: string; p_state: string }
        Returns: void
      }
      open_ticket: {
        Args: { p_conversation: string; p_priority?: number; p_reason: string }
        Returns: string
      }
      admin_save_queue: {
        Args: { p_clinic: string; p_team: string; p_name: string; p_purpose: string; p_priority?: number; p_queue?: string }
        Returns: string
      }
      admin_save_hours: {
        Args: { p_clinic: string; p_weekday: number; p_opens: string; p_closes: string; p_team?: string; p_timezone?: string }
        Returns: string
      }
      admin_save_closure: {
        Args: { p_clinic: string; p_date: string; p_reason: string }
        Returns: string
      }
      admin_save_policy: {
        Args: {
          p_clinic: string
          p_queue: string
          p_strategy: string
          p_accept_timeout: number
          p_max_reoffers: number
          p_sla_minutes: number
          p_backup_queue?: string
          p_escalation_role?: string
          p_after_hours_text?: string
          p_fallback?: string
          p_skills?: string[]
        }
        Returns: string
      }
      admin_publish_policy: {
        Args: { p_clinic: string; p_policy: string }
        Returns: number
      }
      admin_rollback_policy: {
        Args: { p_clinic: string; p_queue: string }
        Returns: number
      }
      admin_list_policy_versions: {
        Args: { p_clinic: string; p_queue: string }
        Returns: { id: string; version: number; status: string; strategy: string; created_at: string }[]
      }
      has_clinic_role: {
        Args: { p_clinic: string; p_roles: string[] }
        Returns: boolean
      }
    }
  }
  Enums: {
>>>>>>>      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Papel =
  | 'owner'
  | 'clinic_admin'
  | 'sales'
  | 'reception'
  | 'post_sales'
  | 'manager'
  | 'atendente'
