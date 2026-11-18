import { type MaybeRef, onMounted, ref, toRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { noMessage, useAsyncTask } from '../async'
import { http } from '../http'

import { useAppState } from '@/stores/app'

/**
 * PKU IAAA through top-level navigation only.
 *
 * IAAA refuses to be framed and popups are not allowed. The flow leaves the
 * page for `/auth/iaaa` (the relay page shipped in `public/auth/iaaa`), which
 * sends the user to IAAA with this build's app settings and forwards the
 * token to `/auth/iaaa-callback#token=…&state=…`. A per-tab flow record in
 * sessionStorage remembers what to finish and where to resume.
 */

export type IaaaAction = 'login' | 'rebind'

interface IIaaaFlow {
  id: string
  action: IaaaAction
  returnTo: string
  createdAt: number
  token?: string
}

export type IaaaFlowResult =
  | { status: 'none' }
  | { status: 'abandoned' }
  | { status: 'completed'; token: string }

const FLOW_KEY = 'aoi:iaaa-flow'
const FLOW_TTL = 15 * 60 * 1000
const RELAY_PATH = '/auth/iaaa'
const CALLBACK_PATH = '/auth/iaaa-callback'

function readFlow(): IIaaaFlow | null {
  try {
    const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null')
    if (
      flow &&
      typeof flow.id === 'string' &&
      typeof flow.action === 'string' &&
      typeof flow.returnTo === 'string' &&
      typeof flow.createdAt === 'number'
    ) {
      return flow
    }
  } catch {
    // ignore malformed or unavailable storage
  }
  return null
}

function clearFlow() {
  try {
    sessionStorage.removeItem(FLOW_KEY)
  } catch {
    // ignore unavailable storage
  }
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Leave the page for IAAA. The current history entry is replaced so Back skips it. */
export function startIaaa(action: IaaaAction, returnTo: string) {
  const flow: IIaaaFlow = { id: randomState(), action, returnTo, createdAt: Date.now() }
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(flow))
  const url = new URL(RELAY_PATH, location.origin)
  url.searchParams.set('relay', '1')
  url.searchParams.set('state', flow.id)
  url.searchParams.set('return', new URL(CALLBACK_PATH, location.origin).href)
  url.searchParams.set('appID', import.meta.env.VITE_IAAA_APPID)
  url.searchParams.set('appName', import.meta.env.VITE_IAAA_APPNAME)
  location.replace(url.href)
}

/** Handle `/auth/iaaa-callback`; returns where to resume, or null if rejected. */
export function receiveIaaa(): string | null {
  const fragment = new URLSearchParams(location.hash.slice(1))
  // Never leave the token in the address bar or history.
  history.replaceState(history.state, '', location.pathname)
  const flow = readFlow()
  if (!flow || flow.token || Date.now() - flow.createdAt > FLOW_TTL) {
    clearFlow()
    return null
  }
  const token = fragment.get('token')
  if (!token || fragment.get('state') !== flow.id) {
    clearFlow()
    return null
  }
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...flow, token }))
  return flow.returnTo
}

/** Drop an unfinished flow for `action`, including this origin's relay record. */
export function abandonIaaa(action: IaaaAction) {
  const flow = readFlow()
  if (flow?.action !== action || flow.token) return
  clearFlow()
  try {
    sessionStorage.removeItem('aoi:iaaa-relay')
  } catch {
    // ignore unavailable storage
  }
}

/** Consume the flow for `action` on the page that started it. */
export function takeIaaa(action: IaaaAction): IaaaFlowResult {
  const flow = readFlow()
  if (!flow || flow.action !== action) return { status: 'none' }
  clearFlow()
  if (!flow.token || Date.now() - flow.createdAt > FLOW_TTL) return { status: 'abandoned' }
  return { status: 'completed', token: flow.token }
}

export function useRebindIaaa(userId: MaybeRef<string>) {
  const userIdRef = toRef(userId)
  const app = useAppState()
  const route = useRoute()
  const router = useRouter()
  const redirecting = ref(false)

  const bindTask = useAsyncTask(async (token: string) => {
    await http.post(`user/${userIdRef.value}/bind`, {
      json: {
        provider: 'iaaa',
        payload: { token },
        mfaToken: app.mfaToken
      }
    })
  })

  const updateTask = useAsyncTask(async () => {
    redirecting.value = true
    startIaaa('rebind', router.resolve({ path: route.path, query: route.query }).fullPath)
    return noMessage()
  })

  onMounted(() => {
    const result = takeIaaa('rebind')
    if (result.status === 'completed') bindTask.execute(result.token)
  })

  return { updateTask, bindTask, redirecting }
}
