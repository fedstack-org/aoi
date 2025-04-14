import { ORG_CAPS, CONTEST_CAPS, IPublicRanklist } from '../../db/index.js'
import { contestRanklistKey } from '../../index.js'
import { T } from '../../schemas/index.js'
import { CAP_ALL, hasCapability } from '../../utils/index.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { getFileUrl } from '../common/files.js'
import { defineRoutes, paramSchemaMerger, loadCapability } from '../common/index.js'

const kPubrkContext = defineInjectionPoint<{
  _ranklistId: number
  _pubranklist: IPublicRanklist
}>('pubrk')

export const pubrkScopedRoutes = defineRoutes(async (s) => {
  const { pubrk, contests } = s.db

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        ranklistId: T.Number()
      })
    )
  )

  s.addHook('onRequest', async (req) => {
    const ranklistId = +(req.params as Record<string, string>).ranklistId
    if (!Number.isInteger(ranklistId)) return s.httpErrors.notFound()
    const ranklist = await pubrk.findOne({ ranklistId: ranklistId })
    if (!ranklist) throw s.httpErrors.notFound()
    req.provide(kPubrkContext, {
      _ranklistId: ranklistId,
      _pubranklist: ranklist
    })
  })

  s.register(async (s) => {
    // Only download url is public
    s.addHook('onRoute', (route) => {
      ;(route.schema ??= {}).security = []
    })
    s.register(getFileUrl, {
      resolve: async (type, query, req) => {
        const ctx = req.inject(kPubrkContext)
        const { visible, password, orgId, ranklistKey, contestId } = ctx._pubranklist
        if (!visible) throw s.httpErrors.notFound()
        if (password && password !== req.headers['x-ranklist-password']) {
          throw s.httpErrors.forbidden()
        }
        const key = ranklistKey
        return [orgId, contestRanklistKey(contestId, key), query]
      },
      allowedTypes: ['download']
    })
  })

  s.get(
    '/settings',
    {
      schema: {
        response: {
          200: T.Object({
            visible: T.Boolean(),
            password: T.String()
          })
        }
      }
    },
    async (req) => {
      const ctx = req.inject(kPubrkContext)
      return {
        visible: ctx._pubranklist.visible,
        password: ctx._pubranklist.password ?? ''
      }
    }
  )

  s.patch(
    '/settings',
    {
      schema: {
        body: T.Object({
          visible: T.Boolean(),
          password: T.Optional(T.String())
        }),
        response: {
          200: T.Object({
            ok: T.Boolean()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kPubrkContext)
      const contest = await contests.findOne({ _id: ctx._pubranklist.contestId })
      if (!contest) throw s.httpErrors.notFound()
      const membership = await req.loadMembership(contest.orgId)
      const capability = loadCapability(
        contest,
        membership,
        ORG_CAPS.CAP_CONTEST,
        CONTEST_CAPS.CAP_ACCESS,
        CAP_ALL
      )
      if (!hasCapability(capability, CONTEST_CAPS.CAP_ADMIN)) {
        return rep.forbidden()
      }
      await pubrk.updateOne(
        { ranklistId: ctx._ranklistId },
        { $set: { visible: req.body.visible, password: req.body.password } }
      )
      return { ok: true }
    }
  )

  s.delete(
    '/',
    {
      schema: {
        response: {
          200: T.Object({
            ok: T.Boolean()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kPubrkContext)
      const contest = await contests.findOne({ _id: ctx._pubranklist.contestId })
      if (!contest) throw s.httpErrors.notFound()
      const membership = await req.loadMembership(contest.orgId)
      const capability = loadCapability(
        contest,
        membership,
        ORG_CAPS.CAP_CONTEST,
        CONTEST_CAPS.CAP_ACCESS,
        CAP_ALL
      )
      if (!hasCapability(capability, CONTEST_CAPS.CAP_ADMIN)) {
        return rep.forbidden()
      }
      const { deletedCount } = await pubrk.deleteOne({ ranklistId: ctx._ranklistId })
      return { ok: deletedCount === 1 }
    }
  )
})
