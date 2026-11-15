'use strict';
// Fake customer endpoint for local demos. It prints every request it receives as one JSON
// line and exposes routes that simulate different customer behaviours:
//   POST /hook   -> 200 OK
//   POST /fail   -> 500 always (exercises retries and the FALLIDA state)
//   POST /slow   -> answers after 10 s (exceeds the 5 s timeout)
//   POST /flaky  -> 500 for the first 2 attempts of each X-Event-Id, then 200
//   GET  /received -> last 50 requests received
const http = require('node:http');

const port = Number(process.env.PORT || 9000);
const slowMs = Number(process.env.SLOW_MS || 10_000);
const received = [];
const attemptsByEvent = new Map();

function log(entry) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.end('ok');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/received') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(received.slice(-50), null, 2));
    return;
  }
  if (req.method !== 'POST') {
    res.statusCode = 404;
    res.end();
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    let body = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      body = null;
    }
    const eventId = req.headers['x-event-id'];
    const attempt = Number(req.headers['x-delivery-attempt'] || 0);
    const seen = (attemptsByEvent.get(eventId) || 0) + 1;
    attemptsByEvent.set(eventId, seen);

    let status = 200;
    let delayMs = 0;
    if (url.pathname === '/fail') status = 500;
    else if (url.pathname === '/slow') delayMs = slowMs;
    else if (url.pathname === '/flaky') status = seen <= 2 ? 500 : 200;
    else if (url.pathname !== '/hook') status = 404;

    const entry = { path: url.pathname, status, delayMs, eventId, attempt, body };
    received.push({ receivedAt: new Date().toISOString(), ...entry });
    if (received.length > 500) received.shift();
    log({ msg: 'webhook received', ...entry });

    setTimeout(() => {
      res.statusCode = status;
      res.end();
    }, delayMs);
  });
});

server.listen(port, '0.0.0.0', () => log({ msg: 'webhook-receiver listening', port }));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
