<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import SparkMD5 from 'spark-md5'
import uploadService from '@/api/services/uploadService'
const props = defineProps({
  // 是否使用分片上传
  useSlice: {
    type: Boolean,
    default: false
  },
  // 默认每个切片大小
  sliceSize: {
    type: Number,
    default: 1024 * 1024 * 1
  },
  // 并发池大小
  maxPoolsSize: {
    type: Number,
    default: 10
  }
})

const inputRef = shallowRef<HTMLInputElement>()
const isProcessing = ref(false)
const uploading = ref(false)
const uploadPencent = ref(0)

const handleClick = (e: MouseEvent) => {
  if (isProcessing.value) {
    alert('正在解析文件，请稍候')
    return
  }
  if (uploading.value) {
    alert('正在上传文件，请稍候')
    return
  }
  inputRef.value!.value = ''
  inputRef.value!.click()
}
const handleChange = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  if (props.useSlice) {
    await sliceUpload(files[0])
    return
  }
  uploadFiles(Array.from(files))
}
const uploadFiles = async (files: File[]) => {
  if (files.length === 0) return
  try {
    uploading.value = true
    const file = files[0]
    // 限制上传文件大小
    // if (file.size > 2 * 1024 * 1024) {
    // }
    const res = await uploadService.upload(file, progress => {
      const { loaded, total } = progress
      uploadPencent.value = Math.round((loaded / total!) * 100)
    })
    console.log('res', res)
  } finally {
    uploading.value = false
  }
}
const onDrop = (e: DragEvent) => {
  e.preventDefault()
  let files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  uploadFiles(Array.from(files))
}
const onDragover = (e: DragEvent) => {
  e.preventDefault()
}

// 分片上传
const sliceUpload = async (file: File) => {
  isProcessing.value = true
  const suffix: any = /\.([\w]+)$/.exec(file.name)![1]
  const fileHash = await getFileHash(file)
  let alreadyList: any[] = []
  const res = await uploadService.uploadAlready(fileHash)
  if (res.success) {
    alreadyList = res.data.fileList
  }
  let max = props.sliceSize // 每个切片的大小
  let count = Math.ceil(file.size / max) // 切片数量

  let chunks: any[] = [] // 所有切片
  let index = 0
  while (index < count) {
    chunks.push({
      file: file.slice(index * max, (index + 1) * max),
      filename: `${fileHash}_${index + 1}.${suffix}`
    })
    index++
  }
  index = 0
  isProcessing.value = false
  uploading.value = true
  let pools: any[] = [] // 并发池
  const maxPoolsSize = props.maxPoolsSize // 并发池最大值
  // 一个切片上传完成后执行的方法
  const chunkUploadComplete = async () => {
    index++
    uploadPencent.value = Math.round((index / count!) * 100)

    if (index < count) return
    // 全部切片上传完成
    uploadPencent.value = 100
    try {
      const res = await uploadService.uploadMerge(fileHash, count)
      if (res.success) {
        reset()
      }
    } catch (e) {}
  }
  let failChunks: any[] = [] // 上传失败的切片列表
  // 上传所有切片
  const uploadChunks = async (chunks: any[]) => {
    for (let idx = 0; idx < chunks.length; idx++) {
      let chunk = chunks[idx]
      // 已经上传过的
      if (alreadyList.length > 0 && alreadyList.includes(chunk.filename)) {
        chunkUploadComplete()
        continue
      }
      if (idx === 20 || idx === 10) {
        failChunks.push(chunk)
        continue
      }
      let task = uploadService.uploadChunk(chunk.file, chunk.filename)
      task
        .then(res => {
          if (res.success) {
            chunkUploadComplete()
          } else {
            failChunks.push(chunk)
          }
          // 执行完成,从池中移除
          const idx = pools.findIndex(x => x === task)
          pools.splice(idx)
        })
        .catch(() => {
          failChunks.push(chunk)
        })
      pools.push(task)
      if (pools.length >= maxPoolsSize) {
        // 等待并发池执行完一个任务后
        await Promise.race(pools)
      }
    }
  }
  await uploadChunks(chunks)

  // 上传失败的的
  if (failChunks.length > 0) {
    uploadChunks(failChunks)
  }
}
// 获取文件hash值
const getFileHash = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    fileReader.readAsArrayBuffer(file)
    fileReader.onload = ev => {
      let buffer = ev.target?.result
      const hash = new SparkMD5.ArrayBuffer().append(buffer! as ArrayBuffer).end()
      resolve(hash)
    }
  })
}
const reset = () => {
  uploading.value = false
}
</script>
<template>
  <section
    class="upload-box"
    @click="handleClick"
    @drop.prevent="onDrop"
    @dragover.prevent="onDragover"
  >
    <input ref="inputRef" type="file" class="hidden" @change="handleChange" @click.stop />
    <i class="icon"></i>
    <span class="text">将文件拖到此处，或<em>点击上传</em></span>
    <!-- 进度条 -->
    <div v-if="uploading" class="progress">
      <div class="progress-value" :style="{ width: `${uploadPencent}%` }">{{ uploadPencent }}%</div>
    </div>
    <div v-if="isProcessing" class="processing">正在解析文件,请稍候...</div>
  </section>
</template>
<style lang="scss" scoped>
.upload-box {
  width: 400px;
  height: 200px;
  border: 1px dashed #ccc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 20px;
  box-sizing: border-box;
  cursor: pointer;
  .icon {
    width: 80px;
    height: 62px;
    background: url('@/assets/images/upload.png') no-repeat;
    background-size: 100% 100%;
    margin-bottom: 16px;
  }
  .text {
    font-size: 14px;
    em {
      color: skyblue;
    }
  }
  .progress {
    width: 100%;
    height: 20px;
    margin-top: 8px;
    box-sizing: border-box;
    background-color: #eee;
    border-radius: 8px;
    &-value {
      background: skyblue;
      height: 20px;
      line-height: 20px;
      text-align: right;
      padding-right: 8px;
      border-radius: 8px;
      font-size: 14px;
      color: #fff;
    }
  }
  .processing {
    width: 100%;
    height: 20px;
    margin-top: 8px;
    text-align: center;
  }
}
.hidden {
  display: none;
}
</style>
