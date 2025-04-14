<template>
  <VCard>
    <RanklistViewer :endpoint="`rk/${ranklistId}`" :password />
  </VCard>
</template>

<script setup lang="ts">
import { useRouteQuery } from '@vueuse/router'

import RanklistViewer from '@/components/contest/RanklistViewer.vue'

const ranklistId = useRouteQuery('ranklistId', '', { transform: String })
const password = useRouteQuery('password', '', { transform: String })
</script>
