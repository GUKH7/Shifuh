import { NextResponse } from "next/server";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase environment unavailable." }, { status: 503 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Auth settings unavailable." }, { status: 503 });
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
