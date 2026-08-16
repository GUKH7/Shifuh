import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  IfoodAuthenticationError,
  validateIfoodCredentials,
} from "@/lib/ifood/catalog";
import { checkRateLimit } from "@/lib/rate-limit";
import { isIfoodTokenEncryptionKeyConfigured } from "@/lib/ifood/token-encryption-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimitResponse = await checkRateLimit(request, {
    keyPrefix: "ifood-auth-diagnostics",
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const diagnostics = await validateIfoodCredentials();
    return NextResponse.json({
      status: "connected",
      checkedAt: new Date().toISOString(),
      diagnostics,
    });
  } catch (error) {
    const safeError = error instanceof IfoodAuthenticationError
      ? { code: error.code, message: error.message, status: error.status }
      : {
          code: "unexpected_error",
          message: "Não foi possível validar a conexão oficial do iFood.",
          status: null,
        };

    return NextResponse.json(
      {
        status: "error",
        checkedAt: new Date().toISOString(),
        error: safeError,
        configuration: {
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
          clientIdConfigured: Boolean(process.env.IFOOD_CLIENT_ID?.trim()),
          clientSecretConfigured: Boolean(process.env.IFOOD_CLIENT_SECRET?.trim()),
          encryptionKeyConfigured: isIfoodTokenEncryptionKeyConfigured(),
        },
      },
      { status: safeError.code === "missing_credentials" ? 503 : 502 },
    );
  }
}
