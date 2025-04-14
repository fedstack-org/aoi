import { ORG_CAPS } from '../../db/index.js'
import { T } from '../../schemas/index.js'
import { CAP_NONE, ensureCapability } from '../../utils/index.js'
import { defineRoutes, loadUUID, swaggerTagMerger } from '../common/index.js'

import { pubrkScopedRoutes } from './scoped.js'

export const pubrkRoutes = defineRoutes(async (s) => {
  const { pubrk } = s.db

  s.addHook('onRoute', swaggerTagMerger('pubrk'))

  s.register(pubrkScopedRoutes, { prefix: '/:ranklistId' })

  s.post(
    '/',
    {
      schema: {
        description: 'Create a new public ranklist',
        body: T.Object({
          contestId: T.UUID(),
          orgId: T.UUID(),
          ranklistKey: T.String()
        }),
        response: {
          200: T.Object({
            ranklistId: T.Number()
          })
        }
      }
    },
    async (req) => {
      const orgId = loadUUID(req.body, 'orgId', s.httpErrors.badRequest())
      const contestId = loadUUID(req.body, 'contestId', s.httpErrors.badRequest())
      const membership = await req.loadMembership(orgId)
      ensureCapability(
        membership?.capability ?? CAP_NONE,
        ORG_CAPS.CAP_ADMIN,
        s.httpErrors.forbidden()
      )
      // find an unused ranklistId, because ranklistId is unique and we created descending index on it
      // so lets find the ranklistId of the first one and add 1
      const first = await pubrk.find({}).sort({ ranklistId: -1 }).limit(1).next()
      const ranklistId = first ? first.ranklistId + 1 : 1
      // now insert the ranklist
      await pubrk.insertOne({
        ranklistId,
        contestId,
        orgId,
        ranklistKey: req.body.ranklistKey,
        visible: false
      })
      return { ranklistId }
    }
  )

  s.get(
    '/',
    {
      schema: {
        description: 'Check ranklistKey',
        querystring: T.Object({
          contestId: T.UUID(),
          ranklistKey: T.String()
        }),
        response: {
          200: T.Object({
            ranklistId: T.Number(),
            status: T.String()
          })
        }
      }
    },
    async (req) => {
      const contestId = loadUUID(req.query, 'contestId', s.httpErrors.badRequest())
      const ranklistKey = req.query.ranklistKey
      const ranklist = await pubrk.findOne({ contestId, ranklistKey })
      if (!ranklist) return { ranklistId: 0, status: 'not public' }
      return {
        ranklistId: ranklist.ranklistId,
        status: ranklist.password ? 'protected' : 'public'
      }
    }
  )
})
