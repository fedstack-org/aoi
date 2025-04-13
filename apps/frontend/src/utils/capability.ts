import { computed } from 'vue'

import { useAppState } from '@/stores/app'

export function hasCapability(cap: string, bitPos: number) {
  return !!(BigInt(cap) & (1n << BigInt(bitPos)))
}

export const orgBits = {
  access: 0,
  admin: 1,
  problem: 2,
  contest: 3,
  plan: 4,
  app: 5,
  instance: 6
}

export const orgLimits = {
  problem: 0,
  contest: 1,
  plan: 2,
  app: 3
}

export const problemBits = {
  access: 0,
  admin: 1,
  solution: 2,
  content: 3,
  data: 4,
  instance: 5
}

export const contestBits = {
  access: 0,
  admin: 1,
  content: 2,
  registration: 3
}

export const planBits = {
  access: 0,
  admin: 1,
  content: 2,
  registration: 3
}

export const appBits = {
  access: 0,
  admin: 1,
  content: 2,
  login: 3
}

export const userBits = {
  admin: 0,
  createOrg: 1
}

export function useUserCapability(cap: keyof typeof userBits) {
  const app = useAppState()
  return computed(() => hasCapability(app.userCapability, userBits[cap]))
}

export function useOrgCapability(cap: keyof typeof orgBits) {
  const app = useAppState()
  return computed(() => hasCapability(app.orgCapability, orgBits[cap]))
}
