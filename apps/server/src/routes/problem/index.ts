import { Filter, UUID } from 'mongodb'

import { IProblem, ORG_CAPS, ORG_LIMITS } from '../../db/index.js'
import { T, AccessLevel } from '../../schemas/index.js'
import { CAP_NONE, ensureCapability, hasCapability } from '../../utils/capability.js'
import { paginationSkip } from '../../utils/pagination.js'
import { searchToFilter, filterMerge } from '../../utils/search.js'
import { defineRoutes, loadUUID, swaggerTagMerger } from '../common/index.js'

import { problemScopedRoutes } from './scoped.js'

export const problemRoutes = defineRoutes(async (s) => {
  const { problems } = s.db

  s.addHook('onRoute', swaggerTagMerger('problem'))

  s.register(problemScopedRoutes, { prefix: '/:problemId' })

  s.post(
    '/',
    {
      schema: {
        description: 'Create a new problem',
        body: T.Object({
          orgId: T.String(),
          slug: T.String(),
          title: T.String(),
          accessLevel: T.AccessLevel()
        }),
        response: {
          200: T.Object({
            problemId: T.UUID()
          })
        }
      }
    },
    async (req) => {
      const orgId = loadUUID(req.body, 'orgId', s.httpErrors.badRequest())
      const membership = await req.loadMembership(orgId)
      ensureCapability(
        membership?.capability ?? CAP_NONE,
        ORG_CAPS.CAP_PROBLEM,
        s.httpErrors.forbidden()
      )
      const { insertedId } = await problems.insertOne({
        _id: new UUID(),
        orgId,
        slug: req.body.slug,
        title: req.body.title,
        description: '',
        tags: [],
        attachments: [],
        data: [],
        currentDataHash: '',
        settings: { allowPublicSubmit: false },
        associations: [],
        accessLevel: req.body.accessLevel,
        createdAt: Date.now()
      })
      return {
        problemId: insertedId
      }
    }
  )

  s.get(
    '/tags',
    {
      schema: {
        description: 'List problem tags',
        querystring: T.Object({
          orgId: T.UUID()
        }),
        response: {
          200: T.Array(T.String())
        }
      }
    },
    async (req) => {
      const tags = await problems.distinct('tags', { orgId: new UUID(req.query.orgId) })
      return tags
    }
  )

  s.get(
    '/',
    {
      schema: {
        description: 'List problems',
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
              orgId: T.UUID(),
              slug: T.String(),
              title: T.String(),
              tags: T.Array(T.String()),
              accessLevel: T.AccessLevel(),
              createdAt: T.Integer(),
              status: T.Optional(
                T.Partial(
                  T.Object({
                    solutionCount: T.Integer(),
                    lastSolutionId: T.UUID(),
                    lastSolutionScore: T.Number(),
                    lastSolutionStatus: T.String()
                  })
                )
              )
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
        ? hasCapability(membership.capability, ORG_CAPS.CAP_PROBLEM)
          ? AccessLevel.PRIVATE
          : AccessLevel.RESTRICED
        : AccessLevel.PUBLIC
      const principalIds = [req.user.userId, ...(membership?.groups ?? [])]
      const accessFilter: Filter<IProblem> = { orgId }
      if (hasCapability(membership?.limit ?? CAP_NONE, ORG_LIMITS.LIMIT_PROBLEM)) {
        // Limited
        accessFilter['associations.principalId'] = { $in: principalIds }
      } else {
        accessFilter.$or = [
          { accessLevel: { $lte: basicAccessLevel } },
          { 'associations.principalId': { $in: principalIds } }
        ]
      }

      const filter = filterMerge(accessFilter, searchFilter)
      let total = 0
      if (count) {
        total = await problems.countDocuments(filter)
      }
      const skip = paginationSkip(page, perPage)
      const items = await problems
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .aggregate<any>([
          { $match: filter },
          { $skip: skip },
          { $limit: perPage },
          {
            $lookup: {
              from: 'problemStatuses',
              let: { problemId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$problemId', '$$problemId'] },
                        { $eq: ['$userId', req.user.userId] }
                      ]
                    }
                  }
                }
              ],
              as: 'status'
            }
          },
          { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } }
        ])
        .toArray()

      return { total, items }
    }
  )

  s.post(
    '/recommend',
    {
      schema: {
        description: 'Recommend problems',
        body: T.Object({
          orgId: T.UUID(),
          search: T.Optional(T.String({ minLength: 1 })),
          tags: T.Optional(T.Array(T.String())),
          sample: T.Integer({ minimum: 1, maximum: 15 })
        }),
        response: {
          200: T.Array(
            T.Object({
              _id: T.UUID(),
              orgId: T.UUID(),
              slug: T.String(),
              title: T.String(),
              tags: T.Array(T.String()),
              accessLevel: T.AccessLevel(),
              createdAt: T.Integer(),
              status: T.Optional(
                T.Partial(
                  T.Object({
                    solutionCount: T.Integer(),
                    lastSolutionId: T.UUID(),
                    lastSolutionScore: T.Number(),
                    lastSolutionStatus: T.String()
                  })
                )
              )
            })
          )
        }
      }
    },
    async (req) => {
      const { orgId: rawOrgId, sample, ...rest } = req.body
      const orgId = new UUID(rawOrgId)

      const membership = await req.loadMembership(orgId)
      ensureCapability(
        membership?.capability ?? CAP_NONE,
        ORG_CAPS.CAP_PROBLEM,
        s.httpErrors.forbidden()
      )

      const items = await problems
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .aggregate<any>(
          [
            {
              $match: {
                $and: [{ orgId }, searchToFilter(rest, { maxConditions: Infinity })]
              }
            },
            { $sample: { size: sample } },
            {
              $lookup: {
                from: 'problemStatuses',
                let: { problemId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$problemId', '$$problemId'] },
                          { $eq: ['$userId', req.user.userId] }
                        ]
                      }
                    }
                  }
                ],
                as: 'status'
              }
            },
            { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } }
          ],
          { ignoreUndefined: true }
        )
        .toArray()

      return items
    }
  )
})
