import { BSON } from 'mongodb'

import {
  CONTEST_CAPS,
  IContestParticipantRuleCtx,
  ORG_CAPS,
  ORG_LIMITS,
  evalTagRules,
  getCurrentContestStage
} from '../../db/index.js'
import { SContestParticipantRuleResult, SContestStage, T } from '../../schemas/index.js'
import {
  CAP_ALL,
  CAP_NONE,
  createEvaluator,
  ensureCapability,
  hasCapability
} from '../../utils/index.js'
import { manageContent } from '../common/content.js'
import { defineRoutes, loadCapability, loadUUID, paramSchemaMerger } from '../common/index.js'

import { contestAdminRoutes } from './admin.js'
import { contestAttachmentRoutes } from './attachment.js'
import { kContestContext } from './inject.js'
import { contestParticipantRoutes } from './participant/index.js'
import { contestProblemRoutes } from './problem/index.js'
import { contestRanklistRoutes } from './ranklist/index.js'
import { contestSolutionRoutes } from './solution/index.js'

export const contestScopedRoutes = defineRoutes(async (s) => {
  const { contests, contestParticipants, users } = s.db
  const participantRuleEvaluator = createEvaluator(
    SContestParticipantRuleResult
  )<IContestParticipantRuleCtx>

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        contestId: T.String({ format: 'uuid' })
      })
    )
  )

  s.addHook('onRequest', async (req, rep) => {
    const contestId = loadUUID(req.params, 'contestId', s.httpErrors.badRequest())
    const contest = await contests.findOne({ _id: contestId })
    if (!contest) return rep.notFound()
    const membership = await req.loadMembership(contest.orgId)
    const limited = hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_CONTEST)
    const capability = loadCapability(
      contest,
      membership,
      ORG_CAPS.CAP_CONTEST,
      limited ? CAP_NONE : CONTEST_CAPS.CAP_ACCESS,
      CAP_ALL
    )
    const participant = await contestParticipants.findOne({
      contestId: contestId,
      userId: req.user.userId
    })
    if (!participant) {
      ensureCapability(capability, CONTEST_CAPS.CAP_ACCESS, s.httpErrors.forbidden())
    } else if (participant.banned) {
      ensureCapability(capability, CONTEST_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
    }
    req.provide(kContestContext, {
      _contestId: contestId,
      _contest: contest,
      _contestStage: getCurrentContestStage(req._now, contest),
      _contestCapability: capability,
      _contestParticipant: await contestParticipants.findOne({
        contestId: contestId,
        userId: req.user.userId
      })
    })
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get contest details',
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
            stages: T.Array(T.Pick(SContestStage, ['name', 'start'] as const)),
            currentStage: SContestStage
          })
        }
      }
    },
    async (req) => {
      const ctx = req.inject(kContestContext)
      return {
        ...ctx._contest,
        capability: ctx._contestCapability.toString(),
        currentStage: ctx._contestStage
      }
    }
  )

  s.post(
    '/register',
    {
      schema: {
        description: 'Register for a contest',
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      const { registrationEnabled, registrationAllowPublic } = ctx._contestStage.settings
      if (!registrationEnabled && !hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_ADMIN)) {
        return rep.forbidden()
      }
      if (
        !registrationAllowPublic &&
        !hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_REGISTRATION)
      ) {
        return rep.forbidden()
      }

      const user = await users.findOne({ _id: req.user.userId })
      if (!user) return rep.notFound()
      let tags = await evalTagRules(ctx._contestStage, user)
      if (ctx._contest.rules?.participant) {
        const { allowRegister, tags: _tags } = participantRuleEvaluator(
          {
            contest: ctx._contest,
            currentStage: ctx._contestStage,
            user
          },
          ctx._contest.rules?.participant,
          {}
        )
        if (typeof allowRegister === 'string') {
          return rep.forbidden(allowRegister)
        }
        if (allowRegister === false) {
          return rep.forbidden('Cannot register for contest')
        }
        tags = [...(tags ?? []), ..._tags]
      }
      await contestParticipants.insertOne(
        {
          _id: new BSON.UUID(),
          userId: req.user.userId,
          contestId: ctx._contestId,
          results: {},
          tags,
          createdAt: req._now,
          updatedAt: req._now
        },
        { ignoreUndefined: true }
      )

      // TODO: This operation is not atomic along with registration
      await contests.updateOne({ _id: ctx._contestId }, { $inc: { participantCount: 1 } })

      return {}
    }
  )

  s.get(
    '/self',
    {
      schema: {
        description: 'Get participant details of self',
        response: {
          200: T.Object({
            results: T.Record(
              T.String(),
              T.Object({
                solutionCount: T.Number()
              })
            )
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kContestContext)
      if (!ctx._contestParticipant) return rep.preconditionFailed()
      return ctx._contestParticipant
    }
  )

  s.register(manageContent, {
    collection: contests,
    resolve: async (req) => {
      const ctx = req.inject(kContestContext)
      if (!hasCapability(ctx._contestCapability, CONTEST_CAPS.CAP_CONTENT)) return null
      return ctx._contestId
    },
    prefix: '/content'
  })

  s.register(contestAdminRoutes, { prefix: '/admin' })
  s.register(contestAttachmentRoutes, { prefix: '/attachment' })
  s.register(contestRanklistRoutes, { prefix: '/ranklist' })
  s.register(contestProblemRoutes, { prefix: '/problem' })
  s.register(contestSolutionRoutes, { prefix: '/solution' })
  s.register(contestParticipantRoutes, { prefix: '/participant' })
})
