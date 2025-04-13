import { Filter, UUID } from 'mongodb'

import { ContestRanklistState, IContest, ORG_CAPS, ORG_LIMITS } from '../../db/index.js'
import { SContestStage } from '../../schemas/contest.js'
import { T, AccessLevel } from '../../schemas/index.js'
import { CAP_NONE, ensureCapability, findPaginated, hasCapability } from '../../utils/index.js'
import { searchToFilter, filterMerge } from '../../utils/search.js'
import { defineRoutes, loadUUID, swaggerTagMerger } from '../common/index.js'

import { contestScopedRoutes } from './scoped.js'

export const contestRoutes = defineRoutes(async (s) => {
  const { contests, orgMemberships } = s.db

  s.addHook('onRoute', swaggerTagMerger('contest'))

  s.register(contestScopedRoutes, { prefix: '/:contestId' })

  s.post(
    '/',
    {
      schema: {
        description: 'Create a new contest',
        body: T.Object({
          orgId: T.String(),
          slug: T.String(),
          title: T.String(),
          accessLevel: T.AccessLevel(),
          start: T.Integer(),
          duration: T.Integer()
        }),
        response: {
          200: T.Object({
            contestId: T.UUID()
          })
        }
      }
    },
    async (req) => {
      const orgId = loadUUID(req.body, 'orgId', s.httpErrors.badRequest())
      const membership = await req.loadMembership(orgId)
      ensureCapability(
        membership?.capability ?? CAP_NONE,
        ORG_CAPS.CAP_CONTEST,
        s.httpErrors.forbidden()
      )
      const { insertedId } = await contests.insertOne({
        _id: new UUID(),
        orgId,
        slug: req.body.slug,
        title: req.body.title,
        description: '',
        tags: [],
        problems: [],
        stages: [
          { name: 'upcoming', start: 0, settings: {} },
          { name: 'running', start: req.body.start, settings: {} },
          { name: 'end', start: req.body.start + req.body.duration, settings: {} }
        ],
        start: req.body.start,
        end: req.body.start + req.body.duration,
        attachments: [],
        associations: [],
        ranklists: [],
        ranklistState: ContestRanklistState.VALID,
        ranklistUpdatedAt: 0,
        accessLevel: req.body.accessLevel,
        participantCount: 0
      })
      return { contestId: insertedId }
    }
  )

  s.get(
    '/tags',
    {
      schema: {
        description: 'List contest tags',
        querystring: T.Object({
          orgId: T.UUID()
        }),
        response: {
          200: T.Array(T.String())
        }
      }
    },
    async (req) => {
      const tags = await contests.distinct('tags', { orgId: new UUID(req.query.orgId) })
      return tags
    }
  )

  s.get(
    '/',
    {
      schema: {
        description: 'List contests',
        querystring: T.Object({
          orgId: T.UUID(),
          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false }),
          search: T.Optional(T.String({ minLength: 1 })),
          tag: T.Optional(T.String())
        }),
        response: {
          200: T.PaginationResult(
            T.Object({
              _id: T.UUID(),
              accessLevel: T.AccessLevel(),
              slug: T.String(),
              title: T.String(),
              tags: T.Array(T.String()),
              start: T.Integer(),
              end: T.Integer(),
              stages: T.Array(T.Pick(SContestStage, ['name', 'start'] as const)),
              participantCount: T.Integer()
            })
          )
        }
      }
    },
    async (req, rep) => {
      const { orgId: rawOrgId, page, perPage, count, ...rest } = req.query
      const orgId = new UUID(rawOrgId)
      const searchFilter = searchToFilter(rest)
      if (!searchFilter) return rep.badRequest('Bad search parameters')

      const membership = await req.loadMembership(orgId)
      const basicAccessLevel = membership
        ? hasCapability(membership.capability, ORG_CAPS.CAP_CONTEST)
          ? AccessLevel.PRIVATE
          : AccessLevel.RESTRICED
        : AccessLevel.PUBLIC
      const principalIds = [req.user.userId, ...(membership?.groups ?? [])]
      const accessFilter: Filter<IContest> = { orgId }
      if (hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_CONTEST)) {
        accessFilter['associations.principalId'] = { $in: principalIds }
      } else {
        accessFilter.$or = [
          { accessLevel: { $lte: basicAccessLevel } },
          { 'associations.principalId': { $in: principalIds } }
        ]
      }

      const filter = filterMerge(accessFilter, searchFilter)
      const result = await findPaginated(
        contests,
        page,
        perPage,
        count,
        filter,
        {
          projection: {
            _id: 1,
            accessLevel: 1,
            slug: 1,
            title: 1,
            tags: 1,
            start: 1,
            end: 1,
            stages: {
              name: 1,
              start: 1
            },
            participantCount: 1
          }
        },
        { status: -1, start: -1 }
      )
      return result
    }
  )

  s.get(
    '/public',
    {
      schema: {
        description: 'List public contests',
        security: [],
        querystring: T.Object({
          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false }),
          search: T.Optional(T.String({ minLength: 1 })),
          tag: T.Optional(T.String())
        }),
        response: {
          200: T.PaginationResult(
            T.Object({
              _id: T.UUID(),
              orgId: T.UUID(),
              slug: T.String(),
              title: T.String(),
              tags: T.Array(T.String()),
              stages: T.Array(T.Pick(SContestStage, ['name', 'start'] as const)),
              participantCount: T.Integer()
            })
          )
        }
      }
    },
    async (req, rep) => {
      const { page, perPage, count, ...rest } = req.query
      const searchFilter = searchToFilter(rest)
      if (!searchFilter) return rep.badRequest('Bad search parameters')

      const joinedOrgs = await orgMemberships.find({ userId: req.user.userId }).toArray()
      const orgBlacklist = joinedOrgs
        .filter((member) => hasCapability(member.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_CONTEST))
        .map((member) => member.orgId)

      const filter = filterMerge(
        { accessLevel: AccessLevel.PUBLIC, orgId: { $nin: orgBlacklist } },
        searchFilter
      )
      const result = await findPaginated(
        contests,
        page,
        perPage,
        count,
        filter,
        {
          projection: {
            _id: 1,
            orgId: 1,
            slug: 1,
            title: 1,
            tags: 1,
            stages: {
              name: 1,
              start: 1
            },
            participantCount: 1
          }
        },
        { status: -1, start: -1 }
      )
      return result
    }
  )
})
