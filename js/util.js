'use strict';
// 공용 유틸 — 한국식 숫자 축약, 날짜, JSON 읽기, DOM 헬퍼.
// 이 대시보드는 읽기 전용이라 저장(POST) 함수가 없다. 데이터는 data/*.json 이 전부다.

const U = {
  // 1234 → "1,234" / 12345 → "1.2만" / 123456789 → "1.2억"
  fmt(n) {
    if (n == null || Number.isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (abs >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
    return n.toLocaleString('ko-KR');
  },
  pct(n, digits = 1) {
    if (n == null || Number.isNaN(n)) return '—';
    return (n * 100).toFixed(digits).replace(/\.0$/, '') + '%';
  },
  date(iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 10);
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
