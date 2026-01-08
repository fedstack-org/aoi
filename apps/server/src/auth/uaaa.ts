import { httpErrors } from '@fastify/sensible'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { FastifyRequest } from 'fastify'
import { Collection, Filter, UUID } from 'mongodb'

import { IUser } from '../db/index.js'
import { T } from '../schemas/index.js'
import { loadEnv, parseBoolean } from '../utils/index.js'

import { BaseAuthProvider } from './base.js'

const STokenPayload = T.Object({
  token: T.String()
})

const TokenPayload = TypeCompiler.Compile(STokenPayload)

const SUserInfoResponse = T.Object({
  sub: T.String(),
  nickname: T.Optional(T.String()),
  name: T.Optional(T.String()),
  name_verified: T.Optional(T.Boolean()),
  email: T.Optional(T.String()),
  email_verified: T.Optional(T.Boolean()),
  phone_number: T.Optional(T.String()),
  phone_number_verified: T.Optional(T.Boolean()),
  school: T.Optional(T.String()),
  school_verified: T.Optional(T.Boolean()),
  student_grade: T.Optional(T.String()),
  student_grade_verified: T.Optional(T.Boolean())
})

const UserInfoResponse = TypeCompiler.Compile(SUserInfoResponse)

export interface IOpenIdConfiguration {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  // end_session_endpoint: string
  jwks_uri: string
  response_types_supported: string[]
  subject_types_supported: string[]
  id_token_signing_alg_values_supported: string[]
  code_challenge_methods_supported: string[]
}

export class UaaaAuthProvider extends BaseAuthProvider {
  private uaaaInstance = ''
  private uaaaConfig: IOpenIdConfiguration = {} as IOpenIdConfiguration
  private uaaaAppId = ''
  private allowSignupFromLogin = false
  private allowRebind = false

  constructor(private users: Collection<IUser>) {
    super()
  }

  override readonly name = 'uaaa'

  get openidConfig() {
    return this.uaaaConfig
  }

  get appId() {
    return this.uaaaAppId
  }

  override async init(): Promise<void> {
    this.uaaaInstance = loadEnv('UAAA_INSTANCE', String)
    this.uaaaAppId = loadEnv('UAAA_APP_ID', String)
    this.uaaaConfig = (await fetch(`${this.uaaaInstance}/.well-known/openid-configuration`).then(
      (res) => res.json()
    )) as IOpenIdConfiguration
    this.allowSignupFromLogin = loadEnv('UAAA_ALLOW_SIGNUP_FROM_LOGIN', parseBoolean, false)
    this.allowRebind = loadEnv('UAAA_ALLOW_REBIND', parseBoolean, false)

    await this.users.createIndex(
      { 'authSources.uaaa': 1 },
      { unique: true, partialFilterExpression: { 'authSources.uaaa': { $exists: true } } }
    )
  }

  async getUserInfo(token: string) {
    const resp = await fetch(this.uaaaConfig.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (!resp.ok) throw httpErrors.forbidden('Invalid token')
    const data = await resp.json()
    if (!UserInfoResponse.Check(data)) throw httpErrors.forbidden('Invalid userinfo response')
    return data
  }

  generateUpdateForClaims(claims: Awaited<ReturnType<typeof this.getUserInfo>>) {
    const $set: Record<string, unknown> = Object.create(null)
    const verified: string[] = []
    if (claims.nickname) {
      $set['profile.name'] = claims.nickname
    }
    if (claims.email) {
      $set['profile.email'] = claims.email
      claims.email_verified && verified.push('email')
    }
    if (claims.phone_number) {
      $set['profile.telephone'] = claims.phone_number
      claims.phone_number_verified && verified.push('telephone')
    }
    if (claims.name) {
      $set['profile.realname'] = claims.name
      claims.name_verified && verified.push('realname')
    }
    if (claims.school) {
      $set['profile.school'] = claims.school
      claims.school_verified && verified.push('school')
    }
    if (claims.student_grade) {
      $set['profile.studentGrade'] = claims.student_grade
      claims.student_grade_verified && verified.push('studentGrade')
    }
    return { $set, verified }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async bind(userId: UUID, payload: unknown, _req: FastifyRequest): Promise<unknown> {
    if (!TokenPayload.Check(payload)) throw httpErrors.badRequest()
    const claims = await this.getUserInfo(payload.token)
    const filter: Filter<IUser> = { _id: userId }
    if (!this.allowRebind) {
      filter['authSources.uaaa'] = { $exists: false }
    }
    const { $set, verified } = this.generateUpdateForClaims(claims)
    const { matchedCount } = await this.users.updateOne(filter, [
      {
        $set: {
          ...$set,
          'profile.verified': { $setUnion: ['$profile.verified', verified] },
          'authSources.uaaa': claims.sub
        }
      }
    ])
    if (!matchedCount) return httpErrors.badRequest('User already bound')
    return {}
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async verify(userId: UUID, payload: unknown, _req: FastifyRequest): Promise<boolean> {
    if (!TokenPayload.Check(payload)) throw httpErrors.badRequest()
    const claims = await this.getUserInfo(payload.token)
    const { $set, verified } = this.generateUpdateForClaims(claims)
    const user = await this.users.findOneAndUpdate(
      { _id: userId, 'authSources.uaaa': claims.sub },
      [
        {
          $set: {
            ...$set,
            'profile.verified': { $setUnion: ['$profile.verified', verified] }
          }
        }
      ]
    )
    if (!user) throw httpErrors.notFound('Fail to verify using UAAA')
    return true
  }

  override async login(
    payload: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _req: FastifyRequest
  ): Promise<[userId: UUID, tags?: string[]]> {
    if (!TokenPayload.Check(payload)) throw httpErrors.badRequest()
    const claims = await this.getUserInfo(payload.token)
    const { $set, verified } = this.generateUpdateForClaims(claims)
    let userId: UUID
    const user = await this.users.findOneAndUpdate(
      { 'authSources.uaaa': claims.sub },
      [
        {
          $set: {
            ...$set,
            'profile.verified': { $setUnion: ['$profile.verified', verified] }
          }
        }
      ],
      { projection: { _id: 1 } }
    )
    if (user) {
      userId = user._id
    } else {
      if (!this.allowSignupFromLogin) throw httpErrors.notFound('User not found')
      const { insertedId } = await this.users.insertOne(
        {
          _id: new UUID(),
          profile: {
            name: claims.nickname ?? `uaaa-${claims.name ?? claims.phone_number ?? claims.sub}`,
            email: claims.email ?? `${claims.sub}@uaaa`,
            realname: claims.name ?? '',
            telephone: claims.phone_number,
            school: claims.school,
            studentGrade: claims.student_grade,
            verified: verified
          },
          authSources: { uaaa: claims.sub }
        },
        { ignoreUndefined: true }
      )
      userId = insertedId
    }
    return [userId]
  }
}
