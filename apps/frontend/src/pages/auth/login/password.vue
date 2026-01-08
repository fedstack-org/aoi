<template>
  <VForm fast-fail validate-on="submit lazy" @submit.prevent="signin">
    <VCardText>
      <VTextField
        v-model="username"
        prepend-inner-icon="mdi-account-outline"
        :label="t('term.username')"
        :rules="usernameRules"
      >
      </VTextField>

      <VTextField
        v-model="password"
        :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
        :type="showPassword ? 'text' : 'password'"
        prepend-inner-icon="mdi-lock-outline"
        @click:append-inner="showPassword = !showPassword"
        :label="t('term.password')"
        :rules="passwordRules"
      >
      </VTextField>
    </VCardText>

    <VCardActions>
      <VBtn :loading="isLoading" type="submit" color="primary" block size="large" variant="flat">
        {{ t('pages.signin') }}
      </VBtn>
    </VCardActions>
  </VForm>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import type { SubmitEventPromise } from 'vuetify'

import { useLogin } from '@/stores/app'
import { trackLogin } from '@/utils/analytics'
import { http } from '@/utils/http'

const { t } = useI18n()
const toast = useToast()
const { postLogin } = useLogin()

const username = ref('')
const password = ref('')

const usernameRules = [
  (value: string) => {
    if (value.length > 0) return true
    return t('hint.violate-username-rule')
  }
]

const passwordRules = [
  (value: string) => {
    if (value.length >= 8) return true
    return t('hint.violate-password-rule')
  }
]

const showPassword = ref(false)
const isLoading = ref(false)

async function signin(ev: SubmitEventPromise) {
  isLoading.value = true
  const result = await ev
  if (!result.valid) return

  try {
    const resp = await http.post('auth/login', {
      json: {
        provider: 'password',
        payload: {
          username: username.value,
          password: password.value
        }
      }
    })
    const { token } = await resp.json<{ token: string }>()
    trackLogin('password', 'true')
    toast.success(t('hint.signin-success'))
    postLogin(token)
  } catch (err) {
    trackLogin('password', 'false')
    toast.error(t('hint.signin-wrong-credentials'))
  }
  isLoading.value = false
}
</script>

<i18n>
en:
  hint:
    violate-username-rule: Username must not be empty.
    violate-password-rule: Password must be at least 8 characters.
    signin-wrong-credentials: Wrong username or password.
    signin-success: Sign in successfully.
zh-Hans:
  hint:
    violate-username-rule: 用户名不能为空
    violate-password-rule: 密码至少需要8个字符
    signin-wrong-credentials: 用户名或密码错误
    signin-success: 登录成功
</i18n>
