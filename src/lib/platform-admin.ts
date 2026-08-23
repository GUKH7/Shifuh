import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const PLATFORM_ROLES = ["owner", "admin", "support", "viewer"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_PERMISSIONS = [
  "platform.access",
  "restaurants.read",
  "restaurants.update",
  "restaurants.archive",
  "restaurants.restore",
  "members.read",
  "members.manage",
  "audit.read",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  owner: PLATFORM_PERMISSIONS,
  admin: [
    "platform.access",
    "restaurants.read",
    "restaurants.update",
    "restaurants.archive",
    "restaurants.restore",
    "members.read",
    "audit.read",
  ],
  support: ["platform.access", "restaurants.read", "restaurants.update"],
  viewer: ["platform.access", "restaurants.read"],
};

export type PlatformAccess = {
  userId: string;
  role: PlatformRole;
  permissions: PlatformPermission[];
};

type PlatformMemberRow = {
  user_id: string;
  role: PlatformRole;
  is_active: boolean;
};

type PlatformGuardSuccess = {
  ok: true;
  user: User;
  access: PlatformAccess;
  admin: SupabaseClient<any>;
};

type PlatformGuardFailure = {
  ok: false;
  response: NextResponse;
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function getPermissionsForRole(role: PlatformRole): PlatformPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: PlatformRole, permission: PlatformPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export async function getPlatformAccess(
  userId: string,
  adminClient: SupabaseClient<any> = createAdminClient() as SupabaseClient<any>,
): Promise<PlatformAccess | null> {
  const { data, error } = await adminClient
    .from("platform_members")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Unable to resolve platform access: ${error.message}`);
  if (!data) return null;

  const member = data as PlatformMemberRow;
  if (!member.is_active || !isPlatformRole(member.role)) return null;

  return {
    userId: member.user_id,
    role: member.role,
    permissions: getPermissionsForRole(member.role),
  };
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
): Promise<PlatformGuardSuccess | PlatformGuardFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const admin = createAdminClient() as SupabaseClient<any>;

  let access: PlatformAccess | null = null;
  try {
    access = await getPlatformAccess(user.id, admin);
  } catch (error) {
    console.error("Erro ao resolver RBAC da plataforma:", error);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Não foi possível validar a permissão da plataforma." },
        { status: 500 },
      ),
    };
  }

  if (!access || !roleHasPermission(access.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Acesso negado." }, { status: 403 }),
    };
  }

  return { ok: true, user, access, admin };
}

export async function writePlatformAuditLog(
  admin: SupabaseClient<any>,
  access: PlatformAccess,
  input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("platform_audit_log").insert({
    actor_user_id: access.userId,
    actor_role: access.role,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Unable to write platform audit log: ${error.message}`);
  }
}
