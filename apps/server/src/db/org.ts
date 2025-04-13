import { fastifyPlugin } from 'fastify-plugin'
import { BSON, Collection } from 'mongodb'

import { IOrgProfile, IOrgSettings } from '../schemas/index.js'
import { capabilityMask } from '../utils/capability.js'

export const ORG_CAPS = {
  CAP_ACCESS: capabilityMask(0),
  CAP_ADMIN: capabilityMask(1),
  CAP_PROBLEM: capabilityMask(2),
  CAP_CONTEST: capabilityMask(3),
  CAP_PLAN: capabilityMask(4),
  CAP_APP: capabilityMask(5),
  CAP_INSTANCE: capabilityMask(6)
}

export const ORG_LIMITS = {
  LIMIT_PROBLEM: capabilityMask(0),
  LIMIT_CONTEST: capabilityMask(1),
  LIMIT_PLAN: capabilityMask(2),
  LIMIT_APP: capabilityMask(3)
}

export interface IOrg {
  _id: BSON.UUID

  ownerId: BSON.UUID
  profile: IOrgProfile
  settings: IOrgSettings
}

export interface IOrgMembership {
  _id: BSON.UUID
  userId: BSON.UUID
  orgId: BSON.UUID
  capability: BSON.Long
  groups: BSON.UUID[]

  // Member limits
  limit?: BSON.Long
  tags?: string[]
}

declare module './index.js' {
  interface IDbContainer {
    orgs: Collection<IOrg>
    orgMemberships: Collection<IOrgMembership>
  }
}

export const dbOrgPlugin = fastifyPlugin(async (s) => {
  const orgs = s.db.db.collection<IOrg>('orgs')
  await orgs.createIndex({ 'profile.name': 1 }, { unique: true })
  s.db.orgs = orgs

  const orgMemberships = s.db.db.collection<IOrgMembership>('orgMemberships')
  await orgMemberships.createIndex({ userId: 1, orgId: 1 }, { unique: true })
  s.db.orgMemberships = orgMemberships
})
