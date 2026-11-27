import { isIfoodOrdersOnly, isIfoodCutoverPaused } from "@/lib/ifood/capabilities";
import { assertIfoodMerchantBinding, IfoodMerchantConflictError } from "@/lib/ifood/merchant-isolation";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  createIfoodMerchantInterruption,
  deleteIfoodMerchantInterruption,
  getIfoodMerchantDetails,
  getIfoodMerchantOpeningHours,
  getIfoodMerchantStatus,
  listIfoodMerchantInterruptions,
  setIfoodMerchantOpeningHours,
  type IfoodOpeningHourShift,
} from "@/lib/ifood/merchant";

type MerchantAction =
  | "overview"
  | "create_interruption"
  | "delete_interruption"
  | "set_opening_hours";

type MerchantPayload = {
  restaurantId?: string;
  merchantId?: string;
  action?: MerchantAction;
  interruptionId?: string;
  interruption?: {
    description?: string;
    start?: string;
    end?: string;
  };
  shifts?: IfoodOpeningHourShift[];
};

async function assertOwnedRestaurant(restaurantId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const { data: ownedRestaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, user_id")
    .eq("id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (restaurantError || !ownedRestaurant) {
    return {
      error: NextResponse.json({ error: "Loja não encontrada." }, { status: 404 }),
    };
  }

  return { user };
}

async function getStoredMerchantId(restaurantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ifood_integrations")
    .select("merchant_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível verificar o vínculo iFood.");
  return data?.merchant_id || null;
}

async function readSettled<T>(promise: PromiseSettledResult<T>) {
  if (promise.status === "fulfilled") return promise.value;
  return {
    error: promise.reason instanceof Error ? promise.reason.message : "Falha ao consultar iFood.",
  };
}

export async function POST(request: Request) {
  if (isIfoodCutoverPaused()) return NextResponse.json({ error: "Integração iFood em manutenção." }, { status: 503 });
  if (isIfoodOrdersOnly()) return NextResponse.json({ error: "Módulo não autorizado: integração exclusiva Order e Events." }, { status: 403 });
  try {
    const body = (await request.json()) as MerchantPayload;
    const restaurantId = body.restaurantId?.trim();

    if (!restaurantId) {
      return NextResponse.json({ error: "Loja inválida." }, { status: 400 });
    }

    const ownership = await assertOwnedRestaurant(restaurantId);
    if (ownership.error) return ownership.error;

    const action = body.action || "overview";
    const storedMerchantId = await getStoredMerchantId(restaurantId);
    const merchantId = body.merchantId?.trim().toLowerCase() || storedMerchantId;
    if (merchantId) {
      const admin = createAdminClient();
      if (!storedMerchantId || merchantId.toLowerCase() !== storedMerchantId.trim().toLowerCase()) {
        throw new IfoodMerchantConflictError();
      }
      await assertIfoodMerchantBinding(admin, restaurantId, merchantId);
    }

    if (action === "overview") {
      // Never enumerate all merchants of the centralized iFood application
      // to an individual tenant.
      if (!merchantId) {
        return NextResponse.json({
          ok: true,
          merchants: [],
          details: null,
          status: null,
          interruptions: null,
          openingHours: null,
        });
      }

      const [details, status, interruptions, openingHours] = await Promise.allSettled([
        getIfoodMerchantDetails(merchantId),
        getIfoodMerchantStatus(merchantId),
        listIfoodMerchantInterruptions(merchantId),
        getIfoodMerchantOpeningHours(merchantId),
      ]);

      return NextResponse.json({
        ok: true,
        merchants: details.status === "fulfilled" && details.value ? [details.value] : [],
        details: await readSettled(details),
        status: await readSettled(status),
        interruptions: await readSettled(interruptions),
        openingHours: await readSettled(openingHours),
      });
    }

    if (!merchantId) {
      return NextResponse.json(
        { error: "Informe o Merchant ID antes de executar ações Merchant." },
        { status: 400 },
      );
    }

    if (action === "create_interruption") {
      const description = body.interruption?.description?.trim();
      const start = body.interruption?.start?.trim();
      const end = body.interruption?.end?.trim();

      if (!description || !start || !end) {
        return NextResponse.json(
          { error: "Informe descrição, início e fim da pausa." },
          { status: 400 },
        );
      }

      const interruption = await createIfoodMerchantInterruption(merchantId, {
        description,
        start,
        end,
      });

      return NextResponse.json({ ok: true, interruption });
    }

    if (action === "delete_interruption") {
      const interruptionId = body.interruptionId?.trim();
      if (!interruptionId) {
        return NextResponse.json({ error: "Informe o ID da pausa." }, { status: 400 });
      }

      await deleteIfoodMerchantInterruption(merchantId, interruptionId);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_opening_hours") {
      if (!Array.isArray(body.shifts)) {
        return NextResponse.json({ error: "Informe os turnos de funcionamento." }, { status: 400 });
      }

      const openingHours = await setIfoodMerchantOpeningHours(merchantId, body.shifts);
      return NextResponse.json({ ok: true, openingHours });
    }

    return NextResponse.json({ error: "Ação Merchant inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof IfoodMerchantConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Erro na integração Merchant iFood:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível executar a operação Merchant no iFood.",
      },
      { status: 500 },
    );
  }
}
