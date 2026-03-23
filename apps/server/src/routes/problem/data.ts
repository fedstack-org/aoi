import { SProblemConfigSchema } from '@aoi-js/common'

import { PROBLEM_CAPS } from '../../db/index.js'
import { problemDataKey } from '../../oss/index.js'
import { T } from '../../schemas/index.js'
import { ensureCapability } from '../../utils/index.js'
import { getFileUrl, defineRoutes, paramSchemaMerger } from '../common/index.js'

import { kProblemContext } from './inject.js'

const dataScopedRoutes = defineRoutes(async (s) => {
  const { instances, problems, solutions } = s.db

  s.addHook('onRoute', paramSchemaMerger(T.Object({ hash: T.Hash() })))
  s.register(getFileUrl, {
    prefix: '/url',
    resolve: async (_type, query, req) => {
      const ctx = req.inject(kProblemContext)
      const hash = (req.params as { hash: string }).hash
      return [ctx._problem.orgId, problemDataKey(ctx._problemId, hash), query]
    }
  })

  s.delete(
    '/',
    {
      schema: {
        description: 'Delete problem attachment',
        response: {
          200: T.Object({})
        }
      }
    },
    async (req, rep) => {
      const ctx = req.inject(kProblemContext)

      ensureCapability(ctx._problemCapability, PROBLEM_CAPS.CAP_CONTENT, s.httpErrors.forbidden())
      const hash = (req.params as { hash: string }).hash
      const [referencedSolution, referencedInstance] = await Promise.all([
        solutions.findOne(
          {
            problemId: ctx._problemId,
            problemDataHash: hash
          },
          { projection: { _id: 1 } }
        ),
        instances.findOne(
          {
            problemId: ctx._problemId,
            problemDataHash: hash
          },
          { projection: { _id: 1 } }
        )
      ])
      if (referencedSolution || referencedInstance) {
        return rep.conflict('Problem data is still referenced')
      }
      const { modifiedCount } = await problems.updateOne(
        { _id: ctx._problemId, currentDataHash: { $ne: hash } },
        { $pull: { data: { hash } } }
      )
      if (!modifiedCount) return rep.conflict()
      return {}
    }
  )
})

export const problemDataRoutes = defineRoutes(async (s) => {
  const { problems } = s.db

  s.addHook('onRequest', async (req) => {
    ensureCapability(
      req.inject(kProblemContext)._problemCapability,
      PROBLEM_CAPS.CAP_DATA,
      s.httpErrors.forbidden()
    )
  })

  s.get(
    '/',
    {
      schema: {
        description: 'Get problem data',
        response: {
          200: T.Array(
            T.Object({
              hash: T.Hash(),
              createdAt: T.Number(),
              config: SProblemConfigSchema,
              description: T.String()
            })
          )
        }
      }
    },
    async (req) => {
      return req.inject(kProblemContext)._problem.data
    }
  )

  s.post(
    '/',
    {
      schema: {
        description: 'Create problem data',
        body: T.Object({
          hash: T.Hash(),
          config: SProblemConfigSchema,
          description: T.String()
        })
      }
    },
    async (req, rep) => {
      const { hash, config, description } = req.body
      const { modifiedCount } = await problems.updateOne(
        { _id: req.inject(kProblemContext)._problemId, [`data.hash`]: { $ne: hash } },
        { $push: { data: { hash, createdAt: Date.now(), config, description } } }
      )
      if (!modifiedCount) return rep.conflict()
      return {}
    }
  )

  s.post(
    '/setDataHash',
    {
      schema: {
        description: 'Set problem data hash',
        body: T.Object({
          hash: T.Hash()
        })
      }
    },
    async (req, rep) => {
      const { hash } = req.body
      const { modifiedCount } = await problems.updateOne(
        { _id: req.inject(kProblemContext)._problemId, [`data.hash`]: hash },
        { $set: { currentDataHash: hash } }
      )
      if (!modifiedCount) return rep.badRequest()
      return {}
    }
  )

  s.register(dataScopedRoutes, { prefix: '/:hash' })
})
