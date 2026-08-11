import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL:         z.string().min(1),
  JWT_SECRET:           z.string().min(32),
  JWT_REFRESH_SECRET:   z.string().min(32),
  JWT_ACCESS_EXPIRES:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES:  z.string().default('7d'),
  PORT:                 z.coerce.number().default(3001),
  HOST:                 z.string().default('0.0.0.0'),
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL:            z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ORIGIN:          z.string().default('http://localhost:8080'),
  UPLOADS_DIR:          z.string().default('./uploads'),
  MAX_FILE_SIZE_MB:     z.coerce.number().default(10),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Variables d\'environnement invalides:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
export type Env = z.infer<typeof envSchema>
