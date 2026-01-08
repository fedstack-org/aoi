import { BSON } from 'mongodb'

import { SUserProfile, T, USER_CAPS, hasCapability, loadEnv, parseBoolean } from '../../index.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { loadUserCapability } from '../common/access.js'
import { defineRoutes, loadUUID, paramSchemaMerger } from '../common/index.js'

const kUserContext = defineInjectionPoint<{
  _userId: BSON.UUID
}>('user')

const DISABLE_USER_RENAME = loadEnv('DISABLE_USER_RENAME', parseBoolean, false)

export const userScopedRoutes = defineRoutes(async (s) => {
  const authProviders = s.authProviders

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        userId: T.String()
      })
    )
  )
  s.addHook('onRequest', async (req) => {
    req.provide(kUserContext, {
      _userId: loadUUID(req.params, 'userId', s.httpErrors.notFound())
    })
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get user details',
        tags: ['user.details'],
        response: {
          200: T.Object({
            profile: SUserProfile,
            capability: T.Optional(T.String()),
            namespace: T.Optional(T.String()),
            tags: T.Optional(T.Array(T.String()))
          })
        }
      }
    },
    async (req, rep) => {
      const user = await s.db.users.findOne(
        { _id: req.inject(kUserContext)._userId },
        { projection: { profile: 1, capability: 1, namespace: 1, tags: 1 } }
      )
      if (!user) return rep.notFound()
      const ctx = req.inject(kUserContext)
      const capability = await loadUserCapability(req)
      const allowSensitive =
        req.user.userId.equals(ctx._userId) || hasCapability(capability, USER_CAPS.CAP_ADMIN)
      return {
        ...user,
        capability: user.capability?.toString(),
        profile: allowSensitive
          ? user.profile
          : { name: user.profile.name, email: user.profile.email, realname: user.profile.realname }
      }
    }
  )

  s.get(
    '/profile',
    {
      schema: {
        response: {
          200: SUserProfile
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kUserContext)
      const user = await s.db.users.findOne({ _id: ctx._userId }, { projection: { profile: 1 } })
      if (!user) return rep.notFound()
      const capability = await loadUserCapability(req)
      const allowSensitive =
        req.user.userId.equals(ctx._userId) || hasCapability(capability, USER_CAPS.CAP_ADMIN)
      return allowSensitive
        ? user.profile
        : { name: user.profile.name, email: user.profile.email, realname: user.profile.realname }
    }
  )

  s.patch(
    '/profile',
    {
      schema: {
        body: SUserProfile
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kUserContext)

      const capability = await loadUserCapability(req)
      if (!req.user.userId.equals(ctx._userId) && !hasCapability(capability, USER_CAPS.CAP_ADMIN))
        return rep.forbidden()

      const { verified, ...rest } = req.body
      const verifiedFields = verified ?? []
      for (const field of verifiedFields) {
        rest[field as never] = undefined as never
      }
      if (DISABLE_USER_RENAME) {
        rest.name = undefined as never
      }

      const fields = Object.entries(rest).filter(([, v]) => v !== undefined)
      if (!fields.length) return {}

      const $set = Object.fromEntries(fields.map(([k, v]) => [`profile.${k}`, v]))
      const { matchedCount } = await s.db.users.updateOne(
        { _id: ctx._userId, [`profile.verified`]: verified },
        { $set },
        { ignoreUndefined: true }
      )
      if (!matchedCount) return rep.badRequest('Verified field cannot be changed')
      return {}
    }
  )

  s.post(
    '/preBind',
    {
      schema: {
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown(),
          mfaToken: T.Optional(T.String())
        }),
        response: {
          200: T.Unknown()
        },
        tags: ['user-auth']
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kUserContext)

      const capability = await loadUserCapability(req)
      if (!req.user.userId.equals(ctx._userId) && !hasCapability(capability, USER_CAPS.CAP_ADMIN))
        return rep.forbidden()

      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      if (authProviders[provider].enableMfaBind) {
        if (!req.body.mfaToken) return rep.badRequest()
        req.verifyMfa(req.body.mfaToken)
      }
      return authProviders[provider].preBind?.(ctx._userId, payload, req, rep) ?? {}
    }
  )

  s.post(
    '/bind',
    {
      schema: {
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown(),
          mfaToken: T.Optional(T.String())
        }),
        response: {
          200: T.Unknown()
        },
        tags: ['user-auth']
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kUserContext)

      const capability = await loadUserCapability(req)
      if (!req.user.userId.equals(ctx._userId) && !hasCapability(capability, USER_CAPS.CAP_ADMIN))
        return rep.forbidden()

      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      if (authProviders[provider].enableMfaBind) {
        if (!req.body.mfaToken) return rep.badRequest()
        req.verifyMfa(req.body.mfaToken)
      }
      return authProviders[provider].bind(ctx._userId, payload, req, rep)
    }
  )
})
