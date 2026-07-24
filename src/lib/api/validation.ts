import { NextResponse } from "next/server";

export type ValidationIssue = {
  field?: string;
  message: string;
};

export class ApiValidationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      issues?: ValidationIssue[];
    } = {},
  ) {
    super(message);
    this.name = "ApiValidationError";
    this.code = options.code ?? "INVALID_REQUEST";
    this.status = options.status ?? 400;
    this.issues = options.issues ?? [];
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new ApiValidationError("O corpo da requisição deve conter JSON válido.", {
      code: "INVALID_JSON",
    });
  }

  if (!isRecord(payload)) {
    throw new ApiValidationError("O corpo da requisição deve ser um objeto JSON.", {
      code: "INVALID_BODY",
    });
  }

  return payload;
}

export function requiredString(
  payload: Record<string, unknown>,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiValidationError("Revise os dados enviados.", {
      issues: [{ field, message: "Campo obrigatório." }],
    });
  }

  const normalized = value.trim();
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 500;

  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new ApiValidationError("Revise os dados enviados.", {
      issues: [
        {
          field,
          message: `Use entre ${minLength} e ${maxLength} caracteres.`,
        },
      ],
    });
  }

  return normalized;
}

export function optionalString(
  payload: Record<string, unknown>,
  field: string,
  options: { maxLength?: number } = {},
): string | undefined {
  const value = payload[field];

  if (value === undefined || value === null || value === "") return undefined;

  if (typeof value !== "string") {
    throw new ApiValidationError("Revise os dados enviados.", {
      issues: [{ field, message: "Informe um texto válido." }],
    });
  }

  const normalized = value.trim();
  const maxLength = options.maxLength ?? 500;

  if (normalized.length > maxLength) {
    throw new ApiValidationError("Revise os dados enviados.", {
      issues: [{ field, message: `Use no máximo ${maxLength} caracteres.` }],
    });
  }

  return normalized || undefined;
}

export function validationErrorResponse(error: unknown) {
  if (!(error instanceof ApiValidationError)) return null;

  return NextResponse.json(
    {
      code: error.code,
      error: error.message,
      ...(error.issues.length > 0 ? { issues: error.issues } : {}),
    },
    { status: error.status },
  );
}
