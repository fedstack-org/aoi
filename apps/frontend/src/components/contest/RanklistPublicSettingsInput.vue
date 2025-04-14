<template>
  <VCheckbox v-model="model.visible" :label="t('term.is-visible')" color="primary" />
  <VTextField v-model="model.password" :label="t('term.password')" color="primary" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const model = defineModel<{
  visible: boolean
  password: string
}>({ required: true })
</script>
