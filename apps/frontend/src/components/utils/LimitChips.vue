<template>
  <VChipGroup>
    <VChip v-for="capability in capabilities" :key="capability" color="primary">
      {{ t('limit.' + capability) }}
    </VChip>
  </VChipGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { hasCapability } from '@/utils/capability'

const props = defineProps<{
  capability: string
  bits: Record<string, number>
}>()

const { t } = useI18n()

const capabilities = computed(() =>
  Object.entries(props.bits)
    .filter(([, v]) => hasCapability(props.capability, v))
    .map(([k]) => k)
)
</script>
