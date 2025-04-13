import { BSON } from 'mongodb'

import { ORG_CAPS, SGroupProfile, ensureCapability, paginationSkip } from '../../index.js'
import { T } from '../../schemas/index.js'
import { defineInjectionPoint } from '../../utils/inject.js'
import { defineRoutes, loadUUID, paramSchemaMerger } from '../common/index.js'

const kGroupContext = defineInjectionPoint<{
  groupId: BSON.UUID
}>('group')

export const groupScopedRoutes = defineRoutes(async (s) => {
  const { groups, orgMemberships, problems } = s.db

  s.addHook(
    'onRoute',
    paramSchemaMerger(
      T.Object({
        groupId: T.String()
      })
    )
  )

  s.addHook('onRequest', async (req) => {
    req.provide(kGroupContext, {
      groupId: loadUUID(req.params, 'groupId', s.httpErrors.notFound())
    })
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get group details',
        response: {
          200: T.Object({
            _id: T.UUID(),
            orgId: T.UUID(),
            profile: SGroupProfile
          })
        }
      }
    },
    async (req, rep) => {
      const group = await groups.findOne({
        _id: req.inject(kGroupContext).groupId
      })
      if (!group) return rep.notFound()
      return group
    }
  )

  s.get(
    '/profile',
    {
      schema: {
        description: 'Get group profile',
        response: { 200: SGroupProfile }
      }
    },
    async (req, rep) => {
      const group = await groups.findOne(
        { _id: req.inject(kGroupContext).groupId },
        { projection: { profile: 1 } }
      )
      if (!group) return rep.notFound()
      return group.profile
    }
  )

  s.patch(
    '/profile',
    {
      schema: {
        description: 'Update group profile',
        body: SGroupProfile
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)
      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()
      const membership = await req.loadMembership(group.orgId)
      if (!membership) return rep.forbidden()
      ensureCapability(membership.capability, ORG_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
      await groups.updateOne({ _id: ctx.groupId }, { $set: { profile: req.body } })
      return {}
    }
  )

  s.delete(
    '/',
    {
      schema: {
        description: 'Delete group'
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)
      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()
      const membership = await req.loadMembership(group.orgId)
      if (!membership) return rep.forbidden()
      ensureCapability(membership.capability, ORG_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
      // Remove Dependencies
      await orgMemberships.updateMany({ orgId: group.orgId }, { $pull: { groups: ctx.groupId } })
      await problems.updateMany(
        { 'associations.principalId': ctx.groupId },
        { $pull: { associations: { principalId: ctx.groupId } } }
      )
      await groups.deleteOne({ _id: ctx.groupId })
      return {}
    }
  )

  s.get(
    '/member',
    {
      schema: {
        description: 'List members in a group',
        querystring: T.Object({
          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false })
        }),
        response: {
          200: T.PaginationResult(T.Any())
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)

      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()

      let count = 0
      if (req.query.count) {
        count = await orgMemberships.countDocuments({ orgId: group.orgId, groups: ctx.groupId })
      }
      const skip = paginationSkip(req.query.page, req.query.perPage)
      const members = await orgMemberships
        .aggregate([
          { $match: { orgId: group.orgId, groups: ctx.groupId } },
          { $skip: skip },
          { $limit: req.query.perPage },
          { $project: { _id: 1, userId: 1, capability: 1 } },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: '$user' },
          {
            $project: {
              _id: 1,
              'user._id': 1,
              'user.profile': 1,
              capability: 1
            }
          },
          {
            $addFields: {
              capability: {
                $toString: '$capability'
              }
            }
          }
        ])
        .toArray()
      return {
        total: count,
        items: members
      }
    }
  )

  s.post(
    '/member',
    {
      schema: {
        description: 'Add member to group',
        body: T.Object({
          userId: T.String()
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)
      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()
      const membership = await req.loadMembership(group.orgId)
      if (!membership) return rep.forbidden()
      ensureCapability(membership.capability, ORG_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
      const userId = loadUUID(req.body, 'userId', s.httpErrors.badRequest())
      const { modifiedCount } = await orgMemberships.updateOne(
        { userId, orgId: group.orgId },
        { $addToSet: { groups: ctx.groupId } }
      )
      if (!modifiedCount) return rep.badRequest()
      return {}
    }
  )

  s.delete(
    '/member/:userId',
    {
      schema: {
        description: 'Remove member from group',
        params: T.Object({
          userId: T.UUID()
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)
      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()
      const membership = await req.loadMembership(group.orgId)
      if (!membership) return rep.forbidden()
      ensureCapability(membership.capability, ORG_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
      const userId = loadUUID(req.params, 'userId', s.httpErrors.badRequest())
      const { modifiedCount } = await orgMemberships.updateOne(
        { userId, orgId: group.orgId },
        { $pull: { groups: ctx.groupId } }
      )
      if (!modifiedCount) return rep.badRequest()
      return {}
    }
  )

  s.patch(
    '/member/batch-update-capability',
    {
      schema: {
        description: 'Batch update organization members in group',
        body: T.Object({
          capability: T.Optional(T.String()),
          limit: T.Optional(T.String())
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kGroupContext)
      const group = await groups.findOne({ _id: ctx.groupId }, { projection: { orgId: 1 } })
      if (!group) return rep.notFound()
      const membership = await req.loadMembership(group.orgId)
      if (!membership) return rep.forbidden()
      ensureCapability(membership.capability, ORG_CAPS.CAP_ADMIN, s.httpErrors.forbidden())
      const capability = req.body.capability ? new BSON.Long(req.body.capability) : undefined
      const limit = req.body.limit ? new BSON.Long(req.body.limit) : undefined
      await orgMemberships.updateMany(
        { orgId: group.orgId, groups: ctx.groupId },
        { $set: { capability, limit } },
        { ignoreUndefined: true }
      )
      return {}
    }
  )
})
