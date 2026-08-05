"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { calculateDistance, calculateDeliveryFee } from "@/lib/distance"

interface CartItem {
  id: string
  product_id: string
  name: string
  price: number
  quantity: number
  image_url?: string
  observation?: string
}

interface RestaurantData {
  id: string
  name: string
  address_lat: number
  address_lng: number
  delivery_tiers: any[]
}

interface CartContextType {
  items: CartItem[]
  addToCart: (product: any, quantity: number, observation?: string) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  total: number
  deliveryFee: number
  deliveryTime: number
  distance: number
  userLocation: { lat: number; lng: number } | null
  setUserLocation: (loc: { lat: number; lng: number } | null) => void
  restaurant: RestaurantData | null
}

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>

const CartContext = createContext<CartContextType>({} as CartContextType)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null)
  const [supabase, setSupabase] = useState<BrowserSupabaseClient | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryTime, setDeliveryTime] = useState(0)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) return
    setSupabase(createBrowserClient(supabaseUrl, supabaseAnonKey))
  }, [])

  useEffect(() => {
    if (!supabase) return
    const client = supabase

    async function loadRestaurant() {
      const publicRestaurantResult = await client
        .from("public_restaurants")
        .select("id, name, latitude, longitude, delivery_tiers")
        .limit(1)
        .maybeSingle()
      let data = publicRestaurantResult.data

      if (!data && publicRestaurantResult.error) {
        const { data: fallbackRestaurant } = await client
          .from("restaurants")
          .select("id, name, latitude, longitude, delivery_tiers")
          .limit(1)
          .maybeSingle()

        data = fallbackRestaurant
      }

      if (data) {
        setRestaurant({
          id: data.id,
          name: data.name,
          address_lat: Number(data.latitude || 0),
          address_lng: Number(data.longitude || 0),
          delivery_tiers: Array.isArray(data.delivery_tiers) ? data.delivery_tiers : [],
        })
      }
    }

    void loadRestaurant()
  }, [supabase])

  useEffect(() => {
    if (userLocation && restaurant) {
      const lat1 = Number(userLocation.lat)
      const lng1 = Number(userLocation.lng)
      const lat2 = Number(restaurant.address_lat)
      const lng2 = Number(restaurant.address_lng)

      const dist = calculateDistance(lat1, lng1, lat2, lng2)
      setDistance(dist)

      const { price, time } = calculateDeliveryFee(dist, restaurant.delivery_tiers)
      setDeliveryFee(price)
      setDeliveryTime(time)
    }
  }, [userLocation, restaurant])

  const addToCart = (product: any, quantity: number, observation?: string) => {
    setItems((previous) => {
      const existingIndex = previous.findIndex(
        (item) => item.product_id === product.id && item.observation === observation,
      )

      if (existingIndex > -1) {
        const nextItems = [...previous]
        nextItems[existingIndex].quantity += quantity
        return nextItems
      }

      return [...previous, {
        id: crypto.randomUUID(),
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        image_url: product.image_url,
        observation,
      }]
    })
  }

  const removeFromCart = (id: string) => {
    setItems((previous) => previous.filter((item) => item.product_id !== id))
  }

  const clearCart = () => setItems([])
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      clearCart,
      total,
      deliveryFee,
      deliveryTime,
      distance,
      userLocation,
      setUserLocation,
      restaurant,
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
