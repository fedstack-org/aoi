import { FastifyRequest } from 'fastify'
import { BSON } from 'mongodb'

import {
  CONTEST_CAPS,
  IContestSolutionRuleCtx,
  ISolution,
  SolutionState
} from '../../../db/index.js'
import { solutionDataKey, solutionDetailsKey } from '../../../oss/index.js'
import { SContestSolutionRuleResult, T } from '../../../schemas/index.js'
import { createEvaluator, findPaginated, hasCapability } from '../../../utils/index.js'
import { getFileUrl } from '../../common/files.js'
import {
  defineRoutes,
  generateRangeQuery,
  loadUUID,
  paramSchemaMerger
} from '../../common/index.js'
import { kContestContext } from '../inject.js'

function checkUser(
  req: FastifyRequest,
  userId: string | BSON.UUID | undefined,
  bypass: boolean | undefined,
  bypassCap: BSON.Long = CONTEST_CAPS.CAP_ADMIN
) {
  const ctx = req.inject(kContestContext)
  return (
    bypass ||
    hasCapability(ctx._contestCapability, bypassCap) ||
    req.user.userId.equals(userId ?? '')
  )
}

const solutionScopedRoutes = defineRoutes(async (s) => {
  const { solutions } = s.db
  const solutionRuleEvaluator = createEvaluator(SContestSolutionRuleResult)<IContestSolutionRuleCtx>

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        solutionId: T.String()
      })
    )
  )

  s.post(
    '/submit',
    {
      schema: {
        body: T.Partial(T.Object({}))
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)

      const { solutionAllowSubmit } = ctx._contestStage.settings
      if (!solutionAllowSubmit && !hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)) {
        return rep.forbidden()
      }
      const problemIds = ctx._contest.problems
        .filter((problem) => !problem.settings.disableSubmit)
        .map((problem) => problem.problemId)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const admin = hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)
      const { modifiedCount } = await solutions.updateOne(
        {
          _id: solutionId,
          contestId: ctx._contestId,
          problemId: admin ? undefined : { $in: problemIds },
          userId: admin ? undefined : req.user.userId,
          state: admin ? undefined : SolutionState.CREATED
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
        ],
        { ignoreUndefined: true }
      )
      if (modifiedCount === 0) return rep.notFound()
      return {}
    }
  )

  s.post(
    '/rejudge',
    {
      schema: {
        body: T.Object({
          pull: T.Optional(T.Boolean())
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const admin = hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)
      if (!admin) return rep.forbidden()

      const { pull } = req.body
      let label: string | undefined
      let problemDataHash: string | undefined
      if (pull) {
        const solution = await solutions.findOne(
          {
            _id: solutionId,
            contestId: ctx._contestId,
            state: { $ne: SolutionState.CREATED }
          },
          { projection: { problemId: 1 } }
        )
        if (!solution) return rep.notFound()

        const problem = await s.db.problems.findOne(
          { _id: solution.problemId },
          { projection: { currentDataHash: 1, data: 1 } }
        )
        if (!problem) return rep.notFound()
        const currentData = problem.data.find(({ hash }) => hash === problem.currentDataHash)
        if (!currentData) return rep.preconditionFailed('Current data not found')

        label = currentData.config.label
        problemDataHash = problem.currentDataHash
      }

      const { modifiedCount } = await solutions.updateOne(
        {
          _id: solutionId,
          contestId: ctx._contestId,
          state: { $ne: SolutionState.CREATED }
        },
        [
          {
            $set: {
              label,
              problemDataHash,
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
      if (modifiedCount === 0) return rep.notFound()
      return {}
    }
  )

  s.get(
    '/',
    {
      schema: {
        response: {
          200: T.Object({
            _id: T.UUID(),
            label: T.String(),
            problemId: T.UUID(),
            userId: T.UUID(),
            problemDataHash: T.String(),
            state: T.Integer(),
            score: T.Number(),
            metrics: T.Record(T.String(), T.Number()),
            status: T.String(),
            message: T.String(),
            createdAt: T.Number(),
            submittedAt: T.Optional(T.Number()),
            completedAt: T.Optional(T.Number()),
            preferPrivate: T.Optional(T.Boolean())
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const { solutionShowOther } = ctx._contestStage.settings
      const admin = hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)
      const solution = await solutions.findOne(
        {
          _id: solutionId,
          contestId: ctx._contestId,
          userId: admin || solutionShowOther ? undefined : req.user.userId
        },
        {
          projection: {
            label: 1,
            problemId: 1,
            userId: 1,
            problemDataHash: 1,
            state: 1,
            score: 1,
            metrics: 1,
            status: 1,
            message: 1,
            createdAt: 1,
            submittedAt: 1,
            completedAt: 1,
            preferPrivate: 1
          },
          ignoreUndefined: true
        }
      )
      if (!solution) return rep.notFound()
      return solution
    }
  )

  s.register(getFileUrl, {
    prefix: '/details',
    resolve: async (type, query, req) => {
      const ctx = req.inject(kContestContext)

      const { solutionShowOtherDetails, solutionShowDetails } = ctx._contestStage.settings
      if (!solutionShowDetails && !hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)) {
        throw s.httpErrors.forbidden()
      }

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const solution = await solutions.findOne({
        _id: solutionId,
        contestId: ctx._contestId
      })
      if (!solution) throw s.httpErrors.notFound()
      if (!checkUser(req, solution.userId, solutionShowOtherDetails)) {
        throw s.httpErrors.forbidden()
      }
      return [ctx._contest.orgId, solutionDetailsKey(solution._id)]
    },
    allowedTypes: ['download']
  })

  s.register(getFileUrl, {
    prefix: '/data',
    resolve: async (type, query, req) => {
      const ctx = req.inject(kContestContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const solution = await solutions.findOne({
        _id: solutionId,
        contestId: ctx._contestId
      })
      if (!solution) throw s.httpErrors.notFound()
      const { solutionShowOtherData } = ctx._contestStage.settings
      let showData = !!solutionShowOtherData
      if (ctx._contest.rules?.solution) {
        const { showData: _showData } = solutionRuleEvaluator(
          {
            contest: ctx._contest,
            currentStage: ctx._contestStage,
            participant: ctx._contestParticipant,
            currentResult: ctx._contestParticipant?.results[solution.problemId.toString()] ?? null,
            solution
          },
          ctx._contest.rules?.solution
        )
        if (typeof _showData === 'string') {
          throw s.httpErrors.forbidden(_showData)
        }
        showData = _showData ?? showData
      }
      if (!checkUser(req, solution.userId, showData)) throw s.httpErrors.forbidden()
      return [ctx._contest.orgId, solutionDataKey(solution._id)]
    },
    allowedTypes: ['download']
  })
})

export const contestSolutionRoutes = defineRoutes(async (s) => {
  const { solutions } = s.db

  s.addHook('onRequest', async (req, rep) => {
    const ctx = req.inject(kContestContext)

    const { solutionEnabled } = ctx._contestStage.settings
    if (!solutionEnabled && !hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)) {
      return rep.forbidden()
    }
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get contest solutions',
        querystring: T.Object({
          userId: T.Optional(T.String()),
          problemId: T.Optional(T.String()),

          state: T.Optional(T.Integer({ minimum: 0, maximum: 4 })),
          status: T.Optional(T.String()),
          scoreL: T.Optional(T.Number()),
          scoreR: T.Optional(T.Number()),
          submittedAtL: T.Optional(T.Integer()),
          submittedAtR: T.Optional(T.Integer()),

          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false })
        }),
        response: {
          200: T.PaginationResult(
            T.Object({
              _id: T.UUID(),
              problemId: T.UUID(),
              userId: T.UUID(),
              state: T.Integer(),
              score: T.Number(),
              metrics: T.Record(T.String(), T.Number()),
              status: T.String(),
              message: T.String(),
              submittedAt: T.Optional(T.Number())
            })
          )
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)

      const { solutionShowOther } = ctx._contestStage.settings
      if (!checkUser(req, req.query.userId, solutionShowOther)) {
        return rep.forbidden()
      }
      return await findPaginated<ISolution & { submittedAt: number }>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        solutions as any,
        req.query.page,
        req.query.perPage,
        req.query.count,
        {
          contestId: ctx._contest._id,
          problemId: req.query.problemId ? new BSON.UUID(req.query.problemId) : undefined,
          userId: req.query.userId ? new BSON.UUID(req.query.userId) : undefined,
          state: req.query.state,
          status: req.query.status,
          score: generateRangeQuery(req.query.scoreL, req.query.scoreR),
          submittedAt: generateRangeQuery(req.query.submittedAtL, req.query.submittedAtR)
        },
        {
          projection: {
            problemId: 1,
            userId: 1,
            state: 1,
            score: 1,
            metrics: 1,
            status: 1,
            message: 1,
            submittedAt: 1
          },
          sort: {
            submittedAt: -1
          },
          ignoreUndefined: true
        }
      )
    }
  )

  s.register(solutionScopedRoutes, { prefix: '/:solutionId' })
})
