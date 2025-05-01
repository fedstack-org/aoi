import { BSON } from 'mongodb'

import { InstanceState, InstanceTaskState } from '../../db/instance.js'
import { ORG_CAPS } from '../../db/org.js'
import { T } from '../../schemas/index.js'
import { hasCapability } from '../../utils/capability.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { defineRoutes, loadUUID, paramSchemaMerger } from '../common/index.js'

const instanceIdSchema = T.Object({
  instanceId: T.String()
})

const kInstanceContext = defineInjectionPoint<{
  _instanceId: BSON.UUID
}>('instance')

export const instanceScopedRoute = defineRoutes(async (s) => {
  const { instances } = s.db

  s.addHook('onRoute', paramSchemaMerger(instanceIdSchema))

  s.addHook('onRequest', async (req) => {
    const instanceId = loadUUID(req.params, 'instanceId', s.httpErrors.notFound())
    req.provide(kInstanceContext, { _instanceId: instanceId })
  })

  s.post(
    '/destroy',
    {
      schema: {
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kInstanceContext)
      const instance = await instances.findOne({ _id: ctx._instanceId })
      if (!instance) return rep.notFound()
      if (!instance.userId.equals(req.user.userId)) {
        const membership = await req.loadMembership(instance.orgId)
        if (!membership) return rep.notFound()
        if (!hasCapability(membership.capability, ORG_CAPS.CAP_INSTANCE)) return rep.forbidden()
      }
      await instances.updateOne(
        {
          _id: ctx._instanceId,
          state: { $nin: [InstanceState.DESTROYING, InstanceState.DESTROYED] }
        },
        {
          $set: {
            state: InstanceState.DESTROYING,
            taskState: InstanceTaskState.PENDING,
            taskStartedAt: req._now
          }
        }
      )
      return {}
    }
  )
})
