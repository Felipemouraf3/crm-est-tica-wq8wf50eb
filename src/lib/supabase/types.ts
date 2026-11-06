// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      activities: {
        Row: {
          actor_id: string | null
          clinic_id: string
          contact_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          kind: string
          occurred_at: string
          organization_id: string
          payload: Json
          summary: string
        }
        Insert: {
          actor_id?: string | null
          clinic_id: string
          contact_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          kind: string
          occurred_at?: string
          organization_id: string
          payload?: Json
          summary: string
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          contact_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          kind?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activities_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      agent_clinic_configs: {
        Row: {
          agent_key: string
          budgets: Json
          clinic_id: string
          created_at: string
          enabled: boolean
          id: string
          model_policy: Json
          organization_id: string
          prompt_version_id: string | null
          status: string
          thresholds: Json
          updated_at: string
          version: number
        }
        Insert: {
          agent_key: string
          budgets?: Json
          clinic_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          model_policy?: Json
          organization_id: string
          prompt_version_id?: string | null
          status?: string
          thresholds?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          agent_key?: string
          budgets?: Json
          clinic_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          model_policy?: Json
          organization_id?: string
          prompt_version_id?: string | null
          status?: string
          thresholds?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'agent_clinic_configs_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      agent_decisions: {
        Row: {
          confidence: number | null
          created_at: string
          decision_type: string
          guard_effect: string | null
          guard_reason: string | null
          human_outcome: string | null
          id: string
          knowledge_item_id: string | null
          run_id: string
          value: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          decision_type: string
          guard_effect?: string | null
          guard_reason?: string | null
          human_outcome?: string | null
          id?: string
          knowledge_item_id?: string | null
          run_id: string
          value?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          decision_type?: string
          guard_effect?: string | null
          guard_reason?: string | null
          human_outcome?: string | null
          id?: string
          knowledge_item_id?: string | null
          run_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'agent_decisions_run_id_fkey'
            columns: ['run_id']
            isOneToOne: false
            referencedRelation: 'agent_runs'
            referencedColumns: ['id']
          },
        ]
      }
      agent_definitions: {
        Row: {
          created_at: string
          id: string
          key: string
          max_autonomy: string
          name: string
          output_schema: Json | null
          status: string
          tool_allowlist: string[]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          max_autonomy?: string
          name: string
          output_schema?: Json | null
          status?: string
          tool_allowlist?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          max_autonomy?: string
          name?: string
          output_schema?: Json | null
          status?: string
          tool_allowlist?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_key: string
          agent_version: number
          clinic_id: string
          correlation_id: string | null
          cost_cents: number | null
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          input_tokens: number | null
          organization_id: string
          output_tokens: number | null
          prompt_version_id: string | null
          started_at: string | null
          status: string
          trigger_ref: string | null
          updated_at: string
        }
        Insert: {
          agent_key: string
          agent_version?: number
          clinic_id: string
          correlation_id?: string | null
          cost_cents?: number | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          organization_id: string
          output_tokens?: number | null
          prompt_version_id?: string | null
          started_at?: string | null
          status?: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Update: {
          agent_key?: string
          agent_version?: number
          clinic_id?: string
          correlation_id?: string | null
          cost_cents?: number | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          organization_id?: string
          output_tokens?: number | null
          prompt_version_id?: string | null
          started_at?: string | null
          status?: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_code: string | null
          id: string
          run_id: string
          status: string
          step: number
          tool: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          run_id: string
          status: string
          step: number
          tool: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          run_id?: string
          status?: string
          step?: number
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: 'agent_steps_run_id_fkey'
            columns: ['run_id']
            isOneToOne: false
            referencedRelation: 'agent_runs'
            referencedColumns: ['id']
          },
        ]
      }
      ai_suggestions: {
        Row: {
          agent_run_id: string
          clinic_id: string
          confidence: number | null
          content: Json
          conversation_id: string
          created_at: string
          edited_content: string | null
          guard_effect: string | null
          guard_reason: string | null
          id: string
          kind: string
          message_id: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          agent_run_id: string
          clinic_id: string
          confidence?: number | null
          content: Json
          conversation_id: string
          created_at?: string
          edited_content?: string | null
          guard_effect?: string | null
          guard_reason?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          agent_run_id?: string
          clinic_id?: string
          confidence?: number | null
          content?: Json
          conversation_id?: string
          created_at?: string
          edited_content?: string | null
          guard_effect?: string | null
          guard_reason?: string | null
          id?: string
          kind?: string
          message_id?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_suggestions_agent_run_id_fkey'
            columns: ['agent_run_id']
            isOneToOne: false
            referencedRelation: 'agent_runs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_suggestions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_suggestions_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_suggestions_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_suggestions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_suggestions_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      appointment_links: {
        Row: {
          appointment_expert_uuid: string
          clinic_id: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          linked_at: string
          linked_kind: string
          opportunity_id: string | null
          organization_id: string
          patient_expert_uuid: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_expert_uuid: string
          clinic_id: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          linked_at?: string
          linked_kind?: string
          opportunity_id?: string | null
          organization_id: string
          patient_expert_uuid?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_expert_uuid?: string
          clinic_id?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          linked_at?: string
          linked_kind?: string
          opportunity_id?: string | null
          organization_id?: string
          patient_expert_uuid?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'appointment_links_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_links_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_links_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_links_opportunity_id_fkey'
            columns: ['opportunity_id']
            isOneToOne: false
            referencedRelation: 'opportunities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_links_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_links_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      appointments_mirror: {
        Row: {
          clinic_id: string | null
          created_at: string
          ends_at: string
          expert_updated_at: string | null
          expert_uuid: string
          id: string
          organization_id: string
          patient_expert_uuid: string | null
          patient_name: string | null
          patient_phone_e164: string | null
          procedure_expert_ids: number[]
          procedure_names: string[]
          professional_expert_uuid: string | null
          room_expert_id: number | null
          source: string | null
          starts_at: string
          status: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          ends_at: string
          expert_updated_at?: string | null
          expert_uuid: string
          id?: string
          organization_id: string
          patient_expert_uuid?: string | null
          patient_name?: string | null
          patient_phone_e164?: string | null
          procedure_expert_ids?: number[]
          procedure_names?: string[]
          professional_expert_uuid?: string | null
          room_expert_id?: number | null
          source?: string | null
          starts_at: string
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          ends_at?: string
          expert_updated_at?: string | null
          expert_uuid?: string
          id?: string
          organization_id?: string
          patient_expert_uuid?: string | null
          patient_name?: string | null
          patient_phone_e164?: string | null
          procedure_expert_ids?: number[]
          procedure_names?: string[]
          professional_expert_uuid?: string | null
          room_expert_id?: number | null
          source?: string | null
          starts_at?: string
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_mirror_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_mirror_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      attendant_presence: {
        Row: {
          active_load: number
          clinic_id: string
          id: string
          last_seen_at: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_load?: number
          clinic_id: string
          id?: string
          last_seen_at?: string
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_load?: number
          clinic_id?: string
          id?: string
          last_seen_at?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attendant_presence_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      business_closures: {
        Row: {
          clinic_id: string
          created_at: string
          date: string
          id: string
          reason: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date: string
          id?: string
          reason: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_closures_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      business_hours: {
        Row: {
          clinic_id: string
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          team_id: string | null
          timezone: string
          updated_at: string
          weekday: number
        }
        Insert: {
          clinic_id: string
          closes_at: string
          created_at?: string
          id?: string
          opens_at: string
          team_id?: string | null
          timezone?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          clinic_id?: string
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          team_id?: string | null
          timezone?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: 'business_hours_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_hours_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      channel_accounts: {
        Row: {
          capabilities: Json
          clinic_id: string
          created_at: string
          display_name: string | null
          external_account_id: string
          external_business_id: string | null
          id: string
          integration_connection_id: string
          last_error_code: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_status_at: string | null
          organization_id: string
          phone_e164: string
          provider: string
          status: string
          updated_at: string
          webhook_secret_ref: string
        }
        Insert: {
          capabilities?: Json
          clinic_id: string
          created_at?: string
          display_name?: string | null
          external_account_id: string
          external_business_id?: string | null
          id?: string
          integration_connection_id: string
          last_error_code?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_status_at?: string | null
          organization_id: string
          phone_e164: string
          provider: string
          status?: string
          updated_at?: string
          webhook_secret_ref: string
        }
        Update: {
          capabilities?: Json
          clinic_id?: string
          created_at?: string
          display_name?: string | null
          external_account_id?: string
          external_business_id?: string | null
          id?: string
          integration_connection_id?: string
          last_error_code?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_status_at?: string | null
          organization_id?: string
          phone_e164?: string
          provider?: string
          status?: string
          updated_at?: string
          webhook_secret_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: 'channel_accounts_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'channel_accounts_integration_connection_id_fkey'
            columns: ['integration_connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'channel_accounts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      clinic_settings: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          inherits_org: boolean
          setting_key: string
          status: string
          updated_at: string
          value_json: Json
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          inherits_org?: boolean
          setting_key: string
          status?: string
          updated_at?: string
          value_json?: Json
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          inherits_org?: boolean
          setting_key?: string
          status?: string
          updated_at?: string
          value_json?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'clinic_settings_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      clinics: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clinics_PSR_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      config_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          clinic_id: string | null
          connection_id: string | null
          created_at: string
          details: Json
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          clinic_id?: string | null
          connection_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          clinic_id?: string | null
          connection_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      config_change_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          requested_by: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      config_versions: {
        Row: {
          clinic_id: string | null
          config_sanitized: Json
          connection_id: string
          created_at: string
          id: string
          organization_id: string
          published_at: string
          published_by: string | null
          secret_ref: string
          version: number
        }
        Insert: {
          clinic_id?: string | null
          config_sanitized?: Json
          connection_id: string
          created_at?: string
          id?: string
          organization_id: string
          published_at?: string
          published_by?: string | null
          secret_ref: string
          version: number
        }
        Update: {
          clinic_id?: string | null
          config_sanitized?: Json
          connection_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          published_at?: string
          published_by?: string | null
          secret_ref?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'config_versions_connection_id_fkey'
            columns: ['connection_id']
            isOneToOne: false
            referencedRelation: 'integration_connections'
            referencedColumns: ['id']
          },
        ]
      }
      consents: {
        Row: {
          captured_at: string
          captured_by: string | null
          channel: string
          contact_id: string
          id: string
          organization_id: string
          purpose: string
          source: string
          status: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          channel: string
          contact_id: string
          id?: string
          organization_id: string
          purpose: string
          source: string
          status: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          channel?: string
          contact_id?: string
          id?: string
          organization_id?: string
          purpose?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'consents_captured_by_fkey'
            columns: ['captured_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'consents_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'consents_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      contact_identities: {
        Row: {
          channel: string
          contact_id: string
          created_at: string
          external_id: string | null
          id: string
          normalized_value: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          channel: string
          contact_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          normalized_value: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          normalized_value?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contact_identities_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          primary_phone_e164: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          organization_id: string
          primary_phone_e164?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          primary_phone_e164?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contacts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          clinic_id: string
          conversation_id: string
          event_type: string
          id: string
          occurred_at: string
          organization_id: string
          payload_sanitized: Json
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          clinic_id: string
          conversation_id: string
          event_type: string
          id?: string
          occurred_at?: string
          organization_id: string
          payload_sanitized?: Json
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          clinic_id?: string
          conversation_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          payload_sanitized?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_events_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_events_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_events_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          automation_paused: boolean
          channel_account_id: string
          clinic_id: string
          contact_id: string
          created_at: string
          expert_patient_uuid: string | null
          id: string
          identification: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          next_action_at: string | null
          organization_id: string
          owner_user_id: string | null
          status: string
          team_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          automation_paused?: boolean
          channel_account_id: string
          clinic_id: string
          contact_id: string
          created_at?: string
          expert_patient_uuid?: string | null
          id?: string
          identification?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          next_action_at?: string | null
          organization_id: string
          owner_user_id?: string | null
          status?: string
          team_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          automation_paused?: boolean
          channel_account_id?: string
          clinic_id?: string
          contact_id?: string
          created_at?: string
          expert_patient_uuid?: string | null
          id?: string
          identification?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          next_action_at?: string | null
          organization_id?: string
          owner_user_id?: string | null
          status?: string
          team_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_channel_account_id_fkey'
            columns: ['channel_account_id']
            isOneToOne: false
            referencedRelation: 'channel_accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_owner_user_id_fkey'
            columns: ['owner_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      dead_letters: {
        Row: {
          attempts: number
          clinic_id: string | null
          error_code: string | null
          first_failed_at: string
          id: string
          last_failed_at: string
          organization_id: string
          ref_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_queue: string
        }
        Insert: {
          attempts?: number
          clinic_id?: string | null
          error_code?: string | null
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          organization_id: string
          ref_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_queue: string
        }
        Update: {
          attempts?: number
          clinic_id?: string | null
          error_code?: string | null
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          organization_id?: string
          ref_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_queue?: string
        }
        Relationships: []
      }
      evaluation_procedures: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          is_draft: boolean
          label: string | null
          organization_id: string
          procedure_expert_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          is_draft?: boolean
          label?: string | null
          organization_id: string
          procedure_expert_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          is_draft?: boolean
          label?: string | null
          organization_id?: string
          procedure_expert_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'evaluation_procedures_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'evaluation_procedures_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      expert_patients_cache: {
        Row: {
          clinic_id: string
          correlation_id: string | null
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          invalidated: boolean
          organization_id: string
          payload: Json
          phone_e164: string
          result_class: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          correlation_id?: string | null
          created_at?: string
          expires_at: string
          fetched_at?: string
          id?: string
          invalidated?: boolean
          organization_id: string
          payload?: Json
          phone_e164: string
          result_class?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          correlation_id?: string | null
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          invalidated?: boolean
          organization_id?: string
          payload?: Json
          phone_e164?: string
          result_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      expert_procedures_cache: {
        Row: {
          active: boolean
          created_at: string
          duration_min: number
          expert_id: number
          id: string
          name: string
          organization_id: string
          price_cents: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_min?: number
          expert_id: number
          id?: string
          name: string
          organization_id: string
          price_cents?: number
          synced_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_min?: number
          expert_id?: number
          id?: string
          name?: string
          organization_id?: string
          price_cents?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expert_procedures_cache_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      expert_professionals_cache: {
        Row: {
          active: boolean
          created_at: string
          expert_uuid: string
          id: string
          name: string
          organization_id: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expert_uuid: string
          id?: string
          name: string
          organization_id: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expert_uuid?: string
          id?: string
          name?: string
          organization_id?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expert_professionals_cache_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      expert_rooms_cache: {
        Row: {
          active: boolean
          created_at: string
          expert_id: number
          id: string
          name: string
          organization_id: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expert_id: number
          id?: string
          name: string
          organization_id: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expert_id?: number
          id?: string
          name?: string
          organization_id?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expert_rooms_cache_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      external_patient_links: {
        Row: {
          clinic_id: string
          confidence: number
          contact_id: string
          created_at: string
          expert_patient_uuid: string
          id: string
          linked_by: string | null
          match_method: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          confidence?: number
          contact_id: string
          created_at?: string
          expert_patient_uuid: string
          id?: string
          linked_by?: string | null
          match_method?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          confidence?: number
          contact_id?: string
          created_at?: string
          expert_patient_uuid?: string
          id?: string
          linked_by?: string | null
          match_method?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'external_patient_links_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'external_patient_links_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'external_patient_links_linked_by_fkey'
            columns: ['linked_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'external_patient_links_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      feature_flags: {
        Row: {
          clinic_id: string
          config: Json
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      followup_enrollments: {
        Row: {
          attempts_done: number
          clinic_id: string
          completed_at: string | null
          contact_id: string
          conversation_id: string | null
          created_at: string
          enrolled_by: string | null
          enrolled_source: string
          id: string
          last_attempt_at: string | null
          next_run_at: string | null
          opportunity_id: string | null
          organization_id: string
          pause_reason: string | null
          policy_id: string
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempts_done?: number
          clinic_id: string
          completed_at?: string | null
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          enrolled_by?: string | null
          enrolled_source?: string
          id?: string
          last_attempt_at?: string | null
          next_run_at?: string | null
          opportunity_id?: string | null
          organization_id: string
          pause_reason?: string | null
          policy_id: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts_done?: number
          clinic_id?: string
          completed_at?: string | null
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          enrolled_by?: string | null
          enrolled_source?: string
          id?: string
          last_attempt_at?: string | null
          next_run_at?: string | null
          opportunity_id?: string | null
          organization_id?: string
          pause_reason?: string | null
          policy_id?: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'followup_enrollments_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_opportunity_id_fkey'
            columns: ['opportunity_id']
            isOneToOne: false
            referencedRelation: 'opportunities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_policy_id_fkey'
            columns: ['policy_id']
            isOneToOne: false
            referencedRelation: 'followup_policies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_enrollments_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      followup_policies: {
        Row: {
          allowed_from: string
          allowed_to: string
          allowed_weekdays: number[]
          approval_mode: string
          clinic_id: string
          created_at: string
          created_by: string | null
          delays_days: number[]
          id: string
          is_draft: boolean
          max_attempts: number
          name: string
          organization_id: string
          status: string
          trigger_after_hours: number
          trigger_kind: string
          updated_at: string
          version: number
        }
        Insert: {
          allowed_from?: string
          allowed_to?: string
          allowed_weekdays?: number[]
          approval_mode?: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          delays_days?: number[]
          id?: string
          is_draft?: boolean
          max_attempts?: number
          name: string
          organization_id: string
          status?: string
          trigger_after_hours?: number
          trigger_kind?: string
          updated_at?: string
          version?: number
        }
        Update: {
          allowed_from?: string
          allowed_to?: string
          allowed_weekdays?: number[]
          approval_mode?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          delays_days?: number[]
          id?: string
          is_draft?: boolean
          max_attempts?: number
          name?: string
          organization_id?: string
          status?: string
          trigger_after_hours?: number
          trigger_kind?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'followup_policies_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_policies_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      followup_runs: {
        Row: {
          attempt: number
          clinic_id: string
          created_at: string
          delay_days: number
          enrollment_id: string
          executed_at: string | null
          id: string
          message_id: string | null
          organization_id: string
          outcome: string
          outcome_reason: string | null
          run_key: string
          scheduled_for: string
          task_id: string | null
        }
        Insert: {
          attempt: number
          clinic_id: string
          created_at?: string
          delay_days: number
          enrollment_id: string
          executed_at?: string | null
          id?: string
          message_id?: string | null
          organization_id: string
          outcome?: string
          outcome_reason?: string | null
          run_key: string
          scheduled_for: string
          task_id?: string | null
        }
        Update: {
          attempt?: number
          clinic_id?: string
          created_at?: string
          delay_days?: number
          enrollment_id?: string
          executed_at?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string
          outcome?: string
          outcome_reason?: string | null
          run_key?: string
          scheduled_for?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'followup_runs_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_runs_enrollment_id_fkey'
            columns: ['enrollment_id']
            isOneToOne: false
            referencedRelation: 'followup_enrollments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_runs_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'followup_runs_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      integration_connections: {
        Row: {
          clinic_id: string | null
          config_sanitized: Json
          connection_key: string
          created_at: string
          health_status: string
          id: string
          last_tested_at: string | null
          organization_id: string
          provider: string
          secret_ref: string
          updated_at: string
        }
        Insert: {
          clinic_id?: string | null
          config_sanitized?: Json
          connection_key: string
          created_at?: string
          health_status?: string
          id?: string
          last_tested_at?: string | null
          organization_id: string
          provider: string
          secret_ref: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string | null
          config_sanitized?: Json
          connection_key?: string
          created_at?: string
          health_status?: string
          id?: string
          last_tested_at?: string | null
          organization_id?: string
          provider?: string
          secret_ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'integration_connections_clinic_tenant_fkey'
            columns: ['clinic_id', 'organization_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id', 'organization_id']
          },
          {
            foreignKeyName: 'integration_connections_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      integration_mappings: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          expert_ref: string
          id: string
          is_draft: boolean
          kind: string
          organization_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          expert_ref: string
          id?: string
          is_draft?: boolean
          kind: string
          organization_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          expert_ref?: string
          id?: string
          is_draft?: boolean
          kind?: string
          organization_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'integration_mappings_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'integration_mappings_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      intent_routes: {
        Row: {
          auto_reply_allowed: boolean
          clinic_id: string
          created_at: string
          id: string
          intent: string
          priority: number
          queue_id: string | null
          updated_at: string
        }
        Insert: {
          auto_reply_allowed?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          intent: string
          priority?: number
          queue_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_reply_allowed?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          intent?: string
          priority?: number
          queue_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'intent_routes_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      knowledge_items: {
        Row: {
          answer: string
          approved_at: string | null
          approved_by: string | null
          auto_reply_allowed: boolean
          category: string
          clinic_id: string | null
          created_at: string
          id: string
          organization_id: string
          question_examples: string[]
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          answer: string
          approved_at?: string | null
          approved_by?: string | null
          auto_reply_allowed?: boolean
          category: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          question_examples?: string[]
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          answer?: string
          approved_at?: string | null
          approved_by?: string | null
          auto_reply_allowed?: boolean
          category?: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          question_examples?: string[]
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'knowledge_items_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      lead_sources: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          is_draft: boolean
          key: string
          label: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          is_draft?: boolean
          key: string
          label: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          is_draft?: boolean
          key?: string
          label?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lead_sources_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lead_sources_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      leads: {
        Row: {
          clinic_id: string
          contact_id: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          owner_user_id: string | null
          source_key: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          owner_user_id?: string | null
          source_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          owner_user_id?: string | null
          source_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leads_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leads_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leads_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'leads_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      loss_reasons: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          is_draft: boolean
          key: string
          label: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          is_draft?: boolean
          key: string
          label: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          is_draft?: boolean
          key?: string
          label?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loss_reasons_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loss_reasons_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      memberships: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          invite_status: string
          organization_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          invite_status?: string
          organization_id: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          invite_status?: string
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_clinic_tenant_fkey'
            columns: ['organization_id', 'clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['organization_id', 'id']
          },
          {
            foreignKeyName: 'memberships_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      message_attachments: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          message_id: string
          mime_declared: string
          mime_detected: string | null
          organization_id: string
          reject_reason: string | null
          scan_status: string
          sha256: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          message_id: string
          mime_declared: string
          mime_detected?: string | null
          organization_id: string
          reject_reason?: string | null
          scan_status?: string
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          message_id?: string
          mime_declared?: string
          mime_detected?: string | null
          organization_id?: string
          reject_reason?: string | null
          scan_status?: string
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_attachments_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_attachments_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_attachments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          clinic_id: string
          contains_commercial_terms: boolean
          created_at: string
          external_template_id: string | null
          id: string
          language: string
          name: string
          organization_id: string
          provider: string
          provider_status: string
          purpose: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          clinic_id: string
          contains_commercial_terms?: boolean
          created_at?: string
          external_template_id?: string | null
          id?: string
          language?: string
          name: string
          organization_id: string
          provider: string
          provider_status?: string
          purpose: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          clinic_id?: string
          contains_commercial_terms?: boolean
          created_at?: string
          external_template_id?: string | null
          id?: string
          language?: string
          name?: string
          organization_id?: string
          provider?: string
          provider_status?: string
          purpose?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          clinic_id: string
          content_type: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          id: string
          occurred_at: string
          organization_id: string
          outbound_request_id: string | null
          provider: string
          provider_message_id: string | null
          read_at: string | null
          sender_type: string
          sender_user_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          body?: string | null
          clinic_id: string
          content_type?: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          id?: string
          occurred_at?: string
          organization_id: string
          outbound_request_id?: string | null
          provider: string
          provider_message_id?: string | null
          read_at?: string | null
          sender_type: string
          sender_user_id?: string | null
          sent_at?: string | null
          status: string
        }
        Update: {
          body?: string | null
          clinic_id?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          outbound_request_id?: string | null
          provider?: string
          provider_message_id?: string | null
          read_at?: string | null
          sender_type?: string
          sender_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_outbound_request_id_fkey'
            columns: ['outbound_request_id']
            isOneToOne: false
            referencedRelation: 'outbound_requests'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_sender_user_id_fkey'
            columns: ['sender_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      metric_definitions: {
        Row: {
          definition: string
          definition_version: number
          is_draft: boolean
          is_financial: boolean
          label: string
          metric_key: string
          owner: string
          source: string
          updated_at: string
        }
        Insert: {
          definition: string
          definition_version?: number
          is_draft?: boolean
          is_financial?: boolean
          label: string
          metric_key: string
          owner?: string
          source: string
          updated_at?: string
        }
        Update: {
          definition?: string
          definition_version?: number
          is_draft?: boolean
          is_financial?: boolean
          label?: string
          metric_key?: string
          owner?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      metrics_daily: {
        Row: {
          clinic_id: string
          computed_at: string
          day: string
          definition_version: number
          id: string
          metric_key: string
          organization_id: string
          value: number
        }
        Insert: {
          clinic_id: string
          computed_at?: string
          day: string
          definition_version?: number
          id?: string
          metric_key: string
          organization_id: string
          value?: number
        }
        Update: {
          clinic_id?: string
          computed_at?: string
          day?: string
          definition_version?: number
          id?: string
          metric_key?: string
          organization_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'metrics_daily_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'metrics_daily_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      opportunities: {
        Row: {
          amount_cents: number
          clinic_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string | null
          loss_reason_key: string | null
          lost_at: string | null
          organization_id: string
          owner_user_id: string | null
          pipeline_id: string
          stage_id: string
          status: string
          title: string | null
          updated_at: string
          won_approved_by: string | null
          won_at: string | null
          won_pending_check: boolean
          won_sale_uuid: string | null
        }
        Insert: {
          amount_cents?: number
          clinic_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          loss_reason_key?: string | null
          lost_at?: string | null
          organization_id: string
          owner_user_id?: string | null
          pipeline_id: string
          stage_id: string
          status?: string
          title?: string | null
          updated_at?: string
          won_approved_by?: string | null
          won_at?: string | null
          won_pending_check?: boolean
          won_sale_uuid?: string | null
        }
        Update: {
          amount_cents?: number
          clinic_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          loss_reason_key?: string | null
          lost_at?: string | null
          organization_id?: string
          owner_user_id?: string | null
          pipeline_id?: string
          stage_id?: string
          status?: string
          title?: string | null
          updated_at?: string
          won_approved_by?: string | null
          won_at?: string | null
          won_pending_check?: boolean
          won_sale_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'opportunities_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'leads'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_pipeline_id_fkey'
            columns: ['pipeline_id']
            isOneToOne: false
            referencedRelation: 'pipelines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunities_stage_id_fkey'
            columns: ['stage_id']
            isOneToOne: false
            referencedRelation: 'pipeline_stages'
            referencedColumns: ['id']
          },
        ]
      }
      opportunity_gain_suggestions: {
        Row: {
          clinic_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_note: string | null
          id: string
          opportunity_id: string
          organization_id: string
          sale_amount_cents: number
          sale_date: string | null
          sale_expert_uuid: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          id?: string
          opportunity_id: string
          organization_id: string
          sale_amount_cents?: number
          sale_date?: string | null
          sale_expert_uuid: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          id?: string
          opportunity_id?: string
          organization_id?: string
          sale_amount_cents?: number
          sale_date?: string | null
          sale_expert_uuid?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'opportunity_gain_suggestions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_gain_suggestions_opportunity_id_fkey'
            columns: ['opportunity_id']
            isOneToOne: false
            referencedRelation: 'opportunities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_gain_suggestions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      opportunity_history: {
        Row: {
          actor_id: string | null
          clinic_id: string
          created_at: string
          from_stage_id: string | null
          from_status: string | null
          id: string
          opportunity_id: string
          organization_id: string
          reason: string | null
          to_stage_id: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          clinic_id: string
          created_at?: string
          from_stage_id?: string | null
          from_status?: string | null
          id?: string
          opportunity_id: string
          organization_id: string
          reason?: string | null
          to_stage_id?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          clinic_id?: string
          created_at?: string
          from_stage_id?: string | null
          from_status?: string | null
          id?: string
          opportunity_id?: string
          organization_id?: string
          reason?: string | null
          to_stage_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'opportunity_history_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_history_from_stage_id_fkey'
            columns: ['from_stage_id']
            isOneToOne: false
            referencedRelation: 'pipeline_stages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_history_opportunity_id_fkey'
            columns: ['opportunity_id']
            isOneToOne: false
            referencedRelation: 'opportunities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_history_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'opportunity_history_to_stage_id_fkey'
            columns: ['to_stage_id']
            isOneToOne: false
            referencedRelation: 'pipeline_stages'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_requests: {
        Row: {
          attempts: number
          block_reason: string | null
          body_ref: string | null
          channel_account_id: string
          clinic_id: string
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          last_error_code: string | null
          organization_id: string
          origin: string
          provider_message_id: string | null
          status: string
          template_language: string | null
          template_name: string | null
          test_body: string | null
          to_phone_e164: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          block_reason?: string | null
          body_ref?: string | null
          channel_account_id: string
          clinic_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          last_error_code?: string | null
          organization_id: string
          origin: string
          provider_message_id?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          test_body?: string | null
          to_phone_e164: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          block_reason?: string | null
          body_ref?: string | null
          channel_account_id?: string
          clinic_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_error_code?: string | null
          organization_id?: string
          origin?: string
          provider_message_id?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          test_body?: string | null
          to_phone_e164?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'outbound_requests_channel_account_id_fkey'
            columns: ['channel_account_id']
            isOneToOne: false
            referencedRelation: 'channel_accounts'
            referencedColumns: ['id']
          },
        ]
      }
      pipeline_stages: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_final_lost: boolean
          is_final_won: boolean
          key: string
          label: string
          pipeline_id: string
          position: number
          sla_hours: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_final_lost?: boolean
          is_final_won?: boolean
          key: string
          label: string
          pipeline_id: string
          position?: number
          sla_hours?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_final_lost?: boolean
          is_final_won?: boolean
          key?: string
          label?: string
          pipeline_id?: string
          position?: number
          sla_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pipeline_stages_pipeline_id_fkey'
            columns: ['pipeline_id']
            isOneToOne: false
            referencedRelation: 'pipelines'
            referencedColumns: ['id']
          },
        ]
      }
      pipelines: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'pipelines_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pipelines_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      policy_rules: {
        Row: {
          active: boolean
          clinic_id: string | null
          condition: Json
          created_at: string
          effect: string
          id: string
          priority: number
          reason_code: string
          rule_key: string
          scope: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          clinic_id?: string | null
          condition?: Json
          created_at?: string
          effect: string
          id?: string
          priority?: number
          reason_code: string
          rule_key: string
          scope?: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          clinic_id?: string | null
          condition?: Json
          created_at?: string
          effect?: string
          id?: string
          priority?: number
          reason_code?: string
          rule_key?: string
          scope?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'policy_rules_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      procedure_professionals: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          is_draft: boolean
          organization_id: string
          procedure_expert_id: number
          professional_expert_id: number | null
          professional_expert_uuid: string
          professional_name: string | null
          source: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          is_draft?: boolean
          organization_id: string
          procedure_expert_id: number
          professional_expert_id?: number | null
          professional_expert_uuid: string
          professional_name?: string | null
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          is_draft?: boolean
          organization_id?: string
          procedure_expert_id?: number
          professional_expert_id?: number | null
          professional_expert_uuid?: string
          professional_name?: string | null
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'procedure_professionals_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'procedure_professionals_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          clinic_name: string | null
          created_at: string
          email: string
          id: string
          name: string
          role: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clinic_name?: string | null
          created_at?: string
          email?: string
          id: string
          name?: string
          role?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_name?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_sets: {
        Row: {
          active_version_id: string | null
          agent_key: string
          clinic_id: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          agent_key: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          agent_key?: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'prompt_sets_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'prompt_sets_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      prompt_versions: {
        Row: {
          allowed_variables: string[]
          approved_by: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          prompt_set_id: string
          published_at: string | null
          sandbox_result: Json | null
          status: string
          version: number
        }
        Insert: {
          allowed_variables?: string[]
          approved_by?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_set_id: string
          published_at?: string | null
          sandbox_result?: Json | null
          status?: string
          version: number
        }
        Update: {
          allowed_variables?: string[]
          approved_by?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_set_id?: string
          published_at?: string | null
          sandbox_result?: Json | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'prompt_versions_prompt_set_id_fkey'
            columns: ['prompt_set_id']
            isOneToOne: false
            referencedRelation: 'prompt_sets'
            referencedColumns: ['id']
          },
        ]
      }
      provider_message_status: {
        Row: {
          channel_account_id: string
          clinic_id: string
          error_code: string | null
          id: string
          occurred_at: string
          organization_id: string
          provider: string
          provider_message_id: string
          status: string
        }
        Insert: {
          channel_account_id: string
          clinic_id: string
          error_code?: string | null
          id?: string
          occurred_at: string
          organization_id: string
          provider: string
          provider_message_id: string
          status: string
        }
        Update: {
          channel_account_id?: string
          clinic_id?: string
          error_code?: string | null
          id?: string
          occurred_at?: string
          organization_id?: string
          provider?: string
          provider_message_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'provider_message_status_channel_account_id_fkey'
            columns: ['channel_account_id']
            isOneToOne: false
            referencedRelation: 'channel_accounts'
            referencedColumns: ['id']
          },
        ]
      }
      recovery_cases: {
        Row: {
          appointment_expert_uuid: string
          clinic_id: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          evaluated_at: string | null
          evaluation_procedure_id: number | null
          had_paid_procedure: boolean
          id: string
          loss_reason_key: string | null
          opportunity_id: string | null
          organization_id: string
          paid_procedures: string[]
          patient_expert_uuid: string | null
          patient_name: string | null
          procedures_all: string[]
          professional_name: string | null
          recovered_at: string | null
          recovered_sale_uuid: string | null
          registered_at: string | null
          registered_by: string | null
          result: string | null
          result_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_expert_uuid: string
          clinic_id: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          evaluated_at?: string | null
          evaluation_procedure_id?: number | null
          had_paid_procedure?: boolean
          id?: string
          loss_reason_key?: string | null
          opportunity_id?: string | null
          organization_id: string
          paid_procedures?: string[]
          patient_expert_uuid?: string | null
          patient_name?: string | null
          procedures_all?: string[]
          professional_name?: string | null
          recovered_at?: string | null
          recovered_sale_uuid?: string | null
          registered_at?: string | null
          registered_by?: string | null
          result?: string | null
          result_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_expert_uuid?: string
          clinic_id?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          evaluated_at?: string | null
          evaluation_procedure_id?: number | null
          had_paid_procedure?: boolean
          id?: string
          loss_reason_key?: string | null
          opportunity_id?: string | null
          organization_id?: string
          paid_procedures?: string[]
          patient_expert_uuid?: string | null
          patient_name?: string | null
          procedures_all?: string[]
          professional_name?: string | null
          recovered_at?: string | null
          recovered_sale_uuid?: string | null
          registered_at?: string | null
          registered_by?: string | null
          result?: string | null
          result_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recovery_cases_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recovery_cases_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recovery_cases_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recovery_cases_opportunity_id_fkey'
            columns: ['opportunity_id']
            isOneToOne: false
            referencedRelation: 'opportunities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recovery_cases_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      routing_policies: {
        Row: {
          accept_timeout_seconds: number
          after_hours_text: string | null
          backup_queue_id: string | null
          clinic_id: string
          created_at: string
          escalation_role: string
          fallback_mode: string
          first_response_sla_minutes: number
          id: string
          max_reoffers: number
          queue_id: string
          skills: string[]
          status: string
          strategy: string
          updated_at: string
          version: number
        }
        Insert: {
          accept_timeout_seconds?: number
          after_hours_text?: string | null
          backup_queue_id?: string | null
          clinic_id: string
          created_at?: string
          escalation_role?: string
          fallback_mode?: string
          first_response_sla_minutes?: number
          id?: string
          max_reoffers?: number
          queue_id: string
          skills?: string[]
          status?: string
          strategy?: string
          updated_at?: string
          version?: number
        }
        Update: {
          accept_timeout_seconds?: number
          after_hours_text?: string | null
          backup_queue_id?: string | null
          clinic_id?: string
          created_at?: string
          escalation_role?: string
          fallback_mode?: string
          first_response_sla_minutes?: number
          id?: string
          max_reoffers?: number
          queue_id?: string
          skills?: string[]
          status?: string
          strategy?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'routing_policies_backup_queue_id_fkey'
            columns: ['backup_queue_id']
            isOneToOne: false
            referencedRelation: 'ticket_queues'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'routing_policies_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'routing_policies_queue_id_fkey'
            columns: ['queue_id']
            isOneToOne: false
            referencedRelation: 'ticket_queues'
            referencedColumns: ['id']
          },
        ]
      }
      sales_mirror: {
        Row: {
          buyer_expert_uuid: string | null
          buyer_name: string | null
          buyer_phone_e164: string | null
          clinic_id: string | null
          created_at: string
          discount_cents: number
          expert_uuid: string
          final_amount_cents: number
          generate_credits: boolean
          id: string
          items_json: Json
          organization_id: string
          sale_date: string
          sale_type: string | null
          seller_expert_uuid: string | null
          status: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          buyer_expert_uuid?: string | null
          buyer_name?: string | null
          buyer_phone_e164?: string | null
          clinic_id?: string | null
          created_at?: string
          discount_cents?: number
          expert_uuid: string
          final_amount_cents?: number
          generate_credits?: boolean
          id?: string
          items_json?: Json
          organization_id: string
          sale_date: string
          sale_type?: string | null
          seller_expert_uuid?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          buyer_expert_uuid?: string | null
          buyer_name?: string | null
          buyer_phone_e164?: string | null
          clinic_id?: string | null
          created_at?: string
          discount_cents?: number
          expert_uuid?: string
          final_amount_cents?: number
          generate_credits?: boolean
          id?: string
          items_json?: Json
          organization_id?: string
          sale_date?: string
          sale_type?: string | null
          seller_expert_uuid?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sales_mirror_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_mirror_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      sync_cursors: {
        Row: {
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          organization_id: string
          resource: string
          status: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          organization_id: string
          resource: string
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          organization_id?: string
          resource?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sync_cursors_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          assignee_user_id: string | null
          cancelled_reason: string | null
          clinic_id: string
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          due_at: string
          entity_id: string
          entity_type: string
          id: string
          is_automatic: boolean
          kind: string
          organization_id: string
          priority: string
          result_note: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          cancelled_reason?: string | null
          clinic_id: string
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at: string
          entity_id: string
          entity_type: string
          id?: string
          is_automatic?: boolean
          kind?: string
          organization_id: string
          priority?: string
          result_note?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          cancelled_reason?: string | null
          clinic_id?: string
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_automatic?: boolean
          kind?: string
          organization_id?: string
          priority?: string
          result_note?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          id: string
          max_concurrent: number
          skills: string[]
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          created_at?: string
          id?: string
          max_concurrent?: number
          skills?: string[]
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          id?: string
          max_concurrent?: number
          skills?: string[]
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      teams: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
          queue_type: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          queue_type: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          queue_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'teams_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_events: {
        Row: {
          clinic_id: string
          event_type: string
          from_user_id: string | null
          id: string
          metadata_sanitized: Json
          occurred_at: string
          organization_id: string
          reason_code: string | null
          ticket_id: string
          to_user_id: string | null
        }
        Insert: {
          clinic_id: string
          event_type: string
          from_user_id?: string | null
          id?: string
          metadata_sanitized?: Json
          occurred_at?: string
          organization_id: string
          reason_code?: string | null
          ticket_id: string
          to_user_id?: string | null
        }
        Update: {
          clinic_id?: string
          event_type?: string
          from_user_id?: string | null
          id?: string
          metadata_sanitized?: Json
          occurred_at?: string
          organization_id?: string
          reason_code?: string | null
          ticket_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_events_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_queues: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          id: string
          name: string
          organization_id: string
          priority_default: number
          purpose: string
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          priority_default?: number
          purpose: string
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          priority_default?: number
          purpose?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_queues_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_queues_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ticket_queues_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      ticket_sla_events: {
        Row: {
          acknowledged_at: string | null
          breached_at: string | null
          clinic_id: string
          created_at: string
          due_at: string
          id: string
          metric: string
          organization_id: string
          ticket_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          breached_at?: string | null
          clinic_id: string
          created_at?: string
          due_at: string
          id?: string
          metric: string
          organization_id: string
          ticket_id: string
        }
        Update: {
          acknowledged_at?: string | null
          breached_at?: string | null
          clinic_id?: string
          created_at?: string
          due_at?: string
          id?: string
          metric?: string
          organization_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ticket_sla_events_ticket_id_fkey'
            columns: ['ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      tickets: {
        Row: {
          accepted_at: string | null
          assigned_to: string | null
          clinic_id: string
          conversation_id: string
          created_at: string
          first_response_at: string | null
          handoff_reason: string
          id: string
          intent: string | null
          next_action_at: string | null
          offer_expires_at: string | null
          offered_to: string | null
          organization_id: string
          priority: number
          queue_id: string
          reoffer_count: number
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          assigned_to?: string | null
          clinic_id: string
          conversation_id: string
          created_at?: string
          first_response_at?: string | null
          handoff_reason: string
          id?: string
          intent?: string | null
          next_action_at?: string | null
          offer_expires_at?: string | null
          offered_to?: string | null
          organization_id: string
          priority?: number
          queue_id: string
          reoffer_count?: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          assigned_to?: string | null
          clinic_id?: string
          conversation_id?: string
          created_at?: string
          first_response_at?: string | null
          handoff_reason?: string
          id?: string
          intent?: string | null
          next_action_at?: string | null
          offer_expires_at?: string | null
          offered_to?: string | null
          organization_id?: string
          priority?: number
          queue_id?: string
          reoffer_count?: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'tickets_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_queue_id_fkey'
            columns: ['queue_id']
            isOneToOne: false
            referencedRelation: 'ticket_queues'
            referencedColumns: ['id']
          },
        ]
      }
      user_shifts: {
        Row: {
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          starts_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_shifts_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      webhook_receipts: {
        Row: {
          channel_account_id: string | null
          clinic_id: string | null
          correlation_id: string
          event_kind: string
          external_event_id: string
          id: string
          organization_id: string | null
          payload_hash: string
          payload_ref: string | null
          provider: string
          received_at: string
          signature_valid: boolean
          status: string
        }
        Insert: {
          channel_account_id?: string | null
          clinic_id?: string | null
          correlation_id: string
          event_kind: string
          external_event_id: string
          id?: string
          organization_id?: string | null
          payload_hash: string
          payload_ref?: string | null
          provider: string
          received_at?: string
          signature_valid: boolean
          status: string
        }
        Update: {
          channel_account_id?: string | null
          clinic_id?: string | null
          correlation_id?: string
          event_kind?: string
          external_event_id?: string
          id?: string
          organization_id?: string | null
          payload_hash?: string
          payload_ref?: string | null
          provider?: string
          received_at?: string
          signature_valid?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'webhook_receipts_channel_account_id_fkey'
            columns: ['channel_account_id']
            isOneToOne: false
            referencedRelation: 'channel_accounts'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _admin_gen_secret: { Args: never; Returns: string }
      _edge_read_secret: { Args: { p_secret_ref: string }; Returns: string }
      _edge_read_secret_by_name: { Args: { p_name: string }; Returns: string }
      _guardiao_sandbox: { Args: { p_texto: string }; Returns: boolean }
      _phone_match_key: { Args: { p_phone: string }; Returns: string }
      _sync_bookings_window: {
        Args: { p_ate: string; p_de: string }
        Returns: undefined
      }
      _sync_catalogs_window: { Args: never; Returns: number }
      _sync_sales_window: {
        Args: { p_ate: string; p_de: string }
        Returns: undefined
      }
      _task_entity_clinic: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          clinic_id: string
          contact_id: string
          is_open: boolean
          organization_id: string
          owner_user_id: string
        }[]
      }
      accept_ticket: {
        Args: { p_ticket: string; p_version: number }
        Returns: Json
      }
      admin_approve_knowledge_item: {
        Args: { p_clinic: string; p_item: string }
        Returns: {
          item_id: string
          motivo: string
          recusado: boolean
          status: string
          version: number
        }[]
      }
      admin_archive_knowledge_item: {
        Args: { p_clinic: string; p_item: string }
        Returns: undefined
      }
      admin_get_connection_status: {
        Args: {
          p_clinic_id: string
          p_connection_key: string
          p_provider: string
        }
        Returns: {
          connection_id: string
          health_status: string
          last_tested_at: string
          secret_hint: string
          secret_ref: string
          updated_at: string
        }[]
      }
      admin_get_followup_policies: { Args: { p_clinic: string }; Returns: Json }
      admin_get_funnel: { Args: { p_clinic: string }; Returns: Json }
      admin_get_prompt_efetivo: {
        Args: { p_agent_key: string; p_clinic: string }
        Returns: {
          active_version_id: string
          allowed_variables: string[]
          content: string
          origem: string
          version: number
        }[]
      }
      admin_invite_user: {
        Args: { p_clinic_roles: Json; p_email: string; p_name: string }
        Returns: string
      }
      admin_list_config_versions: {
        Args: {
          p_clinic_id: string
          p_connection_key: string
          p_provider: string
        }
        Returns: {
          config_sanitized: Json
          published_at: string
          version: number
        }[]
      }
      admin_list_mappings: {
        Args: { p_clinic: string }
        Returns: {
          clinic_id: string
          expert_ref: string
          id: string
          is_draft: boolean
          kind: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_policy_versions: {
        Args: { p_clinic: string; p_queue: string }
        Returns: {
          created_at: string
          id: string
          status: string
          strategy: string
          version: number
        }[]
      }
      admin_list_prompt_versions: {
        Args: { p_agent_key: string; p_clinic: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          origem: string
          published_at: string
          sandbox_ok: boolean
          status: string
          version: number
        }[]
      }
      admin_publish_followup_policy: {
        Args: { p_policy: string }
        Returns: Json
      }
      admin_publish_policy: {
        Args: { p_clinic: string; p_policy: string }
        Returns: number
      }
      admin_publish_prompt_version: {
        Args: { p_clinic: string; p_prompt_version: string }
        Returns: number
      }
      admin_rollback_config: {
        Args: { p_connection_id: string; p_version: number }
        Returns: {
          connection_id: string
          health_status: string
          restored_version: number
          updated_at: string
        }[]
      }
      admin_rollback_policy: {
        Args: { p_clinic: string; p_queue: string }
        Returns: number
      }
      admin_rollback_prompt_version: {
        Args: { p_agent_key: string; p_clinic: string }
        Returns: number
      }
      admin_sandbox_test_prompt: {
        Args: { p_clinic: string; p_prompt_version: string }
        Returns: Json
      }
      admin_save_channel_account: {
        Args: {
          p_clinic_id: string
          p_display_name: string
          p_external_account_id: string
          p_external_business_id: string
          p_phone: string
          p_provider: string
          p_second_secret: string
          p_token: string
        }
        Returns: {
          channel_account_id: string
          created: boolean
          webhook_secret_once: string
        }[]
      }
      admin_save_closure: {
        Args: { p_clinic: string; p_date: string; p_reason: string }
        Returns: string
      }
      admin_save_followup_policy: {
        Args: {
          p_allowed_from?: string
          p_allowed_to?: string
          p_allowed_weekdays?: number[]
          p_approval_mode?: string
          p_clinic: string
          p_delays_days?: number[]
          p_max_attempts?: number
          p_name: string
          p_trigger_after_hours?: number
          p_trigger_kind?: string
        }
        Returns: Json
      }
      admin_save_hours: {
        Args: {
          p_clinic: string
          p_closes: string
          p_opens: string
          p_team?: string
          p_timezone?: string
          p_weekday: number
        }
        Returns: string
      }
      admin_save_integration_secret: {
        Args: {
          p_clinic_id: string
          p_config_sanitized?: Json
          p_connection_key: string
          p_provider: string
          p_secret: string
        }
        Returns: {
          connection_id: string
          created: boolean
          health_status: string
          secret_hint: string
          secret_ref: string
          updated_at: string
          version: number
        }[]
      }
      admin_save_intent_route: {
        Args: {
          p_auto_reply: boolean
          p_clinic: string
          p_intent: string
          p_priority: number
          p_queue: string
        }
        Returns: undefined
      }
      admin_save_knowledge_item: {
        Args: {
          p_answer: string
          p_auto_reply: boolean
          p_category: string
          p_clinic: string
          p_item: string
          p_questions: string[]
        }
        Returns: {
          item_id: string
          motivo: string
          recusado: boolean
          status: string
          version: number
        }[]
      }
      admin_save_lead_source: {
        Args: {
          p_active?: boolean
          p_clinic: string
          p_is_draft?: boolean
          p_key: string
          p_label: string
        }
        Returns: string
      }
      admin_save_loss_reason: {
        Args: {
          p_active?: boolean
          p_clinic: string
          p_is_draft?: boolean
          p_key: string
          p_label: string
        }
        Returns: string
      }
      admin_save_mapping: {
        Args: {
          p_clinic: string
          p_expert_ref: string
          p_is_draft?: boolean
          p_kind: string
          p_user?: string
        }
        Returns: string
      }
      admin_save_policy: {
        Args: {
          p_accept_timeout: number
          p_after_hours_text?: string
          p_backup_queue?: string
          p_clinic: string
          p_escalation_role?: string
          p_fallback?: string
          p_max_reoffers: number
          p_queue: string
          p_skills?: string[]
          p_sla_minutes: number
          p_strategy: string
        }
        Returns: string
      }
      admin_save_prompt_draft: {
        Args: {
          p_agent_key: string
          p_allowed_variables?: string[]
          p_clinic: string
          p_content: string
        }
        Returns: string
      }
      admin_save_queue: {
        Args: {
          p_clinic: string
          p_name: string
          p_priority?: number
          p_purpose: string
          p_queue?: string
          p_team: string
        }
        Returns: string
      }
      admin_save_stage: {
        Args: {
          p_active?: boolean
          p_clinic: string
          p_is_final_lost?: boolean
          p_is_final_won?: boolean
          p_key: string
          p_label: string
          p_position?: number
          p_sla_hours?: number
        }
        Returns: string
      }
      admin_set_auto_reply: {
        Args: { p_clinic: string; p_enabled: boolean }
        Returns: undefined
      }
      admin_set_channel_status: {
        Args: { p_channel_account_id: string; p_status: string }
        Returns: Json
      }
      admin_set_evaluation_procedures: {
        Args: { p_clinic: string; p_ids: number[] }
        Returns: Json
      }
      admin_sugestao_stats: {
        Args: { p_clinic: string; p_dias?: number }
        Returns: {
          bloqueadas: number
          descartadas: number
          editadas: number
          geradas: number
          taxa_edicao: number
          taxa_rejeicao: number
          taxa_uso: number
          usadas: number
        }[]
      }
      admin_sync_status: {
        Args: { p_org: string }
        Returns: {
          agendamentos: number
          agendamentos_pendentes: number
          last_attempt_at: string
          last_error: string
          last_success_at: string
          procedimentos: number
          profissionais: number
          resource: string
          salas: number
          status: string
          vendas: number
          vendas_pendentes: number
        }[]
      }
      admin_test_channel: {
        Args: { p_channel_account_id: string }
        Returns: {
          channel_account_id: string
          diagnostico: Json
          health_status: string
          last_tested_at: string
        }[]
      }
      admin_test_connection: {
        Args: {
          p_clinic_id: string
          p_connection_key: string
          p_provider: string
        }
        Returns: {
          connection_id: string
          diagnostico: Json
          health_status: string
          last_tested_at: string
        }[]
      }
      approve_agent_action: {
        Args: { p_action: string; p_edited?: string; p_suggestion: string }
        Returns: Json
      }
      approve_gain_without_sale: {
        Args: { p_opportunity: string; p_reason: string }
        Returns: string
      }
      build_all_metrics_yesterday: { Args: never; Returns: Json }
      build_commercial_metrics: {
        Args: { p_clinic: string; p_day: string }
        Returns: Json
      }
      cancel_task: {
        Args: { p_reason: string; p_task: string }
        Returns: string
      }
      clinic_role_of: { Args: { p_clinic: string }; Returns: string }
      close_recovered_by_sale: { Args: { p_limit?: number }; Returns: Json }
      complete_task: {
        Args: {
          p_close_case?: boolean
          p_next_due_at?: string
          p_next_title?: string
          p_result_note?: string
          p_task: string
        }
        Returns: string
      }
      confirm_gain_suggestion: {
        Args: { p_note?: string; p_suggestion: string }
        Returns: string
      }
      create_opportunity_from_conversation: {
        Args: {
          p_amount_cents?: number
          p_conversation: string
          p_source: string
        }
        Returns: string
      }
      create_task: {
        Args: {
          p_assignee?: string
          p_due_at: string
          p_entity_id: string
          p_entity_type: string
          p_kind?: string
          p_priority?: string
          p_title: string
        }
        Returns: string
      }
      desativar_catalogo_ausente: {
        Args: { p_presentes: string[]; p_resource: string }
        Returns: number
      }
      detect_post_evaluation: {
        Args: { p_desde_dias?: number; p_limit?: number }
        Returns: Json
      }
      dismiss_gain_suggestion: {
        Args: { p_note?: string; p_suggestion: string }
        Returns: string
      }
      effective_clinic_setting: {
        Args: { p_clinic: string; p_key: string }
        Returns: {
          origin: string
          setting_version: number
          value_json: Json
        }[]
      }
      em_expediente: {
        Args: { p_clinic: string; p_now?: string }
        Returns: boolean
      }
      enroll_followup: {
        Args: {
          p_contact: string
          p_conversation?: string
          p_opportunity?: string
          p_policy: string
        }
        Returns: Json
      }
      escalate_ticket: {
        Args: { p_reason: string; p_ticket: string }
        Returns: Json
      }
      evaluation_indicator: {
        Args: { p_ate?: string; p_clinic: string; p_de?: string }
        Returns: Json
      }
      expert_allowed_operations: {
        Args: never
        Returns: {
          method: string
          path: string
        }[]
      }
      fila_arquivar: {
        Args: { p_fila: string; p_msg_id: number }
        Returns: boolean
      }
      fila_elegiveis: {
        Args: { p_queue: string }
        Returns: {
          active_load: number
          last_received: string
          tem_skills: boolean
          user_id: string
        }[]
      }
      fila_enviar: { Args: { p_fila: string; p_msg: Json }; Returns: number }
      fila_ler: {
        Args: { p_fila: string; p_qty: number; p_vt: number }
        Returns: unknown[]
        SetofOptions: {
          from: '*'
          to: 'message_record'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      followup_elegivel: { Args: { p_enrollment: string }; Returns: Json }
      followup_enroll_due: { Args: never; Returns: Json }
      followup_pode_enviar_automatico: {
        Args: { p_clinic: string; p_template: string }
        Returns: Json
      }
      followup_process_due: { Args: { p_limit?: number }; Returns: Json }
      followup_proxima_abertura: {
        Args: { p_clinic: string; p_policy: string }
        Returns: string
      }
      gen_random_bytes: { Args: { n: number }; Returns: string }
      get_baseline: { Args: { p_clinic: string }; Returns: Json }
      get_manager_panel: {
        Args: { p_ate: string; p_clinic: string; p_de: string }
        Returns: Json
      }
      get_scheduling_context: {
        Args: { p_clinic: string; p_procedure_expert_id: number }
        Returns: Json
      }
      has_clinic_role: {
        Args: { p_clinic: string; p_roles: string[] }
        Returns: boolean
      }
      invalidate_expert_cache: {
        Args: { p_clinic_id: string; p_phone: string }
        Returns: number
      }
      is_active_member: {
        Args: { p_clinic: string; p_org: string }
        Returns: boolean
      }
      is_clinic_manager: { Args: { p_clinic: string }; Returns: boolean }
      is_clinic_member: { Args: { p_clinic: string }; Returns: boolean }
      is_clinic_member_of: {
        Args: { p_clinic: string; p_user: string }
        Returns: boolean
      }
      is_clinic_writer: {
        Args: { p_clinic: string; p_org: string }
        Returns: boolean
      }
      is_colleague: { Args: { p_user: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_member_for_user: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      is_org_owner: { Args: { p_org: string }; Returns: boolean }
      is_org_writer: { Args: { p_org: string }; Returns: boolean }
      link_appointments_to_ticket: { Args: { p_limit?: number }; Returns: Json }
      link_expert_patient: {
        Args: {
          p_clinic_id: string
          p_contact_id: string
          p_expert_patient_uuid: string
          p_match_method?: string
        }
        Returns: Json
      }
      list_contact_timeline: {
        Args: { p_contact: string; p_limit?: number }
        Returns: {
          autor: string
          detalhe: string
          origem: string
          quando: string
          titulo: string
        }[]
      }
      list_gain_suggestions: {
        Args: { p_clinic: string }
        Returns: {
          amount_cents: number
          contact_name: string
          created_at: string
          id: string
          opportunity_id: string
          sale_amount_cents: number
          sale_date: string
          sale_expert_uuid: string
          stage_label: string
          status: string
        }[]
      }
      list_my_day: {
        Args: { p_clinic: string }
        Returns: {
          atrasada: boolean
          contato: string
          due_at: string
          entity_id: string
          entity_type: string
          id: string
          is_automatic: boolean
          kind: string
          priority: string
          status: string
          title: string
        }[]
      }
      list_opportunities: {
        Args: { p_clinic: string; p_pipeline?: string }
        Returns: {
          amount_cents: number
          contact_name: string
          contact_phone: string
          dias_na_etapa: number
          id: string
          owner_user_id: string
          stage_id: string
          stage_key: string
          stage_label: string
          stage_position: number
          status: string
          title: string
          updated_at: string
        }[]
      }
      list_opportunity_history: {
        Args: { p_opportunity: string }
        Returns: {
          autor: string
          de: string
          id: string
          motivo: string
          para: string
          quando: string
        }[]
      }
      list_pending_units: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          patient_name: string
          professional_expert_uuid: string
          professional_mapeado: boolean
          professional_name: string
          room_expert_id: number
          starts_at: string
          status: string
        }[]
      }
      list_recovery_cases: {
        Args: { p_clinic: string; p_status?: string }
        Returns: Json
      }
      listar_vendas: {
        Args: { p_ate?: string; p_clinic: string; p_de?: string }
        Returns: {
          buyer_name: string
          discount_cents: number
          final_amount_cents: number
          id: string
          pode_ver_valor: boolean
          sale_date: string
          seller_expert_uuid: string
        }[]
      }
      move_opportunity: {
        Args: {
          p_opportunity: string
          p_reason?: string
          p_sale_uuid?: string
          p_stage: string
        }
        Returns: string
      }
      move_opportunity_to_evaluation: {
        Args: { p_limit?: number }
        Returns: Json
      }
      normalize_e164: { Args: { p_raw: string }; Returns: string }
      open_ticket: {
        Args: { p_conversation: string; p_priority?: number; p_reason: string }
        Returns: string
      }
      opportunity_for_conversation: {
        Args: { p_conversation: string }
        Returns: Json
      }
      patient_appointments_for_contact: {
        Args: { p_conversation: string; p_limit?: number }
        Returns: Json
      }
      reapply_appointment_clinics: {
        Args: never
        Returns: {
          atribuidos: number
          pendentes: number
          recalculados: number
        }[]
      }
      reassign_task: {
        Args: { p_assignee: string; p_note?: string; p_task: string }
        Returns: string
      }
      register_consent: {
        Args: {
          p_channel: string
          p_contact: string
          p_purpose: string
          p_source: string
          p_status: string
        }
        Returns: undefined
      }
      register_evaluation_result: {
        Args: {
          p_case: string
          p_loss_reason?: string
          p_note?: string
          p_result: string
        }
        Returns: Json
      }
      resolve_appointment_clinic: {
        Args: {
          p_organization: string
          p_professional_expert_uuid: string
          p_room_expert_id: number
        }
        Returns: string
      }
      resolve_ticket: {
        Args: {
          p_code: string
          p_next_action?: string
          p_note: string
          p_ticket: string
        }
        Returns: Json
      }
      resolver_responsavel: {
        Args: { p_clinic: string; p_contact: string }
        Returns: string
      }
      return_ticket: {
        Args: { p_reason: string; p_ticket: string }
        Returns: Json
      }
      return_to_automation: { Args: { p_conversation: string }; Returns: Json }
      save_procedure_professionals: {
        Args: { p_clinic: string; p_linhas: Json }
        Returns: Json
      }
      send_human_message: {
        Args: { p_body: string; p_conversation: string }
        Returns: string
      }
      set_evaluation_defaults_draft: {
        Args: { p_clinic: string }
        Returns: Json
      }
      set_scheduling_defaults_draft: {
        Args: { p_clinic: string }
        Returns: Json
      }
      suggest_gains_from_sales: {
        Args: { p_clinic: string; p_since?: string }
        Returns: number
      }
      transfer_ticket: {
        Args: { p_reason: string; p_ticket: string; p_to: string }
        Returns: Json
      }
      unlink_expert_patient: {
        Args: { p_clinic_id: string; p_expert_patient_uuid: string }
        Returns: Json
      }
      update_presence: {
        Args: { p_clinic: string; p_state: string }
        Returns: undefined
      }
      user_org_ids: { Args: never; Returns: string[] }
      validate_baseline: { Args: { p_clinic: string }; Returns: Json }
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
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
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
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
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
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
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
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Papéis de usuário (membrerships.role). Exportado manualmente: o gerador de
// tipos não o produz — NÃO apagar ao regerar src/lib/supabase/types.ts.
export type Papel =
  | 'owner'
  | 'clinic_admin'
  | 'manager'
  | 'sales'
  | 'post_sales'
  | 'reception'
  | 'nutritionist'
  | 'viewer'
