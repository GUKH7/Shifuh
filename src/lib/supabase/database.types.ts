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
    };
  };
}
