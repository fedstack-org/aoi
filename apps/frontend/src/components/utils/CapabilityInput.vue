<template>
  <VCombobox v-model="chips" :label="t('term.' + type)" multiple chips :items="allCapabilities" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { hasCapability } from '@/utils/capability'

const { t } = useI18n()

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    bits: Record<string, number>
    type?: 'capability' | 'limit'
  }>(),
  { type: 'capability' }
)

const chips = computed({
  get: () =>
    Object.entries(props.bits)
      .filter(([, v]) => hasCapability(model.value, v))
      .map(([k]) => k),
  set: (value) => {
    model.value = value
      .map((v) => 1n << BigInt(props.bits[v]))
      .reduce((a, b) => a | b, 0n)
      .toString()
  }
})

const allCapabilities = computed(() => Object.keys(props.bits))
</script>
