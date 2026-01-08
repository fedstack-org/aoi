<template>
  <VCard variant="flat">
    <VCardTitle class="d-flex justify-space-between">
      <div>{{ t('term.runners') }}</div>
      <VDialog width="auto">
        <template v-slot:activator="{ props }">
          <VBtn color="primary" v-bind="props" :text="t('action.register')" />
        </template>

        <VCard :title="t('action.register')">
          <VCardText>
            <AsyncState :state="registrationToken">
              <template v-slot="{ value }">
                <VTextarea readonly dense :model-value="value" class="u-font-mono" />
              </template>
            </AsyncState>
          </VCardText>
          <VCardActions>
            <VBtn
              color="primary"
              @click="registrationToken.execute()"
              :text="t('action.refresh')"
            />
            <VBtn
              color="primary"
              @click="copyTask.execute()"
              :loading="copyTask.isLoading.value"
              :text="t('action.copy')"
            />
          </VCardActions>
        </VCard>
      </VDialog>
    </VCardTitle>
    <AsyncState :state="runners">
      <template v-slot="{ value }">
        <VDataTable :headers="headers" :items="value" item-value="_id">
          <template v-slot:[`item._id`]="{ item }">
            <code>{{ item._id }}</code>
          </template>
          <template v-slot:[`item.createdAt`]="{ item }">
            <VChip :text="denseDateString(item.createdAt)" />
          </template>
          <template v-slot:[`item.accessedAt`]="{ item }">
            <VChip v-bind="runnerLastAccessAttrs(item.accessedAt)" />
          </template>
          <template v-slot:[`item._labels`]="{ item }">
            <VChipGroup>
              <VChip v-for="label in item.labels" :key="label" small>
                {{ label }}
              </VChip>
            </VChipGroup>
          </template>
          <template v-slot:[`item._actions`]="{ item }">
            <VBtn
              variant="text"
              icon="mdi-pencil"
              @click="((editRunnerId = item._id), (editDialog = true))"
            />
          </template>
        </VDataTable>
      </template>
    </AsyncState>
    <VDialog width="auto" v-model="editDialog">
      <VCard :title="t('term.settings')">
        <VCardText>
          <VAlert type="warning" :text="t('runner-settings-warning')" />
        </VCardText>
        <SettingsEditor
          :endpoint="`org/${orgId}/admin/runner/${editRunnerId}`"
          allow-delete
          @updated="((editDialog = false), runners.execute())"
        >
          <template v-slot="scoped">
            <RunnerInfoInput v-model="scoped.value" />
          </template>
        </SettingsEditor>
      </VCard>
    </VDialog>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import RunnerInfoInput from '@/components/org/admin/RunnerInfoInput.vue'
import AsyncState from '@/components/utils/AsyncState.vue'
import SettingsEditor from '@/components/utils/SettingsEditor.vue'
import type { IRunner } from '@/types'
import { useAsyncTask } from '@/utils/async'
import { http } from '@/utils/http'
import { runnerLastAccessAttrs } from '@/utils/org/runner'
import { denseDateString } from '@/utils/time'

const props = defineProps<{
  orgId: string
}>()

const { t } = useI18n()
const editDialog = ref()
const editRunnerId = ref('')
const runners = useAsyncState(async () => {
  return http.get(`org/${props.orgId}/admin/runner`).json<IRunner[]>()
}, [])
const registrationToken = useAsyncState(async () => {
  const { registrationToken } = await http.post(`org/${props.orgId}/admin/runner/register`).json<{
    registrationToken: string
  }>()
  return registrationToken
}, '')
const copyTask = useAsyncTask(async () => {
  await navigator.clipboard.writeText(registrationToken.state.value)
})

const headers = [
  { title: t('ID'), key: '_id' },
  { title: t('term.name'), key: 'name' },
  { title: t('term.version'), key: 'version' },
  { title: t('term.message'), key: 'message' },
  { title: t('term.ip'), key: 'ip' },
  { title: t('common.created-at'), key: 'createdAt' },
  { title: t('common.accessed-at'), key: 'accessedAt' },
  { title: t('term.labels'), key: '_labels' },
  { title: t('term.actions'), key: '_actions' }
] as const
</script>

<i18n>
en:
  runner-settings-warning: Editing runner labels may cause unexpected behavior.
zh-Hans:
  runner-settings-warning: 编辑 Runner 标签可能导致意外的行为。
</i18n>
