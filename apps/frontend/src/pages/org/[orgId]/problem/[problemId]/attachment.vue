<template>
  <VCard flat>
    <AsyncState :state="attachments" hide-when-loading>
      <template v-slot="{ value }">
        <VTable>
          <thead>
            <tr>
              <th>{{ t('filename') }}</th>
              <th>{{ t('description') }}</th>
              <th>{{ t('actions') }}</th>
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
            {{ t('upload') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </template>
    <VSnackbar :v-model="snackbarRunning">
      {{ snackbarText }}
      <template v-slot:actions>
        <VBtn color="pink" variant="text" @click="snackbarRunning = false">
          {{ t('close') }}
        </VBtn>
      </template>
    </VSnackbar>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { IProblemDTO } from '@/components/problem/types'
import AsyncState from '@/components/utils/AsyncState.vue'
import { hasCapability } from '@/utils/capability'
import { http } from '@/utils/http'

const { t } = useI18n()

const props = defineProps<{
  orgId: string
  problemId: string
  problem: IProblemDTO
}>()

const attachments = useAsyncState(async () => {
  const resp = await http.get(`problem/${props.problem._id}/attachment`)
  const data = await resp.json<
    {
      key: string
      name: string
      description: string
    }[]
  >()
  return data
}, null as never)

const snackbarRunning = ref(false)
const snackbarText = ref('')
const canManage = computed(() => hasCapability(props.problem.capability, 1))

async function downloadFile(key: string) {
  key = encodeURIComponent(key)
  const resp = await http.get(`problem/${props.problem._id}/attachment/${key}/url/download`)
  const { url } = await resp.json<{ url: string }>()
  window.open(url)
}

async function deleteFile(key: string) {
  try {
    key = encodeURIComponent(key)
    const resp = await http.get(`problem/${props.problem._id}/attachment/${key}/url/delete`)
    const { url } = await resp.json<{ url: string }>()
    await fetch(url, { method: 'DELETE' })
    await http.delete(`problem/${props.problem._id}/attachment/${key}`)
    attachments.execute()
  } catch (err) {
    snackbarText.value = `Failed to delete: ${err}`
    snackbarRunning.value = true
  }
}

const uploadInfo = reactive({
  file: null as File | null,
  key: '',
  name: '',
  description: ''
})

async function uploadFile() {
  try {
    const key = encodeURIComponent(uploadInfo.key)
    const resp = await http.get(`problem/${props.problem._id}/attachment/${key}/url/upload`)
    const { url } = await resp.json<{ url: string }>()
    await fetch(url, {
      method: 'PUT',
      body: uploadInfo.file
    })
    await http.post(`problem/${props.problem._id}/attachment`, {
      json: {
        key: uploadInfo.key,
        name: uploadInfo.name,
        description: uploadInfo.description
      }
    })
    attachments.execute()
  } catch (err) {
    snackbarText.value = `Failed to upload: ${err}`
    snackbarRunning.value = true
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
