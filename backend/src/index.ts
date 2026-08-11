import 'dotenv/config'
import { buildApp } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'

async function main() {
  const app = await buildApp()

  try {
    await prisma.$connect()
    app.log.info('✅ Base de données PostgreSQL connectée')

    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`🚀 FINITRANS API démarrée sur http://${env.HOST}:${env.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

main()
