import fastify from 'fastify'
import fastifySensible from '@fastify/sensible'
import { apiRoutes } from '../routes/index.js'
import { logger } from '../utils/logger.js'
import { schemaRoutes } from './schemas.js'
import { hasModule } from '../utils/module.js'

const server = fastify({ logger })

await server.register(fastifySensible)

await server.register(schemaRoutes, { prefix: '/schemas' })

if (hasModule('@fastify/swagger') && hasModule('@fastify/swagger-ui')) {
  const { default: fastifySwagger } = await import('@fastify/swagger')
  const { default: fastifySwaggerUi } = await import('@fastify/swagger-ui')

  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: '@aoi-js/server',
        description: 'API Server of the AOI Project',
        version: 'latest'
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          },
          runnerKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Runner-Key'
          },
          runnerId: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Runner-Id'
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ]
    }
  })
  await server.register(fastifySwaggerUi, {
    routePrefix: '/docs'
  })
}

await server.register(apiRoutes, { prefix: '/api' })

export { server }
