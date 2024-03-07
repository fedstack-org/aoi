import { type Static, Type } from '@sinclair/typebox'

export const SSolutionDetailsTestSchema = Type.Object({
  name: Type.String(),
  score: Type.Number(),
  scoreScale: Type.Optional(Type.Number()),
  status: Type.String(),
  summary: Type.String()
})

export type SolutionDetailsTest = Static<typeof SSolutionDetailsTestSchema>

export const SSolutionDetailsJobSchema = Type.Object({
  name: Type.String(),
  score: Type.Number(),
  scoreScale: Type.Optional(Type.Number()),
  status: Type.String(),
  tests: Type.Array(SSolutionDetailsTestSchema),
  summary: Type.String()
})

export type SolutionDetailsJob = Static<typeof SSolutionDetailsJobSchema>

export const SSolutionDetailsSchema = Type.Object({
  version: Type.Integer({ minimum: 1 }),
  jobs: Type.Array(SSolutionDetailsJobSchema),
  summary: Type.String()
})

export type SolutionDetails = Static<typeof SSolutionDetailsSchema>
