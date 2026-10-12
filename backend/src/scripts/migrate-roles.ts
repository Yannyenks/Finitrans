/**
 * Migration idempotente des rôles (sans perte de données) :
 * relève les permissions de chaque compte au minimum défini par le modèle de son profil
 * (ex. le Service administratif doit pouvoir enregistrer des dossiers).
 * Ne diminue jamais une permission existante. Exécutée au déploiement (vercel-build).
 *
 * Usage : npm run db:migrate-roles
 */
import 'dotenv/config'
import { PermissionNiveau } from '@prisma/client'
import { prisma } from '../config/prisma'
import { PERMISSION_KEYS, getRoleTemplates } from '../config/roles'
import { PERMISSION_RANK } from '../types'

async function main() {
  const templates = await getRoleTemplates()
  const users = await prisma.user.findMany()
  let modifies = 0

  for (const user of users) {
    const tpl = templates[user.profil]
    const data: Partial<Record<typeof PERMISSION_KEYS[number], PermissionNiveau>> = {}
    for (const key of PERMISSION_KEYS) {
      if (PERMISSION_RANK[user[key]] < PERMISSION_RANK[tpl.permissions[key]]) data[key] = tpl.permissions[key]
    }
    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data })
      modifies++
      console.log(`  ↑ ${user.email} (${user.profil}) : ${Object.entries(data).map(([k, v]) => `${k}=${v}`).join(', ')}`)
    }
  }
  console.log(`✅ Migration des rôles : ${modifies} compte(s) mis à niveau sur ${users.length}`)
}

main()
  .catch(err => {
    // Ne jamais bloquer un déploiement pour cette migration
    console.error('⚠️  Migration des rôles non appliquée :', err instanceof Error ? err.message : err)
  })
  .finally(() => prisma.$disconnect())
