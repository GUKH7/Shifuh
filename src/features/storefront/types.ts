export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_active: boolean;
  addons: any[];
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
  restaurantPhone: string;
  subtotal: number;
  deliveryFee: number;
  deliveryTime: number;
  deliveryDistance: number | null;
  discount: number;
  total: number;
  paymentMethod: string;
  address: CheckoutAddress;
  items: Array<{
    product_name: string;
    quantity: number;
    price: number;
    observation: string | null;
    addons: Array<{ groupId?: string; name: string; price: number }>;
  }>;
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
