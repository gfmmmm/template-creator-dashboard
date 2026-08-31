#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  내 릴스 코칭 — 내 영상을 Gemini 가 보고 진단한다
//  ─────────────────────────────────────────────────────────────────
//  posts.json 의 릴스 중 아직 코칭 안 받은 것, 조회수 높은 순 COACH_MAX 건:
//    ① 영상 URL 확보(1크레딧) → 임시 다운로드
//    ② Gemini 시각분석
//    ③ Gemini 코칭 종합 — 한줄평·강점·개선점·다음적용
//    ④ analysis.json 의 coaching 에 저장
//    ⑤ 영상 파일 즉시 삭제
//
//  사용법: node scripts/coach.js
//  환경  : GEMINI_API_KEY, SCRAPECREATORS_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadEnv, log, notice, needKey, readJson, writeJson, isDemo,
  scVideoUrl, commerceHintOf, downloadVideo, geminiAnalyze, geminiText,
  getCredits, median, limitOf,
} = require('./lib.js');

const COACH_MAX = limitOf('COACH_MAX', 5);
const MAX_FAILS = 3;

// 이 파일의 코칭 프롬프트를 고칠 때마다 날짜를 올린다. 결과에 같이 적히므로,
// 나중에 "옛 프롬프트로 만든 코칭만 다시 받자"를 고를 수 있다.
// (소급 재코칭 자체는 아직 구현하지 않았다 — 대상을 고를 근거만 남긴다.
//  다시 돌리려면 analysis.json 의 coaching 에서 그 shortcode 를 지우면 이 스크립트가 다시 집는다)
const PROMPT_VERSION = '2026-09-01';
const TMP = path.join(os.tmpdir(), 'creator-dashboard-mine');

// 코칭 공통 재료 — 계정 정체성·기둥·잘 됐던 영상. 전 릴스가 함께 쓴다.
function buildCtx(posts, settings, analysis) {
  const brief = settings.brief || '';
  const pillars = (settings.pillars || []).map((p) => p.name).filter(Boolean);
  const med = median(posts.map((p) => p.views).filter((v) => v != null));
  const line = (p) => `· 「${(p.caption || '').split('\n')[0].slice(0, 40)}」 — ${Math.round((p.views || 0) / 10000)}만 뷰 (평소의 ${med > 0 ? (p.views / med).toFixed(0) : '?'}배)`;
  const sorted = [...posts].filter((p) => p.views != null).sort((a, b) => b.views - a.views);
  const top = sorted.slice(0, 2).map(line);
  // 기둥 분류: 수동 교정(settings.overrides)이 AI 분류(analysis.pillars)보다 우선.
  // ⚠️ 같은 우선순위가 화면 쪽 `js/app.js` 의 pillarOf() 에도 한 벌 더 있다(브라우저는 require 를 못 쓴다).
  //    한쪽만 고치면 대시보드에 보이는 기둥과 코칭이 참고한 기둥이 갈라진다 — 둘을 같이 고칠 것.
  const cls = { ...(analysis.pillars || {}), ...(settings.overrides || {}) };
  const byPillar = {};
  for (const p of sorted) {
    const pil = cls[p.shortcode];
    if (pil && pil !== '미분류' && !byPillar[pil]) byPillar[pil] = line(p);
  }
  return { brief, pillars, top, cls, byPillar, med };
}

function coach(post, va, avg, handle, ctx, gkey) {
  const commerce = post.commerceHint || commerceHintOf(post.caption || '');
  const saleField = commerce ? `,\n  "판매코칭": ["「인용」으로 시작 — 사고 싶게 만드는 장치 중 실제 영상에 있는 잘한 것·놓친 것, 최대 2개"]` : '';
  const myPillar = ctx.cls[post.shortcode];
  const refs = [...new Set([...(myPillar && ctx.byPillar[myPillar] ? [ctx.byPillar[myPillar]] : []), ...ctx.top])].slice(0, 3);
  const prompt = `너는 릴스 기획 코칭 전문가다. 내 계정(@${handle || ''})의 릴스 하나를 영상 시각분석·지표와 함께 진단한다.

## 이 계정
- 채널 정체성 (카테고리 본질 판단의 기준): ${ctx.brief || '(미설정)'}
- 콘텐츠 기둥: ${ctx.pillars.join(' / ') || '(미설정)'}
${refs.length ? `- 이 계정에서 잘 됐던 영상들 (조언은 가능하면 이 실적에 근거하라${myPillar ? ` — 첫 줄이 이 릴스와 같은 주제(${myPillar})의 최고 기록` : ''}):\n${refs.join('\n')}` : ''}

## 진단 우선순위 (반드시 이 순서로 — 기획이 90%, 기술이 10%)
1. 초반 3초 후킹 — 3초 안에 주제가 명확한가, 스크롤을 멈출 이유가 있는가, 멘트와 화면이 일치하는가
2. 주제/기획 — 관심 가질 사람이 충분히 많은가, 이득 암시·문제 해결·흥미 유발 중 하나가 명확한가
3. 카테고리 본질 — "나도 저렇게 하고 싶다"는 마음이 드는가. 위 채널 정체성 문장이 판단 기준이다
4. 대본 구조 — 간결한가, 모호한 표현 없는가, 같은 말 반복 없는가
5. 영상 3요소(10%) — 자막·오디오·화면. 반드시 기획 관점으로 연결해서만 지적하라 (편집 기술 조언 금지)

## 의도 존중 원칙
지적하기 전에 만든 사람이 그 요소를 넣은 의도를 먼저 추정하라. 릴스 문법상 유효한 시도라면 "빼라"가 아니라 그 요소를 살려내는 방향으로 교정하라. 의도 자체가 타당하지 않거나 명백한 실수일 때만 대체를 제안하라.

## 팔로우·저장·댓글 유도 지적 금지
그것들의 부재나 약함을 개선점·다음적용으로 만들지 마라 — 이 코칭에서는 성과 변수로 보지 않으며, 모든 영상에 기계적으로 붙는 지적이라 가치가 없다.
예외 하나: 공구·광고 릴스의 구매 전환 장치는 판매코칭 필드에서만 다뤄라.

## 작성 규칙 (전 항목 공통)
- 각 항목은 반드시 영상 속 실제 장면·멘트를 「」 안에 인용하며 시작한다. 시각분석·캡션·대본에 실제 있는 것만 — 지어내기 금지
- 흐름: 인용 → 시청자 입장에서 왜(멈추는지/이탈하는지) → 어떻게
- 개선점은 심각도 라벨로 시작: [이탈요인](이것 때문에 넘김) / [개선필요](고치면 확실히 좋아짐) / [참고](있으면 좋음). 심각한 순으로
- 심각도는 실제 판단대로만 — 라벨을 하나씩 골고루 배분하는 습관 금지. 전부 [참고]일 수도, [이탈요인]이 둘일 수도 있다
- 최대 3개는 상한이지 목표가 아니다 — 잘된 영상이면 개선점 1개만 적어라. 억지로 채우면 진짜 문제가 묻힌다
- 다음적용은 개선점의 반복 금지 — 같은 조언을 말만 바꿔 다시 쓰지 마라. 장면·대사 수준의 실행안으로 발전시키거나, 개선점에 없던 다른 시도를 제안하라
- 말투: "~하세요" 명령 금지 → "~하는 것이 중요합니다", "~할 수 있을 것입니다". 영어 단어 금지, 광고 카피 금지
- 분석 용어를 쓰지 마라 — 옆에서 말해주는 코치의 일상어로. "모수"(✕) → "관심 가질 사람이 얼마나 많은가"(○), "본질 욕망 자극"(✕) → "나도 해보고 싶다는 마음이 들게"(○)

## 이 계정의 색 보호
채널 정체성에 드러난 이 계정 고유의 색(개인 서사·유머·인간미·소통)은 감점 요소가 아니라 차별점이다.
개인적인 순간이나 유머를 "정보 효율"로 대체하라는 교정을 하지 마라 — 그 색이 기획(후킹·이득)과 만나는 지점을 찾아 살리는 방향으로만 제안하라.

## 톤 예시 (구조를 그대로 따를 것)
"[개선필요] 「이거 하나면 끝나요」로 시작하는 첫 멘트는 매력적으로 들릴 수 있지만, 무엇이 끝나는지가 3초 안에 보이지 않아 시청자가 자기 이야기라고 느끼기 어렵습니다. 대상과 이득을 함께 말하는 문장으로 바꾸면 같은 멘트가 훨씬 강해질 것입니다."
${commerce ? `\n이 릴스는 ${commerce} 콘텐츠다 — 사고 싶게 만드는 장치(전후비교·사회적증거·한정성·가격앵커·권위)를 판매코칭 필드에서 다뤄라. 실제 영상에 있는 것만.` : ''}
반드시 JSON만 출력(코드블록 금지):
{ "한줄평": "이 영상의 성과와 성격을 숫자 근거와 함께 한 문장으로",
  "강점": ["「인용」으로 시작 — 왜 잘 작동하는지, 최대 3개"],
  "개선점": ["[심각도] 「인용」 — 왜 — 개선 방향, 최대 3개"],
  "다음적용": ["그대로 실행 가능한 팁, 최대 2개"]${saleField} }

조회수: ${post.views}${avg ? ` (내 평균 ${avg})` : ''}
캡션: ${(post.caption || '').slice(0, 300)}
대본: ${(post.transcript || '대본 없음').slice(0, 1500)}
영상 시각분석: ${JSON.stringify(va)}`;
  return geminiText(prompt, gkey);
}

// 코드 가드 — 개수 절단 + 인용 없는 개선점 제거 + 유도 지적 차단(프롬프트만으로는 재발한다)
function guardCoach(an) {
  if (!an || typeof an !== 'object') return an;
  for (const [k, max] of [['강점', 3], ['개선점', 3], ['다음적용', 2], ['판매코칭', 2]]) {
    if (Array.isArray(an[k])) an[k] = an[k].slice(0, max);
  }
  if (Array.isArray(an.개선점)) {
    const quoted = an.개선점.filter((x) => String(x).includes('「'));
    if (quoted.length) an.개선점 = quoted;
  }
  const CTA_RE = /행동\s*유도|팔로우\s*유도|저장\s*유도|댓글\s*유도|구독\s*유도|팔로우를\s*요청/i;
  for (const k of ['개선점', '다음적용']) {
    if (Array.isArray(an[k])) an[k] = an[k].filter((x) => !CTA_RE.test(String(x)));
  }
  return an;
}

async function main() {
  const env = loadEnv();

  const data = readJson('posts.json', null);
  // 예시 데이터(demo:true)로는 코칭하지 않는다 — 가짜 영상 주소로 크레딧만 나간다.
  // ⚠️ 키 검사(needKey)보다 앞이다 — 키가 없는 첫날엔 "키를 넣으세요"가 아니라 "수집이 먼저"가 맞는 안내다.
  if (isDemo(data)) {
    notice('아직 예시 데이터뿐입니다 — 먼저 "데이터 가져와줘"로 내 계정을 수집하세요.');
    process.exit(0);
  }

  const gkey = needKey(env, 'GEMINI_API_KEY', '내 릴스 코칭');
  const sckey = needKey(env, 'SCRAPECREATORS_API_KEY', '내 릴스 코칭(영상 주소 확보)');
  const posts = data?.my?.posts || [];
  if (!posts.length) { log('내 게시물이 없습니다 — 먼저 node scripts/collect.js 를 돌리세요'); return; }

  const settings = readJson('settings.json') || {};
  const analysis = readJson('analysis.json', null) || { pillars: {}, coaching: {} };
  analysis.coaching = analysis.coaching || {};
  analysis.coachFails = analysis.coachFails || {};

  const reels = posts.filter((p) => (p.type === 'reel' || p.type === 'video') && p.shortcode);
  const todo = reels
    .filter((p) => !analysis.coaching[p.shortcode] && (analysis.coachFails[p.shortcode] || 0) < MAX_FAILS)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, COACH_MAX);
  if (!todo.length) { log('새로 코칭할 릴스가 없습니다 (전부 코칭 완료).'); return; }

  const ctx = buildCtx(reels, settings, analysis);
  fs.mkdirSync(TMP, { recursive: true });
  console.log(`\n🎬 내 릴스 코칭 ${todo.length}건 (조회수 높은 순 · 분석 후 영상 삭제)\n`);

  let done = 0;
  for (const post of todo) {
    const vid = path.join(TMP, `${post.shortcode}.mp4`);
    try {
      const url = await scVideoUrl(post.url, sckey);
      if (!url) { log(`  ⚠️ ${post.cardNo || post.shortcode} 영상 주소 없음`); continue; }
      if (!await downloadVideo(url, vid)) { log(`  ⚠️ ${post.cardNo || post.shortcode} 영상 내려받기 실패`); continue; }
      const va = await geminiAnalyze(vid, gkey);
      const an = guardCoach(await coach(post, va, data.my?.avgViews, data.my?.handle, ctx, gkey));
      analysis.coaching[post.shortcode] = {
        video_analysis: va,
        analysis: an,
        analyzed_at: new Date().toISOString(),
        prompt_version: PROMPT_VERSION, // 어느 프롬프트로 만든 코칭인지 (소급 재코칭 대상 고르기용)
      };
      delete analysis.coachFails[post.shortcode];
      done++;
      log(`  ✅ ${post.cardNo || post.shortcode} (${Math.round((post.views || 0) / 10000)}만) — ${an.한줄평 || ''}`);
    } catch (e) {
      analysis.coachFails[post.shortcode] = (analysis.coachFails[post.shortcode] || 0) + 1;
      log(`  ❌ ${post.cardNo || post.shortcode}: ${String(e.message || e).slice(0, 90)} (누적 ${analysis.coachFails[post.shortcode]}회)`);
    } finally { try { fs.unlinkSync(vid); } catch { /* 이미 없음 */ } }
  }

  analysis.updatedAt = new Date().toISOString();
  writeJson('analysis.json', analysis);
  console.log(`\n✅ ${done}건 코칭 완료 · 영상 파일은 전부 삭제됨 · 남은 크레딧 ${getCredits() ?? '?'}\n`);
  if (todo.length > 0 && done === 0) { console.error(`❌ ${todo.length}건 전량 실패 — 키·크레딧·서버 상태를 점검하세요`); process.exit(1); }
}

main().catch((e) => { console.error('❌ 코칭 실패:', e.message || e); process.exit(1); });
