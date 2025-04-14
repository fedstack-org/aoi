<template>
  <AsyncState :state="data">
    <template v-slot="{ value }">
      <VTabs v-model="currentTab">
        <VTab
          prepend-icon="mdi-form-textarea"
          value="visual"
          :text="t('visualized')"
          v-if="slots.default"
        />
        <VTab prepend-icon="mdi-code-json" value="raw" :text="t('raw')" v-if="!hideRaw" />
        <VBtn
          :text="t('action.refresh')"
          prepend-icon="mdi-refresh"
          variant="text"
          class="align-self-center"
          @click="data.execute()"
        />
        <VBtn
          :text="t('action.fullscreen')"
          prepend-icon="mdi-fullscreen"
          variant="text"
          class="align-self-center"
          v-if="fullscreen"
          @click="enterFullscreen()"
        />
      </VTabs>
      <VWindow v-model="currentTab">
        <VWindowItem value="visual" v-if="slots.default" ref="viewer">
          <slot :value="value"></slot>
        </VWindowItem>
        <VWindowItem value="raw" v-if="!hideRaw">
          <MonacoEditor readonly language="json" :model-value="JSON.stringify(value, null, 2)" />
        </VWindowItem>
      </VWindow>
    </template>
    <template #error="{ state, error }">
      <slot name="error" :state="state" :error="error"></slot>
    </template>
  </AsyncState>
</template>

<script setup lang="ts" generic="T">
import { useAsyncState } from '@vueuse/core'
import ky from 'ky'
import { ref, useSlots, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'

import AsyncState from './AsyncState.vue'
import MonacoEditor from './MonacoEditor.vue'

import { http } from '@/utils/http'

const props = defineProps<{
  endpoint?: string
  headers?: Record<string, string>
  url?: string
  rawData?: T
  rawString?: string
  hideRaw?: boolean
  fullscreen?: boolean
}>()
const slots = useSlots()
const { t } = useI18n()
const currentTab = ref()
const viewer = ref<ComponentPublicInstance | null>(null)

async function resolveUrl() {
  if (props.url) return props.url
  if (props.endpoint) {
    const { url } = await http
      .get(`${props.endpoint}/download`, { headers: props.headers })
      .json<{ url: string }>()
    return url
  }
  throw new Error('No url or endpoint provided')
}

const data = useAsyncState(
  async () => {
    if (props.rawData) return props.rawData
    if (props.rawString) return JSON.parse(props.rawString)
    const url = await resolveUrl()
    const json = await ky.get(url).json<T>()
    return json
  },
  null,
  { resetOnExecute: false }
)

watch([() => props.endpoint, () => props.url, () => props.rawString], () => data.execute())

function enterFullscreen() {
  viewer.value?.$el?.requestFullscreen?.()
}
</script>
<i18n>
en:
  visualized: Visualized
  raw: Raw
zh-Hans:
  visualized: 可视化
  raw: 原始数据
</i18n>
