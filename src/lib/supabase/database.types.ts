export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          slug: string;
          whatsapp_number: string;
          phone: string | null;
          logo_url: string | null;
          image_url: string | null;
          color_theme: string;
          primary_color: string | null;
          latitude: number | null;
          longitude: number | null;
          storefront_headline: string | null;
          storefront_subheadline: string | null;
          storefront_theme: Json | null;
          address_zip: string | null;
          address_street: string | null;
          address_number: string | null;
          address_neighborhood: string | null;
          address_city: string | null;
          address_state: string | null;
          delivery_tiers: Json | null;
          work_hours: Json | null;
          minimum_order_amount: number;
          scheduled_orders_enabled: boolean;
          scheduled_order_lead_minutes: number;
          printer_width: number | null;
          printer_font_size: number | null;
          printer_font_weight: number;
          printer_auto_print: boolean;
          banners: Json | null;
          rating_average: number | null;
          rating_count: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          whatsapp_number?: string;
          phone?: string | null;
          logo_url?: string | null;
          image_url?: string | null;
          color_theme?: string;
          primary_color?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          storefront_headline?: string | null;
          storefront_subheadline?: string | null;
          storefront_theme?: Json | null;
          address_zip?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_neighborhood?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          delivery_tiers?: Json | null;
          work_hours?: Json | null;
          minimum_order_amount?: number;
          scheduled_orders_enabled?: boolean;
          scheduled_order_lead_minutes?: number;
          printer_width?: number | null;
          printer_font_size?: number | null;
          printer_font_weight?: number;
          printer_auto_print?: boolean;
          banners?: Json | null;
          rating_average?: number | null;
          rating_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          slug?: string;
          whatsapp_number?: string;
          phone?: string | null;
          logo_url?: string | null;
          image_url?: string | null;
          color_theme?: string;
          primary_color?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          storefront_headline?: string | null;
          storefront_subheadline?: string | null;
          storefront_theme?: Json | null;
          address_zip?: string | null;
          address_street?: string | null;
          address_number?: string | null;
          address_neighborhood?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          delivery_tiers?: Json | null;
          work_hours?: Json | null;
          minimum_order_amount?: number;
          scheduled_orders_enabled?: boolean;
          scheduled_order_lead_minutes?: number;
          printer_width?: number | null;
          printer_font_size?: number | null;
          printer_font_weight?: number;
          printer_auto_print?: boolean;
          banners?: Json | null;
          rating_average?: number | null;
          rating_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          name?: string;
          order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          restaurant_id: string;
          category_id: string;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          is_active: boolean;
          is_promotional: boolean;
          is_vegetarian: boolean;
          addons: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id: string;
          name: string;
          description?: string | null;
          price: number;
          image_url?: string | null;
          is_active?: boolean;
          is_promotional?: boolean;
          is_vegetarian?: boolean;
          addons?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          category_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          is_active?: boolean;
          is_promotional?: boolean;
          is_vegetarian?: boolean;
          addons?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
        orders: {
          Row: {
            id: string;
            restaurant_id: string;
            user_id: string | null;
            customer_name: string;
            customer_phone: string;
            address: Json | null;
            subtotal: number;
            delivery_fee: number;
            discount: number;
            total: number;
            status: string;
            payment_method: string;
            change_for: string | null;
            coupon_code: string | null;
            display_number: number | null;
            external_source: string | null;
            external_order_id: string | null;
            external_display_id: string | null;
            is_test: boolean;
            external_payload: Json | null;
            scheduled_for: string | null;
            idempotency_key: string | null;
            cancellation_reason: string | null;
            created_at: string;
            updated_at: string;
          };
          Insert: {
            id?: string;
          restaurant_id: string;
          user_id?: string | null;
          customer_name: string;
          customer_phone: string;
          address?: Json | null;
          subtotal?: number;
          delivery_fee?: number;
          discount?: number;
          total: number;
          status?: string;
            payment_method?: string;
            change_for?: string | null;
            coupon_code?: string | null;
            display_number?: number | null;
            external_source?: string | null;
            external_order_id?: string | null;
            external_display_id?: string | null;
            is_test?: boolean;
            external_payload?: Json | null;
            scheduled_for?: string | null;
            idempotency_key?: string | null;
            cancellation_reason?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Update: {
            id?: string;
          restaurant_id?: string;
          user_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          address?: Json | null;
          subtotal?: number;
          delivery_fee?: number;
          discount?: number;
          total?: number;
          status?: string;
            payment_method?: string;
            change_for?: string | null;
            coupon_code?: string | null;
            display_number?: number | null;
            external_source?: string | null;
            external_order_id?: string | null;
            external_display_id?: string | null;
            is_test?: boolean;
            external_payload?: Json | null;
            scheduled_for?: string | null;
            idempotency_key?: string | null;
            cancellation_reason?: string | null;
            created_at?: string;
            updated_at?: string;
          };
          Relationships: [];
        };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_name: string;
          quantity: number;
          price: number;
          observation: string | null;
          addons: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_name: string;
          quantity: number;
          price: number;
          observation?: string | null;
          addons?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_name?: string;
          quantity?: number;
          price?: number;
          observation?: string | null;
          addons?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          status: string;
          changed_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status: string;
          changed_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          status?: string;
          changed_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          restaurant_id: string;
          phone: string;
          name: string | null;
          address_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          phone: string;
          name?: string | null;
          address_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          phone?: string;
          name?: string | null;
          address_json?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ifood_integrations: {
        Row: {
          id: string;
          restaurant_id: string;
          merchant_id: string | null;
          merchant_name: string | null;
          catalog_id: string | null;
          status: string;
          auth_type: string;
          sync_mode: string;
          catalog_sync_enabled: boolean;
          order_sync_enabled: boolean;
          import_images: boolean;
          notes: string | null;
          connected_at: string | null;
          last_catalog_import_at: string | null;
          last_catalog_export_at: string | null;
          last_order_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          merchant_id?: string | null;
          merchant_name?: string | null;
          catalog_id?: string | null;
          status?: string;
          auth_type?: string;
          sync_mode?: string;
          catalog_sync_enabled?: boolean;
          order_sync_enabled?: boolean;
          import_images?: boolean;
          notes?: string | null;
          connected_at?: string | null;
          last_catalog_import_at?: string | null;
          last_catalog_export_at?: string | null;
          last_order_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          merchant_id?: string | null;
          merchant_name?: string | null;
          catalog_id?: string | null;
          status?: string;
          auth_type?: string;
          sync_mode?: string;
          catalog_sync_enabled?: boolean;
          order_sync_enabled?: boolean;
          import_images?: boolean;
          notes?: string | null;
          connected_at?: string | null;
          last_catalog_import_at?: string | null;
          last_catalog_export_at?: string | null;
          last_order_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ifood_category_links: {
        Row: {
          id: string;
          restaurant_id: string;
          category_id: string;
          ifood_category_id: string;
          ifood_catalog_id: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id: string;
          ifood_category_id: string;
          ifood_catalog_id?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          category_id?: string;
          ifood_category_id?: string;
          ifood_catalog_id?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ifood_product_links: {
        Row: {
          id: string;
          restaurant_id: string;
          product_id: string;
          ifood_item_id: string;
          ifood_category_id: string | null;
          ifood_catalog_id: string | null;
          source: string;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          product_id: string;
          ifood_item_id: string;
          ifood_category_id?: string | null;
          ifood_catalog_id?: string | null;
          source?: string;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          product_id?: string;
          ifood_item_id?: string;
          ifood_category_id?: string | null;
          ifood_catalog_id?: string | null;
          source?: string;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ifood_order_events: {
        Row: {
          id: string;
          restaurant_id: string;
          local_order_id: string | null;
          ifood_event_id: string;
          ifood_order_id: string;
          merchant_id: string;
          event_code: string;
          event_full_code: string | null;
          event_group: string | null;
          event_created_at: string | null;
          acknowledged_at: string | null;
          processed_at: string | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          local_order_id?: string | null;
          ifood_event_id: string;
          ifood_order_id: string;
          merchant_id: string;
          event_code: string;
          event_full_code?: string | null;
          event_group?: string | null;
          event_created_at?: string | null;
          acknowledged_at?: string | null;
          processed_at?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          local_order_id?: string | null;
          ifood_event_id?: string;
          ifood_order_id?: string;
          merchant_id?: string;
          event_code?: string;
          event_full_code?: string | null;
          event_group?: string | null;
          event_created_at?: string | null;
          acknowledged_at?: string | null;
          processed_at?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ifood_sync_runs: {
        Row: {
          id: string;
          restaurant_id: string;
          sync_type: string;
          status: string;
          events_received: number;
          events_processed: number;
          events_acknowledged: number;
          summary: string | null;
          payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          sync_type: string;
          status?: string;
          events_received?: number;
          events_processed?: number;
          events_acknowledged?: number;
          summary?: string | null;
          payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          restaurant_id?: string;
          sync_type?: string;
          status?: string;
          events_received?: number;
          events_processed?: number;
          events_acknowledged?: number;
          summary?: string | null;
          payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_display_counters: {
        Row: {
          restaurant_id: string;
          next_value: number;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          next_value?: number;
          updated_at?: string;
        };
        Update: {
          restaurant_id?: string;
          next_value?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_restaurants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          phone: string | null;
          logo_url: string | null;
          image_url: string | null;
          color_theme: string | null;
          primary_color: string | null;
          latitude: number | null;
          longitude: number | null;
          storefront_headline: string | null;
          storefront_subheadline: string | null;
          storefront_theme: Json | null;
          address_street: string | null;
          address_number: string | null;
          address_neighborhood: string | null;
          address_city: string | null;
          address_state: string | null;
          delivery_tiers: Json | null;
          work_hours: Json | null;
          banners: Json | null;
          rating_average: number | null;
          rating_count: number | null;
          minimum_order_amount: number;
          scheduled_orders_enabled: boolean;
          scheduled_order_lead_minutes: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_storefront_order_transaction: {
        Args: {
          p_restaurant_id: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_address: Json;
          p_items: Json;
          p_subtotal: number;
          p_delivery_fee: number;
          p_discount: number;
          p_total: number;
          p_payment_method: string;
          p_change_for: string | null;
          p_coupon_code: string | null;
          p_user_id: string | null;
          p_scheduled_for: string | null;
          p_save_customer: boolean;
          p_idempotency_key: string;
        };
        Returns: Array<{
          order_id: string;
          display_number: number;
        }>;
      };
      create_order_transaction: {
        Args: {
          p_restaurant_id: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_address: Json;
          p_items: Json;
          p_subtotal: number;
          p_delivery_fee: number;
          p_discount: number;
          p_total: number;
          p_payment_method?: string;
          p_change_for?: string | null;
          p_coupon_code?: string | null;
          p_user_id?: string | null;
          p_status?: string;
          p_external_source?: string | null;
          p_external_order_id?: string | null;
          p_external_display_id?: string | null;
          p_is_test?: boolean;
          p_external_payload?: Json | null;
          p_save_customer?: boolean;
        };
        Returns: Array<{
          order_id: string;
          display_number: number;
        }>;
      };
      next_order_display_number: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: number;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
