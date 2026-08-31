'use strict';
// 크리에이터 대시보드 — data/*.json 4개를 읽어 화면을 그린다.
// 서버·DB·로그인 없음. 읽기 전용이라 화면에서 저장하는 버튼이 하나도 없다.
// 데이터를 바꾸는 일은 전부 Claude Code 에게 말로 시킨다 (설정 탭 안내 참조).
//
// 파일 4개, 주인이 다르다
//   data/settings.json    사람(Claude Code)이 고침 — handle · brief · pillars · sources · minViews · overrides · commerceOverrides · hidden
//   data/posts.json       봇(collect.js·snapshot.js) — my.profile · my.posts[] · snapshots[] · updatedAt · creditsRemaining
//   data/discoveries.json 봇(discover.js·analyze.js) — items[] · sourceState · nextR · updatedAt
//   data/analysis.json    봇(classify.js·coach.js)  — pillars{sc:기둥} · coaching{sc:{video_analysis, analysis, analyzed_at}}

const S = {
  settings: null, posts: null, disc: null, analysis: null,
  // 내 계정 라이브러리 필터
  F: { q: '', fmt: 'all', pillar: 'all', lens: 'views', view: 'gallery', commerce: 'all' },
  // 레퍼런스 탭 필터
  D: { q: '', commerce: 'all', views: 'thr', thr: null, editThr: false },
  T: { metric: 'followers' },      // 추이 카드 렌즈
  P: null,                          // 기둥 도넛 기간 (YYYY-MM | 'all')
  _donutSelected: null,
  _libShow: 0,
  _lensOpen: false,
  _pillarOpen: false,
};

const PILLAR_FALLBACK = '미분류';
const PILLAR_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'];
// 성과 판정 기준 — 설정 파일 없이 돌게 상수로 고정
const TH = { viral: 2, under: 0.5, pillarTolerancePp: 10 };
// 발굴 기준 조회수 기본값 — settings.json 에 minViews 가 없을 때 쓰는 단 하나의 출처.
// (기본값을 여러 곳에 흩어 적으면 화면마다 다른 숫자가 보인다)
const DEFAULT_MIN_VIEWS = 100000;

// ── 값 안전화 3종 ──────────────────────────────────────────
// data/*.json 은 봇이 긁어온 남의 캡션·핸들이 섞인 파일이다. 화면 문자열로 조립되기 전에 반드시 통과시킨다.
// href 안전화 — javascript: 등 위험 scheme 차단. http(s)만 통과, 아니면 무해한 '#'.
const safeHref = (u) => { const s = String(u || '').trim(); return /^https?:\/\//i.test(s) ? s : '#'; };
// 이미지 주소 — http(s) 또는 프로젝트 안 상대경로만. 그 밖(javascript:, data: 등)은 빈 값 → 대체 아이콘.
const safeImg = (u) => {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) || /^(\.?\/)?[\w.-]+(\/[\w.%-]+)*\.(jpe?g|png|webp|gif|svg)$/i.test(s) ? s : '';
};
// CSS url() 안에 들어갈 값 — 따옴표·괄호·역슬래시·세미콜론·공백이 있으면 통째로 버린다.
// (url(...) 를 닫고 뒤에 다른 CSS 선언을 붙이는 스타일 주입 차단)
const cssUrl = (u) => {
  const s = safeImg(u);
  return /["'()\\;\s]/.test(s) ? '' : s;
};
// 인스타 shortcode — 임베드 주소에 끼우기 전 형식 검증. 경로 탈출(/, ?, #) 차단.
const safeShortcode = (s) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(s || '')) ? String(s) : '');

// ───────────────────────── 공용 계산 ─────────────────────────
const myPosts = () => S.posts.my.posts || [];
const snapshots = () => S.posts.snapshots || [];
// 중앙값 — 대박작 몇 개가 평균을 끌어올려 왜곡되므로 "보통 게시물" 기준은 중앙값으로 판단
const median = (arr) => {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const baseViews = () => median(myPosts().map((p) => p.views)) || 1;
const pillarNames = () => (S.settings.pillars || []).map((p) => p.name);
const pillarColor = (name) => {
  const i = pillarNames().indexOf(name);
  return i >= 0 ? PILLAR_COLORS[i % PILLAR_COLORS.length] : '#9CA3AF';
};
// 기둥 3단 우선순위: settings.overrides → analysis.pillars → 미분류
function pillarOf(post) {
  const o = (S.settings.overrides || {})[post.shortcode];
  // 수동 교정이 현재 기둥 목록에 없으면(기둥을 지운 뒤) 자동 분류로 폴백 — 게시물이 화면에서 사라지지 않게
  if (o && (o === PILLAR_FALLBACK || pillarNames().includes(o))) return o;
  return (S.analysis.pillars || {})[post.shortcode] || PILLAR_FALLBACK;
}

// ── 상업성 3단 우선순위: settings.commerceOverrides → commerceHint → 정규식 ──
// ⚠️ 규칙을 바꾸면 scripts/lib.js 의 commerceHintOf 규칙도 같이 바꿀 것 (원문 캡션 기준 판정용 사본)
const COMMERCE_AD = /#\s?(광고|협찬)|#AD\b|유료\s*광고|제작\s*지원|협찬\s*받|제공\s*받|paid\s*partnership/i;
const COMMERCE_SELL = /공구|공동\s*구매|스마트\s*스토어|프로필\s*링크|구매\s*링크|와디즈|펀딩|마감\s*임박/;
const COMMERCE_BADGE = { '공구': '🛒', '광고': '📢' };
// 배지 조회는 반드시 이 함수로 — 맵에 없는 값(직접 적어 넣은 분류 등)이면 화면에 'undefined' 가
// 찍히거나 Object.prototype 의 것이 튀어나온다. 모르는 분류는 중립 배지로 받는다.
const commerceBadge = (v) => (Object.prototype.hasOwnProperty.call(COMMERCE_BADGE, v) ? COMMERCE_BADGE[v] : '🏷');
function commerceOf(x) {
  const o = (S.settings.commerceOverrides || {})[x.shortcode];
  if (o) return o === '일반' ? null : o;   // 사람이 고친 건 안 뒤집는다
  // 수집 때 원문 캡션으로 판정한 힌트가 다음 순위 — 화면 캡션은 절단본이라
  // 뒤쪽 #광고 태그를 놓치고 앞쪽 '공구' 단어에 오판할 수 있다
  if (x.commerceHint) return x.commerceHint;
  const cap = x.caption || '';
  if (COMMERCE_AD.test(cap)) return '광고';
  if (COMMERCE_SELL.test(cap)) return '공구';
  return null;
}

// 게시 시점 팔로워 수 — 게시일 이전의 가장 가까운 스냅샷 (그보다 옛 게시물은 첫 스냅샷으로 근사)
function followersAt(ts) {
  const sn = snapshots();
  if (!sn.length) return null;
  const d = String(ts).slice(0, 10);
  let best = null;
  for (const s of sn) { if (s.date <= d) best = s; else break; }
  return (best || sn[0]).my?.followers ?? null;
}
const engageOf = (p) => (p.views ? ((p.likes || 0) + (p.comments || 0)) / p.views : null); // 반응률
const spreadOf = (p) => { const f = followersAt(p.timestamp); return p.views && f ? p.views / f : null; }; // 평소대비 성과

const cardDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
// 카드 고유번호 배지 — 누르면 복사. Claude Code 에서 "R-001 참고해서 기획해줘"로 쓰는 참조번호.
function cardNoHtml(no, big) {
  if (!no) return '';
  const safe = U.esc(no);
  return `<span class="cnum${big ? ' big' : ''}" data-cardno="${safe}" title="카드 번호 — 누르면 복사돼요">#${safe}</span>`;
}

// ── 분석 필드 렌더 공용 부품 (발굴 모달 + 게시물 코칭 모달이 함께 사용) ──
// 나열 텍스트 분리: ①②③ 또는 "1. 2. 3." 형식 → 항목 배열
function splitPoints(text) {
  if (!text) return [];
  if (/[①-⑳]/.test(text)) return text.split(/[①-⑳]/).map((s) => s.trim()).filter((s) => s.length > 0);
  const parts = text.split(/\d+\.\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length >= 2 ? parts : [];
}
// 필드 렌더: 배열이거나 나열이면 <ul><li>, 아니면 단락
function renderField(text) {
  if (!text) return '';
  if (Array.isArray(text)) return '<ul class="dm-field-list">' + text.map((p) => '<li>' + U.esc(String(p)) + '</li>').join('') + '</ul>';
  const pts = splitPoints(String(text));
  if (pts.length >= 2) return '<ul class="dm-field-list">' + pts.map((p) => '<li>' + U.esc(p) + '</li>').join('') + '</ul>';
  return '<div class="dm-field-body">' + U.esc(String(text)) + '</div>';
}

// ───────────────────────── 부트 ─────────────────────────
async function boot() {
  const [settings, posts, disc, analysis] = await Promise.all([
    U.json('data/settings.json'),
    U.json('data/posts.json'),
    U.json('data/discoveries.json'),
    U.json('data/analysis.json'),
  ]);
  const bn = document.getElementById('bootNote');
  // 모달 닫기 배선은 렌더보다 먼저 — 렌더가 실패해도 열린 모달에 갇히지 않게
  wireModal();
  wireCardNoCopy();

  if (!settings || !posts || !posts.my) {
    if (bn) bn.innerHTML = '⚠️ data 폴더의 JSON을 읽지 못했어요.<br>파일을 브라우저로 직접 열면 막힙니다 — Claude에게 <b>"대시보드 열어줘"</b>라고 말씀해 주세요 (node scripts/serve.js).';
    return;
  }
  S.settings = Object.assign({ pillars: [], sources: [], overrides: {}, commerceOverrides: {}, hidden: [], minViews: DEFAULT_MIN_VIEWS }, settings);
  S.posts = posts;
  S.disc = disc || { items: [] };
  S.analysis = analysis || { pillars: {}, coaching: {} };
  S.posts.snapshots = (posts.snapshots || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // 렌더 중 예외가 나도 백지로 두지 않는다 — 안내 문구를 남기고 콘솔에 원인을 찍는다.
  // (안내를 지우는 건 렌더가 끝까지 성공한 뒤)
  try {
    renderAll();
    route();
    if (bn) bn.remove();
  } catch (e) {
    console.error('[대시보드] 화면을 그리다 멈췄어요', e);
    if (bn) {
      bn.innerHTML = '⚠️ 데이터는 읽었지만 화면을 그리다 멈췄어요.<br>' +
        'data 폴더의 JSON 형식이 어긋났을 수 있어요 — Claude에게 <b>"대시보드가 안 떠"</b>라고 말씀해 주세요.<br>' +
        `<span style="font-size:12px;opacity:.7">${U.esc(e && e.message ? e.message : String(e))}</span>`;
    }
  }
  window.addEventListener('hashchange', route);
}

// 모달 닫기 3경로 — 배경 클릭 · ✕ 버튼 · Esc
function wireModal() {
  const m = document.getElementById('modal');
  if (m) m.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  const x = document.getElementById('modalClose');
  if (x) x.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// 모달 닫기 — 내용(임베드 iframe 포함)을 비워 재생·소리를 확실히 정지
function closeModal() {
  document.getElementById('modal').classList.remove('on');
  document.getElementById('modalContent').innerHTML = '';
}

// 카드 번호 배지 클릭 → 클립보드 복사. 배지가 여러 곳에 innerHTML 로 꽂히므로 위임 핸들러 하나로 처리.
function wireCardNoCopy() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('.cnum') : null;
    if (!b) return;
    e.stopPropagation();
    const no = b.dataset.cardno;
    if (!no || !navigator.clipboard) return;
    navigator.clipboard.writeText(no);
    b.textContent = '복사됨 ✓';
    setTimeout(() => { b.textContent = '#' + no; }, 900);
  });
}

function renderAll() {
  renderTopbar(); renderProfileHeader(); renderPillarPeriod(); renderDonut();
  renderTrendControls(); renderTrend();
  renderLibraryControls(); renderLibrary();
  renderDiscover(); renderSettings();
}

// 탭 전환 — 화이트리스트에 없는 해시(#nope, 옛 북마크)로 들어와도 첫 탭으로 떨어진다.
// (폴백이 없으면 모든 view 가 꺼져 화면이 통째로 백지가 된다)
const VIEWS = ['home', 'refs', 'settings'];
function route() {
  const hash = (location.hash || '#home').slice(1);
  const cur = VIEWS.includes(hash) ? hash : VIEWS[0];
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + cur));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
}

// ───────────────────────── 상단바 ─────────────────────────
function renderTopbar() {
  const h = S.posts.my.profile?.handle || S.settings.handle || '';
  document.getElementById('hello').textContent = `안녕하세요, @${h} 님 👋`;
  const snaps = snapshots();
  const snapLast = snaps.length ? snaps[snaps.length - 1].date : null;
  const dOnly = (s) => { const p = String(s).split('-'); return `${+p[1]}월 ${+p[2]}일`; };
  document.getElementById('updated').textContent =
    `게시물 수집 · ${U.dateKo(S.posts.updatedAt)}` + (snapLast ? `   ·   팔로워 ${dOnly(snapLast)}까지 (매일 자동)` : '');
}

// ───────────────────────── 프로필 헤더 ─────────────────────────
function renderProfileHeader() {
  const p = S.posts.my.profile || {};
  // 매일 갱신되는 최신 스냅샷이 있으면 팔로워·게시물·팔로우를 현재값으로 덮어쓴다
  // (게시물 전체 수집은 주 1회라 profile 값은 옛날값일 수 있음)
  const snaps = snapshots();
  const lastMy = snaps.length ? snaps[snaps.length - 1].my : null;
  const followers = lastMy?.followers ?? p.followers;
  const postsCount = lastMy?.postsCount ?? p.postsCount;
  const following = lastMy?.following ?? p.following;
  const posts = myPosts();
  const totalViews = posts.reduce((s, x) => s + (x.views || 0), 0);
  const best = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const link = (p.externalUrl || '').replace(/^https?:\/\//, '');
  const avatar = safeImg(p.avatar);
  document.getElementById('profileHeader').innerHTML =
    (avatar ? `<img class="ph-avatar" src="${U.esc(avatar)}" alt="">` : '<div class="ph-noav">🙂</div>') +
    `<div class="ph-info">
      <div class="ph-top"><span class="ph-handle">@${U.esc(p.handle || S.settings.handle || '')}</span>${p.verified ? '<span class="ph-verified">✔</span>' : ''}</div>
      <div class="ph-name">${U.esc(p.fullName || '')}</div>
      <div class="ph-stats">
        <span class="ph-stat"><b>${U.fmt(postsCount)}</b><span>게시물</span></span>
        <span class="ph-stat" title="정확한 팔로워 수"><b>${U.num(followers)}</b><span>팔로워</span></span>
        <span class="ph-stat"><b>${U.fmt(following)}</b><span>팔로우</span></span>
      </div>
      ${p.biography ? `<div class="ph-bio">${U.esc(p.biography)}</div>` : ''}
      ${link ? `<a class="ph-link" href="${U.esc(safeHref(p.externalUrl))}" target="_blank" rel="noopener">🔗 ${U.esc(link)}</a>` : ''}
      <div class="ph-extra">총 조회수 <b>${U.fmt(totalViews)}</b> · 역대 최고 <b>${U.fmt(best?.views)}</b> · 수집 게시물 ${posts.length}개</div>
    </div>`;
}

// ───────────────────────── 콘텐츠 기둥 도넛 ─────────────────────────
function pillarPeriodList() {
  // 전체(가장 넓음) → 오래된 달 → 최신 달 순. 왼쪽 화살표=과거, 오른쪽=최신
  const months = [...new Set(myPosts().map((p) => String(p.timestamp).slice(0, 7)))].sort();
  const thisM = new Date().toISOString().slice(0, 7);
  const label = (m) => (m === thisM ? `이번 달 (${Number(m.slice(5))}월)` : `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`);
  return [{ value: 'all', label: '전체 기간' }, ...months.map((m) => ({ value: m, label: label(m) }))];
}

function renderPillarPeriod() {
  const list = pillarPeriodList();
  let idx = list.findIndex((o) => o.value === S.P);
  if (idx < 0) { idx = 0; S.P = list[idx].value; } // 기본: 전체 기간 (수업 첫 화면에 게시물이 다 보이게. 2026-08-31)
  document.getElementById('pillarPeriodLabel').textContent = list[idx].label;
  const prev = document.getElementById('pillarPrev'), next = document.getElementById('pillarNext');
  prev.disabled = idx <= 0;
  next.disabled = idx >= list.length - 1;
  prev.onclick = () => { S.P = list[idx - 1].value; renderPillarPeriod(); renderDonut(); };
  next.onclick = () => { S.P = list[idx + 1].value; renderPillarPeriod(); renderDonut(); };
}

function renderDonutCards(posts) {
  const el = document.getElementById('donutCards');
  if (!el) return;
  const sel = S._donutSelected;
  if (!sel) { el.innerHTML = ''; return; }
  const filtered = posts.filter((p) => pillarOf(p) === sel);
  el.innerHTML = '';
  const hd = U.el('div', { class: 'dp-header' });
  hd.innerHTML = `<span class="dp-swatch" style="background:${pillarColor(sel)}"></span><b>${U.esc(sel)}</b><span class="dp-count">${filtered.length}개</span>`;
  const closeBtn = U.el('button', { class: 'dp-close', title: '닫기' }, '✕');
  closeBtn.addEventListener('click', () => { S._donutSelected = null; renderDonutCards(posts); });
  hd.appendChild(closeBtn);
  el.appendChild(hd);
  if (!filtered.length) {
    el.appendChild(U.el('div', { class: 'empty-note', style: 'margin-top:8px' }, '이 기간에 해당 기둥 게시물이 없어요.'));
    return;
  }
  const grid = U.el('div', { class: 'dp-grid' });
  for (const p of filtered) {
    const card = U.el('div', { class: 'dp-pcard', style: 'cursor:pointer', title: (p.caption || '').split('\n')[0] });
    card.addEventListener('click', () => openPostModal(p));
    const th = safeImg(p.thumb);
    card.innerHTML =
      (th ? `<img src="${U.esc(th)}" loading="lazy" alt="">` : '<div class="dp-noimg">🎬</div>') +
      `<div class="dp-body"><div class="dp-views">${U.fmt(p.views)}</div><div class="dp-cap">${U.esc((p.caption || '').split('\n')[0].slice(0, 30))}</div></div>`;
    grid.appendChild(card);
  }
  el.appendChild(grid);
}

function renderDonut() {
  const all = myPosts();
  const posts = S.P === 'all' ? all : all.filter((p) => String(p.timestamp).slice(0, 7) === S.P);
  const counts = {};
  for (const p of posts) counts[pillarOf(p)] = (counts[pillarOf(p)] || 0) + 1;

  const names = [...pillarNames(), PILLAR_FALLBACK];
  const segments = names.filter((n) => counts[n]).map((n) => ({ label: n, value: counts[n], color: pillarColor(n) }));

  C.donut(document.getElementById('donutSvg'), segments, String(posts.length),
    S.P === 'all' ? '전체 게시물' : '게시물',
    { onSegmentClick: (label) => { S._donutSelected = S._donutSelected === label ? null : label; renderDonutCards(posts); } });

  // 기둥별 평균 조회수 (성과) — 개수 비율과 별개로 "어느 기둥이 잘 되나"
  const avgByPillar = {};
  for (const name of pillarNames()) {
    const arr = posts.filter((p) => pillarOf(p) === name && p.views != null);
    avgByPillar[name] = arr.length ? Math.round(arr.reduce((s, p) => s + p.views, 0) / arr.length) : null;
  }
  const bestPillar = Object.entries(avgByPillar).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0];

  // 범례 = 미니 바 리스트 — 개수 비율 바 + 평균 조회수. 0개 기둥은 흐리게.
  const legend = document.getElementById('donutLegend');
  legend.innerHTML = '';
  const total = posts.length || 1;
  const classified = posts.some((p) => pillarOf(p) !== PILLAR_FALLBACK);
  const rows = (S.settings.pillars || []).map((p) => ({
    name: p.name, n: counts[p.name] || 0, target: p.targetPercent || 0,
    pct: ((counts[p.name] || 0) / total) * 100, avg: avgByPillar[p.name],
  })).sort((a, b) => b.n - a.n);
  for (const r of rows) {
    const showWarn = classified && r.n > 0 && Math.abs(r.pct - r.target) > TH.pillarTolerancePp;
    const isBest = bestPillar && bestPillar[0] === r.name && r.n > 0;
    legend.appendChild(U.el('div', { class: 'dl-row' + (r.n === 0 ? ' dim' : ''), title: `${r.name}: ${r.n}개 · 개수비율 ${r.pct.toFixed(0)}% · 목표 ${r.target}%` },
      `<span class="dl-sw" style="background:${pillarColor(r.name)}"></span>` +
      `<span class="dl-nm">${U.esc(r.name)}${showWarn ? ' <span class="gap-dot" title="목표와 10%p 이상 차이"></span>' : ''}${isBest ? ' 🏆' : ''}</span>` +
      `<span class="dl-track"><span class="dl-fill" style="width:${Math.min(100, r.pct).toFixed(0)}%;background:${pillarColor(r.name)}"></span></span>` +
      `<span class="dl-stat">${r.n}개 · ${classified && r.n ? r.pct.toFixed(0) + '%' : '—'} · 평균 ${U.fmt(r.avg)}</span>`));
  }
  if (counts[PILLAR_FALLBACK]) {
    legend.appendChild(U.el('div', { class: 'dl-row' },
      '<span class="dl-sw" style="background:#9CA3AF"></span><span class="dl-nm">미분류</span>' +
      `<span class="dl-track"></span><span class="dl-stat">${counts[PILLAR_FALLBACK]}개 · Claude에게 "기둥 다시 분류해줘"</span>`));
  }
  // 성과 콜아웃 — 개수와 성과의 괴리를 짚어준다
  const co = document.getElementById('pillarCallout');
  if (co) {
    if (bestPillar) {
      const bName = bestPillar[0], bCount = counts[bName] || 0;
      const bShare = ((bCount / total) * 100).toFixed(0);
      const target = (S.settings.pillars.find((p) => p.name === bName)?.targetPercent || 0) / 100;
      co.innerHTML = `🏆 성과 1위 기둥은 <b>${U.esc(bName)}</b> (평균 ${U.fmt(bestPillar[1])})` +
        (bCount / total < target ? ` — 개수는 ${bShare}%뿐이에요. <b>더 만들 여지</b>가 있어요.` : ` — 개수 비중도 ${bShare}%로 잘 밀고 있어요.`);
      co.style.display = 'block';
    } else co.style.display = 'none';
  }
  renderDonutCards(posts);
}

// ───────────────────────── 추이 카드 ─────────────────────────
const METRICS = [
  { key: 'followers', label: '팔로워 증가' },
  { key: 'uploads', label: '업로드 리듬' },
];

function renderTrendControls() {
  const m = document.getElementById('trendMetric');
  m.innerHTML = '';
  for (const x of METRICS) m.appendChild(U.el('button', {
    class: 'chip' + (S.T.metric === x.key ? ' on' : ''),
    onclick: () => { S.T.metric = x.key; renderTrendControls(); renderTrend(); },
  }, x.label));
}

// 업로드 리듬 — 최근 4개월을 월별로 묶고, 각 월 안에서 주차별 막대 + 월 합계
function renderUploadRhythm(posts) {
  const root = document.getElementById('trend');
  root.querySelectorAll('svg,.empty-note,.upload-rhythm').forEach((e) => e.remove());
  document.getElementById('trendDesc').textContent = '업로드 리듬 — 월별로 묶은 주차별 게시물 수 (얼마나 꾸준히 올리나)';

  const MONTHS = 4;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  // 해당 날짜가 그 달의 몇 번째 주인지 (1-based, 월요일 시작)
  const weekOfMonth = (d) => {
    const firstMon = new Date(d.getFullYear(), d.getMonth(), 1);
    firstMon.setDate(firstMon.getDate() - ((firstMon.getDay() + 6) % 7));
    return Math.floor((d.getTime() - firstMon.getTime()) / (7 * 86400e3)) + 1;
  };

  const months = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 1), weeks: {}, total: 0 });
  }
  for (const p of posts) {
    if (!p.timestamp) continue;
    const t = new Date(p.timestamp);
    const mb = months.find((mo) => t >= mo.from && t < mo.to);
    if (!mb) continue;
    const wn = weekOfMonth(t);
    mb.weeks[wn] = (mb.weeks[wn] || 0) + 1;
    mb.total++;
  }
  let maxW = 1;
  for (const mo of months) for (const k in mo.weeks) maxW = Math.max(maxW, mo.weeks[k]);

  const wrap = U.el('div', { class: 'upload-rhythm' });
  for (const mo of months) {
    const monthEl = U.el('div', { class: 'ur-month' });
    const yprefix = mo.y === now.getFullYear() ? '' : `'${String(mo.y).slice(2)} `;
    const head = U.el('div', { class: 'ur-mhead' });
    head.innerHTML = `<span class="ur-mname">${yprefix}${mo.m + 1}월</span><span class="ur-mtotal">총 ${mo.total}개</span>`;
    monthEl.appendChild(head);
    let lastWeek = 4;
    for (const k in mo.weeks) lastWeek = Math.max(lastWeek, +k);
    const weeksEl = U.el('div', { class: 'ur-weeks' });
    for (let w = 1; w <= lastWeek; w++) {
      const c = mo.weeks[w] || 0;
      const pct = Math.round((c / maxW) * 100);
      const rowEl = U.el('div', { class: 'ur-wrow' });
      rowEl.innerHTML =
        `<span class="ur-wlabel">${mo.m + 1}월 ${w}주</span>` +
        `<span class="ur-track"><span class="ur-bar" style="width:${pct}%${c === 0 ? ';opacity:.25' : ''}"></span></span>` +
        `<span class="ur-wval">${c}</span>`;
      weeksEl.appendChild(rowEl);
    }
    monthEl.appendChild(weeksEl);
    wrap.appendChild(monthEl);
  }
  root.appendChild(wrap);
}

function renderTrend() {
  const root = document.getElementById('trend');
  const tipEl = document.getElementById('trendTip');
  const descEl = document.getElementById('trendDesc');
  // 모드 전환 시 이전에 그린 것을 항상 정리
  root.querySelectorAll('svg,.empty-note,.upload-rhythm').forEach((e) => e.remove());

  if (S.T.metric === 'uploads') { renderUploadRhythm(myPosts()); return; }

  // 차트에는 유한한 숫자만 넘긴다 — JSON 이 문자열/NaN 을 물고 와도 좌표와 툴팁이 깨지지 않게
  const pts = snapshots().map((s) => ({ t: Date.parse(s.date), v: Number(s.my?.followers) }))
    .filter((pt) => Number.isFinite(pt.t) && Number.isFinite(pt.v))
    .map((pt) => ({ ...pt, abs: pt.v }));
  if (pts.length < 2) {
    root.appendChild(U.el('div', { class: 'empty-note' }, '팔로워 추이는 스냅샷이 2개 이상 쌓이면 그려집니다 — 매일 아침 자동 수집 중'));
    descEl.textContent = '내 계정 팔로워 추이 — 매일 스냅샷 기반';
    return;
  }
  const first = pts[0].v;
  const last = pts[pts.length - 1].v;
  const delta = last - first;
  const dStr = delta == null ? '—' : (delta >= 0 ? `+${delta.toLocaleString('ko-KR')}` : delta.toLocaleString('ko-KR'));
  // 숫자만 던지지 않는다 — 판정 한 마디를 붙인다
  const pct = (delta != null && last) ? (delta / last) * 100 : null;
  const judge = pct == null ? ''
    : Math.abs(pct) < 0.3 ? `전체의 ${Math.abs(pct).toFixed(2)}% — 일상적인 변동 범위예요`
      : pct > 0 ? `전체의 ${pct.toFixed(1)}% 증가 — 좋은 흐름이에요`
        : `전체의 ${Math.abs(pct).toFixed(1)}% 감소 — 최근 콘텐츠를 점검해볼 신호예요`;
  descEl.innerHTML =
    `내 계정 팔로워 <b>${U.num(last)}</b>명` +
    `<span class="fl-delta ${(delta ?? 0) >= 0 ? 'up' : 'dn'}" style="margin-left:8px">${dStr}</span>` +
    `<span style="font-size:11.5px;color:var(--muted);margin-left:6px">기간 증감${judge ? ' · ' + judge : ''}</span>`;
  // 시작점 기준 증감을 그린다(abs 는 툴팁용). minSpanRatio 로 미세 증감이 절벽처럼 보이는 왜곡 방지
  const base = pts[0].v;
  C.line(root, tipEl, pts.map((p) => ({ ...p, v: p.v - base, dv: p.v - base })), {
    fmt: (v) => (v >= 0 ? '+' : '') + Math.round(v).toLocaleString('ko-KR'),
    minSpanRatio: 0.001,
  });
}

// ───────────────────────── 라이브러리 ─────────────────────────
// 렌즈 = 게시물을 어떤 지표로 줄 세울지. 같은 게시물이 렌즈마다 순위가 뒤집히는 걸 보는 게 핵심.
const LENSES = [
  { key: 'views', label: '조회수', col: 'views', get: (p) => p.views },
  { key: 'engage', label: '반응률', get: engageOf },
  { key: 'spread', label: '평소대비 성과', get: spreadOf },
  { key: 'comments', label: '댓글', col: 'comments', get: (p) => p.comments },
  { key: 'date', label: '최신순', get: (p) => new Date(p.timestamp).getTime() },
];
const LENS_TIPS = {
  views: '조회수 순 정렬',
  engage: '반응률 = (좋아요+댓글) ÷ 조회수 — 본 사람 중 반응한 비율',
  spread: '평소대비 성과 = 조회수 ÷ 게시 당시 팔로워 — 그 시점 계정 규모 대비 얼마나 퍼졌나',
  comments: '댓글 수 순 정렬',
  date: '최신 게시물부터',
};
const lensDef = (k) => LENSES.find((l) => l.key === k) || LENSES[0];
function lensFmt(lens, v) {
  if (v == null) return '—';
  if (lens.key === 'engage') return (v * 100).toFixed(1) + '%';
  if (lens.key === 'spread') return '×' + (v >= 10 ? Math.round(v) : v.toFixed(1));
  return U.fmt(v);
}
const FMT_LABELS = { reel: '릴스', carousel: '캐러셀', image: '이미지', video: '동영상' };
// 모르는 포맷은 원문 그대로 보여주되 반드시 이스케이프해서 — 수집기가 새 타입을 물고 와도 안전하게
const fmtLabel = (t) => U.esc(Object.prototype.hasOwnProperty.call(FMT_LABELS, t) ? FMT_LABELS[t] : (t || '기타'));

// 성과 등급 — ×NN 대신 직관적 라벨. 보통(중앙값) 대비 배수 기준.
function tierOf(ratio) {
  if (ratio == null) return null;
  if (ratio >= 15) return { label: '🔥 초대박', cls: 't-mega' };
  if (ratio >= 5) return { label: '대박', cls: 't-big' };
  if (ratio >= 1.5) return { label: '잘됨', cls: 't-good' };
  if (ratio >= 0.6) return { label: '보통', cls: 't-mid' };
  return { label: '저조', cls: 't-low' };
}

function renderLibraryControls() {
  const posts = myPosts();

  // KPI 스트립 3개 — 필터와 무관한 전체 요약. 산만한 첫인상 대신 "요약 먼저".
  const kroot = document.getElementById('libKpis');
  if (kroot) {
    const reels = posts.filter((p) => p.type === 'reel' && p.views != null);
    const avgV = reels.length ? Math.round(reels.reduce((s, p) => s + p.views, 0) / reels.length) : null;
    const es = posts.map(engageOf).filter((v) => v != null);
    const avgE = es.length ? es.reduce((s, v) => s + v, 0) / es.length : null;
    kroot.innerHTML =
      `<div class="k"><b>${posts.length}개</b><span>전체 콘텐츠</span></div>` +
      `<div class="k"><b>${avgV != null ? U.fmt(avgV) : '—'}</b><span>평균 조회수 · 릴스</span></div>` +
      `<div class="k"><b>${avgE != null ? (avgE * 100).toFixed(1) + '%' : '—'}</b><span>평균 반응률</span></div>`;
  }

  // 정렬 렌즈 — 기본은 접혀 있고 버튼을 누르면 옆으로 펼쳐진다
  const lensRoot = document.getElementById('lensChips');
  lensRoot.innerHTML = '';
  for (const l of LENSES) {
    lensRoot.appendChild(U.el('button', {
      class: 'chip lens' + (S.F.lens === l.key ? ' on' : ''),
      title: LENS_TIPS[l.key] || '',
      onclick: () => { S.F.lens = l.key; S._lensOpen = false; renderLibraryControls(); renderLibrary(); },
    }, l.label));
  }
  lensRoot.classList.toggle('open', !!S._lensOpen);
  const lt = document.getElementById('lensToggle');
  if (lt) {
    lt.textContent = `정렬 · ${lensDef(S.F.lens).label} ${S._lensOpen ? '▴' : '▾'}`;
    lt.onclick = () => { S._lensOpen = !S._lensOpen; renderLibraryControls(); };
  }

  const search = document.getElementById('libSearch');
  search.value = S.F.q;
  search.oninput = (e) => { S.F.q = e.target.value.trim(); renderLibrary(); };

  const vt = document.getElementById('viewToggle');
  vt.innerHTML = '';
  for (const [k, label] of [['gallery', '🖼 갤러리'], ['table', '☰ 표']]) {
    vt.appendChild(U.el('button', {
      class: (S.F.view || 'gallery') === k ? 'on' : '',
      onclick: () => { S.F.view = k; renderLibraryControls(); renderLibrary(); },
    }, label));
  }

  const fmtRoot = document.getElementById('fmtChips');
  fmtRoot.innerHTML = '';
  for (const f of ['all', 'reel', 'carousel', 'image']) {
    const count = f === 'all' ? posts.length : posts.filter((p) => p.type === f).length;
    fmtRoot.appendChild(U.el('button', {
      // 0개 옵션은 흐리게 비활성 — 눌러봤자 빈 화면인 칩을 치운다
      class: 'chip' + (S.F.fmt === f ? ' on' : '') + (count === 0 && f !== 'all' ? ' off' : ''),
      onclick: () => { S.F.fmt = f; renderLibraryControls(); renderLibrary(); },
    }, `${f === 'all' ? '전체' : FMT_LABELS[f]} ${count}`));
  }

  const cRoot = document.getElementById('commerceChips');
  cRoot.innerHTML = '';
  for (const [k, label] of [['all', '전체'], ['일반', '일반'], ['공구', '🛒 공구'], ['광고', '📢 광고']]) {
    const n = k === 'all' ? posts.length : posts.filter((p) => (commerceOf(p) || '일반') === k).length;
    cRoot.appendChild(U.el('button', {
      class: 'chip' + (S.F.commerce === k ? ' on' : '') + (n === 0 && k !== 'all' ? ' off' : ''),
      onclick: () => { S.F.commerce = k; renderLibraryControls(); renderLibrary(); },
    }, `${label} ${n}`));
  }

  const pRoot = document.getElementById('pillarChips');
  pRoot.innerHTML = '';
  for (const name of ['all', ...pillarNames(), PILLAR_FALLBACK]) {
    const pn = name === 'all' ? posts.length : posts.filter((p) => pillarOf(p) === name).length;
    pRoot.appendChild(U.el('button', {
      class: 'chip' + (S.F.pillar === name ? ' on' : '') + (pn === 0 && name !== 'all' ? ' off' : ''),
      onclick: () => { S.F.pillar = name; S._pillarOpen = false; renderLibraryControls(); renderLibrary(); },
    }, name === 'all' ? '기둥 전체' : `${U.esc(name)} ${pn}`));
  }
  pRoot.classList.toggle('open', !!S._pillarOpen);
  const pt = document.getElementById('pillarToggle');
  if (pt) {
    pt.textContent = `주제 · ${S.F.pillar === 'all' ? '전체' : S.F.pillar} ${S._pillarOpen ? '▴' : '▾'}`;
    pt.onclick = () => { S._pillarOpen = !S._pillarOpen; renderLibraryControls(); };
  }

  const avgBy = (t) => {
    const arr = posts.filter((p) => p.type === t && p.views != null);
    return arr.length ? Math.round(arr.reduce((s, p) => s + p.views, 0) / arr.length) : null;
  };
  document.getElementById('fmtAvg').textContent =
    `포맷별 평균 조회수 — 릴스 ${U.fmt(avgBy('reel'))} · 캐러셀 ${U.fmt(avgBy('carousel'))}`;
}

function renderLibrary() {
  const base = baseViews();
  const lens = lensDef(S.F.lens);
  // 필터·렌즈가 바뀌면 더보기 카운터 리셋 (60장부터 다시)
  const libSig = JSON.stringify(S.F);
  if (S._libSig !== libSig) { S._libSig = libSig; S._libShow = 0; }
  let posts = [...myPosts()];

  if (S.F.q) posts = posts.filter((p) => (p.caption || '').toLowerCase().includes(S.F.q.toLowerCase()));
  if (S.F.fmt !== 'all') posts = posts.filter((p) => p.type === S.F.fmt);
  if (S.F.pillar !== 'all') posts = posts.filter((p) => pillarOf(p) === S.F.pillar);
  if (S.F.commerce !== 'all') posts = posts.filter((p) => (commerceOf(p) || '일반') === S.F.commerce);

  // 기준 순위 = 조회수 렌즈. 다른 렌즈에서 이 순위 대비 얼마나 뒤집혔는지가 인사이트.
  const viewsRank = {};
  [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).forEach((p, i) => { viewsRank[p.shortcode] = i + 1; });

  const g = lens.get;
  posts.sort((a, b) => {
    const va = g(a), vb = g(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });

  // 렌즈 안내 — 추정 지표는 계산식과 한계를 항상 밝힌다
  const note = document.getElementById('lensNote');
  const NOTES = {
    engage: '반응률 = (좋아요+댓글) ÷ 조회수. 조회수는 낮아도 반응률이 높으면 — 알고리즘이 덜 태워줬을 뿐 소재는 진짜였다는 신호예요.',
    spread: '평소대비 성과 = 조회수 ÷ 게시 당시 팔로워(스냅샷 근사). 스냅샷이 쌓이기 전 게시물은 첫 스냅샷 값으로 근사한 추정치예요.',
  };
  if (NOTES[lens.key]) { note.innerHTML = NOTES[lens.key]; note.style.display = 'block'; }
  else note.style.display = 'none';

  // 상업성 필터 중엔 그 분류의 성적 요약을 보여준다 — "공구가 계정을 갉나 키우나"가 숫자로
  let countTxt = `콘텐츠 수 : ${posts.length}개`;
  if (S.F.commerce !== 'all' && posts.length) {
    const allMed = median(myPosts().map((p) => p.views));
    const vs = posts.filter((p) => p.views != null);
    const avgV = vs.length ? vs.reduce((s, p) => s + p.views, 0) / vs.length : null;
    const es = posts.map(engageOf).filter((v) => v != null);
    const avgE = es.length ? es.reduce((s, v) => s + v, 0) / es.length : null;
    countTxt = `${S.F.commerce === '일반' ? '일반' : commerceBadge(S.F.commerce) + ' ' + S.F.commerce} 콘텐츠 ${posts.length}개 · 평균 조회 보통의 ×${allMed && avgV ? (avgV / allMed).toFixed(1) : '—'} · 평균 반응률 ${avgE != null ? (avgE * 100).toFixed(1) + '%' : '—'}`;
  }
  document.getElementById('libCount').textContent = countTxt;

  const colMed = lens.key === 'date' ? null : median(posts.map((p) => g(p)));

  const gallery = S.F.view !== 'table';
  document.getElementById('libTable').style.display = gallery ? 'none' : '';
  document.getElementById('libGrid').style.display = gallery ? 'grid' : 'none';

  if (gallery) {
    const grid = document.getElementById('libGrid');
    grid.innerHTML = '';
    // 한 번에 60장씩 — 수백 장 전량 렌더로 페이지가 세로로 폭주하는 걸 막는다
    const LIB_PAGE = 60;
    const shown = S._libShow || LIB_PAGE;
    posts.slice(0, shown).forEach((p, idx) => {
      const isDate = lens.key === 'date';
      const lensVal = lens.get(p);
      const ratio = (!isDate && colMed > 0 && lensVal != null && lensVal > 0) ? lensVal / colMed : null;
      const tier = tierOf(ratio);
      const big = isDate ? cardDate(p.timestamp) : lensFmt(lens, lensVal);
      // 어떤 렌즈로 보든 조회수는 항상 보이게 (조회수 렌즈일 땐 큰 숫자가 이미 조회수라 생략)
      const viewsBit = (lens.key !== 'views' && p.views != null) ? `▶ ${U.fmt(p.views)} · ` : '';
      const tail = isDate ? `${viewsBit}${fmtLabel(p.type)}` : `${viewsBit}${cardDate(p.timestamp)} · ${fmtLabel(p.type)}`;
      // 조회수 순위 대비 이동 ▲▼
      let deltaChip = '';
      const vr = viewsRank[p.shortcode];
      if (lens.key !== 'views' && lens.key !== 'date' && vr != null && lensVal != null) {
        const dd = vr - (idx + 1);
        deltaChip = dd > 0 ? `<span class="gdelta up" title="조회수 순위보다 ${dd}칸 위">▲${dd}</span>`
          : dd < 0 ? `<span class="gdelta down" title="조회수 순위보다 ${-dd}칸 아래">▼${-dd}</span>` : '';
      }
      const card = U.el('div', { class: 'gcard', onclick: () => openPostModal(p) });
      const th = safeImg(p.thumb);
      const com = commerceOf(p);
      card.innerHTML =
        '<div class="gthumb-wrap">' +
        (th ? `<img class="gthumb" src="${U.esc(th)}" loading="lazy" alt="">` : '<div class="gnoimg">🎬</div>') +
        `<span class="grank">${idx + 1}</span>` +
        (com ? `<span class="gcom" title="${U.esc(com)}">${commerceBadge(com)}</span>` : '') +
        `<span class="gpill">${U.esc(pillarOf(p))}</span>` +
        '</div>' +
        // 숫자는 썸네일 밖으로 — 사진 위 오버레이보다 읽기 편하다
        `<div class="gbody"><div class="grow2"><span class="gbig2">${big}</span>` +
        (tier ? `<span class="gtier ${tier.cls}" title="보통(중앙값)의 ${ratio.toFixed(1)}배">${tier.label}</span>` : '') +
        deltaChip +
        `</div><div class="gdate2">${cardNoHtml(p.cardNo)}${tail}</div></div>`;
      grid.appendChild(card);
    });
    if (posts.length > shown) {
      grid.appendChild(U.el('button', { class: 'lib-more', onclick: () => { S._libShow = shown + LIB_PAGE; renderLibrary(); } },
        `더보기 (${posts.length - shown}개 남음)`));
    }
    return;
  }

  const hcls = (c) => (lens.col === c ? ' active' : '');
  const thAct = (k) => (lens.key === k ? ' active' : '');
  document.getElementById('libHead').innerHTML =
    '<tr><th>순위</th><th></th><th>게시물</th>' +
    `<th class="r${hcls('views')}">조회수</th><th class="r">좋아요</th><th class="r${hcls('comments')}">댓글</th>` +
    `<th class="r${thAct('engage')}" title="(좋아요+댓글)÷조회수">반응률</th>` +
    `<th class="r${thAct('spread')}" title="조회수÷게시 당시 팔로워(스냅샷 근사)">평소대비 성과</th><th>기둥</th><th>성과</th></tr>`;

  const cellFor = (p, c) => {
    const v = p[c];
    let inner = v == null ? '—' : U.fmt(v);
    if (lens.col === c && v != null && colMed) inner += ` <span class="xavg" title="보통(중앙값) 대비 배수">×${(v / colMed).toFixed(1)}</span>`;
    return `<td class="r${lens.col === c ? ' active' : ''}${v == null ? ' dim' : ''}">${inner}</td>`;
  };
  const proxyCell = (k, v) => `<td class="r${lens.key === k ? ' active' : ''}${v == null ? ' dim' : ''}">${lensFmt(lensDef(k), v)}</td>`;

  const body = document.getElementById('libBody');
  body.innerHTML = '';
  posts.forEach((p, idx) => {
    const ratio = p.views != null ? p.views / base : null;
    const pill = ratio == null ? ''
      : ratio >= TH.viral ? `<span class="pill hot" title="보통(중앙값)의 ${TH.viral}배 이상">잘됨</span>`
        : ratio <= TH.under ? `<span class="pill low" title="보통(중앙값)의 ${TH.under}배 이하">저조</span>`
          : '<span class="pill mid">보통</span>';
    const rank = idx + 1, vr = viewsRank[p.shortcode];
    let deltaHtml = '';
    if (lens.key !== 'views' && lens.key !== 'date' && vr != null && g(p) != null) {
      const d = vr - rank;
      deltaHtml = d > 0 ? `<span class="delta up" title="조회수 순위보다 ${d}칸 위">▲${d}</span>`
        : d < 0 ? `<span class="delta down" title="조회수 순위보다 ${-d}칸 아래">▼${-d}</span>`
          : '<span class="delta same">=</span>';
    }
    const tr = U.el('tr', { style: 'cursor:pointer' });
    const th = safeImg(p.thumb);
    const com = commerceOf(p);
    tr.innerHTML =
      `<td><span class="rank">${rank}</span>${deltaHtml}</td>` +
      `<td>${th ? `<img src="${U.esc(th)}" loading="lazy" alt="">` : ''}</td>` +
      `<td><span class="cap">${com ? commerceBadge(com) + ' ' : ''}${U.esc((p.caption || '(캡션 없음)').split('\n')[0])}</span><span class="cdate">${cardNoHtml(p.cardNo)}${U.date(p.timestamp)} · ${U.esc(FMT_LABELS[p.type] || p.type)}</span></td>` +
      cellFor(p, 'views') +
      `<td class="r">${U.fmt(p.likes)}</td>` +
      cellFor(p, 'comments') +
      proxyCell('engage', engageOf(p)) +
      proxyCell('spread', spreadOf(p)) +
      `<td>${U.esc(pillarOf(p))}</td><td>${pill}</td>`;
    tr.addEventListener('click', () => openPostModal(p));
    body.appendChild(tr);
  });
}

// 게시물 상세 모달 — 지표 · 🎙 대본 · 🎬 영상 코칭
function openPostModal(p) {
  const base = baseViews();
  const ratio = p.views != null ? (p.views / base).toFixed(1) : null;
  // 판정은 배수+등급을 합친 알약 하나로 — "평균 대비 8.2배 · 잘됨"
  const verdict = p.views == null ? ''
    : (p.views / base >= TH.viral ? `<span class="tier-pill tp-hot">평균 대비 ${ratio}배 · 잘됨</span>`
      : p.views / base <= TH.under ? `<span class="tier-pill tp-low">평균 대비 ${ratio}배 · 저조</span>`
        : `<span class="tier-pill tp-mid">평균 대비 ${ratio}배 · 보통</span>`);
  const stat = (v, label) => `<div class="mstat"><b>${U.fmt(v)}</b><span>${label}</span></div>`;
  const statTxt = (t, label) => `<div class="mstat"><b>${t}</b><span>${label}</span></div>`;

  // 🎬 영상 코칭 — coach.js 가 붙인 것. 실행 가치 순서로 배치한다.
  // ① 파란 적용 박스(다음 영상에 바로 적용) ② 한줄평 ③ 강점/개선점 2열 ④ 시각분석 원본
  const ra = (S.analysis.coaching || {})[p.shortcode];
  const an = ra && ra.analysis;
  const coach = an
    ? (an.다음적용 ? '<div class="apply-box"><span class="apply-badge">다음 영상에 바로 적용</span>' + renderField(an.다음적용) + '</div>' : '') +
      (an.한줄평 ? '<div class="oneline-box"><span class="ob-label">한줄평 · AI 자동 영상분석</span>' + renderField(an.한줄평) + '</div>' : '') +
      (an.강점 || an.개선점
        ? (() => {
          const cnt = (v) => (Array.isArray(v) ? v.length : Math.max(1, splitPoints(String(v)).length));
          return '<div class="dm-2col">' +
            (an.강점 ? '<div class="point-card good"><div class="pc-title">● 강점 ' + cnt(an.강점) + '</div>' + renderField(an.강점) + '</div>' : '') +
            (an.개선점 ? '<div class="point-card fix"><div class="pc-title">● 개선점 ' + cnt(an.개선점) + '</div>' + renderField(an.개선점) + '</div>' : '') +
            '</div>';
        })()
        : '') +
      (an.판매코칭 ? '<div class="oneline-box" style="margin-top:10px"><span class="ob-label" style="color:#B45309">💰 판매 코칭</span>' + renderField(an.판매코칭) + '</div>' : '') +
      (ra.video_analysis
        ? '<details style="margin-top:10px"><summary style="font-size:11.5px;color:var(--muted);cursor:pointer">🎥 시각분석 원본 펼치기</summary>' +
          Object.entries(ra.video_analysis).map(([k, v]) => (v ? '<div class="dm-field" style="margin-top:8px"><span class="dm-field-label">' + U.esc(k) + '</span>' + renderField(v) + '</div>' : '')).join('') +
          '</details>'
        : '')
    : ((p.type === 'reel' || p.type === 'video')
      ? '<div class="dm-hint" style="margin-top:10px">🎬 영상 코칭 대기 중 — Claude에게 <b>"내 릴스 코칭해줘"</b>라고 하시면 붙습니다 (매주 월요일엔 자동)</div>'
      : '');

  const th = safeImg(p.thumb);
  document.getElementById('modalContent').innerHTML =
    '<div class="mwrap">' +
    (th ? `<img src="${U.esc(th)}" alt="">` : '<div class="rc-noimg" style="width:150px;height:214px;font-size:34px">🎬</div>') +
    `<div class="mbody">
      <div style="font-size:12.5px;color:var(--accent);font-weight:700">@${U.esc(S.posts.my.profile?.handle || '')} · ${U.esc(pillarOf(p))}</div>
      <div style="font-size:16.5px;font-weight:800;margin:4px 0;line-height:1.45">${U.esc((p.caption || '(캡션 없음)').split('\n')[0])}</div>
      <div style="font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap">${U.date(p.timestamp)} · ${fmtLabel(p.type)} ${verdict} ${cardNoHtml(p.cardNo, true)}</div>
      <div class="mstats">${[
        stat(p.views, '조회수'), stat(p.likes, '좋아요'), stat(p.comments, '댓글'),
        statTxt(lensFmt(lensDef('engage'), engageOf(p)), '반응률 · 추정'),
        statTxt(lensFmt(lensDef('spread'), spreadOf(p)), '평소대비 성과 · 추정'),
      ].join('')}</div>
      ${p.transcript ? `<details style="margin-top:10px"><summary style="font-size:11.5px;color:var(--muted);cursor:pointer">🎙 대본 펼치기</summary><div style="font-size:12.5px;line-height:1.7;white-space:pre-wrap;margin-top:6px">${U.esc(p.transcript)}</div></details>` : ''}
      ${coach}
      <div class="dm-hint" style="margin-top:12px">기둥 <b>${U.esc(pillarOf(p))}</b> · 수익 유형 <b>${U.esc(commerceOf(p) || '일반')}</b><br>
        고치려면 Claude에게 — "${U.esc(p.cardNo || '')}는 ${U.esc(pillarNames()[0] || '공부법')}로 바꿔줘"</div>
      <a href="${U.esc(safeHref(p.url))}" target="_blank" rel="noopener" style="display:inline-block;margin-top:12px;font-size:12.5px;color:var(--accent);font-weight:600">인스타에서 열기 ↗</a>
    </div></div>`;
  document.getElementById('modal').classList.add('on');
}

// ───────────────────────── 레퍼런스 발굴 ─────────────────────────
const discItems = () => (S.disc && S.disc.items) || [];
// 숨김 목록은 카드번호(R-001) 또는 shortcode 둘 다 받는다
const isHidden = (d) => {
  const h = S.settings.hidden || [];
  return h.includes(d.cardNo) || h.includes(d.shortcode);
};

function renderDiscover() {
  renderDiscoverInfo();
  const root = document.getElementById('discoverGrid');
  if (!root) return;
  root.innerHTML = '';

  const all = discItems().filter((d) => !isHidden(d));
  if (!all.length) {
    root.innerHTML = '<div class="empty-note" style="text-align:left;padding:18px;line-height:1.7">아직 발굴된 릴스가 없어요.<br>Claude에게 <b>"소스 계정으로 @아이디 등록해줘"</b> → <b>"레퍼런스 가져와줘"</b>라고 말씀해 주세요.</div>';
    return;
  }

  // 조회수 칩 — 기본은 settings.minViews. 켜진 칩을 한 번 더 누르면 숫자를 직접 고칠 수 있고
  // 고친 값은 이 브라우저가 기억한다(localStorage).
  const dvRoot = document.getElementById('discViews');
  if (S.D.thr == null) {
    const saved = Number(localStorage.getItem('discThr'));
    S.D.thr = saved > 0 ? saved : Math.max(1, Math.round((Number(S.settings.minViews) || DEFAULT_MIN_VIEWS) / 10000));
  }
  if (dvRoot) {
    dvRoot.innerHTML = '';
    const thr = S.D.thr;
    const nThr = all.filter((d) => (d.views || 0) >= thr * 10000).length;
    dvRoot.appendChild(U.el('button', {
      class: 'chip' + (S.D.views === 'all' ? ' on' : ''),
      onclick: () => { S.D.views = 'all'; renderDiscover(); },
    }, `전체 ${all.length}`));
    if (S.D.editThr) {
      const inp = U.el('input', { type: 'number', value: thr, min: '1', class: 'thr-input' });
      let applied = false;
      const apply = () => {
        if (applied) return;
        applied = true;
        const v = Math.max(1, Math.round(Number(inp.value) || thr));
        S.D.thr = v;
        try { localStorage.setItem('discThr', v); } catch { /* 시크릿 모드 등 */ }
        S.D.editThr = false; S.D.views = 'thr';
        renderDiscover();
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') apply();
        if (e.key === 'Escape') { applied = true; S.D.editThr = false; renderDiscover(); }
      });
      inp.addEventListener('blur', apply);
      const wrap = U.el('span', { class: 'chip on', style: 'display:inline-flex;align-items:center;gap:3px' });
      wrap.append(inp, document.createTextNode('만+'));
      dvRoot.appendChild(wrap);
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else {
      dvRoot.appendChild(U.el('button', {
        class: 'chip' + (S.D.views === 'thr' ? ' on' : ''),
        title: '한 번 더 누르면 기준 조회수를 직접 바꿀 수 있어요',
        onclick: () => { if (S.D.views === 'thr') S.D.editThr = true; else S.D.views = 'thr'; renderDiscover(); },
      }, `${thr}만+ ${nThr} <span style="opacity:.55">✎</span>`));
    }
  }
  let items = S.D.views === 'all' ? all : all.filter((d) => (d.views || 0) >= S.D.thr * 10000);

  // 상업성 칩 — 레퍼런스를 볼 때 광고·공구 성과는 걸러 보기 위함
  const dcRoot = document.getElementById('discCommerce');
  if (dcRoot) {
    dcRoot.innerHTML = '';
    for (const [k, label] of [['all', '전체'], ['일반', '일반'], ['공구', '🛒 공구'], ['광고', '📢 광고']]) {
      const n = k === 'all' ? items.length : items.filter((d) => (commerceOf(d) || '일반') === k).length;
      dcRoot.appendChild(U.el('button', {
        class: 'chip' + (S.D.commerce === k ? ' on' : ''),
        onclick: () => { S.D.commerce = k; renderDiscover(); },
      }, `${label} ${n}`));
    }
  }
  if (S.D.commerce !== 'all') items = items.filter((d) => (commerceOf(d) || '일반') === S.D.commerce);

  // 캡션·대본 부분일치 검색
  const q = S.D.q.toLowerCase();
  if (q) items = items.filter((d) => ((d.caption || '') + ' ' + (d.transcript || '') + ' ' + (d.analysis?.주제 || '')).toLowerCase().includes(q));

  // 한 계정 도배 방지 — 조회수순은 유지하되 같은 계정이 연속 2장을 넘으면 뒤로 민다.
  // 대형 계정은 릴스 대부분이 상위권이라 절대 조회수 정렬만으론 그리드를 점령한다.
  let shown = [...items].sort((a, b) => (b.views || 0) - (a.views || 0));
  {
    const pool = [...shown]; const out = [];
    let last = null, run = 0;
    while (pool.length) {
      let i = 0;
      if (run >= 2) {
        i = pool.findIndex((d) => (d.sourceHandle || '') !== last);
        if (i === -1) i = 0; // 남은 게 전부 같은 계정이면 그대로
      }
      const d = pool.splice(i, 1)[0];
      const acc = d.sourceHandle || '';
      run = acc === last ? run + 1 : 1;
      last = acc;
      out.push(d);
    }
    shown = out;
  }

  const note = document.getElementById('discComNote');
  if (note) {
    if (S.D.commerce !== 'all' && shown.length) {
      note.textContent = `평균 조회수 ${U.fmt(Math.round(shown.reduce((s, d) => s + (d.views || 0), 0) / shown.length))}`;
    } else note.textContent = '';
  }
  if (!shown.length) {
    root.innerHTML = '<div class="empty-note" style="text-align:left;padding:14px">조건에 맞는 발굴 릴스가 없어요 — 조회수 기준을 낮추거나 검색어를 지워보세요.</div>';
    return;
  }
  for (const d of shown) {
    const card = U.el('div', { class: 'dcard', onclick: () => openDiscModal(d) });
    const th = safeImg(d.thumb);
    const com = commerceOf(d);
    card.innerHTML =
      '<div class="dthumb-wrap">' +
      (th ? `<img class="dthumb" src="${U.esc(th)}" loading="lazy" alt="">` : '<div class="dnoimg">🎬</div>') +
      `<span class="dbadge ${d.status === 'analyzed' ? 'ana' : 'wait'}">${d.status === 'analyzed' ? '✨ 분석완료' : '⏳ 분석대기'}</span>` +
      (com ? `<span class="dcom" title="${U.esc(com)}">${commerceBadge(com)}</span>` : '') +
      `<div class="dviews"><b>${U.fmt(d.views)}</b><div class="acc">@${U.esc(d.sourceHandle || '')}</div></div>` +
      '</div>' +
      `<div class="dtopic">${cardNoHtml(d.cardNo)}${U.esc(d.analysis?.주제 || (d.caption || '').replace(/\n/g, ' ') || '(분석 대기 중)')}</div>`;
    root.appendChild(card);
  }
}

function renderDiscoverInfo() {
  const el = document.getElementById('discInfo');
  if (!el) return;
  const items = discItems();
  const analyzed = items.filter((d) => d.status === 'analyzed').length;
  const lastAnalyzed = items.map((d) => d.analyzedAt).filter(Boolean).sort().pop();
  el.innerHTML =
    `소스 <b>${(S.settings.sources || []).length}개</b> · 발굴 <b>${items.length}건</b>(분석 ${analyzed}건)` +
    ` · 마지막 수집 <b>${U.date(S.disc.updatedAt)}</b> · 마지막 분석 <b>${U.date(lastAnalyzed)}</b>`;

  const search = document.getElementById('discSearch');
  if (search && !search._wired) {
    search._wired = true;
    search.addEventListener('input', (e) => { S.D.q = e.target.value.trim(); renderDiscover(); });
  }
}

// 발굴 릴스 상세 모달 — 인스타 임베드 + 🧠 왜 터졌나 + 🎙 대본
function openDiscModal(d) {
  const an = d.analysis || {};
  const rel = an.내_채널_관련성;
  const analyzed = d.status === 'analyzed' && an
    ? '<div class="dm-sec-card insight">' +
        '<div class="dm-sec-title">🧠 왜 터졌나 (AI 종합 인사이트)</div>' +
        (rel ? `<div style="font-size:11px;color:var(--muted);margin:-4px 0 8px">내 채널 관련성 <b style="color:var(--ink)">${U.esc(rel.등급 || '')}</b> — ${U.esc(rel.이유 || '')}</div>` : '') +
        (an.후킹 ? '<div class="dm-field"><span class="dm-field-label">후킹</span>' + renderField(an.후킹) + '</div>' : '') +
        (an.좋은점 ? '<div class="dm-field"><span class="dm-field-label">좋은점</span>' + renderField(an.좋은점) + '</div>' : '') +
        (an.차용포인트 ? '<div class="dm-borrow"><span class="dm-field-label">내 콘텐츠에 이렇게 — 차용포인트</span>' + renderField(an.차용포인트) + '</div>' : '') +
        (an.소구점
          ? '<div class="dm-sec-card insight" style="margin-top:10px;background:#FFF7ED;border-color:rgba(245,158,11,.3)">' +
              '<div class="dm-sec-title" style="color:#B45309">💰 어떻게 사고 싶게 만드나 (소구점)</div>' +
              Object.entries(an.소구점).map(([k, v]) => (v ? '<div class="dm-field"><span class="dm-field-label" style="background:rgba(245,158,11,.15);color:#B45309">' + U.esc(k.replace(/_/g, ' ')) + '</span>' + renderField(v) + '</div>' : '')).join('') +
            '</div>'
          : '') +
      '</div>'
    : '<div class="dm-pending"><div class="dm-pend-icon">⏳</div><p>아직 영상 분석 대기 중이에요.<br>Claude에게 <b>"레퍼런스 분석해줘"</b>라고 하시면 여기에 채워집니다.</p></div>';

  // 썸네일은 CSS url() 안으로 들어가므로 cssUrl 로 한 번 더 거른다 (스타일 선언 탈출 차단)
  const bg = cssUrl(d.thumb);
  const sc = safeShortcode(d.shortcode);
  document.getElementById('modalContent').innerHTML =
    '<div class="mwrap disc-modal ref-modal">' +
    // 임베드가 못 뜨는 환경에서 회색 공백만 남지 않게 — 썸네일을 바닥에 깔고 그 위에 임베드를 얹는다
    `<div class="rmodal-embed-wrap"${bg ? ` style="background-image:url('${U.esc(bg)}')"` : ''}>` +
    '<div class="embed-fallback">영상이 안 보이면 아래 <b>인스타에서 열기</b>를 눌러주세요</div>' +
    (sc ? `<iframe class="rmodal-embed" src="https://www.instagram.com/reel/${encodeURIComponent(sc)}/embed/" scrolling="no" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" loading="lazy" title="릴스"></iframe>` : '') +
    '</div>' +
    '<div class="mbody">' +
      `<div class="dm-meta">@${U.esc(d.sourceHandle || '')} · <b>${U.fmt(d.views)}회</b> · ${cardDate(d.takenAt)} ${cardNoHtml(d.cardNo, true)}</div>` +
      `<div class="dm-topic">${U.esc(an.주제 || (d.caption || '').split('\n')[0] || '(분석 대기 중)')}</div>` +
      '<div class="dm-actions">' +
        `<a href="${U.esc(safeHref(d.url))}" target="_blank" rel="noopener" class="dm-btn-open">인스타에서 열기 ↗</a>` +
      '</div>' +
      analyzed +
      (d.transcript ? `<details style="margin-top:12px"><summary style="font-size:11.5px;color:var(--muted);cursor:pointer">🎙 대본 펼치기</summary><div style="font-size:12.5px;line-height:1.7;white-space:pre-wrap;margin-top:6px">${U.esc(d.transcript)}</div></details>` : '') +
      `<div class="dm-hint" style="margin-top:12px">이 릴스로 기획하려면 Claude에게 — "${U.esc(d.cardNo || '')} 참고해서 기획해줘"<br>안 보고 싶으면 — "${U.esc(d.cardNo || '')} 숨겨줘"</div>` +
    '</div></div>';
  document.getElementById('modal').classList.add('on');
}

// ───────────────────────── 설정 (읽기 전용) ─────────────────────────
// 화면에 저장 버튼이 없다. 각 항목 아래에 "Claude에게 이렇게 말하세요" 안내를 둔다.
function sayBox(lines) {
  return '<div class="say"><span class="say-lb">Claude에게 이렇게 말하세요</span>' +
    lines.map((t) => `<div class="say-line">“${U.esc(t)}”</div>`).join('') + '</div>';
}

// 자동 사이클의 "마지막으로 언제 돌았나". 주기의 1.5배를 넘기면 주황 경고 —
// GitHub 로그를 안 봐도 자동화 생사를 아는 유일한 창구.
function cycleRows() {
  const snaps = snapshots();
  const snapLast = snaps.length ? snaps[snaps.length - 1].date : null;
  const coachLast = Object.values(S.analysis.coaching || {}).map((c) => c.analyzed_at).filter(Boolean).sort().pop() || null;
  const discAnalyzed = discItems().map((d) => d.analyzedAt).filter(Boolean).sort().pop() || null;
  // classify.js 는 코칭 없이 분류만 갱신할 수 있어 analysis.updatedAt 도 후보에 넣는다
  const analyzedLast = [coachLast, discAnalyzed, S.analysis.updatedAt].filter(Boolean).sort().pop() || null;
  return [
    { icon: '📈', name: '팔로워 스냅샷', cyc: '매일 아침', days: 1, last: snapLast, desc: '매일 아침 7시에 팔로워 수를 한 점씩 기록해 추이 그래프를 만듭니다.' },
    { icon: '🔍', name: '레퍼런스 발굴', cyc: '3일마다', days: 3, last: S.disc.updatedAt, desc: '3일마다 아침 7시에 소스 계정에서 잘 터진 릴스를 새로 찾아옵니다.' },
    { icon: '📥', name: '게시물 수집', cyc: '매주 월요일', days: 7, last: S.posts.updatedAt, desc: '매주 월요일 아침에 내 계정 게시물과 수치를 통째로 최신화합니다.' },
    { icon: '🧠', name: 'AI 분석·코칭', cyc: '매주 월요일', days: 7, last: analyzedLast, desc: '매주 월요일 아침에 새 발굴 릴스에 분석을 달고 내 릴스에 코칭을 답니다.' },
  ];
}

function renderSettings() {
  const root = document.getElementById('settingsBody');
  root.innerHTML = '';

  // ① 채널 정체성 — 모든 AI가 참고하는 문서
  const idn = U.el('div', { class: 'set-sec' });
  idn.innerHTML =
    '<h2>채널 정체성</h2>' +
    '<div class="set-desc">여기 적힌 내용을 <b>발굴 분석·릴스 코칭·기획 스킬이 매번 참고</b>합니다. 자세할수록 제안이 내 채널에 맞아집니다.</div>' +
    (S.settings.brief
      ? `<div class="brief-view">${U.esc(S.settings.brief)}</div>`
      : '<div class="empty-note" style="text-align:left">아직 채널 정체성이 비어 있어요.</div>') +
    sayBox(['채널 정체성 자동 분석해줘', '정체성에 ○○를 추가해줘']);
  root.appendChild(idn);

  // ② 콘텐츠 기둥 — 이름 · 목표% · 현재 분류 개수
  const posts = myPosts();
  const counts = {};
  for (const p of posts) counts[pillarOf(p)] = (counts[pillarOf(p)] || 0) + 1;
  const total = posts.length || 1;
  const pil = U.el('div', { class: 'set-sec' });
  pil.innerHTML =
    '<h2>콘텐츠 기둥</h2>' +
    '<div class="set-desc">내 채널의 콘텐츠 카테고리. 도넛 차트·라이브러리 필터·AI 분석이 전부 이 목록을 씁니다.</div>' +
    '<dl class="kv">' +
    (S.settings.pillars || []).map((p) => {
      const n = counts[p.name] || 0;
      return `<dt>${U.esc(p.name)}</dt><dd>${n}개 · 실제 ${((n / total) * 100).toFixed(0)}% <span style="color:var(--muted)">/ 목표 ${U.num(p.targetPercent || 0)}%</span></dd>`;
    }).join('') +
    (counts[PILLAR_FALLBACK] ? `<dt>미분류</dt><dd>${counts[PILLAR_FALLBACK]}개</dd>` : '') +
    '</dl>' +
    sayBox(['기둥 4개로 다시 정해서 분류해줘', 'M-012는 동기부여로 바꿔줘']);
  root.appendChild(pil);

  // ③ 소스 계정 — 목록 · 마지막 수집 · 평소 조회수(중앙값)
  const st = (S.disc && S.disc.sourceState) || {};
  const src = U.el('div', { class: 'set-sec' });
  src.innerHTML =
    '<h2>소스 계정</h2>' +
    '<div class="set-desc">레퍼런스를 찾아오는 벤치마크 계정. 최대 10곳까지 권장합니다.</div>' +
    ((S.settings.sources || []).length
      ? '<dl class="kv">' + S.settings.sources.map((h) => {
        const s = st[h] || {};
        return `<dt>@${U.esc(h)}</dt><dd>마지막 수집 ${U.date(s.lastCollectedAt)} · 평소 조회수 ${U.fmt(s.medianViews)}</dd>`;
      }).join('') + '</dl>'
      : '<div class="empty-note" style="text-align:left">아직 등록된 소스 계정이 없어요.</div>') +
    sayBox(['소스 계정으로 @a @b 등록해줘', '레퍼런스 가져와줘']);
  root.appendChild(src);

  // ④ 자동화 상태 — 마지막 실행일과 지연 경고
  const now = Date.now(), day = 86400e3;
  const ago = (t) => {
    // 날짜로 못 읽히는 값(형식이 깨진 JSON)도 '기록 없음' 으로 — 'NaN일 전' 이 화면에 나가지 않게
    const ms = t ? new Date(t).getTime() : NaN;
    if (!Number.isFinite(ms)) return { txt: '기록 없음', d: Infinity };
    const d = Math.floor((now - ms) / day);
    return { txt: d <= 0 ? '오늘 ✓' : d === 1 ? '어제 ✓' : `${d}일 전 ✓`, d };
  };
  const rows = cycleRows();
  const auto = U.el('div', { class: 'set-sec' });
  auto.innerHTML =
    '<h2>자동화 상태</h2>' +
    '<div class="set-desc">GitHub Actions가 대신 돌리는 자동 사이클. 주기보다 늦어지면 주황색으로 바뀝니다.</div>' +
    '<div class="cycle-strip">' + rows.map((c) => {
      const a = ago(c.last);
      const warn = a.d > c.days * 1.5;
      const stat = warn ? (a.d === Infinity ? '기록 없음 ⚠' : `${a.d}일째 안 옴 ⚠`) : a.txt;
      return `<span class="cyc${warn ? ' warn' : ''}" title="${U.esc(c.desc)}">${c.icon} ${c.name} <span class="cyc-sub">${c.cyc}</span> · <b>${stat}</b></span>`;
    }).join('') + '</div>' +
    sayBox(['자동화 켜줘', '데이터 가져와줘']);
  root.appendChild(auto);

  // ⑤ 크레딧 · 프로젝트 정보
  const snaps = snapshots();
  // 크레딧은 수집·발굴 둘 다 기록한다 — 나중에 돈 쪽이 최신값 (발굴이 3일마다라 대개 더 신선)
  const creditsRaw = (String(S.disc.updatedAt || '') > String(S.posts.updatedAt || '') && S.disc.creditsRemaining != null)
    ? S.disc.creditsRemaining : S.posts.creditsRemaining;
  const credits = Number.isFinite(Number(creditsRaw)) && creditsRaw != null ? Number(creditsRaw) : null;
  const info = U.el('div', { class: 'set-sec' });
  info.innerHTML =
    '<h2>크레딧 · 프로젝트 정보</h2>' +
    '<dl class="kv">' +
    `<dt>내 계정</dt><dd>@${U.esc(S.settings.handle || '')}</dd>` +
    `<dt>남은 수집 크레딧</dt><dd>${U.num(credits)} <span style="color:var(--muted)">(마지막 수집 시점)</span></dd>` +
    `<dt>발굴 기준 조회수</dt><dd>${U.fmt(S.settings.minViews)} 이상</dd>` +
    `<dt>스냅샷</dt><dd>${snaps.length}개 ${snaps.length ? `(${U.date(snaps[0].date)} ~ ${U.date(snaps[snaps.length - 1].date)})` : ''}</dd>` +
    `<dt>게시물 수집 시각</dt><dd>${U.dateKo(S.posts.updatedAt)}</dd>` +
    `<dt>숨긴 레퍼런스</dt><dd>${(S.settings.hidden || []).length}건</dd>` +
    '</dl>' +
    (credits != null && credits < 500 ? '<div class="empty-note" style="text-align:left;margin-top:8px">⚠️ 크레딧이 얼마 안 남았어요 — README의 "크레딧 채우기"를 확인해 주세요.</div>' : '') +
    sayBox(['대시보드 열어줘', '올려줘']);
  root.appendChild(info);
}

boot();
