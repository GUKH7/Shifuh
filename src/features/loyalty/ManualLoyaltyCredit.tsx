"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Coins, Search, ShieldAlert, UserRound } from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { calculateManualPoints, validateManualCredit, type CreditMode, type EarningConfig } from "./manual-credit";
import {
  customerInitials, customerLabel, formatCustomerPhone, rememberManualCreditCustomer,
  recentManualCreditCustomers, searchManualCreditCustomers, type ManualCreditCustomer,
} from "./manual-credit-customers";

type Customer = ManualCreditCustomer;
type Account = { customer_id: string; points_balance: number };
const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

function recentStorageKey(restaurantId: string) {
  return "shifuh:manual-credit-recent:" + restaurantId;
}

function CustomerOption({customer, balance, selected, disabled, onSelect}: {
  customer: Customer; balance: number; selected: boolean; disabled: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-customer-id={customer.id}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={"flex min-h-[76px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:opacity-60 sm:p-4 " +
        (selected ? "border-orange-500 bg-orange-50 shadow-sm" : "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/40")}
    >
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">
        {customerInitials(customer)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-gray-950 sm:text-base">{customerLabel(customer)}</span>
        <span className="block truncate text-xs text-gray-600">{formatCustomerPhone(customer.phone)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {selected ? <span className="flex items-center gap-1 text-xs font-bold text-orange-700"><Check size={13}/> Selecionado</span> : null}
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold tabular-nums text-gray-700">{balance} pts</span>
      </span>
    </button>
  );
}

export default function ManualLoyaltyCredit() {
  const router = useRouter();
  const client = useMemo(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), []);
  const [restaurantId, setRestaurantId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Account[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState<EarningConfig | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lastCreditAt, setLastCreditAt] = useState<string | null>(null);
  const [mode, setMode] = useState<CreditMode>("spend");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Compra presencial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creditError, setCreditError] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { restaurant, user, error: membershipError } = await getCurrentRestaurant(client);
      if (!user) { router.replace("/admin/login"); return; }
      if (membershipError || !restaurant) throw new Error("Não foi possível confirmar o restaurante.");

      // All reads stay scoped to the current restaurant. Paginate instead of silently
      // dropping customers beyond the old 200-row limit.
      const loadAll = async <T,>(table: "customers" | "loyalty_accounts", columns: string): Promise<T[]> => {
        const result: T[] = [];
        for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
          const response = await client.from(table).select(columns)
            .eq("restaurant_id", restaurant.id)
            .order("created_at", {ascending:false})
            .range(offset, offset + PAGE_SIZE - 1);
          if (response.error) throw new Error("Não foi possível consultar a lista de clientes e pontos.");
          const page = (response.data ?? []) as unknown as T[];
          if (offset === MAX_ROWS && page.length) {
            throw new Error("A lista ultrapassou o limite de consulta. É necessário ampliar a paginação antes de creditar.");
          }
          result.push(...page);
          if (page.length < PAGE_SIZE) return result;
        }
        return result;
      };
      const [customerRows, balanceRows, programResult] = await Promise.all([
        loadAll<Customer>("customers", "id,name,phone"),
        loadAll<Account>("loyalty_accounts", "customer_id,points_balance"),
        client.from("loyalty_programs").select("status,earning_mode,spend_amount,points_per_spend,points_per_order,minimum_order_amount")
          .eq("restaurant_id", restaurant.id).maybeSingle(),
      ]);
      if (programResult.error) throw new Error("Não foi possível consultar o programa de fidelidade.");
      setRestaurantId(restaurant.id);
      setCustomers(customerRows);
      setBalances(balanceRows);
      setProgram(programResult.data as EarningConfig | null);
      try {
        const stored = JSON.parse(localStorage.getItem(recentStorageKey(restaurant.id)) ?? "[]");
        setRecentIds(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string").slice(0, 5) : []);
      } catch { setRecentIds([]); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar clientes.");
    } finally { setLoading(false); }
  }, [client, router]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!restaurantId || !customerId) { setLastCreditAt(null); return; }
    let active = true;
    setLastCreditAt(null);
    void client.from("loyalty_point_transactions").select("created_at")
      .eq("restaurant_id", restaurantId).eq("customer_id", customerId)
      .eq("transaction_type", "adjustment_credit").like("idempotency_key", "manual:%")
      .order("created_at", {ascending:false}).limit(1).maybeSingle()
      .then(({data, error}) => {
        if (active && !error) setLastCreditAt(data?.created_at ?? null);
      });
    return () => { active = false; };
  }, [client, restaurantId, customerId, success]);

  const balanceById = useMemo(() => new Map(balances.map(item => [item.customer_id, item.points_balance])), [balances]);
  const selected = customers.find(c => c.id === customerId);
  const balance = balanceById.get(customerId) ?? 0;
  const recent = recentManualCreditCustomers(customers, recentIds);
  const suggested = search.trim()
    ? searchManualCreditCustomers(customers, search, 12)
    : customers.filter(customer => !recentIds.includes(customer.id)).slice(0, 8);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    setConfirmation(false);
    setRequestId("");
    setSuccess("");
  };

  let points = 0; let validationError = "";
  try {
    if (!program) throw new Error("Configure o programa de fidelidade.");
    points = calculateManualPoints(mode, amount, program);
    if (!customerId) throw new Error("Selecione um cliente.");
    if (confirmation) validateManualCredit({customerId, requestId, reason, points});
    else if (reason.trim().length < 5) throw new Error("Informe o motivo do crédito.");
  } catch (cause) { validationError = cause instanceof Error ? cause.message : "Dados inválidos."; }

  const submitCredit = async () => {
    if (!confirmation || !program || !customerId || saving) return;
    try {
      const verified = validateManualCredit({customerId, requestId, reason, points});
      setSaving(true); setCreditError(""); setSuccess("");
      const {data, error: rpcError} = await client.rpc("credit_loyalty_points_manual", {
        p_customer_id: verified.customerId,
        p_request_id: verified.requestId,
        p_mode: mode,
        p_amount: Number(amount.replace(",", ".")),
        p_reason: verified.reason,
      });
      if (rpcError) throw rpcError;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error("O banco não confirmou o crédito.");
      const recentIdsUpdated = rememberManualCreditCustomer(recentIds, customerId);
      setRecentIds(recentIdsUpdated);
      if (restaurantId) {
        try { localStorage.setItem(recentStorageKey(restaurantId), JSON.stringify(recentIdsUpdated)); } catch { /* storage optional */ }
      }
      setSuccess(result.was_duplicate ? "Este crédito já havia sido registrado. Nenhum ponto duplicado." : "Crédito confirmado e registrado no extrato.");
      setConfirmation(false); setRequestId(""); setAmount("");
      await reload();
    } catch (cause) {
      // An ambiguous result must retry with the SAME request id; do not unlock edits.
      setCreditError(cause instanceof Error ? cause.message : "Não foi possível confirmar o crédito.");
    } finally { setSaving(false); }
  };

  const card = (customer: Customer) => (
    <CustomerOption key={customer.id} customer={customer} balance={balanceById.get(customer.id) ?? 0}
      selected={customer.id === customerId} disabled={saving || !!creditError}
      onSelect={() => selectCustomer(customer.id)} />
  );

  return (
    <section className="surface-card space-y-5 rounded-3xl p-4 sm:p-6" aria-labelledby="manual-credit-title">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-orange-50 p-3 text-[var(--brand)]"><Coins size={21}/></span>
        <div>
          <h2 id="manual-credit-title" className="text-xl font-black text-gray-950">Crédito por compra presencial</h2>
          <p className="mt-1 text-sm text-gray-600">Encontre o cliente, informe a compra e credite pontos em poucos passos.</p>
        </div>
      </div>
      {success ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p> : null}
      {loading ? <p role="status" className="text-sm text-gray-600">Carregando clientes...</p> :
        error ? <div role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={() => void reload()} className="ml-3 underline">Tentar novamente</button></div> : <>
          <div className="space-y-3">
            <label htmlFor="manual-customer-search" className="block text-sm font-black text-gray-900">Buscar cliente</label>
            <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
              <Search size={19} className="shrink-0 text-gray-500" aria-hidden="true"/>
              <input id="manual-customer-search" type="search" value={search} placeholder="Nome ou telefone..."
                disabled={saving || !!creditError} onChange={event => setSearch(event.target.value)}
                className="min-h-12 w-full min-w-0 bg-transparent text-base text-gray-950 outline-none placeholder:text-gray-400"/>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-gray-500">
              <span>Toque em um cliente para selecionar</span>
              <span>{customers.length} clientes cadastrados</span>
            </div>
            {customers.length === 0 ? <p role="status" className="rounded-2xl bg-gray-50 p-4 text-sm">Ainda não há clientes cadastrados nesta loja.</p> : null}
            {!search.trim() && recent.length > 0 ? (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-500"><Clock3 size={15}/> Recentes neste dispositivo</h3>
                <div className="grid gap-2 md:grid-cols-2">{recent.map(card)}</div>
              </div>
            ) : null}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">{search.trim() ? "Resultados da busca" : "Outros clientes"}</h3>
              {suggested.length === 0 ? (
                <p role="status" className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">Nenhum cliente encontrado. Confira o nome ou telefone.</p>
              ) : <div className="grid gap-2 md:grid-cols-2">{suggested.map(card)}</div>}
              {search.trim() && suggested.length === 12 ? <p className="text-xs text-gray-500">Mostrando até 12 resultados. Digite mais caracteres para refinar.</p> : null}
            </div>
          </div>

          {selected ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4" aria-live="polite">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-700"><UserRound size={15}/> Cliente selecionado</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-lg font-black text-gray-950">{customerLabel(selected)}</p>
                  <p className="text-sm text-gray-600">{formatCustomerPhone(selected.phone)}</p>
                  {lastCreditAt ? <p className="mt-1 text-xs text-gray-500">Último crédito presencial: {new Date(lastCreditAt).toLocaleDateString("pt-BR")}</p> : null}
                </div>
                <div className="rounded-xl bg-white px-4 py-2 text-right shadow-sm">
                  <p className="text-xs text-gray-500">Saldo atual</p>
                  <p className="text-2xl font-black tabular-nums text-gray-950">{balance} <span className="text-xs font-bold">pts</span></p>
                </div>
              </div>
            </div>
          ) : null}

          <div role="group" aria-label="Forma de calcular os pontos" className="flex flex-col gap-2 sm:flex-row">
            <button type="button" aria-pressed={mode === "spend"} disabled={saving || !!creditError}
              onClick={() => {setMode("spend"); setConfirmation(false);}}
              className={"min-h-11 flex-1 rounded-xl border px-4 text-sm font-bold " + (mode === "spend" ? "border-orange-500 bg-orange-50 text-orange-900" : "border-gray-200 text-gray-800")}>Valor da compra</button>
            <button type="button" aria-pressed={mode === "points"} disabled={saving || !!creditError}
              onClick={() => {setMode("points"); setConfirmation(false);}}
              className={"min-h-11 flex-1 rounded-xl border px-4 text-sm font-bold " + (mode === "points" ? "border-orange-500 bg-orange-50 text-orange-900" : "border-gray-200 text-gray-800")}>Pontos diretos</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-bold text-gray-700">
              <span className="block">{mode === "spend" ? "Valor da compra (R$)" : "Quantidade de pontos"}</span>
              <input inputMode="decimal" value={amount} disabled={saving || !!creditError}
                onChange={event => {setAmount(event.target.value); setConfirmation(false);}}
                placeholder={mode === "spend" ? "35,00" : "35"}
                className="min-h-12 w-full rounded-2xl border border-[var(--line)] px-3 text-base"/>
            </label>
            <label className="space-y-1 text-sm font-bold text-gray-700">
              <span className="block">Motivo</span>
              <input value={reason} maxLength={200} disabled={saving || !!creditError}
                onChange={event => {setReason(event.target.value); setConfirmation(false);}}
                className="min-h-12 w-full rounded-2xl border border-[var(--line)] px-3 text-base"/>
            </label>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4" aria-live="polite">
            <p className="text-xs font-bold text-gray-500">Pontos a creditar</p>
            <p className="text-2xl font-black tabular-nums text-gray-950">+{points} pontos</p>
            {validationError && amount ? <p className="mt-2 text-xs text-amber-800">{validationError}</p> : null}
          </div>
          {creditError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{creditError} Tente novamente com o mesmo identificador de operação, sem criar outro lançamento.</p> : null}
          {!confirmation ? (
            <button type="button" disabled={!!validationError || !selected}
              onClick={() => {setRequestId(crypto.randomUUID()); setConfirmation(true);}}
              className="min-h-12 w-full rounded-2xl bg-[var(--brand)] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Revisar crédito</button>
          ) : (
            <div role="status" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-gray-950">Confirmar para {selected ? customerLabel(selected) : "cliente não selecionado"}</p>
              <p className="text-sm text-gray-700">{selected ? formatCustomerPhone(selected.phone) : ""} receberá <strong>{points} pontos</strong>. Motivo: {reason.trim()}.</p>
              <p className="text-xs text-amber-900">Verifique o cliente antes de confirmar. Esta ação altera o saldo e registra o operador.</p>
              <button type="button" disabled={saving || !!validationError} onClick={() => void submitCredit()}
                className="min-h-12 w-full rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-50">
                {saving ? "Registrando..." : "Confirmar crédito"}
              </button>
              <button type="button" disabled={saving || !!creditError} onClick={() => setConfirmation(false)}
                className="min-h-11 w-full rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold disabled:opacity-50">Voltar e editar</button>
            </div>
          )}
        </>}
      <p className="flex items-start gap-2 text-xs leading-5 text-gray-500"><ShieldAlert size={16} className="shrink-0"/>
        Para preservar a segurança, uma falha de comunicação mantém a operação bloqueada para edição até uma repetição com o mesmo identificador.</p>
    </section>
  );
}
