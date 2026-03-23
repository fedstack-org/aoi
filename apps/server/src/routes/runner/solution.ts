import { SProblemConfigSchema } from '@aoi-js/common'
import { BSON } from 'mongodb'

import { ContestRanklistState, SolutionState } from '../../db/index.js'
import { getDownloadUrl, problemDataKey, solutionDataKey, solutionDetailsKey } from '../../index.js'
import { T } from '../../schemas/index.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { getFileUrl } from '../common/files.js'
import { defineRoutes, loadUUID, paramSchemaMerger } from '../common/index.js'

import { kRunnerContext } from './inject.js'

const kRunnerSolutionContext = defineInjectionPoint<{
  _solutionId: BSON.UUID
  _taskId: BSON.UUID
}>('runnerSolution')

const runnerTaskRoutes = defineRoutes(async (s) => {
  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        solutionId: T.UUID(),
        taskId: T.UUID()
      })
    )
  )

  s.addHook('onRequest', async (req) => {
    req.provide(kRunnerSolutionContext, {
      _solutionId: loadUUID(req.params, 'solutionId', s.httpErrors.notFound()),
      _taskId: loadUUID(req.params, 'taskId', s.httpErrors.notFound())
    })
  })

  s.patch(
    '/',
    {
      schema: {
        description: 'Update solution result',
        body: T.Partial(
          T.Object(
            {
              status: T.String(),
              score: T.Number({ minimum: 0, maximum: 100 }),
              metrics: T.Record(T.String(), T.Number()),
              message: T.String()
            },
            { additionalProperties: false }
          )
        ),
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kRunnerSolutionContext)
      const { matchedCount } = await s.db.solutions.updateOne(
        {
          _id: ctx._solutionId,
          taskId: ctx._taskId,
          state: { $in: [SolutionState.QUEUED, SolutionState.RUNNING] }
        },
        { $set: { state: SolutionState.RUNNING, ...req.body } }
      )
      if (matchedCount === 0) return rep.conflict()
      return {}
    }
  )

  s.register(getFileUrl, {
    prefix: '/details',
    resolve: async (type, query, req) => {
      const ctx = req.inject(kRunnerSolutionContext)
      const solution = await s.db.solutions.findOne(
        { _id: ctx._solutionId, taskId: ctx._taskId },
        { projection: { orgId: 1 } }
      )
      if (!solution) throw s.httpErrors.notFound()
      return [solution.orgId, solutionDetailsKey(solution._id)]
    }
  })

  s.post(
    '/complete',
    {
      schema: {
        description: 'Mark solution as completed',
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kRunnerSolutionContext)
      const value = await s.db.solutions.findOneAndUpdate(
        {
          _id: ctx._solutionId,
          taskId: ctx._taskId,
          state: { $in: [SolutionState.QUEUED, SolutionState.RUNNING] }
        },
        // Since completedAt is only for reference,
        // use local time here
        { $set: { state: SolutionState.COMPLETED, completedAt: req._now } },
        { projection: { userId: 1, problemId: 1, contestId: 1, score: 1, status: 1 } }
      )
      if (!value) return rep.conflict()
      if (value.contestId) {
        const { modifiedCount } = await s.db.contestParticipants.updateOne(
          {
            userId: value.userId,
            contestId: value.contestId,
            [`results.${value.problemId}.lastSolutionId`]: value._id
          },
          [
            {
              $set: {
                [`results.${value.problemId}.lastSolution`]: {
                  _id: value._id,
                  score: value.score,
                  status: value.status,
                  completedAt: req._now
                },
                updatedAt: { $convert: { input: '$$NOW', to: 'double' } }
              }
            }
          ]
        )
        if (modifiedCount) {
          // update contest ranklist state
          await s.db.contests.updateOne(
            {
              _id: value.contestId,
              ranklists: { $exists: true, $ne: [] }
            },
            [
              {
                $set: {
                  ranklistUpdatedAt: { $convert: { input: '$$NOW', to: 'double' } },
                  ranklistState: ContestRanklistState.INVALID
                }
              }
            ]
          )
        }
      } else {
        // update problem status
        await s.db.problemStatuses.updateOne(
          {
            userId: value.userId,
            problemId: value.problemId,
            lastSolutionId: value._id
          },
          {
            $set: {
              lastSolutionScore: value.score,
              lastSolutionStatus: value.status
            }
          },
          { ignoreUndefined: true }
        )
      }
      return {}
    }
  )
})

export const runnerSolutionRoutes = defineRoutes(async (s) => {
  s.post(
    '/poll',
    {
      schema: {
        description: 'Poll for a new solution',
        response: {
          200: T.Partial(
            T.Object({
              taskId: T.UUID(),
              solutionId: T.UUID(),
              orgId: T.UUID(),
              userId: T.UUID(),
              problemId: T.UUID(),
              contestId: T.UUID(),
              problemConfig: SProblemConfigSchema,
              problemDataUrl: T.String(),
              problemDataHash: T.String(),
              solutionDataUrl: T.String(),
              solutionDataHash: T.String(),
              errMsg: T.String()
            })
          )
        }
      }
    },
    async (req) => {
      const runnerCtx = req.inject(kRunnerContext)
      const taskId = new BSON.UUID()
      const solution = await s.db.solutions.findOneAndUpdate(
        {
          orgId: runnerCtx._runner.orgId,
          state: SolutionState.PENDING,
          label: { $in: runnerCtx._runner.labels }
        },
        { $set: { state: SolutionState.QUEUED, runnerId: runnerCtx._runner._id, taskId } }
      )
      if (!solution) return {}

      const info = {
        taskId,
        solutionId: solution._id,
        orgId: solution.orgId,
        userId: solution.userId,
        problemId: solution.problemId,
        contestId: solution.contestId
      }

      const org = await s.db.orgs.findOne(
        { _id: runnerCtx._runner.orgId },
        { projection: { 'settings.oss': 1 } }
      )
      const oss = org?.settings.oss
      if (!oss) return { ...info, errMsg: 'OSS not enabled' }
      const problem = await s.db.problems.findOne({ _id: solution.problemId })
      if (!problem) return { ...info, errMsg: 'Problem not found' }
      const problemData = problem.data.find(({ hash }) => hash === solution.problemDataHash)
      if (!problemData) return { ...info, errMsg: 'Problem data not found' }

      const problemDataUrl = await getDownloadUrl(
        oss,
        problemDataKey(problem._id, solution.problemDataHash)
      )
      const solutionDataUrl = await getDownloadUrl(oss, solutionDataKey(solution._id))

      return {
        ...info,
        problemConfig: problemData.config,
        problemDataUrl,
        problemDataHash: solution.problemDataHash,
        solutionDataUrl,
        solutionDataHash: solution.solutionDataHash
      }
    }
  )

  s.register(runnerTaskRoutes, { prefix: '/task/:solutionId/:taskId' })
})
