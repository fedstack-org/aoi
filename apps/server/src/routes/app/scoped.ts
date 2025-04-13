import { APP_CAPS, ORG_LIMITS } from '../../db/index.js'
import { T, SAppSettings } from '../../schemas/index.js'
import { CAP_ALL, CAP_NONE, hasCapability } from '../../utils/index.js'
import { manageContent } from '../common/content.js'
import { defineRoutes, loadCapability, paramSchemaMerger, tryLoadUUID } from '../common/index.js'

import { appAdminRoutes } from './admin.js'
import { kAppContext } from './inject.js'

export const appScopedRoutes = defineRoutes(async (s) => {
  const { apps } = s.db

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        appId: T.UUID()
      })
    )
  )

  s.addHook('onRequest', async (req, rep) => {
    const appId = tryLoadUUID(req.params, 'appId')
    if (!appId) return rep.notFound()
    const app = await apps.findOne({ _id: appId })
    if (!app) return rep.notFound()
    const membership = await req.loadMembership(app.orgId)
    const limited = hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_APP)
    const capability = loadCapability(
      app,
      membership,
      APP_CAPS.CAP_ADMIN,
      limited ? CAP_NONE : APP_CAPS.CAP_ACCESS,
      CAP_ALL
    )
    if (!hasCapability(capability, APP_CAPS.CAP_ACCESS)) return rep.forbidden()
    req.provide(kAppContext, {
      app,
      capability,
      membership
    })
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get app details',
        response: {
          200: T.Object({
            _id: T.UUID(),
            orgId: T.UUID(),
            accessLevel: T.AccessLevel(),
            slug: T.String(),
            title: T.String(),
            description: T.String(),
            tags: T.Array(T.String()),
            settings: SAppSettings,
            capability: T.String()
          })
        }
      }
    },
    async (req) => {
      const ctx = req.inject(kAppContext)
      return {
        ...ctx.app,
        capability: ctx.capability.toString()
      }
    }
  )

  s.register(manageContent, {
    collection: apps,
    resolve: async (req) => {
      const ctx = req.inject(kAppContext)

      if (!hasCapability(ctx.capability, APP_CAPS.CAP_CONTENT)) return null
      return ctx.app._id
    },
    prefix: '/content'
  })

  s.post(
    '/authorize',
    {
      schema: {
        description: 'Authorize and login into an app',
        body: T.Object({
          mfaToken: T.Optional(T.String()),
          type: T.Optional(T.StringEnum(['web', 'device']))
        }),
        response: {
          200: T.Object({
            token: T.String()
          })
        }
      }
    },
    async (req, rep) => {
      const { app, capability } = req.inject(kAppContext)
      const { allowPublicLogin } = app.settings
      if (!allowPublicLogin && !hasCapability(capability, APP_CAPS.CAP_LOGIN))
        return rep.forbidden()

      if (app.settings.requireMfa) {
        if (!req.body.mfaToken) return rep.badRequest()
        req.verifyMfa(req.body.mfaToken)
      }

      const tags = [`.oauth.access_token.${app._id}`]
      if (req.body.type === 'device') tags.push(`.oauth.bypass_secret`)

      const jwt = rep
        .newPayload({ userId: req.user.userId.toString(), tags })
        .setExpirationTime('1min')
      const token = await rep.sign(jwt)
      return { token }
    }
  )

  s.register(appAdminRoutes, { prefix: '/admin' })
})
