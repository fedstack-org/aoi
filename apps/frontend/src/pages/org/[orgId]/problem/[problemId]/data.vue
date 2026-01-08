<template>
  <VCard flat>
    <AsyncState :state="versions" hide-when-loading>
      <template v-slot="{ value }">
        <VTable>
          <thead>
            <tr>
              <th>{{ t('term.hash') }}</th>
              <th>{{ t('term.description') }}</th>
              <th>{{ t('created-at') }}</th>
              <th>{{ t('actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="version in value" :key="version.hash">
              <td>
                <VIcon
                  icon="mdi-source-commit"
                  :color="version.hash === problem.currentDataHash ? 'blue' : undefined"
                />
                <code class="px-2">{{ version.hash.substring(0, 7) }}</code>
                <VChip
                  v-if="version.hash === problem.currentDataHash"
                  color="blue"
                  label
                  :text="t('current')"
                  small
                />
              </td>
              <td>{{ version.description }}</td>
              <td>{{ new Date(version.createdAt).toLocaleString() }}</td>
              <td>
                <VBtn variant="text" icon="mdi-check" @click="active(version.hash)" />
                <VBtn variant="text" icon="mdi-download" @click="download(version.hash)" />
                <VBtn variant="text" icon="mdi-delete" @click="remove(version.hash)" />
                <VBtn
                  variant="text"
                  icon="mdi-eye"
                  @click="((currentVersion = version), (infoDialog = true))"
                />
              </td>
            </tr>
          </tbody>
        </VTable>
        <VDialog v-model="infoDialog" width="auto">
          <VCard v-if="currentVersion" class="u-min-w-128" :title="t('data')">
            <JsonViewer :raw-data="currentVersion.config" />
            <VCardText>
              <VTextField
                readonly
                :model-value="currentVersion.hash"
                :label="t('hash')"
                class="u-font-mono"
              />
            </VCardText>
          </VCard>
        </VDialog>
      </template>
    </AsyncState>
    <VDivider />
    <DataUpload :problem="problem" @updated="versions.execute()" />
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import DataUpload from '@/components/problem/DataUpload.vue'
import type { IProblemDTO } from '@/components/problem/types'
import AsyncState from '@/components/utils/AsyncState.vue'
import JsonViewer from '@/components/utils/JsonViewer.vue'
import { http } from '@/utils/http'

const { t } = useI18n()

const props = defineProps<{
  orgId: string
  problemId: string
  problem: IProblemDTO
}>()

const emit = defineEmits<{
  (ev: 'updated'): void
}>()

const infoDialog = ref(false)
const currentVersion = shallowRef<{
  hash: string
  description: string
  createdAt: number
  config: unknown
} | null>(null)

const versions = useAsyncState(async () => {
  const resp = await http.get(`problem/${props.problem._id}/data`)
  const data = await resp.json<
    {
      hash: string
      description: string
      createdAt: number
      config: unknown
    }[]
  >()
  return data.sort((a, b) => b.createdAt - a.createdAt)
}, null as never)

async function active(hash: string) {
  await http.post(`problem/${props.problem._id}/data/setDataHash`, {
    json: { hash }
  })
  emit('updated')
}

async function download(hash: string) {
  const resp = await http.get(`problem/${props.problem._id}/data/${hash}/url/download`)
  const { url } = await resp.json<{ url: string }>()
  window.open(url)
}

async function remove(hash: string) {
  await http.delete(`problem/${props.problem._id}/data/${hash}`)
  const resp = await http.get(`problem/${props.problem._id}/data/${hash}/url/delete`)
  const { url } = await resp.json<{ url: string }>()
  await fetch(url, { method: 'DELETE' })
  versions.execute()
}
</script>

<i18n>
en:
  filename: File Name
  description: Description
  actions: Actions
  filelist: File List
  upload-file: Upload File
  upload: Upload
  close: Close
  created-at: Create at
zh-Hans:
  filename: 文件名
  description: 描述
  actions: 操作
  filelist: 文件列表
  upload-file: 上传文件
  upload: 上传
  close: 关闭
  created-at: 创建于
</i18n>
