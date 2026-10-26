/**
 * Restauration d'une sauvegarde FINITRANS (remplace TOUTES les données par celles de la sauvegarde).
 *
 * Usage :
 *   npm run db:restaurer -- <id-de-sauvegarde | chemin/fichier.json.gz> --confirmer
 *
 * Sans --confirmer, le script affiche seulement le contenu de la sauvegarde (aucune écriture).
 * Les sessions sont vidées : tout le monde se reconnecte après la restauration.
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { prisma } from '../config/prisma'
import { lireSauvegarde } from '../services/sauvegarde'

async function ordreInsertion(tables: string[]): Promise<string[]> {
  // Une table est insérée après celles qu'elle référence (clés étrangères)
  const fk = await prisma.$queryRawUnsafe<{ enfant: string; parent: string }[]>(`
    select tc.table_name as enfant, ccu.table_name as parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)
  const restantes = new Set(tables), ordre: string[] = []
  while (restantes.size) {
    const pretes = [...restantes].filter(t => !fk.some(f => f.enfant === t && f.parent !== t && restantes.has(f.parent)))
    if (!pretes.length) throw new Error(`Dépendances circulaires : ${[...restantes].join(', ')}`)
    for (const t of pretes) { ordre.push(t); restantes.delete(t) }
  }
  return ordre
}

async function main() {
  const [source] = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const confirmer = process.argv.includes('--confirmer')
  if (!source) throw new Error('Indiquez l\'id de la sauvegarde ou le chemin du fichier .json.gz')

  let contenu: Buffer
  if (/^[0-9a-f-]{36}$/i.test(source)) {
    const s = await prisma.sauvegarde.findUnique({ where: { id: source }, select: { contenu: true } })
    if (!s?.contenu) throw new Error('Sauvegarde introuvable ou vide')
    contenu = Buffer.from(s.contenu)
  } else contenu = readFileSync(source)

  const sauvegarde = lireSauvegarde(contenu)
  if (sauvegarde.format !== 'finitrans-sauvegarde-v1') throw new Error('Format de sauvegarde inconnu')
  const tables = Object.keys(sauvegarde.tables)
  console.log(`Sauvegarde du ${sauvegarde.creeLe} :`)
  for (const t of tables) console.log(`  ${t.padEnd(28)} ${sauvegarde.tables[t].length}`)
  if (!confirmer) { console.log('\nAucune écriture (ajoutez --confirmer pour restaurer).'); return }

  const ordre = await ordreInsertion(tables)
  // Tables conservées hors sauvegarde mais dépendantes des comptes : vidées aussi
  const aVider = [...tables, 'refresh_tokens', 'televersements_morceaux']
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${aVider.map(t => `"${t}"`).join(', ')}`)
    for (const t of ordre) {
      const lignes = sauvegarde.tables[t]
      for (let i = 0; i < lignes.length; i += 500) {
        await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, JSON.stringify(lignes.slice(i, i + 500)))
      }
    }
  }, { timeout: 600_000, maxWait: 60_000 })
  console.log('\n✅ Restauration terminée.')
}

main()
  .catch(err => { console.error('❌', err instanceof Error ? err.message : err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
