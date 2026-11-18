<template>
  <VCardActions>
    <VBtn
      variant="elevated"
      @click="updateTask.execute()"
      :loading="redirecting || bindTask.isLoading.value"
    >
      {{ t('rebind-iaaa') }}
    </VBtn>
  </VCardActions>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useRebindIaaa } from '@/utils/user/iaaa'

const props = defineProps<{
  userId: string
}>()

const { t } = useI18n()

const { updateTask, bindTask, redirecting } = useRebindIaaa(toRef(props, 'userId'))
</script>

<i18n>
en:
  rebind-iaaa: Rebind IAAA
zh-Hans:
  rebind-iaaa: 重新绑定 IAAA
</i18n>
