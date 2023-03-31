import { AxiosProgressEvent } from 'axios'
import defHttp from '@/api/defHttp'

export default {
  // 上传单文件
  async upload(file: File, onUploadProgress?: (progressEvent: AxiosProgressEvent) => void) {
    let formData = new FormData()
    formData.append('file', file)
    formData.append('filename', file.name)
    const res = await defHttp.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress
    })
    return res.data
  },
  /**
   *根据hash获取已上传的切片列表
   */
  async uploadAlready(HASH: string) {
    const res = await defHttp.get('/upload_already', {
      params: {
        HASH
      }
    })
    return res.data
  },
  /**
   * 上传切片
   */
  async uploadChunk(file: Blob, filename: string) {
    let formData = new FormData()
    formData.append('file', file)
    formData.append('filename', filename)
    const res = await defHttp.post('/upload_chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return res.data
  },
  /**
   * 合并切片
   */
  async uploadMerge(HASH: string, count: number) {
    const res = await defHttp.post(
      '/upload_merge',
      { HASH, count },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )
    return res.data
  }
}
