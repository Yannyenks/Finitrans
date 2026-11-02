/**
 * Réglages régionaux proposés par défaut à l'inscription (modifiables ensuite par l'organisation).
 * Aucune procédure douanière n'est déduite du pays : seuls la devise et le fuseau horaire le sont.
 */
export interface ReglagesPays { devise: string; fuseau: string }

const ZONE_CEMAC = ['CM', 'CF', 'TD', 'GA', 'CG', 'GQ']
const ZONE_UEMOA = ['SN', 'CI', 'BJ', 'BF', 'ML', 'NE', 'TG', 'GW']

const FUSEAUX: Record<string, string> = {
  CM: 'Africa/Douala', CF: 'Africa/Bangui', TD: 'Africa/Ndjamena', GA: 'Africa/Libreville', CG: 'Africa/Brazzaville',
  GQ: 'Africa/Malabo', SN: 'Africa/Dakar', CI: 'Africa/Abidjan', BJ: 'Africa/Porto-Novo', BF: 'Africa/Ouagadougou',
  ML: 'Africa/Bamako', NE: 'Africa/Niamey', TG: 'Africa/Lome', GW: 'Africa/Bissau', NG: 'Africa/Lagos', GH: 'Africa/Accra',
  KE: 'Africa/Nairobi', MA: 'Africa/Casablanca', TN: 'Africa/Tunis', DZ: 'Africa/Algiers', EG: 'Africa/Cairo',
  ZA: 'Africa/Johannesburg', CD: 'Africa/Kinshasa', FR: 'Europe/Paris', BE: 'Europe/Brussels', CH: 'Europe/Zurich',
  GB: 'Europe/London', US: 'America/New_York', CA: 'America/Toronto', AE: 'Asia/Dubai', CN: 'Asia/Shanghai',
}

const DEVISES: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', MA: 'MAD', TN: 'TND', DZ: 'DZD', EG: 'EGP', ZA: 'ZAR', CD: 'CDF',
  FR: 'EUR', BE: 'EUR', CH: 'CHF', GB: 'GBP', US: 'USD', CA: 'CAD', AE: 'AED', CN: 'CNY',
}

export function reglagesPays(pays: string): ReglagesPays {
  const p = pays.toUpperCase()
  const devise = ZONE_CEMAC.includes(p) ? 'XAF' : ZONE_UEMOA.includes(p) ? 'XOF' : DEVISES[p] ?? 'USD'
  return { devise, fuseau: FUSEAUX[p] ?? 'UTC' }
}
