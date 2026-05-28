import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  createIfoodMerchantInterruption,
  deleteIfoodMerchantInterruption,
  getIfoodMerchantDetails,
  getIfoodMerchantOpeningHours,
  getIfoodMerchantStatus,
  listIfoodMerchantInterruptions,
  listIfoodMerchants,
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
  const { data } = await admin
    .from("ifood_integrations")
    .select("merchant_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  return data?.merchant_id || null;
}

async function readSettled<T>(promise: PromiseSettledResult<T>) {
  if (promise.status === "fulfilled") return promise.value;
  return {
    error: promise.reason instanceof Error ? promise.reason.message : "Falha ao consultar iFood.",
  };
}

export async function POST(request: Request) {
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
    const merchantId = body.merchantId?.trim() || storedMerchantId;

    if (action === "overview") {
      const merchants = await listIfoodMerchants();

      if (!merchantId) {
        return NextResponse.json({
          ok: true,
          merchants,
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
        merchants,
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
