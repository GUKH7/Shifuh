"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { 
  DollarSign, ShoppingBag, TrendingUp, Loader2, 
  Calendar, Utensils, AlertCircle, BarChart3, Filter
} from "lucide-react"
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts"

type Period = 'today' | '7days' | '30days' | 'year' | 'all' | 'custom'

export default function AdminDashboard() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30days')
  
  // Estados para o filtro personalizado
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  
  const [stats, setStats] = useState({ revenue: 0, ordersCount: 0, ticketMedio: 0, canceled: 0 })
  const [chartData, setChartData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])

  useEffect(() => {
    // Só busca automático se NÃO for personalizado. 
    // Se for personalizado, o usuário clica no botão "Filtrar".
    if (period !== 'custom') {
      fetchDashboardData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  const getStartDate = (p: Period) => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    switch (p) {
      case 'today': return now
      case '7days': return new Date(now.setDate(now.getDate() - 7))
      case '30days': return new Date(now.setDate(now.getDate() - 30))
      case 'year': return new Date(now.getFullYear(), 0, 1)
      case 'all': return new Date(2000, 0, 1)
      default: return now
    }
  }

 const fetchDashboardData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        setLoading(false)
        return router.push('/admin/login')
    }// 1. Alterado de .single() para .maybeSingle()
    
    const { data: resto, error } = await supabase.from('restaurants')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle()

    // 2. Adicionado o redirecionamento para a tela de setup
    if (error || !resto) {
        console.log("Restaurante não encontrado. Redirecionando para Setup...")
        router.push('/admin/setup')
        return
    }

    let startDate: Date;
    let endDate: Date = new Date(); 

    if (period === 'custom') {
      if (!customStart || !customEnd) {
        alert("Por favor, selecione a data de início e fim.")
        setLoading(false)
        return
      }
      startDate = new Date(customStart + 'T00:00:00')
      endDate = new Date(customEnd + 'T23:59:59')
    } else {
      startDate = getStartDate(period)
    }

    const { data: orders } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', resto.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true })

    if (orders) {
      processData(orders)
    }
    setLoading(false)
  }

  const processData = (orders: any[]) => {
    let revenue = 0
    let ordersCount = 0
    let canceled = 0
    const salesByDate: Record<string, number> = {}
    const productSales: Record<string, { name: string, qty: number, revenue: number }> = {}

    orders.forEach(order => {
      if (order.status === 'canceled') {
        canceled++
        return
      }
      
      if (order.status === 'done') {
        revenue += order.total
        ordersCount++

        const date = new Date(order.created_at)
        const dateString = period === 'year' || period === 'all' 
            ? `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
            : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
        
        salesByDate[dateString] = (salesByDate[dateString] || 0) + order.total

        order.order_items?.forEach((item: any) => {
            if (!productSales[item.product_name]) {
                productSales[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 }
            }
            productSales[item.product_name].qty += item.quantity
            productSales[item.product_name].revenue += (item.price * item.quantity)
        })
      }
    })

    const ticketMedio = ordersCount > 0 ? revenue / ordersCount : 0

    const formattedChartData = Object.keys(salesByDate).map(date => ({
        date,
        vendas: salesByDate[date]
    }))

    const formattedTopProducts = Object.values(productSales)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)

    setStats({ revenue, ordersCount, ticketMedio, canceled })
    setChartData(formattedChartData)
    setTopProducts(formattedTopProducts)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      
      {/* HEADER & FILTROS */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 className="text-red-600"/> Visão Geral
            </h1>
            <p className="text-gray-500 text-sm mt-1">Acompanhe as métricas de vendas da sua loja.</p>
        </div>

        <div className="flex flex-col items-end gap-3">
            {/* BARRINHA DE FILTROS DE TEMPO */}
            <div className="bg-white p-1 rounded-lg border border-gray-200 inline-flex shadow-sm overflow-x-auto w-full md:w-auto">
                {[
                    { id: 'today', label: 'Hoje' },
                    { id: '7days', label: '7 Dias' },
                    { id: '30days', label: '30 Dias' },
                    { id: 'year', label: 'Este Ano' },
                    { id: 'all', label: 'Tudo' },
                    { id: 'custom', label: 'Personalizado' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setPeriod(tab.id as Period)}
                        className={`px-4 py-1.5 text-sm font-bold rounded-md whitespace-nowrap transition-colors ${
                            period === tab.id 
                            ? 'bg-red-50 text-red-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* SELETOR DE DATAS (Só aparece se "Personalizado" estiver marcado) */}
            {period === 'custom' && (
                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <input 
                        type="date" 
                        value={customStart} 
                        onChange={e => setCustomStart(e.target.value)} 
                        className="p-2 border border-gray-200 rounded-lg text-sm text-gray-600 outline-none focus:border-red-500"
                    />
                    <span className="text-gray-400 text-sm font-medium">até</span>
                    <input 
                        type="date" 
                        value={customEnd} 
                        onChange={e => setCustomEnd(e.target.value)} 
                        className="p-2 border border-gray-200 rounded-lg text-sm text-gray-600 outline-none focus:border-red-500"
                    />
                    <button 
                        onClick={fetchDashboardData} 
                        className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg flex items-center gap-2 font-bold text-sm transition-colors"
                    >
                        <Filter size={16}/> Filtrar
                    </button>
                </div>
            )}
        </div>
      </div>

      {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={32}/></div>
      ) : (
        <>
            {/* CARDS DE MÉTRICAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-gray-500 text-sm font-bold mb-1">Faturamento Bruto</p>
                        <h3 className="text-2xl font-black text-gray-800">{formatCurrency(stats.revenue)}</h3>
                    </div>
                    <div className="bg-green-100 p-3 rounded-xl text-green-600"><DollarSign size={24}/></div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-gray-500 text-sm font-bold mb-1">Pedidos Entregues</p>
                        <h3 className="text-2xl font-black text-gray-800">{stats.ordersCount}</h3>
                    </div>
                    <div className="bg-blue-100 p-3 rounded-xl text-blue-600"><ShoppingBag size={24}/></div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-gray-500 text-sm font-bold mb-1">Ticket Médio</p>
                        <h3 className="text-2xl font-black text-gray-800">{formatCurrency(stats.ticketMedio)}</h3>
                    </div>
                    <div className="bg-purple-100 p-3 rounded-xl text-purple-600"><TrendingUp size={24}/></div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
                    <div>
                        <p className="text-gray-500 text-sm font-bold mb-1">Cancelamentos</p>
                        <h3 className="text-2xl font-black text-gray-800">{stats.canceled}</h3>
                    </div>
                    <div className="bg-red-100 p-3 rounded-xl text-red-600"><AlertCircle size={24}/></div>
                </div>
            </div>

            {/* ÁREA DOS GRÁFICOS */}
            <div className="grid lg:grid-cols-3 gap-6">
                
                {/* Gráfico de Vendas no Tempo */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6">
                        <Calendar className="text-gray-400" size={20}/> Evolução de Vendas
                    </h3>
                    <div className="h-72 w-full">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#DC2626" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} tickFormatter={(value) => `R$${value}`} />
                                    <RechartsTooltip 
                                        formatter={(value: any) => [formatCurrency(Number(value)), "Faturamento"]}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="vendas" stroke="#DC2626" strokeWidth={3} fillOpacity={1} fill="url(#colorVendas)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                                <BarChart3 size={32} className="mb-2 text-gray-300"/>
                                <p>Nenhuma venda registrada neste período.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Ranking de Produtos */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6">
                        <Utensils className="text-gray-400" size={20}/> Top 5 Produtos
                    </h3>
                    <div className="space-y-4">
                        {topProducts.length > 0 ? (
                            topProducts.map((product, index) => (
                                <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-100 text-gray-600' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'}`}>
                                            {index + 1}º
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm max-w-[150px] truncate">{product.name}</p>
                                            <p className="text-xs text-gray-500">{product.qty} unid. vendidas</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm text-green-600">
                                        {formatCurrency(product.revenue)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-gray-400 py-10">
                                Nenhum produto vendido.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </>
      )}
    </div>
  )
}