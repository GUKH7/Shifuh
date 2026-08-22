"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Edit3,
  ExternalLink,
  Loader2,
  RotateCcw,
  Save,
  Search,
  ScrollText,
  ShieldCheck,
  Store,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";

type PlatformRole = "owner" | "admin" | "support" | "viewer";
type PlatformPermission =
  | "platform.access"
  | "restaurants.read"
  | "restaurants.update"
  | "restaurants.archive"
  | "restaurants.restore"
  | "members.read"
  | "members.manage"
  | "audit.read";
type Tab = "restaurants" | "members" | "audit";
type RestaurantStatus = "active" | "archived";

type AccessPayload = {
  role: PlatformRole;
  permissions: PlatformPermission[];
};

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
  primary_color: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

type PlatformMember = {
  user_id: string;
  role: PlatformRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
};

type AuditEvent = {
  id: string;
  actor_user_id: string | null;
  actor_role: PlatformRole;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ROLE_LABELS: Record<PlatformRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Suporte",
  viewer: "Visualizador",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "restaurant.update": "Loja atualizada",
  "restaurant.archive": "Loja arquivada",
  "restaurant.restore": "Loja restaurada",
  "platform_member.create": "Membro adicionado",
  "platform_member.update": "Permissão alterada",
  "platform_owner.bootstrap": "Owner inicial provisionado",
};

function formatDate(date: string) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readApiError(response: Response, fallback: string) {
  try {
    const result = (await response.json()) as { error?: string };
    return result.error || fallback;
  } catch {
    return fallback;
  }
}

export default function PlatformPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [access, setAccess] = useState<AccessPayload | null>(null);
  const [tab, setTab] = useState<Tab>("restaurants");
  const [restaurantStatus, setRestaurantStatus] = useState<RestaurantStatus>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [editingId, setEditingId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", phone: "", primary_color: "" });
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<PlatformRole>("viewer");
  const [addingMember, setAddingMember] = useState(false);

  const can = useCallback(
    (permission: PlatformPermission) => Boolean(access?.permissions.includes(permission)),
    [access],
  );

  const loadRestaurants = useCallback(async (status: RestaurantStatus) => {
    const response = await fetch(`/api/platform/restaurants?status=${status}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "Não foi possível carregar as lojas."));
    const result = (await response.json()) as { restaurants?: RestaurantRow[] };
    setRestaurants(result.restaurants ?? []);
  }, []);

  const loadMembers = useCallback(async () => {
    const response = await fetch("/api/platform/members", { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "Não foi possível carregar a equipe."));
    const result = (await response.json()) as { members?: PlatformMember[] };
    setMembers(result.members ?? []);
  }, []);

  const loadAudit = useCallback(async () => {
    const response = await fetch("/api/platform/audit?limit=150", { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "Não foi possível carregar a auditoria."));
    const result = (await response.json()) as { events?: AuditEvent[] };
    setAuditEvents(result.events ?? []);
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/access", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (response.status === 403) {
        router.replace("/admin");
        return;
      }
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível validar o acesso."));

      const accessResult = (await response.json()) as AccessPayload;
      setAccess(accessResult);

      const tasks: Promise<void>[] = [loadRestaurants("active")];
      if (accessResult.permissions.includes("members.read")) tasks.push(loadMembers());
      if (accessResult.permissions.includes("audit.read")) tasks.push(loadAudit());
      await Promise.all(tasks);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Não foi possível abrir o admin da plataforma.");
    } finally {
      setLoading(false);
    }
  }, [loadAudit, loadMembers, loadRestaurants, router]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const filteredRestaurants = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return restaurants;
    return restaurants.filter((restaurant) =>
      [restaurant.name, restaurant.slug, restaurant.phone || ""]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [query, restaurants]);

  const startEditing = (restaurant: RestaurantRow) => {
    setEditingId(restaurant.id);
    setForm({
      name: restaurant.name,
      slug: restaurant.slug,
      phone: restaurant.phone || "",
      primary_color: restaurant.primary_color || "",
    });
  };

  const saveRestaurant = async (restaurantId: string) => {
    setBusyId(restaurantId);
    try {
      const response = await fetch(`/api/platform/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível salvar a loja."));
      showToast({ title: "Loja atualizada", description: "A alteração foi registrada na auditoria." });
      setEditingId("");
      await Promise.all([loadRestaurants(restaurantStatus), can("audit.read") ? loadAudit() : Promise.resolve()]);
    } catch (err) {
      showToast({
        title: "Erro ao atualizar",
        description: err instanceof Error ? err.message : "Não foi possível salvar a loja.",
        variant: "error",
      });
    } finally {
      setBusyId("");
    }
  };

  const archiveRestaurant = async (restaurant: RestaurantRow) => {
    if (!window.confirm(`Arquivar a loja "${restaurant.name}"? A vitrine e o acesso operacional serão bloqueados, mas os dados poderão ser restaurados.`)) return;
    setBusyId(restaurant.id);
    try {
      const response = await fetch(`/api/platform/restaurants/${restaurant.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível arquivar a loja."));
      showToast({ title: "Loja arquivada", description: "Os dados foram preservados e a ação foi auditada." });
      await Promise.all([loadRestaurants(restaurantStatus), can("audit.read") ? loadAudit() : Promise.resolve()]);
    } catch (err) {
      showToast({
        title: "Erro ao arquivar",
        description: err instanceof Error ? err.message : "Não foi possível arquivar a loja.",
        variant: "error",
      });
    } finally {
      setBusyId("");
    }
  };

  const restoreRestaurant = async (restaurant: RestaurantRow) => {
    setBusyId(restaurant.id);
    try {
      const response = await fetch(`/api/platform/restaurants/${restaurant.id}/restore`, { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível restaurar a loja."));
      showToast({ title: "Loja restaurada", description: "A vitrine e o acesso operacional podem ser usados novamente." });
      await Promise.all([loadRestaurants(restaurantStatus), can("audit.read") ? loadAudit() : Promise.resolve()]);
    } catch (err) {
      showToast({
        title: "Erro ao restaurar",
        description: err instanceof Error ? err.message : "Não foi possível restaurar a loja.",
        variant: "error",
      });
    } finally {
      setBusyId("");
    }
  };

  const changeRestaurantStatus = async (status: RestaurantStatus) => {
    setRestaurantStatus(status);
    setEditingId("");
    setLoading(true);
    try {
      await loadRestaurants(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as lojas.");
    } finally {
      setLoading(false);
    }
  };

  const addMember = async () => {
    if (!newMemberEmail.trim()) return;
    setAddingMember(true);
    try {
      const response = await fetch("/api/platform/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMemberEmail.trim(), role: newMemberRole }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível adicionar o membro."));
      setNewMemberEmail("");
      setNewMemberRole("viewer");
      showToast({ title: "Membro adicionado", description: "O acesso passa a ser controlado pelo RBAC da plataforma." });
      await Promise.all([loadMembers(), can("audit.read") ? loadAudit() : Promise.resolve()]);
    } catch (err) {
      showToast({
        title: "Erro ao adicionar membro",
        description: err instanceof Error ? err.message : "Não foi possível adicionar o membro.",
        variant: "error",
      });
    } finally {
      setAddingMember(false);
    }
  };

  const updateMember = async (member: PlatformMember, changes: Partial<Pick<PlatformMember, "role" | "is_active">>) => {
    setBusyId(member.user_id);
    try {
      const response = await fetch(`/api/platform/members/${member.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível atualizar o membro."));
      showToast({ title: "Acesso atualizado", description: "A alteração de permissão foi auditada." });
      await Promise.all([loadMembers(), can("audit.read") ? loadAudit() : Promise.resolve()]);
    } catch (err) {
      showToast({
        title: "Erro ao atualizar acesso",
        description: err instanceof Error ? err.message : "Não foi possível atualizar o membro.",
        variant: "error",
      });
    } finally {
      setBusyId("");
    }
  };

  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: Tab; label: string; icon: typeof Store }> = [
      { id: "restaurants", label: "Lojas", icon: Store },
    ];
    if (can("members.read")) tabs.push({ id: "members", label: "Equipe", icon: Users });
    if (can("audit.read")) tabs.push({ id: "audit", label: "Auditoria", icon: ScrollText });
    return tabs;
  }, [can]);

  if (loading && !access) {
    return (
      <AdminPageShell className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--brand)]" size={28} />
      </AdminPageShell>
    );
  }

  if (error && !access) {
    return (
      <AdminPageShell className="py-10">
        <div className="surface-card rounded-3xl p-8 text-center">
          <p className="font-bold text-gray-900">Não foi possível abrir o admin da plataforma.</p>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <button onClick={() => void initialize()} className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white">
            Tentar novamente
          </button>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Admin da plataforma"
        description="Controle lojas, acessos privilegiados e ações administrativas do Shifuh."
        icon={<ShieldCheck size={24} />}
        action={
          access ? (
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-[#fff4ed] px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-[var(--brand)]">
              {ROLE_LABELS[access.role]}
            </span>
          ) : null
        }
      />

      <div className="surface-card flex flex-wrap gap-2 rounded-2xl p-2">
        {availableTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              tab === item.id ? "bg-[var(--brand)] text-white" : "text-gray-600 hover:bg-[#fbf7f2]"
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {tab === "restaurants" && (
        <section className="space-y-4">
          <div className="surface-card grid gap-3 rounded-3xl p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative min-w-0">
              <span className="sr-only">Buscar lojas</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome, slug ou telefone"
                className="admin-control pl-11"
              />
            </label>
            <div className="flex rounded-xl bg-[#fbf7f2] p-1">
              {(["active", "archived"] as RestaurantStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void changeRestaurantStatus(status)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                    restaurantStatus === status ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"
                  }`}
                >
                  {status === "active" ? "Ativas" : "Arquivadas"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[var(--brand)]" /></div>
          ) : filteredRestaurants.length === 0 ? (
            <div className="surface-card rounded-3xl p-10 text-center text-sm text-gray-500">
              Nenhuma loja encontrada neste status.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredRestaurants.map((restaurant) => {
                const editing = editingId === restaurant.id;
                const busy = busyId === restaurant.id;
                return (
                  <article key={restaurant.id} className="surface-card rounded-3xl p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-black text-gray-950">{restaurant.name}</h2>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${restaurant.deleted_at ? "bg-gray-100 text-gray-500" : "bg-emerald-50 text-emerald-700"}`}>
                            {restaurant.deleted_at ? "Arquivada" : "Ativa"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-gray-400">/{restaurant.slug} · criada em {formatDate(restaurant.created_at)}</p>
                        {restaurant.deleted_at && <p className="mt-1 text-xs font-semibold text-gray-500">Arquivada em {formatDate(restaurant.deleted_at)}</p>}
                      </div>
                      {!restaurant.deleted_at && (
                        <a href={`/${restaurant.slug}`} target="_blank" rel="noreferrer" aria-label={`Abrir vitrine ${restaurant.name}`} className="admin-icon-button border border-[var(--line)] text-gray-500 hover:text-[var(--brand)]">
                          <ExternalLink size={17} />
                        </a>
                      )}
                    </div>

                    {editing ? (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <input className="admin-control" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome" />
                        <input className="admin-control" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Slug" />
                        <input className="admin-control" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone" />
                        <input className="admin-control" value={form.primary_color} onChange={(event) => setForm((current) => ({ ...current, primary_color: event.target.value }))} placeholder="#ff5a1f" />
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-3 rounded-2xl bg-[#fbf7f2] p-4 text-sm sm:grid-cols-2">
                        <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Telefone</p><p className="mt-1 font-semibold text-gray-700">{restaurant.phone || "Não informado"}</p></div>
                        <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">ID da loja</p><p className="mt-1 truncate font-mono text-xs text-gray-600">{restaurant.id}</p></div>
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                      {editing ? (
                        <>
                          <button disabled={busy} onClick={() => void saveRestaurant(restaurant.id)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
                          </button>
                          <button onClick={() => setEditingId("")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-bold text-gray-600"><X size={16} /> Cancelar</button>
                        </>
                      ) : restaurant.deleted_at ? (
                        can("restaurants.restore") && (
                          <button disabled={busy} onClick={() => void restoreRestaurant(restaurant)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-50">
                            {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Restaurar
                          </button>
                        )
                      ) : (
                        <>
                          {can("restaurants.update") && <button onClick={() => startEditing(restaurant)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-[var(--brand)]"><Edit3 size={16} /> Editar</button>}
                          {can("restaurants.archive") && <button disabled={busy} onClick={() => void archiveRestaurant(restaurant)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />} Arquivar</button>}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "members" && can("members.read") && (
        <section className="space-y-4">
          {can("members.manage") && (
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <div className="flex items-center gap-3"><UserPlus className="text-[var(--brand)]" size={20} /><div><h2 className="font-black text-gray-950">Adicionar operador</h2><p className="text-sm text-gray-500">O usuário precisa já possuir uma conta autenticada no Shifuh.</p></div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                <input type="email" className="admin-control" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="email@exemplo.com" />
                <select className="admin-control admin-select" value={newMemberRole} onChange={(event) => setNewMemberRole(event.target.value as PlatformRole)}>
                  {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
                <button disabled={addingMember || !newMemberEmail.trim()} onClick={() => void addMember()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-bold text-white disabled:opacity-50">{addingMember ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Adicionar</button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {members.map((member) => (
              <article key={member.user_id} className="surface-card grid gap-4 rounded-3xl p-5 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate font-black text-gray-950">{member.email || member.user_id}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${member.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{member.is_active ? "Ativo" : "Inativo"}</span></div>
                  <p className="mt-1 text-xs text-gray-400">Desde {formatDate(member.created_at)}</p>
                </div>
                {can("members.manage") ? (
                  <select disabled={busyId === member.user_id} className="admin-control admin-select" value={member.role} onChange={(event) => void updateMember(member, { role: event.target.value as PlatformRole })}>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                  </select>
                ) : <span className="text-sm font-bold text-gray-600">{ROLE_LABELS[member.role]}</span>}
                {can("members.manage") && (
                  <button disabled={busyId === member.user_id} onClick={() => void updateMember(member, { is_active: !member.is_active })} className={`rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${member.is_active ? "border-red-200 text-red-600" : "border-emerald-200 text-emerald-700"}`}>
                    {busyId === member.user_id ? "Salvando..." : member.is_active ? "Desativar" : "Reativar"}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "audit" && can("audit.read") && (
        <section className="space-y-3">
          {auditEvents.length === 0 ? (
            <div className="surface-card rounded-3xl p-10 text-center text-sm text-gray-500">Nenhuma ação privilegiada registrada.</div>
          ) : auditEvents.map((event) => (
            <article key={event.id} className="surface-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-black text-gray-950">{AUDIT_ACTION_LABELS[event.action] || event.action}</p><span className="rounded-full bg-[#fff4ed] px-2 py-1 text-[10px] font-black uppercase text-[var(--brand)]">{ROLE_LABELS[event.actor_role]}</span></div>
                <p className="mt-1 truncate text-xs text-gray-400">{event.target_type}{event.target_id ? ` · ${event.target_id}` : ""}</p>
              </div>
              <time className="shrink-0 text-xs font-semibold text-gray-500">{formatDate(event.created_at)}</time>
            </article>
          ))}
        </section>
      )}
    </AdminPageShell>
  );
}
