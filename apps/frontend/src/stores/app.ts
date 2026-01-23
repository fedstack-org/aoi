import { useAsyncState, useLocalStorage, useTitle, watchDebounced } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch, type Component, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { IOrgProfile, IUserProfile } from '@/types'
import {
  http,
  isLoggedIn,
  isMfaAlive,
  login,
  mfaTokenValue,
  setMfaToken,
  userId
} from '@/utils/http'

export const useAppState = defineStore('app_state', () => {
  const route = useRoute()

  const user = useAsyncState(
    async () => {
      const resp = await http.get(`user/${userId.value}`)
      const user = await resp.json<{
        profile: IUserProfile
        capability: string
      }>()
      return user
    },
    null,
    { immediate: false }
  )
  watchDebounced(userId, () => user.execute(), { immediate: true })

  const joinedOrgs = useAsyncState(
    async () => {
      const orgs = await http.get('org').json<
        Array<{
          _id: string
          profile: {
            name: string
            email: string
          }
        }>
      >()
      if (!orgId.value) orgId.value = orgs[0]._id
      return orgs
    },
    [],
    { immediate: false }
  )
  watchDebounced(userId, () => joinedOrgs.execute(), { immediate: true })

  const orgId = ref((route.params.orgId as string) ?? '')
  watch(
    () => route.params.orgId,
    (val) => val && (orgId.value = val as string)
  )
  const orgProfile = useAsyncState(
    async () => {
      if (!orgId.value) return null
      const resp = await http.get(`org/${orgId.value}`)
      return resp.json<{ profile: IOrgProfile; membership: { capability: string } }>()
    },
    null,
    { immediate: false }
  )
  watchDebounced(orgId, () => orgProfile.execute(), { immediate: true })

  const navBar = ref<boolean>()
  const title = useTitle()
  const navBarExtension = shallowRef<[Component, Ref]>()
  const loggedIn = isLoggedIn
  const mfaAlive = isMfaAlive
  const mfaToken = mfaTokenValue

  const debug = useLocalStorage('aoi-debug', false, { writeDefaults: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides = useLocalStorage('aoi-GENSHIN-OVERRIDES', {} as Record<string, any>, {
    writeDefaults: false
  })
  const withOverride = <T>(key: string, fn: () => T) => computed(() => overrides.value[key] ?? fn())
  return {
    navBar,
    navBarExtension,
    title,
    loggedIn,
    userId,
    mfaToken,
    mfaAlive,
    user: computed(() => user),
    joinedOrgs: computed(() => joinedOrgs),
    userCapability: withOverride('userCapability', () => user.state.value?.capability ?? '0'),
    orgId,
    orgProfile: computed(() => orgProfile),
    orgCapability: withOverride(
      'orgCapability',
      () => orgProfile.state.value?.membership?.capability ?? '0'
    ),
    debug: computed(() => debug.value),
    overrides: computed(() => overrides.value)
  }
})

export function useMfa() {
  const app = useAppState()
  const router = useRouter()
  const route = useRoute()
  return {
    hasMfaToken: computed(() => app.mfaAlive),
    postVerify: (token: string) => {
      setMfaToken(token)
      if (route.query.redirect) {
        router.replace(`${route.query.redirect}`)
      } else {
        router.replace('/')
      }
    },
    doVerify: () => {
      router.push({
        path: '/auth/verify',
        query: { redirect: route.fullPath }
      })
    }
  }
}

export function useLogin() {
  const router = useRouter()
  const route = useRoute()

  function postLogin(token: string) {
    login(token)
    if (route.query.redirect) {
      router.replace(`${route.query.redirect}`)
    } else {
      router.replace('/')
    }
  }

  function doLogin() {
    router.push({
      path: '/auth/login',
      query: { redirect: route.fullPath }
    })
  }

  function checkLogin() {
    if (!isLoggedIn.value) doLogin()
  }

  return {
    isLoggedIn,
    postLogin,
    doLogin,
    checkLogin
  }
}
