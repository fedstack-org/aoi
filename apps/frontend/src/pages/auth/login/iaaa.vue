<template>
  <VCardText class="text-center">
    <VProgressCircular indeterminate />
    <p>{{ t('iaaa-wait') }}</p>
  </VCardText>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useLogin } from '@/stores/app'
import { trackLogin } from '@/utils/analytics'
import { useAsyncTask } from '@/utils/async'
import { http, prettyHTTPError } from '@/utils/http'
import { getToken } from '@/utils/user/iaaa'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { postLogin } = useLogin()

const task = useAsyncTask(async () => {
  try {
    const resp = await http.post('auth/login', {
      json: {
        provider: 'iaaa',
        payload: {
          token: await getToken()
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

onMounted(() => {
  task.execute()
})
</script>

<i18n>
en:
  iaaa-wait: Waiting for IAAA login...
zh-Hans:
  iaaa-wait: 等待 IAAA 登录...
</i18n>
