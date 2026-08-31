#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
//  매일 스냅샷 — 팔로워 추이의 해상도를 만드는 가장 가벼운 스크립트
//  ─────────────────────────────────────────────────────────────────
//  프로필 1회(1크레딧) → posts.json 의 snapshots[] 에 오늘 한 줄.
//  같은 날짜 줄이 이미 있으면 갈아끼운다(하루 한 점).
//  게시물 목록은 건드리지 않는다 — 그건 collect.js 의 몫. 프로필 헤더 숫자(팔로워 등)만 같이 갱신한다.
//
//  API 를 부르기 전에 두 가지를 막는다(막히면 크레딧도 안 나간다):
//    · 아직 더미뿐이면 실행 거부 — 예시 추이에 진짜 숫자가 이어 붙는 것을 막는다
//    · settings 의 handle 이 바뀌었으면 실행 거부 — 두 계정 숫자가 한 그래프에 섞이는 것을 막는다
//
//  사용법: node scripts/snapshot.js   (매일 07:00 KST 자동 실행)
// ═══════════════════════════════════════════════════════════════════
const {
  loadEnv, log, notice, needKey, readJson, writeJson,
  scProfile, getCredits, todayKST, isDemo, upsertSnapshot,
} = require('./lib.js');

async function main() {
  const env = loadEnv();
  const key = needKey(env, 'SCRAPECREATORS_API_KEY', '매일 스냅샷');

  const settings = readJson('settings.json');
  const handle = (settings?.handle || '').replace(/^@/, '').trim();
  if (!handle) {
    notice('data/settings.json 에 인스타 아이디(handle)가 없어서 스냅샷을 건너뜁니다.');
    process.exit(0);
  }

  // ── API 를 부르기 전에 두 가지를 막는다 (막히면 크레딧도 안 나간다) ──
  const data = readJson('posts.json', null);
  // ① 더미 위에 스냅샷을 얹으면 예시 팔로워 추이에 진짜 숫자가 이어 붙는다. 수집이 먼저다.
  if (!data || isDemo(data)) {
    console.error('\n❌ 아직 실데이터가 없습니다 — 먼저 "데이터 가져와줘"\n');
    process.exit(1);
  }
  // ② 계정을 바꾸고 수집을 안 한 채 스냅샷만 돌면 서로 다른 두 계정 숫자가 한 그래프에 섞인다.
  //    에러 없이 데이터만 조용히 오염되는 종류라 여기서 끊는다.
  if (data.my?.handle && data.my.handle.toLowerCase() !== handle.toLowerCase()) {
    console.error(`\n❌ settings 의 handle 이 @${data.my.handle} → @${handle} 로 바뀌었습니다 — 먼저 "데이터 가져와줘"\n`);
    process.exit(1);
  }

  const profile = await scProfile(handle, key);
  const posts = data.my?.posts || [];
  const today = todayKST();
  const prevRow = (data.snapshots || []).find((s) => s.date === today) || {};

  const row = {
    date: today,
    my: {
      followers: profile.followers ?? prevRow.my?.followers ?? null,
      following: profile.following ?? prevRow.my?.following ?? null,
      postsCount: profile.postsCount ?? prevRow.my?.postsCount ?? posts.length,
      // 조회수 합·평균은 수집(collect.js)이 채우는 값이라 여기선 마지막 값을 이어 쓴다
      totalViews: prevRow.my?.totalViews ?? (posts.length ? posts.reduce((s, p) => s + (p.views || 0), 0) : null),
      avgViews: prevRow.my?.avgViews ?? data.my?.avgViews ?? null,
    },
  };

  const snapshots = upsertSnapshot(data.snapshots || [], row);

  data.snapshots = snapshots;
  // 프로필 헤더(팔로워·팔로잉·게시물 수)도 오늘 값으로 — 그래야 헤더가 주 1회가 아니라 매일 새로워진다
  data.my = data.my || { handle, profile: {}, posts };
  data.my.profile = Object.assign({}, data.my.profile || {}, Object.fromEntries(
    Object.entries({ followers: profile.followers, following: profile.following, postsCount: profile.postsCount })
      .filter(([, v]) => v !== undefined && v !== null)));
  data.creditsRemaining = getCredits() ?? data.creditsRemaining ?? null;
  writeJson('posts.json', data);

  log(`✅ 스냅샷 ${today} — 팔로워 ${row.my.followers ?? '?'} (누적 ${snapshots.length}일 · 남은 크레딧 ${getCredits() ?? '?'})`);
}

main().catch((e) => { console.error('❌ 스냅샷 실패:', e.message || e); process.exit(1); });
