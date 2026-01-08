import {
  JavaScriptTypeBuilder,
  TSchema,
  ObjectOptions,
  TProperties,
  StringOptions
} from '@sinclair/typebox'
import { BSON } from 'mongodb'
import './formats.js'

export { Static } from '@sinclair/typebox'

export enum AccessLevel {
  PUBLIC = 0,
  RESTRICED = 1,
  PRIVATE = 2
}

export class ServerTypeBuilder extends JavaScriptTypeBuilder {
  UUID() {
    return this.Unsafe<BSON.UUID | string>(this.String({ format: 'uuid' }))
  }

  Hash() {
    return this.String({ pattern: '^[0-9a-f]{64}$' })
  }

  StringEnum<T extends string[]>(values: [...T]) {
    return this.Unsafe<T[number]>({ type: 'string', enum: values })
  }

  IntegerEnum<T extends Record<string, string | number>>(obj: T) {
    const values = Object.getOwnPropertyNames(obj)
      .filter((key) => isNaN(key as unknown as number))
      .map((key) => obj[key]) as T[keyof T][]
    return this.Unsafe<T[keyof T]>(this.Integer({ enum: values }))
  }

  AccessLevel() {
    return this.IntegerEnum(AccessLevel)
  }

  NoAdditionalProperties<S extends TSchema>(schema: S) {
    return {
      ...schema,
      additionalProperties: false
    }
  }

  StrictObject<T extends TProperties>(properties: T, options?: ObjectOptions) {
    return this.Object(properties, { ...options, additionalProperties: false })
  }

  PaginationResult<T extends TSchema>(itemType: T) {
    return this.Object({
      items: this.Array(itemType),
      total: this.Optional(this.Integer())
    })
  }

  RuleCondition() {
    return this.Object({
      $eq: this.Optional(this.Any()),
      $ne: this.Optional(this.Any()),
      $gt: this.Optional(this.Any()),
      $gte: this.Optional(this.Any()),
      $lt: this.Optional(this.Any()),
      $lte: this.Optional(this.Any()),
      $in: this.Optional(this.Array(this.Any())),
      $nin: this.Optional(this.Array(this.Any())),
      $startsWith: this.Optional(this.String()),
      $notStartsWith: this.Optional(this.String()),
      $endsWith: this.Optional(this.String()),
      $notEndsWith: this.Optional(this.String()),
      $includes: this.Optional(this.Any()),
      $notIncludes: this.Optional(this.Any()),
      $includesEach: this.Optional(this.Array(this.Any())),
      $notIncludesEach: this.Optional(this.Array(this.Any())),
      $includesSome: this.Optional(this.Array(this.Any())),
      $notIncludesSome: this.Optional(this.Array(this.Any()))
    })
  }

  RuleMatcher() {
    return this.Record(this.String(), this.RuleCondition())
  }

  RuleSet<T extends TSchema>(result: T) {
    const projector = this.Partial(
      this.Mapped(this.KeyOf(result), (K) => this.Union([this.Index(result, K), this.String()]))
    )

    const rule = this.Object({
      match: this.Union([this.RuleMatcher(), this.Array(this.RuleMatcher())]),
      returns: projector
    })

    return this.Object({
      rules: this.Array(rule),
      defaults: this.Optional(projector)
    })
  }

  BooleanOrString(options?: StringOptions) {
    return this.Union([this.Boolean(), this.String(options)])
  }

  /** CIDR 格式字符串，支持 IPv4 和 IPv6 */
  CIDR() {
    return this.String({
      pattern:
        '^([0-9]{1,3}\\.){3}[0-9]{1,3}(/([0-9]|[1-2][0-9]|3[0-2]))?$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$'
    })
  }

  /** CIDR 列表 */
  CIDRList() {
    return this.Array(this.CIDR())
  }
}

export const T = new ServerTypeBuilder()

export const SBaseProfile = T.StrictObject({
  name: T.String(),
  email: T.String()
})
