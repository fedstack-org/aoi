import { createI18n } from 'vue-i18n'
import messages from '@intlify/unplugin-vue-i18n/messages'

export default createI18n({
  legacy: false,
  locale: 'zh-Hans',
  fallbackLocale: 'en',
  messages
})

export const supportedLocales = [
  ['en', 'English'],
  ['zh-Hans', '简体中文']
] as const
