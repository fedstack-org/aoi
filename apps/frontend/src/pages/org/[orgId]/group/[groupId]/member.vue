<template>
  <VCard variant="flat">
    <VCardTitle class="d-flex justify-space-between align-center">
      <div>{{ t('term.members') }}</div>
      <VBtn
        prepend-icon="mdi-pencil"
        variant="text"
        :text="t('action.batch-update-capability')"
        @click="openDialog"
      />
      <VSpacer />
      <div class="flex-grow-1 u-max-w-64">
        <UserIdInput
          v-model="newMember"
          density="compact"
          :label="t('term.user-id')"
          append-icon="mdi-plus"
          @click:append="addMember"
        />
      </div>
    </VCardTitle>
    <VDataTableServer
      :headers="headers"
      :items-length="groups.state.value.total"
      :items="groups.state.value.items"
      v-model:page="page"
      v-model:items-per-page="itemsPerPage"
      :items-per-page-options="[15, 30, 50, 100]"
      :loading="groups.isLoading.value"
      item-value="_id"
      @update:options="({ page, itemsPerPage }) => groups.execute(0, page, itemsPerPage)"
    >
      <template v-slot:[`item._id`]="{ item }">
        <code>{{ item._id }}</code>
      </template>
      <template v-slot:[`item.profile`]="{ item }">
        <RouterLink :to="`/user/${item.user._id}`">
          <VAvatar>
            <AoiGravatar :email="item.user.profile.email" />
          </VAvatar>
          <code class="u-pl-2">{{ item.user.profile.name }}</code>
        </RouterLink>
      </template>
      <template v-slot:[`item._cap`]="{ item }">
        <CapabilityChips :capability="item.capability" :bits="orgBits" />
      </template>
      <template v-slot:[`item._limit`]="{ item }">
        <CapabilityChips :bits="orgLimits" :capability="item.limit" />
      </template>
      <template v-slot:[`item._actions`]="{ item }">
        <VBtn icon="mdi-delete" variant="text" @click="deleteMember(item.user._id)" />
      </template>
    </VDataTableServer>
    <VDialog v-model="dialog" width="auto">
      <VCard>
        <VCardText>
          <CapabilityInput v-model="dialogCapability" :bits="orgBits" />
          <CapabilityInput v-model="dialogLimit" type="limit" :bits="orgLimits" />
        </VCardText>
        <VCardActions>
          <VBtn color="primary" @click="batchUpdate">{{ t('action.update') }}</VBtn>
          <VBtn color="error" @click="dialog = false">{{ t('action.cancel') }}</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AoiGravatar from '@/components/aoi/AoiGravatar.vue'
import CapabilityChips from '@/components/utils/CapabilityChips.vue'
import CapabilityInput from '@/components/utils/CapabilityInput.vue'
import UserIdInput from '@/components/utils/UserIdInput.vue'
import { orgBits, orgLimits } from '@/utils/capability'
import { http } from '@/utils/http'
import { usePagination } from '@/utils/pagination'
import { withTitle } from '@/utils/title'

const props = defineProps<{
  orgId: string
  groupId: string
}>()

const { t } = useI18n()

withTitle(computed(() => t('term.members')))

const headers = [
  { title: t('term.profile'), key: 'profile', align: 'start', sortable: false },
  { title: t('term.id'), key: '_id' },
  { title: t('term.capability'), key: '_cap' },
  { title: t('term.limit'), key: '_limit' },
  { title: t('term.actions'), key: '_actions' }
] as const

const {
  page,
  itemsPerPage,
  result: groups
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = usePagination<any>(`group/${props.groupId}/member`, {})

async function deleteMember(userId: string) {
  await http.delete(`group/${props.groupId}/member/${userId}`)
  groups.execute(0, page.value, itemsPerPage.value)
}

const newMember = ref('')
async function addMember() {
  try {
    await http.post(`org/${props.orgId}/admin/member`, {
      json: { userId: newMember.value }
    })
  } catch (e) {
    console.warn(e)
  }
  await http.post(`group/${props.groupId}/member`, {
    json: { userId: newMember.value }
  })
  groups.execute(0, page.value, itemsPerPage.value)
  newMember.value = ''
}

const dialog = ref(false)
const dialogCapability = ref('')
const dialogLimit = ref('')

function openDialog() {
  dialogCapability.value = '0'
  dialogLimit.value = '0'
  dialog.value = true
}

async function batchUpdate() {
  dialog.value = false
  await http.patch(`group/${props.groupId}/member/batch-update-capability`, {
    json: { capability: dialogCapability.value, limit: dialogLimit.value }
  })
  groups.execute(0, page.value, itemsPerPage.value)
}
</script>
