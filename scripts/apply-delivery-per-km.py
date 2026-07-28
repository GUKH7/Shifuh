from pathlib import Path


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if before not in source:
        raise SystemExit(f"missing replacement target: {label}")
    return source.replace(before, after, 1)


settings_path = Path("src/app/admin/(painel)/settings/page.tsx")
settings = settings_path.read_text(encoding="utf-8")

settings = replace_once(
    settings,
    '  const [tiers, setTiers] = useState<DeliveryTier[]>([]);',
    '''  const [tiers, setTiers] = useState<DeliveryTier[]>([]);
  const [deliveryPricingMode, setDeliveryPricingMode] = useState<"tiers" | "per_km">("tiers");
  const [deliveryPricePerKm, setDeliveryPricePerKm] = useState(2);
  const [deliveryMaxDistance, setDeliveryMaxDistance] = useState(10);
  const [deliveryPerKmTime, setDeliveryPerKmTime] = useState(40);''',
    "delivery pricing state",
)

settings = replace_once(
    settings,
    '''        if (data.delivery_tiers) setTiers(data.delivery_tiers);
        else setTiers([{ distance: 1, time: 20, price: 0 }]);''',
    '''        const savedDeliveryRules = Array.isArray(data.delivery_tiers) ? data.delivery_tiers : [];
        const perKmRule = savedDeliveryRules.find(
          (rule: Record<string, unknown>) => rule?.mode === "per_km",
        ) as Record<string, unknown> | undefined;

        if (perKmRule) {
          setDeliveryPricingMode("per_km");
          setDeliveryPricePerKm(Math.max(0, Number(perKmRule.price_per_km) || 0));
          setDeliveryMaxDistance(Math.max(0.1, Number(perKmRule.max_distance) || 10));
          setDeliveryPerKmTime(Math.max(0, Number(perKmRule.time) || 40));
          setTiers([]);
        } else {
          setDeliveryPricingMode("tiers");
          setTiers(
            savedDeliveryRules.length > 0
              ? (savedDeliveryRules as DeliveryTier[])
              : [{ distance: 1, time: 20, price: 0 }],
          );
        }''',
    "load delivery pricing",
)

settings = replace_once(
    settings,
    '''    const sortedTiers = [...tiers].sort((a, b) => a.distance - b.distance);
    const normalizedSchedule = normalizeWorkHours(schedule);''',
    '''    const sortedTiers = [...tiers].sort((a, b) => a.distance - b.distance);
    const deliveryRules = deliveryPricingMode === "per_km"
      ? [{
          mode: "per_km",
          price_per_km: Math.max(0, deliveryPricePerKm),
          max_distance: Math.max(0.1, deliveryMaxDistance),
          time: Math.max(0, deliveryPerKmTime),
        }]
      : sortedTiers;
    const normalizedSchedule = normalizeWorkHours(schedule);''',
    "save delivery pricing rules",
)

settings = replace_once(
    settings,
    '        delivery_tiers: sortedTiers,',
    '        delivery_tiers: deliveryRules,',
    "persist delivery rules",
)

old_delivery_ui = '''          <div className="mt-6 space-y-3">
            {tiers.map((tier, index) => (
              <div key={index} className="grid items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Até quantos km
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={tier.distance}
                      onChange={(e) => updateTier(index, "distance", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 3"
                    />
                    <span className="text-sm font-bold text-gray-400">km</span>
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Tempo estimado
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <input
                      type="number"
                      min="0"
                      value={tier.time}
                      onChange={(e) => updateTier(index, "time", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 30"
                    />
                    <span className="text-sm font-bold text-gray-400">min</span>
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                    Valor da entrega
                  </span>
                  <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                    <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.price}
                      onChange={(e) => updateTier(index, "price", e.target.value)}
                      className="w-full py-2 text-sm outline-none"
                      placeholder="Ex: 5,00"
                    />
                  </div>
                </label>

                <button onClick={() => removeTier(index)} className="rounded-xl p-3 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button onClick={addTier} className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-600">
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Adicionar faixa
              </span>
            </button>
          </div>'''

new_delivery_ui = '''          <div className="mt-6 space-y-4">
            <div className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[#fcfaf7] p-1 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeliveryPricingMode("tiers")}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                  deliveryPricingMode === "tiers"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Faixas de distância
              </button>
              <button
                type="button"
                onClick={() => setDeliveryPricingMode("per_km")}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                  deliveryPricingMode === "per_km"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Valor por km
              </button>
            </div>

            {deliveryPricingMode === "per_km" ? (
              <div className="rounded-[22px] border border-orange-100 bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-gray-950">Cobrança automática por distância</p>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                      O sistema cobra cada quilômetro iniciado. Por exemplo, uma entrega de 2,4 km será cobrada como 3 km.
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-[var(--brand)]">
                    Até {deliveryMaxDistance.toLocaleString("pt-BR")} km
                  </span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                      Valor por km
                    </span>
                    <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                      <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deliveryPricePerKm}
                        onChange={(event) => setDeliveryPricePerKm(Math.max(0, Number(event.target.value) || 0))}
                        className="w-full py-2 text-sm outline-none"
                        placeholder="Ex: 2,00"
                      />
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                      Limite de entrega
                    </span>
                    <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={deliveryMaxDistance}
                        onChange={(event) => setDeliveryMaxDistance(Math.max(0.1, Number(event.target.value) || 0.1))}
                        className="w-full py-2 text-sm outline-none"
                        placeholder="Ex: 10"
                      />
                      <span className="text-sm font-bold text-gray-400">km</span>
                    </div>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                      Tempo estimado
                    </span>
                    <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={deliveryPerKmTime}
                        onChange={(event) => setDeliveryPerKmTime(Math.max(0, Number(event.target.value) || 0))}
                        className="w-full py-2 text-sm outline-none"
                        placeholder="Ex: 40"
                      />
                      <span className="text-sm font-bold text-gray-400">min</span>
                    </div>
                  </label>
                </div>

                <div className="mt-4 rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm text-gray-600">
                  <span className="font-bold text-gray-900">Exemplo:</span>{" "}
                  2,4 km × {deliveryPricePerKm.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/km ={" "}
                  {(Math.ceil(2.4) * deliveryPricePerKm).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.
                  Distâncias acima de {deliveryMaxDistance.toLocaleString("pt-BR")} km serão bloqueadas no checkout.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {tiers.map((tier, index) => (
                  <div key={index} className="grid items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <label className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                        Até quantos km
                      </span>
                      <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={tier.distance}
                          onChange={(e) => updateTier(index, "distance", e.target.value)}
                          className="w-full py-2 text-sm outline-none"
                          placeholder="Ex: 3"
                        />
                        <span className="text-sm font-bold text-gray-400">km</span>
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                        Tempo estimado
                      </span>
                      <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                        <input
                          type="number"
                          min="0"
                          value={tier.time}
                          onChange={(e) => updateTier(index, "time", e.target.value)}
                          className="w-full py-2 text-sm outline-none"
                          placeholder="Ex: 30"
                        />
                        <span className="text-sm font-bold text-gray-400">min</span>
                      </div>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                        Valor da entrega
                      </span>
                      <div className="flex items-center rounded-xl border border-[var(--line)] bg-white px-3 focus-within:border-[var(--brand)]">
                        <span className="mr-2 text-sm font-bold text-gray-400">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={tier.price}
                          onChange={(e) => updateTier(index, "price", e.target.value)}
                          className="w-full py-2 text-sm outline-none"
                          placeholder="Ex: 5,00"
                        />
                      </div>
                    </label>

                    <button onClick={() => removeTier(index)} className="rounded-xl p-3 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button onClick={addTier} className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    <Plus size={16} />
                    Adicionar faixa
                  </span>
                </button>
              </div>
            )}
          </div>'''

settings = replace_once(settings, old_delivery_ui, new_delivery_ui, "delivery pricing UI")
settings_path.write_text(settings, encoding="utf-8")

geo_path = Path("src/lib/geo.ts")
geo = geo_path.read_text(encoding="utf-8")
old_fee_function = '''export function calculateDeliveryFee(distance: number, tiers: any[]) {
  if (!tiers || tiers.length === 0) return { price: 0, time: 0, valid: true };

  const sortedTiers = [...tiers].sort((a, b) => Number(a.distance) - Number(b.distance));
  const foundTier = sortedTiers.find((tier) => distance <= Number(tier.distance));

  if (foundTier) {
    return {
      price: Number(foundTier.price) || 0,
      time: Number(foundTier.time) || 0,
      valid: true,
    };
  }

  return { price: 0, time: 0, valid: false };
}'''
new_fee_function = '''export function calculateDeliveryFee(distance: number, tiers: any[]) {
  if (!tiers || tiers.length === 0) return { price: 0, time: 0, valid: true };

  const perKmRule = tiers.find((tier) => tier?.mode === "per_km");
  if (perKmRule) {
    const maxDistance = Number(perKmRule.max_distance);
    const pricePerKm = Math.max(0, Number(perKmRule.price_per_km) || 0);
    const billedDistance = distance > 0 ? Math.max(1, Math.ceil(distance)) : 0;

    if (!Number.isFinite(maxDistance) || maxDistance <= 0 || distance > maxDistance) {
      return { price: 0, time: 0, valid: false, billedDistance };
    }

    return {
      price: Math.round(billedDistance * pricePerKm * 100) / 100,
      time: Math.max(0, Number(perKmRule.time) || 0),
      valid: true,
      billedDistance,
    };
  }

  const sortedTiers = [...tiers].sort((a, b) => Number(a.distance) - Number(b.distance));
  const foundTier = sortedTiers.find((tier) => distance <= Number(tier.distance));

  if (foundTier) {
    return {
      price: Number(foundTier.price) || 0,
      time: Number(foundTier.time) || 0,
      valid: true,
    };
  }

  return { price: 0, time: 0, valid: false };
}'''
geo = replace_once(geo, old_fee_function, new_fee_function, "per km fee calculation")
geo_path.write_text(geo, encoding="utf-8")

test_path = Path("tests/delivery-per-km.test.js")
test_path.write_text(
    '''const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const settings = fs.readFileSync("src/app/admin/(painel)/settings/page.tsx", "utf8");
const geo = fs.readFileSync("src/lib/geo.ts", "utf8");

test("configurações oferecem cobrança por km e limite de entrega", () => {
  assert.match(settings, /deliveryPricingMode/);
  assert.match(settings, /Valor por km/);
  assert.match(settings, /Limite de entrega/);
  assert.match(settings, /price_per_km/);
  assert.match(settings, /max_distance/);
  assert.match(settings, /Cada quilômetro iniciado|cada quilômetro iniciado/i);
});

test("cálculo por km arredonda a distância e bloqueia acima do limite", () => {
  assert.match(geo, /tier\?\.mode === "per_km"/);
  assert.match(geo, /Math\.ceil\(distance\)/);
  assert.match(geo, /distance > maxDistance/);
  assert.match(geo, /billedDistance \* pricePerKm/);
  assert.match(geo, /Math\.round\(billedDistance \* pricePerKm \* 100\) \/ 100/);
});

test("modo por faixas continua disponível", () => {
  assert.match(settings, /Faixas de distância/);
  assert.match(geo, /sortedTiers\.find\(\(tier\) => distance <= Number\(tier\.distance\)\)/);
});
''',
    encoding="utf-8",
)
