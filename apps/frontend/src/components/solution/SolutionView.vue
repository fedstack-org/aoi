<template>
  <AsyncState :state="solution" :force-loading="autoRefreshRunning">
    <template v-slot="{ value }">
      <VCardText>
        <VTable>
          <thead>
            <!-- <th class="text-left">{{ t('term.id') }}</th> -->
            <th class="text-center">{{ t('term.state') }}</th>
            <!-- <th class="text-center">{{ t('term.hash') }}</th>
            <th class="text-center">{{ t('term.runner-label') }}</th> -->
            <th class="text-center">{{ t('term.user') }}</th>
            <th class="text-center" v-if="contestId">{{ t('term.title') }}</th>
            <th class="text-center" v-text="t('common.created-at')" />
            <th class="text-center" v-if="value.submittedAt" v-text="t('common.submitted-at')" />
          </thead>
          <tbody>
            <tr>
              <!-- <td>
                <code>{{ value._id }}</code>
              </td> -->
              <td class="text-center">
                <SolutionStateChip :state="value.state" />
              </td>
              <!-- <td class="text-center">
                <VChip color="blue" variant="outlined">
                  <code>{{ value.problemDataHash.substring(0, 7) }}</code>
                </VChip>
              </td>
              <td class="text-center">
                <VChip color="success" variant="outlined">
                  <code>{{ value.label }}</code>
                </VChip>
              </td> -->
              <td class="text-center">
                <PrincipalProfile :principal-id="value.userId" />
              </td>
              <td class="text-center" v-if="contestId">
                <code>{{ useContestProblemTitle(value.problemId ?? '')?.value }}</code>
              </td>
              <td class="text-center" v-text="new Date(value.createdAt).toLocaleString()" />
              <td
                class="text-center"
                v-if="value.submittedAt"
                v-text="new Date(value.submittedAt).toLocaleString()"
              />
            </tr>
          </tbody>
        </VTable>
        <VTable v-if="value.state > 2">
          <thead>
            <th class="text-left">{{ t('term.status') }}</th>
            <th class="text-center">{{ t('term.score') }}</th>
            <th class="text-center" v-for="(_, mkey) in value.metrics" :key="mkey">
              {{ t('metrics.' + mkey) }}
            </th>
            <th class="text-center" v-if="value.completedAt" v-text="t('common.completed-at')" />
            <th class="text-right">{{ t('term.message') }}</th>
          </thead>
          <tbody>
            <tr>
              <td class="text-left">
                <SolutionStatusChip :status="value.status" />
              </td>
              <td class="text-center">
                <SolutionScoreDisplay :score="value.score" />
              </td>
              <td v-for="(mval, mkey) in value.metrics" :key="mkey" class="text-center">
                {{ mval }}
              </td>
              <td
                class="text-center"
                v-if="value.completedAt"
                v-text="new Date(value.completedAt).toLocaleString()"
              />
              <td class="text-right">{{ value.message }}</td>
            </tr>
          </tbody>
        </VTable>
      </VCardText>
    </template>
  </AsyncState>
  <VDivider />
  <VCardSubtitle>{{ t('term.actions') }}</VCardSubtitle>
  <VCardActions>
    <DownloadBtn v-if="showData" :endpoint="downloadEndpoint" />
    <VBtn
      v-if="admin || solution.state.value?.state === 0"
      :text="t('action.submit')"
      @click="submit.execute()"
      :loading="submit.isLoading.value"
    />
    <VBtn
      v-if="admin"
      variant="outlined"
      :prepend-icon="pull ? 'mdi-source-pull' : 'mdi-pin'"
      :text="pull ? t('solution.rejudge-mode-pull') : t('solution.rejudge-mode-pin')"
      @click="pull = !pull"
    />
    <VBtn
      v-if="admin"
      :text="t('action.rejudge')"
      :append-icon="pull ? 'mdi-source-pull' : 'mdi-pin'"
      @click="rejudge.execute()"
      :loading="rejudge.isLoading.value"
    />
    <VBtn
      :text="t('action.refresh')"
      @click="solution.execute()"
      :loading="solution.isLoading.value || autoRefreshRunning"
    />
    <VBtn v-if="showData && !viewFile" :text="t('action.view')" @click="viewFile = true" />
    <VSpacer />
    <VCheckbox
      hide-details
      readonly
      :model-value="solution.state.value?.preferPrivate"
      :label="t('solution.prefer-private')"
    />
  </VCardActions>
  <VCardText v-if="showData && viewFile">
    <ZipAutoViewer :endpoint="downloadEndpoint" default-file="answer.code" show-metadata />
  </VCardText>
  <template v-if="showDetails && solution.state.value?.state === 4">
    <VDivider />
    <VCardSubtitle>{{ t('solution.details') }}</VCardSubtitle>
    <SolutionDetails :problem-id="problemId" :contest-id="contestId" :solution-id="solutionId" />
  </template>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PrincipalProfile from '../utils/PrincipalProfile.vue'
import ZipAutoViewer from '../utils/zip/ZipAutoViewer.vue'

import SolutionScoreDisplay from './SolutionScoreDisplay.vue'
import SolutionStatusChip from './SolutionStatusChip.vue'
import { useSolutionView, type ISolutionViewProps } from './SolutionView'

import SolutionDetails from '@/components/solution/SolutionDetails.vue'
import SolutionStateChip from '@/components/solution/SolutionStateChip.vue'
import AsyncState from '@/components/utils/AsyncState.vue'
import DownloadBtn from '@/components/utils/DownloadBtn.vue'
import { useContestProblemTitle } from '@/utils/contest/problem/inject'

const props = defineProps<ISolutionViewProps>()

const { t } = useI18n()

const {
  solution,
  showDetails,
  showData,
  pull,
  viewFile,
  downloadEndpoint,
  submit,
  rejudge,
  autoRefreshRunning
} = useSolutionView(props)
</script>

<i18n>
en:
  solution:
    info: Info
    details: Details
    data: Data
    rejudge-mode-pin: Fixed rejudge
    rejudge-mode-pull: Pull rejudge
zh-Hans:
  solution:
    info: 信息
    details: 细节
    data: 数据
    rejudge-mode-pin: 固定重测
    rejudge-mode-pull: 拉取重测
</i18n>
