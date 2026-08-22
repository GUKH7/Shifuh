import { NextResponse } from "next/server";
import { requirePlatformPermission } from "@/lib/platform-admin";

export async function GET() {
  const guard = await requirePlatformPermission("platform.access");
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    role: guard.access.role,
    permissions: guard.access.permissions,
  });
}
