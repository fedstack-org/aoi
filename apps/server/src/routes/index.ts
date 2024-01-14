import { authRoutes } from './auth/index.js'
import { userRoutes } from './user/index.js'
import { orgRoutes } from './org/index.js'
import { adminRoutes } from './admin/index.js'
import { defineRoutes } from './common/index.js'
import { problemRoutes } from './problem/index.js'
import { solutionRoutes } from './solution/index.js'
import { BSON } from 'mongodb'
import { runnerRoutes } from './runner/index.js'
import fastifyJwt from '@fastify/jwt'
import { Type } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { loadEnv } from '../utils/config.js'
import { groupRoutes } from './group/index.js'
import { contestRoutes } from './contest/index.js'
import { planRoutes } from './plan/index.js'
import { infoRoutes } from './info/index.js'
import { announcementRoutes } from './announcement/index.js'
import { pubrkRoutes } from './pubrk/index.js'
import {
  IContainer,
  InjectionPoint,
  createInjectionContainer,
  inject,
  provide
} from '../utils/inject.js'
import type { FastifyRequest } from 'fastify'
import { publicRoutes } from './public/index.js'
import { IOrgMembership, orgMemberships } from '../db/index.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: BSON.UUID
      tags?: string[]
    }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    _now: number
    _container: IContainer
    provide<T>(point: InjectionPoint<T>, value: T): void
    inject<T>(point: InjectionPoint<T>): T
    loadMembership(orgId: BSON.UUID): Promise<IOrgMembership | null>
  }
}

const userPayload = TypeCompiler.Compile(
  Type.Object({
    userId: Type.String()
  })
)

function decoratedProvide<T>(this: FastifyRequest, point: InjectionPoint<T>, value: T) {
  return provide(this._container, point, value)
}

function decoratedInject<T>(this: FastifyRequest, point: InjectionPoint<T>): T {
  return inject(this._container, point)
}

async function decoratedLoadMembership(
  this: FastifyRequest,
  orgId: BSON.UUID
): Promise<IOrgMembership | null> {
  if (!this.user) return null
  return orgMemberships.findOne({ userId: this.user.userId, orgId })
}

export const apiRoutes = defineRoutes(async (s) => {
  s.decorateRequest('_container', null)
  s.decorateRequest('provide', decoratedProvide)
  s.decorateRequest('inject', decoratedInject)
  s.decorateRequest('loadMembership', decoratedLoadMembership)

  s.register(fastifyJwt, {
    secret: loadEnv('JWT_SECRET', String),
    formatUser(payload) {
      if (userPayload.Check(payload)) {
        return { userId: new BSON.UUID(payload.userId) }
      }
      throw s.httpErrors.badRequest()
    }
  })

  s.addHook('onRequest', async (req, rep) => {
    req._now = Date.now()
    req._container = createInjectionContainer()

    if (req.headers.authorization) {
      await req.jwtVerify()

      // Only allow tagged routes
      if (req.user.tags) {
        const tags = new Set(req.user.tags)
        if (!req.routeOptions.schema.tags?.some((tag) => tags.has(tag))) return rep.forbidden()
      }
    }

    // JWT is the default security scheme
    if ('security' in req.routeOptions.schema) return
    if (!req.user) return rep.forbidden()
  })

  s.get(
    '/ping',
    {
      schema: {
        description: 'Server health check',
        security: []
      }
    },
    async () => ({ ping: 'pong' })
  )
  s.register(authRoutes, { prefix: '/auth' })
  s.register(userRoutes, { prefix: '/user' })
  s.register(orgRoutes, { prefix: '/org' })
  s.register(groupRoutes, { prefix: '/group' })
  s.register(problemRoutes, { prefix: '/problem' })
  s.register(solutionRoutes, { prefix: '/solution' })
  s.register(contestRoutes, { prefix: '/contest' })
  s.register(planRoutes, { prefix: '/plan' })
  s.register(adminRoutes, { prefix: '/admin' })
  s.register(runnerRoutes, { prefix: '/runner' })
  s.register(infoRoutes, { prefix: '/info' })
  s.register(announcementRoutes, { prefix: '/announcement' })
  s.register(pubrkRoutes, { prefix: '/rk' })
  s.register(publicRoutes, { prefix: '/public' })
})
