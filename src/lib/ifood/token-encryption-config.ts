export const IFOOD_TOKEN_ENCRYPTION_KEY_MIN_LENGTH = 32;

export function isIfoodTokenEncryptionKeyConfigured(
  value = process.env.IFOOD_TOKEN_ENCRYPTION_KEY,
) {
  return (value?.trim().length || 0) >= IFOOD_TOKEN_ENCRYPTION_KEY_MIN_LENGTH;
}

export function requireIfoodTokenEncryptionKey(
  value = process.env.IFOOD_TOKEN_ENCRYPTION_KEY,
) {
  const secret = value?.trim() || "";

  if (!isIfoodTokenEncryptionKeyConfigured(secret)) {
    throw new Error(
      `IFOOD_TOKEN_ENCRYPTION_KEY deve ter pelo menos ${IFOOD_TOKEN_ENCRYPTION_KEY_MIN_LENGTH} caracteres.`,
    );
  }

  return secret;
}
