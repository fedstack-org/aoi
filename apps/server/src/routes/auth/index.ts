import * as bcrypt from 'bcrypt'
import { BSON } from 'mongodb'

import { ORG_CAPS } from '../../db/index.js'
import { loadEnv, parseBoolean } from '../../index.js'
import { T, SUserProfile } from '../../schemas/index.js'
import { defineRoutes, swaggerTagMerger } from '../common/index.js'

const signupEnabled = loadEnv('SIGNUP_ENABLED', parseBoolean, true)

export const authRoutes = defineRoutes(async (s) => {
  const { users, orgMemberships, infos } = s.db
  const authProviders = s.authProviders
  const loginProviders = Object.keys(authProviders).filter((name) => authProviders[name].login)
  const verifyProviders = Object.keys(authProviders).filter((name) => authProviders[name].verify)

  s.addHook('onRoute', (route) => {
    ;(route.schema ??= {}).security ??= []
  })
  s.addHook('onRoute', swaggerTagMerger('auth'))

  s.get(
    '/login',
    {
      schema: {
        response: {
          200: T.Object({
            providers: T.Array(T.String()),
            signup: T.Boolean()
          })
        }
      }
    },
    async () => {
      return { providers: loginProviders, signup: signupEnabled }
    }
  )

  s.post(
    '/preLogin',
    {
      schema: {
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown()
        }),
        response: {
          200: T.Unknown()
        }
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          groupId: 'login'
        }
      }
    },
    async (req, rep) => {
      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      return authProviders[provider].preLogin?.(payload, req, rep) ?? {}
    }
  )

  s.post(
    '/login',
    {
      schema: {
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown()
        }),
        response: {
          200: T.Object({
            token: T.String()
          })
        }
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          groupId: 'login'
        }
      }
    },
    async (req, rep) => {
      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      const impl = authProviders[provider]
      if (!impl.login) return rep.badRequest()
      const [userId, tags] = await impl.login(payload, req, rep)
      const jwt = rep
        .newPayload({ userId: userId.toString(), tags })

        .setExpirationTime('7d')
      const token = await rep.sign(jwt)
      return { token }
    }
  )

  s.get(
    '/verify',
    {
      schema: {
        response: {
          200: T.Object({
            providers: T.Array(T.String())
          })
        }
      }
    },
    async () => {
      return { providers: verifyProviders }
    }
  )

  s.post(
    '/preVerify',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown()
        }),
        response: {
          200: T.Unknown()
        }
      }
    },
    async (req, rep) => {
      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      return authProviders[provider].preVerify?.(req.user.userId, payload, req, rep) ?? {}
    }
  )

  s.post(
    '/verify',
    {
      schema: {
        security: [{ bearerAuth: [] }],
        body: T.Object({
          provider: T.String(),
          payload: T.Unknown()
        }),
        response: {
          200: T.Object({
            token: T.String()
          })
        }
      }
    },
    async (req, rep) => {
      const { provider, payload } = req.body
      if (!Object.hasOwn(authProviders, provider)) return rep.badRequest()
      const verified = await authProviders[provider].verify(req.user.userId, payload, req, rep)
      if (!verified) return rep.forbidden()
      const jwt = rep
        .newPayload({
          userId: req.user.userId.toString(),
          tags: [`.mfa.${provider}`]
        })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30m')
      const token = await rep.sign(jwt)
      return { token }
    }
  )

  s.post(
    '/signup',
    {
      schema: {
        body: T.Object({
          profile: SUserProfile,
          password: T.String()
        })
      }
    },
    async (req, rep) => {
      if (!signupEnabled) return rep.notFound()

      const { profile, password: rawPassword } = req.body
      if (!profile.telephone) return rep.badRequest('Telephone is required')
      if (!profile.school) return rep.badRequest('School is required')
      if (!profile.studentGrade) return rep.badRequest('Student grade is required')
      const password = await bcrypt.hash(rawPassword, 10)
      if (await users.findOne({ 'profile.name': profile.name }))
        return rep.conflict('Username already exists')
      const { insertedId } = await users.insertOne({
        _id: new BSON.UUID(),
        profile,
        authSources: {
          password
        }
      })

      const info = await infos.findOne()
      const defaultOrgId = info?.regDefaultOrg ?? ''
      if (BSON.UUID.isValid(defaultOrgId)) {
        const doUUID = new BSON.UUID(defaultOrgId)
        await orgMemberships.insertOne({
          _id: new BSON.UUID(),
          userId: insertedId,
          orgId: doUUID,
          capability: ORG_CAPS.CAP_ACCESS,
          groups: []
        })
      }

      const jwt = rep
        .newPayload({ userId: insertedId.toString() })

        .setExpirationTime('7d')
      const token = await rep.sign(jwt)
      return { token }
    }
  )
})
