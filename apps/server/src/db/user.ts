import { BSON } from 'mongodb'
import { db } from './client.js'
import { IUserProfile } from '../schemas/index.js'
import { capabilityMask } from '../index.js'

export const UserCapability = {
  CAP_ADMIN: capabilityMask(0),
  CAP_CREATE_ORG: capabilityMask(1)
}

export interface IUserAuthSources {
  password?: string
}

export interface IUser {
  _id: BSON.UUID

  profile: IUserProfile
  authSources: IUserAuthSources
  capability?: BSON.Long
}

export const users = db.collection<IUser>('users')
await users.createIndex({ 'profile.name': 1 }, { unique: true })
