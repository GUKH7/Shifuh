import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

const TOKEN_SCOPE = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const SAFETY_WINDOW_MS = 60_000;

type StoredToken = {
  access_token_encrypted: string;
  expires_at: string;
};

function encryptionKey() {
  const secret = process.env.IFOOD_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("IFOOD_TOKEN_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.");
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Token persistido inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function readPersistedIfoodToken() {
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("ifood_oauth_tokens")
    .select("access_token_encrypted, expires_at")
    .eq("environment", TOKEN_SCOPE)
    .maybeSingle();

  if (error || !data) return null;
  const stored = data as StoredToken;
  const expiresAt = new Date(stored.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt - SAFETY_WINDOW_MS) return null;

  return { accessToken: decrypt(stored.access_token_encrypted), expiresAt };
}

export async function persistIfoodToken(accessToken: string, expiresAt: number) {
  const admin = createAdminClient() as any;
  const { error } = await admin.from("ifood_oauth_tokens").upsert(
    {
      environment: TOKEN_SCOPE,
      access_token_encrypted: encrypt(accessToken),
      expires_at: new Date(expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "environment" },
  );
  if (error) throw new Error("Não foi possível persistir o token OAuth do iFood.");
}

export function getIfoodTokenEnvironment() {
  return TOKEN_SCOPE;
}
