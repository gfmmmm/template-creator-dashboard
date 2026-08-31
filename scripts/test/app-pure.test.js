'use strict';
// ═══════════════════════════════════════════════════════════════════
//  js/app.js 순수 로직 테스트 — 브라우저 없이 검증한다.
//  app.js 는 <script> 로 불러 쓰는 파일이라 require 가 안 된다(빌드도 없다).
//  그래서 PURE-BLOCK-START ~ PURE-BLOCK-END 사이만 떼어 Node 에서 실행한다.
//  이 블록에는 DOM·전역상태를 건드리지 않는 함수만 둔다.
// ═══════════════════════════════════════════════════════════════════
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', '..', 'js', 'app.js');
const src = fs.readFileSync(APP, 'utf8');
const block = src.split('// PURE-BLOCK-START')[1]?.split('// PURE-BLOCK-END')[0];
assert.ok(block && block.trim(), 'js/app.js 에 PURE-BLOCK 표식이 있어야 한다 (지우지 말 것)');

// eslint-disable-next-line no-new-func
const P = new Function(`${block}\nreturn { monthKeyLocal, normalizeNumInput, recencyScore, RECENCY_HALF_LIFE_DAYS };`)();

test('monthKeyLocal: 로컬 달력 기준 YYYY-MM (UTC 변환 금지)', () => {
  // 한국시간 9월 1일 오전 2시 = UTC 8월 31일 17시. toISOString 을 쓰면 "2026-08" 로 잘못 찍힌다.
  const kstEarlyFirst = new Date(2026, 8, 1, 2, 0, 0); // 로컬 2026-09-01 02:00
  assert.equal(P.monthKeyLocal(kstEarlyFirst), '2026-09', '매월 1일 새벽에도 이번 달이어야 한다');
  assert.equal(P.monthKeyLocal(new Date(2026, 0, 31, 23, 59)), '2026-01', '한 자리 달은 0 을 채운다');
  assert.equal(P.monthKeyLocal(new Date(2026, 11, 1)), '2026-12');
  assert.equal(P.monthKeyLocal('말도 안 되는 값'), '', '날짜로 못 읽으면 빈 문자열');
});

test('normalizeNumInput: 숫자만 남기고 0 접두를 없앤다', () => {
  assert.equal(P.normalizeNumInput('007'), '7', '0 접두 잔존 금지');
  assert.equal(P.normalizeNumInput('0'), '0', '0 하나는 그대로');
  assert.equal(P.normalizeNumInput('00'), '0');
  assert.equal(P.normalizeNumInput('12만'), '12', '숫자 아닌 글자는 버린다');
  assert.equal(P.normalizeNumInput('-5'), '5', '부호도 못 들어온다');
  assert.equal(P.normalizeNumInput('1.5'), '15', '소수점 없음 — 정수 칸이다');
  assert.equal(P.normalizeNumInput(''), '');
  assert.equal(P.normalizeNumInput(null), '');
  assert.equal(P.normalizeNumInput(undefined), '');
});

test('recencyScore: 반감기만큼 지나면 점수가 절반', () => {
  const now = Date.UTC(2026, 8, 1);
  const day = 86400000;
  const fresh = new Date(now).toISOString();
  const half = new Date(now - P.RECENCY_HALF_LIFE_DAYS * day).toISOString();
  assert.equal(P.recencyScore(100, fresh, now), 100, '오늘 것은 감쇠 없음');
  assert.ok(Math.abs(P.recencyScore(100, half, now) - 50) < 1e-9, '반감기 지나면 절반');
  // 오래된 대박이 최근 평작에 자리를 내주는 지점 — 이게 이 렌즈의 존재 이유다
  const old = new Date(now - 365 * day).toISOString();
  assert.ok(P.recencyScore(1000000, old, now) < P.recencyScore(50000, fresh, now));
  assert.equal(P.recencyScore(100, null, now), 0, '날짜 없으면 맨 뒤');
  assert.equal(P.recencyScore(null, fresh, now), 0, '조회수 없으면 0');
});
