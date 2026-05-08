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
          printer_width: number | null;
          printer_font_size: number | null;
          printer_font_weight: number;
          printer_auto_print: boolean;
          banners: Json | null;
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
          printer_width?: number | null;
          printer_font_size?: number | null;
          printer_font_weight?: number;
          printer_auto_print?: boolean;
          banners?: Json | null;
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
          printer_width?: number | null;
          printer_font_size?: number | null;
          printer_font_weight?: number;
          printer_auto_print?: boolean;
          banners?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
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
          addons?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
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
            created_at?: string;
            updated_at?: string;
          };
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
      };
    };
  };
}
