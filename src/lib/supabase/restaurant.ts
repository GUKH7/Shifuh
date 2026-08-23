import type { SupabaseClient } from "@supabase/supabase-js";

export type RestaurantMembership = {
  restaurant_id: string;
  role: "owner";
  is_default: true;
  created_at: string;
};

type RestaurantContextRow = RestaurantMembership & {
  restaurant: any | any[] | null;
};

function normalizeRestaurantRelation(value: RestaurantContextRow["restaurant"]) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function getRestaurantContextByUserId(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role, is_default, created_at, restaurant:restaurants(*)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const row = (data ?? null) as RestaurantContextRow | null;
  const membership = row
    ? {
        restaurant_id: row.restaurant_id,
        role: row.role,
        is_default: row.is_default,
        created_at: row.created_at,
      }
    : null;

  return {
    restaurant: row ? normalizeRestaurantRelation(row.restaurant) : null,
    membership,
    error,
  };
}

export async function getRestaurantMembershipsByUserId(
  supabase: SupabaseClient<any>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role, is_default, created_at")
    .eq("user_id", userId)
    .limit(1);

  return {
    memberships: (data ?? []) as RestaurantMembership[],
    error,
  };
}

export async function getRestaurantsByUserId(supabase: SupabaseClient<any>, userId: string) {
  const { restaurant, membership, error } = await getRestaurantContextByUserId(supabase, userId);

  return {
    restaurants: restaurant ? [restaurant] : [],
    memberships: membership ? [membership] : [],
    error,
  };
}

/**
 * Resolves the single restaurant owned by the authenticated account.
 *
 * The database currently enforces a strict 1 user <-> 1 restaurant relation.
 * restaurant_members remains the canonical authorization mapping used by RLS.
 */
export async function getRestaurantByUserId(supabase: SupabaseClient<any>, userId: string) {
  return getRestaurantContextByUserId(supabase, userId);
}

export async function getCurrentRestaurant(supabase: SupabaseClient<any>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { restaurant: null, membership: null, user: null, error: userError };
  }

  const { restaurant, membership, error } = await getRestaurantByUserId(supabase, user.id);

  return { restaurant, membership, user, error };
}
