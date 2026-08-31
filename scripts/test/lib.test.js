'use strict';
// ═══════════════════════════════════════════════════════════════════
//  lib.js 순수 함수 테스트 — 의존성 0, Node 내장 러너만 쓴다.
//  실행: npm test   (또는 node --test "scripts/test/**/*.test.js")
//  네트워크·파일을 건드리는 함수는 여기 없다. "말없이 데이터가 틀어지는" 종류의
//  버그(카드번호 재사용·더미 섞임·품질 게이트 오작동)만 겨눈다.
// ═══════════════════════════════════════════════════════════════════
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

test('parseEnv: KEY=값 · 따옴표 · 주석 · 빈 줄 · 공백', () => {
  const env = L.parseEnv('A=1\n# 주석\nB="two"\n\nC=\'3\'\nD = 4 \n');
  assert.deepEqual(env, { A: '1', B: 'two', C: '3', D: '4' });
});

test('isDemo: 최상위 demo:true 만 더미로 본다', () => {
  assert.equal(L.isDemo({ demo: true, items: [] }), true);
  assert.equal(L.isDemo({ demo: false }), false);
  assert.equal(L.isDemo({ items: [] }), false);
  assert.equal(L.isDemo(null), false);
});

test('freshIfDemo: 더미·없음이면 fallback 사본, 실데이터면 그대로', () => {
  const fallback = { nextR: 1, items: [] };
  const a = L.freshIfDemo({ demo: true, nextR: 7, items: [{ shortcode: 'x' }] }, fallback);
  assert.deepEqual(a, { nextR: 1, items: [] });
  const b = L.freshIfDemo(null, fallback);
  assert.deepEqual(b, { nextR: 1, items: [] });
  // 사본이라야 한다 — 하나를 고쳐도 원본 상수와 다른 사본이 안 변해야 한다
  assert.notEqual(a, fallback);
  assert.notEqual(a.items, b.items);
  a.items.push({ shortcode: 'y' }); a.nextR = 99;
  assert.deepEqual(fallback, { nextR: 1, items: [] }, '원본 fallback 이 변형되면 안 된다');
  assert.deepEqual(b, { nextR: 1, items: [] });
  // 실데이터는 같은 참조 그대로
  const real = { nextR: 7, items: [{ shortcode: 'x' }] };
  assert.equal(L.freshIfDemo(real, fallback), real);
});

test('assignCardNumbers: 기존 번호 유지 · 신규는 오래된 순 · 번호 재사용 없음', () => {
  const items = [
    { shortcode: 'b', timestamp: '2026-02-01' },
    { shortcode: 'a', timestamp: '2026-01-01' },
    { shortcode: 'c', timestamp: '2026-03-01' },
  ];
  const { next, added } = L.assignCardNumbers(items, 'M', 4, { a: 'M-003' });
  assert.equal(items.find((i) => i.shortcode === 'a').cardNo, 'M-003', '기존 번호는 그대로');
  assert.equal(items.find((i) => i.shortcode === 'b').cardNo, 'M-004', '오래된 것부터');
  assert.equal(items.find((i) => i.shortcode === 'c').cardNo, 'M-005');
  assert.equal(next, 6);
  assert.equal(added, 2);
});

test('assignCardNumbers: takenAt 도 시간 기준으로 인정(발굴 R 번호)', () => {
  const items = [{ shortcode: 'z', takenAt: '2026-05-02' }, { shortcode: 'y', takenAt: '2026-05-01' }];
  L.assignCardNumbers(items, 'R', 1);
  assert.equal(items.find((i) => i.shortcode === 'y').cardNo, 'R-001');
  assert.equal(items.find((i) => i.shortcode === 'z').cardNo, 'R-002');
});

test('qualityGate: 기존의 절반 미만이면 거부, 기존이 0이면 무조건 통과', () => {
  assert.equal(L.qualityGate(4, 10).ok, false, '10건이던 게 4건이면 수집 사고');
  assert.equal(L.qualityGate(5, 10).ok, true, '딱 절반은 통과');
  assert.equal(L.qualityGate(30, 10).ok, true);
  // 첫 실행(더미를 걷어내 기준이 0)일 때 소규모 계정이 막히면 안 된다 — 이 템플릿의 핵심 구멍이었다
  assert.equal(L.qualityGate(3, 0).ok, true, '릴스 3개짜리 실계정도 첫 수집은 통과해야 한다');
  assert.equal(L.qualityGate(0, 0).ok, true, '사진만 올리는 계정도 막지 않는다');
});

test('upsertSnapshot: 같은 날짜면 교체 · 아니면 추가 · 항상 날짜순', () => {
  const s = [{ date: '2026-09-01', my: { followers: 1 } }];
  L.upsertSnapshot(s, { date: '2026-09-01', my: { followers: 2 } });
  L.upsertSnapshot(s, { date: '2026-08-31', my: { followers: 0 } });
  assert.deepEqual(s.map((x) => x.date), ['2026-08-31', '2026-09-01']);
  assert.equal(s[1].my.followers, 2, '하루에 한 점만 남는다');
});

test('commerceHintOf: 광고 · 공구 · 일반', () => {
  assert.equal(L.commerceHintOf('오늘 공구 오픈합니다'), '공구');
  assert.equal(L.commerceHintOf('#광고 협찬받아 만들었어요'), '광고');
  assert.equal(L.commerceHintOf('제품 제공 받아 촬영'), '광고');
  assert.equal(L.commerceHintOf('그냥 일상 기록'), null);
  assert.equal(L.commerceHintOf(''), null);
});

test('pickThumb: 320px 이상 중 가장 작은 것, 없으면 가장 큰 것', () => {
  assert.equal(L.pickThumb([{ url: 'big', width: 1080 }, { url: 'mid', width: 640 }, { url: 'ok', width: 320 }]), 'ok');
  assert.equal(L.pickThumb([{ url: 'tiny', width: 150 }, { url: 'small', width: 240 }]), 'small', '전부 작으면 제일 큰 것');
  assert.equal(L.pickThumb([]), null);
  assert.equal(L.pickThumb(null), null);
});

test('median · avgViews: 빈 배열에서 터지지 않는다', () => {
  assert.equal(L.median([5, 1, 3]), 3);
  assert.equal(L.median([]), 0);
  assert.equal(L.avgViews([{ views: 100 }, { views: 300 }, { views: null }]), 200);
  assert.equal(L.avgViews([]), null, '조회수가 하나도 없으면 0 이 아니라 null');
});

test('cutSafe: 반쪽 이모지를 남기지 않는다', () => {
  assert.equal(L.cutSafe('abcdef', 3), 'abc');
  assert.equal(L.cutSafe('가나다🙂', 4), '가나다', '서로게이트 앞쪽 반만 남으면 통째로 버린다');
  assert.equal(L.cutSafe(null, 5), '');
});

test('extractJson: 실패를 조용히 넘기지 않는다 (표시 + 시각)', () => {
  assert.deepEqual(L.extractJson('앞말 {"a":1} 뒷말'), { a: 1 }, '앞뒤에 말이 붙어도 JSON 만 꺼낸다');
  const bad = L.extractJson('죄송합니다, JSON 으로 못 드리겠어요');
  assert.equal(bad.parseFailed, true, '파싱 실패는 반드시 표시가 남아야 재시도·소급 대상이 된다');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(bad.parseFailedAt), '언제 실패했는지 시각도 남는다');
  assert.ok(bad.raw.includes('죄송합니다'), '원문 일부는 확인용으로 남긴다');
  assert.equal(L.extractJson('').parseFailed, true, '빈 응답도 실패다');
});

test('candidateText: thought 파트를 건너뛰고 나머지 text 를 잇는다', () => {
  // parts[0] 고정 인덱스로 읽으면 모델이 생각 파트를 앞에 얹은 날 빈 문자열을 받는다
  assert.equal(L.candidateText({ content: { parts: [{ text: '속으로 생각', thought: true }, { text: '{"a":1}' }] } }), '{"a":1}');
  assert.equal(L.candidateText({ content: { parts: [{ text: '앞' }, { text: '뒤' }] } }), '앞뒤');
  assert.equal(L.candidateText({ content: { parts: [{ functionCall: {} }] } }), '', '텍스트가 없으면 빈 문자열');
  assert.equal(L.candidateText(undefined), '', 'candidates 가 아예 없어도 터지지 않는다');
});

test('limitOf: 없으면 기본값 · 빈 문자열도 기본값 · 오타는 0', () => {
  delete process.env.__TEST_LIMIT__;
  assert.equal(L.limitOf('__TEST_LIMIT__', 10), 10);
  process.env.__TEST_LIMIT__ = '';
  assert.equal(L.limitOf('__TEST_LIMIT__', 10), 10);
  process.env.__TEST_LIMIT__ = '3';
  assert.equal(L.limitOf('__TEST_LIMIT__', 10), 3);
  process.env.__TEST_LIMIT__ = '0';
  assert.equal(L.limitOf('__TEST_LIMIT__', 10), 0, '0 은 "이번엔 사지 마라"라는 뜻이라 기본값으로 되돌리면 안 된다');
  process.env.__TEST_LIMIT__ = '열개';
  assert.equal(L.limitOf('__TEST_LIMIT__', 10), 0, '오타는 전량 과금보다 0 이 안전하다');
  delete process.env.__TEST_LIMIT__;
});
