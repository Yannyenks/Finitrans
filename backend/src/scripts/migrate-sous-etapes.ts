/**
 * Migration idempotente des sous-étapes retirées du parcours (ex. « Traitement SGS » de la réception) :
 * les tâches encore ouvertes sont supprimées (elles bloqueraient « Mon espace » et la supervision),
 * les tâches déjà validées sont conservées pour l'historique.
 * Démarrage automatique : les tâches de l'étape en cours de chaque dossier ouvert passent « en cours »
 * avec une échéance (SLA) comptée depuis le début réel de l'étape. Exécutée au déploiement (vercel-build).
 *
 * Usage : npm run db:migrate-sous-etapes
 */
import 'dotenv/config'
import { prisma } from '../config/prisma'
import { STATUS_ORDER, SOUS_ETAPES_CONFIG, assignStage, demarrerEtape, initSousEtapes, nextStage } from '../services/workflow'

async function main() {
  // Dossiers arrêtés sur une étape retirée du parcours (ex. « Opérations Douala ») : ils passent à l'étape suivante
  const horsParcours = await prisma.dossier.findMany({
    where: { status: { notIn: STATUS_ORDER } }, select: { id: true, numero: true, status: true, site: true, compagnie: true, responsableId: true },
  })
  const slaJours = ((await prisma.parametre.findUnique({ where: { cle: 'sla_jours' } }))?.valeur ?? {}) as Record<string, number>
  for (const d of horsParcours) {
    const suivante = nextStage(d.status, d.site)
    if (!suivante) continue
    await prisma.dossierTiming.updateMany({ where: { dossierId: d.id, etape: d.status, dateFin: null }, data: { dateFin: new Date(), responsableId: d.responsableId } })
    await prisma.dossier.update({ where: { id: d.id }, data: { status: suivante } })
    await initSousEtapes(d.id)
    const responsable = (await assignStage(d, suivante)) ?? d.responsableId
    await prisma.dossier.update({ where: { id: d.id }, data: { responsableId: responsable } })
    await prisma.dossierTiming.create({ data: { dossierId: d.id, etape: suivante, dateDebut: new Date(), dureePrevueJours: slaJours[suivante] ?? 2, responsableId: responsable } })
    console.log(`✅ ${d.numero} : étape retirée « ${d.status} » → « ${suivante} »`)
  }

  const actives = Object.entries(SOUS_ETAPES_CONFIG).flatMap(([etape, defs]) => defs.map(d => ({ etape, cle: d.cle })))
  const { count } = await prisma.sousEtapeDossier.deleteMany({
    where: { statut: { not: 'valide' }, NOT: { OR: actives } },
  })
  console.log(`✅ Sous-étapes retirées : ${count} tâche(s) ouverte(s) supprimée(s)`)

  const ouverts = await prisma.dossier.findMany({ where: { status: { not: 'cloture' } }, select: { id: true, status: true } })
  const avant = await prisma.sousEtapeDossier.count({ where: { statut: 'en_cours' } })
  for (const d of ouverts) {
    await initSousEtapes(d.id)
    const timing = await prisma.dossierTiming.findFirst({ where: { dossierId: d.id, etape: d.status }, orderBy: { dateDebut: 'desc' }, select: { dateDebut: true } })
    // Enchaînement dans l'ordre : seule la tâche suivante tourne, chronomètre recalculé depuis la fin de la précédente
    await demarrerEtape(d.id, d.status, timing?.dateDebut ?? new Date(), { recalculer: true })
  }
  const apres = await prisma.sousEtapeDossier.count({ where: { statut: 'en_cours' } })
  console.log(`✅ Démarrage automatique : ${apres - avant} tâche(s) démarrée(s) sur ${ouverts.length} dossier(s) ouvert(s)`)
}

main()
  .catch(err => {
    // Ne jamais bloquer un déploiement pour cette migration
    console.error('⚠️  Migration des sous-étapes non appliquée :', err instanceof Error ? err.message : err)
  })
  .finally(() => prisma.$disconnect())
