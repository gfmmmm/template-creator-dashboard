#!/usr/bin/env node
'use strict';
// 초소형 정적 서버 — 의존성 0. 파일을 브라우저로 직접 열면 fetch가 막히므로 이걸로 연다.
// 실행: node scripts/serve.js  →  http://localhost:8787 (쓰는 중이면 다음 번호로)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const open = (url) => exec(process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`);

const server = http.createServer((req, res) => {
  // 잘못된 주소("//" 등)로 서버가 통째로 죽지 않게 — 400으로 돌려보낸다
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  // 상위 경로·숨김 파일 차단
  if (p.includes('..') || path.basename(p).startsWith('.')) { res.writeHead(403); return res.end('forbidden'); }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': (MIME[path.extname(file).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
  res.end(fs.readFileSync(file));
});

let port = Number(process.env.PORT) || 8787;
server.on('error', (e) => { if (e.code === 'EADDRINUSE' && port < 8797) server.listen(++port); else throw e; });
server.on('listening', () => {
  const url = `http://localhost:${port}`;
  console.log(`🎬 크리에이터 대시보드 → ${url}  (종료: Ctrl+C)`);
  if (!process.env.NO_OPEN) open(url);
});
server.listen(port);
