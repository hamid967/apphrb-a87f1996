import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Typed Supabase client used inside server functions (RLS as the caller). */
export type ServerSupabase = SupabaseClient<Database>;

/** Shape of `context` provided by the `requireSupabaseAuth` middleware. */
export interface AuthContext {
  supabase: ServerSupabase;
  userId: string;
  claims: Record<string, unknown>;
}
