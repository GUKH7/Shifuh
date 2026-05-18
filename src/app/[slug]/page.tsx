"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Bike,
  Check,
  ChevronLeft,
  Clock3,
  DollarSign,
  Loader2,
  LogIn,
  MapPin,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Star,
  Ticket,
  User,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { calculateDistance, calculateDeliveryFee, getCoordinates } from "@/lib/geo";
import { useToast } from "@/components/ui/toast-provider";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_active: boolean;
  addons: any[];
}

interface CartItem {
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

interface DeliveryInfo {
  price: number;
  time: number;
  distance: number;
  valid: boolean;
}

interface OrderResponse {
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
  address: {
    cep: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    complement: string;
  };
  items: Array<{
    product_name: string;
    quantity: number;
    price: number;
    observation: string | null;
    addons: Array<{ groupId?: string; name: string; price: number }>;
  }>;
}

interface StorefrontTheme {
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

const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  hero_style: "banner",
  catalog_layout: "grid",
  card_style: "soft",
  contrast_color: "#1f2937",
  show_logo: true,
  show_reviews: true,
  show_banners: true,
  show_featured_badge: true,
  show_promo_badge: true,
  category_style: "underline",
  highlight_badge: "Mais pedido",
  promo_text: "Promo do dia",
};

const EMPTY_ADDRESS = {
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "Sao Paulo",
  state: "SP",
  complement: "",
};

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;

  if (full.length !== 6) return `rgba(17, 24, 39, ${opacity})`;

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export default function StorePage({ params }: { params: { slug: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [usingSavedAddress, setUsingSavedAddress] = useState(false);

  const [restaurant, setRestaurant] = useState<any>(null);
  const [primaryColor, setPrimaryColor] = useState("#ff5a1f");
  const [banners, setBanners] = useState<string[]>([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [storefrontHeadline, setStorefrontHeadline] = useState("");
  const [storefrontSubheadline, setStorefrontSubheadline] = useState("");
  const [storefrontTheme, setStorefrontTheme] = useState<StorefrontTheme>(DEFAULT_STOREFRONT_THEME);

  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveryTiers, setDeliveryTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoCoords, setRestoCoords] = useState<{ lat: number; lon: number } | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [addonSelections, setAddonSelections] = useState<Record<string, any[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [observation, setObservation] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [step, setStep] = useState<"cart" | "address" | "payment" | "success">("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [clientCoords, setClientCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [changeFor, setChangeFor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    value: number;
    type: string;
  } | null>(null);
  const [verifyingCoupon, setVerifyingCoupon] = useState(false);
  const [lastOrderId, setLastOrderId] = useState("");
  const [lastOrderSummary, setLastOrderSummary] = useState<OrderResponse | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchStoreData();
    checkUserSession();

    const timer = setInterval(() => {
      setBanners((prev) => {
        if (prev.length > 1) {
          setCurrentBanner((current) => (current + 1) % prev.length);
        }
        return prev;
      });
    }, 5000);

    const handleScroll = () => {
      const offsets = categories.map((cat) => ({
        id: cat.id,
        offset: document.getElementById(`cat-${cat.id}`)?.offsetTop || 0,
      }));
      const current = offsets.findLast((item) => window.scrollY + 240 >= item.offset);
      if (current) setActiveCategory(current.id);
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUserSession = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setCurrentUser(user);

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (profile) {
      setCustomerName(profile.name || "");
      setCustomerPhone(profile.phone || "");
    }

    const { data: addresses } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id);

    if (addresses && addresses.length > 0) setSavedAddresses(addresses);
  };

  const fetchStoreData = async () => {
    const { data: resto } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", params.slug)
      .single();

    if (!resto) {
      showToast({
        title: "Loja não encontrada",
        description: "Confira o link da vitrine e tente novamente.",
        tone: "error",
      });
      return;
    }

    setRestaurant(resto);
    if (resto.delivery_tiers) setDeliveryTiers(resto.delivery_tiers);
    if (resto.primary_color) setPrimaryColor(resto.primary_color);
    if (resto.banners && resto.banners.length > 0) setBanners(resto.banners);
    setStorefrontHeadline(resto.storefront_headline || "");
    setStorefrontSubheadline(resto.storefront_subheadline || "");
    setStorefrontTheme({
      ...DEFAULT_STOREFRONT_THEME,
      ...(resto.storefront_theme || {}),
    });

    if (resto.latitude && resto.longitude) {
      setRestoCoords({
        lat: Number(resto.latitude),
        lon: Number(resto.longitude),
      });
    } else {
      let restoQuery = `${resto.name}, Brasil`;
      if (resto.address_street && resto.address_number) {
        restoQuery = `${resto.address_street}, ${resto.address_number}, ${resto.address_neighborhood || ""}, ${resto.address_city}, ${resto.address_state}`;
      }

      getCoordinates(restoQuery).then((coords) => {
        if (coords) setRestoCoords(coords);
      });
    }

    const { data: cats } = await supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", resto.id)
      .order("order");

    if (cats) {
      setCategories(cats);
      if (cats.length > 0) setActiveCategory(cats[0].id);
    }

    const { data: prods } = await supabase
      .from("products")
      .select("*")
      .eq("restaurant_id", resto.id)
      .eq("is_active", true);

    if (prods) setProducts(prods);
    setLoading(false);
  };

  const calculateDeliveryForAddress = async (addressData: typeof EMPTY_ADDRESS) => {
    if (!restoCoords) return;
    if (!addressData.street || !addressData.city || !addressData.state) return;

    setCalculatingFee(true);

    try {
      const fullQuery = [
        addressData.cep,
        addressData.street,
        addressData.number,
        addressData.neighborhood,
        addressData.city,
        addressData.state,
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ");

      const clientCoords = await getCoordinates(fullQuery);

      if (clientCoords) {
        setClientCoords(clientCoords);
        const dist = calculateDistance(
          restoCoords.lat,
          restoCoords.lon,
          clientCoords.lat,
          clientCoords.lon,
        );
        const feeData = calculateDeliveryFee(dist, deliveryTiers);
        setDeliveryInfo({
          price: feeData.price,
          time: feeData.time,
          distance: dist,
          valid: feeData.valid,
        });
      } else {
        setClientCoords(null);
        setDeliveryInfo(null);
      }
    } catch (error) {
      console.error(error);
      setClientCoords(null);
      setDeliveryInfo(null);
    } finally {
      setCalculatingFee(false);
    }
  };

  const handleBlurCep = async () => {
    const cepLimpo = address.cep.replace(/\D/g, "");
    if (cepLimpo.length < 8) return;

    setDeliveryInfo(null);

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (!data.erro) {
        const nextAddress = {
          ...address,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        };

        setAddress((prev) => ({
          ...prev,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
        }));

        if (nextAddress.number) {
          await calculateDeliveryForAddress(nextAddress);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setObservation("");
    setAddonSelections({});
  };

  const toggleAddon = (groupId: string, option: any, group: any) => {
    setAddonSelections((prev) => {
      const current = prev[groupId] || [];
      const exists = current.some((item) => item.name === option.name);

      if (exists) {
        return { ...prev, [groupId]: current.filter((item) => item.name !== option.name) };
      }

      if (group.max_options > 0 && current.length >= group.max_options) return prev;

      return { ...prev, [groupId]: [...current, option] };
    });
  };

  const calculateProductTotal = () => {
    if (!selectedProduct) return 0;

    let total = selectedProduct.price;
    Object.values(addonSelections).forEach((options) =>
      options.forEach((option) => {
        total += option.price || 0;
      }),
    );

    return total * quantity;
  };

  const addToCart = () => {
    if (!selectedProduct) return;

    const selectedAddonEntries = Object.entries(addonSelections).flatMap(([groupId, options]) =>
      options.map((option) => ({
        ...option,
        groupId,
      })),
    );

    setCart([
      ...cart,
      {
        internalId: Date.now().toString(),
        product: selectedProduct,
        quantity,
        selectedAddons: selectedAddonEntries,
        totalPrice: calculateProductTotal(),
        observation,
      },
    ]);
    setSelectedProduct(null);
  };

  const removeFromCart = (id: string) => setCart(cart.filter((item) => item.internalId !== id));

  const cartSubtotal = cart.reduce((acc, item) => acc + item.totalPrice, 0);
  const feeValue = deliveryInfo?.valid ? deliveryInfo.price : 0;
  const hasAddressMinimum = Boolean(address.street && address.number && address.neighborhood);

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === "percent") {
      discountAmount = cartSubtotal * (appliedCoupon.value / 100);
    } else {
      discountAmount = appliedCoupon.value;
    }
  }
  if (discountAmount > cartSubtotal) discountAmount = cartSubtotal;

  const finalTotal = cartSubtotal + feeValue - discountAmount;

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const handleApplyCoupon = async () => {
    if (!couponCode) return;

    setVerifyingCoupon(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase().trim())
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .single();

      if (error || !data) {
        showToast({
          title: "Cupom inválido",
          description: "Revise o código informado.",
          tone: "error",
        });
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          value: data.value,
          type: data.discount_type,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setVerifyingCoupon(false);
    }
  };

  const sendToWhatsApp = (summary: OrderResponse) => {
    const orderLabel = summary.displayNumber || summary.orderId.slice(0, 4).toUpperCase();
    const itemsList = summary.items
      .map((item) => {
        const addons = item.addons.map((addon) => `+ ${addon.name}`).join(", ");
        return `- ${item.quantity}x ${item.product_name}${addons ? ` (${addons})` : ""}${
          item.observation ? `\n  Obs: ${item.observation}` : ""
        }`;
      })
      .join("\n");

    const deliveryLine =
      summary.deliveryFee > 0
        ? `${formatMoney(summary.deliveryFee)} (${summary.deliveryTime} min)`
        : summary.deliveryDistance
          ? `Sem taxa (${summary.deliveryTime} min)`
          : "A combinar";

    const msg =
      `NOVO PEDIDO #${orderLabel}\n\n` +
      `Cliente: ${customerName}\n` +
      `Endereço: ${summary.address.street}, ${summary.address.number}` +
      `${summary.address.complement ? `, ${summary.address.complement}` : ""}\n` +
      `${summary.address.neighborhood} - ${summary.address.city}/${summary.address.state}\n\n` +
      `PEDIDO:\n${itemsList}\n\n` +
      `Subtotal: ${formatMoney(summary.subtotal)}\n` +
      `Entrega: ${deliveryLine}\n` +
      `${summary.discount > 0 ? `Desconto: -${formatMoney(summary.discount)}\n` : ""}` +
      `TOTAL: ${formatMoney(summary.total)}\n` +
      `Pagamento: ${summary.paymentMethod}`;

    const phone = summary.restaurantPhone || restaurant.phone || "5511999999999";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handlePlaceOrder = async () => {
    if (!customerName || !customerPhone || !address.street || !address.number) {
      showToast({
        title: "Dados incompletos",
        description: "Preencha nome, WhatsApp e endereço para continuar.",
        tone: "error",
      });
      return;
    }
    if (!hasAddressMinimum) {
      showToast({
        title: "Endereço incompleto",
        description: "Informe rua, número e bairro para seguir.",
        tone: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerName,
          customerPhone,
          address,
          paymentMethod,
          changeFor,
          couponCode: appliedCoupon?.code || null,
          usingSavedAddress,
          clientCoords,
          deliveryPreview: deliveryInfo,
          cart: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            selectedAddons: item.selectedAddons,
            observation: item.observation,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao finalizar pedido.");
      }

      setLastOrderId(result.orderId);
      setLastOrderSummary(result);
      sendToWhatsApp(result);
      setStep("success");
      setCart([]);
      setAppliedCoupon(null);
    } catch (error: any) {
      showToast({
        title: "Não foi possível finalizar o pedido",
        description: error.message || "Tente novamente em instantes.",
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectSavedAddress = async (savedAddr: any) => {
    const nextAddress = {
      cep: savedAddr.cep,
      street: savedAddr.street,
      number: savedAddr.number,
      neighborhood: savedAddr.neighborhood,
      city: savedAddr.city,
      state: savedAddr.state,
      complement: savedAddr.complement || "",
    };

    setAddress(nextAddress);
    setUsingSavedAddress(true);
    await calculateDeliveryForAddress(nextAddress);
  };

  const resetCheckout = () => {
    setStep("cart");
    setIsCartOpen(false);
    setDeliveryInfo(null);
    setClientCoords(null);
    setAppliedCoupon(null);
    setLastOrderSummary(null);
  };

  const contrastColor = storefrontTheme.contrast_color || "#1f2937";
  const pageBackground = hexToRgba(primaryColor || "#ff5a1f", 0.07);
  const heroBackground = `linear-gradient(135deg, ${primaryColor || "#ff5a1f"} 0%, ${contrastColor} 100%)`;
  const heroTitle =
    storefrontHeadline || restaurant?.name || "Sua vitrine digital com pedidos no WhatsApp";
  const heroSubtitle =
    storefrontSubheadline ||
    restaurant?.description ||
    "Monte seu pedido, personalize os itens e finalize direto com a loja.";
  const showHeroHeadline = !storefrontTheme.show_logo;
  const showHeroSupportText = showHeroHeadline || storefrontTheme.hero_style === "spotlight";
  const cardTone =
    storefrontTheme.card_style === "outline"
      ? "border-2 border-[var(--line)] bg-white shadow-none"
      : storefrontTheme.card_style === "elevated"
        ? "border border-white/60 bg-white shadow-[0_24px_48px_rgba(17,16,15,0.12)]"
      : "border border-[var(--line)] bg-white shadow-[0_10px_25px_rgba(17,16,15,0.05)]";
  const catalogGridClass =
    storefrontTheme.catalog_layout === "list"
      ? "grid-cols-1"
      : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  const usesHeroBanner =
    storefrontTheme.show_banners && (banners.length > 0 || Boolean(restaurant?.image_url));
  const heroHeightClass =
    storefrontTheme.hero_style === "spotlight"
      ? "h-[156px] sm:h-[240px]"
      : storefrontTheme.hero_style === "split"
        ? "h-[148px] sm:h-[220px]"
        : "h-[136px] sm:h-[200px]";
  const totalProducts = products.length;
  const featuredProduct = products[0] || null;
  const hasFreeDelivery = deliveryTiers.some((tier: any) => Number(tier.price || 0) === 0);
  const visibleProducts = products.filter((product) => {
    const term = menuSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      product.name.toLowerCase().includes(term) ||
      (product.description || "").toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: pageBackground }}>
        <Loader2 className="animate-spin text-[var(--brand)]" size={28} />
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea] px-6 py-12">
        <div className="surface-card w-full max-w-xl rounded-[32px] p-8 text-center">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Check size={38} />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-gray-950">
            Pedido recebido
          </h1>
          {lastOrderSummary?.displayNumber && (
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-gray-400">
              Pedido #{lastOrderSummary.displayNumber}
            </p>
          )}
          <p className="mt-3 text-base leading-7 text-[var(--muted)]">
            A loja já recebeu seu pedido e você pode confirmar tudo no WhatsApp.
          </p>
          <button
            onClick={() => lastOrderSummary && sendToWhatsApp(lastOrderSummary)}
            className="mt-8 w-full rounded-2xl bg-[#25D366] px-6 py-4 text-base font-bold text-white"
          >
            <span className="inline-flex items-center gap-2">
              <Send size={18} />
              Enviar no WhatsApp
            </span>
          </button>
          <button
            onClick={resetCheckout}
            className="mt-4 w-full rounded-2xl border border-[var(--line)] bg-white px-6 py-4 text-sm font-bold text-gray-700"
          >
            Voltar ao cardápio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 text-gray-950" style={{ backgroundColor: pageBackground }}>
      <section className="bg-white">
        <div className="mx-auto w-full max-w-5xl px-0 pb-3 sm:px-4 sm:pb-5">
          <div className="relative overflow-hidden rounded-b-[18px] sm:rounded-[28px]">
            <div className={`relative bg-gray-200 ${heroHeightClass}`}>
            {usesHeroBanner && banners.length > 0 ? (
              banners.map((banner, index) => (
                <img
                  key={banner}
                  src={banner}
                  alt={`Banner ${index + 1}`}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                    index === currentBanner ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))
            ) : usesHeroBanner && restaurant.image_url ? (
              <img src={restaurant.image_url} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full" style={{ background: heroBackground }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className={`absolute inset-x-0 bottom-0 p-4 sm:p-7 ${
              storefrontTheme.hero_style === "split" ? "text-right" : ""
            }`}>
              {storefrontTheme.show_promo_badge && storefrontTheme.promo_text && (
                <span
                  className="mb-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] sm:mb-4 sm:px-3 sm:text-xs"
                  style={{ backgroundColor: "rgba(255,255,255,0.92)", color: contrastColor }}
                >
                  {storefrontTheme.promo_text}
                </span>
              )}
              {showHeroHeadline && (
                <h2 className={`text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl ${
                  storefrontTheme.hero_style === "split" ? "ml-auto max-w-lg" : "max-w-2xl"
                }`}>
                  {heroTitle}
                </h2>
              )}
              {showHeroSupportText && (
                <p className={`${showHeroHeadline ? "mt-1.5 sm:mt-3" : ""} max-w-xl text-xs leading-5 text-white/85 sm:text-base sm:leading-7 ${
                  storefrontTheme.hero_style === "split" ? "ml-auto max-w-lg" : "max-w-2xl"
                }`}>
                  {heroSubtitle}
                </p>
              )}
            </div>
            </div>
          </div>

          <div className="-mt-1 relative z-10 px-3 sm:mt-0 sm:px-0">
            <div className="flex min-w-0 items-end gap-3 sm:gap-5">
              {storefrontTheme.show_logo && (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-[3px] border-white bg-white shadow-[0_10px_24px_rgba(17,16,15,0.14)] sm:h-20 sm:w-20 sm:rounded-[18px] sm:border-4">
                  {restaurant.logo_url ? (
                    <img src={restaurant.logo_url} alt={restaurant.name} className="h-full w-full object-cover" />
                  ) : restaurant.image_url ? (
                    <img src={restaurant.image_url} alt={restaurant.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black" style={{ color: primaryColor }}>
                      {restaurant.name.charAt(0)}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1 pb-2 pt-6 sm:pt-8">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="truncate pr-2 text-[20px] font-black leading-tight tracking-tight text-gray-950 sm:text-[28px]">
                    {restaurant.name}
                  </h1>
                  <div className="sm:hidden">
                    {currentUser ? (
                      <button
                        onClick={() => router.push("/minha-conta")}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700"
                      >
                        Minha conta
                      </button>
                    ) : (
                      <button
                        onClick={() => router.push(`/auth?returnUrl=${encodeURIComponent(pathname)}`)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-700"
                      >
                        Entrar
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] font-medium text-gray-600 sm:mt-2.5 sm:text-sm">
                  {storefrontTheme.show_reviews && (
                    <span className="inline-flex items-center gap-1">
                      <Star size={13} className="fill-yellow-400 text-yellow-400 sm:h-[15px] sm:w-[15px]" />
                      {restaurant.rating_average ? Number(restaurant.rating_average).toFixed(1) : "Novo"}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} className="sm:h-[15px] sm:w-[15px]" />
                    30-45 min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bike size={13} className="sm:h-[15px] sm:w-[15px]" />
                    {deliveryTiers.length > 0 ? "Entrega por distância" : "Entrega grátis"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Aberto
                  </span>
                  {storefrontTheme.show_featured_badge && storefrontTheme.highlight_badge && (
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]"
                      style={{
                        backgroundColor: hexToRgba(contrastColor, 0.14),
                        color: contrastColor,
                      }}
                    >
                      {storefrontTheme.highlight_badge}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-2.5 py-2 sm:px-6">
          <div className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-[#f7f7f7] px-3 sm:h-10 sm:mb-2.5 sm:gap-2.5 sm:px-3.5">
            <Search size={16} className="text-gray-400" />
            <input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Buscar no cardápio"
              className="w-full bg-transparent text-[12px] font-medium outline-none placeholder:text-gray-400 sm:text-sm"
            />
            {menuSearch && (
              <button onClick={() => setMenuSearch("")} className="text-gray-400">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  document.getElementById(`cat-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`whitespace-nowrap text-[11px] font-bold transition-colors sm:text-sm ${
                  storefrontTheme.category_style === "pill"
                    ? "rounded-full px-2.5 py-1.5 sm:px-3"
                    : "border-b-2 px-1 pb-1"
                } ${
                  activeCategory === category.id
                    ? "text-gray-950"
                    : storefrontTheme.category_style === "pill"
                      ? "bg-transparent text-gray-500"
                      : "border-transparent text-gray-500"
                }`}
                style={
                  activeCategory === category.id
                    ? storefrontTheme.category_style === "pill"
                      ? { backgroundColor: hexToRgba(primaryColor || "#ff5a1f", 0.14), color: primaryColor }
                      : { borderColor: primaryColor, color: primaryColor }
                    : undefined
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-2.5 py-3 sm:px-6 sm:py-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {menuSearch && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700">
                {visibleProducts.length} resultado(s) para "{menuSearch}"
              </div>
            )}

            {categories.map((category) => {
              const categoryProducts = visibleProducts.filter((product) => product.category_id === category.id);
              if (categoryProducts.length === 0) return null;

              return (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-24 overflow-hidden rounded-[18px] border border-gray-200 bg-white sm:rounded-[22px]">
                  <div className="border-b border-gray-100 px-3 py-2.5 sm:px-5 sm:py-3">
                    <h2 className="text-[15px] font-black text-gray-950 sm:text-[17px]">{category.name}</h2>
                    <p className="mt-0.5 text-[10px] font-medium text-gray-500 sm:text-[11px]">{categoryProducts.length} itens</p>
                  </div>

                  <div
                    className={
                      storefrontTheme.catalog_layout === "list"
                        ? "divide-y divide-gray-100"
                        : `divide-y divide-gray-100 sm:grid sm:gap-3 sm:divide-y-0 sm:p-4 ${catalogGridClass}`
                    }
                  >
                    {categoryProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => openProduct(product)}
                        className={`group text-left transition-all hover:-translate-y-0.5 ${
                          storefrontTheme.catalog_layout === "list"
                            ? "flex w-full gap-3 px-3 py-3 hover:bg-[#fafafa] sm:px-5 sm:py-3.5"
                            : `flex w-full gap-3 px-3 py-3 hover:bg-[#fafafa] sm:block sm:rounded-[20px] sm:p-3 ${cardTone}`
                        }`}
                      >
                        <div className={`min-w-0 flex-1 ${storefrontTheme.catalog_layout === "list" ? "flex-1" : "sm:block"}`}>
                          <h3 className="text-[13px] font-bold leading-snug text-gray-950 sm:text-[15px]">{product.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-gray-500 sm:mt-1 sm:text-[13px] sm:leading-5">{product.description}</p>
                          <p className="mt-1.5 text-[13px] font-black text-gray-950 sm:mt-2 sm:text-[14px]">{formatMoney(product.price)}</p>
                        </div>
                        <div className={`relative overflow-hidden rounded-xl bg-gray-100 ${
                          storefrontTheme.catalog_layout === "list"
                            ? "h-[72px] w-[72px] flex-shrink-0 sm:h-24 sm:w-24"
                            : "h-[72px] w-[72px] flex-shrink-0 sm:mt-3 sm:h-32 sm:w-full"
                        }`}>
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-300">
                              <ShoppingBag size={24} />
                            </div>
                          )}
                          <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm sm:bottom-2 sm:right-2 sm:h-6 sm:w-6" style={{ color: primaryColor }}>
                            <Plus size={13} className="sm:h-[15px] sm:w-[15px]" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}

            {visibleProducts.length === 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center">
                <Search className="mx-auto text-gray-300" size={36} />
                <p className="mt-3 font-bold text-gray-900">Nenhum item encontrado</p>
                <p className="mt-1 text-sm text-gray-500">Tente buscar por outro nome ou categoria.</p>
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-lg font-black text-gray-950">Sua sacola</h3>
              {cart.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingBag className="mx-auto text-gray-300" size={36} />
                  <p className="mt-3 text-sm font-medium text-gray-500">Adicione itens para montar seu pedido.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {cart.slice(0, 3).map((item) => (
                    <div key={item.internalId} className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-700">{item.quantity}x {item.product.name}</span>
                      <span className="font-bold text-gray-950">{formatMoney(item.totalPrice)}</span>
                    </div>
                  ))}
                  {cart.length > 3 && <p className="text-xs font-bold text-gray-400">+ {cart.length - 3} item(ns)</p>}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-base font-black">
                      <span>Total</span>
                      <span>{formatMoney(cartSubtotal)}</span>
                    </div>
                    <button
                      onClick={() => {
                        setStep("cart");
                        setIsCartOpen(true);
                      }}
                      className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Ver sacola
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-0 right-0 z-40 px-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => {
                setStep("cart");
                setIsCartOpen(true);
              }}
              className="w-full rounded-[24px] px-5 py-4 text-white shadow-[0_18px_45px_rgba(17,16,15,0.18)]"
              style={{ backgroundColor: primaryColor }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/15 text-sm font-black">
                    {cart.length}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">
                      Sacola
                    </p>
                    <p className="text-base font-black">Ver pedido</p>
                  </div>
                </div>
                <p className="text-lg font-black">{formatMoney(cartSubtotal)}</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-[#fffdfa] sm:h-auto sm:max-h-[88vh] sm:rounded-[32px]">
            <div className="relative h-72 bg-[#efe7de]">
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/92 p-2 text-gray-700 shadow-sm"
              >
                <X size={20} />
              </button>
              {selectedProduct.image_url && (
                <img
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <h2 className="text-3xl font-black tracking-tight text-gray-950">
                {selectedProduct.name}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {selectedProduct.description}
              </p>

              {selectedProduct.addons?.map((group: any) => (
                <div key={group.id} className="mt-8">
                  <div className="mb-3 flex items-center gap-3">
                    <h3 className="text-lg font-black text-gray-950">{group.title}</h3>
                    <span className="rounded-full bg-[#f3ede6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">
                      {group.required ? "Obrigatório" : "Opcional"}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.options.map((option: any, index: number) => (
                      <label
                        key={index}
                        className="flex cursor-pointer items-center justify-between rounded-2xl border bg-white px-4 py-4 transition-colors"
                        style={
                          addonSelections[group.id]?.some(
                            (item) => item.name === option.name,
                          )
                            ? {
                                borderColor: primaryColor,
                                backgroundColor: `${primaryColor}10`,
                              }
                            : { borderColor: "var(--line)" }
                        }
                      >
                        <div>
                          <p className="font-bold text-gray-900">{option.name}</p>
                          {option.price > 0 && (
                            <p className="mt-1 text-sm text-gray-500">
                              + {formatMoney(option.price)}
                            </p>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={addonSelections[group.id]?.some(
                            (item) => item.name === option.name,
                          )}
                          onChange={() => toggleAddon(group.id, option, group)}
                          className="h-5 w-5 accent-[var(--brand)]"
                          style={{ accentColor: primaryColor }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-8">
                <label className="mb-2 block text-sm font-black text-gray-950">
                  Observação
                </label>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  rows={3}
                  placeholder="Ex: sem cebola, bem passado, sem molho..."
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                />
              </div>
            </div>

            <div className="border-t border-[var(--line)] bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] px-4 py-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{ color: primaryColor }}
                  >
                    <Minus size={18} />
                  </button>
                  <span className="text-lg font-black text-gray-950">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} style={{ color: primaryColor }}>
                    <Plus size={18} />
                  </button>
                </div>

                <button
                  onClick={addToCart}
                  className="flex-1 rounded-2xl px-5 py-4 font-black text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>Adicionar</span>
                    <span>{formatMoney(calculateProductTotal())}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-[#f6f1ea]">
          <div className="mx-auto flex h-full max-w-3xl flex-col">
            <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[#faf5ef]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (step === "cart") setIsCartOpen(false);
                    else if (step === "payment") setStep("address");
                    else setStep("cart");
                  }}
                  className="rounded-full bg-white p-2 text-gray-700"
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
                    Checkout
                  </p>
                  <h2 className="text-lg font-black text-gray-950 sm:text-xl">
                    {step === "cart"
                      ? "Sua sacola"
                      : step === "address"
                        ? "Entrega"
                        : "Pagamento"}
                  </h2>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
              {step === "cart" && (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.internalId} className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-gray-400">{item.quantity}x item</p>
                          <p className="mt-1 text-base font-black text-gray-950 sm:text-lg">
                            {item.product.name}
                          </p>
                          {item.selectedAddons.length > 0 && (
                            <p className="mt-2 text-sm text-gray-500">
                              {item.selectedAddons.map((addon) => addon.name).join(", ")}
                            </p>
                          )}
                          {item.observation && (
                            <p className="mt-1 text-sm text-amber-700">
                              Obs: {item.observation}
                            </p>
                          )}
                          <p className="mt-2.5 text-base font-black sm:text-lg" style={{ color: primaryColor }}>
                            {formatMoney(item.totalPrice)}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.internalId)}
                          className="rounded-xl bg-[#faf5ef] p-2 text-gray-400"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold uppercase tracking-[0.14em] text-gray-400">
                        Subtotal
                      </span>
                      <span className="text-2xl font-black text-gray-950">
                        {formatMoney(cartSubtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {step === "address" && (
                <div className="space-y-4">
                  <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                    <h3 className="text-lg font-black text-gray-950">Seus dados</h3>
                    <div className="mt-4 space-y-3">
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Nome completo"
                        className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                      />
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="WhatsApp"
                        className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                      />
                    </div>
                  </div>

                  <div className="surface-card rounded-[24px] p-5">
                    <div className="flex items-center gap-2">
                      <MapPin size={18} style={{ color: primaryColor }} />
                      <h3 className="text-lg font-black text-gray-950">Endereço de entrega</h3>
                    </div>

                    {savedAddresses.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {savedAddresses.map((savedAddr) => {
                          const isSelected =
                            usingSavedAddress && address.street === savedAddr.street;
                          return (
                            <button
                              key={savedAddr.id}
                              onClick={() => selectSavedAddress(savedAddr)}
                              className="flex w-full items-center justify-between rounded-2xl border bg-white px-3 py-3.5 text-left sm:px-4 sm:py-4"
                              style={
                                isSelected
                                  ? {
                                      borderColor: primaryColor,
                                      backgroundColor: `${primaryColor}10`,
                                    }
                                  : { borderColor: "var(--line)" }
                              }
                            >
                              <div>
                                <p className="font-bold text-gray-900">
                                  {savedAddr.street}, {savedAddr.number}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                  {savedAddr.neighborhood} - {savedAddr.city}
                                </p>
                              </div>
                              {isSelected && (
                                <Check size={18} style={{ color: primaryColor }} />
                              )}
                            </button>
                          );
                        })}

                        <button
                          onClick={() => {
                            setUsingSavedAddress(false);
                            setAddress(EMPTY_ADDRESS);
                            setDeliveryInfo(null);
                            setClientCoords(null);
                          }}
                          className="text-sm font-bold"
                          style={{ color: primaryColor }}
                        >
                          Usar outro endereço
                        </button>
                      </div>
                    )}

                    {(!usingSavedAddress || savedAddresses.length === 0) && (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-2.5 sm:grid-cols-[1fr_64px]">
                          <input
                            value={address.cep}
                            onChange={(e) => setAddress({ ...address, cep: e.target.value })}
                            onBlur={handleBlurCep}
                            placeholder="CEP"
                            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                          />
                          <div className="flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white">
                            {calculatingFee ? (
                              <Loader2 className="animate-spin text-[var(--brand)]" size={18} />
                            ) : (
                              <Search className="text-gray-400" size={18} />
                            )}
                          </div>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-[1fr_140px]">
                          <input
                            value={address.street}
                            onChange={(e) => setAddress({ ...address, street: e.target.value })}
                            onBlur={() => calculateDeliveryForAddress(address)}
                            placeholder="Rua"
                            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                          />
                          <input
                            value={address.number}
                            onChange={(e) => setAddress({ ...address, number: e.target.value })}
                            onBlur={() => calculateDeliveryForAddress(address)}
                            placeholder="Número"
                            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                          />
                        </div>

                        <input
                          value={address.neighborhood}
                          onChange={(e) =>
                            setAddress({ ...address, neighborhood: e.target.value })
                          }
                          onBlur={() => calculateDeliveryForAddress(address)}
                          placeholder="Bairro"
                          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                        />

                        <input
                          value={address.complement}
                          onChange={(e) =>
                            setAddress({ ...address, complement: e.target.value })
                          }
                          placeholder="Complemento"
                          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                        />
                      </div>
                    )}

                    {deliveryInfo && deliveryInfo.valid && (
                      <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-black text-emerald-800">Entrega confirmada</p>
                            <p className="mt-1 text-sm text-emerald-700">
                              Distância: {deliveryInfo.distance} km
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-emerald-800">
                              {deliveryInfo.price === 0
                                ? "Grátis"
                                : formatMoney(deliveryInfo.price)}
                            </p>
                            <p className="text-sm text-emerald-700">
                              {deliveryInfo.time} min
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {deliveryInfo && !deliveryInfo.valid && !calculatingFee && (
                      <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
                        <p className="font-black text-red-800">Endereço fora da área de entrega</p>
                        <p className="mt-1 text-sm leading-6 text-red-700">
                          A distância calculada foi de {deliveryInfo.distance} km, acima da última faixa configurada pela loja.
                        </p>
                      </div>
                    )}

                    {hasAddressMinimum && !deliveryInfo && !calculatingFee && (
                      <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
                        <p className="font-black text-amber-800">Entrega sem cálculo automático</p>
                        <p className="mt-1 text-sm leading-6 text-amber-700">
                          Não conseguimos calcular a distância agora. O pedido pode seguir e a loja confirma a taxa no atendimento.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === "payment" && (
                <div className="space-y-4">
                  <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                    <div className="flex items-center gap-2">
                      <Ticket size={18} className="text-[var(--brand)]" />
                      <h3 className="text-lg font-black text-gray-950">Cupom</h3>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Código"
                        disabled={!!appliedCoupon}
                        className="flex-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold uppercase outline-none disabled:bg-[#faf5ef]"
                      />
                      {appliedCoupon ? (
                        <button
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponCode("");
                          }}
                          className="rounded-2xl bg-red-100 px-4 py-3 text-sm font-bold text-red-600"
                        >
                          Remover
                        </button>
                      ) : (
                        <button
                          onClick={handleApplyCoupon}
                          disabled={verifyingCoupon}
                          className="rounded-2xl bg-[#171311] px-4 py-3 text-sm font-bold text-white"
                        >
                          {verifyingCoupon ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            "Aplicar"
                          )}
                        </button>
                      )}
                    </div>

                    {appliedCoupon && (
                      <p className="mt-3 text-sm font-bold text-emerald-600">
                        Cupom aplicado com sucesso.
                      </p>
                    )}
                  </div>

                  <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                    <h3 className="text-lg font-black text-gray-950">Resumo</h3>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatMoney(cartSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Entrega</span>
                        <span>{formatMoney(feeValue)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between font-bold text-emerald-600">
                          <span>Desconto</span>
                          <span>- {formatMoney(discountAmount)}</span>
                        </div>
                      )}
                      <div className="border-t border-[var(--line)] pt-3">
                        <div className="flex justify-between text-xl font-black text-gray-950">
                          <span>Total</span>
                          <span>{formatMoney(finalTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                    <h3 className="text-lg font-black text-gray-950">Pagamento</h3>
                    <div className="mt-4 space-y-3">
                      {[
                        { value: "pix", label: "PIX" },
                        { value: "card", label: "Cartao" },
                        { value: "cash", label: "Dinheiro" },
                      ].map((method) => (
                        <label
                          key={method.value}
                          className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-4"
                          style={
                            paymentMethod === method.value
                              ? {
                                  borderColor: primaryColor,
                                  backgroundColor: `${primaryColor}10`,
                                }
                              : { borderColor: "var(--line)" }
                          }
                        >
                          <input
                            type="radio"
                            checked={paymentMethod === method.value}
                            onChange={() => setPaymentMethod(method.value)}
                            style={{ accentColor: primaryColor }}
                          />
                          <span className="font-bold text-gray-900">{method.label}</span>
                        </label>
                      ))}

                      {paymentMethod === "cash" && (
                        <input
                          value={changeFor}
                          onChange={(e) => setChangeFor(e.target.value)}
                          placeholder="Troco para quanto?"
                          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--line)] bg-white px-3 py-3 sm:px-6 sm:py-4">
              {step === "cart" && (
                <button
                  onClick={() => setStep("address")}
                  className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white sm:py-4 sm:text-base"
                  style={{ backgroundColor: primaryColor }}
                >
                  Continuar
                </button>
              )}

              {step === "address" && (
                <button
                  onClick={() => setStep("payment")}
                  disabled={!hasAddressMinimum || calculatingFee || deliveryInfo?.valid === false}
                  className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 sm:py-4 sm:text-base"
                  style={{ backgroundColor: primaryColor }}
                >
                  {calculatingFee ? "Calculando entrega..." : "Ir para pagamento"}
                </button>
              )}

              {step === "payment" && (
                <button
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-[#25D366] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60 sm:py-4 sm:text-base"
                >
                  {isSubmitting
                    ? "Enviando pedido..."
                    : `Finalizar pedido (${formatMoney(finalTotal)})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
