#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  레퍼런스 발굴 — data/discoveries.json 을 채우는 스크립트
//  ─────────────────────────────────────────────────────────────────
//  설정에 등록한 소스 계정마다:
//    · 최신순 릴스를 기간 컷오프까지 (첫 수집 90일·4페이지 상한, 이후 14일)
//    · 조회수 minViews 이상 + 그 계정 평소(중앙값)의 MEDIAN_MULT배(기본 2) 이상만 남김
//    · 이미 있는 건 건너뜀(중복 제거)
//    · 대본 + 썸네일 채우고 R-### 부여
//  무거운 영상 분석은 analyze.js 가 따로 맡는다.
//
//  사용법: node scripts/discover.js
//  환경  : SCRAPECREATORS_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const {
  loadEnv, log, notice, needKey, readJson, writeJson, THUMBS,
  scReels, scTranscript, downloadThumb, getCredits, pad3, median, limitOf, freshIfDemo, isDemo,
} = require('./lib.js');

const FIRST_DAYS = limitOf('DISCOVER_FIRST_DAYS', 90);   // 첫 수집: 3개월 백필
const REGULAR_DAYS = limitOf('DISCOVER_DAYS', 14);       // 이후: 최근 2주만
const MAX_PAGES = limitOf('DISCOVER_MAX_PAGES', 4);      // 계정당 페이지(=크레딧) 상한
const MAX_ITEMS = limitOf('DISCOVER_MAX_ITEMS', 300);    // 저장소 비대 방지 — 총 보관 건수
const TRANSCRIPT_MAX = limitOf('DISCOVER_TRANSCRIPT_MAX', 20); // 한 번에 새로 뽑을 대본 개수
const MEDIAN_MULT = limitOf('DISCOVER_MEDIAN_MULT', 2);  // 그 계정 평소의 몇 배부터 '터진 것'으로 볼지 (기본 2. 소규모 소스면 1로)
const MAX_SOURCES = 10;

// 키가 틀렸거나 크레딧이 0일 때만 나는 오류인지 — 여기 걸리면 다음 소스로 넘어가봐야 전부 같은 결과다.
// (404 는 "그 아이디가 없다"라 그 소스만의 문제이므로 제외한다)
const isKeyOrCreditError = (msg) => /HTTP 40[123]\b/.test(msg) || /credit|크레딧|unauthorized|invalid api key/i.test(msg);

async function main() {
  const env = loadEnv();

  const settings = readJson('settings.json');
  // 예시 데이터(demo:true)로는 발굴하지 않는다 — 예시 소스 계정은 실재하지 않아 크레딧만 태우고,
  // 더미 discoveries.json 을 실데이터로 덮어써 화면의 예시 카드가 통째로 사라진다.
  // 키 검사(needKey)보다 먼저다 — 키가 없는 첫날에도 "키 없음"이 아니라 "아직 예시뿐"이 맞는 안내다.
  if (isDemo(settings)) {
    notice('아직 예시 데이터뿐입니다 — 먼저 "데이터 가져와줘"로 내 계정을 수집한 뒤 소스 계정을 등록하세요.');
    process.exit(0);
  }
  const key = needKey(env, 'SCRAPECREATORS_API_KEY', '레퍼런스 발굴');

  const sources = (settings?.sources || []).map((s) => String(s).replace(/^@/, '').trim()).filter(Boolean).slice(0, MAX_SOURCES);
  if (!sources.length) {
    notice('data/settings.json 의 sources 가 비어 있어서 발굴을 건너뜁니다. ("소스 계정으로 @아이디 등록해줘")');
    process.exit(0);
  }
  const minViews = Number(settings?.minViews) > 0 ? Number(settings.minViews) : 100000;

  // 더미(demo:true)는 '없음'으로 — 수집을 안 거치고 발굴부터 돌려도 예시 발굴이 실데이터에 섞이지 않는다.
  const db = freshIfDemo(readJson('discoveries.json', null), { items: [], sourceState: {}, nextR: 1, updatedAt: null });
  db.items = db.items || [];
  db.sourceState = db.sourceState || {};
  db.nextR = db.nextR || 1;

  const seen = new Set(db.items.map((x) => x.shortcode));
  const fresh = [];
  const okSources = [];

  for (const handle of sources) {
    const state = db.sourceState[handle] || {};
    const firstTime = !state.lastCollectedAt;
    const cutoff = Date.now() - (firstTime ? FIRST_DAYS : REGULAR_DAYS) * 86400000;
    let reels = [];
    try { reels = await scReels(handle, key, { limit: 12, sinceMs: cutoff, maxPages: MAX_PAGES }); }
    catch (e) {
      const msg = String(e.message || e);
      // 키·크레딧 문제는 계정을 바꿔도 똑같다 — 남은 소스를 돌며 크레딧을 더 태우지 않고 여기서 끊는다
      if (isKeyOrCreditError(msg)) {
        console.error(`\n❌ ScrapeCreators 키가 틀렸거나 크레딧이 0입니다 — .env 의 SCRAPECREATORS_API_KEY 와 남은 크레딧을 확인하세요`);
        console.error(`   (응답: ${msg.slice(0, 120)})\n`);
        process.exit(1);
      }
      log(`  ⚠️ @${handle} 수집 실패: ${msg.slice(0, 80)}`);
      continue;
    }
    okSources.push(handle);

    // 이 계정의 '평소 성적' — 최신 12개의 중앙값. 20만 못 넘긴 릴스까지 포함해야
    // "평소 30만인 계정의 400만 = 13배" 같은 진짜 배율이 나온다.
    // 표본이 너무 적으면(3개 이하) 왜곡되므로 기존 기록을 유지한다.
    const recent = reels.slice(0, 12);
    const med = recent.length >= 4 ? median(recent.map((x) => x.views || 0)) : (state.medianViews || 0);
    db.sourceState[handle] = {
      lastCollectedAt: new Date().toISOString(),
      medianViews: med,                              // 설정 탭의 '평소 조회수'
      collected: state.collected || 0,               // 이 계정에서 지금까지 건진 건수 (아래에서 갱신)
    };

    let hit = 0;
    for (const r of reels) {
      if (seen.has(r.shortcode)) continue;                                    // 중복
      if (!r.views || r.views < minViews) continue;                           // 하한 미만
      if (med > 0 && r.views < med * MEDIAN_MULT) continue;                   // 자기 평소의 MEDIAN_MULT배 미만 = 평작
      if (r.timestamp && new Date(r.timestamp).getTime() < cutoff) continue;  // 기간 밖
      fresh.push({ ...r, sourceHandle: handle });
      seen.add(r.shortcode);
      hit++;
    }
    log(`  @${handle}: 신규 ${hit}건 (평소 ${med ? Math.round(med / 10000) + '만' : '?'} · ${firstTime ? `첫 수집 ${FIRST_DAYS}일` : `최근 ${REGULAR_DAYS}일`})`);
  }

  // 전 계정 조회 실패는 '신규 없음'이 아니다 — 초록불로 위장하지 않는다
  if (!okSources.length) {
    console.error(`❌ 소스 ${sources.length}곳 전부 조회 실패 — 키·크레딧·서버 상태를 확인하세요`);
    process.exit(1);
  }

  // 대본 — 새 발굴 먼저, 남는 여유로 예전에 못 뽑은 것 재시도. 조회수 높은 순.
  const needTranscript = [
    ...fresh,
    ...db.items.filter((x) => x.transcript == null),
  ].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, TRANSCRIPT_MAX);
  let gotT = 0;
  for (const r of needTranscript) {
    try { r.transcript = (await scTranscript(r.url, key)) ?? ''; gotT++; }
    catch { r.transcript = r.transcript ?? null; } // 실패는 null 로 두고 다음 회차 재시도
  }
  log(`대본: ${gotT}/${needTranscript.length}건 (상한 ${TRANSCRIPT_MAX})`);

  // 새 발굴을 R 번호와 함께 적재 — 번호는 영구, 재사용 없음
  let okThumb = 0;
  for (const r of fresh) {
    const thumb = await downloadThumb(r.thumbSrc, `r_${r.shortcode}.jpg`);
    if (thumb) okThumb++;
    db.items.push({
      cardNo: `R-${pad3(db.nextR++)}`,
      shortcode: r.shortcode,
      url: r.url,
      sourceHandle: r.sourceHandle,
      caption: r.caption || '',
      transcript: r.transcript ?? null,
      views: r.views ?? null,
      likes: r.likes ?? null,
      comments: r.comments ?? null,
      commerceHint: r.commerceHint || null,
      takenAt: r.timestamp || null,
      thumb,
      status: 'collected',
      videoAnalysis: null,
      analysis: null,
      analyzedAt: null,
    });
  }
  if (fresh.length) log(`썸네일 ${okThumb}/${fresh.length}`);

  // 보관 상한 — 오래된 것부터 덜어낸다(썸네일 파일도 함께 지워 저장소를 가볍게 유지)
  if (db.items.length > MAX_ITEMS) {
    const keep = [...db.items].sort((a, b) => String(b.takenAt || '').localeCompare(String(a.takenAt || ''))).slice(0, MAX_ITEMS);
    const keepSet = new Set(keep.map((x) => x.shortcode));
    for (const x of db.items) {
      if (keepSet.has(x.shortcode)) continue;
      try { fs.unlinkSync(path.join(THUMBS, `r_${x.shortcode}.jpg`)); } catch { /* 이미 없음 */ }
    }
    log(`보관 상한 ${MAX_ITEMS}건 — 오래된 ${db.items.length - keep.length}건 정리`);
    db.items = keep;
  }

  // 계정별 보관 건수 — 설정 탭의 소스 목록에 그대로 보여준다(상한 정리 뒤 숫자여야 맞다)
  for (const h of Object.keys(db.sourceState)) {
    db.sourceState[h].collected = db.items.filter((x) => x.sourceHandle === h).length;
  }

  db.updatedAt = new Date().toISOString();
  db.creditsRemaining = getCredits();
  writeJson('discoveries.json', db);

  const analyzed = db.items.filter((x) => x.status === 'analyzed').length;
  console.log(`\n✅ 신규 ${fresh.length}건 · 보관 ${db.items.length}건(분석 완료 ${analyzed}) · 남은 크레딧 ${getCredits() ?? '?'}`);
  if (!fresh.length) console.log('   새로 걸린 게 없으면 조회수 기준을 낮춰보세요 — "발굴 기준을 5만으로 낮춰줘" 또는 DISCOVER_MEDIAN_MULT=1');
}

main().catch((e) => { console.error('❌ 발굴 실패:', e.message || e); process.exit(1); });
