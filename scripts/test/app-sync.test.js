'use strict';
// ═══════════════════════════════════════════════════════════════════
//  화면(js/app.js)과 스크립트(scripts/*.js)에 두 벌로 존재하는 로직이
//  갈라지지 않았는지 대조한다.
//  왜 두 벌인가 — 브라우저는 require 를 못 쓰고 이 저장소는 빌드가 없다(템플릿 원칙).
//  그래서 "한 곳에 두기"가 불가능한 대신, 두 곳에 서로를 가리키는 주석을 달고
//  실제 일치 여부는 이 테스트가 지킨다. 한쪽만 고치면 여기서 빨간불이 난다.
// ═══════════════════════════════════════════════════════════════════
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../lib.js');

const ROOT = path.join(__dirname, '..', '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const coachSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'coach.js'), 'utf8');

// app.js 에서 `const 이름 = /정규식/플래그;` 한 줄을 찾아 정규식으로 되살린다
function regexFromApp(name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*(/.*/[a-z]*)\\s*;`).exec(appSrc);
  assert.ok(m, `js/app.js 에서 ${name} 정규식을 찾지 못했습니다`);
  const body = m[1];
  const last = body.lastIndexOf('/');
  return new RegExp(body.slice(1, last), body.slice(last + 1));
}

test('상업성 정규식: js/app.js 와 scripts/lib.js 가 글자 단위로 같다', () => {
  const pairs = [
    ['COMMERCE_AD', L.COMMERCE_AD_RE],
    ['COMMERCE_SELL', L.COMMERCE_SELL_RE],
  ];
  for (const [name, libRe] of pairs) {
    const appRe = regexFromApp(name);
    assert.equal(appRe.source, libRe.source, `${name} 규칙이 갈라졌습니다 — 양쪽을 같이 고치세요`);
    assert.equal(appRe.flags, libRe.flags, `${name} 플래그가 갈라졌습니다 (대소문자 무시 여부 등)`);
  }
});

test('상업성 판정: 같은 캡션에 두 구현이 같은 답을 낸다', () => {
  const AD = regexFromApp('COMMERCE_AD');
  const SELL = regexFromApp('COMMERCE_SELL');
  // app.js commerceOf() 의 폴백 경로와 같은 순서(광고 먼저, 그다음 공구)
  const appHint = (cap) => (AD.test(cap) ? '광고' : SELL.test(cap) ? '공구' : null);
  const samples = [
    '#광고 협찬받아 만들었어요',
    '오늘 공구 오픈합니다 마감 임박',
    '제작 지원을 받아 촬영했습니다',
    '프로필 링크에서 확인하세요',
    'paid partnership with brand',
    '그냥 일상 기록입니다',
    '',
  ];
  for (const cap of samples) {
    assert.equal(appHint(cap), L.commerceHintOf(cap), `"${cap}" 판정이 화면과 데이터에서 다릅니다`);
  }
});

test('기둥 우선순위: 두 구현 모두 수동 교정(overrides)이 AI 분류보다 앞선다', () => {
  // app.js pillarOf() — overrides 를 먼저 보고, 없을 때만 analysis.pillars 로 간다
  const appFn = /function pillarOf\(post\)\s*\{[\s\S]*?\n\}/.exec(appSrc);
  assert.ok(appFn, 'js/app.js 의 pillarOf() 를 찾지 못했습니다');
  const app = appFn[0];
  assert.ok(app.indexOf('overrides') < app.indexOf('analysis.pillars'),
    'app.js: settings.overrides 가 analysis.pillars 보다 먼저 판정돼야 합니다');

  // coach.js buildCtx() — 전개 순서가 곧 우선순위다(뒤에 퍼진 쪽이 이긴다)
  const cls = /const cls = \{[\s\S]*?\};/.exec(coachSrc);
  assert.ok(cls, 'scripts/coach.js 의 기둥 병합(cls) 을 찾지 못했습니다');
  assert.ok(cls[0].indexOf('analysis.pillars') < cls[0].indexOf('settings.overrides'),
    'coach.js: settings.overrides 가 analysis.pillars 뒤에 퍼져야 우선합니다');
});

test('서로를 가리키는 주석이 남아 있다 (한쪽만 고치는 사고 방지)', () => {
  assert.ok(appSrc.includes('scripts/lib.js'), 'app.js 에 lib.js 를 가리키는 주석이 있어야 합니다');
  assert.ok(appSrc.includes('scripts/coach.js'), 'app.js 에 coach.js 를 가리키는 주석이 있어야 합니다');
  assert.ok(coachSrc.includes('js/app.js'), 'coach.js 에 app.js 를 가리키는 주석이 있어야 합니다');
});
