// N'accepte qu'un chemin interne, pour éviter les redirections ouvertes
// (ex. ?next=https://evil.com ou ?next=//evil.com).
export function safeNextPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  return value;
}
