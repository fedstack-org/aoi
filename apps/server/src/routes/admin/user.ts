import { BSON, Document, UUID } from 'mongodb'

import { SUserProfile, T } from '../../schemas/index.js'
import { findPaginated } from '../../utils/index.js'
import { defineRoutes } from '../common/index.js'

export const adminUserRoutes = defineRoutes(async (s) => {
  const { users } = s.db

  s.get(
    '/',
    {
      schema: {
        description: 'List all system user',
        querystring: T.Object({
          page: T.Integer({ minimum: 1, default: 1 }),
          perPage: T.Integer({ enum: [15, 30, 50, 100] }),
          count: T.Boolean({ default: false }),
          search: T.Optional(T.String({ minLength: 1 })),
          capability: T.Optional(T.String())
        }),
        response: {
          200: T.PaginationResult(T.Any())
        }
      }
    },
    async (req) => {
      const filter: Document = {}
      if (req.query.search) filter['profile.name'] = { $regex: req.query.search }
      if (req.query.capability && +req.query.capability) {
        const capability = new BSON.Long(req.query.capability)
        filter.$expr = { $eq: [{ $bitAnd: ['$capability', capability] }, capability] }
      }

      const { items, total } = await findPaginated(
        users,
        req.query.page,
        req.query.perPage,
        req.query.count,
        filter,
        {
          projection: {
            authSources: 0
          }
        }
      )
      return {
        items: items.map((item) => ({ ...item, capability: item.capability?.toString() })),
        total
      }
    }
  )

  s.patch(
    '/:userId/capability',
    {
      schema: {
        description: 'Update user capability',
        params: T.Object({
          userId: T.UUID()
        }),
        body: T.Object({
          capability: T.String()
        })
      }
    },
    async (req) => {
      const capability = new BSON.Long(req.body.capability)
      await users.updateOne({ _id: new BSON.UUID(req.params.userId) }, { $set: { capability } })
      return {}
    }
  )

  s.patch(
    '/:userId/authLocked',
    {
      schema: {
        description: 'Update user auth locked status',
        params: T.Object({
          userId: T.UUID()
        }),
        body: T.Object({
          authLocked: T.Boolean()
        })
      }
    },
    async (req, rep) => {
      const { authLocked } = req.body
      const { matchedCount } = await users.updateOne(
        { _id: new BSON.UUID(req.params.userId) },
        { $set: { authLocked } }
      )
      if (!matchedCount) return rep.notFound()
      return {}
    }
  )

  s.post(
    '/',
    {
      schema: {
        description: 'Manually create a user',
        body: T.StrictObject({
          profile: SUserProfile,
          capability: T.Optional(T.String()),
          namespace: T.Optional(T.String()),
          tags: T.Optional(T.Array(T.String()))
        }),
        response: {
          200: T.Object({
            userId: T.String()
          })
        }
      }
    },
    async (req) => {
      const { insertedId } = await users.insertOne({
        ...req.body,
        _id: new UUID(),
        authSources: {},
        capability: req.body.capability ? new BSON.Long(req.body.capability) : undefined
      })
      return { userId: insertedId.toString() }
    }
  )

  s.post(
    '/login',
    {
      schema: {
        description: 'Login as given user, bypassing authentication',
        body: T.Object({
          userId: T.UUID(),
          tags: T.Optional(T.Array(T.String()))
        })
      }
    },
    async (req, rep) => {
      const { userId, tags } = req.body
      const jwt = rep.newPayload({ userId: userId.toString(), tags }).setExpirationTime('7d')
      const token = await rep.sign(jwt)
      return { token }
    }
  )
})
