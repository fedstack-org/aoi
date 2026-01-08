<template>
  <VCard variant="flat">
    <VCardText>
      <VFileInput
        v-model="xlsxFile"
        :label="t('upload-userinfo-xlsx')"
        accept=".xlsx"
        prepend-icon="mdi-microsoft-excel"
      />
    </VCardText>
    <template v-if="pageState != 'empty'">
      <VDivider />
      <VCardSubtitle>{{ t('term.preview') }}</VCardSubtitle>
      <VCardText>
        <VDataTable
          v-if="pageState === 'loaded'"
          :headers="headers"
          :items="userInfo"
          :items-per-page="15"
          :footer-props="{
            'items-per-page-options': [15, 30, 50]
          }"
        >
          <template v-slot:[`item.name`]="{ item }">
            <code>{{ item.name }}</code>
          </template>
          <template v-slot:[`item.email`]="{ item }">
            <code>{{ item.email }}</code>
          </template>
          <template v-slot:[`item.realname`]="{ item }">
            <code>{{ item.realname }}</code>
          </template>
          <template v-slot:[`item.password`]="{ item }">
            <code>{{ item.password }}</code>
          </template>
          <template v-slot:[`item.actions`]="{ item }">
            <VBtn icon="mdi-delete" variant="text" @click="deleteItem(item.name)" />
          </template>
        </VDataTable>
        <VAlert v-if="pageState === 'ferr'" type="error">{{ t('error-file') }}</VAlert>
        <VAlert v-if="pageState === 'neterr'" type="error">{{ t('error-net') }}</VAlert>
      </VCardText>
      <VDivider />
      <VCardSubtitle>{{ t('term.settings') }}</VCardSubtitle>
      <VCardText>
        <VCheckbox v-model="settings.passwordResetDue" :label="t('set.password-reset-due')" />
        <VCheckbox v-model="settings.ignoreDuplicates" :label="t('set.ignore-duplicates')" />
        <VTextField
          v-model="settings.orgCapability"
          :label="t('set.org-capability')"
          type="number"
        />
        <VAutocomplete
          v-model="selectedGroups"
          :items="groupItems"
          :label="t('set.select-groups')"
          :loading="availableGroups.isLoading.value"
          multiple
          chips
          closable-chips
          item-title="title"
          item-value="value"
          clearable
        />
        <VCheckbox v-model="createNewGroup" :label="t('set.create-new-group')" />
        <template v-if="createNewGroup">
          <VTextField v-model="newGroupProfile.name" :label="t('set.group-name')" />
          <VTextField v-model="newGroupProfile.email" :label="t('set.group-email')" type="email" />
        </template>
      </VCardText>
      <VDivider />
      <VCardSubtitle>{{ t('term.actions') }}</VCardSubtitle>
      <VCardActions>
        <VBtn
          v-if="pageState === 'loaded'"
          @click="upload"
          color="primary"
          variant="elevated"
          class="ma-2"
          >{{ t('action.upload') }}</VBtn
        >
      </VCardActions>
    </template>
  </VCard>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import * as xlsx from 'xlsx'

import type { IGroupDTO } from '@/components/group/types'
import { http } from '@/utils/http'

const props = defineProps<{
  orgId: string
}>()

const { t } = useI18n()
const toast = useToast()

const headers = [
  { title: t('term.name'), key: 'name' },
  { title: t('term.email'), key: 'email' },
  { title: t('term.realname'), key: 'realname' },
  { title: t('term.password'), key: 'password' },
  { title: t('term.telephone'), key: 'telephone' },
  { title: t('term.school'), key: 'school' },
  { title: t('term.student-grade'), key: 'studentGrade' },
  { title: t('term.actions'), key: 'actions' }
] as const

const xlsxFile = ref<File | null>(null)
const pageState = ref<'empty' | 'ferr' | 'loaded' | 'neterr'>('empty')
const userInfo = ref<
  {
    name: string
    email: string
    realname: string
    password: string
    telephone: string
    school: string
    studentGrade: string
  }[]
>([])

const settings = ref({
  orgCapability: 1,
  passwordResetDue: false,
  ignoreDuplicates: false
})

// Group selection state
const selectedGroups = ref<string[]>([])
const createNewGroup = ref(false)
const newGroupProfile = reactive({
  name: '',
  email: ''
})

// Fetch available groups
const availableGroups = useAsyncState(
  async () => {
    const resp = await http.get('group', {
      searchParams: {
        orgId: props.orgId,
        page: 1,
        perPage: 100
      }
    })
    const data = await resp.json<{
      total: number
      items: IGroupDTO[]
    }>()
    return data.items
  },
  [],
  { immediate: true }
)

// Map groups to autocomplete items
const groupItems = computed(() => {
  return availableGroups.state.value.map((group) => ({
    title: group.profile.name,
    value: group._id
  }))
})

// watch if xlsxFile is modified
watch(xlsxFile, (newFile) => {
  // if xlsxFile is empty, set pageState to empty
  if (!newFile) {
    pageState.value = 'empty'
    userInfo.value = []
    return
  }
  try {
    newFile.arrayBuffer().then((buffer) => {
      const workbook = xlsx.read(buffer, { type: 'array' })
      userInfo.value = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
      pageState.value = 'loaded'
    })
  } catch (err) {
    pageState.value = 'ferr'
  }
})

const deleteItem = (name: string) => {
  userInfo.value = userInfo.value.filter((item) => item.name !== name)
}

const upload = async () => {
  try {
    // Handle new group creation if needed
    let newGroupId: string | null = null
    if (createNewGroup.value) {
      const resp = await http.post('group', {
        json: {
          orgId: props.orgId,
          profile: newGroupProfile
        }
      })
      const { groupId } = await resp.json<{ groupId: string }>()
      newGroupId = groupId
    }

    // Combine selected groups with newly created group
    const orgGroups = [...selectedGroups.value]
    if (newGroupId) {
      orgGroups.push(newGroupId)
    }

    // construct the real payload
    const usersPayload = userInfo.value.map((item) => ({
      profile: {
        name: item.name,
        email: item.email,
        realname: item.realname,
        telephone: item.telephone,
        school: item.school,
        studentGrade: item.studentGrade
      },
      password: item.password,
      passwordResetDue: settings.value.passwordResetDue,
      orgCapability: settings.value.orgCapability,
      orgGroups
    }))
    const res = await http.post(`org/${props.orgId}/admin/member/batch-import`, {
      json: {
        users: usersPayload,
        ignoreDuplicates: settings.value.ignoreDuplicates
      }
    })
    xlsxFile.value = null
    const { insertedCount, successCount } = await res.json<{
      insertedCount: number
      successCount: number
    }>()
    toast.success(`${t('submit-success')}, inserted ${insertedCount}, succeeded ${successCount}`)
  } catch (err) {
    pageState.value = 'neterr'
  }
}
</script>

<i18n>
zh-Hans:
  upload-userinfo-xlsx: 上传用户信息 (XLSX)
  error-file: 文件错误
  error-net: 网络错误
  submit-success: 提交成功
  set:
    password-reset-due: 是否重置密码
    ignore-duplicates: 忽略重复
    org-capability: 组织权限
    select-groups: 选择小组
    create-new-group: 创建新小组
    group-name: 小组名称
    group-email: 小组邮箱
en:
  upload-userinfo-xlsx: Upload User Info (XLSX)
  error-file: Error in file
  error-net: Network error
  submit-success: Submitted successfully
  set:
    password-reset-due: Reset password
    ignore-duplicates: Ignore duplicates
    org-capability: Organization capability
    select-groups: Select Groups
    create-new-group: Create New Group
    group-name: Group Name
    group-email: Group Email
</i18n>
