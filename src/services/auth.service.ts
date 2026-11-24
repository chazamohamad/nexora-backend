import { createSupabaseAuthClient } from "../config/supabase.js";

export async function loginWithSupabase(email: string, password: string) {
  const supabase = createSupabaseAuthClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    //yeeni aam nstakhdem l Authentication Service lbi Supabase
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.user || !data.session) {
    throw new Error("Supabase did not return a valid session");
  }

  return {
    user: data.user,
    session: data.session,
  };
}
