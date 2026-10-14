// 画面処理：入力の読み取り、機構の作図とドラッグ、グラフ、結果の表示、テーマ、オフライン対応
(function () {
  'use strict';
  const { analyze, EXAMPLES } = window.ClampCalc;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // 3 桁区切りで d 桁に丸める
  const fmt = (v, d = 0) => !Number.isFinite(v) ? '―' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fN = v => fmt(v, Math.abs(v) >= 100 ? 0 : 1);       // 力 [N]
  const fA = v => fmt(v, Math.abs(v) >= 10 ? 1 : 2);        // 角度 [°]
  function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2200); }
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } } };
  const KEY = 'clamp-calc-inputs';
  const NAMES = ['A', 'B', 'C', 'D', 'S', 'H'];

  // 点の説明（ハンドルの付き方で B・C・D の呼び方が変わる）
  const DESC = {
    arm: { A: '押えアームの支点（台座）', B: '押えアームとハンドルの結合点', C: 'ハンドルとリンクの結合点', D: 'リンクの支点（台座）', S: 'スピンドル先端（ワークに当たる点）', H: 'ハンドルの握り位置' },
    base: { A: '押えアームの支点（台座）', B: '押えアームとリンクの結合点', C: 'リンクとハンドルの結合点', D: 'ハンドルの支点（台座）', S: 'スピンドル先端（ワークに当たる点）', H: 'ハンドルの握り位置' }
  };

  // ---- 入力 ----
  const num = s => { const t = String(s ?? '').trim().replace(/[０-９．－]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/,/g, ''); return t === '' ? NaN : Number(t); };
  let st = null;
  function fromExample(type) {
    const ex = EXAMPLES[type];
    const P = {}; NAMES.forEach(k => { P[k] = [String(ex.P[k][0]), String(ex.P[k][1])]; });
    return { type, P, k: String(ex.k), e: String(ex.e), op: String(ex.op), rf: String(ex.rated.F), rr: String(ex.rated.r), turns: '', pitch: '', zoom: st ? st.zoom : 'near' };
  }
  st = store.get(KEY);
  if (!st || !st.P || !NAMES.every(k => Array.isArray(st.P[k]))) st = fromExample('arm');
  const save = () => store.set(KEY, st);

  function buildTable() {
    const d = DESC[st.type];
    $('pts').innerHTML = `<tr><th></th><th>X [mm]</th><th>Y [mm]</th></tr>` + NAMES.map(k =>
      `<tr><th><b>${k}</b><small>${esc(d[k])}</small></th><td><input type="text" inputmode="decimal" id="p-${k}-0" aria-label="${k} の X"></td><td><input type="text" inputmode="decimal" id="p-${k}-1" aria-label="${k} の Y"></td></tr>`).join('');
    NAMES.forEach(k => [0, 1].forEach(j => {
      const el = $(`p-${k}-${j}`); el.value = st.P[k][j];
      el.addEventListener('input', () => { st.P[k][j] = el.value; atLock(); save(); render(); });
    }));
  }
  const FIELDS = ['k', 'e', 'op', 'rf', 'rr', 'turns', 'pitch'];
  function fillFields() { FIELDS.forEach(f => { $(f).value = st[f] ?? ''; }); }
  FIELDS.forEach(f => $(f).addEventListener('input', () => { st[f] = $(f).value; if (f !== 'turns' && f !== 'pitch') { save(); render(); } else save(); }));
  function setType(t) {
    st.type = t;
    document.querySelectorAll('#type button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
    buildTable();
  }
  document.querySelectorAll('#type button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.v === st.type) return;
    // 付き方を変えたら、その付き方の例に入れ替える（点の意味が変わるため）
    const z = st.zoom; st = fromExample(b.dataset.v); st.zoom = z;
    setType(st.type); fillFields(); atLock(); save(); render();
    toast('ハンドルの付き方を変えたので、その例を入れました');
  }));
  $('example').addEventListener('click', () => { const z = st.zoom; st = fromExample(st.type); st.zoom = z; setType(st.type); fillFields(); atLock(); save(); render(); });
  $('toE').addEventListener('click', () => {
    const t = num(st.turns), p = num(st.pitch);
    if (!(t >= 0) || !(p > 0)) { toast('回転数とピッチを入れてください'); return; }
    st.e = String(+(t * p).toFixed(4)); $('e').value = st.e; save(); render();
  });
  document.querySelectorAll('#zoom button').forEach(b => b.addEventListener('click', () => { st.zoom = b.dataset.v; save(); render(); }));

  function readInputs() {
    const bad = new Set();
    const P = {};
    NAMES.forEach(k => { P[k] = [0, 1].map(j => { const v = num(st.P[k][j]); if (!Number.isFinite(v)) bad.add(`p-${k}-${j}`); return v; }); });
    const k = num(st.k), e = num(st.e), op = num(st.op), rf = num(st.rf), rr = num(st.rr);
    if (!(k > 0)) bad.add('k'); if (!(e >= 0)) bad.add('e'); if (!(op > 0 && op <= 180)) bad.add('op');
    if (String(st.rf).trim() !== '' && !(rf > 0)) bad.add('rf'); if (String(st.rr).trim() !== '' && !(rr > 0)) bad.add('rr');
    document.querySelectorAll('input.bad').forEach(el => el.classList.remove('bad'));
    bad.forEach(id => { const el = $(id); if (el) el.classList.add('bad'); });
    return { type: st.type, P, k, e, op, rated: rf > 0 && rr > 0 ? { F: rf, r: rr } : null };
  }

  // ---- 表示するハンドル角（null = ロック位置） ----
  let cur = null, res = null, inp = null;
  function atLock() { cur = null; stopPlay(); }
  function curIndex() {
    if (!res || res.error) return -1;
    const n = res.phi.length;
    if (cur == null) return n - 1;
    const s = window.ClampCalc.sampleAt(res, cur);
    return s.t < 0.5 ? s.i : s.i + 1;
  }

  // ---- 作図：機構 ----
  let frozen = null;
  function frame(pts, W, H, pad) {
    if (frozen) return frozen;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-9), (H - 2 * pad) / Math.max(y1 - y0, 1e-9));
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    return { W, H, sc, span: Math.max(x1 - x0, y1 - y0), P: p => [ox + (p[0] - x0) * sc, H - (oy + (p[1] - y0) * sc)], inv: q => [x0 + (q[0] - ox) / sc, y0 + (H - q[1] - oy) / sc] };
  }
  let lastFrame = null;
  const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" font-family="${esc(css('--f-ui'))}">`;
  function gridLines(W, H) {
    let s = '';
    for (let x = 20; x < W; x += 20) s += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="${css('--grid')}"/>`;
    for (let y = 20; y < H; y += 20) s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${css('--grid')}"/>`;
    return s;
  }
  const pl = (F, pts) => pts.map(p => F.P(p).map(v => v.toFixed(1)).join(',')).join(' ');
  function bodies(F, q, type, opt) {
    const w = opt.ghost ? 2 : 1;
    const cA = opt.ghost ? css('--muted') : css('--ink'), cH = opt.ghost ? css('--muted') : css('--accent'), cL = opt.ghost ? css('--muted') : css('--ink2');
    const op = opt.ghost ? ' stroke-opacity=".55" stroke-dasharray="4 3"' : '';
    const sw = k => (opt.ghost ? 1.4 : k * w);
    const handle = type === 'arm' ? [q.C, q.B, q.H] : [q.C, q.D, q.H];
    const link = type === 'arm' ? [q.C, q.D] : [q.B, q.C];
    let s = '';
    s += `<polyline points="${pl(F, link)}" fill="none" stroke="${cL}" stroke-width="${sw(4)}" stroke-linecap="round"${op}/>`;
    s += `<polyline points="${pl(F, [q.B, q.A, q.S])}" fill="none" stroke="${cA}" stroke-width="${sw(6)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
    s += `<polyline points="${pl(F, handle)}" fill="none" stroke="${cH}" stroke-width="${sw(5)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
    return s;
  }
  function drawMech() {
    const W = 560, H = 360;
    const iCur = curIndex();
    const lockP = inp.P;
    const okP = NAMES.every(k => lockP[k].every(Number.isFinite));
    if (!okP) { $('mech').innerHTML = ''; lastFrame = null; return; }
    const lock = res && !res.error ? res.poses[res.poses.length - 1] : { ...lockP, pivot: st.type === 'arm' ? lockP.B : lockP.D };
    const q = iCur >= 0 ? res.poses[iCur] : lock;
    const yc = res && !res.error ? res.poses[res.iDC].S[1] + inp.e : lock.S[1];
    // 図の範囲：全開からロックまでの全姿勢が収まるように（ハンドルを動かしても図が動かない）
    const pts = [];
    const src = res && !res.error ? res.poses.filter((_, i, a) => i % 25 === 0 || i === a.length - 1) : [lock];
    src.forEach(p => NAMES.forEach(k => pts.push(p[k])));
    const base = Math.min(lockP.A[1], lockP.D[1], yc) - 14;
    pts.push([lockP.S[0] + 22, base], [lockP.S[0] - 22, base]);
    const F = frame(pts, W, H, 26);
    lastFrame = F;
    let s = svgOpen(W, H, 'トグルクランプの機構図') + gridLines(W, H);
    const ink = css('--ink'), mut = css('--muted'), sf = css('--surface'), ln = css('--line');
    // 台座（A・D と底板）
    const bx0 = Math.min(lockP.A[0], lockP.D[0]) - 10, bx1 = Math.max(lockP.A[0], lockP.D[0]) + 10;
    s += `<polygon points="${pl(F, [[bx0, base], [bx1, base], [lockP.A[0] + 6, lockP.A[1]], [lockP.A[0] - 6, lockP.A[1]]])}" fill="${ln}" fill-opacity=".7"/>`;
    s += `<polygon points="${pl(F, [[bx0, base], [bx1, base], [lockP.D[0] + 6, lockP.D[1]], [lockP.D[0] - 6, lockP.D[1]]])}" fill="${ln}" fill-opacity=".7"/>`;
    // ワーク（当たり面 yc より下）
    const wx0 = lockP.S[0] - 22, wx1 = lockP.S[0] + 22;
    const [p0x, p0y] = F.P([wx0, yc]), [p1x, p1y] = F.P([wx1, base]);
    s += `<rect x="${p0x}" y="${p0y}" width="${p1x - p0x}" height="${Math.max(0, p1y - p0y)}" fill="${ln}" fill-opacity=".45" stroke="${mut}" stroke-width="1"/>`;
    if (p1y - p0y > 16) s += `<text x="${(p0x + p1x) / 2}" y="${p1y - 5}" font-size="11" fill="${mut}" text-anchor="middle">ワーク</text>`;
    // 底板の線
    const [g0x, gy] = F.P([Math.min(bx0, wx0) - 8, base]), [g1x] = F.P([Math.max(bx1, wx1) + 8, base]);
    s += `<line x1="${g0x}" x2="${g1x}" y1="${gy}" y2="${gy}" stroke="${mut}" stroke-width="1.5"/>`;
    // ロック位置の残像（ほかの姿勢を表示しているとき）
    if (iCur >= 0 && iCur !== res.poses.length - 1) s += bodies(F, lock, st.type, { ghost: true });
    // 死点の線 B–D
    s += `<line x1="${F.P(q.B)[0]}" y1="${F.P(q.B)[1]}" x2="${F.P(q.D)[0]}" y2="${F.P(q.D)[1]}" stroke="${mut}" stroke-width="1" stroke-dasharray="5 4"/>`;
    s += bodies(F, q, st.type, {});
    // 支点・結合点
    ['A', 'B', 'C', 'D'].forEach(k => { const [x, y] = F.P(q[k]); s += `<circle cx="${x}" cy="${y}" r="4.5" fill="${sf}" stroke="${ink}" stroke-width="1.6"/>`; });
    // スピンドル先端
    { const [x, y] = F.P(q.S); s += `<path d="M${x - 6} ${y - 10} L${x + 6} ${y - 10} L${x} ${y} Z" fill="${ink}"/>`; }
    // 締圧力の矢印（ワークからの反力。上向き）
    if (iCur >= 0 && res.F[iCur] > 0) {
      const [x, y] = F.P(q.S), c1 = css('--s1');
      s += `<line x1="${x + 14}" y1="${y + 26}" x2="${x + 14}" y2="${y + 4}" stroke="${c1}" stroke-width="2.4"/><path d="M${x + 9} ${y + 10} L${x + 14} ${y + 2} L${x + 19} ${y + 10}" fill="none" stroke="${c1}" stroke-width="2.4"/>`;
      s += `<text x="${x + 22}" y="${y + 22}" font-size="12" fill="${c1}" font-family="${esc(css('--f-num'))}">F ${esc(fN(res.F[iCur]))} N</text>`;
    }
    // 名前
    NAMES.forEach(k => {
      const [x, y] = F.P(q[k]);
      const dx = k === 'S' ? -16 : k === 'H' ? 10 : 8, dy = k === 'S' ? -12 : -8;
      s += `<text x="${x + dx}" y="${y + dy}" font-size="13" font-weight="700" fill="${ink}" font-family="${esc(css('--f-num'))}">${k}</text>`;
    });
    // ドラッグのつまみ（ロック位置を表示しているときだけ）
    if (iCur < 0 || iCur === res.poses.length - 1) {
      const acc = css('--accent');
      NAMES.forEach(k => {
        const [x, y] = F.P(lockP[k]);
        s += `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${acc}" stroke-width="2" pointer-events="none"/><circle class="hd" data-k="${k}" cx="${x}" cy="${y}" r="18" fill="${acc}" fill-opacity="0"><title>${k} をドラッグして動かす</title></circle>`;
      });
    }
    $('mech').innerHTML = s + '</svg>';
  }

  // ドラッグ（ロック位置の点を動かす）
  const stepOf = span => 10 ** Math.floor(Math.log10(span / 300));
  const snap = (v, stp) => String(+(Math.round(v / stp) * stp).toFixed(Math.max(0, -Math.round(Math.log10(stp)))));
  let drag = null;
  const mech = $('mech');
  mech.addEventListener('pointerdown', e => {
    const h = e.target.closest('.hd'); if (!h || !lastFrame) return;
    e.preventDefault(); stopPlay();
    drag = { k: h.dataset.k, F: lastFrame }; frozen = drag.F;
    try { mech.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ }
    mech.classList.add('dragging');
  });
  mech.addEventListener('pointermove', e => {
    if (!drag) return;
    const svg = mech.querySelector('svg'); if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = pt.matrixTransform(svg.getScreenCTM().inverse());
    const q = drag.F.inv([m.x, m.y]);
    const stp = stepOf(drag.F.span);
    st.P[drag.k] = [snap(q[0], stp), snap(q[1], stp)];
    $(`p-${drag.k}-0`).value = st.P[drag.k][0]; $(`p-${drag.k}-1`).value = st.P[drag.k][1];
    cur = null; render();
  });
  const endDrag = () => { if (!drag) return; drag = null; frozen = null; mech.classList.remove('dragging'); save(); render(); };
  mech.addEventListener('pointerup', endDrag); mech.addEventListener('pointercancel', endDrag);

  // ---- グラフ ----
  function niceTicks(lo, hi, nt = 4) {
    const span = hi - lo || 1, raw = span / nt, p = 10 ** Math.floor(Math.log10(raw));
    const m = [1, 2, 2.5, 5, 10].find(v => v * p >= raw) * p;
    const t = []; for (let v = Math.ceil(lo / m) * m; v <= hi + m * 1e-9; v += m) t.push(+v.toFixed(10));
    return { t, step: m };
  }
  let plotMap = null;
  function drawPlot() {
    if (!res || res.error) { $('plot').innerHTML = ''; plotMap = null; return; }
    // 狭い画面では描く幅を詰めて、文字が小さくなりすぎないようにする
    const W = $('plot').clientWidth < 480 ? 400 : 560, H = W < 560 ? 300 : 330, L = 50, R = 12, T = 14, gap = 30, ph = (H - T - 30 - gap) / 2;
    const n = res.phi.length, pEnd = res.phi[n - 1];
    let xmin = res.phi[0];
    if (st.zoom === 'near') xmin = Math.max(res.phi[0], Math.min(-8, (res.phiContact ?? -8) * 1.6));
    const xmax = pEnd + Math.max(0.3, (pEnd - xmin) * 0.04);
    const X = v => L + (v - xmin) / (xmax - xmin) * (W - L - R);
    const i0 = Math.max(0, res.phi.findIndex(v => v >= xmin) - 1);
    const Fmax = Math.max(...res.F.slice(i0), 1);
    const hs = res.Fh.slice(i0), hMax = Math.max(...hs, 0), hMin = Math.min(...hs, 0);
    const panels = [
      { y0: T, lo: 0, hi: Fmax * 1.12, arr: res.F, c: css('--s1'), name: '締圧力 [N]' },
      { y0: T + ph + gap, lo: hMin < 0 ? hMin * 1.15 : 0, hi: Math.max(hMax * 1.15, 1e-6), arr: res.Fh, c: css('--s2'), name: '操作力 [N]' }
    ];
    const ink2 = css('--ink2'), mut = css('--muted'), gr = css('--grid'), ln = css('--line'), num = esc(css('--f-num'));
    let s = svgOpen(W, H, '締圧力とハンドル操作力のグラフ');
    const xt = niceTicks(xmin, xmax, 6);
    for (const p of panels) {
      const Y = v => p.y0 + ph - (v - p.lo) / (p.hi - p.lo) * ph;
      p.Y = Y;
      s += `<rect x="${L}" y="${p.y0}" width="${W - L - R}" height="${ph}" fill="${css('--surface')}" stroke="${ln}"/>`;
      const yt = niceTicks(p.lo, p.hi, 4);
      yt.t.forEach(v => { const y = Y(v); if (y < p.y0 - 0.5 || y > p.y0 + ph + 0.5) return; s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${v === 0 ? mut : gr}"/><text x="${L - 6}" y="${y + 4}" font-size="11" fill="${ink2}" text-anchor="end" font-family="${num}">${esc(fmt(v, yt.step < 1 ? 1 : 0))}</text>`; });
      xt.t.forEach(v => { const x = X(v); s += `<line x1="${x}" x2="${x}" y1="${p.y0}" y2="${p.y0 + ph}" stroke="${gr}"/>`; });
      s += `<text x="${L + 6}" y="${p.y0 + 14}" font-size="11" fill="${ink2}">${esc(p.name)}</text>`;
      // 線（間引いて描く）
      let d = ''; const stp = Math.max(1, Math.floor(n / 1200));
      for (let i = i0; i < n; i += stp) d += `${d ? 'L' : 'M'}${X(res.phi[i]).toFixed(1)} ${Y(p.arr[i]).toFixed(1)}`;
      d += `L${X(res.phi[n - 1]).toFixed(1)} ${Y(p.arr[n - 1]).toFixed(1)}`;
      s += `<path d="${d}" fill="none" stroke="${p.c}" stroke-width="2.2" stroke-linejoin="round"/>`;
    }
    // 目盛（横軸）
    const yb = T + 2 * ph + gap;
    xt.t.forEach(v => { s += `<text x="${X(v)}" y="${yb + 15}" font-size="11" fill="${ink2}" text-anchor="middle" font-family="${num}">${esc(fmt(v, xt.step < 1 ? 1 : 0))}</text>`; });
    s += `<text x="${W - R}" y="${yb + 28}" font-size="11" fill="${ink2}" text-anchor="end">ハンドル角（死点 0°）[°]</text>`;
    // 当たり始め・死点・ロックの線
    const marks = [[res.phiContact, '当たり'], [0, '死点'], [pEnd, 'ロック']];
    marks.forEach(([v, t], j) => {
      if (v == null || v < xmin) return; const x = X(v);
      s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${yb}" stroke="${mut}" stroke-dasharray="4 3"/>`;
      s += `<text x="${x + (j === 2 ? -4 : 4)}" y="${yb - 6}" font-size="10.5" fill="${mut}" text-anchor="${j === 2 ? 'end' : 'start'}">${t}</text>`;
    });
    // 最大操作力の点
    { const x = X(res.phiFhMax), y = panels[1].Y(res.FhMax); s += `<circle cx="${x}" cy="${y}" r="3.5" fill="${panels[1].c}"/><text x="${x + 7}" y="${y + 4}" font-size="11" fill="${ink2}" font-family="${num}">最大 ${esc(fN(res.FhMax))} N</text>`; }
    // 今のハンドル角
    const ic = curIndex(), vc = res.phi[ic];
    if (vc >= xmin) {
      const x = X(vc); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${yb}" stroke="${css('--accent')}" stroke-width="1.6"/>`;
      panels.forEach(p => { s += `<circle cx="${x}" cy="${p.Y(p.arr[ic])}" r="4.5" fill="${css('--surface')}" stroke="${css('--accent')}" stroke-width="2"/>`; });
    }
    $('plot').innerHTML = s + '</svg>';
    plotMap = { inv: x => xmin + (x - L) / (W - L - R) * (xmax - xmin), W };
  }
  // グラフを横になぞると、そのハンドル角の姿勢を出す
  const plot = $('plot');
  let plotDrag = false;
  function plotAt(e) {
    const svg = plot.querySelector('svg'); if (!svg || !plotMap || !res || res.error) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const v = plotMap.inv(pt.matrixTransform(svg.getScreenCTM().inverse()).x);
    const p = res.phi; stopPlay();
    cur = Math.min(p[p.length - 1], Math.max(p[0], v));
    if (cur >= p[p.length - 1]) cur = null;
    renderView();
  }
  plot.addEventListener('pointerdown', e => { plotDrag = true; try { plot.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ } plotAt(e); });
  plot.addEventListener('pointermove', e => { if (plotDrag) plotAt(e); });
  plot.addEventListener('pointerup', () => { plotDrag = false; });
  plot.addEventListener('pointercancel', () => { plotDrag = false; });

  // ---- スライダと再生 ----
  const ang = $('ang');
  ang.addEventListener('input', () => {
    if (!res || res.error) return; stopPlay();
    const p = res.phi; const v = +ang.value;
    cur = v >= p[p.length - 1] - 1e-9 ? null : v; renderView();
  });
  $('toLock').addEventListener('click', () => { atLock(); renderView(); });
  let raf = 0;
  function stopPlay() { if (raf) { cancelAnimationFrame(raf); raf = 0; $('play').textContent = '開閉を動かす'; } }
  $('play').addEventListener('click', () => {
    if (raf) { stopPlay(); return; }
    if (!res || res.error) return;
    const p = res.phi, a = p[0], b = p[p.length - 1];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cur = a; renderView(); return; }
    const T0 = performance.now(), dur = 3200;
    $('play').textContent = '止める';
    // 開く → 閉じる。死点の付近はゆっくり（時間を角度の 3 乗根で割り振る）
    const step = now => {
      const t = ((now - T0) % (2 * dur)) / dur, u = t < 1 ? 1 - t : t - 1; // 1 → 0 → 1
      const w = Math.cbrt(2 * u - 1); // −1（全開）〜 0（死点）〜 1（ロック）
      cur = Math.min(b, Math.max(a, w <= 0 ? -w * a : w * b));
      if (cur >= b - 1e-9) cur = null;
      renderView();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  // ---- 結果 ----
  const copyRows = [];
  function renderResults() {
    const msgs = [];
    copyRows.length = 0;
    if (!res || res.error) {
      $('res').innerHTML = '';
      if (res && res.error) msgs.push(['err', res.error]);
      $('msgs').innerHTML = msgs.map(([k, t]) => `<div class="msg ${k}">${esc(t)}</div>`).join('');
      return;
    }
    const row = (th, v, u, sub, extra = '') => `<tr><th>${esc(th)}${sub ? `<small>${esc(sub)}</small>` : ''}</th><td>${esc(v)}<span class="u">${esc(u)}</span>${extra}</td></tr>`;
    let h = '<table class="res">';
    const add = (th, v, u, sub, extra) => { h += row(th, v, u, sub, extra); copyRows.push([th, v.replace(/,/g, ''), u]); };
    add('最大締圧力', fN(res.Fpeak), 'N', '死点を通るとき（k × e）',
      res.allow ? `<span class="judge ${res.allow.ok ? 'ok' : 'ng'}">${res.allow.ok ? '○ 許容内' : '✕ 超過'}</span>` : '');
    add('ロック時の締圧力', fN(res.Flock), 'N', `死点越えでスピンドルが ${fmt(res.dropLock, 3)} mm 戻った分を引いた値`);
    add('死点越え角', fA(res.beta), '°', 'ロック位置が死点を越えている角度（ハンドル）');
    add('当たり始め', res.phiContact == null ? '―' : fA(res.phiContact), '°', '死点を 0° としたハンドル角');
    add('最大ハンドル操作力', fN(res.FhMax), 'N', `ハンドル角 ${fA(res.phiFhMax)}° のとき。握りにハンドルと直角に掛ける力`);
    add('死点でのリンク力', fN(Math.abs(res.FLink)), 'N', res.FLink >= 0 ? '圧縮' : '引張');
    add('死点での支点 A の反力', fN(res.RA), 'N', '押えアームの支点ピンに掛かる力');
    if (res.allow) add('許容締圧力（カタログ換算）', fN(res.allow.F), 'N', `スピンドル位置 ${fmt(res.allow.r, 1)} mm での換算値`);
    add('押えアームの開き角', fA(res.armOpen), '°', `全開でスピンドルが ${fmt(res.liftOpen, 1)} mm 上がる`);
    h += '</table>';
    $('res').innerHTML = h;
    copyRows.unshift(['ハンドルの付き方', st.type === 'arm' ? '押えアームに付く' : '台座に付く', ''],
      ...NAMES.map(k => [`点 ${k}（X, Y）`, `${inp.P[k][0]}, ${inp.P[k][1]}`, 'mm']),
      ['等価剛性 k', String(inp.k), 'N/mm'], ['調整量 e', String(inp.e), 'mm'], ['ハンドル操作角度', String(inp.op), '°']);

    // 注意と判定の理由
    if (res.beta < 0.05) msgs.push(['warn', '! ロック位置が死点とほぼ同じです。ストッパで死点を少し越えた位置に止まるようにしないと、ワークからの反力でハンドルが開くおそれがあります。']);
    if (res.Flock <= 0) msgs.push(['err', '× ロック位置ではスピンドルが当たり面から離れ、締圧力が 0 です。調整量を増やすか、死点越え角を小さくしてください。']);
    if (res.contactAtOpen) msgs.push(['warn', '! 全開でもスピンドルが当たり面に届いています。調整量か開き角を見直してください。']);
    if (res.end !== 'op') msgs.push(['warn', `! ハンドルは ${fA(res.opReached)}° までしか開けません（${res.end === 'reverse' ? 'ハンドルの回る向きが逆になる' : 'リンクがそれ以上動かない'}ため）。そこまでで計算しています。`]);
    if (res.allow && !res.allow.ok) msgs.push(['err', `× 最大締圧力 ${fN(res.Fpeak)} N が、このスピンドル位置でのカタログ換算の許容値 ${fN(res.allow.F)} N を超えています。調整量を減らすか、スピンドルを支点に近づけてください。`]);
    if (!res.allow && (String(st.rf).trim() === '' || String(st.rr).trim() === '')) msgs.push(['info', 'カタログの締圧力とそのスピンドル位置を入れると、許容値と比べて判定します。']);
    $('msgs').innerHTML = msgs.map(([k, t]) => `<div class="msg ${k}">${esc(t)}</div>`).join('');
  }

  function renderView() {
    drawMech(); drawPlot();
    const ok = res && !res.error;
    ang.disabled = !ok; $('play').disabled = !ok; $('toLock').disabled = !ok;
    if (!ok) { $('readout').innerHTML = ''; $('angLabel').textContent = 'ハンドル角'; return; }
    const p = res.phi, i = curIndex();
    ang.min = p[0]; ang.max = p[p.length - 1]; ang.step = 0.01;
    if (document.activeElement !== ang) ang.value = cur == null ? p[p.length - 1] : cur;
    const phi = p[i];
    const where = i === p.length - 1 ? '（ロック位置）' : phi < (res.phiContact ?? -Infinity) ? '（当たる前）' : '';
    $('angLabel').textContent = `ハンドル角（死点 0°、閉じる向きが正）${where}`;
    $('readout').innerHTML = `<div><span>ハンドル角</span><b>${esc(fA(phi))}</b> <small>°</small></div><div><span>締圧力</span><b>${esc(fN(res.F[i]))}</b> <small>N</small></div><div><span>操作力</span><b>${esc(fN(res.Fh[i]))}</b> <small>N</small></div>`;
  }
  function render() {
    document.querySelectorAll('#zoom button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.zoom)));
    inp = readInputs();
    res = analyze(inp);
    if (res && !res.error && cur != null && (cur < res.phi[0] || cur > res.phi[res.phi.length - 1])) cur = null;
    renderView(); renderResults();
  }

  $('copy').addEventListener('click', () => {
    if (!copyRows.length) { toast('先に正しい値を入れてください'); return; }
    const text = copyRows.map(r => r.join('\t')).join('\n');
    const done = () => toast('コピーしました。Excel に貼り付けられます');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 失敗 */ }
      ta.remove(); toast(ok ? 'コピーしました。Excel に貼り付けられます' : 'コピーできませんでした。表を選んでコピーしてください');
    }
  });

  // ---- テーマ（QC Workbench の全ツールで共通のキー） ----
  const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: '表示：自動', light: '表示：ライト', dark: '表示：ダーク' }, THEME_KEY = 'qc-workbench-theme';
  const readTheme = () => { try { const t = localStorage.getItem(THEME_KEY); return THEMES.includes(t) ? t : 'auto'; } catch (e) { return 'auto'; } };
  let theme = readTheme();
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
    $('themeBtn').textContent = THEME_LABEL[t];
  }
  $('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 保存できない環境 */ }
    applyTheme(theme);
  });
  window.addEventListener('storage', e => { if (e.key === THEME_KEY || e.key === null) { theme = readTheme(); applyTheme(theme); } });
  applyTheme(theme);
  // テーマが変わったら図の色を描き直す
  new MutationObserver(() => renderView()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => renderView());
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderView, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderView());

  // ---- 初期表示 ----
  setType(st.type); fillFields(); render();

  // ---- オフライン対応 ----
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('新しい版を取り込みました。開き直すと反映されます'); });
        });
      }).catch(() => { /* 登録できない環境 */ });
    });
  }
})();
