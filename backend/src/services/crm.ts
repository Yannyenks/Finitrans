/**
 * CRM : chaque dossier est rattaché à une fiche client, retrouvée par son nom normalisé
 * (« Sté Alpha S.A. » et « STE ALPHA SA » désignent le même client).
 */
import { prisma } from '../config/prisma'

export function cleClient(nom: string): string {
  return nom
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .slice(0, 255)
}

/** Fiche client correspondant au nom (créée si elle n'existe pas encore). */
export async function clientParNom(nom: string, createdById: string) {
  const nomPropre = nom.trim().replace(/\s+/g, ' ').slice(0, 255)
  const cle = cleClient(nomPropre)
  if (!cle) return null
  return prisma.client.upsert({
    where:  { cleNom: cle },
    update: {},
    create: { nom: nomPropre, cleNom: cle, createdById },
  })
}

/** Rattache un dossier à la fiche client de son nom (sans jamais bloquer le workflow). */
export async function rattacherClient(dossierId: string, nom: string, createdById: string) {
  try {
    const client = await clientParNom(nom, createdById)
    if (client) await prisma.dossier.update({ where: { id: dossierId }, data: { clientId: client.id } })
    return client
  } catch {
    return null
  }
}
