import { GetArpTable } from './arp'
import { SNMP, ObjectType } from './snmp'

import express = require('express')
import bodyparser = require('body-parser')

type InterfaceStatus = "UP" | "DOWN" | "TESTING"
class InterfaceStatistics {
  static SAMPLES = 20

  name: string
  speed: number
  status: InterfaceStatus
  setting: InterfaceStatus
  sampled: number[]
  received: number[]
  sent: number[]

  constructor(name: string, speed: number, status: number, setting: number, received: number, sent: number) {
    this.name = name
    this.speed = speed
    this.status = status == 1 ? "UP" : status == 2 ? "DOWN" : "TESTING"
    this.setting = setting == 1 ? "UP" : setting == 2 ? "DOWN" : "TESTING"
    this.sampled = [Date.now()]
    this.received = [received]
    this.sent = [sent]
  }
  get down(): number {
    if (this.received.length < InterfaceStatistics.SAMPLES) {
      return -1.0
    }

    let timeDelta = (this.sampled[InterfaceStatistics.SAMPLES - 1] - this.sampled[0]) / 1000.0
    let receivedDelta = this.received[InterfaceStatistics.SAMPLES - 1] - this.received[0]

    return receivedDelta / timeDelta
  }
  get up(): number {
    if (this.sent.length < InterfaceStatistics.SAMPLES) {
      return -1.0
    }

    let timeDelta = (this.sampled[InterfaceStatistics.SAMPLES - 1] - this.sampled[0]) / 1000.0
    let sentDelta = this.sent[InterfaceStatistics.SAMPLES - 1] - this.sent[0]

    return sentDelta / timeDelta
  }
  public update(received: number, sent: number, speed: number, status: number, setting: number) {
    if (this.sampled.length == InterfaceStatistics.SAMPLES) {
      this.sampled.push(Date.now())
      this.received.push(received)
      this.sent.push(sent)

      this.sampled.splice(0, 1)
      this.received.splice(0, 1)
      this.sent.splice(0, 1)
    } else {
      this.sampled.push(Date.now())
      this.received.push(received)
      this.sent.push(sent)
    }

    this.speed = speed
    this.status = status == 1 ? "UP" : status == 2 ? "DOWN" : "TESTING"
    this.setting = setting == 1 ? "UP" : setting == 2 ? "DOWN" : "TESTING"
  }
}

let interfaces: { [name: string]: InterfaceStatistics } = {}

// let snmp = new SNMP('10.0.0.1', 'public')
let snmp = new SNMP('192.168.1.254', 'public')

async function getInterface() {
  try {
    let table = await snmp.table("1.3.6.1.2.1.2.2", [2, 5, 7, 8, 10, 16])
    for (let [index, data] of Object.entries(table)) {
      let name = data["2"].toString()
      let speed = data["5"]
      let setting = data["7"]
      let status = data["8"]
      let received = data["10"]
      let sent = data["16"]

      if (!interfaces[name]) {
        interfaces[name] = new InterfaceStatistics(name, speed as number, status as number, setting as number, received as number, sent as number)
      } else {
        interfaces[name].update(received as number, sent as number, speed as number, status as number, setting as number)
      }
    }
  } catch (err) {
    console.error(`An error occured while trying to fetch interface status. => `)
    console.error(err)
  }

  setTimeout(getInterface, 50)
}

// 開始取得介面資訊
getInterface()

let app = express()
app.use(bodyparser.text())
app.use(bodyparser.json())

app.get('/interfaces', (req, res, next) => {
  res.json(Object.entries(interfaces).map(([name, value]) => {
    return {
      name: value.name,
      speed: value.speed,
      status: value.status,
      settings: value.setting,
      down: value.down,
      up: value.up
    }
  }))
})
app.post('/interfaces/:index/setting', (req, res, next) => {
  let index = +(req.params.index as string)
  let setting = req.body.toString() as string

  let newSetting = setting == 'UP' ? 1 :
    setting == 'DOWN' ? 2 : setting == 'TESTING' ? 3 : -1
  if (newSetting > 0) {
    try {
      snmp.set(`1.3.6.1.2.1.2.2.1.7.${index}`, newSetting, ObjectType.Integer)
      res.status(201).send()
    } catch (err) {
      next(err)
    }
  } else {
    res.status(500).send(`設定值必須為 UP, DOWN 或是 TESTING，得到 ${setting}`)
  }
})
app.get('/interfaces/samples', (req, res, next) => {
  res.json(Object.entries(interfaces).map(([name, value]) => value))
})
app.get('/uptime', async (req, res, next) => {
  try {
    res.send(((await snmp.get('1.3.6.1.2.1.1.3.0') as number) / 100).toString())
  } catch (err) {
    next(err)
  }
})
app.get('/system', async (req, res, next) => {
  try {
    let model = await snmp.get('1.3.6.1.2.1.1.1.0')
    let name = await snmp.get('1.3.6.1.2.1.1.5.0')
    let location = await snmp.get('1.3.6.1.2.1.1.6.0')
    let contact = await snmp.get('1.3.6.1.2.1.1.4.0')

    res.json({
      name: name,
      model: model,
      location: location,
      contatct: contact
    })
  } catch (err) {
    next(err)
  }
})
app.post('/system/name', async (req, res, next) => {
  let newName = req.body.toString() as string
  try {
    await snmp.set('1.3.6.1.2.1.1.5.0', newName, ObjectType.OctetString)
    res.status(201).send()
  } catch (err) {
    next(err)
  }
})
app.post('/system/location', async (req, res, next) => {
  let newLocation = req.body.toString() as string
  try {
    await snmp.set('1.3.6.1.2.1.1.6.0', newLocation, ObjectType.OctetString)
    res.status(201).send()
  } catch (err) {
    next(err)
  }
})
app.post('/system/contact', async (req, res, next) => {
  let newContact = req.body.toString() as string
  try {
    await snmp.set('1.3.6.1.2.1.1.4.0', newContact, ObjectType.OctetString)
    res.status(201).send()
  } catch (err) {
    next(err)
  }
})
app.get('/connected', async (req, res, next) => {
  enum StatusMap {
    "OTHER" = 1,
    "INVALID" = 2,
    "LEARNED" = 3,
    "SELF" = 4,
    "MGMT" = 5
  }
  try {
    let macTable = await snmp.table('1.3.6.1.2.1.17.4.3') as { [oid: string]: { 1: Buffer, 2: number, 3: StatusMap | number } }
    let result = Object.entries(macTable).map(([_, value]) => {
      let macAddress = value['1'].toString('hex').toUpperCase().match(/.{2}/g).reduce((addr, part) => `${addr}:${part}`, "").slice(1)
      let port = value['2']
      let status = value['3'] == 1 ? "OTHER" :
        value['3'] == 2 ? "INVALID" :
          value['3'] == 3 ? 'LEARNED' :
            value['3'] == 4 ? "SELF" : "MGMT"

      return {
        mac_address: macAddress,
        port: port,
        status: status
      }
    })

    res.json(result)
  } catch (err) {
    next(err)
    return
  }
})
app.get('/arp', async (req, res, next) => {
  try {
    res.json(await GetArpTable('big5'))
  } catch (err) {
    next(err)
  }
})

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).send(err.message ? err.message : `${JSON.stringify(err)}`)
})

app.listen(3000)
