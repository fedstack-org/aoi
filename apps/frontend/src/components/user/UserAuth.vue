<template>
  <VCardTitle>
    {{ t('user-auth') }}
  </VCardTitle>
  <VSkeletonLoader type="image" v-if="login.isLoading.value || userInfo.isLoading.value" />
  <VCardText v-else>
    <VAlert
      v-if="userInfo.state.value?.authLocked"
      type="warning"
      :title="t('auth-locked')"
      class="mb-4"
    >
      {{ t('auth-locked-desc') }}
    </VAlert>
    <VAlert v-else-if="enableMfa && !hasMfaToken" type="info" color="" :title="t('mfa-required')">
      <VBtn variant="outlined" @click="doVerify" :text="t('do-verify')" />
    </VAlert>
    <VRow v-else>
      <VCol v-for="method of login.state.value.providers" :key="method" cols="6">
        <VCard variant="outlined" :title="t(`provider-${method}`)">
          <component :is="components[method]" :userId="userId" />
        </VCard>
      </VCol>
    </VRow>
  </VCardText>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import UserAuthIaaa from './UserAuthIaaa.vue'
import UserAuthMail from './UserAuthMail.vue'
import UserAuthPassword from './UserAuthPassword.vue'
import UserAuthSms from './UserAuthSms.vue'
import UserAuthUaaa from './UserAuthUaaa.vue'

import { useMfa } from '@/stores/app'
import { enableMfa } from '@/utils/flags'
import { http } from '@/utils/http'

const props = defineProps<{
  userId: string
}>()

const { t } = useI18n()
const { hasMfaToken, doVerify } = useMfa()

const components: Record<string, Component> = {
  password: UserAuthPassword,
  mail: UserAuthMail,
  iaaa: UserAuthIaaa,
  uaaa: UserAuthUaaa,
  sms: UserAuthSms
}

const login = useAsyncState(() => http.get('auth/verify').json<{ providers: string[] }>(), {
  providers: []
})

const userInfo = useAsyncState(
  () => http.get(`user/${props.userId}`).json<{ authLocked?: boolean }>(),
  {}
)
</script>

<i18n>
en:
  user-auth: User Authentication
  provider-password: Password Login
  provider-mail: Bind Email
  provider-iaaa: Bind IAAA
  provider-sms: Bind SMS
  provider-uaaa: UAAA Link
  mfa-required: MFA Required
  do-verify: Verify
  auth-locked: Auth Locked
  auth-locked-desc: Authentication modification is disabled for this account.
zh-Hans:
  user-auth: 用户认证
  provider-password: 密码登录
  provider-mail: 绑定邮箱
  provider-iaaa: 北京大学统一身份认证
  provider-sms: 绑定短信
  provider-uaaa: 绑定统合身份认证
  mfa-required: 需要多因子身份认证
  do-verify: 开始认证
  auth-locked: 认证已锁定
  auth-locked-desc: 此账户的认证修改功能已被禁用。
</i18n>
