import { NextResponse } from "next/server";

const SUPABASE_URL = "https://inpnszjwuwefitljrzrd.supabase.co";

export async function GET() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Auth settings unavailable.", status: response.status },
        { status: 503 },
      );
    }

    const settings = await response.json();
    const smsProvider = typeof settings?.sms_provider === "string" ? settings.sms_provider.trim() : "";

    return NextResponse.json(
      {
        phoneEnabled: settings?.external?.phone === true,
        phoneAutoconfirm: settings?.phone_autoconfirm === true,
        smsProvider: smsProvider || null,
        smsProviderConfigured: Boolean(smsProvider),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Auth settings unavailable." }, { status: 503 });
  }
}
