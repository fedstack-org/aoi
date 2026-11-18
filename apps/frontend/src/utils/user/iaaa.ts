import { type MaybeRef, toRef } from 'vue'

import { sleep, useAsyncTask } from '../async'
import { http } from '../http'

import { useAppState } from '@/stores/app'

const html = `
<form action=https://iaaa.pku.edu.cn/iaaa/oauth.jsp method=post name=iaaa style="display: none">
  <input type=hidden name=appID value="${import.meta.env.VITE_IAAA_APPID}" />
  <input type=hidden name=appName value="${import.meta.env.VITE_IAAA_APPNAME}" />
  <input type=hidden name=redirectUrl value="${import.meta.env.VITE_IAAA_REDIR}" />
</form>
`

export async function getToken() {
  // IAAA sends X-Frame-Options: DENY and CSP frame-ancestors 'none'. It must
  // be opened as a top-level document rather than embedded in an iframe.
  const client = window.open('/auth/iaaa', 'iaaa', 'popup,width=800,height=600')
  if (!client) throw new Error('Please allow popups to sign in with IAAA')
  client.document.write(html)
  client.document.forms[0].submit()
  for (;;) {
    try {
      const token = new URLSearchParams(client.document.location.search).get('token')
      if (token) {
        client.close()
        return token
      }
    } catch (err) {
      //
    }
    if (client.closed) throw new Error('IAAA login window was closed')
    await sleep(200)
  }
}

export function useRebindIaaa(userId: MaybeRef<string>) {
  const userIdRef = toRef(userId)
  const app = useAppState()
  const updateTask = useAsyncTask(async () => {
    await http.post(`user/${userIdRef.value}/bind`, {
      json: {
        provider: 'iaaa',
        payload: {
          token: await getToken()
        },
        mfaToken: app.mfaToken
      }
    })
  })
  return { updateTask }
}
