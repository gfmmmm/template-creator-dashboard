'use strict';
// ═══════════════════════════════════════════════════════════════════
//  공용 부품 — 모든 스크립트가 이 파일 하나만 require 한다.
//  ─────────────────────────────────────────────────────────────────
//  · 의존성 0 : npm install 없이 Node 22 내장 fetch 만 쓴다.
//  · 담는 것 : .env 읽기 · 로그 · ScrapeCreators 래퍼 · 썸네일 내려받기
//              · Gemini 3종 · JSON 읽고 쓰기(원자적)
//  · 데이터 폴더는 DATA_DIR 환경변수로 바꿀 수 있다(기본 data/).
//    테스트할 때 저장소의 data/ 를 더럽히지 않기 위한 손잡이.
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const THUMBS = path.join(DATA_DIR, 'thumbs');
// JSON 에 적히는 썸네일 경로는 화면(index.html) 기준의 웹 경로로 고정한다.
// DATA_DIR 을 바꿔도 이 문자열은 그대로여야 배포된 대시보드가 그림을 찾는다.
const THUMB_WEB = 'data/thumbs';

// ───────────────── .env 파서 (dotenv 없이 10줄) ─────────────────
// 파일 내용 → 객체. 파일을 읽는 일과 분리해둔 건 테스트에서 가짜 문자열을 넣어보기 위해서다.
function parseEnv(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// GitHub Actions 는 시크릿을 process.env 로 주므로 그쪽이 우선이고,
// 로컬에서는 .env 파일이 유일한 출처다.
function loadEnv() {
  let file = {};
  try { file = parseEnv(fs.readFileSync(path.join(ROOT, '.env'), 'utf8')); }
  catch { /* .env 가 없으면 process.env 만 쓴다 */ }
  return { ...file, ...process.env };
}

const log = (msg) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`);

// Actions 에서 빨간 X 대신 회색 안내로 끝내기 위한 출력.
// (키가 없는 건 고장이 아니라 "아직 설정 안 함"이다 — 매일 실패 메일이 오면 안 된다)
const notice = (msg) => console.log(`::notice::${msg}`);

// 키가 없으면 안내 한 줄 남기고 정상 종료(0). 있으면 값을 돌려준다.
function needKey(env, name, what) {
  if (!env[name]) {
    notice(`${name} 가 없습니다 — ${what} 단계를 건너뜁니다. (로컬은 .env, 자동화는 GitHub 시크릿에 넣으세요)`);
    process.exit(0);
  }
  return env[name];
}

// ───────────────── JSON 읽고 쓰기 ─────────────────
const dataPath = (name) => path.join(DATA_DIR, name);

function readJson(name, fallback = null) {
  try { return JSON.parse(fs.readFileSync(dataPath(name), 'utf8')); }
  catch { return fallback; }
}

// 원자적 쓰기 — 임시 파일에 다 쓴 뒤 rename 으로 갈아끼운다.
// 중간에 프로세스가 죽어도 반쪽짜리 JSON 이 남지 않는다(대시보드가 통째로 깨지는 사고 방지).
function writeJson(name, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dest = dataPath(name);
  const tmp = `${dest}.tmp${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, dest);
}

// ───────────────── 더미(demo) 취급 ─────────────────
// 템플릿에 들어 있는 예시 데이터에는 JSON 최상위에 demo:true 가 붙어 있다(sample/*/ 의 4개 파일).
// 스크립트는 이걸 "실데이터 없음"과 똑같이 취급한다. 그래야 템플릿을 받은 사람이 첫 수집을 할 때
//  · 가짜 팔로워 추이 14일치가 실계정 그래프에 이어 붙지 않고
//  · 품질 게이트가 더미 릴스를 '기존'으로 착각해 정상 수집을 거부하지 않는다(릴스 몇 개뿐인 계정이 통째로 막힌다)
//  · 예시 발굴·예시 코칭이 실계정 화면에 섞이지 않는다.
const isDemo = (obj) => !!(obj && obj.demo);

// demo 이거나 없으면 fallback 의 '사본'을 준다 — 사본이라야 호출부가 고쳐도 원본 상수가 오염되지 않는다.
function freshIfDemo(obj, fallback) { return (!obj || isDemo(obj)) ? structuredClone(fallback) : obj; }

// 더미 썸네일 일괄 삭제. 예시 썸네일은 SVG 로 그려 넣었고 실수집 썸네일은 전부 .jpg 라서 섞이지 않는다.
// 지운 개수를 돌려준다.
function clearDemoThumbs() {
  let n = 0;
  try {
    for (const f of fs.readdirSync(THUMBS)) {
      if (!f.endsWith('.svg')) continue;
      try { fs.unlinkSync(path.join(THUMBS, f)); n++; } catch { /* 이미 없음 */ }
    }
  } catch { /* thumbs 폴더가 없으면 지울 것도 없다 */ }
  return n;
}

// ───────────────── ScrapeCreators (수집 전부) ─────────────────
const API = 'https://api.scrapecreators.com';

// 마지막 응답에 실린 크레딧 잔량. 설정 탭에 그대로 보여준다.
let creditsRemaining = null;
const getCredits = () => creditsRemaining;

// 요청 1회 = 크레딧 1개. 서버가 간헐적으로 500 을 뱉으므로 3회까지 지수 백오프.
// 4xx(키 오류·크레딧 소진)는 재시도해도 소용없으니 즉시 포기한다.
async function sc(pathname, key, label = '', tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * 2 ** (i - 1)));
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(`${API}${pathname}`, { headers: { 'x-api-key': key }, signal: ctrl.signal });
      const json = await res.json().catch(() => ({}));
      if (json.credits_remaining != null) creditsRemaining = json.credits_remaining;
      if (res.ok && json.success !== false) return json;
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`${label}: HTTP ${res.status} ${JSON.stringify(json).slice(0, 120)}`);
      }
      lastErr = new Error(`${label}: HTTP ${res.status} ${String(json.message || '').slice(0, 80)}`);
      log(`  ↻ 재시도 ${i + 1}/${tries - 1} — ${lastErr.message}`);
    } catch (e) {
      if (String(e.message).includes('HTTP 4')) throw e;
      lastErr = e;
    } finally { clearTimeout(to); }
  }
  throw lastErr;
}

// 상업성 힌트 — 원문 캡션 기준 공구/광고 판정.
// ⚠️ 규칙을 바꾸면 js/app.js 의 같은 정규식도 함께 바꿔야 화면과 데이터가 어긋나지 않는다.
const COMMERCE_AD_RE = /#\s?(광고|협찬)|#AD\b|유료\s*광고|제작\s*지원|협찬\s*받|제공\s*받|paid\s*partnership/i;
const COMMERCE_SELL_RE = /공구|공동\s*구매|스마트\s*스토어|프로필\s*링크|구매\s*링크|와디즈|펀딩|마감\s*임박/;
const commerceHintOf = (cap) => (COMMERCE_AD_RE.test(cap) ? '광고' : COMMERCE_SELL_RE.test(cap) ? '공구' : null);

// 이모지 안전 절단 — 끝이 서로게이트 앞쪽 반이면 한 글자 더 버린다(반쪽 이모지는 JSON 을 깨뜨린다).
const cutSafe = (s, n) => {
  const t = (s || '').slice(0, n);
  const c = t.charCodeAt(t.length - 1);
  return c >= 0xD800 && c <= 0xDBFF ? t.slice(0, -1) : t;
};

const avgViews = (posts) => {
  const withViews = posts.filter((p) => typeof p.views === 'number' && p.views > 0);
  if (!withViews.length) return null;
  return Math.round(withViews.reduce((s, p) => s + p.views, 0) / withViews.length);
};

// 썸네일 후보 중 가장 작은 것을 고른다 — 축소 도구(sharp·sips)를 안 쓰는 대신
// 애초에 작은 그림을 받아서 저장소가 비대해지는 것을 막는다.
// 다만 카드가 뭉개지지 않게 가로 320px 이상 중에서 가장 작은 것으로 하고,
// 그런 후보가 없으면 가장 큰 것을 쓴다.
const MIN_THUMB_W = 320;
function pickThumb(candidates) {
  const list = (candidates || []).filter((c) => c && c.url);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => (a.width || 0) - (b.width || 0));
  const big = sorted.find((c) => (c.width || 0) >= MIN_THUMB_W);
  return (big || sorted[sorted.length - 1]).url;
}

// ---------- 정규화 ----------
function normalizeProfile(raw) {
  const u = raw?.data?.user || raw?.user || raw?.data || {};
  return {
    handle: u.username || null,
    fullName: u.full_name || null,
    biography: u.biography || null,
    externalUrl: u.external_url || null,
    verified: u.is_verified ?? false,
    avatarSrc: u.profile_pic_url_hd || u.profile_pic_url || null, // 만료 URL — 받아둔 뒤 지운다
    followers: u.edge_followed_by?.count ?? u.follower_count ?? null,
    following: u.edge_follow?.count ?? u.following_count ?? null,
    postsCount: u.edge_owner_to_timeline_media?.count ?? u.media_count ?? null,
    isPrivate: u.is_private ?? false,
  };
}

// 릴스 응답 한 건 → 게시물 레코드
function normalizePost(item, inputHandle) {
  const m = item?.media || item || {};
  const code = m.code || m.shortcode || null;
  if (!code) return null;
  // media_type: 2=video, 8=carousel, 1=image · product_type: 'clips'=릴스
  let type = 'image';
  if (m.product_type === 'clips') type = 'reel';
  else if (m.media_type === 8 || m.carousel_media) type = 'carousel';
  else if (m.media_type === 2) type = 'video';
  return {
    shortcode: code,
    url: `https://www.instagram.com/p/${code}/`,
    owner: m.user?.username || null,
    inputHandle: inputHandle || m.user?.username || null,
    type,
    caption: cutSafe(m.caption?.text, 300),
    // 캡션 뒤쪽 해시태그(#광고 등)가 300자 절단에 잘리기 전에 원문으로 판정한다
    commerceHint: commerceHintOf(m.caption?.text || ''),
    timestamp: m.taken_at ? new Date(m.taken_at * 1000).toISOString() : null,
    views: m.play_count ?? m.ig_play_count ?? m.view_count ?? null,
    likes: m.like_count ?? null,
    comments: m.comment_count ?? null,
    thumbSrc: pickThumb(m.image_versions2?.candidates),
  };
}

// 피드(GraphQL) 응답 한 건 → 같은 모양으로
function normalizeGraphPost(n, inputHandle) {
  if (!n || !n.shortcode) return null;
  const cap = n.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  const type = n.__typename === 'GraphSidecar' ? 'carousel'
    : n.__typename === 'GraphImage' ? 'image'
      : n.product_type === 'clips' ? 'reel' : 'video';
  return {
    shortcode: n.shortcode,
    url: `https://www.instagram.com/p/${n.shortcode}/`,
    owner: n.owner?.username || null,
    inputHandle: inputHandle || n.owner?.username || null,
    type,
    caption: cutSafe(cap, 300),
    commerceHint: commerceHintOf(cap),
    timestamp: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : null,
    views: n.video_view_count ?? null, // 사진·캐러셀은 조회수 비공개 → null
    likes: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count ?? null,
    comments: n.edge_media_to_comment?.count ?? null,
    thumbSrc: n.display_url || n.thumbnail_src || null,
  };
}

// ---------- 공개 헬퍼 ----------
const scProfile = async (handle, key) =>
  normalizeProfile(await sc(`/v1/instagram/profile?handle=${encodeURIComponent(handle)}`, key, `프로필 @${handle}`));

// 릴스 목록 — 한 요청(=1크레딧)에 12개씩 커서로 이어 받는다.
//   sinceMs 를 주면 '그 시각보다 오래된 릴스만 있는 페이지'가 나오는 순간 멈춘다(발굴용 절약).
//   maxPages 는 페이지(=크레딧) 상한.
async function scReels(handle, key, { limit = 30, sinceMs = null, maxPages = null } = {}) {
  const out = [];
  let cursor = null;
  const cap = maxPages ?? (sinceMs ? 4 : 20);
  for (let page = 0; page < cap; page++) {
    // ⚠️ 페이지네이션 파라미터는 max_id 다 (next_max_id 를 주면 첫 페이지만 반복된다)
    const q = `/v1/instagram/user/reels?handle=${encodeURIComponent(handle)}&amount=${limit}`
      + (cursor ? `&max_id=${encodeURIComponent(cursor)}` : '');
    let json;
    try {
      json = await sc(q, key, `릴스 @${handle} p${page + 1}`);
    } catch (e) {
      // 뒷페이지가 실패해도 앞에서 받은 건 살린다
      log(`  ⚠️ @${handle} p${page + 1} 포기 — 여기까지 ${out.length}건 유지: ${String(e.message).slice(0, 90)}`);
      break;
    }
    const items = json.items || json.data?.items || [];
    const posts = items.map((it) => normalizePost(it, handle)).filter(Boolean);
    const seen = new Set(out.map((p) => p.shortcode)); // 고정 게시물이 매 페이지 반복될 수 있다
    out.push(...posts.filter((p) => !seen.has(p.shortcode)));
    const prevCursor = cursor;
    cursor = json.paging_info?.max_id || null;
    const more = json.paging_info?.more_available;
    // 이 페이지가 '전부' 오래된 것일 때만 중단 (고정 게시물 하나에 멈추지 않게 every 로)
    if (sinceMs && posts.length && posts.every((p) => p.timestamp && new Date(p.timestamp).getTime() < sinceMs)) break;
    if (cursor && cursor === prevCursor) break; // 커서가 안 바뀌면 같은 페이지 반복 — 크레딧 낭비 방지
    if (!items.length || !cursor || more === false) break;
    if (!sinceMs && out.length >= limit) break;
  }
  return sinceMs ? out : out.slice(0, limit);
}

// 피드 게시물 — 릴스 엔드포인트에 안 나오는 사진·캐러셀을 줍는다(응답 모양이 다르다). 페이지당 1크레딧.
async function scPosts(handle, key, maxPages = 3) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const q = `/v1/instagram/user/posts?handle=${encodeURIComponent(handle)}&amount=12`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    let json;
    try { json = await sc(q, key, `게시물 @${handle} p${page + 1}`); }
    catch (e) { log(`  ⚠️ 게시물 @${handle} p${page + 1} 포기 — 여기까지 ${out.length}건 유지: ${String(e.message).slice(0, 90)}`); break; }
    const nodes = (json.posts || []).map((p) => p.node).filter(Boolean);
    const posts = nodes.map((n) => normalizeGraphPost(n, handle)).filter(Boolean);
    const seen = new Set(out.map((p) => p.shortcode));
    out.push(...posts.filter((p) => !seen.has(p.shortcode)));
    const prevCursor = cursor;
    cursor = json.cursor || null;
    if (!nodes.length || !cursor || cursor === prevCursor) break;
  }
  return out;
}

// 릴스 대본
async function scTranscript(url, key) {
  const json = await sc(`/v2/instagram/media/transcript?url=${encodeURIComponent(url)}`, key, '대본');
  return json.transcripts?.[0]?.text ?? json.transcript ?? json.text ?? null;
}

// 릴스의 영상 파일 URL (Gemini 분석 입력용).
// ⚠️ post 엔드포인트는 응답 구조가 릴스 목록과 다르다. 영상 URL 은 곧 만료되므로 분석 직전에 부른다.
async function scVideoUrl(url, key) {
  const json = await sc(`/v1/instagram/post?url=${encodeURIComponent(url)}`, key, `영상URL ${url.slice(-14)}`);
  const m = json.data?.xdt_shortcode_media || json.xdt_shortcode_media || json.data || {};
  return m.video_url || m.video_versions?.[0]?.url || null;
}

// ───────────────── 썸네일 ─────────────────
// 인스타 CDN 주소는 만료되므로 반드시 받아둔다. 축소는 하지 않는다(도구 의존성 0).
async function downloadThumb(srcUrl, name, force = false) {
  if (!srcUrl || !name) return null;
  const file = path.join(THUMBS, name);
  if (!force && fs.existsSync(file)) return `${THUMB_WEB}/${name}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000); // 죽은 CDN 주소에 무한 대기 방지
  try {
    fs.mkdirSync(THUMBS, { recursive: true });
    const res = await fetch(srcUrl, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return `${THUMB_WEB}/${name}`;
  } catch (e) {
    log(`  ⚠️ 썸네일 실패 ${name}: ${String(e.message).slice(0, 60)}`);
    return null;
  } finally { clearTimeout(to); }
}

// ───────────────── Gemini (분석 전부) ─────────────────
const G = 'https://generativelanguage.googleapis.com';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// 모델 응답에서 JSON 덩어리만 꺼낸다. 실패하면 원문 일부를 담아 돌려준다(파이프라인을 안 막는다).
const extractJson = (text) => {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : text); } catch { return { raw: String(text || '').slice(0, 500) }; }
};

async function downloadVideo(url, dest) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return false;
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return fs.statSync(dest).size > 1000;
  } catch { return false; } finally { clearTimeout(to); }
}

// 영상의 시각 요소 분석 프롬프트 — 발굴·내 계정 공용(객관적 관찰이라 같아도 된다)
const VISUAL_PROMPT = `이 릴스 영상의 시각적 요소를 구체적으로 분석해줘. 반드시 아래 JSON만 출력(코드블록·설명 금지):
{
 "초반3초훅": "첫 3초에 시선을 잡는 시각 장치(장면·자막·움직임)를 구체적으로",
 "컷편집": "컷 전환 빈도·속도감·리듬",
 "자막스타일": "색상·크기·위치·폰트·강조효과",
 "영상연출": "클로즈업·B롤·화면구성·비포애프터 등 눈에 띄는 연출",
 "인물": "표정·제스처·에너지 (있으면, 없으면 해당없음)"
}`;

// 영상 파일 → Gemini 시각분석(JSON). SDK 없이 업로드 + generateContent 두 번의 fetch.
async function geminiAnalyze(videoPath, gkey, prompt = VISUAL_PROMPT) {
  const bytes = fs.readFileSync(videoPath);
  // ① 업로드
  const up = await fetch(`${G}/upload/v1beta/files?key=${gkey}`, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Protocol': 'raw', 'X-Goog-Upload-Content-Type': 'video/mp4', 'Content-Type': 'video/mp4' },
    body: bytes,
  });
  const uj = await up.json();
  const file = uj.file;
  if (!file?.uri) throw new Error('Gemini 업로드 실패: ' + JSON.stringify(uj).slice(0, 140));
  try {
    // ② ACTIVE 될 때까지 대기 (영상 처리)
    let state = file.state;
    for (let i = 0; i < 30 && state !== 'ACTIVE'; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await (await fetch(`${G}/v1beta/${file.name}?key=${gkey}`)).json();
      state = s.state;
      if (state === 'FAILED') throw new Error('Gemini 영상 처리 실패');
    }
    // 아직 처리 중인 파일에 분석을 보내면 원인 모를 400 이 난다 → 60초에서 끊는다
    if (state !== 'ACTIVE') throw new Error(`Gemini 영상 처리 타임아웃 (state=${state}, 60초 초과)`);
    // ③ 분석
    const gen = await fetch(`${G}/v1beta/models/${MODEL}:generateContent?key=${gkey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ fileData: { mimeType: 'video/mp4', fileUri: file.uri } }, { text: prompt }] }] }),
    });
    const gj = await gen.json();
    // HTTP 오류를 빈 응답으로 삼키면 쓰레기 분석이 'analyzed' 로 영구 저장된다
    if (!gen.ok) throw new Error(`Gemini 분석 HTTP ${gen.status}: ${(gj.error?.message || '').slice(0, 80)}`);
    return extractJson(gj.candidates?.[0]?.content?.parts?.[0]?.text || '');
  } finally {
    try { await fetch(`${G}/v1beta/${file.name}?key=${gkey}`, { method: 'DELETE' }); } catch { /* 48시간 뒤 자동 삭제되므로 실패해도 무방 */ }
  }
}

// 텍스트 프롬프트 → Gemini. 기본은 JSON 으로 파싱해 돌려주고,
// json:false 면 원문 그대로 돌려준다(채널 정체성처럼 줄글이 필요한 경우). 3회까지 재시도.
async function geminiText(prompt, gkey, { json = true, system = null } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 90000);
    try {
      const body = { contents: [{ parts: [{ text: prompt }] }] };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const r = await fetch(`${G}/v1beta/models/${MODEL}:generateContent?key=${gkey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!txt.trim()) throw new Error('빈 응답');
      return json ? extractJson(txt) : txt.trim();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 2000)); // 429 폭탄 방지 백오프
    } finally { clearTimeout(to); }
  }
  throw lastErr;
}

// ───────────────── 자주 쓰는 잡동사니 ─────────────────
// 한국 날짜 — 새벽 크론이 UTC 로 찍으면 하루 밀린 라벨이 붙는다
const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const pad3 = (n) => `${n}`.padStart(3, '0');
const median = (nums) => {
  const v = nums.filter((n) => typeof n === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
// 상한 환경변수 읽기 — 비었으면 기본값, 오타(NaN)면 0(전량 과금보다 안전)
const limitOf = (name, def) => (process.env[name] === undefined || process.env[name] === ''
  ? def : Math.max(0, Number(process.env[name]) || 0));

// ───────────────── 봇 파일 공통 규칙 ─────────────────
// 카드번호 부여 — 기존 번호는 절대 안 바뀌고, 새 항목만 오래된 순으로 이어 붙인다.
// 번호를 재사용하면 "M-012 로 기획해줘"가 다른 영상을 가리키는 사고가 난다.
// 돌려주는 next 는 '다음에 쓸 번호'.
function assignCardNumbers(items, prefix, next, prevMap = {}) {
  for (const it of items) if (!it.cardNo && prevMap[it.shortcode]) it.cardNo = prevMap[it.shortcode];
  const fresh = items.filter((i) => !i.cardNo)
    .sort((a, b) => Date.parse(a.timestamp || a.takenAt || 0) - Date.parse(b.timestamp || b.takenAt || 0));
  for (const it of fresh) it.cardNo = `${prefix}-${pad3(next++)}`;
  return { next, added: fresh.length };
}

// 품질 게이트 — 새 수집이 기존(실데이터)의 절반 미만이면 기존 파일을 지킨다.
// 스크래퍼 장애로 0건이 온 날 대시보드가 통째로 비는 사고를 막는다.
// ⚠️ prevCount 는 '실데이터' 기준이어야 한다. 더미를 기존으로 세면 릴스 몇 개뿐인 실계정이 통째로 거부된다.
// ⚠️ 0건 자체는 여기서 막지 않는다 — 사진·캐러셀만 올리는 계정이 있고, 호출부가 안내 문구로 처리한다.
function qualityGate(newCount, prevCount) {
  if (prevCount > 0 && newCount < prevCount / 2) {
    return { ok: false, reason: `새 수집 ${newCount}건이 기존 ${prevCount}건의 절반 미만` };
  }
  return { ok: true, reason: null };
}

// 스냅샷 한 줄 밀어넣기 — 같은 날짜면 교체(하루 한 점), 아니면 추가. 항상 날짜 오름차순.
function upsertSnapshot(list, snap) {
  const i = list.findIndex((s) => s.date === snap.date);
  if (i >= 0) list[i] = snap; else list.push(snap);
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return list;
}

module.exports = {
  ROOT, DATA_DIR, THUMBS, THUMB_WEB, MODEL,
  parseEnv, loadEnv, log, notice, needKey,
  readJson, writeJson, dataPath,
  isDemo, freshIfDemo, clearDemoThumbs,
  assignCardNumbers, qualityGate, upsertSnapshot,
  sc, getCredits, scProfile, scReels, scPosts, scTranscript, scVideoUrl,
  normalizeProfile, normalizePost, normalizeGraphPost,
  commerceHintOf, cutSafe, avgViews, downloadThumb, pickThumb,
  VISUAL_PROMPT, extractJson, downloadVideo, geminiAnalyze, geminiText,
  todayKST, pad3, median, limitOf,
};
