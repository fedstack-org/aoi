import { useAsyncState, useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'

import type { ISolutionDTO } from './types'

import { useAppState } from '@/stores/app'
import { useAsyncTask } from '@/utils/async'
import { useContestSettings, useContestCapability } from '@/utils/contest/inject'
import { http } from '@/utils/http'
import { useProblemSettings } from '@/utils/problem/inject'

export interface ISolutionViewProps {
  orgId: string
  problemId?: string
  contestId?: string
  solutionId: string
  admin?: boolean
}

export function useSolutionView(props: ISolutionViewProps) {
  const app = useAppState()
  const settings = props.contestId ? useContestSettings() : useProblemSettings()
  const pull = ref(true)
  const showDetails = computed(() => {
    if (props.admin) return true
    if (solution.state.value?.userId === app.userId) {
      return !!settings.value.solutionShowDetails
    }
    return !!settings.value.solutionShowOtherDetails
  })
  const showData = computed(() => {
    if (props.admin) return true
    if (solution.state.value?.userId === app.userId) {
      return true
    }
    return !!settings.value.solutionShowOtherData
  })

  const downloadEndpoint = computed(() =>
    props.contestId
      ? `contest/${props.contestId}/solution/${props.solutionId}/data`
      : `problem/${props.problemId}/solution/${props.solutionId}/data`
  )

  const viewFile = ref(true)

  const solution = useAsyncState(
    async () => {
      const url = props.contestId
        ? `contest/${props.contestId}/solution/${props.solutionId}`
        : `problem/${props.problemId}/solution/${props.solutionId}`
      return await http.get(url).json<ISolutionDTO>()
    },
    null,
    { resetOnExecute: false }
  )

  const submit = useAsyncTask(async () => {
    const url = props.contestId
      ? `contest/${props.contestId}/solution/${props.solutionId}/submit`
      : `problem/${props.problemId}/solution/${props.solutionId}/submit`
    await http.post(url, { json: {} })
    solution.execute()
    autoRefresh.resume()
  })

  const rejudge = useAsyncTask(async () => {
    const url = props.contestId
      ? `contest/${props.contestId}/solution/${props.solutionId}/rejudge`
      : `problem/${props.problemId}/solution/${props.solutionId}/rejudge`
    await http.post(url, { json: { pull: pull.value } })
    solution.execute()
    autoRefresh.resume()
  })

  const autoRefresh = useIntervalFn(
    () => {
      if (solution.state.value?.state !== 4 && solution.state.value?.state !== 0) {
        solution.isLoading.value || solution.execute()
      } else {
        autoRefresh.pause()
      }
    },
    1500,
    { immediate: true }
  )

  return {
    solution,
    showDetails,
    showData,
    pull,
    viewFile,
    downloadEndpoint,
    submit,
    rejudge,
    autoRefreshRunning: computed(() => autoRefresh.isActive.value)
  }
}
