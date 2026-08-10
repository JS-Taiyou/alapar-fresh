/**
 * Pure cookie-header parsing.
 *
 * Extracted from `lib/supabase.ts`. The key behavior — splitting on BOTH `;`
 * and `,` — exists because Deno Deploy's edge has been observed to strip the
 * `;` separator from the `Cookie` header, mashing all cookies into a single
 * comma-joined string. base64url JWTs use only `A-Za-z0-9-_.`, so `,` and `;`
 * are safe delimiters. This is locked down by `auth-cookies_test.ts`.
 */

/**
 * Look up a cookie value by name from a raw `Cookie` header string.
 * Returns the value, or `null` if not found.
 */
export function getCookie(
  cookieHeader: string,
  name: string,
): string | null {
  // Split on ; or , — see module docstring re: Deno Deploy edge behavior.
  const cookies = cookieHeader.split(/[;,]/).map((c) => c.trim()).filter(
    Boolean,
  );
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1);
    }
  }
  return null;
}
