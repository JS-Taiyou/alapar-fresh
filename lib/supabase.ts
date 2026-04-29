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
  name?: string;
}

export interface AuthResult {
  user: AuthUser;
  refreshedTokens?: { accessToken: string; refreshToken: string };
}

const isDev = !Deno.env.get("DENO_DEPLOYMENT_ID");

function devLog(...args: unknown[]) {
  if (isDev) console.log("[AUTH]", ...args);
}

export async function getUserFromRequest(
  req: Request,
): Promise<AuthResult | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const accessToken = getCookie(cookieHeader, "sb-access-token");
  const refreshToken = getCookie(cookieHeader, "sb-refresh-token");
  devLog("Cookies present:", {
    access: !!accessToken,
    refresh: !!refreshToken,
  });

  if (!accessToken) return null;

  const client = createServerClient();

  devLog("Validating access token...");
  const { data, error } = await client.auth.getUser(accessToken);
  if (!error && data.user) {
    devLog("Token valid for:", data.user.email);
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        name: data.user.user_metadata?.name as string | undefined,
      },
    };
  }

  devLog("Token invalid:", error?.message);

  if (!refreshToken) return null;

  devLog("Attempting token refresh...");
  const { data: refreshData, error: refreshError } = await client.auth
    .refreshSession({ refresh_token: refreshToken });
  if (refreshError || !refreshData.session || !refreshData.user) {
    devLog("Refresh failed:", refreshError?.message);
    return null;
  }

  devLog("Refresh succeeded for:", refreshData.user.email);
  return {
    user: {
      id: refreshData.user.id,
      email: refreshData.user.email ?? "",
      name: refreshData.user.user_metadata?.name as string | undefined,
    },
    refreshedTokens: {
      accessToken: refreshData.session.access_token,
      refreshToken: refreshData.session.refresh_token,
    },
  };
}

const isProduction = !!Deno.env.get("DENO_DEPLOYMENT_ID");
const cookieSecure = isProduction ? "; Secure" : "";

export function setAuthCookies(
  headers: Headers,
  accessToken: string,
  refreshToken: string,
): void {
  headers.append(
    "Set-Cookie",
    `sb-access-token=${accessToken}; HttpOnly${cookieSecure}; SameSite=Lax; Path=/; Max-Age=${
      60 * 60 * 24 * 7
    }`,
  );
  headers.append(
    "Set-Cookie",
    `sb-refresh-token=${refreshToken}; HttpOnly${cookieSecure}; SameSite=Lax; Path=/; Max-Age=${
      60 * 60 * 24 * 30
    }`,
  );
}

export function clearAuthCookies(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `sb-access-token=; HttpOnly${cookieSecure}; SameSite=Lax; Path=/; Max-Age=0`,
  );
  headers.append(
    "Set-Cookie",
    `sb-refresh-token=; HttpOnly${cookieSecure}; SameSite=Lax; Path=/; Max-Age=0`,
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
