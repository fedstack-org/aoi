<template>
  <VContainer class="fill-height d-flex align-center justify-center">
    <VCard class="u-min-w-80" :title="t('title')">
      <VCardText>
        <VAlert v-if="expired" type="warning" :text="t('expired')" />
        <template v-else>
          <VProgressCircular indeterminate />
        </template>
      </VCardText>
      <VCardActions v-if="expired">
        <VBtn block variant="tonal" to="/" :text="t('home')" />
      </VCardActions>
    </VCard>
  </VContainer>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { receiveIaaa } from '@/utils/user/iaaa'

const { t } = useI18n()
const router = useRouter()
const expired = ref(false)

onMounted(() => {
  const returnTo = receiveIaaa()
  if (returnTo) router.replace(returnTo)
  else expired.value = true
})
</script>

<i18n>
en:
  title: IAAA
  expired: The IAAA request has expired or was already completed. Please start again.
  home: Back to home
zh-Hans:
  title: IAAA
  expired: IAAA 请求已失效或已完成，请重新发起。
  home: 返回首页
</i18n>
