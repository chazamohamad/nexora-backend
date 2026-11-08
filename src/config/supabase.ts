import { createClient } from "@supabase/supabase-js";
import { resolveEnv } from "@supabase/server/core";

export function validateSupabaseConfig(): string {
  const { data, error } = resolveEnv();

  if (error || !data) {
    throw new Error(
      `Supabase configuration error: ${error?.message ?? "Unknown error"}`,
    );
  }

  const missingVariables: string[] = [];

  if (!data.publishableKeys.default) {
    missingVariables.push("SUPABASE_PUBLISHABLE_KEY");
  }

  if (!data.jwks) {
    missingVariables.push("SUPABASE_JWKS_URL");
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Supabase configuration: ${missingVariables.join(", ")}`,
    );
  }

  return data.url;
}

// Create a new Auth Client for each login request
export function createSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing Supabase URL or Publishable Key");
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
