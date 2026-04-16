"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Clock, Bike, CheckCircle, MapPin, DollarSign, Package, Printer } from "lucide-react"

// Tipos
interface Order {
  id: string
  customer_name: string
  customer_phone: string
  total: number
  status: 'pending' | 'preparing' | 'delivering' | 'done' | 'canceled'
  payment_method: string
  created_at: string
  address: any
  items: any[]
  delivery_fee: number
  change_for?: string
}

const TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes', countColor: 'bg-yellow-500' },
  { id: 'preparing', label: 'Em Preparo', countColor: 'bg-orange-500' },
  { id: 'delivering', label: 'Em Entrega', countColor: 'bg-blue-500' },
  { id: 'done', label: 'Concluídos', countColor: 'bg-green-500' },
]

export default function OrdersPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const [activeTab, setActiveTab] = useState('pending')
  
  // CONFIG DO RESTAURANTE
  const [restaurantConfig, setRestaurantConfig] = useState<any>(null)

  useEffect(() => {
    fetchOrders()
    subscribeToOrders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchOrders = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return router.push("/admin/login")

        const { data: resto, error: restoError } = await supabase.from('restaurants').select('*').maybeSingle()
        if (!resto) return
        setRestaurantConfig(resto)

        

        const { data, error } = await supabase
            .from('orders')
            .select(`*, order_items (*)`)
            .eq('restaurant_id', resto.id)
            .neq('status', 'canceled')
            .order('created_at', { ascending: false })

        if (error) {
            setErrorMsg(error.message)
            return
        }

        if (data) {
            const formattedOrders = data.map((order: any) => ({
                ...order,
                items: order.order_items || []
            }))
            setOrders(formattedOrders)
        }
    } catch (err) {
        console.error(err)
        setErrorMsg("Erro de conexão.")
    } finally {
        setLoading(false)
    }
  }

  const subscribeToOrders = () => {
    const subscription = supabase
      .channel('orders-list-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe()
    return () => { supabase.removeChannel(subscription) }
  }

  // --- FUNÇÃO PARA LIMPAR O TELEFONE ---
  const formatPhoneForWhatsapp = (phone: string) => {
      let cleaned = phone.replace(/\D/g, ''); // Tira traços e espaços
      if (!cleaned.startsWith('55')) {
          cleaned = '55' + cleaned; // Garante o 55 do Brasil
      }
      return cleaned;
  }

  // --- NOVA FUNÇÃO DE STATUS (LIMPA E AUTOMATIZADA) 🤖✅ ---
  const updateStatus = async (order: Order, newStatus: string) => {
    // 1. Atualiza a tela na hora (Feedback instantâneo)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus as any } : o))
    
    // 2. Atualiza no Supabase
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id)

    // 3. Dispara o WhatsApp (Silenciosamente)
    if (order.customer_phone) {
        let mensagem = "";
        const storeName = restaurantConfig?.name || "Delivery";
        const orderNum = order.id.slice(0, 4);

        if (newStatus === 'preparing') {
            mensagem = `👨‍🍳 *Olá, ${order.customer_name}!*\nO seu pedido *#${orderNum}* acabou de entrar na cozinha do *${storeName}* e já está sendo preparado!\n\nAvisaremos quando sair para entrega.`;
        } else if (newStatus === 'delivering') {
            mensagem = `🛵 *Oba, ${order.customer_name}!*\nO seu pedido *#${orderNum}* do *${storeName}* acabou de sair para entrega!\n\nFique de olho no portão! 👀`;
        } else if (newStatus === 'done') {
            mensagem = `✅ *Pedido Concluído!*\nEsperamos que você goste da sua refeição, ${order.customer_name}!\nObrigado por pedir no *${storeName}*!`;
        } else if (newStatus === 'canceled') {
            mensagem = `❌ *Pedido Cancelado*\n${order.customer_name}, infelizmente o seu pedido *#${orderNum}* precisou ser cancelado.`;
        }

        if (mensagem) {
            // "Fire and forget" - Envia sem travar a tela esperando resposta
            fetch('http://64.181.189.107:3001/enviar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telefone: formatPhoneForWhatsapp(order.customer_phone),
                    mensagem: mensagem
                })
            }).catch(err => console.error("⚠️ Robô desligado ou erro no envio:", err));
        }
    }
  }

  const handlePrint = (order: Order) => {
      const printWindow = window.open('', '', 'width=350,height=600');
      if (!printWindow) return;

      const width = restaurantConfig?.printer_width || 80;
      const fontSize = restaurantConfig?.printer_font_size || 12;
      const titleSize = fontSize + 4;

      const itemsHtml = order.items.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>${item.quantity}x ${item.product_name}</span>
            <span>R$ ${item.price.toFixed(2)}</span>
        </div>
        ${item.addons && Array.isArray(item.addons) && item.addons.length > 0 ? 
            `<div style="font-size: ${fontSize - 1}px; font-weight: normal; margin-left: 10px;">+ ${item.addons.map((a:any) => a.name).join(', ')}</div>` : ''}
        ${item.observation ? `<div style="font-size: ${fontSize}px; font-weight: 900; margin-left: 10px; text-decoration: underline;">OBS: ${item.observation}</div>` : ''}
      `).join('');

      const addressHtml = order.address && typeof order.address === 'object' ? `
        <div style="border-bottom: 2px dashed #000; padding: 5px 0;">
            <div style="font-weight: 900; font-size: ${fontSize + 1}px;">ENTREGA:</div>
            <div style="font-weight: 700;">${order.address.street}, ${order.address.number}</div>
            <div>${order.address.neighborhood}</div>
            ${order.address.complement ? `<div>Comp: ${order.address.complement}</div>` : ''}
            ${order.address.distance ? `<div style="margin-top: 4px; font-size: ${fontSize-1}px;">Distância: ${order.address.distance}km</div>` : ''}
        </div>
      ` : '<div style="border-bottom: 2px dashed #000; padding: 5px 0;">Retirada no Balcão</div>';

      const htmlContent = `
        <html>
        <head>
            <title>Pedido #${order.id.slice(0,4)}</title>
            <style>
                @media print {
                    @page { margin: 0; }
                    body { margin: 0; padding: 5px; }
                }
                body { 
                    font-family: 'Courier New', monospace; 
                    color: #000000 !important;
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact;
                    font-weight: 600; 
                    font-size: ${fontSize}px; 
                    width: ${width}mm;
                }
                .center { text-align: center; }
                .bold { font-weight: 800; } 
                .line { border-bottom: 2px dashed #000; margin: 8px 0; } 
                .flex { display: flex; justify-content: space-between; }
                .big { font-size: ${titleSize}px; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div class="center bold big" style="margin-bottom: 5px;">${restaurantConfig?.name || "Delivery"}</div>
            <div class="center bold">Pedido #${order.id.slice(0, 4)}</div>
            <div class="center" style="font-size: ${fontSize - 2}px; font-weight: normal;">${new Date(order.created_at).toLocaleString('pt-BR')}</div>
            
            <div class="line"></div>
            
            <div><span class="bold">Cliente:</span> ${order.customer_name}</div>
            <div><span class="bold">Tel:</span> ${order.customer_phone}</div>
            
            ${addressHtml}
            
            <div style="margin-top: 5px; margin-bottom: 5px;">
                ${itemsHtml}
            </div>
            
            <div class="line"></div>
            
            <div class="flex"><span>Subtotal:</span> <span>R$ ${(order.total - (order.delivery_fee || 0)).toFixed(2)}</span></div>
            <div class="flex"><span>Entrega:</span> <span>R$ ${(order.delivery_fee || 0).toFixed(2)}</span></div>
            <div class="flex bold big" style="margin-top: 5px;"><span>TOTAL:</span> <span>R$ ${order.total.toFixed(2)}</span></div>
            
            <div class="line"></div>
            <div class="center bold">Pagamento: ${order.payment_method === 'card' ? 'Cartão' : order.payment_method === 'money' || order.payment_method === 'cash' ? 'Dinheiro' : 'PIX'}</div>
            ${order.change_for ? `<div class="center bold">Troco para: ${order.change_for}</div>` : ''}
            <br/>
            <div class="center" style="font-size: 10px;">--- Fim do Pedido ---</div>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
          printWindow.print();
          printWindow.close();
      }, 500);
  }

  const filteredOrders = orders.filter(o => activeTab === 'all' ? true : o.status === activeTab)
  const getCount = (status: string) => orders.filter(o => o.status === status).length
  const formatPrice = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Carregando pedidos...</div>
  if (errorMsg) return <div className="p-8 text-center text-red-600">{errorMsg}</div>

  return (
    <div className="max-w-5xl mx-auto pb-20">
      
      {/* Cabeçalho */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Gestor de Pedidos</h1>
            <p className="text-gray-500 text-sm">Acompanhe seus pedidos em tempo real</p>
          </div>
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 border border-green-200">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
             Loja Aberta
          </div>
      </div>

      {/* Abas */}
      <div className="flex overflow-x-auto gap-2 border-b border-gray-200 mb-6 pb-1">
          {TABS.map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                      relative px-6 py-3 text-sm font-bold transition-all whitespace-nowrap rounded-t-lg border-b-2
                      ${activeTab === tab.id 
                          ? 'text-red-600 border-red-600 bg-red-50' 
                          : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'}
                  `}
              >
                  <div className="flex items-center gap-2">
                      {tab.label}
                      {tab.id !== 'all' && getCount(tab.id) > 0 && (
                          <span className={`text-[10px] text-white px-2 py-0.5 rounded-full ${tab.countColor}`}>
                              {getCount(tab.id)}
                          </span>
                      )}
                  </div>
              </button>
          ))}
      </div>

      {/* Lista */}
      <div className="space-y-4">
          {filteredOrders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
                  <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">Nenhum pedido nesta aba.</p>
              </div>
          ) : (
              filteredOrders.map(order => (
                  <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
                      
                      {/* HEADER CARD */}
                      <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                              <span className="font-bold text-gray-800 text-lg">#{order.id.slice(0, 4)}</span>
                              <span className="text-gray-400">|</span>
                              <span className="font-bold text-gray-700">{order.customer_name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                              {/* BOTÃO IMPRIMIR */}
                              <button 
                                onClick={() => handlePrint(order)}
                                className="flex items-center gap-1 text-gray-600 hover:text-black bg-white border border-gray-300 hover:border-black px-3 py-1 rounded-md text-xs font-bold shadow-sm transition-all"
                              >
                                  <Printer size={14}/> Imprimir
                              </button>
                              
                              <div className="flex items-center gap-2 text-sm text-gray-500 font-medium bg-white px-3 py-1 rounded-full border border-gray-200">
                                  <Clock size={14} /> {formatTime(order.created_at)}
                              </div>
                          </div>
                      </div>

                      <div className="p-6 flex flex-col md:flex-row gap-6">
                          
                          {/* ITENS */}
                          <div className="flex-1 space-y-3">
                              {order.items?.map((item: any, i: number) => (
                                  <div key={i} className="flex items-start gap-3 text-sm">
                                      <span className="font-bold text-gray-500 border border-gray-200 px-2 rounded bg-gray-50">{item.quantity}x</span>
                                      <div>
                                          <p className="text-gray-800 font-medium">{item.product_name}</p>
                                          {item.addons && Array.isArray(item.addons) && item.addons.length > 0 && (
                                              <p className="text-xs text-gray-500 mt-1">
                                                  + {item.addons.map((opt: any) => opt.name).join(', ')}
                                              </p>
                                          )}
                                          {item.observation && (
                                              <p className="text-xs text-orange-600 font-bold mt-1 bg-orange-50 px-2 py-0.5 rounded inline-block">
                                                  Obs: {item.observation}
                                              </p>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>

                          {/* INFO ENTREGA */}
                          <div className="md:w-1/3 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6 space-y-4">
                              <div className="flex gap-3">
                                  <div className="bg-gray-100 p-2 rounded-full h-fit"><MapPin size={16} className="text-gray-500"/></div>
                                  <div>
                                      <p className="text-xs font-bold text-gray-400 uppercase">Entrega</p>
                                      {order.address && typeof order.address === 'object' ? (
                                          <p className="text-sm text-gray-700 leading-tight">
                                              {order.address.street || 'Rua não inf.'}, {order.address.number || 'S/N'}<br/>
                                              {order.address.neighborhood || ''}
                                          </p>
                                      ) : (
                                          <p className="text-sm text-gray-500">Retirada / Sem endereço</p>
                                      )}
                                  </div>
                              </div>

                              <div className="flex gap-3">
                                  <div className="bg-green-100 p-2 rounded-full h-fit"><DollarSign size={16} className="text-green-600"/></div>
                                  <div>
                                      <p className="text-xs font-bold text-gray-400 uppercase">Pagamento ({order.payment_method})</p>
                                      <p className="text-lg font-bold text-gray-800">{formatPrice(order.total)}</p>
                                      {order.change_for && <p className="text-xs text-red-500 font-bold">Troco para: {order.change_for}</p>}
                                  </div>
                              </div>
                          </div>

                          {/* AÇÕES (ATUALIZADAS PARA PASSAR O ORDER INTEIRO) */}
                          <div className="md:w-48 flex flex-col justify-center gap-2 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6">
                              {order.status === 'pending' && (
                                  <>
                                      <button 
                                          onClick={() => updateStatus(order, 'preparing')}
                                          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                                      >
                                          ACEITAR
                                      </button>
                                      <button 
                                          onClick={() => { if(confirm('Rejeitar pedido?')) updateStatus(order, 'canceled') }}
                                          className="w-full py-2 text-gray-500 hover:bg-gray-100 font-bold rounded-lg text-sm transition-colors"
                                      >
                                          Rejeitar
                                      </button>
                                  </>
                              )}

                              {order.status === 'preparing' && (
                                  <button 
                                      onClick={() => updateStatus(order, 'delivering')}
                                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                                  >
                                      <Bike size={18} /> DESPACHAR
                                  </button>
                              )}

                              {order.status === 'delivering' && (
                                  <button 
                                      onClick={() => updateStatus(order, 'done')}
                                      className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                                  >
                                      <CheckCircle size={18} /> CONCLUIR
                                  </button>
                              )}
                              
                              {order.status === 'done' && (
                                  <div className="text-center p-2 bg-green-50 text-green-700 font-bold rounded-lg text-sm border border-green-100">
                                      Pedido Finalizado
                                  </div>
                              )}
                          </div>

                      </div>
                  </div>
              ))
          )}
      </div>
    </div>
  )
}