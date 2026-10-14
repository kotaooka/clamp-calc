// 下方押え型トグルクランプの計算（リンク機構の幾何解析と、当たり部の弾性モデル）。ブラウザでも Node でも読み込める
//
// 機構は 4 節リンクとして扱う。座標は mm、Y 上向き。ロックした（ストッパに当たった）姿勢で点を与える
//   A：押えアームの支点（台座）      D：もう一つの台座側の支点
//   B：押えアームとカップラの結合点   C：カップラとロッカの結合点
//   S：スピンドル（押えボルト）が付く点（押えアーム上）
//   H：ハンドルの握り位置
// 押えアーム = A・B・S、カップラ = B・C、ロッカ = D・C
// ハンドルの付き方
//   'arm'  ：ハンドルが押えアームに付く（カップラがハンドル。握り H はカップラ上）。垂直ハンドル式に多い
//   'base' ：ハンドルが台座に付く（ロッカがハンドル。握り H はロッカ上）。水平ハンドル式に多い
// 死点：B・C・D が一直線に並ぶ姿勢。このとき押えアームが最も下がる
//
// 締圧力は「剛体リンクとして動かしたときにスピンドルが当たり面に食い込む量 δ」に、
// 機構・スピンドル・ワークをまとめた等価剛性 k を掛けて求める（F = k·δ）。
// 当たり面の高さは「死点で δ = e（調整量）になる高さ」とする。
// ハンドル操作力は仮想仕事の原理で求める（F·dδ = Fh·(握りの移動量のうちハンドルに直角な成分)）。摩擦・自重・戻しばねは入れない
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClampCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const len = v => Math.hypot(v[0], v[1]);
  const ang = v => Math.atan2(v[1], v[0]);
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const rot = (v, t) => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
  // 角度の差を −π〜π に収める
  const wrap = t => { while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; return t; };

  // 2 つの円の交点（中心 p0 半径 r0、中心 p1 半径 r1）。交わらなければ null
  function circles(p0, r0, p1, r1) {
    const dv = sub(p1, p0), dd = len(dv);
    if (dd < 1e-12 || dd > r0 + r1 + 1e-9 || dd < Math.abs(r0 - r1) - 1e-9) return null;
    const a = (r0 * r0 - r1 * r1 + dd * dd) / (2 * dd);
    const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
    const m = [p0[0] + a * dv[0] / dd, p0[1] + a * dv[1] / dd];
    const n = [-dv[1] / dd, dv[0] / dd];
    return [[m[0] + h * n[0], m[1] + h * n[1]], [m[0] - h * n[0], m[1] - h * n[1]]];
  }

  // 入力の点の検査。問題があれば文言を返す
  function checkPoints(P) {
    const names = ['A', 'B', 'C', 'D', 'S', 'H'];
    for (const k of names) {
      const p = P[k];
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return `点 ${k} の座標を入れてください。`;
    }
    const pairs = [['A', 'B', '押えアーム（A–B）'], ['B', 'C', 'カップラ（B–C）'], ['C', 'D', 'ロッカ（C–D）'], ['A', 'D', '台座（A–D）']];
    for (const [p, q, name] of pairs) if (len(sub(P[p], P[q])) < 1e-6) return `${name}の長さが 0 です。点を離してください。`;
    return null;
  }

  // ロッカの角度 psi での姿勢。prevB に近いほうの組み立て方を選ぶ（連続して動かすため）
  function makePoser(P, type) {
    const a = len(sub(P.B, P.A)), c = len(sub(P.C, P.B)), d = len(sub(P.C, P.D));
    const th0 = ang(sub(P.B, P.A));          // 押えアームの基準角
    const cp0 = ang(sub(P.C, P.B));          // カップラの基準角
    const ps0 = ang(sub(P.C, P.D));          // ロッカの基準角
    const vS = sub(P.S, P.A);
    const vH = type === 'arm' ? sub(P.H, P.B) : sub(P.H, P.D);
    return {
      psi0: ps0,
      at(psi, prevB) {
        const C = add(P.D, [d * Math.cos(psi), d * Math.sin(psi)]);
        const xs = circles(P.A, a, C, c);
        if (!xs) return null;
        const B = len(sub(xs[0], prevB)) <= len(sub(xs[1], prevB)) ? xs[0] : xs[1];
        const dth = wrap(ang(sub(B, P.A)) - th0);
        const dcp = wrap(ang(sub(C, B)) - cp0);
        const S = add(P.A, rot(vS, dth));
        const H = type === 'arm' ? add(B, rot(vH, dcp)) : add(P.D, rot(vH, psi - ps0));
        const pivot = type === 'arm' ? B : P.D;
        const hAng = type === 'arm' ? ang(sub(C, B)) : psi; // ハンドル（剛体）の向き
        return { psi, A: P.A, B, C, D: P.D, S, H, pivot, th: dth, hAng };
      }
    };
  }

  // 解析。o = { type, P, k, e, op, rated: { F, r } }
  //   k：等価剛性 [N/mm]  e：死点での食い込み量（調整量）[mm]  op：ハンドル操作角度 [°]
  //   rated：カタログの締圧力 F [N] と、その値が出るスピンドル位置（支点 A からの水平距離）r [mm]。省略可
  function analyze(o) {
    const P = o.P, type = o.type === 'base' ? 'base' : 'arm';
    const bad = checkPoints(P);
    if (bad) return { error: bad };
    if (!(o.k > 0)) return { error: '等価剛性は 0 より大きい値を入れてください。' };
    if (!(o.e >= 0)) return { error: '調整量は 0 以上の値を入れてください。' };
    if (!(o.op > 0 && o.op <= 180)) return { error: 'ハンドル操作角度は 0 より大きく 180° 以下で入れてください。' };

    const poser = makePoser(P, type);
    const ref = poser.at(poser.psi0, P.B);
    if (!ref || len(sub(ref.B, P.B)) > 1e-6) return { error: 'この点の組み合わせではリンクが組み立てられません。' };

    // 死点へ向かう向き：スピンドルが下がるほう
    const h = 0.02 * RAD;
    const yP = poser.at(poser.psi0 + h, P.B), yM = poser.at(poser.psi0 - h, P.B);
    let dir;
    if (yP && yM) dir = yP.S[1] <= yM.S[1] ? 1 : -1;
    else if (yP) dir = 1; else if (yM) dir = -1;
    else return { error: 'この点の組み合わせではリンクが動きません。' };

    // ロック位置から死点を越えて、開いた位置まで（ハンドルが op 回るまで）たどる
    const poses = [ref];
    let prev = ref, hTot = 0, end = 'op', hSign = 0;
    const maxN = Math.ceil(360 * RAD / h);
    for (let i = 1; i <= maxN; i++) {
      const q = poser.at(poser.psi0 + dir * i * h, prev.B);
      if (!q) { end = 'limit'; break; }
      q.hUn = (prev.hUn ?? prev.hAng) + wrap(q.hAng - prev.hAng); // ハンドル角を連続にする
      // ハンドルの回る向きが途中で逆になったら、そこで止める（それより先はハンドルを開く操作にならない）
      const st = q.hUn - (prev.hUn ?? prev.hAng);
      if (hSign === 0 && Math.abs(st) > 1e-9) hSign = Math.sign(st);
      else if (hSign !== 0 && st * hSign < -1e-12) { end = 'reverse'; break; }
      hTot = Math.abs(q.hUn - ref.hAng);
      poses.push(q); prev = q;
      if (hTot >= o.op * RAD) break;
      if (i === maxN) end = 'turn';
    }
    ref.hUn = ref.hAng;

    // 死点 = スピンドルの高さが最も低いところ（たどった順で最初の極小）
    let iDC = -1;
    for (let i = 1; i < poses.length - 1; i++) {
      if (poses[i].S[1] <= poses[i - 1].S[1] && poses[i].S[1] < poses[i + 1].S[1]) { iDC = i; break; }
    }
    // ロック位置そのものが死点のとき（両隣とも高い）
    // （下がるほうへ動かしても上がる = ロック位置がちょうど死点）
    if (iDC < 0 && poses.length > 1 && poses[1].S[1] > ref.S[1]) iDC = 0;
    if (iDC < 0) {
      return { error: end === 'limit'
        ? 'ハンドルを開く途中でリンクが動かなくなり、死点が見つかりません。点の位置を見直してください。'
        : end === 'reverse'
          ? 'ハンドルを開く途中でハンドルの回る向きが逆になり、死点が見つかりません。点の位置を見直してください。'
          : 'ハンドル操作角度の範囲に死点がありません。点の位置か操作角度を見直してください。' };
    }

    // 開いた側を先頭に並べ直す（閉じる向きに番号が増える）
    const seq = poses.slice().reverse();
    const n = seq.length, iD = n - 1 - iDC;
    const hDC = seq[iD].hUn;
    const sgn = Math.sign(seq[n - 1].hUn - seq[0].hUn) || 1; // 閉じる向きを正にする
    const yDC = seq[iD].S[1];
    const yc = yDC + o.e; // 当たり面の高さ

    const phi = [], F = [], Fh = [], delta = [];
    for (const q of seq) {
      const dl = Math.max(0, yc - q.S[1]);
      phi.push(sgn * (q.hUn - hDC) / RAD);
      delta.push(dl);
      F.push(o.k * dl);
    }
    // ハンドル操作力（握りに、ハンドルに直角に掛ける力。閉じる向きに押すのを正）
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const dH = sub(seq[i1].H, seq[i0].H);
      const ax = sub(seq[i].H, seq[i].pivot), al = len(ax);
      let nv = al > 1e-9 ? [-ax[1] / al, ax[0] / al] : [0, 0];
      let proj = nv[0] * dH[0] + nv[1] * dH[1];
      if (proj < 0) { nv = [-nv[0], -nv[1]]; proj = -proj; }
      const dDelta = delta[i1] - delta[i0];
      Fh.push(proj > 1e-12 && F[i] > 0 ? o.k * delta[i] * dDelta / proj : 0);
    }

    const lock = seq[n - 1], dc = seq[iD], open = seq[0];
    // 当たり始め
    let iC = F.findIndex(v => v > 0);
    const contactAtOpen = iC === 0;
    // 最大のハンドル操作力
    let iMax = 0; for (let i = 1; i < n; i++) if (Fh[i] > Fh[iMax]) iMax = i;

    // 死点でのリンク力と支点 A の反力（死点ではハンドル操作力が 0 なので、カップラは 2 力部材）
    const Fdc = o.k * o.e;
    const u = (() => { const v = sub(dc.B, dc.C), l = len(v); return [v[0] / l, v[1] / l]; })();
    const rS = sub(dc.S, dc.A), rB = sub(dc.B, dc.A);
    const tauS = rS[0] * Fdc;          // 当たり面からスピンドルに上向き Fdc
    const arm = cross(rB, u);
    const FL = Math.abs(arm) > 1e-12 ? -tauS / arm : NaN; // 圧縮を正
    const RA = Number.isFinite(FL) ? len([-(FL * u[0]), -(Fdc + FL * u[1])]) : NaN;

    // カタログ値からの許容締圧力（支点からの距離に反比例するとみなす）
    const rLock = Math.abs(lock.S[0] - lock.A[0]);
    let allow = null;
    if (o.rated && o.rated.F > 0 && o.rated.r > 0 && rLock > 1e-9) {
      allow = { F: o.rated.F * o.rated.r / rLock, r: rLock, ok: Fdc <= o.rated.F * o.rated.r / rLock + 1e-9 };
    }

    return {
      type, poses: seq, phi, F, Fh, delta, iDC: iD, iContact: iC, iMaxFh: iMax, end, contactAtOpen,
      beta: phi[n - 1],                         // 死点越え角 [°]
      opReached: Math.abs(seq[n - 1].hUn - seq[0].hUn) / RAD,
      Fpeak: Fdc,                               // 最大締圧力（死点）[N]
      Flock: F[n - 1],                          // ロック時の締圧力 [N]
      deltaLock: delta[n - 1],                  // ロック時の食い込み量 [mm]
      dropLock: lock.S[1] - yDC,                // 死点からロック位置までのスピンドルの戻り [mm]
      FhMax: Fh[iMax], phiFhMax: phi[iMax],
      phiContact: iC >= 0 ? phi[iC] : null,
      armOpen: Math.abs(wrap(open.th - lock.th)) / RAD, // 押えアームの開き角 [°]
      liftOpen: open.S[1] - lock.S[1],          // 開いたときのスピンドルの持ち上がり [mm]
      FLink: FL, RA, rLock, allow
    };
  }

  // ハンドル角（死点基準）phi での姿勢と値を、隣り合う点の線形補間で返す
  function sampleAt(res, phi) {
    const p = res.phi, n = p.length;
    if (phi <= p[0]) return { i: 0, t: 0 };
    if (phi >= p[n - 1]) return { i: n - 2, t: 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m] <= phi) lo = m; else hi = m; }
    return { i: lo, t: (phi - p[lo]) / ((p[hi] - p[lo]) || 1) };
  }

  // 例：垂直ハンドル式（ハンドルが押えアームに付く）と水平ハンドル式（ハンドルが台座に付く）の寸法の例。実在の製品の寸法ではない
  const EXAMPLES = {
    arm: { type: 'arm', P: { A: [0, 30], B: [-10, 70], C: [-26.8, 44.5], D: [-45, 20], S: [70, 30], H: [-15, 200] }, k: 3000, e: 0.4, op: 60, rated: { F: 3000, r: 40 } },
    base: { type: 'base', P: { A: [0, 30], B: [-14, 52], C: [-24.5, 37.2], D: [-34, 22], S: [70, 30], H: [-170, 40] }, k: 2000, e: 0.3, op: 80, rated: { F: 1500, r: 40 } }
  };

  return { RAD, analyze, sampleAt, circles, EXAMPLES };
});
