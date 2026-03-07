/**
 * Builds a Facehash avatar URL for a given display name.
 *
 * Trims leading/trailing whitespace from `name`; if the trimmed string is empty, `"user"` is used. The final value is URL-encoded and inserted as the `name` query parameter.
 *
 * @param name - The display name to generate the avatar for; whitespace-only or empty values default to `"user"`.
 * @returns The Facehash avatar URL with the encoded `name` query parameter.
 */
export function getFacehashUrl(name: string) {
  const seed = encodeURIComponent(name.trim() || "user")
  return `https://www.facehash.dev/api/avatar?name=${seed}`
}
