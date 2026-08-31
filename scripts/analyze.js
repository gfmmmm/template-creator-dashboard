#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  레퍼런스 분석 — 발굴한 남의 릴스를 Gemini 로 해부한다
//  ─────────────────────────────────────────────────────────────────
//  status='collected' 중 조회수 높은 순으로 ANALYZE_MAX 건:
//    ① 영상 URL 재획득(1크레딧) → 임시 다운로드
//    ② Gemini 시각분석 (훅·컷편집·자막·연출)
//    ③ Gemini 종합 — "왜 터졌나 + 내 계정이 뭘 훔쳐올까"
//    ④ discoveries.json 에 저장, status='analyzed'
//    ⑤ 영상 파일 즉시 삭제 (용량 0)
//
//  사용법: node scripts/analyze.js
//  환경  : GEMINI_API_KEY, SCRAPECREATORS_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadEnv, log, notice, needKey, readJson, writeJson, isDemo,
  scVideoUrl, commerceHintOf, downloadVideo, geminiAnalyze, geminiText,
  getCredits, limitOf,
} = require('./lib.js');

const ANALYZE_MAX = limitOf('ANALYZE_MAX', 10);
const MAX_FAILS = 3; // 3회 실패한 릴스는 제외 — 매주 같은 항목에 크레딧을 다시 태우지 않는다
const TMP = path.join(os.tmpdir(), 'creator-dashboard-refs');

// ── Gemini 종합 프롬프트 ─────────────────────────────────────────
function synthesize(item, videoAnalysis, ctx, gkey) {
  const commerce = item.commerceHint || commerceHintOf(item.caption || '');
  const saleField = commerce
    ? `, "소구점": { "무엇을_팔며":"제품·서비스가 무엇인지", "찌르는_욕구":"어떤 욕구·불안·귀찮음을 찌르나", "판매장치":"실제 쓰인 장치만(전후비교·사회적증거·한정성·가격앵커·권위 등)", "우리가_배울_것":"우리 판매 콘텐츠에 옮길 구체 팁 1~2개" }`
    : '';
  const saleNote = commerce
    ? `\n이 릴스는 ${commerce} 콘텐츠다 — 어떻게 제품을 사고 싶게 만드는지(소구점)도 분석하라. 영상·대본에 실제로 있는 장치만 적고 지어내지 마라.`
    : '';
  const prompt = `너는 릴스 기획 관점의 숏폼 레퍼런스 분석가다. 남의 계정에서 터진 릴스를 해부해 "왜 터졌고, 내 계정이 뭘 훔쳐올지"를 정리한다.${saleNote}

## 내 계정 (차용포인트는 반드시 이 계정 기준으로 맞춤하라)
- 채널 정체성: ${ctx.brief || '(미설정)'}
- 콘텐츠 기둥: ${ctx.pillars.join(' / ') || '(미설정)'}

## 분석 프레임워크 (터진 이유를 이 4개 축에서 찾아라 — 기획이 90%)
1. 초반 3초 후킹 — 어떤 장치로 스크롤을 멈췄나 (결과 먼저 / 질문 / 상식 깨기 / 권위 / 공감 등)
2. 주제/모수 — 왜 많은 사람이 관심 가질 주제인가, 어떤 이득·문제·흥미를 건드리나
3. 본질/욕망 — 시청자의 어떤 욕망("나도 저렇게 하고 싶다")을 자극했나
4. 대본/구조 — 전개·반전·마무리에서 뭐가 특별한가

## 내 채널 관련성 판정 (기둥 기준 — 주제가 달라도 기둥에 붙으면 관련 있음)
- 높음: 릴스의 주제가 위 콘텐츠 기둥 중 하나와 겹친다
- 중간: 주제는 다르지만 후킹·구조·연출 문법을 우리 기둥에 옮겨 쓸 수 있다
- 낮음: 주제가 어느 기둥에도 안 붙고, 특별히 배울 문법도 없다
애매하면 낮음이 아니라 중간으로 판정하라 — 낮음은 확실할 때만.

## 작성 규칙
- 표면적 이유 금지 ("영상미가 좋다" ✕) — 메커니즘으로 설명하라 ("완성 장면을 1초 먼저 보여줘 결과 궁금증을 만든 뒤...")
- 각 항목은 영상 속 실제 장면·멘트를 「」 안에 인용하며 시작한다. 시각분석·대본·캡션에 실제 있는 것만 — 지어내기 금지
- 차용포인트는 내 계정의 정체성·기둥에 맞게 번역해서, 다음 영상에서 그대로 실행할 수 있는 수준으로 쓴다
- 영어 단어 금지
- 말투는 정중한 존댓말로 통일 — "~했습니다", "~끌어냈습니다". 반말 절대 금지
- 분석 용어 대신 쉬운 표현으로 — "모수"(✕) → "관심 가질 사람이 많은 주제"(○). 같은 문형을 연달아 반복하지 않기

반드시 JSON만 출력(코드블록 금지):
{ "주제":"핵심 주제 한 줄",
  "후킹":"「인용」 — 스크롤을 멈춘 메커니즘 한두 문장",
  "좋은점": ["「인용」으로 시작 — 왜 터졌는지 메커니즘, 최대 3개"],
  "차용포인트": ["내 계정 맞춤 + 그대로 실행 가능한 팁, 최대 3개"],
  "내채널_관련성": { "등급": "높음|중간|낮음", "이유": "판정 근거 한 줄" }${saleField} }

조회수: ${item.views}
캡션: ${(item.caption || '').slice(0, 300)}
대본: ${(item.transcript || '대본 없음').slice(0, 1500)}
영상 시각분석: ${JSON.stringify(videoAnalysis)}`;
  return geminiText(prompt, gkey);
}

// 코드 가드 — 프롬프트를 못 믿는 자리: 개수 절단 + 인용 없는 항목 제거(전부 탈락하면 원본 유지)
function guardRef(an) {
  if (!an || typeof an !== 'object') return an;
  for (const [k, max] of [['좋은점', 3], ['차용포인트', 3]]) {
    if (Array.isArray(an[k])) an[k] = an[k].slice(0, max);
  }
  if (Array.isArray(an.좋은점)) {
    const quoted = an.좋은점.filter((x) => String(x).includes('「'));
    if (quoted.length) an.좋은점 = quoted;
  }
  // 관련성 등급 누락·이상값은 보수적으로 '중간'
  if (!an.내채널_관련성 || !['높음', '중간', '낮음'].includes(an.내채널_관련성.등급)) {
    an.내채널_관련성 = { 등급: '중간', 이유: an.내채널_관련성?.이유 || '(판정 누락 — 보수적 유지)' };
  }
  return an;
}

async function main() {
  const env = loadEnv();

  const db = readJson('discoveries.json', null);
  // 예시 데이터(demo:true)로는 분석하지 않는다 — 가짜 주소로 영상을 받으러 가서 크레딧만 태우고,
  // "영상을 못 찾았습니다"가 뜨면 처음 쓰는 사람은 자기 계정이 잘못된 줄 안다.
  // ⚠️ 키 검사(needKey)보다 앞이다 — 키가 아직 없는 첫날에 "키를 넣으세요"라고 하면
  //    시킨 대로 키를 넣어도 여전히 아무 일이 안 일어나서 두 번 헤맨다. 지금 필요한 건 수집이다.
  if (isDemo(db)) {
    notice('아직 예시 데이터뿐입니다 — 먼저 "레퍼런스 가져와줘"로 진짜 레퍼런스를 모으세요.');
    process.exit(0);
  }

  const gkey = needKey(env, 'GEMINI_API_KEY', '레퍼런스 분석');
  const sckey = needKey(env, 'SCRAPECREATORS_API_KEY', '레퍼런스 분석(영상 주소 확보)');
  if (!db?.items?.length) { log('발굴된 레퍼런스가 없습니다 — 먼저 node scripts/discover.js 를 돌리세요'); return; }

  const settings = readJson('settings.json') || {};
  const ctx = { brief: settings.brief || '', pillars: (settings.pillars || []).map((p) => p.name).filter(Boolean) };
  const hidden = new Set(settings.hidden || []);

  const todo = db.items
    .filter((x) => x.status !== 'analyzed' && !hidden.has(x.cardNo) && (x.analyzeFails || 0) < MAX_FAILS)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, ANALYZE_MAX);
  if (!todo.length) { log('새로 분석할 레퍼런스가 없습니다 (전부 분석 완료).'); return; }

  fs.mkdirSync(TMP, { recursive: true });
  console.log(`\n🎬 레퍼런스 영상 분석 ${todo.length}건 (조회수 높은 순 · 분석 후 영상 삭제)\n`);

  let done = 0;
  for (const item of todo) {
    const vid = path.join(TMP, `${item.shortcode}.mp4`);
    try {
      const url = await scVideoUrl(item.url, sckey); // 인스타 영상 주소는 금방 만료 → 직전에 받는다
      if (!url) { log(`  ⚠️ ${item.cardNo} 영상 주소 없음`); continue; }
      if (!await downloadVideo(url, vid)) { log(`  ⚠️ ${item.cardNo} 영상 내려받기 실패`); continue; }
      const va = await geminiAnalyze(vid, gkey);
      const an = guardRef(await synthesize(item, va, ctx, gkey));
      item.videoAnalysis = va;
      item.analysis = an;
      item.status = 'analyzed';
      item.analyzedAt = new Date().toISOString();
      delete item.analyzeFails;
      done++;
      log(`  ✅ ${item.cardNo} (${Math.round((item.views || 0) / 10000)}만) — ${an.주제 || ''}`);
    } catch (e) {
      item.analyzeFails = (item.analyzeFails || 0) + 1;
      log(`  ❌ ${item.cardNo}: ${String(e.message || e).slice(0, 90)} (누적 ${item.analyzeFails}회)`);
    } finally { try { fs.unlinkSync(vid); } catch { /* 이미 없음 */ } }
  }

  db.updatedAt = new Date().toISOString();
  if (getCredits() != null) db.creditsRemaining = getCredits();
  writeJson('discoveries.json', db);
  console.log(`\n✅ ${done}건 분석 완료 · 영상 파일은 전부 삭제됨 · 남은 크레딧 ${getCredits() ?? '?'}\n`);
  // 전멸은 '0건 성공'이 아니다 — 초록불로 위장하지 않는다
  if (todo.length > 0 && done === 0) { console.error(`❌ ${todo.length}건 전량 실패 — 키·크레딧·서버 상태를 점검하세요`); process.exit(1); }
}

main().catch((e) => { console.error('❌ 분석 실패:', e.message || e); process.exit(1); });
