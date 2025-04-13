<template>
  <VContainer>
    <VRow>
      <VCol>
        <AsyncState :state="problem" hide-when-loading>
          <template v-slot="{ value }">
            <VCard>
              <VCardTitle class="d-flex justify-space-between">
                <div>
                  <p class="text-h4">{{ value.title }}</p>
                  <p class="text-h6 ml-2">{{ value.slug }}</p>
                </div>
                <div class="justify-end">
                  <ProblemTagGroup :tags="value.tags" :access-level="value.accessLevel" />
                </div>
              </VCardTitle>
              <VDivider />

              <VTabs>
                <VTab prepend-icon="mdi-book-outline" :to="rel('')">
                  {{ t('tabs.problem-description') }}
                </VTab>
                <VTab prepend-icon="mdi-upload-outline" :to="rel('submit')" v-if="value.config">
                  {{ t('tabs.submit') }}
                </VTab>
                <VTab prepend-icon="mdi-codepen" :to="rel('instance')" v-if="value.config">
                  {{ t('tabs.instances') }}
                </VTab>
                <VTab prepend-icon="mdi-timer-sand" :to="rel('solution')">
                  {{ t('tabs.solutions') }}
                </VTab>
                <VTab prepend-icon="mdi-attachment" :to="rel('attachment')">
                  {{ t('tabs.attachments') }}
                </VTab>
                <VTab prepend-icon="mdi-database-outline" :to="rel('data')" v-if="showDataTab">
                  {{ t('tabs.data') }}
                </VTab>
                <VTab prepend-icon="mdi-cog-outline" :to="rel('admin')" v-if="showAdminTab">
                  {{ t('tabs.management') }}
                </VTab>
                <InstanceCreateBtn
                  v-if="value.config?.instanceLabel"
                  :org-id="orgId"
                  :problem-id="problemId"
                />
              </VTabs>
              <RouterView :problem="value" @updated="problem.execute()" />
            </VCard>
          </template>
        </AsyncState>
      </VCol>
    </VRow>
  </VContainer>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'

import InstanceCreateBtn from '@/components/instance/InstanceCreateBtn.vue'
import ProblemTagGroup from '@/components/problem/ProblemTagGroup.vue'
import AsyncState from '@/components/utils/AsyncState.vue'
import { useProblem } from '@/utils/problem/inject'
import { withTitle } from '@/utils/title'

const props = defineProps<{
  orgId: string
  problemId: string
}>()

const { t } = useI18n()

withTitle(computed(() => t('pages.problems')))

const { problem, showAdminTab, showDataTab } = useProblem(
  toRef(props, 'orgId'),
  toRef(props, 'problemId')
)

const rel = (to: string) => `/org/${props.orgId}/problem/${props.problemId}/${to}`
</script>

<i18n global>
en:
  problem-description: Description
  problem-submit: Submit
  problem-attachments: Attachments
  problem-data: Data
  problem-management: Management
  problem-solutions: solution
  solutions: solutions
  status: Status
zh-Hans:
  problem-description: 题面
  problem-submit: 提交
  problem-attachments: 附件
  problem-data: 数据
  problem-management: 管理
  problem-solutions: 提交记录
  solutions: 提交记录
  status: 状态
</i18n>
