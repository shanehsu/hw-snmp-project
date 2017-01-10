import express = require('express')

// 型態別稱
type Request = express.Request
type Response = express.Response
type Next = express.NextFunction;

export function corsHeader(req: Request, res: Response, next: Next) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'token, Origin, X-Requested-With, Content-Type, Accept')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
    next()
}

export function noCache(req: Request, res: Response, next: Next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    res.header('Expires', '-1')
    res.header('Pragma', 'no-cache')
    next()
}

export function randomResponseTimeDelay(req: Request, res: Response, next: Next) {
    setTimeout(() => { next() }, Math.random() * 750 + 250)
}
