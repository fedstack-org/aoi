import { httpErrors } from '@fastify/sensible'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { Collection, UUID } from 'mongodb'
import rnd from 'randomstring'

import { BaseCache } from '../cache/index.js'
import { IUser } from '../db/index.js'
import { T } from '../schemas/index.js'
import { loadEnv, logger } from '../utils/index.js'

import { BaseAuthProvider } from './base.js'

const SCodeSendPayload = T.Object({
  phone: T.String({ pattern: '^1[0-9]{10}$' }),
  context: T.Record(T.String(), T.String())
})

const CodeSendPayload = TypeCompiler.Compile(SCodeSendPayload)

const SCodeVerifyPayload = T.Object({
  phone: T.String({ pattern: '^1[0-9]{10}$' }),
  code: T.String({ pattern: '^[0-9]{6}$' })
})

const CodeVerifyPayload = TypeCompiler.Compile(SCodeVerifyPayload)

export class SMSAuthProvider extends BaseAuthProvider {
  private _gateway!: string
  private _gatewayContext!: Record<string, string>
  private _gatewayVariables!: Record<string, string>
  private _codeVariable!: string

  constructor(
    private users: Collection<IUser>,
    private cache: BaseCache
  ) {
    super()
  }

  override readonly name = 'sms'

  override async init(): Promise<void> {
    this._gateway = loadEnv('SMS_GATEWAY', String)
    this._gatewayContext = loadEnv('SMS_GATEWAY_CONTEXT', JSON.parse, Object.create(null))
    this._gatewayVariables = loadEnv('SMS_GATEWAY_VARIABLES', JSON.parse, Object.create(null))
    this._codeVariable = loadEnv('SMS_CODE_VARIABLE', String, 'code')
    await this.users.createIndex(
      { 'authSources.sms': 1 },
      { unique: true, partialFilterExpression: { 'authSources.sms': { $exists: true } } }
    )
  }

  private _userKey(userId: UUID): string {
    return `auth:sms:${userId}`
  }

  private _phoneKey(phone: string): string {
    return `auth:sms:${phone}`
  }

  private async _sendCode(
    key: string,
    phone: string,
    context: Record<string, string>
  ): Promise<void> {
    const ttl = await this.cache.ttl(key)
    if (ttl > 0) throw httpErrors.tooManyRequests(`Wait for ${Math.ceil(ttl / 1000)} seconds`)
    const code = rnd.generate({ length: 6, charset: 'numeric' })
    await this.cache.setx(key, { code, phone, n: 5 }, 5 * 60 * 1000)
    try {
      const resp = await fetch(new URL('/send', this._gateway), {
        headers: {
          'Content-type': "application/json;charset='utf-8'",
          Accept: 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
          target: [phone],
          variables: {
            ...this._gatewayVariables,
            [this._codeVariable]: code
          },
          context: {
            ...context,
            ...this._gatewayContext
          }
        })
      })
      const { success, error } = (await resp.json()) as { success: boolean; error: string }
      if (!success) {
        throw httpErrors.badRequest(error)
      }
      logger.info(`SMS sent to ${phone}: ok`)
    } catch (err) {
      await this.cache.del(key)
      logger.info(`SMS sent to ${phone}: ${err}`)
      throw err
    }
  }

  private async _verifyCode(key: string, code: string) {
    const ttl = await this.cache.ttl(key)
    const value = await this.cache.getx<{ code: string; phone: string; n: number }>(key)
    await this.cache.del(key)
    if (!value) throw httpErrors.forbidden('Invalid code')
    if (value.code !== code) {
      if (ttl > 0 && value.n > 0) {
        await this.cache.setx(key, { ...value, n: value.n - 1 }, ttl)
      }
      throw httpErrors.forbidden('Invalid code')
    }
    return value
  }

  override async preBind(userId: UUID, payload: unknown): Promise<unknown> {
    if (!CodeSendPayload.Check(payload)) throw httpErrors.badRequest('Invalid payload')
    const { phone, context } = payload
    await this._sendCode(this._userKey(userId), phone, context)
    return {}
  }

  override async bind(userId: UUID, payload: unknown): Promise<unknown> {
    if (!CodeVerifyPayload.Check(payload)) throw httpErrors.badRequest('Invalid payload')
    const { code, phone } = payload
    await this._verifyCode(this._userKey(userId), code)
    await this.users.updateOne(
      { _id: userId },
      {
        $set: { 'profile.telephone': phone, 'authSources.sms': phone },
        $addToSet: { 'profile.verified': { $each: ['telephone'] } }
      }
    )
    return {}
  }

  override async preVerify(userId: UUID, payload: unknown): Promise<unknown> {
    if (!CodeSendPayload.Check(payload)) throw httpErrors.badRequest('Invalid payload')
    const { phone, context } = payload
    const user = await this.users.findOne({ _id: userId }, { projection: { 'authSources.sms': 1 } })
    if (!user) throw httpErrors.notFound('User not found')
    if (!user.authSources.sms) throw new Error('user has no binded phone')
    if (user.authSources.sms !== phone) throw httpErrors.forbidden('Invalid phone')
    await this._sendCode(this._userKey(userId), phone, context)
    return {}
  }

  override async verify(userId: UUID, payload: unknown): Promise<boolean> {
    if (!CodeVerifyPayload.Check(payload)) throw httpErrors.badRequest('Invalid payload')
    const { code, phone } = payload
    const user = await this.users.findOne({ _id: userId }, { projection: { 'authSources.sms': 1 } })
    if (!user) throw httpErrors.notFound('User not found')
    if (!user.authSources.sms) throw new Error('user has no binded phone')
    if (user.authSources.sms !== phone) throw httpErrors.forbidden('Invalid phone')
    await this._verifyCode(this._userKey(userId), code)
    return true
  }
}
