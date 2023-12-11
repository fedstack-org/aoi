import { Type } from '@sinclair/typebox'
import { defineRoutes } from '../../common/index.js'
import { SContestProblemSettings } from '../../../schemas/contest.js'
import { BSON } from 'mongodb'
import { ContestCapability, contests, problems } from '../../../db/index.js'
import { hasCapability } from '../../../utils/index.js'
import { kContestContext } from '../inject.js'

export const problemAdminRoutes = defineRoutes(async (s) => {
  s.addHook('onRequest', async (req, rep) => {
    const ctx = req.inject(kContestContext)
    if (!hasCapability(ctx._contestCapability, ContestCapability.CAP_ADMIN)) {
      return rep.forbidden()
    }
  })

  s.post(
    '/',
    {
      schema: {
        body: Type.Object({
          problemId: Type.String(),
          settings: SContestProblemSettings
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      const problemId = new BSON.UUID(req.body.problemId)
      const exists = await problems.countDocuments({
        _id: problemId,
        orgId: ctx._contest.orgId
      })
      if (!exists) return rep.notFound()
      const { modifiedCount } = await contests.updateOne(
        { _id: ctx._contestId, 'problems.problemId': { $ne: problemId } },
        { $push: { problems: { problemId, settings: req.body.settings } } }
      )
      if (!modifiedCount) return rep.conflict()
      return {}
    }
  )

  s.get(
    '/:problemId/settings',
    {
      schema: {
        params: Type.Object({
          problemId: Type.String()
        }),
        response: { 200: SContestProblemSettings }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      const problem = ctx._contest.problems.find(({ problemId }) =>
        problemId.equals(req.params.problemId)
      )
      if (!problem) return rep.notFound()
      return problem.settings
    }
  )

  s.patch(
    '/:problemId/settings',
    {
      schema: {
        params: Type.Object({
          problemId: Type.String()
        }),
        body: SContestProblemSettings
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      const problemId = new BSON.UUID(req.params.problemId)
      const { modifiedCount } = await contests.updateOne(
        { _id: ctx._contestId, 'problems.problemId': problemId },
        { $set: { 'problems.$.settings': req.body } }
      )
      if (!modifiedCount) return rep.notFound()
      return {}
    }
  )

  s.delete(
    '/:problemId',
    {
      schema: {
        params: Type.Object({
          problemId: Type.String()
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      const problemId = new BSON.UUID(req.params.problemId)
      const { modifiedCount } = await contests.updateOne(
        { _id: ctx._contestId },
        { $pull: { problems: { problemId } } }
      )
      if (!modifiedCount) return rep.notFound()
      return {}
    }
  )
})
