import { fastifyPlugin } from 'fastify-plugin'
import { BSON, Collection } from 'mongodb'

export interface IPublicRanklist {
  ranklistId: number
  orgId: BSON.UUID
  contestId: BSON.UUID
  ranklistKey: string
  visible: boolean
  password?: string
}

declare module './index.js' {
  interface IDbContainer {
    pubrk: Collection<IPublicRanklist>
  }
}

export const dbPublicRanklistPlugin = fastifyPlugin(async (s) => {
  const col = s.db.db.collection<IPublicRanklist>('pubrk')
  await col.createIndex({ ranklistId: -1 }, { unique: true })
  s.db.pubrk = col
})
