import * as axios from 'axios'

const baseURL = 'http://127.0.0.1:8088'
// 创建axios实例
const service = axios.default.create({
  baseURL
})

export default service
