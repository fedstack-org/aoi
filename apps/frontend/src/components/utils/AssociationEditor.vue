<template>
  <VCard flat>
    <VCardTitle class="d-flex justify-space-between align-center">
      <div>{{ t('term.association') }}</div>
      <div class="flex-grow-1 u-max-w-64">
        <PrincipalInput
          density="compact"
          :label="t('term.principal-id')"
          append-icon="mdi-plus"
          :org-id="orgId"
          @add="addPrincipal"
        />
      </div>
    </VCardTitle>
    <VDataTable
      :headers="headers"
      :items="associations.state.value"
      :loading="associations.isLoading.value"
      item-value="_id"
    >
      <template v-slot:[`item.profile`]="{ item }">
        <PrincipalProfile :principalId="item.principalId" />
      </template>
      <template v-slot:[`item._cap`]="{ item }">
        <CapabilityChips :capability="item.capability" :bits="bits" />
      </template>
      <template v-slot:[`item._actions`]="{ item }">
        <VBtn icon="mdi-delete" variant="text" @click="deletePrincipal(item.principalId)" />
        <VBtn
          icon="mdi-pencil"
          variant="text"
          @click="openDialog(item.principalId, item.capability)"
        />
      </template>
    </VDataTable>
    <VDialog v-model="dialog" width="auto">
      <VCard>
        <VCardText>
          <CapabilityInput v-model="dialogCapability" :bits="bits" />
        </VCardText>
        <VCardActions>
          <VBtn color="primary" @click="updatePrincipal">{{ t('action.update') }}</VBtn>
          <VBtn color="error" @click="dialog = false">{{ t('action.cancel') }}</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CapabilityChips from './CapabilityChips.vue'
import CapabilityInput from './CapabilityInput.vue'
import PrincipalInput from './PrincipalInput.vue'
import PrincipalProfile from './PrincipalProfile.vue'

import type { IAssociation } from '@/types'
import { http } from '@/utils/http'

const props = defineProps<{
  prefix: string
  bits: Record<string, number>
  orgId: string
}>()

const { t } = useI18n()

const headers = [
  { title: t('term.profile'), key: 'profile', align: 'start', sortable: false },
  { title: t('term.capability'), key: '_cap' },
  { title: t('term.actions'), key: '_actions' }
] as const

const associations = useAsyncState(async () => {
  const resp = await http.get(`${props.prefix}`)
  return resp.json<IAssociation[]>()
}, [])

async function addPrincipal(newPrincipalId: string) {
  await http.post(`${props.prefix}`, {
    json: { principalId: newPrincipalId }
  })
  associations.execute()
}

async function deletePrincipal(principalId: string) {
  await http.delete(`${props.prefix}/${principalId}`)
  associations.execute()
}

const dialog = ref(false)
const dialogPrincipalId = ref('')
const dialogCapability = ref('')

function openDialog(principalId: string, capability: string) {
  dialogPrincipalId.value = principalId
  dialogCapability.value = capability
  dialog.value = true
}

async function updatePrincipal() {
  dialog.value = false
  await http.patch(`${props.prefix}/${dialogPrincipalId.value}`, {
    json: { capability: dialogCapability.value }
  })
  associations.execute()
}
</script>
