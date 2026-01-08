<template>
  <VCardTitle>Participant Admin</VCardTitle>
  <VCardText>
    <VFileInput
      v-model="batchSetFile"
      label="Upload XLSX"
      accept=".xlsx"
      prepend-icon="mdi-microsoft-excel"
    />
    <VBtn
      @click="batchSetFileExec"
      :loading="batchSetFileLoading"
      :disabled="!batchSetFile"
      color="primary"
    >
      Batch Set
    </VBtn>
  </VCardText>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { IContestDTO } from '@/components/contest/types'
import { useAsyncTask } from '@/utils/async'
import { participantBatchUpdate } from '@/utils/contest/participant'

const props = defineProps<{
  orgId: string
  contestId: string
  contest: IContestDTO
}>()

const batchSetFile = ref<File | null>(null)
const { execute: batchSetFileExec, isLoading: batchSetFileLoading } = useAsyncTask(async () => {
  if (batchSetFile.value) {
    participantBatchUpdate(props.contestId, batchSetFile.value)
    batchSetFile.value = null
  }
})
</script>
