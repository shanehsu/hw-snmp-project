let snmp = require('net-snmp')

export enum ObjectType {
  Boolean = 1,
  Integer = 2,
  Integer32 = 2,
  OctetString = 4,
  Null = 5,
  OID = 6,
  IpAddress = 64,
  Counter = 65,
  Counter32 = 65,
  Gauge = 66,
  Gauge32 = 66,
  Unsigned32 = 66,
  TimeTicks = 67,
  Opaque = 68,
  Counter64 = 70,
  NoSuchObject = 128,
  NoSuchInstance = 129,
  EndOfMibView = 130
}
interface Varbind {
  oid: string
  type: ObjectType | number
  value: any
}
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
  public async get(oid: string): Promise<string | number | boolean> {
    return new Promise<string | number | boolean>((resolve, reject) => {
      this.session.get([oid], (error: any, varbinds: Varbind[]) => {
        if (error) {
          reject(new Error(error.toString()))
          return
        }

        let varbind = varbinds[0]
        if (snmp.isVarbindError(varbind)) {
          reject(new Error(`Varbind 錯誤`))
          return
        }

        if (varbind.type == ObjectType.OctetString) {
          resolve(varbind.value.toString())
        }
        resolve(varbind.value)
      })
    })
  }
  public async table(oid: string, columns?: number[]): Promise<{ [row: string]: { [column: string]: number | boolean | Buffer } }> {
    return new Promise<{ [row: string]: { [column: string]: number | boolean | Buffer } }>((resolve, reject) => {
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
  public async set(oid: string, value: any, type: ObjectType) {
    return new Promise<void>((resolve, reject) => {
      this.session.set([{
        oid: oid,
        type: type as number,
        value: value
      }], (error: any, varbinds: Varbind[]) => {
        if (error) {
          reject(new Error(error.toString()))
          return
        }
        let varbind = varbinds[0]
        if (snmp.isVarbindError(varbind)) {
          reject(new Error(`Varbind 錯誤`))
          return
        }
        resolve()
      })
    })
  }
}
