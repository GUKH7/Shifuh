"use client"

import AdminSidebar from "@/components/admin-sidebar"
import { usePathname } from "next/navigation"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  
  // Verifica se o usuário está na tela de login
  const isLoginPage = pathname === '/admin/login'

  // Se for a tela de login, renderiza o conteúdo direto, sem sidebar e sem a margem
  if (isLoginPage) {
    return <>{children}</>
  }

  // Se for qualquer outra tela do admin, renderiza a estrutura completa com o menu
  return (
    <div className="flex min-h-screen bg-[#F2F4F7]">
      <AdminSidebar />
      <div className="flex-1 md:ml-64 p-8">
        {children}
      </div>
    </div>
  )
}