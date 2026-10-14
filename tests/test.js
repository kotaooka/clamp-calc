// トグルクランプの計算の検算（node tests/test.js）。不一致が1件でもあれば終了コード 1
// ハンドル操作力は仮想仕事で求めているので、各部材の力とモーメントのつり合いから解き直して突き合わせる
const G = require('../js/clamp.js');
const RAD = Math.PI / 180;
let n = 0; const fails = [];
function check(name, got, exp, tol = 1e-9) {
  n++;
  const ok = got === exp || (typeof got === 'number' && typeof exp === 'number' && Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)));
  if (!ok) fails.push(`${name}: 計算 ${got} / 期待 ${exp}`);
}
const truthy = (name, v) => check(name, !!v, true);
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const len = v => Math.hypot(v[0], v[1]);
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const unit = v => { const l = len(v); return [v[0] / l, v[1] / l]; };
const clone = o => JSON.parse(JSON.stringify(o));

// 2 元 1 次方程式 [a b; c d][x; y] = [e; f]
function solve2(a, b, c, d, e, f) { const D = a * d - b * c; return [(e * d - b * f) / D, (a * f - e * c) / D]; }

// つり合いから求めたハンドル操作力（握りにハンドルと直角に掛ける力の大きさ。閉じる向きの正負は仮想仕事側と同じ向きの n で比べる）
function staticFh(type, q, F, nv) {
  const tauS = (q.S[0] - q.A[0]) * F; // 当たり面からスピンドルへの上向きの力 F による、A まわりのモーメント
  if (type === 'base') {
    // カップラ B–C は 2 力部材：押えアームへの力は u = (B−C) 方向に T
    const u = unit(sub(q.B, q.C));
    const T = -tauS / cross(sub(q.B, q.A), u);
    // ロッカ（ハンドル）D–C–H：C でカップラから −T·u、握りで Fh·n。D まわりのつり合い
    return -cross(sub(q.C, q.D), [-T * u[0], -T * u[1]]) / cross(sub(q.H, q.D), nv);
  }
  // 'arm'：ロッカ D–C は 2 力部材。ハンドル（カップラ）に C で T·u（u = (C−D) 方向）
  const u = unit(sub(q.C, q.D));
  // ハンドルのつり合い：B で押えアームから R、C で T·u、握りで Fh·n。押えアームへの力は −R = T·u + Fh·n
  // (1) ハンドルの B まわり：cross(C−B, u)·T + cross(H−B, n)·Fh = 0
  // (2) 押えアームの A まわり：tauS + cross(B−A, u)·T + cross(B−A, n)·Fh = 0
  const rB = sub(q.B, q.A);
  const [, Fh] = solve2(cross(sub(q.C, q.B), u), cross(sub(q.H, q.B), nv), cross(rB, u), cross(rB, nv), 0, -tauS);
  return Fh;
}

for (const key of ['arm', 'base']) {
  const ex = G.EXAMPLES[key];
  const r = G.analyze(clone(ex));
  truthy(`${key} 解析できる`, !r.error);
  if (r.error) continue;
  const P = ex.P;
  const L = { a: len(sub(P.B, P.A)), c: len(sub(P.C, P.B)), d: len(sub(P.C, P.D)), s: len(sub(P.S, P.A)), h: len(sub(P.H, key === 'arm' ? P.B : P.D)) };

  // 部材の長さがどの姿勢でも変わらない
  let worst = 0;
  for (const q of r.poses) {
    worst = Math.max(worst,
      Math.abs(len(sub(q.B, q.A)) - L.a), Math.abs(len(sub(q.C, q.B)) - L.c), Math.abs(len(sub(q.C, q.D)) - L.d),
      Math.abs(len(sub(q.S, q.A)) - L.s), Math.abs(len(sub(q.H, key === 'arm' ? q.B : q.D)) - L.h));
  }
  check(`${key} 部材の長さが一定`, worst, 0, 1e-9);

  // 先頭は開いた位置、末尾は入れた姿勢（ロック位置）
  check(`${key} 末尾 = ロック位置 B.x`, r.poses[r.poses.length - 1].B[0], P.B[0], 1e-9);
  check(`${key} ハンドル操作角度（刻み 1 つ分まで超える）`, r.opReached, ex.op, 0.2 / ex.op);
  // ハンドル角は閉じる向きに増え続ける
  truthy(`${key} ハンドル角が単調`, r.phi.every((v, i) => i === 0 || v > r.phi[i - 1]));

  // 死点：B・C・D がほぼ一直線（たどる刻み 0.02° の範囲）、スピンドルが最も低い、死点の角度は 0
  const q0 = r.poses[r.iDC];
  const sinBCD = cross(unit(sub(q0.C, q0.B)), unit(sub(q0.D, q0.C)));
  truthy(`${key} 死点で B・C・D が一直線（sin ${sinBCD.toExponential(2)}）`, Math.abs(sinBCD) < 0.02 * RAD * 5);
  check(`${key} 死点のハンドル角 = 0`, r.phi[r.iDC], 0);
  truthy(`${key} 死点でスピンドルが最も低い`, r.poses.every(q => q.S[1] >= q0.S[1] - 1e-12));

  // 締圧力：死点で k·e、ロックでは死点より小さく 0 より大きい、死点越え角は正
  check(`${key} 最大締圧力 = k·e`, r.Fpeak, ex.k * ex.e);
  check(`${key} 死点の締圧力`, r.F[r.iDC], ex.k * ex.e, 1e-12);
  truthy(`${key} ロック時の締圧力 < 最大`, r.Flock < r.Fpeak && r.Flock > 0);
  truthy(`${key} 死点越え角 > 0`, r.beta > 0);
  check(`${key} ロック時の締圧力 = k·(e − 戻り)`, r.Flock, ex.k * (ex.e - r.dropLock), 1e-9);

  // 締圧力は剛性に比例、ハンドル操作力も剛性に比例
  const r2 = G.analyze({ ...clone(ex), k: ex.k * 2 });
  check(`${key} 剛性 2 倍で締圧力 2 倍`, r2.Flock, r.Flock * 2, 1e-9);
  check(`${key} 剛性 2 倍で操作力 2 倍`, r2.FhMax, r.FhMax * 2, 1e-9);

  // ハンドル操作力：仮想仕事の値と、つり合いから解いた値が一致（当たっている範囲の数点）
  const nC = r.F.findIndex(v => v > 0);
  const pick = [nC + 5, Math.round((nC + r.iDC) / 2), r.iDC - 5, r.iDC + 5, r.poses.length - 3].filter(i => i > 0 && i < r.poses.length - 1);
  for (const i of pick) {
    const q = r.poses[i];
    // 仮想仕事側と同じ向きの n（握りが閉じる向きに動く側）
    const ax = unit(sub(q.H, q.pivot)); let nv = [-ax[1], ax[0]];
    const dH = sub(r.poses[i + 1].H, r.poses[i - 1].H);
    if (nv[0] * dH[0] + nv[1] * dH[1] < 0) nv = [-nv[0], -nv[1]];
    const fs = staticFh(key, q, r.F[i], nv);
    check(`${key} 操作力のつり合い検算 φ=${r.phi[i].toFixed(2)}°`, r.Fh[i], fs, 2e-3);
  }
  // 死点の直前は押す力が要り、死点の直後は勝手に閉じる向き（負）
  truthy(`${key} 死点の手前は正`, r.Fh[r.iDC - 10] > 0);
  truthy(`${key} 死点を越えると負`, r.Fh[r.iDC + 10] < 0);
  truthy(`${key} 死点の操作力はほぼ 0`, Math.abs(r.Fh[r.iDC]) < r.FhMax * 0.05);

  // 死点のリンク力：押えアームの A まわりのつり合い
  const u = unit(sub(q0.B, q0.C));
  check(`${key} 死点のリンク力のつり合い`, (q0.S[0] - q0.A[0]) * r.Fpeak + cross(sub(q0.B, q0.A), [r.FLink * u[0], r.FLink * u[1]]), 0, 1e-9);

  // カタログ値の換算：支点からの距離に反比例
  check(`${key} 許容締圧力`, r.allow.F, ex.rated.F * ex.rated.r / Math.abs(P.S[0] - P.A[0]));

  // 調整量 0：死点で当たるだけで、締圧力は 0
  const r0 = G.analyze({ ...clone(ex), e: 0 });
  check(`${key} 調整量 0 で締圧力 0`, r0.Fpeak + r0.Flock, 0);
}

// ロック位置がちょうど死点のとき：死点越え角 0、ロック時の締圧力 = 最大
{
  const ex = clone(G.EXAMPLES.base);
  const P = ex.P, t = 0.45;
  P.C = [P.B[0] + t * (P.D[0] - P.B[0]), P.B[1] + t * (P.D[1] - P.B[1])];
  const r = G.analyze(ex);
  truthy('死点ちょうど 解析できる', !r.error);
  if (!r.error) { check('死点ちょうど 死点越え角', r.beta, 0, 1e-6); check('死点ちょうど 締圧力', r.Flock, r.Fpeak, 1e-6); }
}

// 入力の誤り
{
  const ex = clone(G.EXAMPLES.arm);
  truthy('剛性 0 は誤り', G.analyze({ ...ex, k: 0 }).error);
  truthy('調整量が負は誤り', G.analyze({ ...ex, e: -1 }).error);
  truthy('操作角度 0 は誤り', G.analyze({ ...ex, op: 0 }).error);
  const z = clone(ex); z.P.C = z.P.B.slice();
  truthy('長さ 0 の部材は誤り', G.analyze(z).error);
  const m = clone(ex); m.P.A = [NaN, 0];
  truthy('座標が空は誤り', G.analyze(m).error);
  // 死点を通らない機構（ロッカが短く、B・C・D が並ばない）
  const nd = clone(ex); nd.P.C = [-20, 90]; nd.op = 20;
  truthy('死点がなければ誤り', G.analyze(nd).error);
}

// 2 円の交点
{
  const x = G.circles([0, 0], 5, [8, 0], 5);
  check('2円の交点 x', x[0][0], 4); check('2円の交点 y', Math.abs(x[0][1]), 3);
  check('離れた2円は交わらない', G.circles([0, 0], 1, [5, 0], 1), null);
}

console.log(`検算 ${n} 件中 不一致 ${fails.length} 件`);
if (fails.length) { fails.forEach(s => console.log('  ✕ ' + s)); process.exit(1); }
