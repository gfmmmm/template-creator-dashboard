'use strict';
// 공용 유틸 — 한국식 숫자 축약, 날짜, JSON 읽기, DOM 헬퍼.
// 이 대시보드는 읽기 전용이라 저장(POST) 함수가 없다. 데이터는 data/*.json 이 전부다.

// ⚠️ fmt·pct·date·num 은 화면에 innerHTML 로 꽂히는 값을 만든다.
// 그래서 "무엇이 들어와도 숫자/날짜꼴 문자열만 나간다"를 함수 자체가 보장한다.
// (JSON 이 오염돼도 태그가 화면으로 새어나가지 않게 하는 1차 방어선)
const U = {
  // 1234 → "1,234" / 12345 → "1.2만" / 123456789 → "1.2억"
  fmt(n) {
    const x = Number(n);
    if (n == null || n === '' || !Number.isFinite(x)) return '—';
    const abs = Math.abs(x);
    if (abs >= 1e8) return (x / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (abs >= 1e4) return (x / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
    return x.toLocaleString('ko-KR');
  },
  // 천단위 콤마만 (축약 없음)
  num(n) {
    const x = Number(n);
    if (n == null || n === '' || !Number.isFinite(x)) return '—';
    return x.toLocaleString('ko-KR');
  },
  pct(n, digits = 1) {
    const x = Number(n);
    if (n == null || n === '' || !Number.isFinite(x)) return '—';
    return (x * 100).toFixed(digits).replace(/\.0$/, '') + '%';
  },
  // 날짜꼴(YYYY-MM-DD)만 통과 — 그 밖의 문자열은 '—'
  date(iso) {
    if (!iso) return '—';
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso));
    return m ? m[1] : '—';
  },
  dateKo(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
  async json(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },
  // 이 대시보드의 DOM 헬퍼. attrs 는 전부 setAttribute/addEventListener 로 들어가므로
  // (문자열 조립이 아니라) 값에 따옴표·태그가 있어도 속성이 깨지지 않는다.
  el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};
