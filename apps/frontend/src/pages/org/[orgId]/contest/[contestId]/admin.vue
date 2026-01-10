<template>
  <VRow>
    <VCol cols="auto">
      <VTabs direction="vertical" color="primary">
        <VTab prepend-icon="mdi-cog" :to="rel('')" exact>
          {{ t('term.settings') }}
        </VTab>
        <VTab prepend-icon="mdi-text" :to="rel('content')">
          {{ t('term.content') }}
        </VTab>
        <VTab prepend-icon="mdi-table-clock" :to="rel('stage')">
          {{ t('term.contest-stage') }}
        </VTab>
        <VTab prepend-icon="mdi-lock" :to="rel('access')">
          {{ t('term.access') }}
        </VTab>
        <VTab prepend-icon="mdi-code-tags" :to="rel('rule')">
          {{ t('term.rules') }}
        </VTab>
        <VTab prepend-icon="mdi-ip-network" :to="rel('ipWhitelist')">
          {{ t('term.ip-whitelist') }}
        </VTab>
      </VTabs>
    </VCol>
    <VCol>
      <VCard>
        <RouterView :contest="contest" @updated="emit('updated')" />
      </VCard>
    </VCol>
  </VRow>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { IContestDTO } from '@/components/contest/types'
import { withTitle } from '@/utils/title'

const props = defineProps<{
  orgId: string
  contestId: string
  contest: IContestDTO
}>()

const emit = defineEmits<{
  (ev: 'updated'): void
}>()

const { t } = useI18n()

withTitle(computed(() => t('pages.contests')))

const rel = (to: string) => `/org/${props.orgId}/contest/${props.contestId}/admin/${to}`
</script>
