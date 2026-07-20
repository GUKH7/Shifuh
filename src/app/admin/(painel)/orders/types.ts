export type JsonObject = Record<string, unknown>;

export type OrderAddress = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  complement?: string | null;
};

export type OrderAddon = {
  name?: string | null;
  title?: string | null;
  description?: string | null;
};

export type OrderItem = {
  product_name?: string | null;
  name?: string | null;
  quantity?: number | null;
  price?: number | null;
  addons?: OrderAddon[] | null;
  observation?: string | null;
};

export type IfoodOrderMeta = JsonObject & {
  orderType?: string;
  orderTiming?: string;
  customerDocument?: string;
  observations?: string;
  schedule?: {
    deliveryDateTimeStart?: string | null;
    deliveryDateTimeEnd?: string | null;
  };
  payment?: {
    methodType?: string | null;
    methodName?: string | null;
    cardBrand?: string | null;
    changeFor?: number | string | null;
  };
  benefits?: {
    items?: IfoodBenefit[];
  };
  cancellation?: {
    status?: string | null;
    reason?: string | null;
    eventCreatedAt?: string | null;
  };
};

export type IfoodBenefit = JsonObject & {
  target?: string;
  description?: string;
  value?: number | string;
  amount?: number | string;
  code?: string;
  sponsorshipValues?: Array<{ name?: string; value?: number | string }>;
  campaign?: { name?: string };
};

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
  external_payload?: {
    gestorDelivery?: IfoodOrderMeta;
  } | null;
  is_test?: boolean;
  scheduled_for?: string | null;
  created_at: string;
  address: OrderAddress | null;
  items: OrderItem[];
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
  raw_payload: JsonObject | null;
  created_at: string;
};
