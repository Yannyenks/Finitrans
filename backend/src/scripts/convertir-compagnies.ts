/**
 * Conversion sans perte des colonnes « compagnie » (ancien type énuméré → texte), à exécuter
 * AVANT `prisma db push` : sans elle, db push supprimerait puis recréerait les colonnes et
 * effacerait la compagnie de tous les dossiers. Idempotente : ne fait rien si c'est déjà du texte.
 * Une erreur fait échouer le déploiement (le db push ne doit jamais s'exécuter dans ce cas).
 *
 * Usage : npm run db:convertir-compagnies
 */
import 'dotenv/config'
import { prisma } from '../config/prisma'

const COLONNES = ['dossiers', 'paiements_compagnie', 'declarations_importation', 'detentions', 'interchanges']

async function main() {
  let converties = 0
  for (const table of COLONNES) {
    const col = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = 'compagnie'`
    if (col.length === 0 || col[0].data_type !== 'USER-DEFINED') continue
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ALTER COLUMN "compagnie" TYPE VARCHAR(80) USING "compagnie"::text`,
    )
    converties++
  }
  console.log(`✅ Compagnies : ${converties} colonne(s) converties en texte (valeurs conservées)`)
}

main()
  .catch(err => {
    console.error('❌ Conversion des compagnies impossible :', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
