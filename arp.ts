import process = require('child_process')
import iconv = require('iconv-lite')
import os = require('os')

let kIpAddressRegex = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/
let kIpAddressRegexFull = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export type ArpType = 'static' | 'dynamic' | 'unknown'
export type ArpEntry = { ip: string, mac: string, type: ArpType }

function type(typeString: string): ArpType {
  let kStatic = ['static', '靜態']
  let kDynamic = ['dynamic', '動態']
  if (kStatic.includes(typeString)) { return 'static' }
  if (kDynamic.includes(typeString)) { return 'dynamic' }
  return 'unknown'
}

/**
 * @throws 子程序的回傳碼
 * @returns ARP 表格
 *          物件鍵值為主機介面卡 IP，值為物件陣列
 *          每個物件由 ip, mac, type 三個鍵值組成
 */
export async function GetArpTable(encoding: string = 'utf8') {
  // macOS
  if (os.type().toLowerCase() == 'darwin') {
    return new Promise<ArpEntry[]>((resolve, reject) => {
      let stderr = ''
      let stdout = ''

      // 使用 iconv 解碼，所以將 encoding 設為 null
      let proc = process.exec('arp -a', { encoding: null })
      proc.stdin.end()

      // 因為 encoding 被設為 null，所以 data 必為 Buffer
      proc.stdout.on('data', (data: Buffer) => stdout += iconv.decode(data, 'utf8'))
      proc.stderr.on('data', (data: Buffer) => stderr += iconv.decode(data, 'utf8'))

      proc.on('close', exitCode => {
        if (exitCode != 0) {
          reject(new Error(`程序回傳碼：${exitCode}`))
          return
        }

        let parts = stdout.split('\n').slice(0, -1).map(line => line.split(' '))
        let entries: ArpEntry[] = []

        console.dir(parts)
        for (let record of parts) {
          if (record[3].length == 17 && record[1].slice(1, -1).match(kIpAddressRegexFull)) {
            // invalid MAC or IP address
            let mac = record[3].toUpperCase()
            let ip = record[1].slice(1, -1)
            let type: ArpType = record.includes('permanent') ? 'static' : 'dynamic'

            entries.push({
              ip: ip,
              mac: mac,
              type: type
            })
          }
        }

        resolve(entries)
      })
    })
  }

  // Windows
  return new Promise<ArpEntry[]>((resolve, reject) => {
    let stderr = ''
    let stdout = ''

    // 使用 iconv 解碼，所以將 encoding 設為 null
    let proc = process.exec('arp -a', { encoding: null })
    proc.stdin.end()

    // 因為 encoding 被設為 null，所以 data 必為 Buffer
    proc.stdout.on('data', (data: Buffer) => stdout += iconv.decode(data, encoding))
    proc.stderr.on('data', (data: Buffer) => stderr += iconv.decode(data, encoding))

    proc.on('close', exitCode => {
      if (exitCode != 0) {
        reject(new Error(`程序回傳碼：${exitCode}`))
        return
      }

      let lines = stdout.split('\r\n')
      // 空行之間代表一組網路介面

      let interfaces = lines.reduce((table, line) => {
        // 若是空行，新增到下一個介面中
        if (line == '') {
          table.push([])
        } else {
          let lastEntry = table[table.length - 1]
          lastEntry.push(line)
        }

        return table
      }, [])

      // 因為多一個空行，把多的移除
      interfaces.pop()

      let entries: ArpEntry[] = []
      for (let _interface of interfaces) {
        for (let i = 2; i < _interface.length; i++) {
          let record = _interface[i]
          let trimmed = record.trim().replace(/\s+/g, ' ')
          let columns = trimmed.split(' ')
          entries.push({
            ip: columns[0],
            mac: columns[1].replace(/-/g, ':').toUpperCase(),
            type: type(columns[2])
          })
        }
      }

      resolve(entries)
    })
  })
}
