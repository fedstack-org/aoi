import { BSON } from 'mongodb'

import { IProblemSolutionRuleCtx, ISolution, PROBLEM_CAPS, SolutionState } from '../../db/index.js'
import { solutionDataKey, solutionDetailsKey } from '../../index.js'
import { SProblemSolutionRuleResult, T } from '../../schemas/index.js'
import { createEvaluator, findPaginated, hasCapability } from '../../utils/index.js'
import { getFileUrl } from '../common/files.js'
import { defineRoutes, generateRangeQuery, loadUUID, paramSchemaMerger } from '../common/index.js'

import { kProblemContext } from './inject.js'

const solutionScopedRoutes = defineRoutes(async (s) => {
  const { solutions, problemStatuses } = s.db
  const solutionRuleEvaluator = createEvaluator(SProblemSolutionRuleResult)<IProblemSolutionRuleCtx>

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
      const ctx = req.inject(kProblemContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const admin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)
      const { modifiedCount } = await solutions.updateOne(
        {
          _id: solutionId,
          contestId: { $exists: false },
          problemId: ctx._problemId,
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
      const ctx = req.inject(kProblemContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const admin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)
      if (!admin) return rep.forbidden()

      const { pull } = req.body
      const currentData = ctx._problem.data.find(
        ({ hash }) => hash === ctx._problem.currentDataHash
      )
      if (pull && !currentData) return rep.preconditionFailed('Current data not found')

      const { modifiedCount } = await solutions.updateOne(
        {
          _id: solutionId,
          contestId: { $exists: false },
          problemId: ctx._problemId,
          state: { $ne: SolutionState.CREATED }
        },
        [
          {
            $set: {
              label: pull ? currentData?.config.label : undefined,
              problemDataHash: pull ? ctx._problem.currentDataHash : undefined,
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
      const ctx = req.inject(kProblemContext)
      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const { solutionShowOther } = ctx._problem.settings
      const admin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)
      const solution = await solutions.findOne(
        {
          _id: solutionId,
          contestId: { $exists: false },
          problemId: ctx._problemId,
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
      const ctx = req.inject(kProblemContext)

      const { solutionShowOtherDetails, solutionShowDetails } = ctx._problem.settings
      const admin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)
      if (!solutionShowDetails && !admin) {
        throw s.httpErrors.forbidden()
      }
      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const solution = await solutions.findOne({
        _id: solutionId,
        contestId: { $exists: false },
        problemId: ctx._problemId
      })
      if (!solution) throw s.httpErrors.notFound()
      if (!solutionShowOtherDetails && !admin && !solution.userId.equals(req.user.userId)) {
        throw s.httpErrors.forbidden()
      }
      return [ctx._problem.orgId, solutionDetailsKey(solution._id)]
    },
    allowedTypes: ['download']
  })

  s.register(getFileUrl, {
    prefix: '/data',
    resolve: async (type, query, req) => {
      const ctx = req.inject(kProblemContext)

      const solutionId = loadUUID(req.params, 'solutionId', s.httpErrors.badRequest())
      const solution = await solutions.findOne({
        _id: solutionId,
        contestId: { $exists: false },
        problemId: ctx._problemId
      })
      if (!solution) throw s.httpErrors.notFound()
      const { solutionShowOtherData } = ctx._problem.settings
      let showData = !!solutionShowOtherData
      if (ctx._problem.rules?.solution) {
        const currentResult = await problemStatuses.findOne({
          userId: req.user.userId,
          problemId: ctx._problemId
        })
        const { showData: _showData } = solutionRuleEvaluator(
          {
            problem: ctx._problem,
            currentResult,
            solution
          },
          ctx._problem.rules.solution
        )
        if (typeof _showData === 'string') {
          throw s.httpErrors.forbidden(_showData)
        }
        showData = _showData ?? showData
      }
      const admin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)

      if (!showData && !admin && !solution.userId.equals(req.user.userId)) {
        throw s.httpErrors.forbidden()
      }
      return [ctx._problem.orgId, solutionDataKey(solution._id)]
    },
    allowedTypes: ['download']
  })
})

export const problemSolutionRoutes = defineRoutes(async (s) => {
  const { solutions } = s.db

  s.get(
    '/',
    {
      schema: {
        description: 'Get problem solutions',
        querystring: T.Object({
          userId: T.Optional(T.UUID()),
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
      const ctx = req.inject(kProblemContext)

      const { solutionShowOther } = ctx._problem.settings
      const userId = req.query.userId && new BSON.UUID(req.query.userId)
      const isAdmin = hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_ADMIN)
      const isCurrentUser = userId && req.user.userId.equals(userId)
      if (!isAdmin && !solutionShowOther && !isCurrentUser) {
        return rep.forbidden()
      }
      return await findPaginated<ISolution>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        solutions as any,
        req.query.page,
        req.query.perPage,
        req.query.count,
        {
          problemId: ctx._problemId,
          contestId: { $exists: false },
          userId: req.query.userId ? new BSON.UUID(req.query.userId) : undefined,
          state: req.query.state,
          status: req.query.status,
          score: generateRangeQuery(req.query.scoreL, req.query.scoreR),
          submittedAt: generateRangeQuery(req.query.submittedAtL, req.query.submittedAtR)
        },
        {
          projection: {
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
