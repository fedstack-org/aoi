import { useLocalStorage, useThrottleFn } from '@vueuse/core'
import ky, { HTTPError } from 'ky'
import { computed } from 'vue'
import { useToast } from 'vue-toastification'

import router from '@/router'

const toast = useToast()

const token = useLocalStorage('aoi-auth-token', '')
export const isLoggedIn = computed(() => !!token.value)
export const userId = computed(
  () => token.value && JSON.parse(atob(token.value.split('.')[1])).userId
)

const mfaToken = useLocalStorage('aoi-mfa-token', '', { writeDefaults: false })
export const isMfaAlive = computed(
  () => mfaToken.value && JSON.parse(atob(mfaToken.value.split('.')[1])).exp * 1000 > Date.now()
)
export const mfaTokenValue = computed(() => mfaToken.value)

const throttledLogout = useThrottleFn(() => {
  toast.error('Session expired')
  logout()
  router.push({
    path: '/auth/login',
    query: { redirect: router.currentRoute.value.fullPath }
  })
}, 500)

export const http: typeof ky = ky.create({
  prefixUrl: '/api',
  hooks: {
    beforeRequest: [
      (req) => {
        token.value && req.headers.set('Authorization', `Bearer ${token.value}`)
      }
    ],
    beforeError: [
      async (err: HTTPError) => {
        if (err.response.status === 401 && token.value) {
          const { code } = (await err.response.json()) as { code: string }
          if (code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
            throttledLogout()
          }
        }
        return err
      }
    ]
  }
})

export function logout() {
  token.value = ''
  mfaToken.value = ''
}

export function login(_token: string) {
  token.value = _token
}

export function setMfaToken(_token: string) {
  mfaToken.value = _token
}

export async function prettyHTTPError(err: unknown, defaultMsg = `${err}`): Promise<string> {
  if (err instanceof HTTPError) {
    return await err.response
      .json()
      .then(({ message }) => message)
      .catch((err) => `${err}`)
  }
  return defaultMsg
}
