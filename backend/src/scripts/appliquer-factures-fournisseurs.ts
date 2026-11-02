/**
 * Rattrapage idempotent : toute facture fournisseur saisie à « FF et soumission » dont le montant
 * n'a pas encore été déduit de la DI du dossier est débitée (ex. montant saisi dans les
 * « Informations de l'étape » avant la règle « débit dès la saisie »). Exécutée au déploiement (vercel-build).
 *
 * Usage : npm run db:appliquer-factures-fournisseurs
 */
import 'dotenv/config'
import { prisma } from '../config/prisma'
import { appliquerFactureFournisseur } from '../services/di'

async function main() {
  const taches = await prisma.sousEtapeDossier.findMany({
    where: { cle: 'ff_soumission' },
    include: { dossier: { select: { numero: true, diId: true, responsableId: true } } },
  })
  let appliquees = 0
  for (const t of taches) {
    const meta = (t.metadata ?? {}) as Record<string, unknown>
    if (meta.ff_montant_facture === undefined || meta.ff_montant_facture === '' || meta.ff_montant_debite !== undefined) continue
    const userId = t.completedById ?? t.responsableId ?? t.dossier.responsableId
    if (!userId || !t.dossier.diId) {
      console.log(`⏭️  ${t.dossier.numero} : facture fournisseur non débitée (${!t.dossier.diId ? 'aucune DI liée' : 'aucun auteur'})`)
      continue
    }
    try {
      const r = await appliquerFactureFournisseur(t.id, userId)
      if (r) {
        appliquees++
        console.log(`✅ ${t.dossier.numero} : ${Number(r.ff_montant_debite).toLocaleString('fr-FR')} FCFA débités sur la DI (solde ${Number(r.ff_solde_di_apres).toLocaleString('fr-FR')} FCFA)`)
      }
    } catch (err) {
      console.error(`⚠️  ${t.dossier.numero} : débit DI impossible —`, err instanceof Error ? err.message : err)
    }
  }
  console.log(`✅ Factures fournisseurs : ${appliquees} débit(s) DI rattrapé(s)`)
}

main()
  .catch(err => {
    // Ne jamais bloquer un déploiement pour ce rattrapage
    console.error('⚠️  Rattrapage des factures fournisseurs non appliqué :', err instanceof Error ? err.message : err)
  })
  .finally(() => prisma.$disconnect())
