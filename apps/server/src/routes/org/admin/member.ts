import * as bcrypt from 'bcrypt'
import { BSON } from 'mongodb'

import { IUser, ORG_CAPS } from '../../../db/index.js'
import { SUserProfile } from '../../../index.js'
import { T } from '../../../schemas/index.js'
import { CAP_NONE, paginationSkip } from '../../../utils/index.js'
import { defineRoutes, loadUUID } from '../../common/index.js'
import { kOrgContext } from '../inject.js'

export const orgAdminMemberRoutes = defineRoutes(async (s) => {
  const { users, orgMemberships } = s.db

  s.get(
    '/',
    {
      schema: {
        description: 'List org members',
        querystring: T.Object({
          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false }),
          capability: T.Optional(T.String())
        }),
        response: {
          200: T.PaginationResult(T.Any())
        }
      }
    },
    async (req) => {
      const ctx = req.inject(kOrgContext)
      const capability = new BSON.Long(req.query.capability ?? '0')
      let count = 0
      if (req.query.count) {
        count = await orgMemberships.countDocuments({
          orgId: ctx._orgId,
          $expr: { $eq: [{ $bitAnd: ['$capability', capability] }, capability] }
        })
      }
      const skip = paginationSkip(req.query.page, req.query.perPage)
      const members = await orgMemberships
        .aggregate([
          {
            $match: {
              orgId: ctx._orgId,
              $expr: { $eq: [{ $bitAnd: ['$capability', capability] }, capability] }
            }
          },
          { $skip: skip },
          { $limit: req.query.perPage },
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
              capability: 1,
              limit: 1,
              groups: 1
            }
          },
          {
            $lookup: {
              from: 'groups',
              localField: 'groups',
              foreignField: '_id',
              as: 'groups'
            }
          },
          {
            $project: {
              _id: 1,
              'user._id': 1,
              'user.profile': 1,
              capability: 1,
              limit: 1,
              'groups._id': 1,
              'groups.profile': 1
            }
          },
          {
            $addFields: {
              capability: {
                $toString: '$capability'
              },
              limit: {
                $toString: {
                  $ifNull: ['$limit', CAP_NONE]
                }
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
    '/',
    {
      schema: {
        description: 'Add member to org',
        body: T.Object({
          userId: T.String()
        }),
        response: {
          200: T.Object({
            membershipId: T.UUID()
          })
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kOrgContext)
      const userId = loadUUID(req.body, 'userId', s.httpErrors.badRequest())
      const exists = await users.countDocuments({ _id: userId })
      if (!exists) return rep.badRequest()
      const { insertedId } = await orgMemberships.insertOne({
        _id: new BSON.UUID(),
        userId,
        orgId: ctx._orgId,
        capability: ORG_CAPS.CAP_ACCESS,
        groups: []
      })
      return { membershipId: insertedId }
    }
  )

  s.patch(
    '/:userId/capability',
    {
      schema: {
        description: 'Update member capability',
        params: T.Object({
          userId: T.String()
        }),
        body: T.Object({
          capability: T.String(),
          limit: T.String()
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kOrgContext)
      const userId = loadUUID(req.params, 'userId', s.httpErrors.badRequest())
      const capability = new BSON.Long(req.body.capability)
      const limit = new BSON.Long(req.body.limit)
      const { modifiedCount } = await orgMemberships.updateOne(
        { userId, orgId: ctx._orgId },
        { $set: { capability, limit } },
        { ignoreUndefined: true }
      )
      if (!modifiedCount) return rep.notFound()
      return {}
    }
  )

  s.delete(
    '/:userId',
    {
      schema: {
        description: 'Remove member from org',
        params: T.Object({
          userId: T.String()
        })
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kOrgContext)
      const userId = loadUUID(req.params, 'userId', s.httpErrors.badRequest())
      if (userId.equals(req.user.userId)) return rep.badRequest()
      // TODO: Should we check for associated resources?
      const { deletedCount } = await orgMemberships.deleteOne({
        userId,
        orgId: ctx._orgId
      })
      if (!deletedCount) return rep.notFound()
      return {}
    }
  )

  s.post(
    '/batch-import',
    {
      schema: {
        description: 'Batch import members',
        body: T.Object({
          users: T.Array(
            T.Object({
              profile: SUserProfile,
              password: T.String(),
              passwordResetDue: T.Boolean({ default: false }),
              orgCapability: T.String({ default: ORG_CAPS.CAP_ACCESS.toString() }),
              orgGroups: T.Array(T.UUID(), { default: [] })
            })
          ),
          ignoreDuplicates: T.Boolean({ default: false })
        })
      }
    },
    async (req) => {
      const ctx = req.inject(kOrgContext)
      const usersToInsert = await Promise.all(
        req.body.users.map(
          async (user) =>
            ({
              _id: new BSON.UUID(),
              profile: user.profile,
              authSources: {
                password: await bcrypt.hash(user.password, 10),
                passwordResetDue: user.passwordResetDue
              }
            }) satisfies IUser
        )
      )
      const { insertedCount, insertedIds } = await users.insertMany(usersToInsert, {
        ordered: !req.body.ignoreDuplicates
      })
      let successCount = 0
      for (let i = 0; i < req.body.users.length; i++) {
        try {
          const id =
            insertedIds[i] ??
            (await users.findOne({ 'profile.name': req.body.users[i].profile.name }))?._id
          if (!id) continue
          const { insertedId } = await orgMemberships.insertOne({
            _id: new BSON.UUID(),
            userId: id,
            orgId: ctx._orgId,
            capability: new BSON.Long(req.body.users[i].orgCapability),
            groups: req.body.users[i].orgGroups.map((g) => new BSON.UUID(g))
          })
          if (insertedId) successCount++
        } catch (err) {
          console.log(err)
        }
      }
      return { insertedCount, successCount }
    }
  )
})
