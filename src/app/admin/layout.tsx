"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import AdminSidebar from "@/components/admin-sidebar" 

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // Estado para controlar se a sidebar está minimizada
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  
  // Verifica se o usuário está na tela de login
  const isLoginPage = pathname === '/admin/login'

  // Se for a tela de login, renderiza o conteúdo direto, sem sidebar e sem a margem
  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-[#F2F4F7]">
      {/* Passa o estado e a função para a Sidebar */}
      <AdminSidebar 
        isCollapsed={isSidebarCollapsed} 
        toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
      />

      {/* A margem esquerda (ml) ajusta-se suavemente baseada no estado */}
      <div className={`flex-1 p-8 transition-all duration-300 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {children}
      </div>
    </div>
  )
}