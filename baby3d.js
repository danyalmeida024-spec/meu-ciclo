// Bebê 3D procedural: corpo modelado por campo de distância (SDF) + Surface Nets, renderizado com Three.js.
import * as THREE from './vendor/three.module.min.js';

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const L = (a, b, t) => a + (b - a) * cl(t);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------- modelo anatômico ----------
function modelFor(w) {
  const t = cl((w - 8) / 32), fat = cl((w - 24) / 14);
  const bs = w < 8 ? 0.5 : L(0.52, 1, (w - 8) / 24);
  const ls = L(0.45, 1, (w - 8) / 18);
  const adds = [], cuts = [], flush = [];
  const cap = (a, b, ra, rb, k = 0.04, list = adds) => {
    const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    list.push({ t: 0, ax: a[0], ay: a[1], az: a[2], bx, by, bz, inv: 1 / (bx * bx + by * by + bz * bz + 1e-9), ra, rb, k });
  };
  const ell = (c, r, k = 0.04, list = adds) => list.push({ t: 1, cx: c[0], cy: c[1], cz: c[2], irx: 1 / r[0], iry: 1 / r[1], irz: 1 / r[2], rmin: Math.min(...r), k });
  const both = (fn) => { fn(1); fn(-1); };
  const fl = (x, y, z, r, s) => flush.push([x, y, z, r, s]);
  const info = { eyes: null, heart: null, yolk: null, tail: false, stage: w <= 5 ? 0 : w <= 7 ? 1 : 2, bs, ls };

  if (w <= 5) {
    ell([-0.05, 0.02, 0], [0.5, 0.1, 0.26], 0.1);
    ell([0.3, 0.04, 0], [0.28, 0.14, 0.22], 0.1);
    ell([-0.35, 0.0, 0], [0.2, 0.08, 0.16], 0.08);
    ell([0.0, 0.11, 0], [0.5, 0.028, 0.045], 0.03, cuts);
    cap([0.0, -0.06, 0.02], [0.1, -0.34, 0.1], 0.045, 0.045, 0.05);
    info.yolk = [0.12, -0.55, 0.12, 0.34];
    info.heart = w >= 5 ? [0.22, 0.02, 0.14, 0.05] : null;
  } else if (w <= 7) {
    const big = w === 7, hs = big ? 1 : 0.9;
    ell([0.3, 0.36, 0], [0.34 * hs, 0.36 * hs, 0.3 * hs], 0.08);
    cap([0.22, 0.12, 0], [-0.12, -0.08, 0], 0.27, 0.22, 0.08);
    cap([-0.12, -0.08, 0], [-0.22, -0.4, 0], 0.22, 0.12, 0.07);
    cap([-0.22, -0.4, 0], [-0.02, -0.62, 0], 0.12, 0.03, 0.05);
    ell([0.19, 0.06, 0.2], [0.12, 0.13, 0.09], 0.06); fl(0.19, 0.06, 0.26, 0.14, 0.7);
    const bud = big ? 0.075 : 0.05;
    both(s => { ell([0.0, 0.04, 0.24 * s], big ? [0.09, 0.06, 0.02] : [bud, bud, bud], 0.04); ell([-0.12, -0.38, 0.17 * s], big ? [0.1, 0.07, 0.02] : [bud, bud, bud], 0.04); });
    for (let i = 0; i < 3; i++) both(s => ell([0.26 - i * 0.04, 0.13 - i * 0.02, 0.2 * s], [0.045, 0.04, 0.03], 0.03));
    cap([0.12, -0.2, 0.1], [0.3, -0.4, 0.18], 0.035, 0.035, 0.04);
    ell([0.4, 0.4, 0.28 * hs], [0.045, 0.05, 0.02], 0.02, cuts);
    info.eyes = [[0.47 * hs, 0.43, 0.2 * hs, 0.042 * hs], [0.47 * hs, 0.43, -0.2 * hs, 0.042 * hs]];
    info.yolk = [0.5, -0.5, 0.15, big ? 0.22 : 0.3]; info.heart = [0.19, 0.06, 0.2, 0.065]; info.tail = true;
  } else {
    const P = (o) => [0.17 + (o[0] - 0.17) * bs, 0.28 + (o[1] - 0.28) * bs, o[2]];
    const N = [0.17, 0.28, 0], s1 = P([-0.06, 0.14, 0]), s2 = P([-0.2, -0.12, 0]), s3 = P([-0.12, -0.4, 0]), R = P([0.06, -0.58, 0]);
    const rs = L(0.72, 1, (w - 8) / 20) * (1 + fat * 0.1), rr = [0.17, 0.22, 0.21, 0.18, 0.14].map(v => v * rs);
    cap(N, s1, rr[0], rr[1], 0.07); cap(s1, s2, rr[1], rr[2], 0.07); cap(s2, s3, rr[2], rr[3], 0.07); cap(s3, R, rr[3], rr[4], 0.07);
    ell([R[0] + 0.01, R[1] - 0.02, 0], [0.15 * rs, 0.13 * rs, 0.15 * rs], 0.06);
    // cabeça e rosto
    const hm = L(0.9, 1, (w - 8) / 20);
    ell([0.34, 0.52, 0], [0.27 * hm, 0.28 * hm, 0.25 * hm], 0.06); ell([0.28, 0.56, 0], [0.27 * hm, 0.26 * hm, 0.24 * hm], 0.07);
    ell([0.46, 0.36, 0], [0.12, 0.1, 0.1], 0.06);
    cap([0.28, 0.3, 0], N, 0.13, 0.15, 0.08);
    const cheek = L(0.5, 1, t);
    both(s => {
      ell([0.52, 0.46, 0.12 * s], [0.08 * cheek, 0.07 * cheek, 0.06 * cheek], 0.05);
      if (w >= 9) { ell([0.55, 0.585, 0.11 * s], [0.05, 0.03, 0.04], 0.015); ell([0.585, 0.585, 0.12 * s], [0.045, 0.006, 0.035], 0.012, cuts); }
      if (w >= 12) ell([0.545, 0.655, 0.11 * s], [0.04, 0.016, 0.06], 0.03);
      if (w >= 10) { ell([0.33, 0.5, 0.245 * s], [0.035, 0.062, 0.022], 0.02); ell([0.34, 0.5, 0.262 * s], [0.018, 0.032, 0.014], 0.012, cuts); fl(0.33, 0.5, 0.25 * s, 0.07, 0.8); }
      fl(0.52, 0.46, 0.14 * s, 0.1, 0.5);
    });
    if (w >= 11) { ell([0.625, 0.49, 0], [0.04, 0.045, 0.035], 0.03); cap([0.595, 0.58, 0], [0.62, 0.5, 0], 0.026, 0.026, 0.03); both(s => ell([0.64, 0.465, 0.018 * s], [0.012, 0.012, 0.012], 0.005, cuts)); fl(0.64, 0.49, 0, 0.06, 0.6); }
    if (w >= 12) { ell([0.58, 0.405, 0], [0.035, 0.016, 0.055], 0.012); ell([0.6, 0.4, 0], [0.04, 0.004, 0.05], 0.008, cuts); fl(0.6, 0.4, 0, 0.07, 0.9); }
    if (w === 8) info.eyes = [[0.545, 0.585, 0.12, 0.03], [0.545, 0.585, -0.12, 0.03]];
    // braços e mãos
    const lp = (a, o, k) => [a[0] + o[0] * k, a[1] + o[1] * k, a[2] + o[2] * k];
    const hk = L(0.75, 1, ls), ar = 0.05 * (1 + fat * 0.3);
    both(s => {
      const S = [lerp3(N, s1, 0.35)[0] + 0.1, lerp3(N, s1, 0.35)[1] + 0.04, 0.15 * s];
      const near = s > 0;
      const E = lp(S, [0.14, -0.16, 0.06 * s], ls), Wr = near ? lp(S, [0.36, 0.14, 0.04 * s], ls) : lp(S, [0.2, -0.05, -0.02 * s], ls);
      cap(S, E, ar, ar * 0.85, 0.05); cap(E, Wr, ar * 0.85, ar * 0.6, 0.04);
      const hc = lp(Wr, [0.05, 0.03, 0], ls);
      fl(hc[0], hc[1], hc[2], 0.09, 0.8);
      if (w >= 10) {
        ell(hc, [0.05 * hk, 0.032 * hk, 0.022 * hk], 0.02);
        for (let i = 0; i < 4; i++) {
          const a = [hc[0] + 0.035 * hk, hc[1] + 0.018 * (i - 1.5) * hk, hc[2]], b = [a[0] + 0.035 * hk, a[1] + 0.012 * hk, a[2] + 0.012 * hk * s], c = [b[0] + 0.012 * hk, b[1] + 0.024 * hk, b[2] + 0.008 * hk * s];
          cap(a, b, 0.0145 * hk, 0.0135 * hk, 0.014); cap(b, c, 0.0135 * hk, 0.0125 * hk, 0.012); ell(c, [0.013 * hk, 0.013 * hk, 0.013 * hk], 0.01);
        }
        cap([hc[0] - 0.01 * hk, hc[1] - 0.03 * hk, hc[2] + 0.02 * s * hk], [hc[0] + 0.035 * hk, hc[1] - 0.04 * hk, hc[2] + 0.03 * s * hk], 0.017 * hk, 0.014 * hk, 0.014);
      } else ell(hc, [0.055, 0.04, 0.014], 0.03);
    });
    // pernas e pés
    both(s => {
      const Hp = [(s2[0] + s3[0]) / 2 + 0.05, (s2[1] + s3[1]) / 2 - 0.02, 0.13 * s];
      const K = lp(Hp, [0.3, 0.14, 0.04 * s], ls), A = lp(Hp, [0.24, 0.44, 0.02 * s], ls);
      const th = 0.075 * (1 + fat * 0.3);
      cap(Hp, K, th, th * 0.8, 0.07); cap(K, A, th * 0.8, 0.04, 0.05);
      const fc = lp(A, [0.04, 0.03, 0], ls), fk = L(0.7, 1, ls);
      fl(fc[0], fc[1], fc[2], 0.09, 0.7);
      if (w >= 10) {
        ell(fc, [0.065 * fk, 0.026 * fk, 0.032 * fk], 0.02);
        for (let i = 0; i < 5; i++) { const a = [fc[0] + 0.05 * fk, fc[1] + 0.012 * (i - 2) * fk, fc[2] + 0.01 * (i - 2) * s * fk]; cap(a, [a[0] + 0.022 * fk, a[1] + 0.004 * fk, a[2]], 0.014 * fk * (1 - i * 0.06), 0.012 * fk, 0.01); }
      } else ell(fc, [0.07, 0.04, 0.014], 0.03);
    });
    info.cord = [[0.0, -0.22, -0.02], [0.12, -0.4, -0.2], [0.0, -0.7, -0.28], [-0.3, -0.82, -0.2]];
    info.heart = w <= 10 ? [0.1, 0.12, 0.17, 0.05] : null;
    cap([0.01, -0.2, -0.03], [0.06, -0.3, -0.1], 0.034, 0.03, 0.04);
  }
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const q of adds) { const pd = q.t === 0 ? dCap(x, y, z, q) : dEll(x, y, z, q); d = q.k > 0 ? smin(d, pd, q.k) : Math.min(d, pd); }
    for (const q of cuts) { const pd = q.t === 0 ? dCap(x, y, z, q) : dEll(x, y, z, q); d = smax(d, -pd, q.k || 0.01); }
    return d;
  };
  return { sdf, flush, info };
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function dCap(x, y, z, q) {
  const pax = x - q.ax, pay = y - q.ay, paz = z - q.az;
  let h = (pax * q.bx + pay * q.by + paz * q.bz) * q.inv; h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - q.bx * h, dy = pay - q.by * h, dz = paz - q.bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (q.ra + (q.rb - q.ra) * h);
}
function dEll(x, y, z, q) {
  const a = (x - q.cx) * q.irx, b = (y - q.cy) * q.iry, c = (z - q.cz) * q.irz;
  const k0 = Math.sqrt(a * a + b * b + c * c), k1 = Math.sqrt(a * a * q.irx * q.irx + b * b * q.iry * q.iry + c * c * q.irz * q.irz);
  return k1 < 1e-9 ? -q.rmin : k0 * (k0 - 1) / k1;
}

// ---------- malha (Surface Nets) ----------
const NX = 126, NY = 141, NZ = 69, H = 0.0125, X0 = -0.75, Y0 = -0.82, Z0 = -0.43;
function sampleField(sdf) {
  const F = new Float32Array(NX * NY * NZ), B = 3, band = H * B * 3.2;
  for (let bk = 0; bk < NZ; bk += B) for (let bj = 0; bj < NY; bj += B) for (let bi = 0; bi < NX; bi += B) {
    const d = sdf(X0 + (bi + 1) * H, Y0 + (bj + 1) * H, Z0 + (bk + 1) * H);
    const ie = Math.min(bi + B, NX), je = Math.min(bj + B, NY), ke = Math.min(bk + B, NZ);
    const exact = Math.abs(d) < band;
    for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++)
      F[i + NX * (j + NY * k)] = exact ? sdf(X0 + i * H, Y0 + j * H, Z0 + k * H) : d;
  }
  return F;
}
function polygonize(F) {
  const I = (i, j, k) => i + NX * (j + NY * k), cells = new Int32Array(NX * NY * NZ).fill(-1), P = [];
  const cx = [0, 1, 1, 0, 0, 1, 1, 0], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]], v = new Float32Array(8);
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    let m = 0;
    for (let c = 0; c < 8; c++) { const d = F[I(i + cx[c], j + cy[c], k + cz[c])]; v[c] = d; if (d < 0) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) if (((m >> a) & 1) !== ((m >> b) & 1)) { const t = v[a] / (v[a] - v[b]); sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++; }
    cells[I(i, j, k)] = P.length / 3; P.push(X0 + (i + sx / n) * H, Y0 + (j + sy / n) * H, Z0 + (k + sz / n) * H);
  }
  const idx = [], q = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < NZ - 2; k++) for (let j = 1; j < NY - 2; j++) for (let i = 1; i < NX - 2; i++) {
    const s0 = F[I(i, j, k)] < 0;
    if (s0 !== F[I(i + 1, j, k)] < 0) q(cells[I(i, j - 1, k - 1)], cells[I(i, j, k - 1)], cells[I(i, j, k)], cells[I(i, j - 1, k)]);
    if (s0 !== F[I(i, j + 1, k)] < 0) q(cells[I(i - 1, j, k - 1)], cells[I(i - 1, j, k)], cells[I(i, j, k)], cells[I(i, j, k - 1)]);
    if (s0 !== F[I(i, j, k + 1)] < 0) q(cells[I(i - 1, j - 1, k)], cells[I(i, j - 1, k)], cells[I(i, j, k)], cells[I(i - 1, j, k)]);
  }
  return { P, idx };
}
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

function bodyMesh(w, model) {
  const { sdf, flush } = model;
  const { P, idx } = polygonize(sampleField(sdf));
  const nV = P.length / 3, pos = new Float32Array(P), nor = new Float32Array(nV * 3), col = new Float32Array(nV * 3), thin = new Float32Array(nV), e = 0.006;
  const lin = a => a.map(v => Math.pow(v, 2.2)), base = lin(w < 14 ? [0.92, 0.5, 0.46] : w < 28 ? [0.9, 0.56, 0.47] : [0.94, 0.66, 0.55]), hot = lin([0.85, 0.27, 0.28]);
  for (let i = 0; i < nV; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nor[i * 3] = gx; nor[i * 3 + 1] = gy; nor[i * 3 + 2] = gz;
    let f = 0; for (const [fx, fy, fz, r, s] of flush) { const d = Math.hypot(x - fx, y - fy, z - fz); if (d < r) f = Math.max(f, s * (1 - d / r) ** 1.3); }
    const mot = (hash(Math.round(x * 90), Math.round(y * 90), Math.round(z * 90)) - 0.5) * 0.05;
    let c0 = base[0] + (hot[0] - base[0]) * f + mot, c1 = base[1] + (hot[1] - base[1]) * f + mot, c2 = base[2] + (hot[2] - base[2]) * f + mot;
    if (w >= 22 && y > 0.6 && x < 0.58 && x > 0.05) { const hh = cl((y - 0.6) / 0.1) * cl((w - 22) / 10) * 0.55; c0 += (0.2 - c0) * hh; c1 += (0.11 - c1) * hh; c2 += (0.08 - c2) * hh; }
    col[i * 3] = c0; col[i * 3 + 1] = c1; col[i * 3 + 2] = c2;
    thin[i] = cl(1 - (-sdf(x - gx * 0.045, y - gy * 0.045, z - gz * 0.045)) / 0.045);
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aThin', new THREE.BufferAttribute(thin, 1)); g.setIndex(idx);
  return g;
}

function skinMaterial(w) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.46, metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffb8a0), clearcoat: 0.22, clearcoatRoughness: 0.4, envMapIntensity: 0.55 });
  if (w < 12) { m.transparent = true; m.opacity = 0.9; }
  const fuzz = cl((w - 16) / 14) * 0.55;
  m.onBeforeCompile = sh => {
    sh.uniforms.uFuzz = { value: fuzz };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aThin;\nvarying float vThin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvThin = aThin;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vThin;\nuniform float uFuzz;').replace('#include <opaque_fragment>', `
      float fr = pow(1.0 - saturate(dot(normalize(vViewPosition), normalize(normal))), 2.2);
      outgoingLight += vec3(0.50, 0.09, 0.06) * fr * 0.55 + vec3(1.0, 0.30, 0.20) * vThin * (0.10 + 0.35 * fr) + vec3(1.0, 0.9, 0.8) * pow(fr, 2.6) * uFuzz;
      #include <opaque_fragment>`);
  };
  return m;
}

function buildBaby(w) {
  const model = modelFor(w), info = model.info, grp = new THREE.Group();
  const body = new THREE.Mesh(bodyMesh(w, model), skinMaterial(w));
  grp.add(body);
  body.geometry.computeBoundingBox();
  const c = new THREE.Vector3(); body.geometry.boundingBox.getCenter(c);
  const add = m => { grp.add(m); return m; };
  const ball = (x, y, z, r, mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.position.set(x, y, z); return add(m); };
  if (info.eyes) { const dk = new THREE.MeshStandardMaterial({ color: 0x1b0d0a, roughness: 0.25, metalness: 0.1 }); info.eyes.forEach(([x, y, z, r]) => ball(x, y, z, r, dk)); }
  if (info.heart) { const [x, y, z, r] = info.heart; const m = ball(x, y, z, r, new THREE.MeshStandardMaterial({ color: 0xb01c26, emissive: 0xd01830, emissiveIntensity: 1.1, roughness: 0.4 })); m.userData.heart = true; }
  if (info.yolk) { const [x, y, z, r] = info.yolk; ball(x, y, z, r, new THREE.MeshPhysicalMaterial({ color: 0xf3d27a, roughness: 0.35, clearcoat: 0.8, transparent: true, opacity: 0.92, emissive: 0x6b4f10, emissiveIntensity: 0.25 })); }
  if (info.cord) {
    const cv = new THREE.CatmullRomCurve3(info.cord.map(p => new THREE.Vector3(...p))), seg = 80, rad = 12, tg = new THREE.TubeGeometry(cv, seg, 0.03, rad, false);
    const cc = new Float32Array(tg.attributes.position.count * 3);
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= rad; j++) { const s = 0.5 + 0.5 * Math.sin(i * 0.55 + j / rad * Math.PI * 2 * 2); const k = (i * (rad + 1) + j) * 3; cc[k] = 0.78 + 0.15 * s; cc[k + 1] = 0.38 + 0.25 * s; cc[k + 2] = 0.42 + 0.22 * s; }
    tg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    add(new THREE.Mesh(tg, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, sheen: 0.5 })));
    const last = info.cord.at(-1), pl = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0x8a2e3a, roughness: 0.55, clearcoat: 0.4 }));
    pl.scale.set(0.24, 0.06, 0.22); pl.position.set(last[0] - 0.08, last[1] - 0.02, last[2]); pl.rotation.z = 0.5; add(pl);
  }
  return { grp, center: c };
}

// ---------- cena ----------
let renderer, scene, camera, root, babyGrp, sacs = [], particles, cur = null, host = null, spinY = -0.55, drag = null, raf = 0, ok = null;
const cache = new Map(), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function init() {
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return false; }
  if (!renderer.getContext()) return false;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9; renderer.setClearColor(0, 0);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20); camera.position.set(0, 0, 3.8);
  // iluminação de estúdio + reflexos
  const env = new THREE.Scene(), eg = new THREE.SphereGeometry(5, 32, 16), ec = [];
  for (let i = 0; i < eg.attributes.position.count; i++) { const y = eg.attributes.position.getY(i) / 5; ec.push(0.85 + 0.15 * y, 0.62 + 0.2 * y, 0.55 + 0.25 * y); }
  eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3)); env.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  [[3, 3, 2, 0xfff2e6, 3], [-3, 1, 3, 0xffc9d6, 1.6], [0, -3, 2, 0xffa98f, 1]].forEach(([x, y, z, c, s]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); });
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.04).texture;
  scene.add(new THREE.AmbientLight(0xffe6dc, 0.25));
  const key = new THREE.DirectionalLight(0xfff0e4, 2.2); key.position.set(2.5, 3, 3.5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffa9bd, 0.8); fill.position.set(-3, 0.5, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd2c0, 1.5); rim.position.set(-2, 2, -3); scene.add(rim);
  root = new THREE.Group(); scene.add(root);
  const mk = (r, side, o, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: o, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, side, depthWrite: false, envMapIntensity: 1.3 })); m.renderOrder = 5; return m; };
  const back = mk(1.05, THREE.BackSide, 0.1, 0xff9f8a), front = mk(1.05, THREE.FrontSide, 0.04, 0xfff0ea); root.add(back); sacs = [front]; scene.add(front);
  const pg = new THREE.BufferGeometry(), pp = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) { const r = 0.95 * Math.cbrt(Math.random()), a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1); pp.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.025, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); scene.add(particles);
  return true;
}

function setWeek(w) {
  w = Math.min(Math.max(w, 4), 40);
  if (cur === w) return; cur = w;
  if (babyGrp) root.remove(babyGrp);
  let b = cache.get(w);
  if (!b) { b = buildBaby(w); cache.set(w, b); if (cache.size > 6) cache.delete(cache.keys().next().value); }
  const sc = w < 8 ? L(0.55, 0.7, (w - 4) / 3) : L(0.62, 1.02, (w - 8) / 32);
  b.grp.scale.setScalar(sc); b.grp.position.set(-b.center.x * sc, -b.center.y * sc, -b.center.z * sc);
  const wrap = new THREE.Group(); wrap.add(b.grp); babyGrp = wrap; root.add(wrap);
}

function resize() { if (!host) return; const s = Math.max(host.clientWidth, 160); renderer.setSize(s, s, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; }

function loop(t) {
  if (!host || !host.isConnected) { raf = 0; return; }
  raf = requestAnimationFrame(loop);
  const sec = t / 1000;
  root.rotation.y = spinY + (reduce || drag ? 0 : Math.sin(sec * 0.5) * 0.35);
  root.rotation.x = reduce ? 0 : Math.sin(sec * 0.35) * 0.05;
  sacs[0].rotation.y = root.rotation.y; particles.rotation.y = sec * 0.04;
  babyGrp?.traverse(o => { if (o.userData.heart) o.scale.setScalar(1 + 0.13 * Math.pow(Math.max(0, Math.sin(sec * 9)), 4)); });
  renderer.render(scene, camera);
}

function bind(el) {
  const c = renderer.domElement;
  c.style.touchAction = 'pan-y'; c.style.cursor = 'grab';
  c.onpointerdown = e => { drag = { x: e.clientX, y0: spinY }; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; };
  c.onpointermove = e => { if (drag) spinY = drag.y0 + (e.clientX - drag.x) * 0.012; };
  c.onpointerup = c.onpointercancel = () => { drag = null; c.style.cursor = 'grab'; };
}

// API pública: devolve true se o 3D foi montado (senão o SVG de reserva continua)
function show(el, w) {
  if (ok === null) ok = init();
  if (!ok || !el) return false;
  host = el;
  if (renderer.domElement.parentNode !== el) { el.innerHTML = ''; el.appendChild(renderer.domElement); bind(el); }
  resize(); setWeek(w);
  if (!raf) raf = requestAnimationFrame(loop);
  return true;
}
window.Baby3D = { show };
window.dispatchEvent(new Event('baby3d-ready'));
