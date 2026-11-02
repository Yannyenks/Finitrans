import { Prisma, PrismaClient } from '@prisma/client'
import { env } from './env'
import { organisationDuContexte } from './contexte'

/**
 * Modèles appartenant à une organisation : tous ceux qui portent `organisationId`,
 * sauf l'abonnement (géré par la plateforme, une ligne par organisation).
 */
export const MODELES_ORGANISATION = new Set(
  Prisma.dmmf.datamodel.models
    .filter(m => m.name !== 'Abonnement' && m.fields.some(f => f.name === 'organisationId'))
    .map(m => m.name),
)

const LECTURES_ET_ECRITURES_FILTREES = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany',
])

type Donnees = Record<string, unknown>
const avecOrganisation = (data: Donnees, organisationId: string): Donnees =>
  ({ ...data, organisationId })

function creerClient() {
  const base = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

  // Isolation multi-entreprises : toute requête d'une requête HTTP authentifiée est bornée à
  // l'organisation de l'utilisateur. Une valeur `organisationId` fournie par l'appelant est
  // toujours écrasée par celle du contexte (jamais confiance au navigateur).
  return base.$extends({
    name: 'isolation-organisations',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const organisationId = organisationDuContexte()
          if (!organisationId || !MODELES_ORGANISATION.has(model)) return query(args)

          const a = (args ?? {}) as Donnees
          if (LECTURES_ET_ECRITURES_FILTREES.has(operation)) {
            a.where = { ...((a.where as Donnees) ?? {}), organisationId }
          } else if (operation === 'create') {
            a.data = avecOrganisation(a.data as Donnees, organisationId)
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const d = a.data as Donnees | Donnees[]
            a.data = Array.isArray(d) ? d.map(x => avecOrganisation(x, organisationId)) : avecOrganisation(d, organisationId)
          } else if (operation === 'upsert') {
            a.where = { ...((a.where as Donnees) ?? {}), organisationId }
            a.create = avecOrganisation(a.create as Donnees, organisationId)
          }
          return query(a as typeof args)
        },
      },
    },
  })
}

type ClientIsole = ReturnType<typeof creerClient>

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ClientIsole | undefined
}

export const prisma: ClientIsole = global.__prisma ?? creerClient()

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

/** Client reçu dans `prisma.$transaction(async tx => …)` : même isolation que le client principal. */
export type ClientTransaction = Omit<ClientIsole, '$extends' | '$transaction' | '$connect' | '$disconnect' | '$on' | '$use'>
