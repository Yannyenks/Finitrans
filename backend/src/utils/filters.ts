/** « MSC,HAPAG_LLOYD » → filtre Prisma `{ in: [...] }` (liste de compagnies ouverte). */
export function compagniesIn(value?: string): { in: string[] } | undefined {
  if (!value) return undefined
  const list = value.split(',').map(v => v.trim()).filter(v => v.length >= 2 && v.length <= 80)
  return list.length ? { in: list } : undefined
}
