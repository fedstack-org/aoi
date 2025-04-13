import { SProblemConfigSchema } from '@aoi-js/common'
import { BSON, MongoServerError } from 'mongodb'

import { PROBLEM_CAPS, ORG_CAPS, SolutionState, ORG_LIMITS } from '../../db/index.js'
import { InstanceState, InstanceTaskState } from '../../db/instance.js'
import { getUploadUrl, solutionDataKey } from '../../oss/index.js'
import { T, SProblemSettings } from '../../schemas/index.js'
import { CAP_ALL, CAP_NONE, ensureCapability, hasCapability } from '../../utils/capability.js'
import { manageContent } from '../common/content.js'
import { defineRoutes, loadCapability, loadUUID, paramSchemaMerger } from '../common/index.js'

import { problemAdminRoutes } from './admin.js'
import { problemAttachmentRoutes } from './attachment.js'
import { problemDataRoutes } from './data.js'
import { kProblemContext } from './inject.js'
import { problemSolutionRoutes } from './solution.js'

const problemIdSchema = T.Object({
  problemId: T.String()
})

export const problemScopedRoutes = defineRoutes(async (s) => {
  const { problems, solutions, problemStatuses, orgs, instances } = s.db

  s.addHook('onRoute', paramSchemaMerger(problemIdSchema))

  s.addHook('onRequest', async (req) => {
    const problemId = loadUUID(req.params, 'problemId', s.httpErrors.notFound())
    // TODO: optimize using projection
    const problem = await problems.findOne({ _id: problemId })
    if (!problem) throw s.httpErrors.notFound()
    const membership = await req.loadMembership(problem.orgId)
    const limited = hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_PROBLEM)
    const capability = loadCapability(
      problem,
      membership,
      ORG_CAPS.CAP_PROBLEM,
      limited ? CAP_NONE : PROBLEM_CAPS.CAP_ACCESS,
      CAP_ALL
    )
    ensureCapability(capability, PROBLEM_CAPS.CAP_ACCESS, s.httpErrors.forbidden())
    req.provide(kProblemContext, {
      _problemId: problemId,
      _problemCapability: capability,
      _problem: problem
    })
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get problem details',
        response: {
          200: T.Object({
            _id: T.UUID(),
            orgId: T.UUID(),
            accessLevel: T.AccessLevel(),
            slug: T.String(),
            title: T.String(),
            description: T.String(),
            tags: T.Array(T.String()),
            capability: T.String(),
            currentDataHash: T.String(),
            config: T.Optional(T.Omit(SProblemConfigSchema, ['judge', 'instance'])),
            settings: SProblemSettings
          })
        }
      }
    },
    async (req) => {
      const ctx = req.inject(kProblemContext)

      return {
        ...ctx._problem,
        capability: ctx._problemCapability.toString(),
        config: ctx._problem.data.find(({ hash }) => hash === ctx._problem.currentDataHash)?.config
      }
    }
  )

  s.post(
    '/solution',
    {
      schema: {
        description: 'Submit a solution',
        body: T.Object({
          hash: T.Hash(),
          size: T.Integer(),
          preferPrivate: T.Optional(T.Boolean())
        }),
        response: {
          200: T.Object({
            solutionId: T.UUID(),
            uploadUrl: T.String()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kProblemContext)

      const { allowPublicSubmit, maxSolutionCount } = ctx._problem.settings
      if (!allowPublicSubmit && !hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_SOLUTION)) {
        return rep.preconditionFailed()
      }

      const org = await orgs.findOne(
        { _id: ctx._problem.orgId },
        { projection: { 'settings.oss': 1 } }
      )
      const oss = org?.settings.oss
      if (!oss) return rep.preconditionFailed('OSS not configured')

      const { data, currentDataHash } = ctx._problem
      const currentData = data.find(({ hash }) => hash === currentDataHash)
      if (!currentData) return rep.preconditionFailed('Current data not found')
      const { config } = currentData

      const maxSize = config.solution?.maxSize ?? 1024 * 1024 * 10 // 10MiB
      if (req.body.size > maxSize) return rep.badRequest('Solution too large')

      const value = await solutions.findOneAndUpdate(
        {
          problemId: ctx._problemId,
          contestId: { $exists: false },
          userId: req.user.userId,
          state: SolutionState.CREATED
        },
        {
          $set: {
            label: config.label,
            problemDataHash: currentDataHash,
            solutionDataHash: req.body.hash,
            preferPrivate: req.body.preferPrivate
          }
        },
        { returnDocument: 'after', ignoreUndefined: true }
      )
      if (value) {
        const uploadUrl = await getUploadUrl(oss, solutionDataKey(value._id), {
          expiresIn: 300,
          size: req.body.size
        })
        return { solutionId: value._id, uploadUrl }
      }

      const newSolutionId = new BSON.UUID()
      try {
        const { modifiedCount, upsertedCount } = await problemStatuses.updateOne(
          {
            userId: req.user.userId,
            problemId: ctx._problemId,
            solutionCount: maxSolutionCount ? { $lt: maxSolutionCount } : undefined
          },
          {
            $inc: { solutionCount: 1 },
            $set: { lastSolutionId: newSolutionId, lastSolutionScore: 0, lastSolutionStatus: '' },
            $setOnInsert: { _id: new BSON.UUID() }
          },
          { upsert: true, ignoreUndefined: true }
        )
        if (!(modifiedCount + upsertedCount)) {
          return rep.preconditionFailed('Solution limit reached')
        }
      } catch (err) {
        // E11000 duplicate key error
        if (err instanceof MongoServerError && err.code === 11000) {
          return rep.preconditionFailed('Solution limit reached')
        }
        throw err
      }

      const { insertedId } = await solutions.insertOne(
        {
          _id: newSolutionId,
          orgId: ctx._problem.orgId,
          problemId: ctx._problem._id,
          userId: req.user.userId,
          label: config.label,
          problemDataHash: currentDataHash,
          state: SolutionState.CREATED,
          solutionDataHash: req.body.hash,
          score: 0,
          metrics: {},
          status: '',
          message: '',
          // createdAt is only a reference time,
          // so use local time here
          createdAt: req._now,
          preferPrivate: req.body.preferPrivate
        },
        { ignoreUndefined: true }
      )
      const uploadUrl = await getUploadUrl(oss, solutionDataKey(insertedId), {
        expiresIn: 300,
        size: req.body.size
      })
      return { solutionId: insertedId, uploadUrl }
    }
  )

  s.post(
    '/instance',
    {
      schema: {
        description: 'Open an instance',
        response: {
          200: T.Object({
            instanceId: T.UUID()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kProblemContext)

      const { allowPublicInstance, maxInstanceCount } = ctx._problem.settings
      if (
        !allowPublicInstance &&
        !hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_INSTANCE)
      ) {
        return rep.preconditionFailed()
      }

      const org = await orgs.findOne(
        { _id: ctx._problem.orgId },
        { projection: { 'settings.problemInstanceLimit': 1 } }
      )
      const totalSeats = org?.settings.problemInstanceLimit
      if (!totalSeats) return rep.preconditionFailed('Problem instance is disabled in organization')

      const { data, currentDataHash } = ctx._problem
      const currentData = data.find(({ hash }) => hash === currentDataHash)
      if (!currentData) {
        return rep.preconditionFailed('Current data not found')
      }
      const { config } = currentData
      if (!config.instanceLabel || !config.instance) {
        return rep.preconditionFailed('Instance config not found')
      }

      const existing = await instances
        .find(
          {
            orgId: ctx._problem.orgId,
            userId: req.user.userId,
            contestId: { $exists: false },
            state: { $ne: InstanceState.DESTROYED }
          },
          { projection: { slotNo: 1 } }
        )
        .toArray()
      if (existing.length >= totalSeats) {
        return rep.preconditionFailed('Instance limit reached')
      }
      let availableSlot = -1
      for (let i = 0; i < totalSeats; i++) {
        if (!existing.some((x) => x.slotNo === i)) {
          availableSlot = i
          break
        }
      }
      if (availableSlot === -1) {
        return rep.preconditionFailed('Instance limit reached')
      }

      try {
        const { modifiedCount, upsertedCount } = await problemStatuses.updateOne(
          {
            userId: req.user.userId,
            problemId: ctx._problemId,
            instanceCount: maxInstanceCount ? { $lt: maxInstanceCount } : undefined
          },
          {
            $inc: { instanceCount: 1 },
            $setOnInsert: { _id: new BSON.UUID() }
          },
          { upsert: true, ignoreUndefined: true }
        )
        if (!(modifiedCount + upsertedCount)) {
          return rep.preconditionFailed('Instance limit reached')
        }
      } catch (err) {
        // E11000 duplicate key error
        if (err instanceof MongoServerError && err.code === 11000) {
          return rep.preconditionFailed('Instance limit reached')
        }
        throw err
      }

      try {
        const { insertedId } = await instances.insertOne(
          {
            _id: new BSON.UUID(),
            orgId: ctx._problem.orgId,
            problemId: ctx._problem._id,
            userId: req.user.userId,
            slotNo: availableSlot,
            label: config.instanceLabel,
            problemDataHash: currentDataHash,
            state: InstanceState.ALLOCATING,
            taskState: InstanceTaskState.PENDING,
            taskStartedAt: req._now,
            message: '',
            createdAt: req._now
          },
          { ignoreUndefined: true }
        )
        return { instanceId: insertedId }
      } catch (err) {
        // E11000 duplicate key error
        if (err instanceof MongoServerError && err.code === 11000) {
          return rep.preconditionFailed('Instance limit reached')
        }
        throw err
      }
    }
  )

  s.register(manageContent, {
    collection: problems,
    resolve: async (req) => {
      const ctx = req.inject(kProblemContext)

      if (!hasCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_CONTENT)) return null
      return ctx._problemId
    },
    prefix: '/content'
  })

  s.register(problemAttachmentRoutes, { prefix: '/attachment' })
  s.register(problemDataRoutes, { prefix: '/data' })
  s.register(problemAdminRoutes, { prefix: '/admin' })
  s.register(problemSolutionRoutes, { prefix: '/solution' })
})
