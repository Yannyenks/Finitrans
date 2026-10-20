/**
 * Migration idempotente des sous-étapes retirées du parcours (ex. « Traitement SGS » de la réception) :
 * les tâches encore ouvertes sont supprimées (elles bloqueraient « Mon espace » et la supervision),
 * les tâches déjà validées sont conservées pour l'historique. Exécutée au déploiement (vercel-build).
 *
 * Usage : npm run db:migrate-sous-etapes
 */
import 'dotenv/config'
import { prisma } from '../config/prisma'
import { SOUS_ETAPES_CONFIG } from '../services/workflow'

async function main() {
  const actives = Object.entries(SOUS_ETAPES_CONFIG).flatMap(([etape, defs]) => defs.map(d => ({ etape, cle: d.cle })))
  const { count } = await prisma.sousEtapeDossier.deleteMany({
    where: { statut: { not: 'valide' }, NOT: { OR: actives } },
  })
  console.log(`✅ Sous-étapes retirées : ${count} tâche(s) ouverte(s) supprimée(s)`)
}

main()
  .catch(err => {
    // Ne jamais bloquer un déploiement pour cette migration
    console.error('⚠️  Migration des sous-étapes non appliquée :', err instanceof Error ? err.message : err)
  })
  .finally(() => prisma.$disconnect())
