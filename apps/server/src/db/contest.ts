import { fastifyPlugin } from 'fastify-plugin'
import { BSON, Collection } from 'mongodb'

import {
  IContestProblemSettings,
  IContestRanklistSettings,
  IContestStage,
  SContestParticipantRuleResult,
  SContestSolutionRuleResult
} from '../schemas/contest.js'
import { IUserProfile } from '../schemas/index.js'
import { capabilityMask } from '../utils/capability.js'

import {
  IPrincipalControlable,
  IWithAccessLevel,
  IWithAttachment,
  IWithContent,
  RulesFromSchemas
} from './common.js'
import { ISolution } from './solution.js'
import { IUser } from './user.js'

export const CONTEST_CAPS = {
  CAP_ACCESS: capabilityMask(0),
  CAP_ADMIN: capabilityMask(1),
  CAP_CONTENT: capabilityMask(2),
  CAP_REGISTRATION: capabilityMask(3)
}

export interface IContestParticipantResult {
  solutionCount: number
  lastSolutionId: BSON.UUID
  lastSolution: Pick<ISolution, 'score' | 'status'> & { completedAt: number }
}

export interface IContestParticipant {
  _id: BSON.UUID
  userId: BSON.UUID
  contestId: BSON.UUID
  results: Record<string, IContestParticipantResult>
  createdAt: number
  updatedAt: number
  tags?: string[]
  banned?: boolean
}

export interface IContestProblem {
  problemId: BSON.UUID
  settings: IContestProblemSettings
}

export enum ContestRanklistState {
  VALID = 0,
  PENDING = 1,
  INVALID = 2
}

export interface IContestRanklist {
  key: string
  name: string
  settings: IContestRanklistSettings
}

export interface IContestParticipantRuleCtx {
  contest: IContest
  currentStage: IContestStage
  user: IUser
}

export interface IContestSolutionRuleCtx {
  contest: IContest
  currentStage: IContestStage
  participant: IContestParticipant | null
  currentResult: IContestParticipantResult | null
  solution: ISolution
}

export const contestRuleSchemas = {
  participant: SContestParticipantRuleResult,
  solution: SContestSolutionRuleResult
}

export enum ContestStatus {
  ENDED = 0,
  PENDING = 1,
  RUNNING = 2
}

export interface IContest
  extends IPrincipalControlable,
    IWithAttachment,
    IWithAccessLevel,
    IWithContent {
  _id: BSON.UUID
  orgId: BSON.UUID

  problems: IContestProblem[]
  stages: IContestStage[]
  start: number
  end: number

  ranklists: IContestRanklist[]
  ranklistState: ContestRanklistState
  ranklistUpdatedAt: number
  ranklistRunnerId?: BSON.UUID
  ranklistTaskId?: BSON.UUID

  participantCount: number

  status?: ContestStatus
  nextStatusUpdate?: number

  rules?: RulesFromSchemas<
    typeof contestRuleSchemas,
    {
      participant: IContestParticipantRuleCtx
      solution: IContestSolutionRuleCtx
    }
  >

  /** CIDR 格式的 IP 白名单列表，如 ["10.0.0.0/8", "192.168.1.0/24"] */
  ipWhitelist?: string[]
}

export function getCurrentContestStage(now: number, { stages }: IContest) {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].start <= now) return stages[i]
  }
  return stages[0]
}

export async function evalTagRules(
  stage: IContestStage,
  user: IUser
): Promise<string[] | undefined> {
  if (!stage.settings.tagRules) return undefined
  const tags: string[] = []
  const rules = stage.settings.tagRules
  if (rules.copyVerifiedFields && user.profile.verified) {
    const { verified } = user.profile
    const fields = rules.copyVerifiedFields
      .split(',')
      .filter((field): field is keyof IUserProfile => verified.includes(field))
      .map((field) => `${user.profile[field]}`)
    tags.push(...fields)
  }
  return tags
}

declare module './index.js' {
  interface IDbContainer {
    contests: Collection<IContest>
    contestParticipants: Collection<IContestParticipant>
  }
}

export const dbContestPlugin = fastifyPlugin(async (s) => {
  const contests = s.db.db.collection<IContest>('contests')
  await contests.createIndex({ orgId: 1, slug: 1 }, { unique: true })
  await contests.createIndex({ orgId: 1, tags: 1 })
  await contests.createIndex({ [`associations.principalId`]: 1 })
  s.db.contests = contests
  const contestParticipants = s.db.db.collection<IContestParticipant>('contestParticipants')
  await contestParticipants.createIndex({ userId: 1, contestId: 1 }, { unique: true })
  await contestParticipants.createIndex({ contestId: 1, updatedAt: 1, _id: 1 })
  s.db.contestParticipants = contestParticipants
})
