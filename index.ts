import { GetArpTable } from './arp'
import { SNMP } from './snmp'

import express = require('express')
import bodyparser = require('body-parser')

// GetArpTable('big5').then(table => {
//   for (let _interface of Object.entries(table)) {
//     let interfaceIp = _interface[0]
//     let entries = _interface[1]

//     console.log(`介面卡：${interfaceIp}`)
//     for (let entry of entries) {
//       console.log(`${entry.ip}\t\t${entry.mac}`)
//     }

//     console.log()
//   }
// }).catch(console.error)

// "1.3.6.1.2.1.2.1.0" - The number of interfaces
// "1.3.6.1.2.1.2.2.1.2" - The name of the interface
// "1.3.6.1.2.1.2.2.1.5" - The negotiated speed of the interface
// "1.3.6.1.2.1.2.2.1.8" - The status of the interface
//                       -> 1 - up; 2 - down; 3 - testing
// "1.3.6.1.2.1.2.2.1.10" - The number of received octets of the interface
// "1.3.6.1.2.1.2.2.1.16" - The number of sent octets of the interface

// let oids = [
//   "1.3.6.1.2.1.2.1.0" // name
//   "1.3.6.1.2.1.1.6.0" // location
// ]
// snmp.get(oids[0]).then(console.dir).catch(console.error)

type InterfaceStatus = "UP" | "DOWN" | "TESTING"
class InterfaceStatistics {
  name: string
  speed: number
  status: InterfaceStatus
  sampled: number[]
  received: number[]
  sent: number[]

  constructor(name: string, speed: number, status: number, received: number, sent: number) {
    this.name = name
    this.speed = speed
    this.status = status == 1 ? "UP" : status == 2 ? "DOWN" : "TESTING"
    this.sampled = [Date.now()]
    this.received = [received]
    this.sent = [sent]
  }
  get down(): number {
    if (this.received.length < 9) {
      return -1.0
    }

    let timeDelta = (this.sampled[8] - this.sampled[0]) / 1000.0
    let receivedDelta = this.received[8] - this.received[0]

    return receivedDelta / timeDelta
  }
  get up(): number {
    if (this.sent.length < 9) {
      return -1.0
    }

    let timeDelta = (this.sampled[8] - this.sampled[0]) / 1000.0
    let sentDelta = this.sent[8] - this.sent[0]

    return sentDelta / timeDelta
  }
  public update(received: number, sent: number, speed: number, status: number) {
    if (this.sampled.length == 9) {
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
  }
}

let interfaces: { [name: string]: InterfaceStatistics } = {}

let snmp = new SNMP('10.0.0.1', 'public')
// let snmp = new SNMP('192.168.1.254', 'public')

// snmp.table("1.3.6.1.2.1.4.22").then(console.dir).catch(console.error)

async function getInterface() {
  try {
    let table = await snmp.table("1.3.6.1.2.1.2.2", [2, 5, 8, 10, 16])
    for (let [index, data] of Object.entries(table)) {
      let name = data["2"].toString()
      let speed = data["5"]
      let status = data["8"]
      let received = data["10"]
      let sent = data["16"]

      if (!interfaces[name]) {
        interfaces[name] = new InterfaceStatistics(name, speed as number, status as number, received as number, sent as number)
      } else {
        interfaces[name].update(received as number, sent as number, speed as number, status as number)
      }
    }
  } catch (err) {
    console.error(`An error occured while trying to fetch interface status. => `)
    console.error(err)
  }

  setTimeout(getInterface, 50)
}
setTimeout(getInterface, 50)

let app = express()
app.use(bodyparser.json())

app.get('/interfaces', (req, res, next) => {
  res.json(Object.entries(interfaces).map(([name, value]) => {
    return {
      name: value.name,
      speed: value.speed,
      status: value.status,
      down: value.down,
      up: value.up
    }
  }))
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


app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).send(err.message ? err.message : `${JSON.stringify(err)}`)
})

app.listen(3000)
