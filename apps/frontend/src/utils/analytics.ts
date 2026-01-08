import { init, track } from '@plausible-analytics/tracker'

import { plausibleDomain, plausibleEndpoint } from './flags'

export const isAnalyticsEnabled = !!plausibleEndpoint && !!plausibleDomain

export function initAnalytics() {
  if (!isAnalyticsEnabled) return

  const domain = plausibleDomain || window.location.hostname

  init({
    domain,
    endpoint: plausibleEndpoint,
    autoCapturePageviews: false,
    logging: import.meta.env.DEV
  })
}

export function trackPageView(path?: string) {
  if (!isAnalyticsEnabled) return

  track('pageview', {
    props: {
      path: path || window.location.pathname
    }
  })
}

export function trackEvent(eventName: string, props?: Record<string, string>) {
  if (!isAnalyticsEnabled) return

  track(eventName, {
    props
  })
}

export function trackLogin(provider: string, success: string) {
  trackEvent('Login', { provider, success })
}
