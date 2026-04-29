import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentRestaurant(supabase: SupabaseClient<any>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { restaurant: null, user: null, error: userError };
  }

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return { restaurant, user, error };
}
