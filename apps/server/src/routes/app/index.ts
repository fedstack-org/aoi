import { randomBytes } from 'node:crypto'

import { Filter, UUID } from 'mongodb'

import { IApp, ORG_CAPS, ORG_LIMITS } from '../../db/index.js'
import { T, AccessLevel } from '../../schemas/index.js'
import { CAP_NONE, findPaginated, hasCapability } from '../../utils/index.js'
import { filterMerge, searchToFilter } from '../../utils/search.js'
import { defineRoutes, swaggerTagMerger } from '../common/index.js'

import { appScopedRoutes } from './scoped.js'

export const appRoutes = defineRoutes(async (s) => {
  const { apps } = s.db

  s.addHook('onRoute', swaggerTagMerger('app'))

  s.post(
    '/',
    {
      schema: {
        description: 'Create a new app',
        body: T.Object({
          orgId: T.String(),
          slug: T.String(),
          title: T.String(),
          accessLevel: T.AccessLevel()
        }),
        response: {
          200: T.Object({
            appId: T.UUID()
          })
        }
      }
    },
    async (req, rep) => {
      const orgId = new UUID(req.body.orgId)
      const membership = await req.loadMembership(orgId)
      if (!hasCapability(membership?.capability ?? CAP_NONE, ORG_CAPS.CAP_APP))
        return rep.forbidden()

      const secret = randomBytes(32).toString('base64url')

      const { insertedId } = await apps.insertOne({
        _id: new UUID(),
        orgId,
        slug: req.body.slug,
        title: req.body.title,
        description: '',
        tags: [],
        accessLevel: req.body.accessLevel,
        associations: [],
        settings: {},
        secret,
        createdAt: req._now
      })
      return { appId: insertedId, secret }
    }
  )

  s.get(
    '/',
    {
      schema: {
        description: 'List apps',
        querystring: T.Object({
          orgId: T.String(),
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
      const accessFilter: Filter<IApp> = { orgId }
      if (hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_APP)) {
        accessFilter['associations.principalId'] = { $in: principalIds }
      } else {
        accessFilter.$or = [
          { accessLevel: { $lte: basicAccessLevel } },
          { 'associations.principalId': { $in: principalIds } }
        ]
      }

      const filter = filterMerge(accessFilter, searchFilter)
      const result = await findPaginated(apps, page, perPage, count, filter, {
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

  s.register(appScopedRoutes, { prefix: '/:appId' })
})
