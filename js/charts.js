'use strict';
// 순수 SVG 차트 — 외부 라이브러리 0. (본가에서 ECharts 1.03MB 제거)
// 원칙: 축 1개, 얇은 마크, 세그먼트 사이 2px 간격, 범례는 항상 텍스트 라벨 동반.
// 남긴 것: donut(콘텐츠 기둥) · line(팔로워 추이). 호출부 없는 차트는 옮기지 않았다.

const C = {
  NS: 'http://www.w3.org/2000/svg',
  svg(w, h) {
    const s = document.createElementNS(this.NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('width', '100%');
    s.style.display = 'block';
    return s;
  },
  node(name, attrs) {
    const n = document.createElementNS(this.NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  },

  // ── 도넛 (기둥 비율) — 세그먼트 사이 흰 간격 + 외부 리더 라인 + 기둥명 라벨 ──
  // opts.onSegmentClick(label) — 섹션 클릭 콜백 (선택 사항)
  donut(container, segments, centerTitle, centerSub, opts = {}) {
    container.innerHTML = '';
    // 라벨이 도넛 바깥으로 나가므로 viewBox를 여유있게: 좌우상하 패딩
    const CX = 110, CY = 110, R = 70, SW = 22;
    const OUTER = R + SW / 2;
    const svg = document.createElementNS(this.NS, 'svg');
    svg.setAttribute('viewBox', '-55 -44 330 330');
    svg.setAttribute('width', '100%');
    svg.style.display = 'block';

    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      svg.appendChild(this.node('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: '#EDEEF3', 'stroke-width': SW }));
    } else {
      // 1패스: 세그먼트 호(arc) → 2패스: 간격선·리더 라인·라벨 (간격선이 라벨을 덮지 않게)
      const segs = [];
      let angle = -90;
      for (const seg of segments) {
        if (!seg.value) continue;
        const sweep = (seg.value / total) * 360;
        const a0 = (angle * Math.PI) / 180, a1 = ((angle + sweep) * Math.PI) / 180;
        const large = sweep > 180 ? 1 : 0;
        segs.push({ seg, sweep, a0, a1, large, midAngle: angle + sweep / 2 });
        angle += sweep;
      }

      for (const { seg, a0, a1, large, sweep, midAngle } of segs) {
        const p = this.node('path', {
          d: `M${CX + R * Math.cos(a0)},${CY + R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${CX + R * Math.cos(a1)},${CY + R * Math.sin(a1)}`,
          fill: 'none', stroke: seg.color, 'stroke-width': SW, 'stroke-linecap': 'butt',
        });
        if (opts.onSegmentClick) {
          p.style.cursor = 'pointer';
          p.addEventListener('click', () => opts.onSegmentClick(seg.label));
          p.addEventListener('mouseenter', () => { p.setAttribute('opacity', '0.72'); });
          p.addEventListener('mouseleave', () => { p.removeAttribute('opacity'); });
        }
        const ttl = document.createElementNS(this.NS, 'title');
        ttl.textContent = `${seg.label}: ${seg.value}개`;
        p.appendChild(ttl);
        svg.appendChild(p);

        // 섹션 안 개수 라벨 (30° 이상일 때만)
        if (sweep >= 30) {
          const mid = (midAngle * Math.PI) / 180;
          const lt = this.node('text', {
            x: CX + R * Math.cos(mid), y: CY + R * Math.sin(mid) + 3.5,
            'text-anchor': 'middle', 'font-size': '11', 'font-weight': '800', fill: '#fff',
            style: 'pointer-events:none',
          });
          lt.textContent = seg.value;
          svg.appendChild(lt);
        }
      }

      for (const { seg, a1, sweep, midAngle } of segs) {
        svg.appendChild(this.node('line', {
          x1: CX, y1: CY,
          x2: CX + (R + SW) * Math.cos(a1), y2: CY + (R + SW) * Math.sin(a1),
          stroke: '#fff', 'stroke-width': '2.5', style: 'pointer-events:none',
        }));

        // 리더 라인 + 기둥명 (섹션이 18° 이상일 때만)
        if (sweep >= 18) {
          const mid = (midAngle * Math.PI) / 180;
          const cosM = Math.cos(mid), sinM = Math.sin(mid);
          svg.appendChild(this.node('line', {
            x1: CX + (OUTER + 4) * cosM, y1: CY + (OUTER + 4) * sinM,
            x2: CX + (OUTER + 18) * cosM, y2: CY + (OUTER + 18) * sinM, class: 'callout',
            stroke: seg.color, 'stroke-width': '1.5', opacity: '0.85', style: 'pointer-events:none',
          }));
          const anchor = cosM >= 0.05 ? 'start' : cosM <= -0.05 ? 'end' : 'middle';
          const lbl = this.node('text', {
            x: CX + (OUTER + 23) * cosM, y: CY + (OUTER + 23) * sinM + 3.5,
            class: 'callout', // 모바일에선 CSS로 숨김 — 좁은 폭에서 라벨끼리 겹침
            'text-anchor': anchor, 'font-size': '10', 'font-weight': '700', fill: seg.color,
            style: opts.onSegmentClick ? 'cursor:pointer' : 'pointer-events:none',
          });
          lbl.textContent = seg.label;
          if (opts.onSegmentClick) lbl.addEventListener('click', () => opts.onSegmentClick(seg.label));
          svg.appendChild(lbl);
        }
      }
    }

    // 중앙 텍스트
    const t1 = this.node('text', { x: CX, y: CY - 3, 'text-anchor': 'middle', 'font-size': '22', 'font-weight': '800', fill: '#23253A' });
    t1.textContent = centerTitle;
    const t2 = this.node('text', { x: CX, y: CY + 15, 'text-anchor': 'middle', 'font-size': '10', fill: '#8A8FA3' });
    t2.textContent = centerSub;
    svg.append(t1, t2);
    container.appendChild(svg);
  },

  // ── 라인 차트 (팔로워 추이) — 점 마커 + 호버 툴팁 ──
  // points: [{ t: ms, v: 값, abs: 실제값, dv: 증감 }]
  line(container, tipEl, points, { color = '#6366F1', fmt = (v) => v, minSpanRatio = 0 } = {}) {
    container.querySelectorAll('svg,.empty-note').forEach((e) => e.remove());
    const pts = [...points].sort((a, b) => a.t - b.t);
    if (pts.length < 2) {
      container.appendChild(U.el('div', { class: 'empty-note' }, '데이터가 더 쌓이면 그려집니다.'));
      return;
    }
    const W = 640, H = 230, L = 52, Rp = 16, T = 12, B = 26;
    const svg = this.svg(W, H);
    const plotW = W - L - Rp, plotH = H - T - B;
    const ts = pts.map((p) => p.t), vs = pts.map((p) => p.v);
    const tMin = Math.min(...ts), tMax = Math.max(...ts);
    // 여백은 절대값 비율이 아니라 변화 폭(max-min)에 비례해서 준다.
    // 팔로워 1만처럼 큰 수에서 고정 비율 여백을 주면 실제 변화가 바닥에 눌려 평평해 보인다.
    const dataMax = Math.max(...vs), dataMin = Math.min(...vs);
    const rawSpan = (dataMax - dataMin) || Math.abs(dataMax) * 0.02 || 1;
    const span = Math.max(rawSpan * 1.4, Math.abs(dataMax) * minSpanRatio);
    const pad = span * 0.18 + (span - rawSpan) / 2;
    const vMax = dataMax + pad, vMin = dataMin - pad;
    const x = (t) => (tMax === tMin ? L + plotW / 2 : L + ((t - tMin) / (tMax - tMin)) * plotW);
    const y = (v) => T + (1 - (v - vMin) / ((vMax - vMin) || 1)) * plotH;

    for (let g = 0; g <= 3; g++) {
      const gy = T + (g / 3) * plotH;
      svg.appendChild(this.node('line', { x1: L, y1: gy, x2: W - Rp, y2: gy, stroke: '#F0F1F5', 'stroke-width': '1' }));
      const lbl = this.node('text', { x: L - 8, y: gy + 3.5, 'text-anchor': 'end', 'font-size': '9.5', fill: '#B0B3C2' });
      lbl.textContent = fmt(vMax - (g / 3) * (vMax - vMin));
      svg.appendChild(lbl);
    }
    // 날짜 라벨은 최대 8개 — 스냅샷이 쌓일수록 라벨끼리 겹치는 것 방지 (마지막은 항상 표시)
    const step = Math.ceil(pts.length / 8);
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      if (i !== pts.length - 1 && pts.length - 1 - i < step / 2) return;
      const d = new Date(p.t);
      const lbl = this.node('text', { x: x(p.t), y: H - 8, 'text-anchor': 'middle', 'font-size': '9.5', fill: '#B0B3C2' });
      lbl.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      svg.appendChild(lbl);
    });

    const d = `M${pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('L')}`;
    svg.appendChild(this.node('path', {
      d: `${d}L${x(pts[pts.length - 1].t).toFixed(1)},${H - B}L${x(pts[0].t).toFixed(1)},${H - B}Z`,
      fill: color, opacity: '0.07',
    }));
    svg.appendChild(this.node('path', { d, fill: 'none', stroke: color, 'stroke-width': '2.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const p of pts) {
      const dot = this.node('circle', { cx: x(p.t), cy: y(p.v), r: '3.6', fill: '#fff', stroke: color, 'stroke-width': '2' });
      dot.addEventListener('mouseenter', () => {
        const rect = svg.getBoundingClientRect();
        let valStr;
        if (p.abs != null) {
          valStr = `${p.abs.toLocaleString('ko-KR')}명`;
          if (p.dv != null) valStr += ` <span style="opacity:.75">(${p.dv >= 0 ? '+' : ''}${p.dv.toLocaleString('ko-KR')})</span>`;
        } else valStr = fmt(p.v);
        const dd = new Date(p.t);
        tipEl.innerHTML = `<b>${dd.getMonth() + 1}월 ${dd.getDate()}일</b> · ${valStr}`;
        tipEl.style.opacity = '1';
        tipEl.style.left = Math.min((x(p.t) / W) * rect.width + 10, rect.width - 130) + 'px';
        tipEl.style.top = Math.max((y(p.v) / H) * rect.height - 32, 0) + 'px';
      });
      dot.addEventListener('mouseleave', () => { tipEl.style.opacity = '0'; });
      svg.appendChild(dot);
    }
    container.appendChild(svg);
  },
};
