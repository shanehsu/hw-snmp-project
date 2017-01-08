import process = require('child_process')
import iconv = require('iconv-lite')

let kIpAddressRegex = /(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/

export type ArpType = 'static' | 'dynamic' | 'unknown'
export type ArpEntry = { ip: string, mac: string, type: ArpType }
export type ArpTable = { [ip: string]: ArpEntry[] }

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
export async function GetArpTable(encoding: string = 'utf8'): Promise<ArpTable> {
  return new Promise<ArpTable>((resolve, reject) => {
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

      let table: ArpTable = {}
      for (let _interface of interfaces) {
        let adapterIp = _interface[0].match(kIpAddressRegex)[0]
        table[adapterIp] = []
        let entry = table[adapterIp]

        for (let i = 2; i < _interface.length; i++) {
          let record = _interface[i]
          let trimmed = record.trim().replace(/\s+/g, ' ')
          let columns = trimmed.split(' ')
          entry.push({
            ip: columns[0],
            mac: columns[1],
            type: type(columns[2])
          })
        }
      }

      resolve(table)
    })
  })
}
