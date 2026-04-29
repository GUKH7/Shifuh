"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { User, MapPin, ShoppingBag, LogOut, Loader2, Star, Home, ArrowLeft } from "lucide-react"
import ReviewModal from "@/components/review-modal"

export default function MyAccountPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses'>('orders')
  
  const [orders, setOrders] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  useEffect(() => { 
      checkSession() 
  }, [])

  const checkSession = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
        const slug = currentPath.split('/')[1]
        const loginUrl = slug && slug !== 'minha-conta' && slug !== 'auth' 
            ? `/auth?returnUrl=/${slug}/minha-conta`
            : `/auth?returnUrl=/minha-conta`
            
        return router.push(loginUrl)
    }
    setUser(user)
    fetchUserData(user.id)
  }

  const fetchUserData = async (userId: string) => {
    try {
        const { data: myOrders } = await supabase
            .from('orders')
            .select(`
                *, 
                restaurants (id, name, image_url, primary_color, slug), 
                order_items (*),
                reviews (id, rating) 
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        
        if (myOrders) setOrders(myOrders)

        const { data: myAddresses } = await supabase.from('customer_addresses').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        if (myAddresses) setAddresses(myAddresses)
    } catch (error) { console.error(error) } finally { setLoading(false) }
  }

  const handleOpenReview = (order: any) => {
      setSelectedOrder(order)
      setReviewModalOpen(true)
  }

  const handleLogout = async () => { 
    try {
      await supabase.auth.signOut(); 
      handleBackToMenu(); 
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  }

  // --- BOTÃO VOLTAR (MODO DETETIVE 🕵️‍♂️) ---
  const handleBackToMenu = () => {
    if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const parts = currentPath.split('/').filter(p => p && p !== 'minha-conta');
        
        // 1. Tenta pela URL
        if (parts.length > 0) {
             console.log("📍 [Voltar] Achou loja na URL:", parts[0]);
             router.push(`/${parts[0]}`);
             return;
        }

        // 2. Tenta pelo último pedido
        if (orders.length > 0) {
             const restaurante = orders[0].restaurants;
             console.log("🕵️‍♂️ [Voltar] Dados do restaurante no último pedido:", restaurante);

             if (restaurante && restaurante.slug) {
                 console.log("📍 [Voltar] Achou slug no banco:", restaurante.slug);
                 router.push(`/${restaurante.slug}`);
                 return;
             } else {
                 console.warn("⚠️ [Voltar] O campo 'slug' está vazio ou nulo no banco para este restaurante!");
             }
        } else {
            console.warn("⚠️ [Voltar] Nenhum pedido encontrado para buscar o link.");
        }

        // 3. Fallback
        console.log("🏠 [Voltar] Indo para Home (Plano C)");
        router.push('/');
    }
  }

  const formatPrice = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR')

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
        
        {/* Header */}
        <div className="bg-white p-6 shadow-sm border-b border-gray-200">
            <div className="max-w-3xl mx-auto flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-full text-red-600"><User size={24} /></div>
                    <div><h1 className="text-xl font-bold text-gray-900">Minha Conta</h1><p className="text-sm text-gray-500">{user?.email}</p></div>
                </div>
                <button onClick={handleLogout} className="text-red-600 font-bold text-sm hover:underline flex items-center gap-1"><LogOut size={16}/> Sair</button>
            </div>
        </div>

        <div className="max-w-3xl mx-auto p-4 mt-6">
            
            {/* --- BOTÃO DE VOLTAR --- */}
            <div className="mb-4">
                <button 
                    onClick={handleBackToMenu}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors font-medium bg-transparent border-0 cursor-pointer"
                >
                    <ArrowLeft size={18} />
                    Voltar para o Cardápio
                </button>
            </div>

            {/* Banner Pontos */}
            <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-2xl p-6 text-white shadow-lg mb-8 flex justify-between items-center">
                <div><p className="text-red-100 text-sm font-medium mb-1">Meus Pontos Fidelidade</p><p className="text-3xl font-extrabold">{orders.length * 10} <span className="text-lg font-normal opacity-80">pts</span></p></div>
                <div className="bg-white/20 p-3 rounded-full"><Star size={32} className="text-yellow-400 fill-yellow-400"/></div>
            </div>

            {/* Abas */}
            <div className="flex gap-4 border-b border-gray-200 mb-6">
                <button onClick={() => setActiveTab('orders')} className={`pb-3 px-4 font-bold text-sm transition-colors relative ${activeTab === 'orders' ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><ShoppingBag size={18}/> Meus Pedidos</div>{activeTab === 'orders' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600"></div>}</button>
                <button onClick={() => setActiveTab('addresses')} className={`pb-3 px-4 font-bold text-sm transition-colors relative ${activeTab === 'addresses' ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'}`}><div className="flex items-center gap-2"><MapPin size={18}/> Endereços</div>{activeTab === 'addresses' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600"></div>}</button>
            </div>

            {/* Pedidos */}
            {activeTab === 'orders' && (
                <div className="space-y-4">
                    {orders.length === 0 && <p className="text-center text-gray-500 py-10 bg-white rounded-xl border border-dashed border-gray-300">Nenhum pedido ainda.</p>}
                    {orders.map(order => {
                        const hasReview = order.reviews && order.reviews.length > 0
                        const canReview = order.status === 'done' && !hasReview
                        return (
                            <div key={order.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                            {order.restaurants?.image_url ? <img src={order.restaurants.image_url} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-gray-400"><Home size={16}/></div>}
                                        </div>
                                        <div><h3 className="font-bold text-gray-800">{order.restaurants?.name || "Loja"}</h3><p className="text-xs text-gray-500">Pedido #{order.id.slice(0,4)} • {formatDate(order.created_at)}</p></div>
                                    </div>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${order.status === 'done' ? 'bg-green-100 text-green-700' : order.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{order.status === 'done' ? 'Concluído' : order.status === 'canceled' ? 'Cancelado' : 'Em Andamento'}</span>
                                </div>
                                <div className="space-y-1 mb-4 border-l-2 border-gray-100 pl-3">
                                    {order.order_items?.map((item: any, i: number) => <p key={i} className="text-sm text-gray-600"><span className="font-bold text-gray-900">{item.quantity}x</span> {item.product_name}</p>)}
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                    <p className="text-sm text-gray-500">Total: <span className="font-bold text-gray-900 text-base">{formatPrice(order.total)}</span></p>
                                    
                                    {/* BOTÃO AVALIAR */}
                                    {canReview && (
                                        <button 
                                            onClick={() => handleOpenReview(order)}
                                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 flex items-center gap-1 transition-colors"
                                        >
                                            <Star size={14} fill="#A16207"/> Avaliar
                                        </button>
                                    )}
                                    {hasReview && (
                                        <div className="flex items-center gap-1 text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                                            <Star size={12} fill="#CA8A04"/> {order.reviews[0].rating}.0
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Endereços */}
            {activeTab === 'addresses' && (
                <div className="space-y-3">
                    {addresses.length === 0 && <p className="text-center text-gray-500 py-10 bg-white rounded-xl border border-dashed border-gray-300">Nenhum endereço salvo.</p>}
                    {addresses.map(addr => (
                        <div key={addr.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-4"><div className="bg-gray-100 p-2 rounded-full text-gray-500"><MapPin size={20}/></div><div><p className="font-bold text-gray-800">{addr.street}, {addr.number}</p><p className="text-sm text-gray-500">{addr.neighborhood} - {addr.city}/{addr.state}</p></div></div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* MODAL DE AVALIAÇÃO */}
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
