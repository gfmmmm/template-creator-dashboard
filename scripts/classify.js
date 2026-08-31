#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  기둥 분류 — 내 전체 게시물을 콘텐츠 기둥으로 나눈다 (Gemini 1회)
//  ─────────────────────────────────────────────────────────────────
//  settings.pillars 기준으로 posts.json 전체를 분류해 analysis.pillars 갱신.
//  수동 교정(settings.overrides)은 화면에서 항상 우선이므로 건드리지 않는다.
//
//  사용법: node scripts/classify.js
//  환경  : GEMINI_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const { loadEnv, log, notice, needKey, readJson, writeJson, geminiText, isDemo } = require('./lib.js');

async function main() {
  const env = loadEnv();
  const gkey = needKey(env, 'GEMINI_API_KEY', '기둥 분류');

  const data = readJson('posts.json', null);
  // 예시 데이터(demo:true)로는 분류하지 않는다 — 가짜 게시물에 기둥을 붙여봐야 첫 수집 때 다 지워진다.
  if (isDemo(data)) {
    notice('아직 예시 데이터뿐입니다 — 먼저 "데이터 가져와줘"로 내 계정을 수집하세요.');
    process.exit(0);
  }
  const posts = data?.my?.posts || [];
  if (!posts.length) { log('내 게시물이 없습니다 — 먼저 node scripts/collect.js 를 돌리세요'); return; }

  const settings = readJson('settings.json') || {};
  const pillars = (settings.pillars || []).map((p) => p.name).filter(Boolean);
  if (!pillars.length) {
    notice('data/settings.json 에 콘텐츠 기둥이 없어서 분류를 건너뜁니다. ("기둥 4개 정해서 분류해줘")');
    process.exit(0);
  }

  // 캡션 첫 줄 + 대본 앞부분이면 분류에 충분하다 — 전문을 넣으면 프롬프트만 커진다
  const items = posts.map((p) => ({
    sc: p.shortcode,
    cap: (p.caption || '').split('\n')[0].slice(0, 120),
    ts: (p.transcript || '').slice(0, 120),
  }));

  const prompt = `인스타그램 게시물을 콘텐츠 기둥으로 분류하라.
기둥 목록: ${JSON.stringify(pillars)}
각 게시물을 목록 중 정확히 하나로 분류하고, 어느 것에도 안 맞으면 "미분류"로 하라.
판단 근거는 캡션(cap)과 대본 앞부분(ts)이다.
반드시 JSON만 출력(코드블록 금지): {"classification":{"<sc>":"<기둥 이름>"}}

게시물 목록:
${JSON.stringify(items)}`;

  const parsed = await geminiText(prompt, gkey);

  // 모델이 지어낸 기둥 이름·없는 게시물은 버린다
  const valid = new Set([...pillars, '미분류']);
  const scSet = new Set(items.map((x) => x.sc));
  const cls = {};
  for (const [sc, name] of Object.entries(parsed.classification || {})) {
    if (scSet.has(sc) && valid.has(name)) cls[sc] = name;
  }
  if (!Object.keys(cls).length) throw new Error('분류 결과가 비었습니다 — 다시 시도해주세요');

  const analysis = readJson('analysis.json', null) || { pillars: {}, coaching: {} };
  analysis.pillars = cls;               // 통째로 교체 (기둥이 바뀌면 옛 분류는 의미가 없다)
  analysis.classifiedAt = new Date().toISOString();
  analysis.updatedAt = new Date().toISOString();
  writeJson('analysis.json', analysis);

  const count = {};
  for (const name of Object.values(cls)) count[name] = (count[name] || 0) + 1;
  log(`✅ ${Object.keys(cls).length}/${posts.length}건 분류 — ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}

main().catch((e) => { console.error('❌ 분류 실패:', e.message || e); process.exit(1); });
