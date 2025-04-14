<template>
  <VContainer>
    <VRow>
      <VCol>
        <VCard :title="t('pages.groups')">
          <VDataTableServer
            :headers="headers"
            :items-length="groups.state.value.total"
            :items="groups.state.value.items"
            v-model:page="page"
            v-model:items-per-page="itemsPerPage"
            :items-per-page-options="[15, 30, 50, 100]"
            :loading="groups.isLoading.value"
            item-value="name"
            @update:options="({ page, itemsPerPage }) => groups.execute(0, page, itemsPerPage)"
          >
            <template v-slot:[`item._id`]="{ item }">
              <code>{{ item._id }}</code>
            </template>
            <template v-slot:[`item.name`]="{ item }">
              <RouterLink :to="`/org/${orgId}/group/${item._id}`">
                <VAvatar>
                  <AoiGravatar :email="item.profile.email" />
                </VAvatar>
                <code class="u-pl-2">{{ item.profile.name }}</code>
              </RouterLink>
            </template>
          </VDataTableServer>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AoiGravatar from '@/components/aoi/AoiGravatar.vue'
import { usePagination } from '@/utils/pagination'
import { withTitle } from '@/utils/title'

const props = defineProps<{
  orgId: string
}>()

const { t } = useI18n()

withTitle(computed(() => t('pages.groups')))

const headers = [
  { title: t('term.name'), key: 'name', align: 'start', sortable: false },
  { title: 'ID', key: '_id' }
] as const

const {
  page,
  itemsPerPage,
  result: groups
} = usePagination<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _id: string
  profile: {
    name: string
    email: string
  }
}>(
  `group`,
  computed(() => ({
    orgId: props.orgId
  }))
)
</script>
