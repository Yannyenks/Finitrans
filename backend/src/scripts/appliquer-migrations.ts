/**
 * Applique les migrations SQL versionnées de backend/migrations/ (ordre alphabétique = ordre chronologique).
 *
 * - Chaque fichier est appliqué UNE seule fois, dans une transaction qui inclut son enregistrement
 *   dans la table _migrations_sql : soit tout est appliqué et journalisé, soit rien.
 * - Une migration déjà appliquée dont le contenu a changé arrête le déploiement (empreinte SHA-256).
 * - Aucune suppression de données : ce script remplace `prisma db push --accept-data-loss` au déploiement.
 *
 * Usage : npm run db:migrations (utilise DATABASE_URL)
 */
import 'dotenv/config'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const DOSSIER = path.resolve(__dirname, '../../migrations')
const SCHEMA = path.resolve(__dirname, '../../prisma/schema.prisma')
const CLI_PRISMA = require.resolve('prisma/build/index.js')

const prisma = new PrismaClient()

// Fins de ligne normalisées : même empreinte sous Windows (CRLF) et sur Vercel (LF)
const empreinte = (contenu: string) => createHash('sha256').update(contenu.replace(/\r\n/g, '\n')).digest('hex')

/** Les fichiers peuvent porter leur propre BEGIN/COMMIT (exécution manuelle) : ils sont retirés ici. */
const sansTransaction = (sql: string) => sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '')

function executerFichier(sql: string) {
  const fichier = path.join(os.tmpdir(), `migration-${process.pid}-${Date.now()}.sql`)
  fs.writeFileSync(fichier, sql)
  try {
    execFileSync(process.execPath, [CLI_PRISMA, 'db', 'execute', '--schema', SCHEMA, '--file', fichier], { stdio: 'inherit' })
  } finally {
    fs.rmSync(fichier, { force: true })
  }
}

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS _migrations_sql (
      nom         text        PRIMARY KEY,
      empreinte   text        NOT NULL,
      applique_le timestamptz NOT NULL DEFAULT now()
    )`)
  const appliquees = new Map(
    (await prisma.$queryRawUnsafe<{ nom: string; empreinte: string }[]>('SELECT nom, empreinte FROM _migrations_sql'))
      .map(r => [r.nom, r.empreinte]),
  )

  const fichiers = fs.readdirSync(DOSSIER).filter(f => f.endsWith('.sql')).sort()
  let n = 0
  for (const nom of fichiers) {
    const contenu = fs.readFileSync(path.join(DOSSIER, nom), 'utf8')
    const e = empreinte(contenu)
    const deja = appliquees.get(nom)
    if (deja) {
      if (deja !== e) throw new Error(`La migration ${nom} a été modifiée après son application : créez une nouvelle migration.`)
      continue
    }
    console.log(`→ Migration ${nom}`)
    const nomEchappe = nom.replace(/'/g, "''")
    executerFichier(`BEGIN;\n${sansTransaction(contenu)}\nINSERT INTO _migrations_sql (nom, empreinte) VALUES ('${nomEchappe}', '${e}');\nCOMMIT;\n`)
    n++
  }
  console.log(n ? `✓ ${n} migration(s) appliquée(s)` : '✓ Base à jour (aucune migration en attente)')
}

main()
  .catch(err => {
    // Une migration en échec DOIT arrêter le déploiement : la base reste dans son état précédent
    console.error('⛔ Migrations interrompues :', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
