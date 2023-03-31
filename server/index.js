const fs = require('fs-extra')
const path = require('node:path')
const kolorist = require('kolorist')
const express = require('express')
const bodyParser = require('body-parser')
const multiparty = require('multiparty')
const SparkMD5 = require('spark-md5')

const HOST = 'http://127.0.0.1'
const PORT = 8088
const HOSTNAME = `${HOST}:${PORT}`
const uploadDir = `${__dirname}/uploads`

const app = express()
app.listen(PORT, () => {
  console.log(`服务创建成功：${kolorist.blue(HOSTNAME)}`)
})
// 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  req.method === 'OPTIONS' ? res.send('CURRENT SERVICES SUPPORT CROSS DOMAIN REQUESTS!') : next()
})

app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: '1024mb'
  })
)

// 基于multiparty插件实现文件上传处理
const multiparty_upload = req => {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({
      uploadDir, // 指定文件存储目录
      maxFieldsSize: 200 * 1024 * 1024
    })
    // 将请求参数传入，multiparty会进行相应处理
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err)
        return
      }
      resolve({
        fields,
        files
      })
    })
  })
}

const writeChunkFile = (path, file) => {
  return new Promise((resolve, reject) => {
    try {
      const readStream = fs.createReadStream(file.path)
      const writeStream = fs.createWriteStream(path)
      readStream.pipe(writeStream)
      readStream.on('end', () => {
        resolve()
        fs.unlinkSync(file.path)
      })
    } catch (e) {
      reject(e)
    }
  })
}

// 上传文件
app.post('/upload', async (req, res) => {
  try {
    let { files } = await multiparty_upload(req)
    let file = (files.file && files.file[0]) || {}

    res.send(
      createSucess(
        {
          originalFilename: file.originalFilename,
          servicePath: file.path.replace(__dirname, HOSTNAME).replace(/\\/g, '/')
        },
        '上传成功'
      )
    )
  } catch (err) {
    res.send(createFailure(err))
  }
})

// 上传文件的base64
app.post('/upload_base64', async (req, res) => {
  try {
    let buffer = getBufferByBase64(req.body.file)

    const filename = req.body.filename
    // 把文件转md5
    const spark = new SparkMD5.ArrayBuffer()
    spark.append(buffer)
    const extName = getExtByFileName(filename)
    const path = `${uploadDir}/${spark.end()}.${extName}`
    // 写入文件
    await fs.writeFile(path, buffer)
    res.send(
      createSucess({
        originalFilename: filename,
        servicePath: path.replace(__dirname, HOSTNAME)
      })
    )
  } catch (err) {
    console.log('err', err)
    res.send(createFailure(err))
  }
})

// 根据文件hash获取是否有已上传的部分文件列表
app.get('/upload_already', async (req, res) => {
  const { HASH } = req.query
  const path = `${uploadDir}/${HASH}`
  let fileList = []
  try {
    fileList = await fs.readdir(path)
    fileList = fileList.sort((a, b) => {
      let reg = /_(\d+)/
      return reg.exec(a)[1] - reg.exec(b)[1]
    })
    res.send(createSucess({ fileList }))
  } catch (err) {
    res.send(createSucess({ fileList }))
  }
})
// 分片上传
app.post('/upload_chunk', async (req, res) => {
  try {
    let { files, fields } = await multiparty_upload(req)
    let file = (files.file && files.file[0]) || {}
    const filename = (fields.filename && fields.filename[0]) || ''
    if (!filename) {
      res.send(createFailure('文件名为空'))
      return
    }
    let [, hash] = /^([^_]+)_(\d+)/.exec(filename)
    let path = `${uploadDir}/${hash}`
    if (!fs.existsSync(path)) {
      fs.mkdir(path)
    }
    // 切片路径
    path = `${uploadDir}/${hash}/${filename}`
    const isExists = await fs.exists(path)
    if (isExists) {
      res.send(createFailure('切片文件已存在'))
      return
    }
    // 把切片存储到临时目录中
    await writeChunkFile(path, file)
    res.send(
      createSucess({
        originalFilename: filename,
        servicePath: path.replace(__dirname, HOSTNAME)
      })
    )
  } catch (err) {
    res.send(createFailure(err))
  }
})

// 把切片合并
const merge = async (hash, count) => {
  let path = `${uploadDir}/${hash}`
  let pathExists = await fs.exists(path)
  if (!pathExists) {
    throw 'hash对应的文件路径不存在'
  }
  let fileList = await fs.readdir(path)
  if (fileList.length < count) {
    throw '切片未上传完成'
  }
  fileList.sort((a, b) => {
    let reg = /_(\d+)/
    return reg.exec(a)[1] - reg.exec(b)[1]
  })
  // 文件后缀名
  let ext = ''
  for (let i = 0; i < fileList.length; i++) {
    const item = fileList[i]
    const itemPath = `${path}/${item}`
    ext = getExtByFileName(item)
    const buffer = await fs.readFile(itemPath)
    await fs.appendFile(`${uploadDir}/${hash}.${ext}`, buffer)
    await fs.unlink(itemPath)
  }
  await fs.rmdir(path)
  return {
    path: `${uploadDir}/${hash}.${ext}`,
    filename: `${hash}.${ext}`
  }
}

// api: 合并切片
app.post('/upload_merge', async (req, res) => {
  let { HASH, count } = req.body
  try {
    let { filename, path } = await merge(HASH, count)
    res.send(
      createSucess(
        {
          codeText: 'merge success',
          originalFilename: filename,
          servicePath: path.replace(__dirname, HOSTNAME)
        },
        '合并成功'
      )
    )
  } catch (err) {
    res.send(createFailure(err))
  }
})
// 静态文件夹
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use((req, res) => {
  res.status(404)
  res.send('NOT FOUND!')
})

// 一些工具函数
// 定义接口成功时返回的数据结构
function createSucess(data, message = '成功') {
  return {
    code: 0,
    message,
    success: true,
    data
  }
}
// 定义接口失败时返回的数据结构
function createFailure(message, code = 1) {
  return {
    code,
    message,
    success: false
  }
}
// 获取后缀名
function getExtByFileName(fileName) {
  return /\.(\w+)$/.exec(fileName)[1]
}
// 把base64数据转为buffer
function getBufferByBase64(base64) {
  base64 = decodeURIComponent(base64)
  base64 = base64.replace(/^data:image\/\w+;base64,/, '')
  base64 = Buffer.from(base64, 'base64')
  return base64
}
