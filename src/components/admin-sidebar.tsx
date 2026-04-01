"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  ShoppingBag, 
  Settings, 
  LogOut, 
  Store,
  Ticket,
  Users,
  Star,
  History,
  ChevronLeft,
  ChevronRight
} from "lucide-react"

const MENU_ITEMS = [
  { name: "Visão Geral", href: "/admin", icon: LayoutDashboard },
  { name: "Pedidos", href: "/admin/orders", icon: ShoppingBag }, 
  { name: "Histórico", href: "/admin/history", icon: History },  
  { name: "Cardápio", href: "/admin/menu", icon: UtensilsCrossed },
  { name: "Clientes", href: "/admin/clients", icon: Users },
  { name: "Avaliações", href: "/admin/reviews", icon: Star },
  { name: "Cupons", href: "/admin/coupons", icon: Ticket },
  { name: "Configurações", href: "/admin/settings", icon: Settings },
]

// Novas props para controlar o estado
interface AdminSidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

export default function AdminSidebar({ isCollapsed, toggleSidebar }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/admin/login")
  }

  return (
    // A largura da sidebar muda com base no estado isCollapsed
    <aside className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col z-50 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      
      {/* Botão de minimizar/expandir */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-white border border-gray-200 rounded-full p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 shadow-sm transition-colors z-50"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`p-6 border-b border-gray-100 flex items-center gap-3 ${isCollapsed ? 'justify-center px-2' : ''}`}>
        <div className="bg-red-600 p-2 rounded-lg text-white shadow-md flex-shrink-0">
          <Store size={20} />
        </div>
        {/* Esconde o texto da marca se minimizado */}
        {!isCollapsed && (
            <span className="font-bold text-gray-800 text-lg tracking-tight whitespace-nowrap overflow-hidden">Gestor Delivery</span>
        )}
      </div>

      <nav className={`flex-1 py-4 space-y-2 overflow-y-auto overflow-x-hidden ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {!isCollapsed && <p className="px-4 text-xs font-bold text-gray-400 uppercase mb-2 mt-2">Principal</p>}
        {isCollapsed && <div className="h-6"></div> /* Espaçador para manter alinhamento quando recolhido */}
        
        {MENU_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link 
                key={item.href} 
                href={item.href} 
                title={isCollapsed ? item.name : undefined} // Mostra tooltip nativo quando minimizado
                className={`flex items-center rounded-xl transition-all font-medium text-sm cursor-pointer
                    ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}
                    ${isActive ? "bg-red-50 text-red-600 shadow-sm border border-red-100" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}
                `}
            >
              <item.icon size={20} className={`flex-shrink-0 ${isActive ? "text-red-600" : "text-gray-400"}`} />
              {/* Esconde o nome do link se minimizado */}
              {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <button 
            onClick={handleLogout} 
            title={isCollapsed ? "Sair" : undefined}
            className={`flex items-center text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all font-medium text-sm
                ${isCollapsed ? 'justify-center p-3 w-full' : 'gap-3 px-4 py-3 w-full text-left'}
            `}
        >
          <LogOut size={20} className="flex-shrink-0" /> 
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  )
}