"use client"

import { useEffect, useMemo, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { User, MapPin, ShoppingBag, LogOut, Loader2, Star, Home, ArrowLeft, Gift, ChevronRight, Sparkles } from "lucide-react"
import ReviewModal from "@/components/review-modal"
import { OrderStatusBadge } from "@/components/ui/order-status-badge"

type LoyaltySummary = {
  id: string
  name: string
  account: { balance: number }
  restaurant: { name: string } | null
}

export default function MyAccountPage() {
  const router = useRouter()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabase = supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : null

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses'>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [loyaltyPrograms, setLoyaltyPrograms] = useState<LoyaltySummary[]>([])
  const [loyaltyIdentityReady, setLoyaltyIdentityReady] = useState(true)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    checkSession()
  }, [])

  const checkSession = async () => {
    if (!supabase) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return router.push(`/auth?returnUrl=/minha-conta`)
    }
    setUser(user)
    fetchUserData(user.id)
  }

  const fetchUserData = async (userId: string) => {
    if (!supabase) return
    try {
      const [{ data: myOrders }, { data: myAddresses }, loyaltyResponse] = await Promise.all([
        supabase
          .from('orders')
          .select(`
              *,
              restaurants (id, name, image_url, primary_color, slug),
              order_items (*),
              reviews (id, rating)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_addresses')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        fetch('/api/customer/loyalty', { credentials: 'same-origin', cache: 'no-store' }),
      ])

      if (myOrders) setOrders(myOrders)
      if (myAddresses) setAddresses(myAddresses)

      if (loyaltyResponse.ok) {
        const payload = await loyaltyResponse.json().catch(() => ({}))
        setLoyaltyPrograms(Array.isArray(payload.programs) ? payload.programs : [])
        setLoyaltyIdentityReady(true)
      } else if (loyaltyResponse.status === 401) {
        setLoyaltyPrograms([])
        setLoyaltyIdentityReady(false)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const totalLoyaltyPoints = useMemo(
    () => loyaltyPrograms.reduce((sum, program) => sum + Number(program.account?.balance || 0), 0),
    [loyaltyPrograms],
  )

  const handleOpenReview = (order: any) => {
    setSelectedOrder(order)
    setReviewModalOpen(true)
  }

  const handleLogout = async () => {
    try {
      if (supabase) await supabase.auth.signOut()
      handleBackToMenu()
    } catch (error) {
      console.error("Erro ao sair:", error)
    }
  }

  const handleBackToMenu = () => {
    if (typeof window === 'undefined') return

    const currentPath = window.location.pathname
    const parts = currentPath.split('/').filter(p => p && p !== 'minha-conta')
    if (parts.length > 0) {
      router.push(`/${parts[0]}`)
      return
    }

    if (orders.length > 0 && orders[0].restaurants?.slug) {
      router.push(`/${orders[0].restaurants.slug}`)
      return
    }

    router.push('/')
  }

  const formatPrice = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR')

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-orange-500" /></div>

  return (
    <div className="min-h-screen bg-[#f6f6f5] pb-20 font-sans">
      <div className="border-b border-gray-200 bg-white p-6 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-orange-50 p-3 text-orange-600"><User size={24} /></div>
            <div><h1 className="text-xl font-black text-gray-900">Minha Conta</h1><p className="text-sm text-gray-500">{user?.email}</p></div>
          </div>
          <button onClick={handleLogout} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-bold text-red-600 hover:bg-red-50"><LogOut size={16} /> Sair</button>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl p-4">
        <div className="mb-4">
          <button
            onClick={handleBackToMenu}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-orange-600"
          >
            <ArrowLeft size={18} /> Voltar para o Cardápio
          </button>
        </div>

        <button
          type="button"
          onClick={() => router.push('/minha-conta/fidelidade')}
          className="mb-4 w-full overflow-hidden rounded-3xl bg-gray-950 p-6 text-left text-white shadow-[0_18px_55px_rgba(17,24,39,0.16)] transition hover:-translate-y-0.5 sm:p-7"
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-orange-400"><Sparkles size={18} /><span className="text-xs font-black uppercase tracking-[0.14em]">Programa de fidelidade</span></div>
              {loyaltyIdentityReady ? (
                <>
                  <div className="mt-4 flex items-end gap-2"><strong className="text-4xl font-black tracking-tight">{totalLoyaltyPoints}</strong><span className="pb-1 text-sm font-bold text-white/50">pontos</span></div>
                  <p className="mt-2 text-sm text-white/55">{loyaltyPrograms.length > 0 ? `${loyaltyPrograms.length} ${loyaltyPrograms.length === 1 ? 'programa ativo' : 'programas ativos'} · veja recompensas e seu histórico` : 'Veja seus programas e recompensas disponíveis'}</p>
                </>
              ) : (
                <>
                  <h2 className="mt-4 text-xl font-black">Confirme seu telefone para acessar seus pontos</h2>
                  <p className="mt-2 text-sm text-white/55">Seu saldo real fica protegido pela identidade vinculada à conta.</p>
                </>
              )}
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-orange-400"><Star size={24} /></span>
          </div>
          <div className="mt-5 flex items-center gap-1 text-sm font-black text-orange-400">Abrir fidelidade <ChevronRight size={17} /></div>
        </button>

        <button
          type="button"
          onClick={() => router.push('/minha-conta/premios')}
          className="mb-8 flex min-h-14 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 text-left shadow-[0_6px_22px_rgba(17,24,39,0.04)] transition hover:border-orange-200"
        >
          <span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Gift size={20} /></span><span><strong className="block text-sm font-black text-gray-900">Meus prêmios</strong><span className="text-xs text-gray-500">Benefícios da Fidelidade e da Roleta</span></span></span>
          <ChevronRight size={18} className="text-gray-400" />
        </button>

        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button aria-pressed={activeTab === 'orders'} onClick={() => setActiveTab('orders')} className={`relative min-h-11 px-4 pb-3 text-sm font-bold transition-colors ${activeTab === 'orders' ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><ShoppingBag size={18} /> Meus Pedidos</div>{activeTab === 'orders' && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-orange-500" />}</button>
          <button aria-pressed={activeTab === 'addresses'} onClick={() => setActiveTab('addresses')} className={`relative min-h-11 px-4 pb-3 text-sm font-bold transition-colors ${activeTab === 'addresses' ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><MapPin size={18} /> Endereços</div>{activeTab === 'addresses' && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-orange-500" />}</button>
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-gray-500">Nenhum pedido ainda.</p>}
            {orders.map(order => {
              const hasReview = order.reviews && order.reviews.length > 0
              const canReview = order.status === 'done' && !hasReview
              return (
                <div key={order.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex gap-3">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        {order.restaurants?.image_url ? <img src={order.restaurants.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-gray-400"><Home size={16} /></div>}
                      </div>
                      <div><h3 className="font-bold text-gray-800">{order.restaurants?.name || "Loja"}</h3><p className="text-xs text-gray-500">Pedido #{order.id.slice(0, 4)} • {formatDate(order.created_at)}</p></div>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="mb-4 space-y-1 border-l-2 border-gray-100 pl-3">
                    {order.order_items?.map((item: any, i: number) => <p key={i} className="text-sm text-gray-600"><span className="font-bold text-gray-900">{item.quantity}x</span> {item.product_name}</p>)}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <p className="text-sm text-gray-500">Total: <span className="text-base font-bold text-gray-900">{formatPrice(order.total)}</span></p>
                    {canReview && (
                      <button onClick={() => handleOpenReview(order)} className="flex min-h-11 items-center gap-1 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-700 transition-colors hover:bg-yellow-100"><Star size={14} fill="#A16207" /> Avaliar</button>
                    )}
                    {hasReview && <div className="flex items-center gap-1 rounded bg-yellow-50 px-2 py-1 text-xs font-bold text-yellow-600"><Star size={12} fill="#CA8A04" /> {order.reviews[0].rating}.0</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'addresses' && (
          <div className="space-y-3">
            {addresses.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-gray-500">Nenhum endereço salvo.</p>}
            {addresses.map(addr => (
              <div key={addr.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-4"><div className="rounded-full bg-gray-100 p-2 text-gray-500"><MapPin size={20} /></div><div><p className="font-bold text-gray-800">{addr.street}, {addr.number}</p><p className="text-sm text-gray-500">{addr.neighborhood} - {addr.city}/{addr.state}</p></div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedOrder && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          orderId={selectedOrder.id}
          restaurantId={selectedOrder.restaurants?.id}
          primaryColor={selectedOrder.restaurants?.primary_color}
          onReviewSubmitted={() => fetchUserData(user.id)}
        />
      )}
    </div>
  )
}
