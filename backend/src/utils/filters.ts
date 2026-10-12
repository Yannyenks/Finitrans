export type CompagnieCode = 'MSC' | 'COSCO' | 'MAERSK' | 'CMA_CGM'
const COMPAGNIES: CompagnieCode[] = ['MSC', 'COSCO', 'MAERSK', 'CMA_CGM']

/** « MSC,COSCO » → filtre Prisma `{ in: [...] }` (valeurs inconnues ignorées). */
export function compagniesIn(value?: string): { in: CompagnieCode[] } | undefined {
  if (!value) return undefined
  const list = value.split(',').map(v => v.trim()).filter((v): v is CompagnieCode => COMPAGNIES.includes(v as CompagnieCode))
  return list.length ? { in: list } : undefined
}
