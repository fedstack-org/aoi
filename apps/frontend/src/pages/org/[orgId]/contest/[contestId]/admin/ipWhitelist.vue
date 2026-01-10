<template>
  <VCard flat :title="t('title')">
    <VCardSubtitle>{{ t('description') }}</VCardSubtitle>
    <VDivider />
    <VCardText>
      <VList>
        <VListItem v-for="(cidr, index) in ipWhitelist" :key="index">
          <template v-slot:prepend>
            <VIcon icon="mdi-ip-network" />
          </template>
          <VListItemTitle class="u-font-mono">{{ cidr }}</VListItemTitle>
          <template v-slot:append>
            <VBtn icon="mdi-delete" variant="text" color="red" @click="removeCIDR(index)" />
          </template>
        </VListItem>
        <VListItem v-if="ipWhitelist.length === 0">
          <VListItemTitle class="text-grey">{{ t('empty') }}</VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
    <VDivider />
    <VCardText>
      <VForm @submit.prevent="addCIDR">
        <VRow align="center">
          <VCol>
            <VTextField
              v-model="newCIDR"
              :label="t('new-cidr')"
              :placeholder="t('cidr-placeholder')"
              :rules="[validateCIDR]"
              density="compact"
              hide-details="auto"
            />
          </VCol>
          <VCol cols="auto">
            <VBtn type="submit" color="primary" :disabled="!isValidCIDR(newCIDR)">
              {{ t('action.add') }}
            </VBtn>
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
    <VDivider />
    <VCardActions>
      <VBtn
        color="primary"
        variant="elevated"
        :loading="saveTask.isLoading.value"
        @click="saveTask.execute()"
      >
        {{ t('action.save') }}
      </VBtn>
      <VBtn color="secondary" variant="outlined" @click="resetList">
        {{ t('action.reset') }}
      </VBtn>
    </VCardActions>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { IContestDTO } from '@/components/contest/types'
import { useAsyncTask, withMessage } from '@/utils/async'
import { http } from '@/utils/http'

const props = defineProps<{
  orgId: string
  contestId: string
  contest: IContestDTO
}>()

const emit = defineEmits<{
  (ev: 'updated'): void
}>()

const { t } = useI18n()

const ipWhitelistData = useAsyncState(
  () => http.get(`contest/${props.contestId}/admin/ipWhitelist`).json<{ ipWhitelist: string[] }>(),
  { ipWhitelist: [] },
  { immediate: true }
)

const ipWhitelist = ref<string[]>([])
const newCIDR = ref('')

watch(
  () => ipWhitelistData.state.value,
  (data) => {
    ipWhitelist.value = [...data.ipWhitelist]
  },
  { immediate: true }
)

// IPv4: 每个 octet 限制在 0-255，前缀长度 0-32
// IPv6: 基本格式检查，前缀长度 0-128
const cidrPattern =
  /^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\/([0-9]|[1-2][0-9]|3[0-2]))?$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/

function isValidCIDR(value: string): boolean {
  if (!value) return false
  return cidrPattern.test(value.trim())
}

function validateCIDR(value: string): boolean | string {
  if (!value) return true
  if (isValidCIDR(value)) return true
  return t('hint.invalid-cidr')
}

function addCIDR() {
  const trimmed = newCIDR.value.trim()
  if (!isValidCIDR(trimmed)) return
  if (ipWhitelist.value.includes(trimmed)) return
  ipWhitelist.value.push(trimmed)
  newCIDR.value = ''
}

function removeCIDR(index: number) {
  ipWhitelist.value.splice(index, 1)
}

function resetList() {
  ipWhitelist.value = [...ipWhitelistData.state.value.ipWhitelist]
  newCIDR.value = ''
}

const saveTask = useAsyncTask(async () => {
  await http.patch(`contest/${props.contestId}/admin/ipWhitelist`, {
    json: { ipWhitelist: ipWhitelist.value }
  })
  await ipWhitelistData.execute()
  emit('updated')
  return withMessage(t('msg.saved'))
})
</script>

<i18n>
en:
  title: IP Whitelist
  description: Only IPs in the whitelist can access this contest. Leave empty to allow all IPs. Administrators are not affected.
  empty: No IP restrictions configured
  new-cidr: Add CIDR
  cidr-placeholder: e.g. 10.0.0.0/8 or 192.168.1.0/24
  action:
    add: Add
    save: Save
    reset: Reset
  hint:
    invalid-cidr: Invalid CIDR format
  msg:
    saved: IP whitelist saved
zh-Hans:
  title: IP 白名单
  description: 只有白名单中的 IP 可以访问此比赛。留空则允许所有 IP。管理员不受影响。
  empty: 未配置 IP 限制
  new-cidr: 添加 CIDR
  cidr-placeholder: 例如 10.0.0.0/8 或 192.168.1.0/24
  action:
    add: 添加
    save: 保存
    reset: 重置
  hint:
    invalid-cidr: CIDR 格式无效
  msg:
    saved: IP 白名单已保存
</i18n>
