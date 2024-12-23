import { createRouter, createWebHistory } from 'vue-router'

import { useAppState } from '@/stores/app'
import routes from '~pages'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...routes,
    {
      path: '/:pathMatch(.*)*',
      component: () => import('@/components/utils/NotFound.vue')
    }
  ]
})

router.beforeEach((to, from, next) => {
  const appState = useAppState()
  if (to.path.startsWith('/org') && !appState.loggedIn)
    return next({ path: '/auth/login', query: { redirect: to.fullPath } })
  if (to.path.includes(':self') && !appState.loggedIn)
    return next({ path: '/auth/login', query: { redirect: to.fullPath } })
  if (to.path.includes(':self'))
    return next({ path: to.path.replace(':self', appState.userId), query: to.query, hash: to.hash })
  return next()
})

export default router
