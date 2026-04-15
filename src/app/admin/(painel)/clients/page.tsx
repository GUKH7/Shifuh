"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Users, Search, Loader2, Phone, ShoppingBag, DollarSign, Calendar } from "lucide-react"

interface Client {
  phone: string
  name: string
  totalSpent: number
  orderCount: number
  lastOrderDate: string
  address: string
}

export default function ClientsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchClients()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchClients = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return router.push("/admin/login")

        const { data: resto } = await supabase.from('restaurants').select('id').single()
        if (!resto) return

        // Busca TODOS os pedidos (exceto cancelados) para calcular métricas
        const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .eq('restaurant_id', resto.id)
            .neq('status', 'canceled')
            .order('created_at', { ascending: false })

        if (orders) {
            // ALGORITMO DE AGRUPAMENTO (DEDUPLICAÇÃO POR TELEFONE)
            const clientsMap: Record<string, Client> = {}

            orders.forEach((order: any) => {
                const phone = order.customer_phone
                if (!phone) return

                if (!clientsMap[phone]) {
                    // Se é a primeira vez que vemos esse telefone
                    clientsMap[phone] = {
                        phone: phone,
                        name: order.customer_name, // Pega o nome mais recente
                        totalSpent: 0,
                        orderCount: 0,
                        lastOrderDate: order.created_at,
                        address: order.address ? `${order.address.street}, ${order.address.number} - ${order.address.neighborhood}` : 'Retirada'
                    }
                }

                // Acumula métricas
                clientsMap[phone].totalSpent += order.total
                clientsMap[phone].orderCount += 1
            })

            // Transforma o Objeto em Array e ordena por quem gastou mais (VIPs no topo)
            const clientsList = Object.values(clientsMap).sort((a, b) => b.totalSpent - a.totalSpent)
            setClients(clientsList)
        }
    } catch (err) {
        console.error(err)
    } finally {
        setLoading(false)
    }
  }

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR')

  // Filtro de busca
  const filteredClients = clients.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone.includes(searchTerm)
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-6xl mx-auto pb-20">
      
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-500 flex items-center gap-2">
                <Users className="text-red-600"/> Base de Clientes
            </h1>
            <p className="text-gray-500 text-sm">
                Você tem <strong>{clients.length}</strong> clientes ativos na base.
            </p>
        </div>
        
        {/* Barra de Busca */}
        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
            <input 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou telefone..." 
                className="w-full pl-10 p-3 border rounded-xl outline-none focus:border-red-500 shadow-sm"
            />
        </div>
      </div>

      {/* Lista de Clientes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase">
                      <tr>
                          <th className="p-4 font-bold">Cliente</th>
                          <th className="p-4 font-bold">Contato</th>
                          <th className="p-4 font-bold text-center">Pedidos</th>
                          <th className="p-4 font-bold text-center">Total Gasto</th>
                          <th className="p-4 font-bold text-right">Última Compra</th>
                          <th className="p-4 font-bold text-center">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredClients.map((client, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors group">
                              <td className="p-4">
                                  <p className="font-bold text-gray-800">{client.name}</p>
                                  <p className="text-xs text-gray-400 truncate max-w-[200px]">{client.address}</p>
                              </td>
                              <td className="p-4">
                                  <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-2 py-1 rounded w-fit text-sm">
                                      <Phone size={14}/> {client.phone}
                                  </div>
                              </td>
                              <td className="p-4 text-center">
                                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                                      <ShoppingBag size={12}/> {client.orderCount}
                                  </div>
                              </td>
                              <td className="p-4 text-center">
                                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold">
                                      <DollarSign size={12}/> {formatMoney(client.totalSpent)}
                                  </div>
                              </td>
                              <td className="p-4 text-right text-sm text-gray-500 font-medium">
                                  {formatDate(client.lastOrderDate)}
                              </td>
                              <td className="p-4 text-center">
                                  <button 
                                    onClick={() => window.open(`https://wa.me/${client.phone.replace(/\D/g, '')}`, '_blank')}
                                    className="text-green-600 hover:bg-green-50 p-2 rounded-lg transition-colors font-bold text-xs border border-green-200 hover:border-green-400"
                                  >
                                      WhatsApp
                                  </button>
                              </td>
                          </tr>
                      ))}
                      {filteredClients.length === 0 && (
                          <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-400">
                                  Nenhum cliente encontrado.
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  )
}