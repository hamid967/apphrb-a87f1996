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
      api_key_usage: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          org_id: string
          request_ip: string | null
          status_code: number
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint: string
          id?: string
          org_id: string
          request_ip?: string | null
          status_code: number
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          org_id?: string
          request_ip?: string | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_key_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
          scopes: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
          scopes?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
          scopes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          feedback: string | null
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          feedback?: string | null
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          feedback?: string | null
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_bids: {
        Row: {
          amount: number
          auction_id: string
          bidder_id: string
          id: string
          placed_at: string
        }
        Insert: {
          amount: number
          auction_id: string
          bidder_id: string
          id?: string
          placed_at?: string
        }
        Update: {
          amount?: number
          auction_id?: string
          bidder_id?: string
          id?: string
          placed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
        ]
      }
      auctions: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          current_high: number | null
          description: string | null
          end_at: string
          id: string
          min_increment: number
          org_id: string
          property_id: string | null
          reserve_price: number | null
          start_at: string
          starting_price: number
          status: string
          title_ar: string
          title_en: string
          updated_at: string
          winner_bid_id: string | null
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          current_high?: number | null
          description?: string | null
          end_at: string
          id?: string
          min_increment?: number
          org_id: string
          property_id?: string | null
          reserve_price?: number | null
          start_at: string
          starting_price: number
          status?: string
          title_ar: string
          title_en: string
          updated_at?: string
          winner_bid_id?: string | null
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          current_high?: number | null
          description?: string | null
          end_at?: string
          id?: string
          min_increment?: number
          org_id?: string
          property_id?: string | null
          reserve_price?: number | null
          start_at?: string
          starting_price?: number
          status?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          winner_bid_id?: string | null
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auctions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string
          id?: string
        }
        Relationships: []
      }
      autopay_schedules: {
        Row: {
          active: boolean
          contract_id: string
          created_at: string
          day_of_month: number
          id: string
          method_id: string
          org_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          contract_id: string
          created_at?: string
          day_of_month?: number
          id?: string
          method_id: string
          org_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          contract_id?: string
          created_at?: string
          day_of_month?: number
          id?: string
          method_id?: string
          org_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopay_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopay_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "autopay_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "autopay_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "autopay_schedules_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods_saved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopay_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopay_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          notes: string | null
          org_id: string
          size_bytes: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          notes?: string | null
          org_id: string
          size_bytes?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          notes?: string | null
          org_id?: string
          size_bytes?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          country_id: string | null
          created_at: string
          id: string
          name: string
          swift: string | null
          updated_at: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          id?: string
          name: string
          swift?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          id?: string
          name?: string
          swift?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          body_ar: string
          body_en: string
          cover_url: string | null
          created_at: string
          excerpt_ar: string | null
          excerpt_en: string | null
          id: string
          published_at: string | null
          slug: string
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_ar: string
          body_en: string
          cover_url?: string | null
          created_at?: string
          excerpt_ar?: string | null
          excerpt_en?: string | null
          id?: string
          published_at?: string | null
          slug: string
          title_ar: string
          title_en: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_ar?: string
          body_en?: string
          cover_url?: string | null
          created_at?: string
          excerpt_ar?: string | null
          excerpt_en?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city_id: string | null
          code: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          manager_id: string | null
          name: string
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          manager_id?: string | null
          name: string
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city_id?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          manager_id?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string | null
          branch_id: string | null
          built_year: number | null
          code: string | null
          created_at: string
          deleted_at: string | null
          floors_count: number | null
          id: string
          name: string
          org_id: string
          property_id: string | null
          units_count: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          built_year?: number | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          floors_count?: number | null
          id?: string
          name: string
          org_id: string
          property_id?: string | null
          units_count?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          built_year?: number | null
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          floors_count?: number | null
          id?: string
          name?: string
          org_id?: string
          property_id?: string | null
          units_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country_id: string
          created_at: string
          id: string
          name: string
          name_ar: string | null
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          name: string
          name_ar?: string | null
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          name?: string
          name_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          agent_id: string | null
          amount: number | null
          created_at: string
          created_by: string
          currency: string
          deal_id: string
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          percent: number | null
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          amount?: number | null
          created_at?: string
          created_by: string
          currency?: string
          deal_id: string
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          percent?: number | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          deal_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          percent?: number | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city_id: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          establishment_no: string
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          org_id: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          establishment_no: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          org_id: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          establishment_no?: string
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          org_id: string
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number
          contract_number: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          deleted_at: string | null
          deposit: number | null
          ejar_reference: string | null
          ejar_sent_at: string | null
          end_date: string
          id: string
          notes: string | null
          org_id: string
          owner_id: string | null
          payment_frequency: string | null
          start_date: string
          status: string
          tenant_id: string | null
          type: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          deleted_at?: string | null
          deposit?: number | null
          ejar_reference?: string | null
          ejar_sent_at?: string | null
          end_date: string
          id?: string
          notes?: string | null
          org_id: string
          owner_id?: string | null
          payment_frequency?: string | null
          start_date: string
          status?: string
          tenant_id?: string | null
          type?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          deleted_at?: string | null
          deposit?: number | null
          ejar_reference?: string | null
          ejar_sent_at?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          payment_frequency?: string | null
          start_date?: string
          status?: string
          tenant_id?: string | null
          type?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          name_ar: string | null
          phone_code: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          name_ar?: string | null
          phone_code?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          name_ar?: string | null
          phone_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimals: number
          id: string
          name: string
          symbol: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          decimals?: number
          id?: string
          name: string
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          decimals?: number
          id?: string
          name?: string
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deals: {
        Row: {
          agreed_amount: number | null
          close_date: string | null
          contract_url: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          lead_id: string | null
          notes: string | null
          offer_amount: number | null
          offer_date: string
          org_id: string
          primary_contact_id: string
          property_id: string
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
        }
        Insert: {
          agreed_amount?: number | null
          close_date?: string | null
          contract_url?: string | null
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          offer_amount?: number | null
          offer_date?: string
          org_id: string
          primary_contact_id: string
          property_id: string
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Update: {
          agreed_amount?: number | null
          close_date?: string | null
          contract_url?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          offer_amount?: number | null
          offer_date?: string
          org_id?: string
          primary_contact_id?: string
          property_id?: string
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string
          units: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string
          units?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string
          units?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          branch_id: string | null
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          file_path: string
          file_size: number
          id: string
          mime_type: string | null
          notes: string | null
          org_id: string
          uploaded_by: string | null
          version_no: number
        }
        Insert: {
          created_at?: string
          document_id: string
          file_path: string
          file_size?: number
          id?: string
          mime_type?: string | null
          notes?: string | null
          org_id: string
          uploaded_by?: string | null
          version_no: number
        }
        Update: {
          created_at?: string
          document_id?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string | null
          notes?: string | null
          org_id?: string
          uploaded_by?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["doc_category"]
          contact_id: string | null
          created_at: string
          created_by: string | null
          current_version_id: string | null
          deal_id: string | null
          id: string
          notes: string | null
          org_id: string
          property_id: string | null
          signature_data: string | null
          signature_status: Database["public"]["Enums"]["doc_sign_status"]
          signed_at: string | null
          signed_by_name: string | null
          status: Database["public"]["Enums"]["doc_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["doc_category"]
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deal_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          property_id?: string | null
          signature_data?: string | null
          signature_status?: Database["public"]["Enums"]["doc_sign_status"]
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["doc_category"]
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          deal_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          property_id?: string | null
          signature_data?: string | null
          signature_status?: Database["public"]["Enums"]["doc_sign_status"]
          signed_at?: string | null
          signed_by_name?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      email_providers: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          org_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_providers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          job_title: string | null
          org_id: string
          phone: string | null
          salary: number | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          job_title?: string | null
          org_id: string
          phone?: string | null
          salary?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          job_title?: string | null
          org_id?: string
          phone?: string | null
          salary?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_batches: {
        Row: {
          batch_number: string
          batch_type: string
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          org_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          batch_number: string
          batch_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          org_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string
          batch_type?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      expense_claims: {
        Row: {
          amount: number
          approved_at: string | null
          batch_id: string | null
          category: string | null
          claim_number: string
          contract_id: string | null
          correction_reason: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          expense_id: string | null
          id: string
          invoice_id: string | null
          org_id: string
          original_claim_id: string | null
          receipt_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["expense_claim_status"]
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          batch_id?: string | null
          category?: string | null
          claim_number: string
          contract_id?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          org_id: string
          original_claim_id?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["expense_claim_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          batch_id?: string | null
          category?: string | null
          claim_number?: string
          contract_id?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          org_id?: string
          original_claim_id?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["expense_claim_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "expense_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "expense_claims_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "expense_claims_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "expense_claims_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "expense_claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_original_claim_id_fkey"
            columns: ["original_claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          org_id: string
          property_id: string | null
          receipt_url: string | null
          spent_at: string
          updated_at: string
          vat_amount: number
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          org_id: string
          property_id?: string | null
          receipt_url?: string | null
          spent_at?: string
          updated_at?: string
          vat_amount?: number
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          org_id?: string
          property_id?: string | null
          receipt_url?: string | null
          spent_at?: string
          updated_at?: string
          vat_amount?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          format: string
          id: string
          org_id: string
          params: Json
          progress: number
          result_data: Json | null
          result_url: string | null
          row_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["export_job_status"]
          step: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          format: string
          id?: string
          org_id: string
          params?: Json
          progress?: number
          result_data?: Json | null
          result_url?: string | null
          row_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          step?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          format?: string
          id?: string
          org_id?: string
          params?: Json
          progress?: number
          result_data?: Json | null
          result_url?: string | null
          row_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          step?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_entries: {
        Row: {
          answer_ar: string
          answer_en: string
          category: string
          created_at: string
          id: string
          is_published: boolean
          order_index: number
          question_ar: string
          question_en: string
          updated_at: string
        }
        Insert: {
          answer_ar: string
          answer_en: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean
          order_index?: number
          question_ar: string
          question_en: string
          updated_at?: string
        }
        Update: {
          answer_ar?: string
          answer_en?: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean
          order_index?: number
          question_ar?: string
          question_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      filter_analytics_events: {
        Row: {
          action: string | null
          chip_count: number | null
          created_at: string
          distance_px: number | null
          event_name: string
          filter_key: string | null
          id: string
          path: string | null
          prev_event_age_ms: number | null
          prev_event_name: string | null
          progress: number | null
          reached_end: boolean | null
          remaining: number | null
          session_id: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          chip_count?: number | null
          created_at?: string
          distance_px?: number | null
          event_name: string
          filter_key?: string | null
          id?: string
          path?: string | null
          prev_event_age_ms?: number | null
          prev_event_name?: string | null
          progress?: number | null
          reached_end?: boolean | null
          remaining?: number | null
          session_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          chip_count?: number | null
          created_at?: string
          distance_px?: number | null
          event_name?: string
          filter_key?: string | null
          id?: string
          path?: string | null
          prev_event_age_ms?: number | null
          prev_event_name?: string | null
          progress?: number | null
          reached_end?: boolean | null
          remaining?: number | null
          session_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      floors: {
        Row: {
          building_id: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string | null
          number: number
          org_id: string
          units_count: number | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string | null
          number: number
          org_id: string
          units_count?: number | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string | null
          number?: number
          org_id?: string
          units_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "floors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intro_events: {
        Row: {
          created_at: string
          event: string
          id: string
          path: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          path?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          path?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["zatca_invoice_type"]
          issue_date: string
          notes: string | null
          number: string
          org_id: string
          paid_at: string | null
          previous_hash: string | null
          property_id: string | null
          qr_tlv: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          xml_ubl: string | null
          zatca_counter: number | null
          zatca_hash: string | null
          zatca_reported_at: string | null
          zatca_sealed_at: string | null
          zatca_status: Database["public"]["Enums"]["zatca_status"]
          zatca_uuid: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["zatca_invoice_type"]
          issue_date?: string
          notes?: string | null
          number: string
          org_id: string
          paid_at?: string | null
          previous_hash?: string | null
          property_id?: string | null
          qr_tlv?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          xml_ubl?: string | null
          zatca_counter?: number | null
          zatca_hash?: string | null
          zatca_reported_at?: string | null
          zatca_sealed_at?: string | null
          zatca_status?: Database["public"]["Enums"]["zatca_status"]
          zatca_uuid?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["zatca_invoice_type"]
          issue_date?: string
          notes?: string | null
          number?: string
          org_id?: string
          paid_at?: string | null
          previous_hash?: string | null
          property_id?: string | null
          qr_tlv?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          xml_ubl?: string | null
          zatca_counter?: number | null
          zatca_hash?: string | null
          zatca_reported_at?: string | null
          zatca_sealed_at?: string | null
          zatca_status?: Database["public"]["Enums"]["zatca_status"]
          zatca_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          org_id: string
          property_id: string | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          org_id: string
          property_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          org_id?: string
          property_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          area: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          gallery: string[]
          hero_image: string | null
          id: string
          org_id: string
          price: number
          published: boolean
          seo_description: string | null
          seo_title: string | null
          slug: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          gallery?: string[]
          hero_image?: string | null
          id?: string
          org_id: string
          price: number
          published?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          gallery?: string[]
          hero_image?: string | null
          id?: string
          org_id?: string
          price?: number
          published?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "listings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          email: string | null
          id: string
          ip_address: string | null
          location: string | null
          reason: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          reason?: string | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          reason?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          meta: Json
          org_id: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          meta?: Json
          org_id?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          meta?: Json
          org_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_comments: {
        Row: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          org_id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_type?: string
          body: string
          created_at?: string
          id?: string
          org_id: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_parts: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          notes: string | null
          org_id: string
          quantity: number
          sku: string | null
          supplier: string | null
          ticket_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          quantity?: number
          sku?: string | null
          supplier?: string | null
          ticket_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          quantity?: number
          sku?: string | null
          supplier?: string | null
          ticket_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          completed_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          notes: string | null
          org_id: string
          photos: string[]
          priority: Database["public"]["Enums"]["ticket_priority"]
          property_id: string | null
          reported_by_contact_id: string | null
          scheduled_at: string | null
          source: string
          status: Database["public"]["Enums"]["ticket_status"]
          submitted_by_tenant_id: string | null
          technician_id: string | null
          tenant_visible_notes: string | null
          ticket_no: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          notes?: string | null
          org_id: string
          photos?: string[]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          reported_by_contact_id?: string | null
          scheduled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          submitted_by_tenant_id?: string | null
          technician_id?: string | null
          tenant_visible_notes?: string | null
          ticket_no: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          photos?: string[]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          reported_by_contact_id?: string | null
          scheduled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          submitted_by_tenant_id?: string | null
          technician_id?: string | null
          tenant_visible_notes?: string | null
          ticket_no?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_reported_by_contact_id_fkey"
            columns: ["reported_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_submitted_by_tenant_id_fkey"
            columns: ["submitted_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          link: string | null
          location: string | null
          org_id: string
          organizer_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          link?: string | null
          location?: string | null
          org_id: string
          organizer_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          link?: string | null
          location?: string | null
          org_id?: string
          organizer_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_refresh_log: {
        Row: {
          duration_ms: number | null
          mv_name: string
          refreshed_at: string
          row_count: number | null
        }
        Insert: {
          duration_ms?: number | null
          mv_name: string
          refreshed_at?: string
          row_count?: number | null
        }
        Update: {
          duration_ms?: number | null
          mv_name?: string
          refreshed_at?: string
          row_count?: number | null
        }
        Relationships: []
      }
      notification_channel_settings: {
        Row: {
          channel: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          org_id: string
          reply_to: string | null
          sender_name: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          org_id: string
          reply_to?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          org_id?: string
          reply_to?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          created_by: string | null
          failed_permanent_at: string | null
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          last_error: string | null
          org_id: string
          recipient: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          template: string
          updated_at: string
          variables: Json
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          created_by?: string | null
          failed_permanent_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          org_id: string
          recipient: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          created_by?: string | null
          failed_permanent_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          org_id?: string
          recipient?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_ar: string
          body_en: string
          channel: string
          created_at: string
          enabled: boolean
          id: string
          org_id: string
          subject_ar: string | null
          subject_en: string | null
          template_key: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_ar?: string
          body_en?: string
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id: string
          subject_ar?: string | null
          subject_en?: string | null
          template_key: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_ar?: string
          body_en?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          org_id?: string
          subject_ar?: string | null
          subject_en?: string | null
          template_key?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          id: string
          link: string | null
          org_id: string | null
          read_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_import_settings: {
        Row: {
          contacts_match_keys: string[]
          contacts_strategy: string
          leads_strategy: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contacts_match_keys?: string[]
          contacts_strategy?: string
          leads_strategy?: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contacts_match_keys?: string[]
          contacts_strategy?: string
          leads_strategy?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_import_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sequences: {
        Row: {
          kind: string
          last_value: number
          org_id: string
          year: number
        }
        Insert: {
          kind: string
          last_value?: number
          org_id: string
          year: number
        }
        Update: {
          kind?: string
          last_value?: number
          org_id?: string
          year?: number
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          org_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          org_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          org_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      owner_statement_lines: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: string
          ref_id: string | null
          ref_type: string | null
          statement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          ref_id?: string | null
          ref_type?: string | null
          statement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          ref_id?: string | null
          ref_type?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "owner_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_statements: {
        Row: {
          created_at: string
          currency: string
          expenses_total: number
          gross_income: number
          id: string
          issued_at: string | null
          management_fee: number
          net_payout: number
          org_id: string
          owner_id: string
          pdf_url: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["owner_statement_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          expenses_total?: number
          gross_income?: number
          id?: string
          issued_at?: string | null
          management_fee?: number
          net_payout?: number
          org_id: string
          owner_id: string
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["owner_statement_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          expenses_total?: number
          gross_income?: number
          id?: string
          issued_at?: string | null
          management_fee?: number
          net_payout?: number
          org_id?: string
          owner_id?: string
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["owner_statement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_statements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_statements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_statements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      owners: {
        Row: {
          address: string | null
          bank_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owners_sensitive: {
        Row: {
          created_at: string
          iban: string | null
          national_id: string | null
          org_id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          iban?: string | null
          national_id?: string | null
          org_id: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          iban?: string | null
          national_id?: string | null
          org_id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_sensitive_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owners_sensitive_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owners_sensitive_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          max_properties: number | null
          max_units: number | null
          max_users: number | null
          name: string
          price_monthly: number
          price_yearly: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          max_properties?: number | null
          max_units?: number | null
          max_users?: number | null
          name: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          max_properties?: number | null
          max_units?: number | null
          max_users?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_approvals: {
        Row: {
          action: string
          actor: string
          bank_reference: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
          id: string
          note: string | null
          payment_id: string
          to_status:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
        }
        Insert: {
          action: string
          actor: string
          bank_reference?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
          id?: string
          note?: string | null
          payment_id: string
          to_status?:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
        }
        Update: {
          action?: string
          actor?: string
          bank_reference?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
          id?: string
          note?: string | null
          payment_id?: string
          to_status?:
            | Database["public"]["Enums"]["subscription_payment_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_approvals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "subscription_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods_saved: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          is_default: boolean
          last4: string | null
          org_id: string
          provider: string
          provider_ref: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last4?: string | null
          org_id: string
          provider?: string
          provider_ref?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          last4?: string | null
          org_id?: string
          provider?: string
          provider_ref?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_saved_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_saved_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          amount: number
          commission_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          due_date: string
          id: string
          installment_no: number
          invoice_id: string | null
          notes: string | null
          org_id: string
          source_type: Database["public"]["Enums"]["payment_schedule_source"]
          status: Database["public"]["Enums"]["payment_schedule_status"]
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          voucher_id: string | null
        }
        Insert: {
          amount: number
          commission_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_date: string
          id?: string
          installment_no: number
          invoice_id?: string | null
          notes?: string | null
          org_id: string
          source_type: Database["public"]["Enums"]["payment_schedule_source"]
          status?: Database["public"]["Enums"]["payment_schedule_status"]
          total_amount: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          commission_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_date?: string
          id?: string
          installment_no?: number
          invoice_id?: string | null
          notes?: string | null
          org_id?: string
          source_type?: Database["public"]["Enums"]["payment_schedule_source"]
          status?: Database["public"]["Enums"]["payment_schedule_status"]
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "payment_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "payment_schedules_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          currency: string
          id: string
          method_id: string | null
          org_id: string
          processed_at: string | null
          provider_ref: string | null
          receipt_number: string | null
          status: Database["public"]["Enums"]["payment_txn_status"]
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          currency?: string
          id?: string
          method_id?: string | null
          org_id: string
          processed_at?: string | null
          provider_ref?: string | null
          receipt_number?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          currency?: string
          id?: string
          method_id?: string | null
          org_id?: string
          processed_at?: string | null
          provider_ref?: string | null
          receipt_number?: string | null
          status?: Database["public"]["Enums"]["payment_txn_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "rent_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods_saved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_id: string | null
          contract_id: string | null
          created_at: string
          currency_code: string | null
          deleted_at: string | null
          id: string
          invoice_id: string | null
          method_id: string | null
          notes: string | null
          org_id: string
          paid_at: string
          reference: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          method_id?: string | null
          notes?: string | null
          org_id: string
          paid_at?: string
          reference?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          method_id?: string | null
          notes?: string | null
          org_id?: string
          paid_at?: string
          reference?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_violations: {
        Row: {
          amount: number | null
          category: string | null
          claim_id: string
          created_at: string
          currency: string | null
          id: string
          limit_amount: number | null
          org_id: string
          policy_id: string | null
          reason: string
          rule_type: string
          severity: string
        }
        Insert: {
          amount?: number | null
          category?: string | null
          claim_id: string
          created_at?: string
          currency?: string | null
          id?: string
          limit_amount?: number | null
          org_id: string
          policy_id?: string | null
          reason: string
          rule_type: string
          severity?: string
        }
        Update: {
          amount?: number | null
          category?: string | null
          claim_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          limit_amount?: number | null
          org_id?: string
          policy_id?: string | null
          reason?: string
          rule_type?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_violations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_violations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_violations_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "spending_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          kind: string
          org_id: string
          owner_id: string | null
          tenant_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          kind: string
          org_id: string
          owner_id?: string | null
          tenant_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          kind?: string
          org_id?: string
          owner_id?: string | null
          tenant_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_invitations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_invitations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "portal_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          dashboard_layout: Json
          department: string | null
          full_name: string | null
          id: string
          job_title: string | null
          language: string
          manager_id: string | null
          onboarding_completed_at: string | null
          onboarding_progress: Json
          owner_id: string | null
          permissions: Json
          phone: string | null
          phone_country: string | null
          signup_reason: string | null
          tenant_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          dashboard_layout?: Json
          department?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          language?: string
          manager_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_progress?: Json
          owner_id?: string | null
          permissions?: Json
          phone?: string | null
          phone_country?: string | null
          signup_reason?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          dashboard_layout?: Json
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          language?: string
          manager_id?: string | null
          onboarding_completed_at?: string | null
          onboarding_progress?: Json
          owner_id?: string | null
          permissions?: Json
          phone?: string | null
          phone_country?: string | null
          signup_reason?: string | null
          tenant_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_sqm: number | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          currency: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_public: boolean
          latitude: number | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          longitude: number | null
          org_id: string
          price: number
          property_type: Database["public"]["Enums"]["property_type"]
          status: Database["public"]["Enums"]["listing_status"]
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_public?: boolean
          latitude?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          longitude?: number | null
          org_id: string
          price?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          status?: Database["public"]["Enums"]["listing_status"]
          title_ar: string
          title_en: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_public?: boolean
          latitude?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          longitude?: number | null
          org_id?: string
          price?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          status?: Database["public"]["Enums"]["listing_status"]
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          created_at: string
          id: string
          property_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          property_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          property_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_valuations: {
        Row: {
          ai_notes: string | null
          comparables: Json
          confidence: string
          created_at: string
          created_by: string
          currency: string
          factors: Json
          id: string
          input_snapshot: Json
          max_price: number
          min_price: number
          model: string | null
          org_id: string
          property_id: string | null
          purpose: string
          recommendations: Json
          suggested_price: number
        }
        Insert: {
          ai_notes?: string | null
          comparables?: Json
          confidence?: string
          created_at?: string
          created_by: string
          currency?: string
          factors?: Json
          id?: string
          input_snapshot?: Json
          max_price?: number
          min_price?: number
          model?: string | null
          org_id: string
          property_id?: string | null
          purpose: string
          recommendations?: Json
          suggested_price?: number
        }
        Update: {
          ai_notes?: string | null
          comparables?: Json
          confidence?: string
          created_at?: string
          created_by?: string
          currency?: string
          factors?: Json
          id?: string
          input_snapshot?: Json
          max_price?: number
          min_price?: number
          model?: string | null
          org_id?: string
          property_id?: string | null
          purpose?: string
          recommendations?: Json
          suggested_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_valuations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_valuations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_viewings: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          duration_min: number
          id: string
          notes: string | null
          org_id: string
          property_id: string | null
          scheduled_at: string
          source: string
          status: string
          updated_at: string
          visitor_email: string | null
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          duration_min?: number
          id?: string
          notes?: string | null
          org_id: string
          property_id?: string | null
          scheduled_at: string
          source?: string
          status?: string
          updated_at?: string
          visitor_email?: string | null
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number
          id?: string
          notes?: string | null
          org_id?: string
          property_id?: string | null
          scheduled_at?: string
          source?: string
          status?: string
          updated_at?: string
          visitor_email?: string | null
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_viewings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_viewings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          level: Database["public"]["Enums"]["permission_level"]
          resource: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          level: Database["public"]["Enums"]["permission_level"]
          resource: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          level?: Database["public"]["Enums"]["permission_level"]
          resource?: string
        }
        Relationships: []
      }
      rbac_role_permissions: {
        Row: {
          allow: boolean
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          allow?: boolean
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          allow?: boolean
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "rbac_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_roles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_user_roles: {
        Row: {
          branch_id: string | null
          company_id: string | null
          created_at: string
          department_id: string | null
          granted_by: string | null
          id: string
          org_id: string
          role_id: string
          scope_type: Database["public"]["Enums"]["rbac_scope_type"]
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          granted_by?: string | null
          id?: string
          org_id: string
          role_id: string
          scope_type?: Database["public"]["Enums"]["rbac_scope_type"]
          user_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          granted_by?: string | null
          id?: string
          org_id?: string
          role_id?: string
          scope_type?: Database["public"]["Enums"]["rbac_scope_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      realtime_connection_events: {
        Row: {
          attempt: number | null
          channel_key: string
          created_at: string
          detail: string | null
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          attempt?: number | null
          channel_key: string
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          attempt?: number | null
          channel_key?: string
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      rent_charges: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          currency: string
          due_date: string
          id: string
          org_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["rent_charge_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          org_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["rent_charge_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          org_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["rent_charge_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "rent_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "rent_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "rent_charges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_applications: {
        Row: {
          applicant_name: string
          converted_contract_id: string | null
          converted_tenant_id: string | null
          created_at: string
          credit_check_consent: boolean
          current_rent: number | null
          dependents: number | null
          documents: Json
          email: string
          employer: string | null
          employment_type: string | null
          id: string
          id_type: string | null
          listing_id: string
          monthly_income: number | null
          move_in_date: string | null
          national_id: string | null
          notes: string | null
          org_id: string
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          score_reason: Json | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          applicant_name: string
          converted_contract_id?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          credit_check_consent?: boolean
          current_rent?: number | null
          dependents?: number | null
          documents?: Json
          email: string
          employer?: string | null
          employment_type?: string | null
          id?: string
          id_type?: string | null
          listing_id: string
          monthly_income?: number | null
          move_in_date?: string | null
          national_id?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_reason?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          applicant_name?: string
          converted_contract_id?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          credit_check_consent?: boolean
          current_rent?: number | null
          dependents?: number | null
          documents?: Json
          email?: string
          employer?: string | null
          employment_type?: string | null
          id?: string
          id_type?: string | null
          listing_id?: string
          monthly_income?: number | null
          move_in_date?: string | null
          national_id?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          score_reason?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_applications_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_applications_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "v_contract_balance"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "rental_applications_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "rental_applications_converted_contract_id_fkey"
            columns: ["converted_contract_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["active_contract_id"]
          },
          {
            foreignKeyName: "rental_applications_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_applications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          checksum: string | null
          company_id: string
          created_at: string
          error: string | null
          file_size: number | null
          format: Database["public"]["Enums"]["report_export_format"]
          generated_by: string | null
          id: string
          signed_url_expires_at: string | null
          status: Database["public"]["Enums"]["report_run_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          checksum?: string | null
          company_id: string
          created_at?: string
          error?: string | null
          file_size?: number | null
          format: Database["public"]["Enums"]["report_export_format"]
          generated_by?: string | null
          id?: string
          signed_url_expires_at?: string | null
          status?: Database["public"]["Enums"]["report_run_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          checksum?: string | null
          company_id?: string
          created_at?: string
          error?: string | null
          file_size?: number | null
          format?: Database["public"]["Enums"]["report_export_format"]
          generated_by?: string | null
          id?: string
          signed_url_expires_at?: string | null
          status?: Database["public"]["Enums"]["report_run_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          export_formats: string[]
          id: string
          is_shared: boolean
          name: string
          org_id: string
          source: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          export_formats?: string[]
          id?: string
          is_shared?: boolean
          name: string
          org_id: string
          source: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          export_formats?: string[]
          id?: string
          is_shared?: boolean
          name?: string
          org_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates_intro: {
        Row: {
          company_id: string
          created_at: string
          dynamic_metrics: Json
          id: string
          preset: Database["public"]["Enums"]["report_intro_preset"]
          rich_content_ar: string
          rich_content_en: string
          title_ar: string
          title_en: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          dynamic_metrics?: Json
          id?: string
          preset?: Database["public"]["Enums"]["report_intro_preset"]
          rich_content_ar?: string
          rich_content_en?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          dynamic_metrics?: Json
          id?: string
          preset?: Database["public"]["Enums"]["report_intro_preset"]
          rich_content_ar?: string
          rich_content_en?: string
          title_ar?: string
          title_en?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_intro_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts_schedule_runs: {
        Row: {
          attempt: number
          duration_ms: number | null
          error: string | null
          id: string
          org_id: string
          result: Json | null
          schedule_id: string
          started_at: string
          status: string
        }
        Insert: {
          attempt?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          org_id: string
          result?: Json | null
          schedule_id: string
          started_at?: string
          status: string
        }
        Update: {
          attempt?: number
          duration_ms?: number | null
          error?: string | null
          id?: string
          org_id?: string
          result?: Json | null
          schedule_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "scripts_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts_schedules: {
        Row: {
          args: Json
          created_at: string
          created_by: string
          current_retry: number
          enabled: boolean
          id: string
          interval_minutes: number
          label: string | null
          last_duration_ms: number | null
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          max_retries: number
          name: string
          next_run_at: string
          org_id: string
          retry_delay_minutes: number
          run_count: number
          updated_at: string
        }
        Insert: {
          args?: Json
          created_at?: string
          created_by: string
          current_retry?: number
          enabled?: boolean
          id?: string
          interval_minutes: number
          label?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          max_retries?: number
          name: string
          next_run_at?: string
          org_id: string
          retry_delay_minutes?: number
          run_count?: number
          updated_at?: string
        }
        Update: {
          args?: Json
          created_at?: string
          created_by?: string
          current_retry?: number
          enabled?: boolean
          id?: string
          interval_minutes?: number
          label?: string | null
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          max_retries?: number
          name?: string
          next_run_at?: string
          org_id?: string
          retry_delay_minutes?: number
          run_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_providers: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          org_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_providers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_policies: {
        Row: {
          active: boolean
          category: string
          created_at: string
          currency: string
          id: string
          keywords: string[]
          max_amount: number | null
          note: string | null
          org_id: string
          period_days: number | null
          rule_type: string
          severity: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          currency?: string
          id?: string
          keywords?: string[]
          max_amount?: number | null
          note?: string | null
          org_id: string
          period_days?: number | null
          rule_type?: string
          severity?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          currency?: string
          id?: string
          keywords?: string[]
          max_amount?: number | null
          note?: string | null
          org_id?: string
          period_days?: number | null
          rule_type?: string
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spending_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          bank_name: string | null
          bank_reference: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          org_id: string
          package_id: string | null
          receipt_url: string
          refund_amount: number | null
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["subscription_payment_status"]
          submitted_by: string
          subscription_id: string | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          bank_reference?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          org_id: string
          package_id?: string | null
          receipt_url: string
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["subscription_payment_status"]
          submitted_by: string
          subscription_id?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          bank_reference?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          org_id?: string
          package_id?: string | null
          receipt_url?: string
          refund_amount?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["subscription_payment_status"]
          submitted_by?: string
          subscription_id?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          auto_renew: boolean
          billing_cycle: string
          created_at: string
          currency_code: string | null
          deleted_at: string | null
          end_date: string | null
          id: string
          org_id: string
          package_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          org_id: string
          package_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          org_id?: string
          package_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          property_id: string | null
          remind_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          property_id?: string | null
          remind_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          property_id?: string | null
          remind_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          org_id: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technicians_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          notes: string | null
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants_sensitive: {
        Row: {
          created_at: string
          date_of_birth: string | null
          national_id: string | null
          org_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          national_id?: string | null
          org_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          national_id?: string | null
          org_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_sensitive_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_sensitive_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          org_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_policies: {
        Row: {
          created_at: string
          first_response_minutes: number
          id: string
          org_id: string
          priority: string
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_response_minutes?: number
          id?: string
          org_id: string
          priority: string
          resolution_minutes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_response_minutes?: number
          id?: string
          org_id?: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assignee_id: string | null
          category: string | null
          channel: string
          closed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          first_response_at: string | null
          id: string
          org_id: string
          priority: string
          requester_id: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: string
          subject: string
          tags: string[]
          ticket_number: string | null
          updated_at: string
          watcher_ids: string[]
        }
        Insert: {
          assignee_id?: string | null
          category?: string | null
          channel?: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          org_id: string
          priority?: string
          requester_id?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject: string
          tags?: string[]
          ticket_number?: string | null
          updated_at?: string
          watcher_ids?: string[]
        }
        Update: {
          assignee_id?: string | null
          category?: string | null
          channel?: string
          closed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          org_id?: string
          priority?: string
          requester_id?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string
          tags?: string[]
          ticket_number?: string | null
          updated_at?: string
          watcher_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          area: number | null
          bathrooms: number | null
          bedrooms: number | null
          building_id: string
          code: string
          created_at: string
          currency_code: string | null
          deleted_at: string | null
          floor_id: string | null
          id: string
          org_id: string
          rent_amount: number | null
          sale_price: number | null
          status: string
          type: string | null
          updated_at: string
        }
        Insert: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id: string
          code: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          floor_id?: string | null
          id?: string
          org_id: string
          rent_amount?: number | null
          sale_price?: number | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_id?: string
          code?: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          floor_id?: string | null
          id?: string
          org_id?: string
          rent_amount?: number | null
          sale_price?: number | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "units_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          browser: string | null
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          location: string | null
          os: string | null
          revoked_at: string | null
          trusted: boolean
          trusted_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          trusted?: boolean
          trusted_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          trusted?: boolean
          trusted_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notification_event_prefs: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          event_key: string
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          event_key: string
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          event_key?: string
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitors: {
        Row: {
          building_id: string | null
          check_in: string
          check_out: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          national_id: string | null
          org_id: string
          phone: string | null
          purpose: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          check_in?: string
          check_out?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          org_id: string
          phone?: string | null
          purpose?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          check_in?: string
          check_out?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          org_id?: string
          phone?: string | null
          purpose?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "visitors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["building_id"]
          },
          {
            foreignKeyName: "visitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_occupancy"
            referencedColumns: ["unit_id"]
          },
          {
            foreignKeyName: "visitors_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "v_unit_occupancy"
            referencedColumns: ["unit_id"]
          },
        ]
      }
    }
    Views: {
      mv_billing_pay_om: {
        Row: {
          month_start: string | null
          org_id: string | null
          package_id: string | null
          package_key: string | null
          payment_count: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members_with_profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          job_title: string | null
          joined_at: string | null
          language: string | null
          membership_id: string | null
          org_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ar_aging: {
        Row: {
          bucket: string | null
          currency: string | null
          days_overdue: number | null
          due_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          issue_date: string | null
          org_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          total: number | null
        }
        Insert: {
          bucket?: never
          currency?: string | null
          days_overdue?: never
          due_date?: string | null
          invoice_id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          org_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total?: number | null
        }
        Update: {
          bucket?: never
          currency?: string | null
          days_overdue?: never
          due_date?: string | null
          invoice_id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          org_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_contract_balance: {
        Row: {
          contract_amount: number | null
          contract_id: string | null
          org_id: string | null
          outstanding: number | null
          paid_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_occupancy: {
        Row: {
          active_contract_id: string | null
          building_id: string | null
          building_name: string | null
          contract_number: string | null
          currency_code: string | null
          days_to_expiry: number | null
          end_date: string | null
          is_occupied: boolean | null
          org_id: string | null
          owner_id: string | null
          rent_amount: number | null
          start_date: string | null
          tenant_id: string | null
          unit_code: string | null
          unit_id: string | null
          unit_status: string | null
          unit_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "v_owner_statement"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_owner_statement: {
        Row: {
          active_contracts: number | null
          active_value: number | null
          contracts_count: number | null
          email: string | null
          net_balance: number | null
          org_id: string | null
          owner_id: string | null
          owner_name: string | null
          payments_count: number | null
          phone: string | null
          total_collected: number | null
          total_expenses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "owners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_unit_occupancy: {
        Row: {
          active_contract_id: string | null
          building_id: string | null
          building_name: string | null
          code: string | null
          end_date: string | null
          org_id: string | null
          start_date: string | null
          status: string | null
          tenant_id: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_org_invitation: { Args: { _token: string }; Returns: string }
      accept_portal_invitation: { Args: { _token: string }; Returns: string }
      activate_scheduled_auctions: { Args: never; Returns: number }
      admin_billing_churned_orgs: {
        Args: { _months?: number; _package_id?: string }
        Returns: {
          last_amount: number
          last_payment_at: string
          month_start: string
          org_id: string
          org_name: string
          tenure_months: number
        }[]
      }
      admin_billing_last_refresh: { Args: never; Returns: Json }
      admin_billing_metrics: {
        Args: { _months?: number; _package_id?: string }
        Returns: Json
      }
      admin_billing_series: {
        Args: { _months?: number; _package_id?: string }
        Returns: {
          churned_orgs: number
          month_start: string
          new_paying_orgs: number
          paying_orgs: number
          revenue: number
        }[]
      }
      admin_billing_trial_orgs: {
        Args: { _days_max?: number; _days_min?: number; _package_id?: string }
        Returns: {
          cohort_month: string
          converted: boolean
          created_at: string
          first_amount: number
          first_payment_at: string
          org_id: string
          org_name: string
        }[]
      }
      admin_filter_analytics_health: { Args: never; Returns: Json }
      admin_filter_analytics_hourly: {
        Args: { _hours: number }
        Returns: {
          events: number
          hour: string
        }[]
      }
      admin_filter_analytics_overview: {
        Args: { _hours: number }
        Returns: Json
      }
      admin_filter_analytics_top_filters: {
        Args: { _hours: number; _limit: number }
        Returns: {
          apply_count: number
          filter_key: string
          remove_count: number
        }[]
      }
      admin_filter_analytics_top_paths: {
        Args: { _hours: number; _limit: number }
        Returns: {
          events: number
          path: string
        }[]
      }
      admin_list_packages: {
        Args: never
        Returns: {
          active: boolean
          code: string
          id: string
          name: string
        }[]
      }
      admin_regenerate_establishment_no: {
        Args: { _company_id: string }
        Returns: string
      }
      approve_rental_application: {
        Args: {
          _app_id: string
          _end_date: string
          _monthly_rent: number
          _start_date: string
          _unit_id: string
        }
        Returns: Json
      }
      approve_site_owner: {
        Args: { _email: string; _trial_days?: number }
        Returns: Json
      }
      approve_subscription_payment: {
        Args: { _bank_reference?: string; _id: string; _note?: string }
        Returns: Json
      }
      approve_user_trial: {
        Args: { _days?: number; _user_id: string }
        Returns: Json
      }
      bulk_apply_role_template: {
        Args: {
          _description: string
          _org: string
          _permissions: string[]
          _scope: Database["public"]["Enums"]["rbac_scope_type"]
          _template_name: string
          _template_slug: string
          _user_ids: string[]
        }
        Returns: Json
      }
      can_review_subscription_payments: {
        Args: { _user: string }
        Returns: boolean
      }
      check_login_rate_limit: {
        Args: {
          _identifier: string
          _max_attempts?: number
          _window_minutes?: number
        }
        Returns: Json
      }
      claim_pending_notifications: {
        Args: { _limit?: number; _max_attempts?: number }
        Returns: {
          attempts: number
          channel: string
          id: string
          recipient: string
          template: string
          variables: Json
        }[]
      }
      cleanup_expired_user_roles: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finalize_expired_auctions: {
        Args: never
        Returns: {
          auction_id: string
          winner_user_id: string
          winning_amount: number
        }[]
      }
      generate_owner_statement: {
        Args: { _mgmt_pct?: number; _month: string; _owner_id: string }
        Returns: string
      }
      generate_rent_charges: {
        Args: { _contract_id: string; _months?: number }
        Returns: number
      }
      get_app_setting: { Args: { _key: string }; Returns: string }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          org_name: string
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      get_my_company_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_portal_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          id: string
          kind: string
          org_id: string
          org_name: string
          owner_id: string
          tenant_id: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
          _user: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          _branch?: string
          _company?: string
          _department?: string
          _org: string
          _permission_code: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      is_linked_property_owner: {
        Args: { _owner_id: string; _user: string }
        Returns: boolean
      }
      is_linked_tenant: {
        Args: { _tenant_id: string; _user: string }
        Returns: boolean
      }
      is_org_admin: { Args: { _org: string; _user: string }; Returns: boolean }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_owner_of_contract: {
        Args: { _contract_id: string; _user: string }
        Returns: boolean
      }
      log_assistant_access: {
        Args: { _action: string; _diff: Json; _org: string }
        Returns: string
      }
      log_audit: {
        Args: {
          _action: string
          _actor?: string
          _diff?: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      log_soft_delete: {
        Args: {
          _action: string
          _entity: string
          _ids: string[]
          _reason?: string
        }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_access_status: { Args: never; Returns: Json }
      my_permissions: {
        Args: { _org: string }
        Returns: {
          branch_id: string
          code: string
          company_id: string
          department_id: string
          scope_type: Database["public"]["Enums"]["rbac_scope_type"]
        }[]
      }
      next_org_sequence: {
        Args: { _kind: string; _org: string }
        Returns: number
      }
      notify_user: {
        Args: {
          _body: string
          _link?: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      provision_developer_workspace: { Args: never; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_login_event: {
        Args: {
          _email: string
          _fingerprint: string
          _ip: string
          _reason?: string
          _status: string
          _ua: string
        }
        Returns: string
      }
      refresh_billing_mvs: { Args: never; Returns: Json }
      register_company: {
        Args: { _name: string; _phone?: string }
        Returns: Json
      }
      reject_subscription_payment: {
        Args: { _id: string; _reason: string }
        Returns: Json
      }
      reject_user: { Args: { _user_id: string }; Returns: Json }
      reset_demo_data: { Args: never; Returns: Json }
      run_daily_transitions: { Args: never; Returns: Json }
      run_reminders_scan: { Args: never; Returns: Json }
      seed_appfolio_demo: { Args: never; Returns: Json }
      seed_core_system: { Args: never; Returns: Json }
      seed_core_system_plan: { Args: never; Returns: Json }
      seed_demo_data: { Args: never; Returns: Json }
      seed_expense_claims: { Args: never; Returns: Json }
      seed_portal_test_users: {
        Args: { _owner_uid: string; _tenant_uid: string }
        Returns: Json
      }
      seed_report_templates: { Args: never; Returns: Json }
      seed_spending_policies: { Args: never; Returns: Json }
      set_app_setting: {
        Args: { _key: string; _value: string }
        Returns: undefined
      }
      soft_delete: {
        Args: { _id: string; _table: unknown }
        Returns: undefined
      }
      submit_rental_application:
        | {
            Args: {
              _applicant_name: string
              _credit_check_consent?: boolean
              _email: string
              _employer?: string
              _listing_id: string
              _monthly_income?: number
              _move_in_date?: string
              _phone: string
            }
            Returns: Json
          }
        | {
            Args: {
              _applicant_name: string
              _credit_check_consent?: boolean
              _current_rent?: number
              _dependents?: number
              _email: string
              _employer?: string
              _employment_type?: string
              _id_type?: string
              _listing_id: string
              _monthly_income?: number
              _move_in_date?: string
              _national_id?: string
              _phone: string
            }
            Returns: Json
          }
      tenant_pay_charge: {
        Args: { _charge_id: string; _method_id: string }
        Returns: string
      }
      verify_my_establishment: { Args: { _est_no: string }; Returns: boolean }
      zatca_chain_audit: {
        Args: { _org_id?: string }
        Returns: {
          counter_gap: boolean
          expected_previous_hash: string
          hash_break: boolean
          invoice_id: string
          number: string
          org_id: string
          previous_hash: string
          zatca_counter: number
          zatca_hash: string
          zatca_sealed_at: string
        }[]
      }
      zatca_next_counter: { Args: { _org_id: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "employee"
        | "manager"
        | "finance"
        | "admin"
        | "contractor"
        | "super_admin"
      application_status: "new" | "reviewing" | "approved" | "rejected"
      commission_status: "pending" | "invoiced" | "paid"
      contact_type: "buyer" | "seller" | "tenant" | "landlord" | "other"
      deal_status:
        | "offer"
        | "counter"
        | "accepted"
        | "contract"
        | "closed"
        | "cancelled"
      doc_category: "contract" | "invoice" | "id" | "report" | "other"
      doc_sign_status: "unsigned" | "pending" | "signed"
      doc_status: "active" | "archived"
      expense_category:
        | "marketing"
        | "rent"
        | "utilities"
        | "salaries"
        | "maintenance"
        | "commissions"
        | "office"
        | "travel"
        | "software"
        | "other"
      expense_claim_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "rejected"
        | "approved"
        | "corrected"
      export_job_status: "queued" | "processing" | "completed" | "failed"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "viewing"
        | "negotiation"
        | "won"
        | "lost"
      listing_status: "available" | "reserved" | "sold" | "rented" | "inactive"
      listing_type: "sale" | "rent"
      org_role: "owner" | "admin" | "agent" | "viewer" | "property_owner"
      owner_statement_status: "draft" | "issued"
      payment_schedule_source: "contract" | "deal" | "commission"
      payment_schedule_status:
        | "pending"
        | "invoiced"
        | "paid"
        | "overdue"
        | "cancelled"
      payment_txn_status: "pending" | "succeeded" | "failed" | "refunded"
      permission_level:
        | "company"
        | "branch"
        | "department"
        | "screen"
        | "button"
        | "field"
        | "report"
        | "export"
        | "import"
        | "api"
      property_type:
        | "apartment"
        | "villa"
        | "office"
        | "land"
        | "shop"
        | "warehouse"
        | "building"
        | "farm"
        | "chalet"
        | "other"
      rbac_scope_type: "global" | "company" | "branch" | "department"
      receipt_job_status: "queued" | "processing" | "done" | "failed"
      rent_charge_status: "pending" | "paid" | "failed" | "void"
      report_export_format: "pdf" | "docx" | "xlsx" | "html"
      report_intro_preset: "custom" | "financial" | "operational" | "technical"
      report_run_status: "queued" | "ready" | "failed"
      report_type: "trip" | "project" | "general"
      subscription_payment_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "refunded"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "open" | "in_progress" | "done" | "cancelled"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "cancelled"
      zatca_invoice_type: "standard" | "simplified"
      zatca_status: "draft" | "reported" | "cleared" | "rejected"
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
      app_role: [
        "employee",
        "manager",
        "finance",
        "admin",
        "contractor",
        "super_admin",
      ],
      application_status: ["new", "reviewing", "approved", "rejected"],
      commission_status: ["pending", "invoiced", "paid"],
      contact_type: ["buyer", "seller", "tenant", "landlord", "other"],
      deal_status: [
        "offer",
        "counter",
        "accepted",
        "contract",
        "closed",
        "cancelled",
      ],
      doc_category: ["contract", "invoice", "id", "report", "other"],
      doc_sign_status: ["unsigned", "pending", "signed"],
      doc_status: ["active", "archived"],
      expense_category: [
        "marketing",
        "rent",
        "utilities",
        "salaries",
        "maintenance",
        "commissions",
        "office",
        "travel",
        "software",
        "other",
      ],
      expense_claim_status: [
        "draft",
        "submitted",
        "in_review",
        "rejected",
        "approved",
        "corrected",
      ],
      export_job_status: ["queued", "processing", "completed", "failed"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      lead_stage: [
        "new",
        "contacted",
        "qualified",
        "viewing",
        "negotiation",
        "won",
        "lost",
      ],
      listing_status: ["available", "reserved", "sold", "rented", "inactive"],
      listing_type: ["sale", "rent"],
      org_role: ["owner", "admin", "agent", "viewer", "property_owner"],
      owner_statement_status: ["draft", "issued"],
      payment_schedule_source: ["contract", "deal", "commission"],
      payment_schedule_status: [
        "pending",
        "invoiced",
        "paid",
        "overdue",
        "cancelled",
      ],
      payment_txn_status: ["pending", "succeeded", "failed", "refunded"],
      permission_level: [
        "company",
        "branch",
        "department",
        "screen",
        "button",
        "field",
        "report",
        "export",
        "import",
        "api",
      ],
      property_type: [
        "apartment",
        "villa",
        "office",
        "land",
        "shop",
        "warehouse",
        "building",
        "farm",
        "chalet",
        "other",
      ],
      rbac_scope_type: ["global", "company", "branch", "department"],
      receipt_job_status: ["queued", "processing", "done", "failed"],
      rent_charge_status: ["pending", "paid", "failed", "void"],
      report_export_format: ["pdf", "docx", "xlsx", "html"],
      report_intro_preset: ["custom", "financial", "operational", "technical"],
      report_run_status: ["queued", "ready", "failed"],
      report_type: ["trip", "project", "general"],
      subscription_payment_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "refunded",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["open", "in_progress", "done", "cancelled"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "open",
        "assigned",
        "in_progress",
        "on_hold",
        "completed",
        "cancelled",
      ],
      zatca_invoice_type: ["standard", "simplified"],
      zatca_status: ["draft", "reported", "cleared", "rejected"],
    },
  },
} as const
