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
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import * as xlsx from 'xlsx'

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

const xlsxFile = ref<File[]>([])
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

// watch if xlsxFile is modified
watch(xlsxFile, (newFile) => {
  // if xlsxFile is empty, set pageState to empty
  if (newFile.length === 0) {
    pageState.value = 'empty'
    userInfo.value = []
    return
  }
  try {
    newFile[0].arrayBuffer().then((buffer) => {
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
      orgGroups: []
    }))
    const res = await http.post(`org/${props.orgId}/admin/member/batch-import`, {
      json: {
        users: usersPayload,
        ignoreDuplicates: settings.value.ignoreDuplicates
      }
    })
    xlsxFile.value = []
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
en:
  upload-userinfo-xlsx: Upload User Info (XLSX)
  error-file: Error in file
  error-net: Network error
  submit-success: Submitted successfully
  set:
    password-reset-due: Reset password
    ignore-duplicates: Ignore duplicates
    org-capability: Organization capability
</i18n>
