<template>
  <AsyncState :state="metadata">
    <template v-slot="{ value }">
      <template v-if="value.status === 'public' || value.status === 'protected'">
        <VCardText class="text-body-2">
          {{ t('ranklist-published-at') }}
          <RouterLink :to="`/rk/${value.ranklistId}`">
            {{ `/rk/${value.ranklistId}` }}
          </RouterLink>
        </VCardText>
        <SettingsEditor :endpoint="`rk/${value.ranklistId}/settings`">
          <template v-slot="scoped">
            <RanklistPublicSettingsInput v-model="scoped.value" />
          </template>
        </SettingsEditor>
        <VCardActions>
          <VBtn color="error" variant="elevated" @click="erasePublic()">
            {{ t('action.cancel-publish') }}
          </VBtn>
        </VCardActions>
      </template>
      <template v-else>
        <VCardActions>
          <VBtn color="primary" variant="elevated" @click="makePublic()">
            {{ t('action.publish') }}
          </VBtn>
        </VCardActions>
      </template>
    </template>
  </AsyncState>
</template>
<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import SettingsEditor from '../utils/SettingsEditor.vue'

import RanklistPublicSettingsInput from './RanklistPublicSettingsInput.vue'

import AsyncState from '@/components/utils/AsyncState.vue'
import { http } from '@/utils/http'

const { t } = useI18n()
const props = defineProps<{
  contestId: string
  orgId: string
  ranklistKey: string
}>()

const metadata = useAsyncState(async () => {
  const resp = await http.get('rk', {
    searchParams: {
      contestId: props.contestId,
      ranklistKey: props.ranklistKey
    }
  })
  return await resp.json<{ ranklistId: string; status: string }>()
}, null as never)

async function makePublic() {
  await http.post(`rk`, {
    json: {
      contestId: props.contestId,
      ranklistKey: props.ranklistKey,
      orgId: props.orgId
    }
  })
  metadata.execute()
}

async function erasePublic() {
  await http.delete(`rk/${metadata.state.value.ranklistId}`)
  metadata.execute()
}
</script>
<i18n>
en:
  ranklist-published-at: Ranklist published at
zh-Hans:
  ranklist-published-at: 排行榜已发布于
</i18n>
