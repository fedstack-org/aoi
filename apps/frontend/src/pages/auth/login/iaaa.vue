<template>
  <VCardText class="text-center">
    <template v-if="abandoned">
      <p class="mb-4">{{ t('iaaa-abandoned') }}</p>
      <VBtn color="#9b0000" variant="flat" :text="t('iaaa-retry')" @click="start" />
    </template>
    <template v-else>
      <VProgressCircular indeterminate />
      <p>{{ t('iaaa-wait') }}</p>
    </template>
  </VCardText>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useLogin } from '@/stores/app'
import { trackLogin } from '@/utils/analytics'
import { useAsyncTask } from '@/utils/async'
import { http, prettyHTTPError } from '@/utils/http'
import { startIaaa, takeIaaa } from '@/utils/user/iaaa'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { postLogin } = useLogin()
const abandoned = ref(false)

const task = useAsyncTask(async (iaaaToken: string) => {
  try {
    const resp = await http.post('auth/login', {
      json: {
        provider: 'iaaa',
        payload: {
          token: iaaaToken
        }
      }
    })
    const { token } = await resp.json<{ token: string }>()
    trackLogin('iaaa', 'true')
    postLogin(token)
  } catch (err) {
    trackLogin('iaaa', 'false')
    router.replace({ path: '/auth/login', query: route.query })
    throw new Error(await prettyHTTPError(err))
  }
})

function start() {
  startIaaa('login', router.resolve({ path: route.path, query: route.query }).fullPath)
}

onMounted(() => {
  const result = takeIaaa('login')
  if (result.status === 'completed') return task.execute(result.token)
  // Returned without a token (for example with Back): offer a retry instead of looping.
  if (result.status === 'abandoned') abandoned.value = true
  else start()
})
</script>

<i18n>
en:
  iaaa-wait: Redirecting to IAAA...
  iaaa-abandoned: IAAA login was not completed.
  iaaa-retry: Continue to IAAA
zh-Hans:
  iaaa-wait: 正在跳转到 IAAA...
  iaaa-abandoned: IAAA 登录未完成。
  iaaa-retry: 前往 IAAA 登录
</i18n>
