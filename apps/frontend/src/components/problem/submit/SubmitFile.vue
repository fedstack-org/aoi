<template>
  <VCard variant="flat">
    <VCardText>
      <VFileInput v-model="file" :label="t('action.upload')" />
    </VCardText>
    <VCardActions>
      <VBtn color="primary" @click="submit">{{ t('action.submit') }}</VBtn>
      <slot />
    </VCardActions>
  </VCard>
</template>

<script setup lang="ts">
import type { ProblemConfig } from '@aoi-js/common'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  config: ProblemConfig
}>()

const emit = defineEmits<{
  (ev: 'upload', file: File): void
}>()

const file = ref<File | null>(null)

function submit() {
  if (file.value) {
    emit('upload', file.value)
  }
}
</script>
