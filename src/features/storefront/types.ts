export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_active: boolean;
  addons: any[];
  is_promotional?: boolean;
  is_vegetarian?: boolean;
  is_best_seller?: boolean;
  sold_quantity?: number;
}

export interface CartItem {
  internalId: string;
  product: Product;
  quantity: number;
  selectedAddons: Array<{
    groupId?: string;
    name: string;
    price?: number;
  }>;
  totalPrice: number;
  observation: string;
}

export interface DeliveryInfo {
  price: number;
  time: number;
  distance: number;
  valid: boolean;
  addressValidated: boolean;
}

export interface CheckoutAddress {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
}

export interface OrderResponse {
  orderId: string;
  displayNumber?: string;
  trackingPath: string;
  trackingUrl: string;
  restaurantPhone: string;
  subtotal: number;
  deliveryFee: number;
  deliveryTime: number;
  deliveryDistance: number | null;
  discount: number;
  total: number;
  paymentMethod: string;
  changeFor?: string | null;
  scheduledFor?: string | null;
  fulfillmentType: FulfillmentType;
  address: CheckoutAddress;
  items: Array<{
    product_name: string;
    quantity: number;
    price: number;
    observation: string | null;
    addons: Array<{ groupId?: string; name: string; price: number }>;
  }>;
}

export type PublicOrderStatus = "pending" | "preparing" | "delivering" | "done" | "canceled";

export interface OrderTrackingResponse {
  orderId: string;
  displayNumber: string;
  status: PublicOrderStatus;
  createdAt: string;
  updatedAt: string;
  statusHistory: Array<{
    status: PublicOrderStatus;
    changedAt: string;
  }>;
  cancellationReason: string | null;
  scheduledFor: string | null;
  deliveryTime: number;
  customerName: string;
  address: CheckoutAddress;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: string;
  changeFor: string | null;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
    observation: string | null;
    addons: Array<{ name: string; price?: number }>;
  }>;
  restaurant: {
    name: string;
    slug: string;
    phone: string;
    primaryColor: string;
  };
}

export interface StorefrontTheme {
  hero_style: "banner" | "split" | "spotlight";
  catalog_layout: "grid" | "list";
  card_style: "soft" | "outline" | "elevated";
  contrast_color: string;
  show_logo: boolean;
  show_reviews: boolean;
  show_banners: boolean;
  show_featured_badge: boolean;
  show_promo_badge: boolean;
  category_style: "underline" | "pill";
  highlight_badge: string;
  promo_text: string;
}

export type CheckoutStep = "cart" | "address" | "payment" | "success";
export type FulfillmentType = "delivery" | "pickup";
