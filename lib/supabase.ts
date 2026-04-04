import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export function createServerClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseUrl(): string {
  return supabaseUrl;
}

export function getSupabaseAnonKey(): string {
  return supabaseAnonKey;
}

export interface AuthUser {
  id: string;
  email: string;
}

export async function getUserFromRequest(
  req: Request,
): Promise<AuthUser | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const accessToken = getCookie(cookieHeader, "sb-access-token");
  if (!accessToken) return null;

  const client = createServerClient();
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}

export function setAuthCookies(
  headers: Headers,
  accessToken: string,
  refreshToken: string,
): void {
  headers.append(
    "Set-Cookie",
    `sb-access-token=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
      60 * 60 * 24 * 7
    }`,
  );
  headers.append(
    "Set-Cookie",
    `sb-refresh-token=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
      60 * 60 * 24 * 30
    }`,
  );
}

export function clearAuthCookies(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    "sb-access-token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
  headers.append(
    "Set-Cookie",
    "sb-refresh-token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
}

function getCookie(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
}
