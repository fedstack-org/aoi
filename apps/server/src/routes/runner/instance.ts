import { SProblemConfigSchema } from '@aoi-js/common'
import { UUID } from 'mongodb'

import { InstanceState, InstanceTaskState } from '../../db/instance.js'
import { getDownloadUrl, problemDataKey } from '../../oss/index.js'
import { T } from '../../schemas/common.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { defineRoutes, loadUUID, paramSchemaMerger } from '../common/index.js'

import { kRunnerContext } from './inject.js'

const kRunnerInstanceContext = defineInjectionPoint<{
  _instanceId: UUID
  _taskId: UUID
}>('runnerInstance')

const nextState = (state: InstanceState, succeeded: boolean) => {
  switch (state) {
    case InstanceState.ALLOCATING:
      return succeeded ? InstanceState.ALLOCATED : InstanceState.ERROR
    case InstanceState.DESTROYING:
      return succeeded ? InstanceState.DESTROYED : InstanceState.ERROR
    default:
      return null
  }
}

const runnerTaskRoutes = defineRoutes(async (s) => {
  const { instances } = s.db

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        instanceId: T.UUID(),
        taskId: T.UUID()
      })
    )
  )

  s.addHook('onRequest', async (req) => {
    req.provide(kRunnerInstanceContext, {
      _instanceId: loadUUID(req.params, 'instanceId', s.httpErrors.notFound()),
      _taskId: loadUUID(req.params, 'taskId', s.httpErrors.notFound())
    })
  })

  s.get(
    '/',
    {
      schema: {
        response: {
          200: T.Object({
            orgId: T.UUID(),
            userId: T.UUID(),
            problemId: T.UUID(),
            contestId: T.Optional(T.UUID()),
            state: T.Number(),
            message: T.String()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kRunnerInstanceContext)
      const instance = await instances.findOne({ _id: ctx._instanceId, taskId: ctx._taskId })
      if (!instance) return rep.notFound()
      return instance
    }
  )

  s.patch(
    '/',
    {
      schema: {
        body: T.Partial(
          T.StrictObject({
            message: T.String()
          })
        ),
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kRunnerInstanceContext)
      const { matchedCount } = await instances.updateOne(
        { _id: ctx._instanceId, taskId: ctx._taskId, state: { $nin: [InstanceState.DESTROYED] } },
        [
          {
            $set: {
              ...req.body,
              taskState: {
                $cond: {
                  if: { $ifNull: ['$taskState', false] },
                  then: InstanceTaskState.IN_PROGRESS,
                  else: '$$REMOVE'
                }
              },
              updatedAt: req._now
            }
          }
        ],
        { ignoreUndefined: true }
      )
      if (matchedCount === 0) return rep.notFound()
      return {}
    }
  )

  s.post(
    '/complete',
    {
      schema: {
        body: T.StrictObject({
          succeeded: T.Boolean(),
          message: T.Optional(T.String())
        }),
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kRunnerInstanceContext)
      const instance = await instances.findOne({ _id: ctx._instanceId, taskId: ctx._taskId })
      if (!instance) return rep.notFound()
      const state = nextState(instance.state, req.body.succeeded)
      if (state === null) return rep.conflict()

      const { modifiedCount } = await instances.updateOne(
        { _id: ctx._instanceId, taskId: ctx._taskId, state: instance.state },
        {
          $set: {
            state,
            message: req.body.message,
            updatedAt: req._now,
            allocatedAt: state === InstanceState.ALLOCATED ? req._now : undefined,
            destroyedAt: state === InstanceState.DESTROYED ? req._now : undefined
          },
          $unset: { taskState: '', taskStartedAt: '' }
        },
        { ignoreUndefined: true }
      )
      if (modifiedCount === 0) return rep.conflict()
      return {}
    }
  )
})

export const runnerInstanceRoutes = defineRoutes(async (s) => {
  const { orgs, instances, problems } = s.db

  s.addHook('onRequest', async (req, rep) => {
    if (!req.inject(kRunnerContext)._runner.labels.some((label) => label.startsWith('instance:'))) {
      return rep.forbidden()
    }
  })

  s.post(
    '/poll',
    {
      schema: {
        response: {
          200: T.Partial(
            T.Object({
              taskId: T.UUID(),
              instanceId: T.UUID(),
              orgId: T.UUID(),
              userId: T.UUID(),
              problemId: T.UUID(),
              contestId: T.UUID(),
              state: T.Integer(),
              problemConfig: SProblemConfigSchema,
              problemDataUrl: T.String(),
              problemDataHash: T.String(),
              errMsg: T.String()
            })
          )
        }
      }
    },
    async (req) => {
      const runnerCtx = req.inject(kRunnerContext)
      const taskId = new UUID()
      const instance = await instances.findOneAndUpdate(
        {
          orgId: runnerCtx._runner.orgId,
          label: {
            $in: runnerCtx._runner.labels
              .filter((label) => label.startsWith('instance:'))
              .map((label) => label.replace(/^instance:/, ''))
          },
          taskState: InstanceTaskState.PENDING,
          $or: [{ runnerId: runnerCtx._runner._id }, { runnerId: { $exists: false } }]
        },
        { $set: { taskState: InstanceTaskState.QUEUED, runnerId: runnerCtx._runner._id, taskId } },
        { returnDocument: 'after' }
      )
      if (!instance) return {}
      const info = {
        taskId,
        instanceId: instance._id,
        orgId: instance.orgId,
        userId: instance.userId,
        problemId: instance.problemId,
        contestId: instance.contestId,
        state: instance.state
      }

      const org = await orgs.findOne(
        { _id: runnerCtx._runner.orgId },
        { projection: { 'settings.oss': 1 } }
      )
      const oss = org?.settings.oss
      if (!oss) return { ...info, errMsg: 'OSS not enabled' }
      const problem = await problems.findOne({ _id: instance.problemId })
      if (!problem) return { ...info, errMsg: 'Problem not found' }
      const problemData = problem.data.find(({ hash }) => hash === instance.problemDataHash)
      if (!problemData) return { ...info, errMsg: 'Problem data not found' }

      const problemDataUrl = await getDownloadUrl(
        oss,
        problemDataKey(problem._id, instance.problemDataHash)
      )

      return {
        ...info,
        problemConfig: problemData.config,
        problemDataUrl,
        problemDataHash: instance.problemDataHash
      }
    }
  )

  s.register(runnerTaskRoutes, { prefix: '/task/:instanceId/:taskId' })
})
