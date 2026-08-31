#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  내 계정 수집 — data/posts.json 을 만드는 스크립트
//  ─────────────────────────────────────────────────────────────────
//  1) 프로필 1회            (1크레딧)
//  2) 릴스 전부             (12개당 1크레딧)
//  3) 피드 3페이지          (사진·캐러셀 줍기, 3크레딧)
//  4) 대본 — 이전에 뽑은 건 물려받고 새 릴스만 (TRANSCRIPT_MAX=10)
//  5) 썸네일 · 아바타 내려받기
//  6) 카드번호(M-###) 승계·부여
//  7) 품질 게이트 → posts.json 저장
//
//  사용법: node scripts/collect.js
//  환경  : SCRAPECREATORS_API_KEY (없으면 안내 후 정상 종료)
// ═══════════════════════════════════════════════════════════════════
const {
  loadEnv, log, notice, needKey, readJson, writeJson,
  scProfile, scReels, scPosts, scTranscript,
  avgViews, downloadThumb, getCredits, todayKST, pad3, limitOf,
} = require('./lib.js');

const FEED_PAGES = limitOf('FEED_PAGES', 3);        // 피드(사진·캐러셀) 페이지 수
const TRANSCRIPT_MAX = limitOf('TRANSCRIPT_MAX', 10); // 이번 실행에서 새로 뽑을 대본 개수

async function main() {
  const env = loadEnv();
  const key = needKey(env, 'SCRAPECREATORS_API_KEY', '내 계정 수집');

  const settings = readJson('settings.json');
  const handle = (settings?.handle || '').replace(/^@/, '').trim();
  if (!handle) {
    notice('data/settings.json 에 인스타 아이디(handle)가 없어서 수집을 건너뜁니다.');
    process.exit(0);
  }

  const prev = readJson('posts.json', null);
  const prevPosts = prev?.my?.posts || [];

  // 1) 프로필
  const profile = await scProfile(handle, key);
  if (profile.isPrivate) log(`  ⚠️ @${handle} 이 비공개 계정입니다 — 게시물을 가져올 수 없습니다`);
  log(`프로필 @${profile.handle} · 팔로워 ${profile.followers ?? '?'} · 게시물 ${profile.postsCount ?? '?'}`);

  // 2) 릴스 전부
  const posts = await scReels(handle, key, { limit: (profile.postsCount || 50) + 10 });
  log(`릴스 ${posts.length}건`);

  // 3) 품질 게이트 ①: 릴스가 기존의 절반 미만이면 수집을 폐기하고 기존 파일을 지킨다.
  //    (스크래퍼 장애로 0건이 온 날 대시보드가 통째로 비는 사고를 막는다)
  const prevReels = prevPosts.filter((p) => p.type === 'reel' || p.type === 'video').length;
  if (prevReels > 0 && posts.length < prevReels * 0.5) {
    console.log(`::warning::품질 게이트 — 새 릴스 ${posts.length}건이 기존 ${prevReels}건의 절반 미만이라 posts.json 을 그대로 둡니다`);
    process.exit(0);
  }
  if (!posts.length && !prevPosts.length) {
    log('가져온 게시물이 없습니다 — 계정이 비공개이거나 아이디가 틀렸을 수 있습니다');
  }

  // 4) 피드 게시물(사진·캐러셀) — 릴스 엔드포인트에는 안 나온다
  try {
    const feed = await scPosts(handle, key, FEED_PAGES);
    const have = new Set(posts.map((p) => p.shortcode));
    const extra = feed.filter((p) => !have.has(p.shortcode) && p.type !== 'reel');
    if (extra.length) { posts.push(...extra); log(`사진·캐러셀 +${extra.length}건`); }
    else log('사진·캐러셀 없음 — 최근 피드가 전부 릴스');
  } catch (e) { log('⚠️ 피드 수집 건너뜀: ' + String(e.message).slice(0, 80)); }

  // 5) 대본 — 이전 값 승계, 새 릴스만 상한만큼.
  //    '' 은 "뽑았는데 무음", null 은 "아직 못 뽑음". '' 도 물려받아야 다음 주에 또 결제하지 않는다.
  {
    const prevMap = {};
    for (const p of prevPosts) if (p.transcript != null) prevMap[p.shortcode] = p.transcript;
    let fetched = 0; let kept = 0;
    for (const p of posts) {
      if (p.type !== 'reel' && p.type !== 'video') continue;
      if (prevMap[p.shortcode] != null) { p.transcript = prevMap[p.shortcode]; kept++; continue; }
      if (fetched >= TRANSCRIPT_MAX) continue;
      try { p.transcript = (await scTranscript(p.url, key)) ?? ''; }
      catch { p.transcript = null; } // 실패는 null → 다음 실행에서 재시도
      fetched++;
    }
    log(`대본: 물려받음 ${kept} · 새로 ${fetched} (상한 ${TRANSCRIPT_MAX})`);
  }

  // 6) 썸네일 (CDN 주소가 만료되므로 로컬로)
  let okThumb = 0;
  for (const p of posts) {
    p.thumb = await downloadThumb(p.thumbSrc, `${p.shortcode}.jpg`);
    if (p.thumb) okThumb++;
    delete p.thumbSrc;
  }
  log(`썸네일 ${okThumb}/${posts.length}`);

  // 7) 아바타 — 프로필 사진은 바뀌므로 매번 새로 받는다
  if (profile.avatarSrc) profile.avatar = await downloadThumb(profile.avatarSrc, `_avatar_${handle}.jpg`, true);
  delete profile.avatarSrc;

  // 8) 카드번호 M-### — 기존 번호는 절대 안 바뀌고, 새 게시물만 오래된 순으로 이어 붙인다.
  //    번호를 재사용하면 "M-012 로 기획해줘"가 다른 영상을 가리키는 사고가 난다.
  {
    const prevNo = {};
    let maxN = 0;
    for (const p of prevPosts) {
      if (!p.cardNo) continue;
      prevNo[p.shortcode] = p.cardNo;
      const n = Number(String(p.cardNo).slice(2));
      if (n > maxN) maxN = n;
    }
    let next = maxN + 1;
    let added = 0;
    const fresh = [...posts].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    for (const p of fresh) {
      if (prevNo[p.shortcode]) { p.cardNo = prevNo[p.shortcode]; continue; }
      p.cardNo = `M-${pad3(next++)}`;
      added++;
    }
    log(`카드번호: 신규 ${added}건 · 마지막 M-${pad3(next - 1)}`);
  }

  // 9) 스냅샷 — 오늘 줄을 채워둔다(같은 날짜면 교체). 첫 수집날에도 추이 카드가 비지 않게.
  const snapshots = (prev?.snapshots || []).filter((s) => s.date !== todayKST());
  snapshots.push({
    date: todayKST(),
    my: {
      followers: profile.followers,
      following: profile.following,
      postsCount: profile.postsCount ?? posts.length,
      totalViews: posts.reduce((s, p) => s + (p.views || 0), 0),
      avgViews: avgViews(posts),
    },
  });
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  writeJson('posts.json', {
    updatedAt: new Date().toISOString(),
    creditsRemaining: getCredits(),
    my: { handle, profile, posts, avgViews: avgViews(posts) },
    snapshots,
  });
  log(`posts.json 저장: ${posts.length}건 · 남은 크레딧 ${getCredits() ?? '?'}`);
  console.log('\n✅ 수집 완료 — 대시보드를 새로고침하세요');
}

main().catch((e) => { console.error('❌ 수집 실패:', e.message || e); process.exit(1); });
