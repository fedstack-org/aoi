import type { ProblemConfig } from '@aoi-js/common'
import zip from 'jszip'
import { reactive, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'

import { useAsyncTask } from '../async'
import { computeSHA256Progress } from '../files'
import { http } from '../http'

async function loadConfig(zip: zip) {
  let content = await zip.file('problem.json')?.async('string')
  if (content) return content
  content = await zip.file('problem.yaml')?.async('string')
  content ||= await zip.file('problem.yml')?.async('string')
  if (content) {
    try {
      const { parse } = await import('yaml')
      content = JSON.stringify(parse(content), null, 2)
      return content
    } catch (err) {
      console.warn(err)
    }
  }
  return ''
}

export function useDataUpload(problemId: string, updated: () => void) {
  const toast = useToast()
  const advanced = ref(false)

  const uploadInfo = reactive({
    file: null as File | null,
    hash: '',
    description: '',
    configJson: JSON.stringify(
      {
        label: 'label',
        judge: {
          adapter: 'adapter',
          config: {}
        },
        submit: {}
      } satisfies ProblemConfig,
      null,
      2
    )
  })

  watch(
    () => uploadInfo.file,
    () => {
      if (uploadInfo.file) {
        handleFile(uploadInfo.file)
      }
    }
  )

  async function handleFile(file: File) {
    try {
      if (advanced.value) {
        toast.warning('Advanced mode is on, you need to manually fill in the hash and config')
      } else {
        uploadInfo.hash = await computeSHA256Progress(file)
        const result = await zip.loadAsync(file)
        const content = await loadConfig(result)
        if (content) {
          uploadInfo.configJson = content
        } else {
          toast.warning('No valid problem config found in zip file')
        }
      }
    } catch (err) {
      toast.error('Failed to parse problem data, is it a zip file?')
    }
  }

  const uploadFileTask = useAsyncTask(async () => {
    const resp = await http.get(`problem/${problemId}/data/${uploadInfo.hash}/url/upload`)
    const { url } = await resp.json<{ url: string }>()
    await fetch(url, {
      method: 'PUT',
      body: uploadInfo.file
    })
    await http.post(`problem/${problemId}/data`, {
      json: {
        hash: uploadInfo.hash,
        description: uploadInfo.description,
        config: JSON.parse(uploadInfo.configJson)
      }
    })
    updated()
  })

  return { uploadInfo, uploadFileTask, advanced }
}
