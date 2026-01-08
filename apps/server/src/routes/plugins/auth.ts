import { TypeCompiler } from '@sinclair/typebox/compiler'
import { Permission } from '@uaaa/core'
import { FastifyReply, FastifyRequest } from 'fastify'
import { fastifyPlugin } from 'fastify-plugin'
import * as jose from 'jose'
import { UUID } from 'mongodb'

import { UaaaAuthProvider } from '../../auth/uaaa.js'
import { Static, T } from '../../schemas/index.js'
import { loadEnv } from '../../utils/config.js'

const SUserPayload = T.Object({
  userId: T.UUID(),
  tags: T.Optional(T.Array(T.String()))
})
export type UserPayload = Static<typeof SUserPayload>
const IsUserPayload = TypeCompiler.Compile(SUserPayload)

const SUAAAPayload = T.Object({
  iss: T.String(),
  sub: T.String(),
  aud: T.String(),
  client_id: T.String(),
  sid: T.String(),
  jti: T.String(),
  perm: T.Array(T.String()),
  level: T.Number(),
  exp: T.Number(),
  iat: T.Number()
})
export type UAAAPayload = Static<typeof SUAAAPayload>
const IsUAAAPayload = TypeCompiler.Compile(SUAAAPayload)

declare module 'fastify' {
  interface FastifyRequest {
    user: Omit<UserPayload, 'userId'> & { userId: UUID }
    verifyToken(token: string): Promise<UserPayload>
    verify(token: string): Promise<unknown>
  }
  interface FastifyReply {
    newPayload(payload: unknown): jose.SignJWT
    sign(token: jose.SignJWT): Promise<string>
  }
}

export const apiAuthPlugin = fastifyPlugin(async (s) => {
  const secret = loadEnv('JWT_SECRET', (value) => new TextEncoder().encode(value))

  async function decoratedVerify(this: FastifyRequest, token: string): Promise<unknown> {
    const { payload } = await jose.jwtVerify(token, secret)
    return payload
  }
  async function decoratedVerifyToken(this: FastifyRequest, token: string): Promise<UserPayload> {
    const payload = await decoratedVerify.call(this, token)
    if (IsUserPayload.Check(payload)) return payload
    throw this.server.httpErrors.badRequest()
  }
  function decoratedNewPayload(this: FastifyReply, payload: unknown): jose.SignJWT {
    return new jose.SignJWT(JSON.parse(JSON.stringify(payload)))
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
  }
  async function decoratedSign(this: FastifyReply, token: jose.SignJWT): Promise<string> {
    return token.sign(secret)
  }
  s.decorateRequest('verify', decoratedVerify)
  s.decorateRequest('verifyToken', decoratedVerifyToken)
  s.decorateReply('newPayload', decoratedNewPayload)
  s.decorateReply('sign', decoratedSign)
})

export const apiUserAuthPlugin = fastifyPlugin(async (s) => {
  let uaaa: UaaaAuthProvider | undefined
  if (s.authProviders.uaaa && s.authProviders.uaaa instanceof UaaaAuthProvider) {
    uaaa = s.authProviders.uaaa
  }
  const JWKS = uaaa && jose.createRemoteJWKSet(new URL(uaaa.openidConfig.jwks_uri))
  const secret = loadEnv('JWT_SECRET', (value) => new TextEncoder().encode(value))
  const { db } = s
  s.addHook('onRequest', async (req, rep) => {
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace(/^(?:bearer|token) /i, '')
      const { payload, protectedHeader } = await jose.jwtVerify(
        token,
        (header: jose.JWSHeaderParameters, token: jose.FlattenedJWSInput) =>
          header.kid && JWKS ? JWKS(header, token) : secret
      )
      if (IsUserPayload.Check(payload)) {
        req.user = {
          ...payload,
          userId: new UUID(payload.userId)
        }
        if (req.user.tags) {
          const tags = new Set(req.user.tags)
          if (!req.routeOptions.schema?.tags?.some((tag) => tags.has(tag))) return rep.forbidden()
        }
      } else if (uaaa && IsUAAAPayload.Check(payload)) {
        if (!protectedHeader.kid) throw s.httpErrors.badRequest()
        if (payload.iss !== uaaa.openidConfig.issuer) throw s.httpErrors.badRequest()
        if (payload.aud !== uaaa.appId) throw s.httpErrors.badRequest()
        const permissions = payload.perm.map((perm) =>
          Permission.fromScopedString(perm, uaaa.appId, true)
        )
        const requiredTags = req.routeOptions.schema?.tags ?? []
        for (const tag of requiredTags) {
          if (permissions.some((perm) => perm.test(`/${tag}`))) continue
          throw s.httpErrors.forbidden()
        }
        const user = await db.users.findOne(
          { 'authSources.uaaa': payload.sub },
          { projection: { _id: 1 } }
        )
        if (!user) throw s.httpErrors.forbidden()
        req.user = { userId: user._id, tags: [...requiredTags] }
      }
    }

    // Check JWT
    const security = req.routeOptions.schema?.security
    if (!security || security.some((sec) => Object.hasOwn(sec, 'bearerAuth'))) {
      if (!req.user) return rep.forbidden()
    }
  })
})
