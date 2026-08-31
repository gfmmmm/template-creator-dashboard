#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  채널 정체성 자동 분석 — settings.brief 를 쓰는 유일한 스크립트
//  ─────────────────────────────────────────────────────────────────
//  프로필·게시물·코칭을 종합해 Gemini 가 채널 정체성 400~700자를 쓴다.
//  ⚠️ settings.json 은 사람(과 이 스크립트)만 쓰는 파일이다.
//     여기서도 brief 한 칸만 갈아끼우고 나머지는 그대로 둔다.
//     자동화(GitHub Actions)에서는 돌리지 않는다 — 로컬 전용.
//
//  사용법: node scripts/brief.js
//  환경  : GEMINI_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const { loadEnv, log, needKey, readJson, writeJson, geminiText } = require('./lib.js');

const SYSTEM = `너는 인스타그램 채널 브랜딩 전문가다. 주어진 계정 데이터(게시물·조회수·대본·코칭)를 종합해 이 채널의 "정체성"을 한국어로 정리한다.
이 문서는 이 계정의 기획을 도울 때마다 참고하는 기준이 되므로, 실제 데이터에 근거해 구체적으로 써라.

반드시 아래 5가지를 포함하되, JSON·코드블록 없이 자연스러운 소제목+문단 형태로 작성:
1. 어떤 채널인가 (한마디로 정의)
2. 무엇을 주제로 하는가
3. 주로 어떤 경향이 있는가 (잘 되는 콘텐츠 vs 저조한 콘텐츠의 패턴)
4. 다른 계정과의 차별점
5. 강점과 포지셔닝

규칙: 추상적 미사여구·과장 금지. 조회수 편차·코칭에서 드러난 실제 패턴을 근거로. 400~700자 분량. 영어 단어 금지.`;

async function main() {
  const env = loadEnv();
  const gkey = needKey(env, 'GEMINI_API_KEY', '채널 정체성 분석');

  const data = readJson('posts.json', null);
  const my = data?.my;
  if (!my?.posts?.length) { log('내 게시물이 없습니다 — 먼저 node scripts/collect.js 를 돌리세요'); return; }

  const settings = readJson('settings.json') || {};
  const coaching = readJson('analysis.json', null)?.coaching || {};

  const byViews = [...my.posts].sort((a, b) => (b.views || 0) - (a.views || 0));
  const line = (p) => {
    const one = coaching[p.shortcode]?.analysis?.한줄평;
    const cap = (p.caption || '').replace(/\n/g, ' ').slice(0, 80);
    return `- ${Math.round((p.views || 0) / 10000)}만회 · ${cap}${one ? ` | 코칭: ${one}` : ''}`;
  };

  const material = `## 계정 기본
핸들: @${my.handle || ''}
팔로워: ${my.profile?.followers ?? '?'}
소개: ${my.profile?.biography || '(없음)'}
평균 조회수: ${my.avgViews ?? '?'}
게시물 수: ${my.posts.length}

## 잘 된 게시물 (조회수 상위 12)
${byViews.slice(0, 12).map(line).join('\n')}

## 저조한 게시물 (조회수 하위 6)
${byViews.slice(-6).map(line).join('\n')}`;

  // 이미 정체성이 있으면 백지에서 다시 쓰지 않고 '갱신' 모드로 — 사람이 손본 표현을 지키기 위해서다
  const prev = (settings.brief || '').trim();
  const mode = prev
    ? `\n\n## 기존 채널 정체성 (갱신 모드)
아래는 지금 쓰고 있는 정체성 문서다. 여전히 맞는 내용은 표현까지 그대로 유지하고,
새 데이터로 달라진 부분만 고쳐 써라. 근거 없이 새로 지어내지 마라.
---
${prev}
---`
    : '';

  const brief = await geminiText(material + mode, gkey, { json: false, system: SYSTEM });
  if (!brief || brief.length < 100) throw new Error('결과가 너무 짧습니다 — 다시 시도해주세요');

  // brief 한 칸만 교체. handle·pillars·sources·overrides 등은 그대로 둔다.
  const fresh = readJson('settings.json') || {};
  fresh.brief = brief;
  writeJson('settings.json', fresh);

  console.log(`\n${brief}\n`);
  log(`✅ 채널 정체성 ${brief.length}자를 settings.json 에 저장했습니다 ${prev ? '(기존 문서 갱신)' : '(신규 작성)'}`);
  console.log('   설정 탭에서 읽어보고 어색한 곳이 있으면 고쳐달라고 말씀하세요.');
}

main().catch((e) => { console.error('❌ 정체성 분석 실패:', e.message || e); process.exit(1); });
