import { logger } from '@bogeychan/elysia-logger'
import cors from '@elysiajs/cors'
import serverTiming from '@elysiajs/server-timing'
import swagger from '@elysiajs/swagger'
import { Elysia, t } from 'elysia'
import { networkInterfaces } from 'os'

import { ENV, PORT } from './constants'
import auth from './plugin/auth'
import prisma from './plugin/postgres'
import route from './route'

// TODO: Rate limit, OAuth2
export type BaseElysia = typeof app

const app = new Elysia()
  .use(
    cors({
      origin: [/^https?:\/\/localhost:\d+$/, /^https:\/\/.*\.vercel\.app$/],
      allowedHeaders: '',
      exposeHeaders: '',
      maxAge: 86400,
    }),
  )
  .use(serverTiming())
  .use(swagger())
  .use(logger())
  .use(auth())
  .use(prisma())
  .get('/healthz', () => 'OK', { response: { 200: t.String() } })
  .get('/livez', () => ({ ENV, NODE_ENV: process.env.NODE_ENV ?? '' }), {
    response: {
      200: t.Object({
        ENV: t.String(),
        NODE_ENV: t.String(),
      }),
    },
  })
  .get(
    '/readyz',
    async ({ error, sql }) => {
      return JSON.stringify(await sql`SELECT CURRENT_TIMESTAMP`)

      type Result = [{ current_timestamp: Date }]
      // const result = await prisma.$queryRaw<Result>`SELECT CURRENT_TIMESTAMP`.catch(() => null)
      // const data = result?.[0]
      // if (!data) return error(502, 'Bad Gateway')

      return 'data'
    },
    {
      // response: {
      // 200: t.Object({ current_timestamp: t.Date() }),
      // 502: t.String(),
      // },
    },
  )

if (process.env.NODE_ENV !== 'production') {
  const { default: example } = await import('./plugin/example')
  app.use(example)
}

app.use(route).listen({ hostname: '0.0.0.0', port: PORT ?? 4000 })

console.log(`🦊 Elysia is running at: ${app.server?.url}`)

if (process.env.NODE_ENV !== 'production') {
  const nets = networkInterfaces()
  if (nets.en0) {
    console.log(`   On Your Network:      http://${nets.en0[1].address}:${PORT}`)
  }
}
