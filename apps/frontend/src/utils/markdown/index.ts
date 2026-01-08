import { common, createStarryNight } from '@wooorm/starry-night'
import dompurify from 'dompurify'
import { toHtml } from 'hast-util-to-html'
import markdownIt from 'markdown-it'
import onigurumaUrl from 'vscode-oniguruma/release/onig.wasm?url'

import markdownAlerts from './alerts'
import markdownItKatex from './katex'

const starryNight = await createStarryNight(common, {
  getOnigurumaUrlFetch() {
    return new URL(onigurumaUrl, import.meta.url)
  }
})

const md = markdownIt({
  html: true,
  highlight(value, lang) {
    const scope = starryNight.flagToScope(lang)

    return toHtml({
      type: 'element',
      tagName: 'pre',
      properties: {
        className: scope
          ? ['highlight', 'highlight-' + scope.replace(/^source\./, '').replace(/\./g, '-')]
          : undefined
      },
      children: scope
        ? (starryNight.highlight(value, scope).children as never)
        : [{ type: 'text', value }]
    })
  }
})
md.use(markdownAlerts)
md.use(markdownItKatex)

export function renderMarkdown(source: string) {
  return dompurify.sanitize(md.render(source))
}
