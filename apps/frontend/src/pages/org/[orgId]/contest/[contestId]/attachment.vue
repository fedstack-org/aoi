<template>
  <VCard :title="t('tabs.attachments')">
    <AsyncState :state="attachments" hide-when-loading>
      <template v-slot="{ value }">
        <VTable>
          <thead>
            <tr>
              <th>{{ t('term.filename') }}</th>
              <th>{{ t('term.description') }}</th>
              <th>{{ t('term.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in value" :key="file.key">
              <td>
                <VIcon icon="mdi-file-outline"></VIcon>
                {{ file.name || file.key }}
              </td>
              <td>{{ file.description }}</td>
              <td>
                <VBtn variant="plain" icon="mdi-download" @click="downloadFile(file.key)" />
                <VBtn
                  variant="plain"
                  v-if="canManage"
                  icon="mdi-delete"
                  @click="deleteFile(file.key)"
                />
              </td>
            </tr>
          </tbody>
        </VTable>
      </template>
    </AsyncState>
    <template v-if="canManage">
      <VDivider />
      <VCard :title="t('upload-file')" variant="flat">
        <VCardText>
          <VFileInput v-model="uploadInfo.file" />
          <VTextField :label="t('term.key')" v-model="uploadInfo.key" />
          <VTextField :label="t('term.name')" v-model="uploadInfo.name" />
          <VTextField :label="t('term.description')" v-model="uploadInfo.description" />
        </VCardText>
        <VCardActions>
          <VBtn prepend-icon="mdi-upload" rounded="none" class="my-auto" @click="uploadFile()">
            {{ t('action.upload') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </template>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { IContestDTO } from '@/components/contest/types'
import AsyncState from '@/components/utils/AsyncState.vue'
import { hasCapability } from '@/utils/capability'
import { http } from '@/utils/http'

const props = defineProps<{
  orgId: string
  contestId: string
  contest: IContestDTO
}>()

const { t } = useI18n()
const toast = useToast()

const attachments = useAsyncState(async () => {
  const resp = await http.get(`contest/${props.contestId}/attachment`)
  const data = await resp.json<
    {
      key: string
      name: string
      description: string
    }[]
  >()
  return data
}, null as never)

const canManage = computed(() => hasCapability(props.contest.capability, 1))

async function downloadFile(key: string) {
  key = encodeURIComponent(key)
  const resp = await http.get(`contest/${props.contestId}/attachment/${key}/url/download`)
  const { url } = await resp.json<{ url: string }>()
  window.open(url)
}

async function deleteFile(key: string) {
  try {
    key = encodeURIComponent(key)
    const resp = await http.get(`contest/${props.contestId}/attachment/${key}/url/delete`)
    const { url } = await resp.json<{ url: string }>()
    await fetch(url, { method: 'DELETE' })
    await http.delete(`contest/${props.contestId}/attachment/${key}`)
    attachments.execute()
  } catch (err) {
    toast.error(`Failed to delete: ${err}`)
  }
}

const uploadInfo = reactive({
  file: null as File | null,
  key: '',
  name: '',
  description: ''
})

watch(
  () => uploadInfo.file,
  () => {
    if (uploadInfo.file) {
      uploadInfo.key = uploadInfo.file.name
      uploadInfo.name = uploadInfo.file.name
    }
  }
)

async function uploadFile() {
  try {
    const key = encodeURIComponent(uploadInfo.key)
    const resp = await http.get(`contest/${props.contestId}/attachment/${key}/url/upload`)
    const { url } = await resp.json<{ url: string }>()
    await fetch(url, {
      method: 'PUT',
      body: uploadInfo.file
    })
    await http.post(`contest/${props.contestId}/attachment`, {
      json: {
        key: uploadInfo.key,
        name: uploadInfo.name,
        description: uploadInfo.description
      }
    })
    attachments.execute()
  } catch (err) {
    toast.error(`Failed to upload: ${err}`)
  }
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
zh-Hans:
  filename: 文件名
  description: 描述
  actions: 操作
  filelist: 文件列表
  upload-file: 上传文件
  upload: 上传
  close: 关闭
</i18n>
