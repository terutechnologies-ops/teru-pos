export { cn } from "cn"

// Ruta con su consulta, omitiendo los parámetros vacíos (listas con
// filtros GET).
export function withQuery(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== ""),
  ).toString()
  return query ? `${path}?${query}` : path
}
