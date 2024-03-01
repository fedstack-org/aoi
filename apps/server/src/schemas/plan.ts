import { Static, Type } from '@sinclair/typebox'

export const SPlanContestPrecondition = Type.Partial(
  Type.StrictObject({
    minTotalScore: Type.Number(),
    problems: Type.Array(
      Type.Object({
        problemId: Type.String(),
        minScore: Type.Number()
      })
    )
  })
)

export interface IPlanContestPrecondition extends Static<typeof SPlanContestPrecondition> {}

export const SPlanContestSettings = Type.StrictObject({
  slug: Type.String(),
  preConditionContests: Type.Optional(
    Type.Array(
      Type.Object({
        contestId: Type.String(),
        conditions: SPlanContestPrecondition
      })
    )
  )
})

export interface IPlanContestSettings extends Static<typeof SPlanContestSettings> {}

export const SPlanSettings = Type.Partial(
  Type.StrictObject({
    registrationEnabled: Type.Boolean(),
    registrationAllowPublic: Type.Boolean(),
    promotion: Type.Optional(Type.Boolean())
  })
)

export interface IPlanSettings extends Static<typeof SPlanSettings> {}
