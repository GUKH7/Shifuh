import type { SupabaseClient } from "@supabase/supabase-js";

export async function getRestaurantByUserId(supabase: SupabaseClient<any>, userId: string) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  return {
    restaurant: data?.[0] ?? null,
    error,
  };
}

export async function getCurrentRestaurant(supabase: SupabaseClient<any>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { restaurant: null, user: null, error: userError };
  }

  const { restaurant, error } = await getRestaurantByUserId(supabase, user.id);

  return { restaurant, user, error };
}
