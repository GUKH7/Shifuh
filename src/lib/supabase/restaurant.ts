import type { SupabaseClient } from "@supabase/supabase-js";

export type RestaurantMembership = {
  restaurant_id: string;
  role: "owner";
  is_default: true;
  created_at: string;
};

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
  const { memberships, error: membershipError } = await getRestaurantMembershipsByUserId(supabase, userId);
  const membership = memberships[0] ?? null;

  if (membershipError || !membership) {
    return {
      restaurants: [],
      memberships,
      error: membershipError,
    };
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", membership.restaurant_id)
    .maybeSingle();

  return {
    restaurants: data ? [data] : [],
    memberships,
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
  const { memberships, error: membershipError } = await getRestaurantMembershipsByUserId(supabase, userId);
  const membership = memberships[0] ?? null;

  if (membershipError || !membership) {
    return {
      restaurant: null,
      membership,
      error: membershipError,
    };
  }

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", membership.restaurant_id)
    .maybeSingle();

  return { restaurant: restaurant ?? null, membership, error };
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
