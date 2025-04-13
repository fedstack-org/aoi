import { Filter, UUID } from 'mongodb'

import { IPlan, ORG_CAPS, ORG_LIMITS } from '../../db/index.js'
import { T, AccessLevel } from '../../schemas/index.js'
import { CAP_NONE, findPaginated, hasCapability } from '../../utils/index.js'
import { searchToFilter, filterMerge } from '../../utils/search.js'
import { defineRoutes, swaggerTagMerger } from '../common/index.js'

import { planScopedRoutes } from './scoped.js'

export const planRoutes = defineRoutes(async (s) => {
  s.addHook('onRoute', swaggerTagMerger('plan'))

  s.post(
    '/',
    {
      schema: {
        description: 'Create a new plan',
        body: T.Object({
          orgId: T.String(),
          slug: T.String(),
          title: T.String(),
          accessLevel: T.AccessLevel()
        }),
        response: {
          200: T.Object({
            planId: T.UUID()
          })
        }
      }
    },
    async (req, rep) => {
      const orgId = new UUID(req.body.orgId)
      const membership = await req.loadMembership(orgId)
      if (!hasCapability(membership?.capability ?? CAP_NONE, ORG_CAPS.CAP_PLAN))
        return rep.forbidden()

      const { insertedId } = await s.db.plans.insertOne({
        _id: new UUID(),
        orgId,
        slug: req.body.slug,
        title: req.body.title,
        description: '',
        tags: [],
        contests: [],
        accessLevel: req.body.accessLevel,
        associations: [],
        settings: {},
        createdAt: req._now
      })
      return { planId: insertedId }
    }
  )

  s.get(
    '/tags',
    {
      schema: {
        description: 'List plan tags',
        querystring: T.Object({
          orgId: T.UUID()
        }),
        response: {
          200: T.Array(T.String())
        }
      }
    },
    async (req) => {
      const tags = await s.db.plans.distinct('tags', { orgId: new UUID(req.query.orgId) })
      return tags
    }
  )

  s.get(
    '/',
    {
      schema: {
        description: 'List plans',
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
              tags: T.Array(T.String())
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
      const accessFilter: Filter<IPlan> = { orgId }
      if (hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_PLAN)) {
        accessFilter['associations.principalId'] = { $in: principalIds }
      } else {
        accessFilter.$or = [
          { accessLevel: { $lte: basicAccessLevel } },
          { 'associations.principalId': { $in: principalIds } }
        ]
      }

      const filter = filterMerge(accessFilter, searchFilter)
      const result = await findPaginated(s.db.plans, page, perPage, count, filter, {
        projection: {
          _id: 1,
          accessLevel: 1,
          slug: 1,
          title: 1,
          tags: 1
        }
      })
      return result
    }
  )

  s.get(
    '/demo',
    {
      schema: {
        description: 'List plans to be demonstrated on the homepage',
        querystring: T.Object({
          orgId: T.String()
        }),
        response: {
          200: T.Array(
            T.Object({
              _id: T.UUID()
            })
          )
        }
      }
    },
    async (req) => {
      const { orgId: rawOrgId } = req.query
      const orgId = new UUID(rawOrgId)
      const searchFilter = { 'settings.promotion': true }
      const membership = await req.loadMembership(orgId)
      const basicAccessLevel = membership
        ? hasCapability(membership.capability, ORG_CAPS.CAP_CONTEST)
          ? AccessLevel.PRIVATE
          : AccessLevel.RESTRICED
        : AccessLevel.PUBLIC
      const principalIds = [req.user.userId, ...(membership?.groups ?? [])]
      const result = await s.db.plans
        .find(
          {
            orgId,
            ...searchFilter,
            $or: [
              { accessLevel: { $lte: basicAccessLevel } },
              { 'associations.principalId': { $in: principalIds } }
            ]
          },
          {
            projection: {
              _id: 1
            }
          }
        )
        .toArray()
      return result
    }
  )

  s.register(planScopedRoutes, { prefix: '/:planId' })
})
