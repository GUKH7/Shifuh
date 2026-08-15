import type { SupabaseClient } from "@supabase/supabase-js";

export type RestaurantMembership = {
  restaurant_id: string;
  role: "owner" | "admin" | "staff";
  is_default: boolean;
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
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return {
    memberships: (data ?? []) as RestaurantMembership[],
    error,
  };
}

export async function getRestaurantsByUserId(supabase: SupabaseClient<any>, userId: string) {
  const { memberships, error: membershipError } = await getRestaurantMembershipsByUserId(supabase, userId);

  if (membershipError || memberships.length === 0) {
    return {
      restaurants: [],
      memberships,
      error: membershipError,
    };
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .in("id", memberships.map((membership) => membership.restaurant_id));

  if (error) {
    return { restaurants: [], memberships, error };
  }

  const restaurantsById = new Map((data ?? []).map((restaurant) => [restaurant.id, restaurant]));
  const restaurants = memberships
    .map((membership) => restaurantsById.get(membership.restaurant_id))
    .filter(Boolean);

  return { restaurants, memberships, error: null };
}

/**
 * Compatibility helper used across the current admin panel.
 *
 * The canonical relationship is restaurant_members. For accounts with more
 * than one store, the default membership wins; otherwise the oldest
 * membership is selected deterministically.
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
