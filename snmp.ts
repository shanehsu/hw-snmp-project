let snmp = require('net-snmp')

export class SNMP {
  private session: any = null
  private closed: boolean = false
  private errored: boolean = false

  public lastError: any = null
  public get ready(): boolean {
    return !this.closed && !this.errored
  }

  public constructor(private address: string, private community: string) {
    this.session = snmp.createSession(address, community)

    this.session.on('error', (error: any) => {
      this.errored = true
      this.lastError = error
    })
    this.session.on('close', (error: any) => {
      this.closed = true
    })
  }
  public close() {
    this.session.close()
  }
  public async get(oid: string): Promise<string> {
    return new Promise<any>((resolve, reject) => {
      this.session.get([oid], (error: any, varbinds: any[]) => {
        if (error) {
          reject(new Error(error.toString()))
          return
        }

        let varbind = varbinds[0]
        console.dir(varbind)
        if (snmp.isVarbindError(varbind)) {
          reject(new Error(`Varbind 錯誤`))
          return
        }

        resolve(varbind.value)
      })
    })
  }
  public async table(oid: string, columns?: number[]): Promise<{ [row: string]: { [column: string]: any } }> {
    return new Promise<{ [row: string]: { [column: string]: any } }>((resolve, reject) => {
      if (!columns) {
        this.session.table(oid, (error: any, table: any) => {
          if (error) {
            reject(new Error(error.toString()))
            return
          }
          resolve(table)
        })
      } else {
        this.session.tableColumns(oid, columns, (error: any, table: any) => {
          if (error) {
            reject(new Error(error.toString()))
            return
          }
          resolve(table)
        })
      }
    })
  }
}
