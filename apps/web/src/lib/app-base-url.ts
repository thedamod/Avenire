/**
 * Remove trailing slash characters from a URL-like string.
 *
 * @param value - The input string to normalize
 * @returns The input string with any trailing `/` characters removed
 */
function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Determine the application's base URL from environment configuration or an incoming request.
 *
 * @param request - Optional Request whose URL origin will be used when no environment configuration is present.
 * @returns The app base URL with any trailing slashes removed.
 * @throws Error with message "App base URL is not configured. Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL." when neither environment variables nor a request are available.
 */
export function resolveAppBaseUrl(request?: Request): string {
  const configured =
    process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return normalizeUrl(configured);
  }

  if (request) {
    return normalizeUrl(new URL(request.url).origin);
  }

  throw new Error(
    "App base URL is not configured. Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL.",
  );
}
