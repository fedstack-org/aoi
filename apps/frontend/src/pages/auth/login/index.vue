<template>
  <VCardText v-if="login.isLoading.value">
    <VSkeletonLoader type="image" />
  </VCardText>
  <VCardText v-else>
    <VRow dense>
      <VCol v-for="method of login.state.value.providers" :key="method" cols="12">
        <VBtn
          :to="{ path: `/auth/login/${method}`, query: route.query }"
          block
          variant="flat"
          :prepend-icon="icons[method] ?? 'mdi-fingerprint'"
          :color="colors[method]"
        >
          {{ t('provider-' + method) }}
        </VBtn>
      </VCol>
    </VRow>
  </VCardText>
  <VCardText v-if="login.state.value.signup" class="text-center">
    <VBtn variant="tonal" to="/signup"> {{ t('pages.signup') }} </VBtn>
  </VCardText>
</template>

<script setup lang="ts">
import { useAsyncState } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { http } from '@/utils/http'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()

const icons: Record<string, string> = {
  password: 'mdi-lock',
  mail: 'mdi-email',
  iaaa: 'svg:M4.67,5.18l1.83-.23v4.13c0,.29,.02,.5,.06,.63s.1,.24,.2,.33c.12,.11,.34,.2,.65,.26v.13h-2.8v-.13c.25-.03,.44-.08,.55-.14,.11-.06,.2-.17,.27-.31,.05-.1,.08-.24,.1-.44,.02-.2,.03-.48,.03-.85v-1.56c0-.43-.01-.74-.03-.91-.02-.17-.07-.32-.14-.43-.07-.12-.16-.2-.26-.26-.1-.05-.25-.09-.44-.1v-.13Zm1.32-2.5c-.17,0-.3-.05-.41-.16s-.16-.24-.16-.4,.05-.29,.17-.4c.11-.11,.25-.16,.41-.16s.3,.05,.41,.16,.17,.24,.17,.4-.05,.29-.16,.4-.25,.16-.41,.16ZM22.75,22.44h-4.27v-.15c.39-.03,.65-.1,.81-.2,.27-.17,.4-.4,.4-.7,0-.18-.06-.42-.18-.72l-.11-.27-.62-1.53h-2.86l-.34,.9-.16,.4c-.2,.48-.29,.85-.29,1.13,0,.16,.04,.31,.11,.45s.17,.25,.29,.34c.17,.12,.39,.19,.65,.21v.15h-2.91v-.15c.23-.01,.43-.07,.6-.17s.34-.26,.51-.48c.14-.18,.27-.41,.41-.69s.31-.7,.52-1.26l2.38-6.13h.37l2.83,6.84c.21,.52,.38,.88,.51,1.11s.26,.39,.41,.5c.1,.08,.22,.14,.36,.18s.34,.08,.6,.11v.15Zm-4.08-3.84l-1.37-3.37-1.29,3.37h2.65ZM0,12v12H12V12H0Zm10.75,10.44H6.48v-.15c.39-.03,.65-.1,.81-.2,.27-.17,.4-.4,.4-.7,0-.18-.06-.42-.18-.72l-.11-.27-.62-1.53H3.91l-.34,.9-.16,.4c-.2,.48-.29,.85-.29,1.13,0,.16,.04,.31,.11,.45,.07,.14,.17,.25,.29,.34,.17,.12,.39,.19,.65,.21v.15H1.25v-.15c.23-.01,.43-.07,.6-.17,.17-.1,.34-.26,.51-.48,.14-.18,.27-.41,.41-.69s.31-.7,.52-1.26l2.38-6.13h.37l2.83,6.84c.21,.52,.38,.88,.51,1.11,.13,.22,.26,.39,.41,.5,.1,.08,.22,.14,.36,.18,.13,.04,.34,.08,.6,.11v.15Zm-6.74-3.84h2.65l-1.37-3.37-1.29,3.37ZM12,0V12h12V0H12Zm10.75,10.44h-4.27v-.15c.39-.03,.65-.1,.81-.2,.27-.17,.4-.4,.4-.7,0-.18-.06-.42-.18-.72l-.11-.27-.62-1.53h-2.86l-.34,.9-.16,.4c-.2,.48-.29,.85-.29,1.13,0,.16,.04,.31,.11,.45,.07,.14,.17,.25,.29,.34,.17,.12,.39,.19,.65,.21v.15h-2.91v-.15c.23-.01,.43-.07,.6-.17,.17-.1,.34-.26,.51-.48,.14-.18,.27-.41,.41-.69s.31-.7,.52-1.26l2.38-6.13h.37l2.83,6.84c.21,.52,.38,.88,.51,1.11,.13,.22,.26,.39,.41,.5,.1,.08,.22,.14,.36,.18,.13,.04,.34,.08,.6,.11v.15Zm-6.74-3.84h2.65l-1.37-3.37-1.29,3.37Z',
  uaaa: 'mdi-delta'
}

const colors: Record<string, string> = {
  password: 'primary',
  mail: 'blue',
  iaaa: '#9b0000',
  uaaa: '#1f88ff'
}

const login = useAsyncState(
  async () => {
    const data = await http.get('auth/login').json<{ providers: string[]; signup: boolean }>()
    return data
  },
  {
    providers: [],
    signup: false
  }
)
</script>

<i18n>
en:
  provider-password: Password Login
  provider-mail: Email Login
  provider-iaaa: IAAA Login
  provider-uaaa: Unified Auth
zh-Hans:
  provider-password: 密码登录
  provider-mail: 邮箱登录
  provider-iaaa: 北京大学统一身份认证登录
  provider-uaaa: 统合身份登录
</i18n>
