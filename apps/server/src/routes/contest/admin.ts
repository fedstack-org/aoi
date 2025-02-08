import { UUID } from 'mongodb'

import {
  CONTEST_CAPS,
  ContestRanklistState,
  SolutionState,
  contestRuleSchemas
} from '../../index.js'
import { SContestStage } from '../../schemas/contest.js'
import { T } from '../../schemas/index.js'
import { ensureCapability } from '../../utils/index.js'
import {
  manageACL,
  manageAccessLevel,
  defineRoutes,
  generateRangeQuery,
  manageRules
} from '../common/index.js'

import { kContestContext } from './inject.js'

export const contestAdminRoutes = defineRoutes(async (s) => {
  const { contests, solutions } = s.db

  s.addHook('onRequest', async (req) => {
    ensureCapability(
      req.inject(kContestContext)._contestCapability,
      CONTEST_CAPS.CAP_ADMIN,
      s.httpErrors.forbidden()
    )
  })

  s.register(manageACL, {
    collection: contests,
    resolve: async (req) => req.inject(kContestContext)._contestId,
    defaultCapability: CONTEST_CAPS.CAP_ACCESS,
    prefix: '/access'
  })
  s.register(manageAccessLevel, {
    collection: contests,
    resolve: async (req) => req.inject(kContestContext)._contestId,
    prefix: '/accessLevel'
  })
  s.register(manageRules, {
    collection: contests,
    resolve: async (req) => req.inject(kContestContext)._contestId,
    schemas: contestRuleSchemas,
    prefix: '/rule'
  })

  s.delete(
    '/',
    {
      schema: {
        description: 'Delete contest'
      }
    },
    async (req) => {
      // TODO: handle dependencies
      await contests.deleteOne({ _id: req.inject(kContestContext)._contestId })
      return {}
    }
  )

  s.post(
    '/submit-all',
    {
      schema: {
        description: 'Submit all solutions',
        response: {
          200: T.Object({
            modifiedCount: T.Number()
          })
        }
      }
    },
    async (req) => {
      const { modifiedCount } = await solutions.updateMany(
        {
          contestId: req.inject(kContestContext)._contestId,
          state: SolutionState.CREATED
        },
        [
          {
            $set: {
              state: SolutionState.PENDING,
              submittedAt: { $convert: { input: '$$NOW', to: 'double' } },
              score: 0,
              status: '',
              metrics: {},
              message: ''
            }
          },
          { $unset: ['taskId', 'runnerId'] }
        ]
      )
      return { modifiedCount }
    }
  )

  s.post(
    '/rejudge-all',
    {
      schema: {
        description: 'Rejudge all solutions',
        body: T.Object({
          problemId: T.Optional(T.UUID()),
          state: T.Optional(T.Integer({ minimum: 1, maximum: 4 })),
          status: T.Optional(T.String()),
          runnerId: T.Optional(T.String()),
          scoreL: T.Optional(T.Number()),
          scoreR: T.Optional(T.Number()),
          submittedAtL: T.Optional(T.Integer()),
          submittedAtR: T.Optional(T.Integer())
        }),
        response: {
          200: T.Object({
            modifiedCount: T.Number()
          })
        }
      }
    },
    async (req) => {
      const { modifiedCount } = await solutions.updateMany(
        {
          contestId: req.inject(kContestContext)._contestId,
          problemId: req.body.problemId ? new UUID(req.body.problemId) : undefined,
          state: req.body.state || { $ne: SolutionState.CREATED },
          status: req.body.status,
          runnerId:
            typeof req.body.runnerId === 'string'
              ? req.body.runnerId
                ? new UUID(req.body.runnerId)
                : { $exists: false }
              : undefined,
          score: generateRangeQuery(req.body.scoreL, req.body.scoreR),
          submittedAt: generateRangeQuery(req.body.submittedAtL, req.body.submittedAtR)
        },
        [
          {
            $set: {
              state: SolutionState.PENDING,
              score: 0,
              status: '',
              metrics: {},
              message: ''
            }
          },
          { $unset: ['taskId', 'runnerId'] }
        ],
        { ignoreUndefined: true }
      )
      return { modifiedCount }
    }
  )

  s.get(
    '/ranklist-info',
    {
      schema: {
        response: {
          200: T.Object({
            ranklistState: T.Integer(),
            ranklistUpdatedAt: T.Integer(),
            ranklistRunnerId: T.Optional(T.UUID())
          })
        }
      }
    },
    async (req) => {
      const { _contest } = req.inject(kContestContext)
      const { ranklistState, ranklistUpdatedAt, ranklistRunnerId } = _contest
      return {
        ranklistState,
        ranklistUpdatedAt,
        ranklistRunnerId
      }
    }
  )

  s.post(
    '/update-ranklists',
    {
      schema: {
        body: T.Object({
          resetRunner: T.Optional(T.Boolean())
        })
      }
    },
    async (req) => {
      await contests.updateOne(
        {
          _id: req.inject(kContestContext)._contestId,
          ranklists: { $exists: true, $ne: [] }
        },
        [
          {
            $set: {
              ranklistUpdatedAt: { $convert: { input: '$$NOW', to: 'double' } },
              ranklistState: ContestRanklistState.INVALID
            }
          },
          ...(req.body.resetRunner ? [{ $unset: ['ranklistRunnerId'] }] : [])
        ],
        { ignoreUndefined: true }
      )
      return 0
    }
  )

  s.get(
    '/stages',
    {
      schema: {
        description: 'Update contest stages',
        response: { 200: T.Array(SContestStage) }
      }
    },
    async (req) => {
      return req.inject(kContestContext)._contest.stages
    }
  )

  s.patch(
    '/stages',
    {
      schema: {
        description: 'Update contest stages',
        body: T.Array(SContestStage)
      }
    },
    async (req, rep) => {
      const stages = req.body
      if (stages.length < 3) return rep.badRequest('At least 3 stages are required')
      if (stages[0].start !== 0) return rep.badRequest('First stage must start at 0')
      if (stages.some((stage, i) => i && stages[i - 1].start >= stage.start))
        return rep.badRequest('Stages must be in ascending order')
      const start = stages[1].start
      const end = stages[stages.length - 1].start

      await contests.updateOne(
        { _id: req.inject(kContestContext)._contestId },
        { $set: { stages, start, end, nextStatusUpdate: 0 } }
      )
      return {}
    }
  )
})
