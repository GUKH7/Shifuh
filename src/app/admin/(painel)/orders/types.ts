export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  status: "pending" | "preparing" | "delivering" | "done" | "canceled";
  payment_method: string;
  display_number?: number | null;
  external_source?: string | null;
  external_order_id?: string | null;
  external_display_id?: string | null;
  external_payload?: any;
  is_test?: boolean;
  created_at: string;
  address: any;
  items: any[];
  change_for?: string;
}

export type IfoodCancellationReason = {
  code: string;
  description: string;
};

export type IfoodEventAudit = {
  id: string;
  ifood_event_id: string;
  ifood_order_id: string;
  event_code: string;
  event_full_code: string | null;
  event_group: string | null;
  event_created_at: string | null;
  processed_at: string | null;
  acknowledged_at: string | null;
  raw_payload: any;
  created_at: string;
};
