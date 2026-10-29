'use strict';
// ---------- tema (claro / noturno) ----------
const THEME_KEY = 'ciclo.theme';
function applyTheme() {
  let t = null; try { t = localStorage.getItem(THEME_KEY); } catch {}
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
applyTheme();

// ---------- estado ----------
const KEY = 'ciclo.v1';
const DEF = { logs: {}, settings: { cycle: 28, period: 5, luteal: 14, pregnancy: null, checklist: {}, goal: 'track', conceiveSince: null } };
const norm = x => {
  const o = { logs: x.logs || {}, settings: { ...DEF.settings, ...x.settings }, savedAt: x.savedAt || 0 };
  // relações importadas sem detalhe ('Sim') são todas sem proteção
  for (const l of Object.values(o.logs)) if (l.sex === 'Sim') l.sex = 'Sem proteção';
  // gestação sem data de início (versões antigas): o passado nunca é reclassificado
  if (o.settings.pregnancy && !o.settings.pregnancy.since) o.settings.pregnancy = { ...o.settings.pregnancy, since: new Date().toLocaleDateString('sv') };
  return o;
};
let S = load();
function load() {
  try { const x = JSON.parse(localStorage.getItem(KEY)); return norm(x || {}); } catch { return norm({}); }
}
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  schedulePush();
}

// Sincronização privada (quando publicado como artefato): os dados ficam num documento só seu,
// que nem o dono da página enxerga; o navegador guarda uma cópia local.
let remote = null, pushT = 0, pushing = false, again = false;
const schedulePush = () => { if (remote) { clearTimeout(pushT); pushT = setTimeout(push, 900); } };
async function push() {
  if (!remote) return;
  if (pushing) { again = true; return; }
  pushing = true;
  try { await remote.set({ json: JSON.stringify(S), savedAt: S.savedAt }); } catch {}
  pushing = false;
  if (again) { again = false; push(); }
}
async function initCloud() {
  try {
    if (!window.claude?.use) return;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    const ref = db.doc('data/users/' + id + '/ciclo'), snap = await ref.get();
    remote = ref;
    if (snap.exists) {
      const r = JSON.parse(snap.data().json || '{}');
      if ((r.savedAt || 0) > (S.savedAt || 0)) { S = norm(r); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} render(); return; }
    }
    if (Object.keys(S.logs).length || S.savedAt) { push(); return; }
    // primeiro acesso: se houver um histórico preparado (documento temporário), copia para o documento privado e apaga o temporário
    const seed = db.doc('seed/ciclo'), sn = await seed.get();
    if (sn.exists) {
      S = norm(JSON.parse(sn.data().json || '{}'));
      if (Object.keys(S.logs).length) {
        S.savedAt = Date.now();
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
        await ref.set({ json: JSON.stringify(S), savedAt: S.savedAt });
        await seed.delete();
        render();
      } else S = norm({});
    }
  } catch {}
}

const FLOW = [['spot', 'Escape'], ['light', 'Leve'], ['med', 'Médio'], ['heavy', 'Intenso']];
const SYMPTOMS = ['Cólica', 'Dor de cabeça', 'Inchaço', 'Seios sensíveis', 'Acne', 'Cansaço', 'Náusea', 'Dor lombar', 'Desejo de doce', 'Insônia', 'Libido alta', 'Dor na ovulação'];
const MOODS = ['Feliz', 'Calma', 'Energizada', 'Ansiosa', 'Irritada', 'Triste', 'Sensível'];
const MUCUS = ['Seco', 'Pegajoso', 'Cremoso', 'Clara de ovo', 'Aquoso'];
const LH = ['Negativo', 'Positivo'];
const SEX = ['Não', 'Com proteção', 'Sem proteção', 'Sim'];
const PHASE = { menstrual: 'Menstrual', folicular: 'Folicular', fertil: 'Janela fértil', lutea: 'Lútea' };
const TIPS = {
  menstrual: 'Fase de descanso: o corpo está eliminando o endométrio. Hidratação, ferro e movimento leve ajudam.',
  folicular: 'Estrogênio em alta: costuma vir mais energia e disposição. Bom momento para treinos mais intensos.',
  fertil: 'Janela fértil: o muco tende a ficar mais claro e elástico. É o período de maior chance de gravidez.',
  lutea: 'Progesterona em alta: é comum ter inchaço, TPM e mais sono. A temperatura basal fica mais alta.'
};

// ---------- datas ----------
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((D(a) - D(b)) / 864e5);
const TODAY = iso(new Date());
const fmt = (s, o = { day: 'numeric', month: 'short' }) => D(s).toLocaleDateString('pt-BR', o);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const sd = s => `${D(s).getDate()} ${MES[D(s).getMonth()]}`;
const sr = (a, b) => { const x = D(a), y = D(b); return a === b ? sd(a) : x.getMonth() === y.getMonth() ? `${x.getDate()}–${y.getDate()} ${MES[y.getMonth()]}` : `${sd(a)} – ${sd(b)}`; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- análise ----------
function groups() {
  const days = Object.keys(S.logs).filter(d => ['light', 'med', 'heavy'].includes(S.logs[d].flow)).sort();
  const out = [];
  for (const d of days) {
    const g = out[out.length - 1];
    if (g && diff(d, g.end) <= 2) g.end = d; else out.push({ start: d, end: d });
  }
  return out;
}

function detectTemp(from, to) {
  const t = [];
  for (let d = from; d <= to; d = add(d, 1)) { const v = S.logs[d]?.temp; if (v) t.push([d, v]); }
  for (let i = 6; i + 2 < t.length; i++) {
    const base = Math.max(...t.slice(i - 6, i).map(x => x[1]));
    if (t[i][1] > base && t[i + 1][1] > base && t[i + 2][1] >= base + 0.2) return add(t[i][0], -1);
  }
  return null;
}

function detectLH(from, to) {
  for (let d = from; d <= to; d = add(d, 1)) if (S.logs[d]?.lh === 'Positivo') return add(d, 1);
  return null;
}
const FERT_MUC = ['Clara de ovo', 'Aquoso'];
const wavgDate = pts => { const b = pts[0][0], t = pts.reduce((a, p) => a + p[1], 0); return add(b, Math.round(pts.reduce((a, p) => a + diff(p[0], b) * p[1], 0) / t)); };

// Estima a ovulação do ciclo [from, to] combinando os sinais que você registrou:
//  • confirmada: teste de LH positivo (ovulação ~1 dia depois) e/ou subida da temperatura basal
//  • provável: pico do muco fértil (último dia de clara de ovo/aquoso) e/ou dor na ovulação
//  • iminente: muco fértil registrado hoje/ontem, ainda sem outro sinal
function ovEst(from, to) {
  const lh = detectLH(from, to), bt = detectTemp(from, to), mucus = [], pain = [];
  for (let d = from; d <= to; d = add(d, 1)) {
    const l = S.logs[d]; if (!l) continue;
    if (FERT_MUC.includes(l.mucus)) mucus.push(d);
    if ((l.symptoms || []).includes('Dor na ovulação')) pain.push(d);
  }
  const peak = mucus.at(-1) || null, pn = pain.at(-1) || null, src = [];
  const conf = [];
  if (lh) { conf.push([lh, 3]); src.push('teste de LH'); }
  if (bt) { conf.push([bt, 3]); src.push('temperatura'); }
  if (conf.length) {
    const date = wavgDate(conf);
    if (peak && Math.abs(diff(peak, date)) <= 2) src.push('muco');
    if (pn && Math.abs(diff(pn, date)) <= 2) src.push('dor');
    return { date, level: 'confirmada', src };
  }
  const soft = [];
  if (peak) { soft.push([peak, 1.5]); src.push('muco fértil'); }
  if (pn) { soft.push([pn, 1.5]); src.push('dor na ovulação'); }
  if (!soft.length) return null;
  const ongoing = peak && peak >= add(TODAY, -1) && to >= TODAY && !pn;
  return ongoing ? { date: add(peak, 1), level: 'iminente', src } : { date: wavgDate(soft), level: 'provável', src };
}
const detectOv = (from, to) => { const e = ovEst(from, to); return e && e.level !== 'iminente' ? e.date : null; };
const ovSrc = (from, to) => ovEst(from, to)?.src.join(' + ') || null;

function wq(samples, q) {
  const a = [...samples].sort((x, y) => x[0] - y[0]), tot = a.reduce((t, x) => t + x[1], 0);
  let c = 0;
  for (const [v, w] of a) { c += w; if (c / tot >= q - 1e-9) return v; }
  return a.at(-1)[0];
}

// Pílula: sequências de dias seguidos com "Anticoncepcional" nos remédios. A proteção só vale a partir do 8º dia seguido.
function pillRuns() {
  const days = Object.keys(S.logs).filter(d => (S.logs[d].meds || []).includes('Anticoncepcional')).sort(), runs = [];
  for (const d of days) { const r = runs.at(-1); if (r && diff(d, r.end) <= 1) r.end = d; else runs.push({ start: d, end: d }); }
  return runs.map(r => ({ ...r, days: diff(r.end, r.start) + 1 }));
}
const pillCovered = (date, runs = pillRuns()) => runs.some(r => date >= add(r.start, 7) && date <= r.end);

function analyze() {
  const g = groups();
  const runs = pillRuns(), hormonal = (a, b) => runs.some(r => r.start < b && r.end >= a), lens = [];
  for (let i = 1; i < g.length; i++) { const l = diff(g[i].start, g[i - 1].start); if (l >= 15 && l <= 120 && !hormonal(g[i - 1].start, g[i].start)) lens.push(l); }
  const recent = lens.slice(-8), n = recent.length;
  // ciclos recentes pesam mais; poucos dados => amostras sintéticas ao redor do valor inicial
  let samples = recent.map((v, i) => [v, 0.85 ** (n - 1 - i)]);
  const base = n ? samples.reduce((t, x) => t + x[0] * x[1], 0) / samples.reduce((t, x) => t + x[1], 0) : S.settings.cycle;
  if (n < 3) samples = samples.concat([[Math.round(base) - 4, 0.5], [Math.round(base) + 4, 0.5]], n ? [] : [[Math.round(base), 1]]);
  const tw = samples.reduce((t, x) => t + x[1], 0);
  const mean = samples.reduce((t, x) => t + x[0] * x[1], 0) / tw;
  const cycle = Math.round(wq(samples, .5));
  const lo = Math.min(wq(samples, .1), cycle - 2), hi = Math.max(wq(samples, .8), cycle + 2);
  const plens = g.slice(0, -1).map(x => diff(x.end, x.start) + 1).concat(g.length && diff(g.at(-1).end, g.at(-1).start) >= 1 ? [diff(g.at(-1).end, g.at(-1).start) + 1] : []);
  const period = plens.length ? Math.round(avg(plens.slice(-6))) : S.settings.period;
  const cyc = [], lut = [];
  for (let i = 1; i < g.length; i++) {
    const len = diff(g[i].start, g[i - 1].start); if (len < 15 || len > 120 || hormonal(g[i - 1].start, g[i].start)) continue;
    const e = ovEst(g[i - 1].start, add(g[i].start, -1)), ok = e && e.level !== 'iminente';
    const ovDay = ok ? diff(e.date, g[i - 1].start) + 1 : null;
    cyc.push({ start: g[i - 1].start, len, ovDay, level: e?.level, src: e?.src });
    if (ok) { const l = len - ovDay + 1; if (l >= 8 && l <= 18) lut.push(l); }
  }
  const luteal = lut.length >= 2 ? Math.round(avg(lut)) : S.settings.luteal;
  // amostras de "dia da ovulação": o que foi observado vale mais; sem sinais, usa duração do ciclo − fase lútea
  const rc = cyc.slice(-8);
  let ovSamples = rc.map((c, i) => [c.ovDay ?? c.len - luteal, 0.85 ** (rc.length - 1 - i)]);
  if (rc.length < 3) ovSamples = ovSamples.concat([[Math.round(base) - luteal - 4, 0.5], [Math.round(base) - luteal + 4, 0.5]], rc.length ? [] : [[Math.round(base) - luteal, 1]]);
  const sd = recent.length > 1 ? Math.sqrt(avg(recent.map(x => (x - avg(recent)) ** 2))) : null;
  const min = lens.length ? Math.min(...lens) : null, max = lens.length ? Math.max(...lens) : null;
  // pílula tomada neste ciclo: o ciclo atual fica de fora das estatísticas e dos sinais de SOP
  const lastG = g.at(-1), curRuns = lastG ? runs.filter(x => x.end >= lastG.start) : [];
  const pill = curRuns.length ? (() => {
    const run = curRuns.at(-1), esc = Object.keys(S.logs).filter(d => d > run.end && diff(d, run.end) <= 21 && ['spot', 'light', 'med', 'heavy'].includes(S.logs[d].flow) && !g.some(x => d >= x.start && d <= x.end)).sort();
    return { run, stopped: diff(TODAY, run.end) >= 2, effective: run.days >= 7, escape: esc };
  })() : null;
  return { pill, g, lens, n, samples, cyc, ovSamples, mean, cycle, lo, hi, period, luteal, lutMeasured: lut.length, sd, min, max, spread: n >= 2 ? Math.max(...recent) - Math.min(...recent) : null };
}

// probabilidade (0–1) de o dia do ciclo estar na janela fértil, segundo o dia em que você costuma ovular.
// Só considera ciclos em que a ovulação ainda não tinha ocorrido até o dia atual (cur). null = fora de tudo que já vi.
function fertProbN(A, day, cur = day) {
  let num = 0, den = 0, n = 0;
  for (const [od, w] of A.ovSamples) { if (od < cur - 1) continue; den += w; n++; if (day >= od - 5 && day <= od + 1) num += w; }
  return { p: den ? num / den : null, n };
}
const fertProb = (A, day, cur = day) => fertProbN(A, day, cur).p;

// previsão da próxima menstruação: faixa; se a ovulação já foi confirmada, a faixa fica bem mais estreita
function nextPeriod(A) {
  const last = A.g.at(-1), e = ovEst(last.start, TODAY), day = diff(TODAY, last.start) + 1;
  if (e) {
    const c = add(e.date, A.luteal), hw = e.level === 'confirmada' ? 2 : e.level === 'provável' ? 3 : 4, to = add(c, hw);
    return { center: c, from: add(c, -hw), to, confirmed: e.level === 'confirmada', level: e.level, src: e.src.join(' + '), ov: e.date, late: TODAY > to, over: Math.max(diff(TODAY, to), 0), typTo: to };
  }
  const typTo = add(last.start, A.hi);
  if (TODAY <= typTo) return { center: add(last.start, A.cycle), from: add(last.start, A.lo), to: typTo, confirmed: false, late: false, over: 0, typTo };
  // passou da faixa habitual: baseia-se nos seus ciclos anteriores que também passaram deste dia
  const over = diff(TODAY, typTo), cond = A.samples.filter(([L]) => L >= day);
  if (cond.length) {
    const ls = cond.map(x => x[0]);
    return { center: add(last.start, wq(cond, .5)), from: add(last.start, Math.max(Math.min(...ls), day - 1)), to: add(last.start, Math.max(...ls)), confirmed: false, late: true, over, typTo, extended: true, base: cond.length };
  }
  return { center: add(TODAY, 7), from: TODAY, to: add(TODAY, 14), confirmed: false, late: true, over, typTo, extended: true, nobase: true };
}
const isRegular = A => A.n >= 3 && A.hi - A.lo <= 6;

function marks(A) {
  const per = new Set(), pper = new Set(), pper2 = new Set(), fert = new Map(), ov = new Set(), late = new Set();
  A.g.forEach(x => { for (let d = x.start; d <= x.end; d = add(d, 1)) per.add(d); });
  const mark = o => { ov.add(o); for (let k = -5; k <= 1; k++) fert.set(add(o, k), 1); };
  A.g.forEach((x, i) => {
    const next = A.g[i + 1]?.start;
    if (next) mark(detectOv(x.start, add(next, -1)) || add(next, -A.luteal));
  });
  const last = A.g.at(-1);
  if (last) {
    const F = nextPeriod(A), e = ovEst(last.start, TODAY), cur = diff(TODAY, last.start) + 1;
    if (!F.nobase) for (let d = F.from; d <= F.to; d = add(d, 1)) pper.add(d);
    if (F.late && !F.extended) for (let d = add(F.typTo, 1); d <= TODAY; d = add(d, 1)) late.add(d);
    if (F.late && F.extended) for (let d = add(F.typTo, 1); d <= TODAY; d = add(d, 1)) late.add(d);
    if (e) mark(e.date);
    else if (isRegular(A)) {
      for (let k = 1; k <= 3; k++) { const ns = add(last.start, k * A.cycle); mark(add(ns, -A.luteal)); if (k > 1) for (let j = 0; j < A.period; j++) pper.add(add(ns, j)); }
    } else {
      const maxOd = Math.max(...A.ovSamples.map(x => x[0]));
      for (let i = Math.max(cur - 1, 0); i <= maxOd + 2; i++) { const p = fertProb(A, i + 1, cur); if (p !== null && p >= .15) fert.set(add(last.start, i), p); }
    }
    // ciclo seguinte: previsto a partir da menstruação prevista + mediana dos seus ciclos
    if (!isRegular(A) && !F.nobase) {
      const c2 = F.center;
      for (let d = add(c2, A.lo); d <= add(c2, A.hi); d = add(d, 1)) pper2.add(d);
      for (let i = 0; i <= A.hi + 2; i++) { const p = fertProb(A, i + 1, 0); if (p !== null && p >= .45) { const dd = add(c2, i); if (!fert.has(dd)) fert.set(dd, p * .7); } }
    }
  }
  return { per, pper, pper2, fert, ov, late };
}

function phaseOf(date, A) {
  const idx = A.g.findLastIndex(x => x.start <= date);
  if (idx < 0) return null;
  const x = A.g[idx], next = A.g[idx + 1]?.start || add(x.start, A.cycle);
  const day = diff(date, x.start) + 1;
  const plen = Math.max(diff(x.end, x.start) + 1, 1);
  if (day <= plen) return 'menstrual';
  const ov = detectOv(x.start, add(next, -1)) || add(next, -A.luteal);
  if (date < add(ov, -5)) return 'folicular';
  if (date <= add(ov, 1)) return 'fertil';
  return 'lutea';
}

function fertility(A) {
  const last = A.g.at(-1);
  if (!last) return null;
  const day = diff(TODAY, last.start) + 1, F = nextPeriod(A);
  const e = ovEst(last.start, TODAY);
  const mucus = FERT_MUC.includes(S.logs[TODAY]?.mucus) || FERT_MUC.includes(S.logs[add(TODAY, -1)]?.mucus);
  if (e) {
    const o = e.date, d = diff(o, TODAY), src = e.src.join(' + '), base = { ov: o, ev: true, level2: e.level, conf: e.level === 'confirmada' };
    if (e.level === 'iminente') return { ...base, level: 'Muito alta', txt: 'Muco fértil: ovulação em até 2 dias. Faça o teste de LH' };
    const tag = e.level === 'confirmada' ? 'confirmada' : 'provável';
    if (d >= 0 && d <= 2) return { ...base, level: 'Muito alta', txt: `Ovulação ${tag} (${src}): dias mais férteis` };
    if (d === -1) return { ...base, level: 'Alta', txt: `Ovulação ${tag} ontem: ainda na janela` };
    if (d < -1) return { ...base, level: 'Baixa', txt: `Ovulação já ocorreu (${src})` };
    return { ...base, level: 'Alta', txt: `Ovulação ${tag} em ${sd(o)}` };
  }
  const { p, n } = fertProbN(A, day);
  if (p === null) return { level: 'Incerta', txt: `Dia ${day}, além de tudo que já vi nos seus ciclos: ovulação incerta` };
  let level = p >= .5 ? 'Alta' : p >= .2 ? 'Média' : 'Baixa';
  if (n < 2 && level === 'Alta') level = 'Média';
  if (mucus) level = 'Alta';
  const ov = isRegular(A) ? add(add(last.start, A.cycle), -A.luteal) : null;
  return { level, p, ov, txt: n < 2 ? 'Baseado em só 1 ciclo parecido do seu histórico' : `${Math.round(p * 100)}% dos ciclos parecidos estariam férteis hoje` };
}

// chance (%) de a menstruação chegar nos próximos `days` dias
function periodProb(A, F, days) {
  const last = A.g.at(-1), day = diff(TODAY, last.start) + 1;
  if (F.nobase) return null;
  if (F.level) {
    const from = Math.max(diff(F.from, TODAY), 0), to = diff(F.to, TODAY);
    if (to < from) return null;
    let k = 0; for (let i = from; i <= to; i++) if (i <= days) k++;
    return Math.round(100 * k / (to - from + 1));
  }
  let num = 0, den = 0;
  for (const [L, w] of A.samples) { if (L < day) continue; den += w; if (L <= day + days) num += w; }
  return den ? Math.round(100 * num / den) : null;
}

// Cobertura do teste de gravidez: um teste negativo só "vale" para relações ocorridas pelo menos 14 dias antes dele.
function pregCheck(A) {
  const last = A.g.at(-1);
  if (!last) return null;
  const neg = Object.keys(S.logs).filter(d => d >= last.start && S.logs[d].test === 'Negativo').sort();
  if (!neg.length) return { hasNeg: false };
  const exposures = Object.keys(S.logs).filter(d => d >= last.start && d <= TODAY && ['Sem proteção', 'Sim'].includes(S.logs[d].sex) && !pillCovered(d)).sort();
  const unc = exposures.filter(e => !neg.some(t => diff(t, e) >= 14));
  const lastNeg = neg.at(-1), until = add(lastNeg, -14), allClear = unc.length ? add(unc.at(-1), 14) : null, fd = d => fmt(d).replace(/\.$/, '');
  const line = !unc.length ? 'O teste cobre todas as relações registradas neste ciclo: gravidez muito improvável.'
    : `O teste cobre relações até ${fd(until)}. ${allClear <= TODAY ? 'Um teste feito hoje já cobriria todas as relações registradas.' : `Para cobrir todas as relações registradas, um teste só será conclusivo a partir de ${fd(allClear)} — ou quando a menstruação vier.`}`;
  return { hasNeg: true, lastNeg, covered: !unc.length, until, allClear, line };
}

// ---------- views ----------
let view = 'hoje';
let cal = { y: new Date().getFullYear(), m: new Date().getMonth() };

function cycleStrip(A, last, F, f, day) {
  const plen = Math.max(diff(last.end, last.start) + 1, 1), beyond = F.late;
  const span = Math.min(Math.max(diff(F.to, last.start) + 3, day + 3, 20), 70);
  const ovDay = f?.ov ? diff(f.ov, last.start) + 1 : null, wFrom = diff(F.from, last.start) + 1, wTo = diff(F.to, last.start) + 1;
  let cells = '';
  for (let d = 1; d <= span; d++) {
    const c = [];
    if (d <= plen) c.push('p');
    let p = 0;
    if (ovDay && d >= ovDay - 5 && d <= ovDay + 1) p = 1;
    else if (!ovDay && d >= day) p = fertProb(A, d, day) ?? 0;
    if (p >= .15 && d > plen) c.push('f');
    if (d === ovDay) c.push('o');
    if (d >= wFrom && d <= wTo) c.push('w');
    if (d === day) c.push('n');
    cells += `<i class="${c.join(' ')}" ${p >= .15 ? `style="--p:${p.toFixed(2)}"` : ''}></i>`;
  }
  return `<div class="strip" style="grid-template-columns:repeat(${span},1fr)">${cells}</div>
  <div class="lg"><span><i class="p"></i>Menstruação</span><span><i class="f"></i>Fértil</span><span><i class="o"></i>Ovulação</span><span><i class="w"></i>Previsão</span></div>`;
}

const goalOf = () => S.settings.pregnancy ? 'pregnant' : S.settings.goal === 'conceive' ? 'conceive' : 'track';
function modeSwitch() {
  if (S.settings.pregnancy) return '';
  const on = goalOf() === 'conceive';
  return `<button class="mode ${on ? 'on' : ''}" data-act="conceive" role="switch" aria-checked="${on}" aria-label="Modo engravidar"><span class="mi">🌱</span><span class="mt"><b>Modo engravidar</b><small>${on ? 'Ligado · o app está focado em ovulação e melhores dias' : 'Desligado · toque para focar em engravidar'}</small></span><span class="tr"><i></i></span></button>`;
}
function ovMedianDay(A, cur) {
  const a = A.ovSamples.filter(([od]) => od >= cur - 1).sort((x, y) => x[0] - y[0]), tot = a.reduce((t, x) => t + x[1], 0);
  let c = 0; for (const [v, w] of a) { c += w; if (c >= tot / 2) return v; }
  return null;
}
// tudo o que o modo "engravidar" precisa saber do ciclo atual
function conceiveInfo(A) {
  const last = A.g.at(-1), day = diff(TODAY, last.start) + 1, F = nextPeriod(A), f = fertility(A), e = ovEst(last.start, TODAY), beyond = F.late;
  let ov = null, src = null;
  if (e) { ov = e.date; src = e.level; }
  else if (isRegular(A)) { ov = add(add(last.start, A.cycle), -A.luteal); src = 'estimada'; }
  else { const m = ovMedianDay(A, day); if (m !== null) { ov = add(last.start, m - 1); src = 'estimada'; } }
  const win = ov ? [add(ov, -5), add(ov, 1)] : null, best = ov ? [add(ov, -2), ov] : null;
  const ph = phaseOf(TODAY, A), testDate = F.level ? F.center : F.from;
  let st;
  if (beyond) st = 'late';
  else if (ph === 'menstrual') st = 'mens';
  else if (!win) st = 'unknown';
  else if (e?.level === 'iminente' || (TODAY >= best[0] && TODAY <= best[1])) st = 'best';
  else if (TODAY < win[0]) st = 'before';
  else if (TODAY <= win[1]) st = 'fertile';
  else st = 'wait';
  let tries = 0;
  if (win) for (let d = win[0]; d <= win[1]; d = add(d, 1)) if (S.logs[d]?.sex && S.logs[d].sex !== 'Não') tries++;
  return { last, day, F, f, e, beyond, ov, src, win, best, testDate, st, tries, ph };
}

// ---------- modo engravidar: próximo passo, dias para tentar, espera e plano ----------
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const sexOn = d => !!S.logs[d]?.sex && S.logs[d].sex !== 'Não';
function nextStep(A, c, pc) {
  const L = S.logs[TODAY] || {}, day = c.day, lhDate = add(c.last.start, Math.max(5, (A.n ? A.min : A.lo) - 17) - 1), tdays = diff(c.testDate, TODAY);
  const folic = (L.meds || []).includes('Ácido fólico');
  switch (c.st) {
    case 'best': return { ic: '💞', t: 'Hoje é dia de tentar', s: sexOn(TODAY) ? 'Hoje já registrado ✓ · repita em 1–2 dias' : `Melhores dias até ${sd(c.best[1])}`, cta: 'Registrar relação' };
    case 'fertile': return { ic: '🌿', t: 'Janela fértil aberta', s: 'Relação a cada 1–2 dias mantém a chance', cta: 'Registrar' };
    case 'before': return TODAY >= lhDate ? { ic: '🧪', t: 'Faça o teste de LH hoje', s: `Ovulação estimada em ${sd(c.ov)}`, cta: 'Registrar teste' } : { ic: '📅', t: `Teste de LH a partir de ${sd(lhDate)}`, s: `Janela fértil em ${diff(c.win[0], TODAY)} dias`, cta: null };
    case 'mens': return { ic: '🩸', t: 'Registre o fluxo', s: `Dia ${day} · ${folic ? 'ácido fólico de hoje ✓' : 'não esqueça do ácido fólico'}`, cta: 'Registrar' };
    case 'wait': return tdays <= 0 ? { ic: '🧾', t: 'Faça o teste de gravidez', s: 'Primeira urina do dia. Já é confiável', cta: 'Registrar teste' } : { ic: '⏳', t: `Espere ${tdays} dia${tdays > 1 ? 's' : ''} para testar`, s: `Teste a partir de ${sd(c.testDate)}: antes pode dar falso negativo`, cta: null };
    case 'late': if (pc?.hasNeg && diff(TODAY, pc.lastNeg) < 3) return { ic: '⏳', t: `Repita o teste em ${3 - diff(TODAY, pc.lastNeg)} dia${3 - diff(TODAY, pc.lastNeg) > 1 ? 's' : ''}`, s: `Negativo em ${sd(pc.lastNeg)}. Se a menstruação não vier, teste de novo`, cta: 'Registrar teste' };
      return { ic: '🧾', t: 'Faça o teste de gravidez', s: pc?.hasNeg ? `Último negativo em ${sd(pc.lastNeg)}` : 'Primeira urina do dia', cta: 'Registrar teste' };
    default: return { ic: '🧪', t: 'Faça o teste de LH', s: 'Ele mostra quando você ovula', cta: 'Registrar teste' };
  }
}
function nextStepCard(A, c, pc) {
  const n = nextStep(A, c, pc);
  return `<div class="nstep"><span class="nsi">${n.ic}</span><span class="nst"><small>Próximo passo</small><b>${n.t}</b><em>${n.s}</em></span>${n.cta ? `<button class="chip on" data-act="${/teste/i.test(n.cta) ? 'testdlg' : 'log'}" data-k="${/LH/.test(n.t) ? 'lh' : 'preg'}" data-d="${TODAY}">${n.cta}</button>` : ''}</div>`;
}
function tryDaysCard(c) {
  if (!c.win || c.st === 'late' || TODAY > add(c.win[1], 2)) return '';
  const days = [], bestSet = new Set();
  for (let d = c.win[0]; d <= c.win[1]; d = add(d, 1)) days.push(d);
  for (let d = c.best[0]; d <= c.best[1]; d = add(d, 1)) bestSet.add(d);
  const nb = [...bestSet].filter(sexOn).length;
  return `<section class="card tdc"><header><h2>Dias para tentar</h2><span>${nb} de ${bestSet.size} melhores dias</span></header><div class="tds">${days.map(d => `<button class="td ${bestSet.has(d) ? 'best' : ''} ${sexOn(d) ? 'done' : ''} ${d === TODAY ? 'now' : ''} ${d > TODAY ? 'fut' : ''}" data-act="log" data-d="${d}"><small>${WD[D(d).getDay()]}</small><b>${D(d).getDate()}</b><i>${sexOn(d) ? '✓' : bestSet.has(d) ? '★' : ''}</i></button>`).join('')}</div><p class="note" style="margin:8px 0 0">★ melhores dias · ✓ relação registrada</p></section>`;
}
function waitCard(c) {
  if (!c.ov || !['wait', 'late'].includes(c.st)) return '';
  const dpo = diff(TODAY, c.ov);
  if (dpo < 0) return '';
  const pct = Math.min(dpo / 14, 1) * 100;
  const msg = dpo < 6 ? 'Se houve fecundação, o embrião ainda está a caminho do útero. Não há como saber agora.' : dpo <= 12 ? 'Janela de implantação: pode haver um escape rosado leve e cólica fraca. Sintomas ainda não são confiáveis.' : dpo <= 16 ? 'Já dá para testar: um teste de hoje costuma ser confiável.' : 'Passou da duração habitual da fase lútea (12–14 dias). Faça o teste.';
  return `<section class="card tww"><header><h2>Espera do teste</h2><span>dia ${dpo} depois da ovulação</span></header><div class="tbar"><i style="width:${pct}%"></i><u style="left:${6 / 14 * 100}%"></u><u style="left:${12 / 14 * 100}%"></u></div><div class="tlab"><span>ovulação</span><span>implantação</span><span>teste</span></div><p style="margin:8px 0 0;font-size:14px">${msg}</p></section>`;
}
function partnerText(A) {
  const c = conceiveInfo(A), f = c.f;
  return `🌱 Meu ciclo hoje (${fmt(TODAY, { day: 'numeric', month: 'long' })})\nDia ${c.day} do ciclo\n${c.win ? `Janela fértil: ${sr(c.win[0], c.win[1])}\nMelhores dias: ${sr(c.best[0], c.best[1])}\n` : ''}${c.ov ? `Ovulação ${c.e ? c.e.level : 'estimada'}: ${sd(c.ov)}\n` : ''}Chance hoje: ${f?.level || '—'}\nTeste de gravidez: a partir de ${sd(c.testDate)}`;
}
function planHeader(A) {
  const done = CHECK_E.filter((_, i) => S.settings.checklist['e' + i]).length, tot = CHECK_E.length, R = 30, C = 2 * Math.PI * R;
  const fol = d => (S.logs[d]?.meds || []).includes('Ácido fólico');
  let streak = 0, d0 = fol(TODAY) ? TODAY : add(TODAY, -1);
  for (let d = d0; fol(d); d = add(d, -1)) streak++;
  const dots = [6, 5, 4, 3, 2, 1, 0].map(i => `<i class="${fol(add(TODAY, -i)) ? 'on' : ''}"></i>`).join('');
  const since = S.settings.conceiveSince ? A.g.filter(g => g.start >= S.settings.conceiveSince).length : 0;
  const months = S.settings.conceiveSince ? Math.floor(diff(TODAY, S.settings.conceiveSince) / 30) : 0;
  const irreg = A.spread != null && A.spread >= 10;
  return `<div class="card"><h2>Seu progresso</h2><div class="prog"><div class="pr"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--ac,var(--pink))" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * done / tot} ${C}" transform="rotate(-90 40 40)"/></svg><b>${done}/${tot}</b><small>preparação</small></div>
    <div class="pl2"><div class="row"><span>Ácido fólico</span><b>${streak} dia${streak === 1 ? '' : 's'} seguido${streak === 1 ? '' : 's'}</b></div><div class="fdots">${dots}</div><div class="row"><span>Tentando há</span><b>${since ? `${since} ciclo${since > 1 ? 's' : ''}` : months ? `${months} mês(es)` : 'este ciclo'}</b></div></div></div>
    <p class="note" style="margin:10px 0 0">${irreg ? 'Seus ciclos são irregulares: não precisa esperar 12 meses, converse já com seu ginecologista.' : 'Procure avaliação após 12 meses de tentativas (6 meses se tiver 35 anos ou mais).'}</p>
    <button class="btn alt" style="margin-top:10px" data-act="sharepartner">Compartilhar com o parceiro</button></div>`;
}

function vHojeConceive(A, last) {
  const c = conceiveInfo(A), { day, F, f, win, best, ov, src, testDate, st, tries } = c, pc = pregCheck(A);
  const over = F.over, tdays = diff(testDate, TODAY), L = S.logs[TODAY] || {};
  const toWin = win ? diff(win[0], TODAY) : null;
  const H = {
    best: ['fert', 'Hoje é dia de tentar', `Chance ${(f?.level || 'alta').toLowerCase()}${ov ? ' · ovulação ' + sd(ov) : ''}`, 'Tenham relações hoje e amanhã: o óvulo vive cerca de 24 h.'],
    fertile: ['fert', 'Janela fértil aberta', `Melhores dias ${best ? sr(best[0], best[1]) : ''}`, 'Relações a cada 1–2 dias na janela dão a melhor chance.'],
    before: ['fol', `Janela fértil em ${toWin} dia${toWin > 1 ? 's' : ''}`, win ? `${sr(win[0], win[1])} · ${src}` : '', 'Comece o teste de LH 3–5 dias antes da janela.'],
    mens: ['mens', win ? `Janela fértil em ${Math.max(toWin, 0)}d` : 'Novo ciclo', `Menstruação · dia ${day}`, 'Registre o fluxo. O teste de LH começa perto da janela.'],
    wait: ['lut', 'Fase de espera', `Teste de gravidez ${sd(testDate)}${tdays > 0 ? ` · em ${tdays}d` : ''}`, 'Testar antes da data pode dar falso negativo.'],
    late: ['late', 'Faça o teste de gravidez', pc?.hasNeg ? `Negativo em ${sd(pc.lastNeg)} · ${over}d de atraso` : `${over} dia${over > 1 ? 's' : ''} de atraso`, 'Use a primeira urina do dia e registre o resultado.'],
    unknown: ['fol', 'Descubra sua ovulação', 'Use o teste de LH todos os dias', 'O teste de LH mostra quando você ovula.']
  }[st];
  const R = 44, C = 2 * Math.PI * R, pct = Math.min(day / Math.max(A.hi, day), 1);
  const col = f && ['Alta', 'Muito alta'].includes(f.level) ? 'var(--green)' : f?.level === 'Média' ? 'var(--amber)' : 'var(--mute)';
  const ins = insights(A), cm = conceptionModel(A);
  INFO = {
    ...(cm ? { cp: cpInfo(cm) } : {}),
    ...insightInfo(ins),
    c_win: ['Janela fértil', `<p>${win ? `Janela: <b>${sr(win[0], win[1])}</b> (${src}). Melhores dias: <b>${sr(best[0], best[1])}</b>.` : 'Ainda não consigo estimar a janela.'}</p><p>Os 5 dias antes da ovulação e o dia dela são férteis; os 2 dias antes e o dia da ovulação são os melhores. Com teste de LH e muco registrados, a janela fica certeira.</p>`],
    c_chance: ['Chance hoje', `<p><b>${f?.level || '—'}</b> — ${f?.txt || ''}.</p>`],
    c_test: ['Teste de gravidez', `<p>Faça a partir de <b>${fmt(testDate)}</b> (primeira urina do dia). Antes disso pode dar falso negativo.</p>${pc?.hasNeg ? `<p>${pc.line}</p>` : ''}`],
    c_tries: ['Tentativas', `<p><b>${tries}</b> relação(ões) dentro da janela fértil deste ciclo.</p><p>O ideal é a cada 1–2 dias durante a janela.</p>`]
  };
  const since = S.settings.conceiveSince ? A.g.filter(g => g.start >= S.settings.conceiveSince).length : 0;
  return `<div class="toprow"><h1 class="cap">${fmt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
  <section class="hh st-${H[0]}">
    <div class="goalpill">🌱 Modo engravidar${since ? ` · ciclo ${since}` : ''}</div>
    <div class="hhb" role="button" tabindex="0" data-act="phase" data-k="${H[0]}" aria-label="Entender esta fase"><div class="hr"><div class="ring2"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#ffffff40" stroke-width="9"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 50 50)"/></svg><div><small>dia</small><b>${day}</b></div></div>
    <div class="ht"><h2>${H[1]}</h2><p>${H[2]}</p><p class="phint">Toque para entender esta fase ›</p></div></div>
    ${cycleStrip(A, last, F, f, day)}</div>
  </section>
  <button class="btn regbtn" data-act="log" data-d="${TODAY}">${S.logs[TODAY] ? '✎ Editar registro de hoje' : '＋ Registrar hoje'}</button>
  ${nextStepCard(A, c, pc)}${waitCard(c)}${tryDaysCard(c)}${cpTile(cm)}${insightsCard(ins)}
  <div class="tiles4">
    <button class="tile" data-act="info" data-k="c_win"><small>Janela fértil</small><b>${win ? sr(win[0], win[1]) : '—'}</b><em>${src || 'sem estimativa'}</em></button>
    <button class="tile" data-act="info" data-k="c_win"><small>Melhores dias</small><b>${best ? sr(best[0], best[1]) : '—'}</b><em>${ov ? 'ovulação ' + sd(ov) : ''}</em></button>
    <button class="tile" data-act="info" data-k="c_chance"><small>Chance hoje</small><b style="color:${col}">${f ? f.level : '—'}</b><em>${f?.p != null ? Math.round(f.p * 100) + '% dos ciclos' : f?.ev ? 'ovulação ' + f.level2 : ''}</em></button>
    <button class="tile" data-act="info" data-k="c_test"><small>Teste de gravidez</small><b>${st === 'late' ? 'Agora' : sd(testDate)}</b><em>${st === 'late' ? 'ciclo atrasado' : tdays > 0 ? `em ${tdays} dias` : 'já pode'}</em></button>
  </div>
  <button class="wide" data-act="info" data-k="c_tries"><span>Tentativas na janela</span><b>${tries}</b></button>
  <button class="chip" data-act="sharepartner" style="margin:10px 0 0">Compartilhar com o parceiro</button>
  ${pregBanner()}
  <p class="fine">Estimativas · confirme com teste de LH e orientação médica</p>`;
}

// ---------- chance de ter engravidado neste ciclo ----------
// Probabilidade de gravidez por relação, segundo a distância até a ovulação (Wilcox et al., NEJM 1995, casais saudáveis).
const WIL = { '-5': .10, '-4': .16, '-3': .14, '-2': .27, '-1': .31, '0': .33, '1': .03 };
const chanceIf = (rels, o) => 1 - rels.reduce((q, d) => q * (1 - (WIL[String(diff(d, o))] || 0)), 1);
// sensibilidade do teste de urina conforme os dias desde a concepção
const testSens = d => d < 8 ? 0 : d < 10 ? .2 : d < 12 ? .5 : d < 14 ? .75 : d < 16 ? .9 : d < 21 ? .97 : .99;
function ovPrior(A, last, e, cands) {
  const prior = new Map(cands.map(d => [d, 0]));
  const spread = (c, w, rad) => { for (let k = -rad; k <= rad; k++) { const d = add(c, k); if (prior.has(d)) prior.set(d, prior.get(d) + w * (rad + 1 - Math.abs(k)) / ((rad + 1) ** 2)); } };
  if (e) spread(e.date, 1, e.level === 'confirmada' ? 1 : 3);
  else {
    const tw = A.ovSamples.reduce((t, x) => t + x[1], 0);
    for (const [od, w] of A.ovSamples) spread(add(last.start, od - 1), .5 * w / tw, 3);
    for (const d of cands) prior.set(d, prior.get(d) + .5 / cands.length);
  }
  return prior;
}
// Estima a data de ovulação/concepção SE houve gravidez, combinando sinais, relações e testes (negativos afastam concepções antigas).
function estConception(A, until) {
  const last = A.g.at(-1); if (!last) return null;
  const rels = Object.keys(S.logs).filter(d => d >= last.start && d <= until && ['Sem proteção', 'Sim'].includes(S.logs[d].sex) && !pillCovered(d)).sort();
  const tests = Object.keys(S.logs).filter(d => d >= last.start && d <= until && S.logs[d].test).map(d => [d, S.logs[d].test]);
  const e = ovEst(last.start, until), cands = [];
  for (let d = add(last.start, 7); d <= add(until, -7); d = add(d, 1)) cands.push(d);
  if (!cands.length) return null;
  const prior = ovPrior(A, last, e, cands);
  const post = cands.map(o => {
    let w = (prior.get(o) || 0) + 1e-6;
    if (rels.length) w *= chanceIf(rels, o) + 1e-4;
    for (const [d, r] of tests) { const sn = testSens(diff(d, o)); w *= r === 'Negativo' ? 1 - sn * .98 : sn + .01; }
    return { o, w };
  });
  const tot = post.reduce((a, x) => a + x.w, 0) || 1; post.forEach(x => x.w /= tot);
  const mode = post.slice().sort((a, b) => b.w - a.w)[0];
  let acc = 0, lo = post[0].o, hi = post.at(-1).o;
  for (const x of post) { acc += x.w; if (acc < .1) lo = x.o; if (acc <= .9) hi = x.o; }
  const shares = rels.map(r => ({ d: r, share: post.reduce((t, x) => { const sum = rels.reduce((a, q) => a + (WIL[String(diff(q, x.o))] || 0), 0); return t + (sum ? x.w * (WIL[String(diff(r, x.o))] || 0) / sum : 0); }, 0) }));
  return { ov: mode.o, lo, hi, shares, rels, evidence: !!e };
}
function conceptionModel(A) {
  const last = A.g.at(-1);
  if (!last || S.settings.pregnancy) return null;
  const rels = Object.keys(S.logs).filter(d => d >= last.start && d <= TODAY && ['Sem proteção', 'Sim'].includes(S.logs[d].sex) && !pillCovered(d)).sort();
  if (!rels.length) return null;
  const e = ovEst(last.start, TODAY), cands = [];
  for (let d = add(last.start, 7); d <= add(TODAY, 3); d = add(d, 1)) cands.push(d);
  const prior = ovPrior(A, last, e, cands);
  const tot = [...prior.values()].reduce((a, b) => a + b, 0) || 1;
  const byO = cands.map(o => ({ o, chance: chanceIf(rels, o), prior: prior.get(o) / tot }));
  const expected = byO.reduce((t, x) => t + x.prior * x.chance, 0);
  const negs = Object.keys(S.logs).filter(d => d >= last.start && S.logs[d].test === 'Negativo').sort(), lastNeg = negs.at(-1) || null;
  let adjusted = null;
  if (lastNeg) {
    let num = 0, den = 0;
    for (const x of byO) { const miss = 1 - testSens(diff(lastNeg, x.o)); num += x.prior * x.chance * miss; den += x.prior * (x.chance * miss + (1 - x.chance)); }
    adjusted = den ? num / den : null;
  }
  const perRel = rels.map(d => ({ d, day: diff(d, last.start) + 1, chance: byO.reduce((t, x) => t + x.prior * (WIL[String(diff(d, x.o))] || 0), 0) }));
  return { rels, byO, expected, min: Math.min(...byO.map(x => x.chance)), max: Math.max(...byO.map(x => x.chance)), lastNeg, adjusted, perRel, evidence: !!e, from: cands[0], to: cands.at(-1) };
}
const pc100 = x => x < .005 ? '<1%' : Math.round(x * 100) + '%';
function cpChart(m) {
  const W = 320, H = 110, pl = 28, pr = 6, pt = 8, pb = 22, n = m.byO.length, top = Math.max(.1, Math.ceil(m.max * 10) / 10);
  const X = i => pl + i / Math.max(n - 1, 1) * (W - pl - pr), Y = v => pt + (1 - v / top) * (H - pt - pb);
  const pts = m.byO.map((x, i) => `${X(i).toFixed(1)},${Y(x.chance).toFixed(1)}`);
  const lab = (i, a) => `<text x="${X(i)}" y="${H - 6}" text-anchor="${a}">${sd(m.byO[i].o)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/><polygon points="${X(0)},${Y(0)} ${pts.join(' ')} ${X(n - 1)},${Y(0)}" fill="var(--pink)" fill-opacity=".18"/><polyline fill="none" stroke="var(--pink)" stroke-width="2" points="${pts.join(' ')}"/><text x="2" y="${Y(top) + 4}">${Math.round(top * 100)}%</text><text x="2" y="${Y(0) + 4}">0%</text>${lab(0, 'start')}${lab(Math.floor(n / 2), 'middle')}${lab(n - 1, 'end')}</svg>`;
}
function cpInfo(m) {
  return ['Chance de ter engravidado neste ciclo', `<p style="margin:0"><span class="big" style="font-size:34px">${pc100(m.expected)}</span> <span class="mute">estimativa</span></p>
  <p>Calculada pelas <b>${m.rels.length} relação(ões) sem proteção</b> deste ciclo e pelos dias em que ocorreram. Como a sua ovulação ${m.evidence ? 'tem sinais registrados, ela entrou na conta' : 'não tem sinais registrados, o app considerou todas as datas possíveis'}.</p>
  <p>O resultado depende de quando você ovulou: varia de <b>${pc100(m.min)}</b> a <b>${pc100(m.max)}</b>. O gráfico mostra a chance em cada data possível de ovulação:</p>${cpChart(m)}
  ${m.adjusted != null ? `<p>Considerando o <b>teste negativo de ${fmt(m.lastNeg)}</b>: <b>${pc100(m.adjusted)}</b>. Testes feitos poucos dias depois da concepção costumam errar.</p>` : ''}
  <p class="small mute" style="margin:6px 0 4px">Chance por relação (na estimativa média):</p>${m.perRel.map(x => `<div class="row" style="padding:5px 0"><span>${fmt(x.d, { day: 'numeric', month: 'short' })} <span class="mute small">· dia ${x.day}</span></span><b>${pc100(x.chance)}</b></div>`).join('')}
  <p class="note">O atraso da menstruação também aumenta a possibilidade, mas não entrou nesse cálculo. Valores baseados em médias de casais saudáveis (Wilcox, NEJM 1995): é uma estimativa, não um diagnóstico. Só o teste de gravidez confirma.</p>`];
}

// ---------- o que o app identificou no ciclo ----------
// Observações calculadas só a partir do que você registrou. Não são diagnóstico.
function insights(A) {
  const last = A.g.at(-1), out = [], F = nextPeriod(A), beyond = F.late, over = F.over, day = diff(TODAY, last.start) + 1, pc = pregCheck(A);
  const exp = Object.keys(S.logs).filter(d => d >= last.start && d <= TODAY && ['Sem proteção', 'Sim'].includes(S.logs[d].sex) && !pillCovered(d)).sort();
  const posRecent = Object.keys(S.logs).some(d => S.logs[d].test === 'Positivo' && diff(TODAY, d) <= 21);
  // 1) possibilidade de gravidez
  let g;
  if (S.settings.pregnancy) g = { lvl: 'ok', pill: 'Em acompanhamento', short: 'Gestação registrada no app', text: '<p>Você está acompanhando uma gestação na aba Gestação.</p>' };
  else if (posRecent) g = { lvl: 'alert', pill: 'Teste positivo', short: 'Inicie o acompanhamento e marque o pré-natal', text: '<p>Há um teste positivo registrado nos últimos dias. Procure seu médico para confirmar (beta-HCG) e iniciar o pré-natal.</p>' };
  else if (!exp.length) g = { lvl: 'ok', pill: 'Baixa', short: 'Sem relação sem proteção neste ciclo', text: '<p>Não há relação sem proteção registrada neste ciclo, então a chance de gravidez é baixa.</p>' };
  else if (beyond) {
    const cm = conceptionModel(A), pr = cm ? (cm.adjusted ?? cm.expected) : null, nums = cm ? `<p>Pelas relações e dias: <b>${pc100(cm.expected)}</b>${cm.adjusted != null ? `; considerando o teste negativo de ${sd(cm.lastNeg)}: <b>${pc100(cm.adjusted)}</b>` : ''}. Toque em "Chance de ter engravidado" para ver o detalhe.</p>` : '';
    const ovTxt = F.ov ? `<p>Com a ovulação ${F.level} em ${sd(F.ov)}, a menstruação era esperada entre ${sd(add(F.center, -(F.level === 'confirmada' ? 2 : 3)))} e ${sd(F.to)}: já são ${over} dia(s) de atraso.</p>` : '';
    const testNow = `<p>Um teste feito <b>hoje</b> já cobre as relações até ${sd(add(TODAY, -14))}.</p>`;
    if (pc.hasNeg && pc.covered) g = { lvl: 'ok', pill: 'Muito baixa', short: `Teste negativo em ${sd(pc.lastNeg)} cobre as relações`, text: `<p>${pc.line}</p>` };
    else if ((pr != null && pr >= .5) || (!pc.hasNeg && over >= 7)) g = { lvl: 'alert', pill: 'Alta', short: pr != null ? `${pc100(pr)} pelas relações · ${over}d de atraso` : `${over} dias de atraso + relação sem proteção`, text: `${nums}${ovTxt}${testNow}` };
    else g = { lvl: 'warn', pill: 'Possível', short: pr != null ? `${pc100(pr)} pelas relações${cm.adjusted != null ? ' (com o teste negativo)' : ''} · ${over}d de atraso` : 'O teste negativo não cobre todas as relações', text: `${nums}${ovTxt}${pc.hasNeg ? `<p>Teste negativo em ${sd(pc.lastNeg)}. ${pc.line}</p>` : ''}${testNow}<p>Atrasos em ciclos irregulares também podem ter outras causas.</p>` };
  } else {
    const c = conceiveInfo(A), hit = c.win && exp.some(d => d >= c.win[0] && d <= c.win[1]), cm = conceptionModel(A), pr = cm ? (cm.adjusted ?? cm.expected) : null;
    const when = c.F.level ? `Ovulação ${c.F.level} em ${sd(c.F.ov)}: menstruação esperada entre ${sd(c.F.from)} e ${sd(c.F.to)}.` : '';
    if (cm && pr >= .05) g = { lvl: pr >= .25 ? 'warn' : 'info', pill: 'Possível', short: `${pc100(pr)} pelas relações · teste a partir de ${sd(c.testDate)}`, text: `<p>Pelas relações e dias: <b>${pc100(cm.expected)}</b>${cm.adjusted != null ? `; considerando o teste negativo de ${sd(cm.lastNeg)}: <b>${pc100(cm.adjusted)}</b>` : ''}. Toque em "Chance de ter engravidado" para ver o detalhe.</p><p>${when}</p><p>Faça o teste de gravidez a partir de <b>${fmt(c.testDate)}</b> (primeira urina do dia). Um teste feito hoje cobre as relações até ${sd(add(TODAY, -14))}.</p>` };
    else g = hit ? { lvl: 'info', pill: 'Possível', short: `Relação na janela fértil · teste a partir de ${sd(c.testDate)}`, text: `<p>Houve relação sem proteção dentro da janela fértil estimada (${sr(c.win[0], c.win[1])}). Faça o teste de gravidez a partir de <b>${fmt(c.testDate)}</b>.</p>` }
      : { lvl: 'ok', pill: 'Baixa', short: 'Relações fora da janela fértil estimada', text: '<p>As relações sem proteção registradas ficaram fora da janela fértil estimada. A estimativa pode errar em ciclos irregulares.</p>' };
  }
  out.push({ id: 'preg', ic: '🤰', title: 'Gravidez', ...g });
  if (A.pill) {
    const { run, stopped, effective, escape } = A.pill, exs = Object.keys(S.logs).filter(d => d >= last.start && d <= TODAY && ['Sem proteção', 'Sim'].includes(S.logs[d].sex)).length;
    out.push({ id: 'pill', ic: '💊', title: 'Pílula', lvl: stopped ? 'warn' : 'info', pill: stopped ? 'Interrompida' : 'Em uso',
      short: `${run.days} dia${run.days > 1 ? 's' : ''} (${sr(run.start, run.end)})${effective ? '' : ' · sem proteção'}${escape.length ? ` · escape ${sr(escape[0], escape.at(-1))}` : ''}`,
      text: `<p>Você tomou a pílula por <b>${run.days} dia${run.days > 1 ? 's' : ''}</b> (${sr(run.start, run.end)}).${effective ? '' : ' São necessários <b>7 dias seguidos</b> para a pílula proteger contra gravidez: neste período ela <b>não protegeu</b>.'}</p>`
        + (escape.length ? `<p>O sangramento de <b>${sr(escape[0], escape.at(-1))}</b> (${escape.length} dias) é compatível com <b>escape / sangramento de privação</b> depois de parar a pílula. Isso <b>não é menstruação</b> e não conta como início de ciclo.</p>` : '')
        + `<p>Depois de parar a pílula, a ovulação pode demorar semanas para voltar. Por isso o <b>ciclo atual (dia ${day})</b> foi tirado das estatísticas e dos sinais de SOP: ele não mostra o seu padrão natural.</p>`
        + (exs ? `<p>As <b>${exs}</b> relação(ões) deste ciclo seguem contando como sem proteção.</p>` : '') });
  }
  // 2) regularidade
  const sp = A.spread;
  out.push(sp == null ? { id: 'reg', ic: '🔁', title: 'Regularidade', lvl: 'info', pill: 'Poucos ciclos', short: 'Registre mais ciclos para avaliar', text: '<p>Preciso de pelo menos 3 menstruações registradas para avaliar a regularidade.</p>' }
    : { id: 'reg', ic: '🔁', title: 'Regularidade', lvl: sp <= 7 ? 'ok' : sp <= 9 ? 'info' : 'warn', pill: sp <= 7 ? 'Regular' : sp <= 9 ? 'Limítrofe' : 'Irregular', short: `Ciclos de ${A.min} a ${A.max} dias (variação de ${sp})`, text: `<p>Seus ciclos variaram <b>${sp} dias</b> (de ${A.min} a ${A.max}). Pela FIGO, variação de até 7–9 dias é considerada regular.</p>` });
  // 3) sinais compatíveis com SOP / anovulação
  const starts = A.g.map(x => x.start), gaps = starts.slice(1).map((d, i) => diff(d, starts[i])), longs = A.lens.slice(-6).filter(l => l > 35).length;
  const lhNeg = Object.keys(S.logs).filter(d => d >= last.start && S.logs[d].lh === 'Negativo').length, lhPos = Object.keys(S.logs).some(d => d >= last.start && S.logs[d].lh === 'Positivo');
  const acne = Object.keys(S.logs).filter(d => diff(TODAY, d) <= 60 && (S.logs[d].symptoms || []).includes('Acne')).length;
  const sig = [];
  if (sp != null && sp >= 10) sig.push(`ciclos irregulares (variação de ${sp} dias)`);
  if (longs >= 2 || gaps.some(x => x > 45)) sig.push(`ciclos longos (${longs ? longs + ' acima de 35 dias' : 'intervalo acima de 45 dias'})`);
  if (day > 45 && !S.settings.pregnancy && !A.pill) sig.push(`ciclo atual com ${day} dias`);
  if (lhNeg >= 5 && !lhPos && day > 20) sig.push(`${lhNeg} testes de LH negativos sem pico neste ciclo`);
  if (acne >= 3) sig.push('acne frequente nos últimos 60 dias');
  const n = sig.length;
  out.push({ id: 'sop', ic: '🧬', title: 'SOP / anovulação', lvl: n === 0 ? 'ok' : n === 1 ? 'info' : n === 2 ? 'warn' : 'warn', pill: n === 0 ? 'Nenhum' : n === 1 ? '1 sinal' : `${n} sinais`, short: n ? sig[0] + (n > 1 ? ` +${n - 1}` : '') : 'Nada compatível nos seus registros',
    text: n ? `<p>Sinais encontrados nos seus registros:</p><p>${sig.map(x => '• ' + x).join('<br>')}</p><p>Isso é compatível com ciclos irregulares ou sem ovulação, que podem ocorrer na SOP, mas também por tireoide, prolactina, estresse ou peso. <b>Não é diagnóstico</b>: a SOP exige avaliação médica (ciclos irregulares, hormônios e ultrassom).</p>${A.pill ? '<p>O ciclo atual, influenciado pela pílula, não foi contado.</p>' : ''}${n >= 2 ? '<p>Vale marcar uma consulta e levar este histórico.</p>' : ''}` : '<p>Seus registros não mostram sinais de ciclos muito longos ou irregulares. Isso não descarta nada: se algo preocupar, converse com seu ginecologista.</p>' });
  // 4) outros alertas
  if (day > 90 && !S.settings.pregnancy) out.push({ id: 'amen', ic: '⏳', title: 'Sem menstruar', lvl: 'alert', pill: `${day} dias`, short: 'Mais de 3 meses sem menstruar', text: '<p>Passaram-se mais de 90 dias desde a última menstruação. Procure seu ginecologista.</p>' });
  const short3 = A.lens.slice(-3).filter(l => l < 21).length;
  if (short3) out.push({ id: 'short', ic: '⚡', title: 'Ciclo curto', lvl: 'info', pill: 'Menos de 21 dias', short: 'Algum ciclo recente foi mais curto que 21 dias', text: '<p>Ciclos abaixo de 21 dias merecem atenção se forem frequentes. Comente com seu ginecologista.</p>' });
  const longMens = A.g.slice(-3).filter(x => diff(x.end, x.start) + 1 > 8).length;
  if (longMens) out.push({ id: 'longm', ic: '🩸', title: 'Menstruação longa', lvl: 'warn', pill: 'Mais de 8 dias', short: 'Sangramento acima de 8 dias em ciclo recente', text: '<p>Pela FIGO, sangramento acima de 8 dias é considerado prolongado. Vale avaliar com seu ginecologista.</p>' });
  if (A.lutMeasured >= 2 && A.luteal < 10) out.push({ id: 'lut', ic: '📉', title: 'Fase lútea curta', lvl: 'warn', pill: `${A.luteal} dias`, short: 'Menos de 10 dias entre ovulação e menstruação', text: `<p>Sua fase lútea medida é de ${A.luteal} dias, abaixo do esperado (12–14). Se estiver tentando engravidar, comente com seu médico.</p>` });
  return out;
}
const insightInfo = list => Object.fromEntries(list.map(i => ['i_' + i.id, [i.title, i.text + '<p class="note">Observações automáticas a partir dos seus registros, não são diagnóstico.</p>']]));
function cpTile(m) {
  if (!m) return '';
  return `<button class="wide cp" data-act="info" data-k="cp"><span>Chance de ter engravidado neste ciclo<small>${m.rels.length} relação(ões) · varia de ${pc100(m.min)} a ${pc100(m.max)}${m.adjusted != null ? ` · com o teste negativo: ${pc100(m.adjusted)}` : ''}</small></span><b>${pc100(m.expected)}</b></button>`;
}
function insightsCard(list) {
  let open = false; try { open = localStorage.getItem('ciclo.ins') === '1'; } catch {}
  const att = list.filter(i => i.lvl === 'warn' || i.lvl === 'alert').length;
  const rows = list.map(i => `<button class="ins ${i.lvl}" data-act="info" data-k="i_${i.id}"><span class="ic">${i.ic}</span><span class="tt"><b>${i.title}</b><small>${i.short}</small></span><span class="pl">${i.pill}</span></button>`).join('');
  return `<section class="insc ${open ? 'open' : ''}"><button class="insh" data-act="toggleins" aria-expanded="${open}"><span class="fi">📂</span><span class="ft"><b>Identificado no seu ciclo</b><small>${list.length} itens${att ? ` · ${att} pede${att > 1 ? 'm' : ''} atenção` : ' · tudo dentro do esperado'}</small></span><span class="dots">${list.map(i => `<i class="${i.lvl}"></i>`).join('')}</span><span class="chev">›</span></button><div class="insb"><div>${rows}</div></div></section>`;
}

// ---------- explicação da fase do ciclo (toque no cartão colorido) ----------
const PHASES = {
  lut: { t: 'Fase lútea', e: '🟠', what: 'É a fase entre a <b>ovulação</b> e a <b>próxima menstruação</b>. Depois que o óvulo é liberado, o folículo vira o <i>corpo lúteo</i>, que produz <b>progesterona</b> para preparar o útero. Dura em média <b>12 a 14 dias</b> (de 10 a 16 é normal). Sem gravidez, o corpo lúteo regride, os hormônios caem e a menstruação vem. Com gravidez, a progesterona continua alta e a menstruação não vem.',
    feel: [['🎈', 'Inchaço e retenção de líquido'], ['💗', 'Seios sensíveis ou doloridos'], ['😴', 'Mais cansaço e mais sono'], ['🍫', 'Desejo de doces e mais apetite'], ['🎭', 'Irritação, ansiedade ou humor sensível (TPM)'], ['🔴', 'Acne e pele mais oleosa'], ['🧱', 'Intestino mais preso'], ['🤕', 'Dor de cabeça'], ['⚡', 'Cólicas leves perto da menstruação'], ['🌡️', 'Temperatura basal 0,2 a 0,5 °C mais alta'], ['💧', 'Secreção pegajosa, cremosa ou pouca: é o esperado']],
    tips: ['Beba bastante água e reduza o sal para diminuir o inchaço', 'Durma bem e faça atividade leve', 'Anote os sintomas: eles ajudam a prever a próxima menstruação'], seek: 'dor forte, sangramento intenso ou TPM que atrapalha o dia a dia' },
  fol: { t: 'Fase folicular', e: '🟣', what: 'Começa no <b>1º dia da menstruação</b> e vai até a <b>ovulação</b>. O cérebro manda o hormônio FSH, os folículos (onde ficam os óvulos) crescem e o <b>estrogênio</b> sobe, reconstruindo o revestimento do útero. É a fase que <b>mais varia</b> de duração, principalmente em ciclos irregulares.',
    feel: [['⚡', 'Mais energia e disposição'], ['🙂', 'Humor mais estável e leve'], ['✨', 'Pele melhor'], ['🔥', 'Libido subindo aos poucos'], ['💧', 'A secreção muda: seca, depois pegajosa, cremosa e por fim aquosa ou clara de ovo'], ['🌡️', 'Temperatura basal mais baixa']],
    tips: ['Boa fase para treinos mais intensos', 'Observe o muco: ele avisa que a ovulação está chegando'], seek: 'sangramento fora da menstruação ou dor pélvica forte' },
  fert: { t: 'Janela fértil', e: '🟢', what: 'São os cerca de <b>6 dias que terminam na ovulação</b>, quando uma relação pode gerar gravidez. O estrogênio chega ao pico, o hormônio <b>LH</b> dispara e o óvulo é liberado cerca de 24 a 36 horas depois. Ele vive só ~24 horas, mas o espermatozoide sobrevive até 5 dias.',
    feel: [['🥚', 'Muco elástico, transparente, como clara de ovo, ou aquoso'], ['🔥', 'Libido mais alta'], ['📍', 'Dor leve de um lado da barriga (dor da ovulação)'], ['🩸', 'Pequeno escape de sangue, em algumas mulheres'], ['💗', 'Seios sensíveis'], ['🌡️', 'A temperatura cai um pouco e sobe depois da ovulação']],
    tips: ['Os 2 dias antes da ovulação e o dia dela são os de maior chance', 'O teste de LH positivo indica ovulação em 1 a 2 dias'], seek: 'dor forte ou que não passa' },
  mens: { t: 'Menstruação', e: '🔴', what: 'É o <b>início do ciclo</b>. Sem gravidez, o estrogênio e a progesterona estão baixos e o útero elimina o revestimento que construiu. Dura em média 3 a 7 dias.',
    feel: [['⚡', 'Cólicas'], ['🔙', 'Dor nas costas'], ['😴', 'Cansaço'], ['🎈', 'Inchaço'], ['🥺', 'Humor mais sensível'], ['🤕', 'Dor de cabeça (enxaqueca menstrual)']],
    tips: ['Calor local e descanso aliviam a cólica', 'Ferro e boa hidratação ajudam a repor o que se perde'], seek: 'trocar o absorvente a cada hora por 2 horas seguidas, sangramento acima de 8 dias ou dor muito forte' },
  late: { t: 'Ciclo além do habitual', e: '🔴', what: 'A menstruação ainda não veio e o ciclo <b>passou da sua faixa habitual</b>. As causas mais comuns são <b>gravidez</b>, ovulação tardia, estresse, mudança de peso ou de rotina, parar a pílula, tireoide e SOP.',
    feel: [['💗', 'Seios sensíveis e cansaço (também ocorrem na gravidez)'], ['🤢', 'Enjoo, principalmente de manhã'], ['🚽', 'Vontade de urinar com mais frequência'], ['🎈', 'Inchaço e sensação de barriga pesada'], ['🩸', 'Escape leve, às vezes']],
    tips: ['Faça um teste de gravidez com a primeira urina do dia', 'Sem menstruar por 3 meses, procure o ginecologista'], seek: 'dor forte, sangramento intenso, tontura ou desmaio' }
};
function recentMucus() {
  const names = { Seco: 'sem secreção', Pegajoso: 'pegajosa', Cremoso: 'cremosa', 'Clara de ovo': 'clara de ovo', Aquoso: 'aquosa' }, runs = [];
  for (let i = 9; i >= 0; i--) { const d = add(TODAY, -i), v = S.logs[d]?.mucus; if (!v) continue; const r = runs.at(-1); if (r && r.v === v && diff(d, r.end) === 1) r.end = d; else runs.push({ v, start: d, end: d }); }
  return runs.map(r => `${names[r.v]} (${sr(r.start, r.end)})`);
}
function phaseSheet(A, kind) {
  const P = PHASES[kind] || PHASES.fol, c = conceiveInfo(A), F = c.F, day = c.day, last = c.last;
  let when = '';
  if (kind === 'lut') {
    if (c.ov) { const n = diff(TODAY, c.ov); when = `<p>Ovulação ${c.e ? c.e.level : 'estimada'} em <b>${fmt(c.ov)}</b>${c.e ? ` (${c.e.src.join(' + ')})` : ''}. Hoje é o <b>${n}º dia depois da ovulação</b>, no <b>dia ${day}</b> do seu ciclo.</p><p>Menstruação esperada entre <b>${sd(F.from)}</b> e <b>${sd(F.to)}</b>.${n > 16 ? ` Isso já passa da duração habitual da fase lútea (12 a 14 dias; a sua medida: ${A.luteal}), então a menstruação deve vir logo, <b>ou pode ser gravidez</b>: um teste mostra.` : ''}</p>`; }
    else when = `<p>Você está no <b>dia ${day}</b> do ciclo. Sem sinais de ovulação registrados, o app estimou a fase pelos seus ciclos. Menstruação esperada entre <b>${sd(F.from)}</b> e <b>${sd(F.to)}</b>.</p>`;
  } else if (kind === 'fol') when = `<p>Você está no <b>dia ${day}</b> do ciclo.${c.ov ? ` Ovulação estimada em <b>${fmt(c.ov)}</b>.` : ''}</p>`;
  else if (kind === 'fert') when = `<p>Você está no <b>dia ${day}</b> do ciclo.${c.win ? ` Janela fértil: <b>${sr(c.win[0], c.win[1])}</b>; melhores dias: <b>${sr(c.best[0], c.best[1])}</b>.` : ''}</p>`;
  else if (kind === 'mens') when = `<p>Você está no <b>dia ${day}</b> do ciclo, o <b>${diff(TODAY, last.start) + 1}º dia</b> da menstruação.</p>`;
  else when = `<p>Você está no <b>dia ${day}</b> do ciclo, <b>${F.over} dia(s)</b> além da faixa habitual (${A.lo}–${A.hi} dias).${A.max > A.hi ? ` Você já teve ciclos de até ${A.max} dias.` : ''}${A.pill?.stopped ? ' A pílula interrompida pode atrasar a ovulação.' : ''}</p>`;
  const rec = recentMucus(), mine = (S.logs[TODAY]?.symptoms || []);
  const overlap = kind === 'lut' ? '<p><b>Atenção:</b> vários desses sinais (seios sensíveis, cansaço, enjoo, vontade de urinar, pequeno escape 6 a 12 dias após a ovulação) são <b>iguais aos do início da gravidez</b>. Só o teste de gravidez diferencia.</p>' : '';
  return [`${P.e} ${P.t}`, `<p>${P.what}</p>
    <h4 class="ph">Em que período você está</h4>${when}
    <h4 class="ph">O que costuma sentir</h4><div class="feel">${P.feel.map(([e, t]) => `<div><span>${e}</span>${t}</div>`).join('')}</div>${overlap}
    ${rec.length ? `<h4 class="ph">O que você registrou</h4><p>Secreção: ${rec.join(', ')}.${kind === 'lut' ? ' Secreção pegajosa ou cremosa é a esperada nesta fase.' : ''}</p>` : ''}
    <h4 class="ph">Cuidados</h4><p>${P.tips.map(x => '• ' + x).join('<br>')}</p>
    <p class="note">Procure atendimento se tiver ${P.seek}. Informação geral, não substitui orientação médica.</p>`];
}

function vHoje() {
  if (goalOf() === 'pregnant') return vHojePreg();
  const A = analyze(), last = A.g.at(-1);
  if (!last) return `<h1>Olá 🌸</h1><div class="card"><p>Registre o <b>primeiro dia da última menstruação</b> (ou importe seu histórico em Ajustes).</p><button class="btn" data-act="log" data-d="${TODAY}">Registrar hoje</button></div>`;
  if (goalOf() === 'conceive') return vHojeConceive(A, last);
  const day = diff(TODAY, last.start) + 1, F = nextPeriod(A), f = fertility(A), pc = pregCheck(A), ph = phaseOf(TODAY, A);
  const beyond = F.late, over = F.over, tdays = diff(F.center, TODAY);
  const prec = F.confirmed ? 3 : F.level ? 2 : A.n >= 3 ? 2 : 1, precTxt = ['', 'Baixa', 'Média', 'Alta'][prec];
  let st, head, sub;
  if (beyond) { st = 'late'; head = `${over} dia${over > 1 ? 's' : ''} de atraso`; sub = A.pill?.stopped ? `Pílula interrompida em ${sd(A.pill.run.end)}: pode atrasar a ovulação` : A.max > A.hi ? `Habitual ${A.lo}–${A.hi} dias · você já teve ${A.max}` : `Seu padrão: ${A.lo}–${A.hi} dias`; }
  else if (ph === 'menstrual') { st = 'mens'; head = 'Menstruação'; sub = `Dia ${day}`; }
  else if (f && ['Alta', 'Muito alta'].includes(f.level)) { st = 'fert'; head = f.level === 'Muito alta' ? 'Pico de fertilidade' : 'Janela fértil'; sub = f.ov ? `Ovulação ${sd(f.ov)}` : `Chance ${f.level.toLowerCase()}`; }
  else { st = ph === 'lutea' ? 'lut' : 'fol'; head = PHASE[ph] || 'Ciclo'; sub = tdays > 0 ? `Menstruação em ~${tdays}d` : 'Menstruação hoje'; }
  const R = 44, C = 2 * Math.PI * R, pct = Math.min(day / Math.max(A.hi, day), 1);
  const pr = periodProb(A, F, 7), L = S.logs[TODAY] || {};
  const lhDay = Math.max(5, (A.n ? A.min : A.lo) - 17), lhDate = add(last.start, lhDay - 1);
  const col = f && ['Alta', 'Muito alta'].includes(f.level) ? 'var(--green)' : f?.level === 'Média' ? 'var(--amber)' : 'var(--mute)';
  const ci = conceiveInfo(A), ovTile = f?.ev ? [sd(f.ov), f.level2] : ci.ov ? [sd(ci.ov), 'estimada pelos seus ciclos'] : ['—', diff(lhDate, TODAY) > 0 ? `LH em ${sd(lhDate)}` : 'faça o teste de LH'];
  const ins = insights(A), cm = conceptionModel(A);
  INFO = {
    ...(cm ? { cp: cpInfo(cm) } : {}),
    h_mens: ['Previsão da menstruação', `<p>${F.nobase ? `Seu ciclo está no dia ${day}, mais longo que todos os que já registrei.` : F.extended ? `Seu ciclo passou da faixa habitual (${A.lo}–${A.hi} dias). Usei ${F.base} ciclo(s) anterior(es) que também passaram do dia ${day}: previsão <b>${sr(F.from, F.to)}</b>, mais provável <b>${sd(F.center)}</b>.` : `Faixa provável: <b>${sr(F.from, F.to)}</b>. Mais provável: <b>${sd(F.center)}</b>.`}</p><p>${F.level ? `Baseada na ovulação ${F.level} (${F.src}) + sua fase lútea de ${A.luteal} dias.` : `Baseada nos seus ${A.n} últimos ciclos (${A.lo}–${A.hi} dias). Com teste de LH ou temperatura, a faixa fica bem mais estreita.`}</p>`],
    h_ov: ['Ovulação', f?.ev ? `<p>Ovulação <b>${f.level2}</b> em <b>${fmt(f.ov)}</b>, pelos sinais: ${ovSrc(last.start, TODAY)}.</p><p>Janela fértil: ${sr(add(f.ov, -5), add(f.ov, 1))}. Melhores dias: ${sr(add(f.ov, -2), f.ov)}.</p>` : `<p>Ainda sem sinais neste ciclo.</p><p>Registre o <b>muco</b> todo dia, a <b>dor</b> e o <b>teste de LH</b> (comece ${diff(lhDate, TODAY) > 0 ? 'em ' + fmt(lhDate) : 'hoje'}). Cada sinal ajusta a previsão.</p>`],
    h_chance: ['Chance de gravidez hoje', `<p><b>${f?.level || '—'}</b> — ${f?.txt || ''}.</p><p class="mute small">Estimativa: não serve como método contraceptivo.</p>`],
    h_prec: ['Precisão da previsão', `<p>Precisão <b>${precTxt}</b>.</p><p>${prec === 3 ? 'A ovulação foi confirmada, então a menstruação é prevista com margem de ±2 dias.' : prec === 2 ? 'Baseada no seu histórico. Confirmar a ovulação (LH ou temperatura) deixa a previsão mais certeira.' : 'Poucos ciclos registrados. A previsão melhora a cada ciclo.'}</p>`],
    ...insightInfo(ins),
    h_alert: ['Atraso', pc?.hasNeg ? `<p>Teste negativo em <b>${fmt(pc.lastNeg)}</b> (${diff(TODAY, pc.lastNeg)} dias atrás). Ciclo ${over} dia(s) além da faixa habitual (${A.lo}–${A.hi}).</p><p>${pc.line}</p><p>Causas comuns: ovulação tardia, estresse, tireoide ou SOP. Sem menstruar até ${fmt(add(last.start, 90))} (3 meses), ou com dor forte/sangramento intenso, procure seu ginecologista.</p>` : `<p>Ciclo ${over} dia(s) além da faixa habitual (${A.lo}–${A.hi}).</p><p>Pode ser ovulação tardia, estresse, SOP ou tireoide, mas <b>gravidez é uma possibilidade</b>. Faça um teste (primeira urina do dia) e registre o resultado. Sem menstruar por 3 meses, procure seu ginecologista.</p>`]
  };
  const banner = beyond && !S.settings.pregnancy ? `<button class="banner" data-act="info" data-k="h_alert"><span>${pc?.hasNeg ? `Teste negativo em ${sd(pc.lastNeg)}` : 'Faça um teste de gravidez'}</span><b>Ver ›</b></button>` : '';
  const dk = isDark();
  return `<div class="toprow"><h1 class="cap">${fmt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
  ${pregBanner()}${banner}
  <section class="hh st-${st}">
    <button class="prec" data-act="info" data-k="h_prec" aria-label="Precisão da previsão">Precisão <span class="dots">${'●'.repeat(prec)}${'○'.repeat(3 - prec)}</span></button>
    <div class="hhb" role="button" tabindex="0" data-act="phase" data-k="${st}" aria-label="Entender esta fase"><div class="hr"><div class="ring2"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#ffffff40" stroke-width="9"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 50 50)"/></svg><div><small>dia</small><b>${day}</b></div></div>
    <div class="ht"><h2>${head}</h2><p>${sub}</p><p class="phint">Toque para entender esta fase ›</p></div></div>
    ${cycleStrip(A, last, F, f, day)}</div>
  </section>
  <button class="btn regbtn" data-act="log" data-d="${TODAY}">${S.logs[TODAY] ? '✎ Editar registro de hoje' : '＋ Registrar hoje'}</button>
  ${cpTile(cm)}${insightsCard(ins)}
  <div class="tiles4">
    <button class="tile" data-act="info" data-k="h_mens"><small>Próxima menstruação</small><b>${F.nobase ? 'Sem base' : sr(F.from, F.to)}</b><em>${F.nobase ? `dia ${day}, além do histórico` : F.extended ? `ciclos longos: ~${sd(F.center)}` : `provável ${sd(F.center)}`}</em></button>
    <button class="tile" data-act="info" data-k="h_ov"><small>Ovulação</small><b>${ovTile[0]}</b><em>${ovTile[1]}</em></button>
    <button class="tile" data-act="info" data-k="h_chance"><small>Chance hoje</small><b style="color:${col}">${f ? f.level : '—'}</b><em>${f?.p != null ? Math.round(f.p * 100) + '% dos ciclos' : f?.ev ? 'ovulação ' + f.level2 : ''}</em></button>
    <button class="tile" data-act="info" data-k="h_mens"><small>Menstrua em 7 dias</small><b>${pr == null ? '—' : pr + '%'}</b><em>${pr == null ? 'fora do padrão' : 'de chance'}</em></button>
  </div>
  <p class="fine">Estimativas · não é método contraceptivo</p>`;
}

function vCal() {
  const A = analyze(), K = marks(A), pg = pregInfo(), since = pregSince(), ci = pg ? conceptionInfo(pg) : null;
  if (pg) { for (const d of [...K.pper, ...K.pper2, ...K.late, ...K.ov]) if (d >= since) { K.pper.delete(d); K.pper2.delete(d); K.late.delete(d); K.ov.delete(d); } for (const d of [...K.fert.keys()]) if (d >= since) K.fert.delete(d); }
  const first = new Date(cal.y, cal.m, 1, 12), n = new Date(cal.y, cal.m + 1, 0).getDate();
  const best = new Set();
  if (goalOf() === 'conceive') K.ov.forEach(o => { for (let k = -2; k <= 0; k++) best.add(add(o, k)); });
  let cells = '<div class="dow">D</div><div class="dow">S</div><div class="dow">T</div><div class="dow">Q</div><div class="dow">Q</div><div class="dow">S</div><div class="dow">S</div>';
  for (let i = 0; i < first.getDay(); i++) cells += '<div class="d out"></div>';
  for (let d = 1; d <= n; d++) {
    const s = iso(new Date(cal.y, cal.m, d, 12));
    const L = S.logs[s] || {};
    const inPg = pg && s >= since && s <= add(pg.dpp, 14), pgd = inPg ? diff(s, pg.dum) : 0;
    const c = ['d', inPg && !K.per.has(s) ? 'pg' + (s === pg.dpp ? ' dpp' : '') + (s === ci.ov ? ' conc' : '') : '', K.per.has(s) ? 'per' : K.late.has(s) ? 'late' : K.pper.has(s) ? 'pper' : K.pper2.has(s) ? 'pper2' : K.fert.has(s) ? 'fert' : '', K.ov.has(s) ? 'ov' : '', best.has(s) ? 'best' : '', s === TODAY ? 'today' : ''].join(' ');
    const heart = L.sex && L.sex !== 'Não' ? '<b>♥</b>' : '';
    const pillM = (L.meds || []).includes('Anticoncepcional') ? '<u>💊</u>' : '', spotM = L.flow === 'spot' ? '<s></s>' : '';
    const dot = Object.keys(L).some(k => k !== 'flow' && k !== 'sex' && k !== 'meds') ? '<i></i>' : '';
    const wkm = inPg && pgd >= 0 && pgd % 7 === 0 && s !== TODAY ? `<em class="wkm">${pgd / 7}s</em>` : '';
    cells += `<button class="${c}" ${K.fert.has(s) ? `style="--p:${K.fert.get(s)}"` : ''} data-act="log" data-d="${s}">${d}${wkm}<span class="mk">${s === pg?.dpp ? '🎀' : ''}${pillM}${spotM}${heart}${dot}</span></button>`;
  }
  let winCard = '';
  if (pg) winCard = `<div class="predrow"><div class="pred p3"><small>Gestação</small><b>${pg.sem}s ${pg.d}d</b><em>${pg.tri}</em></div><div class="pred p3"><small>Parto previsto</small><b>${fmt(pg.dpp, { day: 'numeric', month: 'short', year: 'numeric' })}</b><em>faltam ${Math.max(pg.left, 0)} dias</em></div></div>`;
  else if (A.g.length) {
    const c = conceiveInfo(A), F = c.F;
    const win = c.win ? sr(c.win[0], c.win[1]) : '—', best = c.best ? sr(c.best[0], c.best[1]) : '';
    winCard = `<div class="predrow"><div class="pred p1"><small>Próxima menstruação</small><b>${F.nobase ? 'Sem base' : sr(F.from, F.to)}</b><em>${F.nobase ? 'além do histórico' : `provável ${sd(F.center)}`}</em></div><div class="pred p2"><small>Período fértil</small><b>${win}</b><em>${best ? `melhores dias ${best}` : 'sem estimativa'}</em></div></div><p class="note">Previsão com base nos seus ${A.n} ciclos (${A.min ?? '—'} a ${A.max ?? '—'} dias)${F.extended && !F.nobase ? ` · como o ciclo passou do habitual, usei seus ciclos longos` : ''}.</p>`;
  }
  const title = new Date(cal.y, cal.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `${winCard}<div class="cal-h"><button data-act="prev">‹</button><h1 class="cap" style="margin:0">${title}</h1><button data-act="next">›</button></div>
  <div class="grid">${cells}</div>
  ${more('Legenda do calendário', `<div class="legend" style="margin:0">${pg ? `<span><i style="background:var(--pink-l);border:1px solid var(--pink)"></i>Gestação (a partir de ${sd(since)})</span><span>🎀 Parto previsto</span><span><i style="border:2px dotted var(--pink);border-radius:50%"></i>Concepção</span><span>Ns = semana</span>` : ''}<span><i style="background:var(--rose);border-radius:50%"></i>Menstruação</span><span><i style="border:2px dashed var(--rose)"></i>Menstruação prevista</span><span><i style="border:2px dotted var(--rose);opacity:.6"></i>Ciclo seguinte</span><span style="color:var(--teal)"><i style="background:var(--teal)"></i>Janela fértil</span><span><i style="border:2px dotted var(--teal);border-radius:50%"></i>Ovulação</span><span><i style="background:#4d5a75;border-radius:50%"></i>Atraso</span><span style="color:var(--rose)">♥ Sexo</span><span>● Outro registro</span><span>💊 Pílula</span><span><i style="background:var(--rose);border-radius:50%;opacity:.7;width:7px;height:7px"></i>Escape</span></div>`, '', '🎨')}`;
}

function barChart(vals, a) {
  const W = 340, H = 140, p = 24, mx = Math.max(...vals, a) + 4, mn = Math.min(...vals, a) - 8, bw = (W - p * 2) / vals.length;
  const y = v => H - 20 - (v - mn) / (mx - mn) * (H - 40);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${vals.map((v, i) => `<rect x="${p + i * bw + 3}" y="${y(v)}" width="${bw - 6}" height="${H - 20 - y(v)}" rx="4" fill="var(--pink)"/><text x="${p + i * bw + bw / 2}" y="${y(v) - 3}" text-anchor="middle">${v}</text>`).join('')}<line x1="${p}" x2="${W - p}" y1="${y(a)}" y2="${y(a)}" stroke="var(--violet)" stroke-dasharray="4 3"/><text x="${W - p}" y="${y(a) - 3}" text-anchor="end">média ${Math.round(a)}</text></svg>`;
}

function tempChart(A) {
  const last = A.g.at(-1);
  if (!last) return '<p class="mute">Registre a temperatura basal (ao acordar, antes de levantar) para ver o gráfico.</p>';
  const pts = [];
  for (let d = last.start; d <= TODAY; d = add(d, 1)) if (S.logs[d]?.temp) pts.push([diff(d, last.start), S.logs[d].temp, d]);
  if (pts.length < 2) return '<p class="mute">Registre a temperatura basal (ao acordar, antes de levantar) por alguns dias para ver o gráfico deste ciclo.</p>';
  const W = 340, H = 150, p = 28, xs = Math.max(...pts.map(q => q[0]), 13), mn = Math.min(...pts.map(q => q[1])) - .1, mx = Math.max(...pts.map(q => q[1])) + .1;
  const X = v => p + v / xs * (W - p * 2), Y = v => H - 22 - (v - mn) / (mx - mn) * (H - 42);
  const ov = detectOv(last.start, TODAY);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="var(--pink)" stroke-width="2" points="${pts.map(q => `${X(q[0])},${Y(q[1])}`).join(' ')}"/>${pts.map(q => `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="3" fill="var(--pink)"/>`).join('')}${ov ? `<line x1="${X(diff(ov, last.start))}" x2="${X(diff(ov, last.start))}" y1="10" y2="${H - 22}" stroke="var(--teal)" stroke-dasharray="4 3"/><text x="${X(diff(ov, last.start))}" y="10" text-anchor="middle">ovulação</text>` : ''}<text x="${p}" y="${H - 6}">dia 1</text><text x="${W - p}" y="${H - 6}" text-anchor="end">dia ${xs + 1}</text><text x="4" y="${Y(mx - .1) + 4}">${(mx - .1).toFixed(1)}</text><text x="4" y="${Y(mn + .1) + 4}">${(mn + .1).toFixed(1)}</text></svg>${ov ? `<p class="note">Subida sustentada de temperatura: ovulação provável em ${fmt(ov)}.</p>` : ''}`;
}

function patterns(A) {
  const by = {};
  for (const [d, l] of Object.entries(S.logs)) {
    const ph = phaseOf(d, A);
    if (!ph) continue;
    const o = by[ph] ||= { sym: {}, mood: {} };
    (l.symptoms || []).forEach(s => o.sym[s] = (o.sym[s] || 0) + 1);
    (l.mood || []).forEach(s => o.mood[s] = (o.mood[s] || 0) + 1);
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => `${x[0]} (${x[1]})`).join(', ') || '—';
  const keys = Object.keys(PHASE).filter(k => by[k]);
  if (!keys.length) return '<p class="mute">Registre sintomas e humor por alguns ciclos para ver padrões por fase.</p>';
  return keys.map(k => `<div class="row" style="align-items:flex-start"><span class="pill p-${k}">${PHASE[k]}</span><span style="text-align:right;font-size:13px">${top(by[k].sym)}<br><span class="mute">${top(by[k].mood)}</span></span></div>`).join('');
}

function interpret(A) {
  if (A.n < 2) return '<p class="mute">Preciso de pelo menos 3 menstruações registradas para avaliar seu padrão.</p>';
  const out = [], bad = A.lens.filter(l => l < 24 || l > 38).length;
  if (A.spread > 9) out.push(`Seus ciclos variam <b>${A.spread} dias</b> (de ${A.min} a ${A.max}). Pela FIGO, variação acima de 7–9 dias caracteriza <b>ciclo irregular</b>.`);
  else if (A.spread > 7) out.push(`Variação de ${A.spread} dias: no limite do considerado regular (7–9 dias pela FIGO).`);
  else out.push(`Variação de ${A.spread} dias entre seus ciclos recentes: dentro do esperado para ciclos regulares.`);
  if (bad) out.push(`${bad} de ${A.lens.length} ciclos ficaram fora da faixa de 24–38 dias.`);
  const last = A.g.at(-1);
  if (last && diff(TODAY, last.start) + 1 > A.max) out.push(`O ciclo atual (dia ${diff(TODAY, last.start) + 1}) já é mais longo que todos os anteriores.`);
  if (A.spread > 9 || bad) out.push('Vale conversar com seu ginecologista: causas comuns incluem SOP, tireoide, prolactina, estresse e peso. Leve este histórico.');
  return out.map(t => `<p style="margin:6px 0">• ${t}</p>`).join('');
}

function signalsCard(A) {
  const done = A.cyc.filter(c => c.ovDay);
  if (!done.length) return '<p class="mute">Registre muco, dor, teste de LH e temperatura: com os sinais, o app aprende em que dia do ciclo você ovula e quanto dura a sua fase lútea.</p>';
  const days = done.map(c => c.ovDay), med = days.slice().sort((a, b) => a - b)[Math.floor(days.length / 2)];
  const rows = done.slice(-6).map(c => `<div class="row"><span>${fmt(c.start)}</span><span class="small">dia <b>${c.ovDay}</b> · <span class="mute">${c.level}${c.src ? ' (' + c.src.join(' + ') + ')' : ''}</span></span></div>`).join('');
  return `<p style="margin:0 0 6px">Você costuma ovular por volta do <b>dia ${med}</b> do ciclo${days.length > 1 ? ` (entre ${Math.min(...days)} e ${Math.max(...days)})` : ''}. Fase lútea ${A.lutMeasured >= 2 ? 'medida' : 'padrão'}: <b>${A.luteal} dias</b>.</p>${rows}`;
}

function triesCard(A) {
  const rows = A.cyc.slice(-6).map(c => {
    const o = add(c.start, (c.ovDay ?? c.len - A.luteal) - 1);
    let n = 0; for (let d = add(o, -5); d <= add(o, 1); d = add(d, 1)) if (S.logs[d]?.sex && S.logs[d].sex !== 'Não') n++;
    return `<div class="row"><span>${sd(c.start)}</span><span class="small"><b>${n}</b> relação(ões) na janela</span></div>`;
  });
  const last = A.g.at(-1);
  if (last) rows.push(`<div class="row"><span>${sd(last.start)} (atual)</span><span class="small"><b>${conceiveInfo(A).tries}</b> relação(ões) na janela</span></div>`);
  const since = S.settings.conceiveSince ? A.g.filter(g => g.start >= S.settings.conceiveSince).length : 0;
  return `<div class="card"><h2>Tentativas por ciclo</h2>${rows.join('') || '<p class="mute">Registre as relações para acompanhar.</p>'}${since >= 3 ? '<p class="note">Com ciclos irregulares, não precisa esperar 12 meses: converse com seu ginecologista.</p>' : ''}</div>`;
}

function vAna() {
  const A = analyze();
  const reg = A.spread == null ? '—' : A.spread <= 7 ? 'Regular' : A.spread <= 9 ? 'Limítrofe' : 'Irregular';
  const conceive = goalOf() === 'conceive' && A.g.length;
  return `<h1>Análises</h1>
  ${conceive ? triesCard(A) : ''}
  <div class="card"><h2>Resumo</h2><div class="stats">
    <div><div class="mute small">Ciclo médio</div><div class="big">${A.n ? Math.round(A.mean) + ' dias' : '—'}</div></div>
    <div><div class="mute small">Menstruação</div><div class="big">${A.g.length ? A.period + ' dias' : '—'}</div></div>
    <div><div class="mute small">Faixa habitual</div><div class="big">${A.n ? `${A.lo}–${A.hi}` : '—'}</div></div>
    <div><div class="mute small">Regularidade</div><div class="big">${reg}</div></div>
    <div><div class="mute small">Fase lútea</div><div class="big">${A.luteal} dias</div></div>
    <div><div class="mute small">Ciclos registrados</div><div class="big">${A.g.length}</div></div>
  </div><p class="note">${A.lutMeasured >= 2 ? 'Fase lútea medida pelas suas ovulações confirmadas.' : 'Fase lútea padrão (14). Com 2+ ovulações confirmadas (LH ou temperatura) o app mede a sua.'}</p></div>
  <div class="list">${more('Interpretação', interpret(A), reg, '🩺')}${more('Seus sinais de ovulação', signalsCard(A), '', '🥚')}${more('Padrões por fase', patterns(A), '', '🌙')}</div>
  <div class="card"><h2>Duração dos ciclos</h2>${A.lens.length ? barChart(A.lens.slice(-12), avg(A.lens.slice(-12))) : '<p class="mute">Precisa de pelo menos 2 menstruações registradas.</p>'}</div>
  ${(() => { const t = tempChart(A); return t.includes('class="mute"') ? `<div class="list">${more('Temperatura basal', t, 'sem dados', '🌡️')}</div>` : `<div class="card"><h2>Temperatura basal (ciclo atual)</h2>${t}</div>`; })()}
  <button class="btn alt" data-go="guia">Guia de saúde baseado em diretrizes</button>`;
}

function vCfg() {
  const s = S.settings;
  return `<h1>Ajustes</h1>
  <div class="card"><h2>Aparência</h2><button class="sw" data-act="theme" role="switch" aria-checked="${isDark()}" aria-label="Modo noturno"><span>Modo noturno</span><span class="tr"><i><svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></i></span></button></div>
  ${modeSwitch()}
  ${(() => { const g = pregInfo(); return g ? `<div class="card"><h2>Gestação</h2><p class="mute small" style="margin:0 0 10px">Em acompanhamento: ${g.sem}s ${g.d}d · parto previsto ${fmt(g.dpp, { day: 'numeric', month: 'short', year: 'numeric' })}</p><button class="btn alt" data-go="gest">Abrir gestação</button><div style="height:8px"></div><button class="btn alt" data-act="editdum">Ajustar data</button><div style="height:8px"></div><button class="btn danger" data-act="endpreg">Sair do modo gestação</button></div>` : '<div class="card"><h2>Gestação</h2><p class="mute small" style="margin:0 0 10px">Teve teste positivo ou já está grávida? Ative o acompanhamento semana a semana.</p><button class="btn alt" data-act="startgest">Acompanhar gestação</button></div>'; })()}
  <div class="card"><h2>Valores iniciais</h2><p class="note">Usados até o app ter histórico suficiente.</p>
    <div class="two"><div><label class="f">Ciclo (dias)</label><input type="number" min="21" max="45" data-set="cycle" value="${s.cycle}"></div><div><label class="f">Menstruação (dias)</label><input type="number" min="2" max="10" data-set="period" value="${s.period}"></div></div>
    <label class="f">Fase lútea (dias)</label><input type="number" min="10" max="16" data-set="luteal" value="${s.luteal}"></div>
  <div class="card"><h2>Importar histórico</h2><p class="note">Cole uma menstruação por linha, do jeito que estiver no seu outro app. Ex.: <code>15/09/2026 a 20/09/2026</code>, <code>15/09/2026 5</code> (5 dias) ou só <code>15/09</code>.</p>
    <textarea id="hist" rows="6" placeholder="15/08/2026 5&#10;12/09/2026 a 17/09/2026&#10;10/10"></textarea><div style="height:8px"></div>
    <button class="btn alt" data-act="hist">Importar datas</button><p class="note" id="histmsg"></p></div>
  <div class="card"><h2>Dados</h2><p class="note">Tudo fica só neste aparelho. Faça backup de vez em quando.</p>
    <button class="btn alt" data-act="export">Exportar backup (.json)</button><div style="height:8px"></div>
    <button class="btn alt" data-act="import">Importar backup</button><div style="height:8px"></div>
    <button class="btn danger" data-act="wipe">Apagar tudo</button></div>
  <p class="fine">Meu Ciclo · versão 36</p>`;
}

function applyGoal() { if (goalOf() === 'conceive') document.documentElement.dataset.goal = 'conceive'; else delete document.documentElement.dataset.goal; }
function updateNav() {
  const g = goalOf(), eng = document.querySelector('[data-tab=eng]'), gest = document.querySelector('[data-tab=gest]');
  if (eng) { eng.hidden = g !== 'conceive'; const sp = eng.querySelector('span'); if (sp) sp.textContent = 'Plano'; }
  if (gest) gest.hidden = g !== 'pregnant';
  if (g === 'conceive') document.documentElement.dataset.goal = 'conceive'; else delete document.documentElement.dataset.goal;
}
const MORE = [];
const more = (title, html, sub = '', ic = '') => { MORE.push([title, html]); return `<button class="morerow" data-act="more" data-i="${MORE.length - 1}">${ic ? `<span class="mic">${ic}</span>` : ''}<span class="mt">${title}${sub ? `<small>${sub}</small>` : ''}</span><i>›</i></button>`; };
function foldNotes(root) {
  root.querySelectorAll('p.note').forEach(p => { MORE.push(['Saiba mais', `<p>${p.innerHTML}</p>`]); const b = document.createElement('button'); b.className = 'nbtn'; b.dataset.act = 'more'; b.dataset.i = MORE.length - 1; b.textContent = 'ⓘ Saiba mais'; p.replaceWith(b); });
}
function render() {
  MORE.length = 0;
  if (view === 'eng' && goalOf() !== 'conceive') view = 'hoje';
  $main.innerHTML = { hoje: vHoje, cal: vCal, eng: vEng, gest: vGest, ana: vAna, cfg: vCfg, guia: vGuia }[view]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
  foldNotes($main);
  updateNav();
  if (view === 'gest') mount3d();
}

// ---------- registro do dia ----------
// ---------- registro do dia (um cartão por assunto) ----------
const norm2 = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const YN = [['Negativo', 'Negativo', '➖'], ['Positivo', 'Positivo', '➕']];
const DSEC = [
  { id: 'flow', t: 'Menstruação', c: '#e8456b', g: [{ k: 'flow', multi: false, o: [['spot', 'Escape', '🩸'], ['light', 'Fluxo leve', '💧'], ['med', 'Fluxo médio', '🩸'], ['heavy', 'Fluxo intenso', '🌊']] }] },
  { id: 'sint', t: 'Sintomas', c: '#7a5bd1', g: [{ k: 'symptoms', multi: true, o: [['Cólica', 'Cólicas', '⚡'], ['Dor de cabeça', 'Dor de cabeça', '🤕'], ['Inchaço', 'Inchaço', '🎈'], ['Seios sensíveis', 'Seios sensíveis', '💗'], ['Acne', 'Acne', '🔴'], ['Cansaço', 'Cansaço', '😴'], ['Náusea', 'Náusea', '🤢'], ['Dor lombar', 'Dor lombar', '🔙'], ['Desejo de doce', 'Desejo de doce', '🍫'], ['Insônia', 'Insônia', '🌙'], ['Dor na ovulação', 'Dor na ovulação', '📍'], ['Tontura', 'Tontura', '💫'], ['Dor nas pernas', 'Dor nas pernas', '🦵'], ['Dor nas articulações', 'Dor nas articulações', '🦴']] }] },
  { id: 'humor', t: 'Humor', c: '#f0932b', g: [{ k: 'mood', multi: true, o: [['Calma', 'Calma', '😌'], ['Feliz', 'Feliz', '🙂'], ['Energizada', 'Energizada', '🤩'], ['Alegre', 'Alegre', '😄'], ['Mudanças de humor', 'Mudanças de humor', '🎭'], ['Irritada', 'Irritada', '😠'], ['Triste', 'Triste', '😢'], ['Ansiosa', 'Ansiosa', '😰'], ['Sensível', 'Sensível', '🥺'], ['Desanimada', 'Desanimada', '😞'], ['Culpada', 'Culpada', '😔']] }] },
  { id: 'sexo', t: 'Sexo e libido', c: '#d6336c', g: [{ k: 'sex', multi: false, o: [['Não', 'Não fiz sexo', '🚫'], ['Com proteção', 'Sexo com proteção', '🛡️'], ['Sem proteção', 'Sexo sem proteção', '❤️']] }, { k: 'libido', multi: false, o: [['Alta', 'Libido alta', '🔥'], ['Neutra', 'Libido neutra', '😐'], ['Baixa', 'Libido baixa', '🧊']] }] },
  { id: 'muco', t: 'Secreção vaginal', c: '#1f8fa8', g: [{ k: 'mucus', multi: false, o: [['Seco', 'Sem secreção', '🏜️'], ['Pegajoso', 'Pegajosa', '🍯'], ['Cremoso', 'Cremosa', '🥛'], ['Clara de ovo', 'Clara de ovo', '🥚'], ['Aquoso', 'Aquosa', '💦']] }] },
  { id: 'testes', t: 'Testes', c: '#12a07f', g: [{ l: 'Teste de ovulação (LH)', k: 'lh', multi: false, o: YN }, { l: 'Teste de gravidez', k: 'test', multi: false, o: YN }] },
  { id: 'corpo', t: 'Temperatura e peso', c: '#e8871e', inputs: [['temp', 'Temperatura basal', '°C', '36,50'], ['peso', 'Peso', 'kg', '60,0']] },
  { id: 'dig', t: 'Digestão e fezes', c: '#8a6d3b', g: [{ k: 'digestao', multi: true, o: [['Normal', 'Normal', '✅'], ['Inchaço', 'Inchaço', '🎈'], ['Constipação', 'Constipação', '🧱'], ['Diarreia', 'Diarreia', '🚽'], ['Gases', 'Gases', '💨'], ['Náusea', 'Náusea', '🤢']] }] },
  { id: 'treino', t: 'Atividade física', c: '#2f9e44', g: [{ k: 'treino', multi: true, o: [['Descanso', 'Descanso', '🛋️'], ['Caminhada', 'Caminhada', '🚶'], ['Corrida', 'Corrida', '🏃'], ['Yoga', 'Yoga', '🧘'], ['Musculação', 'Musculação', '🏋️'], ['Natação', 'Natação', '🏊'], ['Ciclismo', 'Ciclismo', '🚴'], ['Dança', 'Dança', '💃']] }] },
  { id: 'sono', t: 'Sono', c: '#4c6ef5', g: [{ k: 'sono', multi: false, o: [['<5h', 'Menos de 5h', '🥱'], ['5–6h', '5 a 6 horas', '😪'], ['7–8h', '7 a 8 horas', '😊'], ['9h+', '9 horas ou mais', '😴']] }] },
  { id: 'meds', t: 'Remédios e suplementos', c: '#0c8599', g: [{ k: 'meds', multi: true, o: [['Anticoncepcional', 'Anticoncepcional', '💊'], ['Ácido fólico', 'Ácido fólico', '🌿'], ['Vitaminas', 'Vitaminas', '🧪'], ['Analgésico', 'Analgésico', '🩹'], ['Anti-inflamatório', 'Anti-inflamatório', '💉'], ['Outro', 'Outro', '➕']] }] },
  { id: 'notas', t: 'Anotações', c: '#6c7a89', note: true }
];
const pickSec = id => DSEC.find(x => x.id === id);
const DSEC_P = [
  { id: 'sintg', t: 'Sintomas da gestação', c: '#7a5bd1', g: [{ k: 'symptoms', multi: true, o: [['Enjoo', 'Enjoo', '🤢'], ['Vômito', 'Vômito', '🤮'], ['Azia', 'Azia', '🔥'], ['Tontura', 'Tontura', '💫'], ['Cansaço', 'Cansaço', '😴'], ['Sonolência', 'Sonolência', '🥱'], ['Dor lombar', 'Dor lombar', '🔙'], ['Cólica leve', 'Cólica leve', '⚡'], ['Inchaço nas pernas', 'Inchaço nas pernas', '🦶'], ['Seios sensíveis', 'Seios sensíveis', '💗'], ['Aversão a cheiros', 'Aversão a cheiros', '🙄'], ['Desejos', 'Desejos', '🍫'], ['Falta de ar', 'Falta de ar', '😮‍💨'], ['Dor de cabeça', 'Dor de cabeça', '🤕'], ['Constipação', 'Constipação', '🧱'], ['Xixi frequente', 'Xixi frequente', '🚽'], ['Câimbras', 'Câimbras', '🦵'], ['Contrações de treino', 'Contrações de treino', '🌀'], ['Coceira', 'Coceira', '🪶'], ['Dor pélvica', 'Dor pélvica', '📍'], ['Insônia', 'Insônia', '🌙'], ['Nariz entupido', 'Nariz entupido', '👃'], ['Gengiva sangrando', 'Gengiva sangrando', '🦷']] }] },
  { id: 'bebe', t: 'Movimentos do bebê', c: '#e8456b', g: [{ k: 'chute', multi: false, o: [['Não senti', 'Ainda não senti', '🤫'], ['Poucos', 'Poucos', '🦋'], ['Normais', 'Normais', '👣'], ['Muitos', 'Muitos', '🥊']] }], inputs: [['chutes', 'Contagem de movimentos', 'mov.', '10']] },
  { id: 'perdas', t: 'Sangramento e perdas', c: '#d6275a', g: [{ k: 'perda', multi: false, o: [['Nenhum', 'Nenhum', '✅'], ['Escape', 'Escape rosado', '🩸'], ['Sangramento', 'Sangramento', '🚨'], ['Corrimento', 'Corrimento aumentado', '💧'], ['Líquido', 'Perda de líquido', '🌊']] }] },
  { id: 'medidas', t: 'Peso e pressão', c: '#e8871e', inputs: [['peso', 'Peso', 'kg', '65,0'], ['pa_s', 'Pressão máxima', 'mmHg', '120'], ['pa_d', 'Pressão mínima', 'mmHg', '80'], ['glic', 'Glicemia', 'mg/dL', '85']] },
  { id: 'agua', t: 'Hidratação', c: '#1f8fa8', inputs: [['agua', 'Água', 'copos', '8']] },
  { ...pickSec('humor') },
  { ...pickSec('sono') },
  { id: 'treino', t: 'Atividade física', c: '#2f9e44', g: [{ k: 'treino', multi: true, o: [['Descanso', 'Descanso', '🛋️'], ['Caminhada', 'Caminhada', '🚶'], ['Yoga', 'Yoga / pilates', '🧘'], ['Hidroginástica', 'Hidroginástica', '🏊'], ['Alongamento', 'Alongamento', '🤸'], ['Musculação', 'Musculação leve', '🏋️']] }] },
  { id: 'meds', t: 'Suplementos e remédios', c: '#0c8599', g: [{ k: 'meds', multi: true, o: [['Ácido fólico', 'Ácido fólico', '🌿'], ['Polivitamínico', 'Vitamina pré-natal', '🧪'], ['Ferro', 'Ferro', '🩸'], ['Cálcio', 'Cálcio', '🦴'], ['Vitamina D', 'Vitamina D', '☀️'], ['Ômega 3', 'Ômega 3', '🐟'], ['Progesterona', 'Progesterona', '💊'], ['Anti-enjoo', 'Anti-enjoo', '🍋'], ['Analgésico', 'Analgésico', '💊']] }] },
  { id: 'consultas', t: 'Consultas e exames', c: '#4c6ef5', g: [{ k: 'consulta', multi: true, o: [['Pré-natal', 'Consulta pré-natal', '👩‍⚕️'], ['Ultrassom', 'Ultrassom', '📡'], ['Exame de sangue', 'Exame de sangue', '🩸'], ['Exame de urina', 'Exame de urina', '🧫'], ['Vacina', 'Vacina', '💉'], ['Curso gestante', 'Curso de gestante', '🎓']] }] },
  { ...pickSec('sexo') },
  { ...pickSec('notas') }
];
const pregSince = () => S.settings.pregnancy ? (S.settings.pregnancy.since || S.settings.pregnancy.dum) : null;
const daySecs = () => {
  if (!(S.settings.pregnancy && DAY && DAY.date >= pregSince())) return DSEC;
  // dados do ciclo já registrados nesse dia continuam visíveis
  const extra = DSEC.filter(x => !DSEC_P.some(y => y.id === x.id) && secCount(x) > 0);
  return [...DSEC_P, ...extra];
};
let DAY = null, dayT = 0, toastT = 0;
const cycleDayOf = date => { const A = analyze(), i = A.g.findLastIndex(x => x.start <= date); return i < 0 ? null : diff(date, A.g[i].start) + 1; };
const isOn = (g, v) => g.multi ? (DAY.L[g.k] || []).includes(v) : DAY.L[g.k] === v;
function secCount(sec) {
  let n = 0;
  (sec.g || []).forEach(g => { const x = DAY.L[g.k]; if (g.multi) n += (x || []).length; else if (x !== undefined) n++; });
  (sec.inputs || []).forEach(([k]) => { if (DAY.L[k] != null) n++; });
  if (sec.note && DAY.L.notes) n = 1;
  return n;
}
const inpsHtml = (sec, L) => `<div class="inps">${sec.inputs.map(([k, l, u, ph]) => `<label class="inp"><small>${l}</small><span><input data-num="${k}" inputmode="decimal" placeholder="${ph}" value="${L[k] != null ? String(L[k]).replace('.', ',') : ''}"><em>${u}</em></span></label>`).join('')}</div>`;
function dayCard(sec) {
  const L = DAY.L;
  const body = sec.note ? `<textarea id="dn" rows="3" placeholder="Escreva como foi o seu dia…">${esc(L.notes || '')}</textarea>`
    : sec.inputs && !sec.g ? inpsHtml(sec, L)
    : sec.g.map(g => {
      let o = g.k === 'sex' && L.sex === 'Sim' ? [...g.o, ['Sim', 'Sexo (sem detalhe)', '💞']] : g.o, rec = [];
      if (sec.id === 'sintg') { const w = Math.floor(diff(DAY.date, S.settings.pregnancy.dum) / 7); rec = sympFor(w).map(x => x[2]); o = [...o.filter(x => rec.includes(x[0])), ...o.filter(x => !rec.includes(x[0]))]; }
      return `${g.l ? `<h4>${g.l}</h4>` : ''}<div class="chs">${o.map(([v, l, e]) => `<button class="ch ${isOn(g, v) ? 'on' : ''} ${rec.includes(v) ? 'rec' : ''}" data-act="ch" data-k="${g.k}" data-v="${esc(v)}" data-multi="${g.multi ? 1 : 0}"><span class="ico">${e}</span><span class="lb">${l}</span></button>`).join('')}</div>`;
    }).join('') + (sec.inputs ? inpsHtml(sec, L) : '');
  const n = secCount(sec);
  return `<section class="dc2" id="sec-${sec.id}" style="--c:${sec.c}"><header><h3>${sec.t}</h3><span class="cnt" data-cnt="${sec.id}">${n ? (sec.note ? 'escrito' : `${n} selecionado${n > 1 ? 's' : ''}`) : ''}</span></header>${body}</section>`;
}
function openDay(date) {
  DAY = { date, L: structuredClone(S.logs[date] || {}) };
  const cd = cycleDayOf(date), title = date === TODAY ? 'Hoje' : fmt(date, { weekday: 'short', day: 'numeric', month: 'short' });
  $sheet.className = 'full';
  $sheet.innerHTML = `<div class="dh"><button class="ib" data-act="close" aria-label="Fechar">✕</button><div class="dt"><b>${title}</b><small>${S.settings.pregnancy && DAY && date >= pregSince() ? `${Math.floor(diff(date, S.settings.pregnancy.dum) / 7)}s ${diff(date, S.settings.pregnancy.dum) % 7}d de gestação` : cd ? cd + 'º dia do ciclo' : 'sem ciclo registrado'}</small></div><span class="dnav"><button class="ib" data-act="dprev" aria-label="Dia anterior">‹</button><button class="ib" data-act="dnext" ${date >= TODAY ? 'disabled' : ''} aria-label="Próximo dia">›</button></span></div>
  <div class="ds"><input id="dq" type="search" placeholder="Buscar sintoma, humor…" autocomplete="off"><div class="jumps">${daySecs().map(x => `<button class="jp" data-act="jump" data-id="${x.id}" style="--c:${x.c}">${x.t}</button>`).join('')}</div></div>
  <div class="dsc" id="dsc">${daySecs().map(dayCard).join('')}<div class="dend"></div></div><div class="toast" id="toast">Salvo ✓</div>`;
  if (!$sheet.open) $sheet.showModal();
}
function commitDay() {
  const { date, L } = DAY;
  const clean = Object.fromEntries(Object.entries(L).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  if (Object.keys(clean).length) S.logs[date] = clean; else delete S.logs[date];
  save();
  const t = document.getElementById('toast'); if (t) { t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 900); }
}
function updateCounts() {
  daySecs().forEach(sec => { const el = document.querySelector(`[data-cnt="${sec.id}"]`); if (!el) return; const n = secCount(sec); el.textContent = n ? (sec.note ? 'escrito' : `${n} selecionado${n > 1 ? 's' : ''}`) : ''; });
}
function filterDay(q) {
  q = norm2(q.trim());
  document.querySelectorAll('#dsc .dc2').forEach(sec => {
    const titleHit = q && norm2(sec.querySelector('h3').textContent).includes(q), chips = [...sec.querySelectorAll('.ch')];
    let any = false;
    chips.forEach(c => { const m = !q || titleHit || norm2(c.textContent).includes(q); c.hidden = !m; if (m) any = true; });
    sec.hidden = q ? !(any || titleHit) : false;
  });
}



// ---------- gestação ----------
const WEEKS = {
  4: ['semente de papoula', 'Implantação do embrião no útero; o teste de gravidez já pode dar positivo.'],
  5: ['semente de gergelim', 'O coração começa a se formar e o tubo neural (futuro cérebro e coluna) se fecha.'],
  6: ['lentilha', 'Batimentos já podem aparecer no ultrassom. Enjoos costumam começar por aqui.'],
  7: ['mirtilo', 'Braços e pernas em formação; o cérebro se desenvolve rápido.'],
  8: ['framboesa', 'Dedinhos se formam. Todos os órgãos principais já foram iniciados.'],
  9: ['azeitona', 'Fim do período embrionário: o rosto e as pálpebras tomam forma.'],
  10: ['ameixa', 'Os órgãos já funcionam; nascem as unhas e o bebê já se mexe (você ainda não sente).'],
  11: ['figo', 'O bebê começa a abrir e fechar as mãos; a genitália começa a se diferenciar.'],
  12: ['limão', 'Reflexos aparecem. Entre 11 e 14 semanas faz-se o ultrassom da translucência nucal.'],
  13: ['pêssego', 'Fim do 1º trimestre: o risco de perda cai bastante e o enjoo tende a melhorar.'],
  14: ['nectarina', 'Começa o 2º trimestre: o bebê faz caretas e o pescoço se define.'],
  15: ['maçã', 'Ele já percebe a luz; os ossos endurecem.'],
  16: ['abacate', 'Pode ser possível ver o sexo no ultrassom; muitas gestantes começam a sentir leves movimentos.'],
  17: ['pera', 'A gordura corporal começa a se formar; o esqueleto vai endurecendo.'],
  18: ['batata-doce', 'Ele já ouve sons; os movimentos ficam mais perceptíveis.'],
  19: ['manga', 'Camada protetora (vérnix) cobre a pele.'],
  20: ['banana', 'Metade da gestação! O ultrassom morfológico é feito entre 18 e 24 semanas.'],
  21: ['cenoura', 'Os movimentos ficam mais fortes e regulares.'],
  22: ['mamão pequeno', 'Os sentidos (tato, audição) se aprimoram; as sobrancelhas aparecem.'],
  23: ['manga grande', 'O bebê reconhece vozes; os pulmões se preparam para respirar.'],
  24: ['espiga de milho', 'Viabilidade fora do útero começa por volta daqui; hora do teste de glicemia (24–28 sem).'],
  25: ['couve-flor', 'Ele reage a sons altos; o cabelo ganha cor e textura.'],
  26: ['alface', 'Os olhos começam a abrir; ele treina a respiração.'],
  27: ['repolho', 'Fim do 2º trimestre: ele tem ciclos de sono e vigília.'],
  28: ['berinjela', 'Começa o 3º trimestre: consultas passam a ser quinzenais.'],
  29: ['abóbora pequena', 'Músculos e pulmões amadurecem; ele chuta bastante.'],
  30: ['repolho grande', 'O cérebro ganha sulcos e o bebê engorda rápido.'],
  31: ['coco', 'Os cinco sentidos estão funcionando.'],
  32: ['abacaxi', 'Unhas completas; ele costuma ficar de cabeça para baixo.'],
  33: ['abacaxi grande', 'O sistema imunológico se fortalece.'],
  34: ['melão cantalupo', 'Os pulmões estão quase prontos; o vérnix engrossa.'],
  35: ['melão', 'Os rins funcionam plenamente; o espaço no útero fica apertado.'],
  36: ['alface-romana', 'Ele desce para a pelve; consultas semanais a partir de agora.'],
  37: ['acelga', 'Considerado a termo precoce: já pode nascer com segurança.'],
  38: ['alho-poró', 'Órgãos prontos; ele ganha cerca de 200 g por semana.'],
  39: ['abóbora', 'A termo completo: o parto pode acontecer a qualquer momento.'],
  40: ['melancia pequena', 'Data provável do parto! Muitos bebês nascem até 2 semanas depois.']
};
const EXAMS = [
  [4, 12, 'Primeira consulta de pré-natal e exames: tipagem sanguínea/Rh, hemograma, glicemia, urina e urocultura, sorologias (HIV, sífilis, hepatites, toxoplasmose, rubéola), TSH'],
  [6, 10, 'Ultrassom obstétrico inicial (confirma gravidez e data)'],
  [11, 14, 'Ultrassom morfológico do 1º trimestre (translucência nucal)'],
  [18, 24, 'Ultrassom morfológico do 2º trimestre'],
  [20, 36, 'Vacina dTpa (coqueluche) — converse com seu médico sobre o calendário de vacinas'],
  [24, 28, 'Teste de tolerância à glicose (TOTG 75 g) para diabetes gestacional'],
  [28, 32, 'Repetir hemograma e sorologias do 3º trimestre; ultrassom de crescimento se indicado'],
  [35, 37, 'Cultura vaginal/retal para Streptococcus do grupo B'],
  [36, 40, 'Consultas semanais; combine o plano de parto e prepare a mala da maternidade']
];
const TIPS_G = ['Tome ácido fólico e as vitaminas prescritas', 'Hidrate-se bem e fracione as refeições se tiver enjoo', 'Evite álcool, cigarro e medicamentos sem orientação', 'Faça atividade leve com liberação médica', 'Procure atendimento urgente se tiver sangramento, dor forte, perda de líquido, febre ou redução dos movimentos do bebê'];

function pregInfo() {
  const p = S.settings.pregnancy;
  if (!p) return null;
  const dias = diff(TODAY, p.dum), sem = Math.floor(dias / 7), dpp = add(p.dum, 280);
  return { dum: p.dum, dias, sem, d: dias % 7, dpp, left: diff(dpp, TODAY), tri: sem < 14 ? '1º trimestre' : sem < 28 ? '2º trimestre' : '3º trimestre' };
}
function conceptionInfo(g) {
  const ov = add(g.dum, 14), est = S.settings.pregnancy.manual ? null : estConception(analyze(), TODAY);
  const ps = est ? est.shares.filter(x => x.share >= .02).map(x => ({ d: x.d, share: Math.round(x.share * 100) })) : [];
  if (!est) Object.keys(S.logs).filter(d => d >= add(ov, -5) && d <= add(ov, 1) && ['Sem proteção', 'Sim'].includes(S.logs[d].sex) && !pillCovered(d)).sort().forEach(d => ps.push({ d, share: 0, p: WIL[String(diff(d, ov))] || 0 }));
  if (!est) { const tot = ps.reduce((a, x) => a + x.p, 0) || 1; ps.forEach(x => x.share = Math.round(x.p / tot * 100)); }
  const best = ps.slice().sort((a, b) => b.share - a.share)[0] || null;
  return { ov, ps, best, imp: add(ov, 7), est };
}
function vHojePreg() {
  const g = pregInfo(), A = analyze(), ci = conceptionInfo(g), wk = Math.min(Math.max(g.sem, 4), 40), tn = g.sem < 14 ? 1 : g.sem < 28 ? 2 : 3;
  const R = 44, C = 2 * Math.PI * R, pct = Math.min(Math.max(g.dias, 0) / 280, 1);
  const alerts = Object.keys(S.logs).filter(d => diff(TODAY, d) >= 0 && diff(TODAY, d) <= 3 && ['Sangramento', 'Líquido'].includes(S.logs[d].perda));
  const ex = EXAMS.find(([a, b]) => g.sem <= b), L = S.logs[TODAY] || {}, folic = (L.meds || []).includes('Ácido fólico');
  const concTxt = ci.best ? `Relação provável: <b>${fmt(ci.best.d, { day: 'numeric', month: 'long' })}</b>${ci.ps.length > 1 ? ` (≈${ci.best.share}%)` : ''}` : `Concepção estimada por volta de <b>${fmt(ci.ov, { day: 'numeric', month: 'long' })}</b>`;
  INFO = {
    conc: ['Quando foi a concepção?', `<p>Pela data de início usada (${fmt(g.dum, { day: 'numeric', month: 'long' })}), a ovulação teria sido por volta de <b>${fmt(ci.ov, { day: 'numeric', month: 'long' })}</b> e a implantação do embrião em ~<b>${fmt(ci.imp, { day: 'numeric', month: 'long' })}</b>.</p>${ci.ps.length ? `<p>Relações sem proteção na janela da ovulação:</p>${ci.ps.map(x => `<p style="margin:4px 0">• <b>${fmt(x.d, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · ${x.share}% de probabilidade relativa</p>`).join('')}<p class="mute small">A probabilidade usa a chance de cada dia em relação à ovulação (Wilcox, 1995). O espermatozoide sobrevive até ~5 dias, então a relação provável pode ser anterior à ovulação.</p>` : '<p>Não há relação sem proteção registrada nesta janela.</p>'}<p class="note">Estimativa. Só o ultrassom do 1º trimestre fixa a data com segurança, e a data do parto muda com ele.</p>`],
    dpp: ['Data provável do parto', `<p>Calculada em 40 semanas (280 dias) a partir de ${fmt(g.dum, { day: 'numeric', month: 'long', year: 'numeric' })}: <b>${fmt(g.dpp, { day: 'numeric', month: 'long', year: 'numeric' })}</b>.</p><p>Só ~5% dos bebês nascem exatamente nessa data; o normal é entre 37 e 42 semanas (de ${fmt(add(g.dum, 259), { day: 'numeric', month: 'short' })} a ${fmt(add(g.dum, 294), { day: 'numeric', month: 'short' })}). Com ciclo irregular o ultrassom do 1º trimestre corrige a data.</p>`]
  };
  const seg = [0, 1, 2].map(i => { const a = i * 94, w = Math.min(Math.max(g.dias - a, 0), 94) / 94 * 100; return `<i><b style="width:${w}%"></b></i>`; }).join('');
  return `<div class="toprow"><h1 class="cap">${fmt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
  ${alerts.length ? `<div class="banner"><span>Sangramento ou perda de líquido registrados: procure atendimento obstétrico</span></div>` : ''}
  <section class="hh st-preg">
    <div class="hhb" role="button" tabindex="0" data-act="startgest"><div class="hr"><div class="ring2"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#ffffff40" stroke-width="9"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 50 50)"/></svg><div><small>semana</small><b>${g.sem}</b></div></div>
    <div class="ht"><h2>${g.sem} semanas e ${g.d} dia${g.d === 1 ? '' : 's'}</h2><p>${g.tri} · ${Math.max(g.left, 0)} dias para o parto</p><p class="phint">Ver o bebê e a semana ›</p></div></div>
    <div class="pfacts"><button data-act="info" data-k="dpp"><small>🎀 Parto previsto</small><b>${fmt(g.dpp, { day: 'numeric', month: 'short', year: 'numeric' })}</b></button><button data-act="info" data-k="conc"><small>💞 Concepção</small><b>${ci.best ? sd(ci.best.d) : '~' + sd(ci.ov)}</b></button></div>
    <div class="tri">${seg}</div><div class="trl"><span>1º tri</span><span>2º tri</span><span>3º tri</span></div></div>
  </section>
  <button class="btn regbtn" data-act="log" data-d="${TODAY}">${S.logs[TODAY] ? '✎ Editar registro de hoje' : '＋ Registrar sintomas de hoje'}</button>
  <div class="nstep"><span class="nsi">🌿</span><span class="nst"><small>Hoje</small><b>${folic ? 'Ácido fólico de hoje ✓' : 'Tome o ácido fólico / vitamina pré-natal'}</b><em>${concTxt}</em></span></div>
  <div class="tiles4">
    <button class="tile" data-go="gest"><small>Bebê</small><b>${fmtSize(wk).split(' · ')[0]}</b><em>${ITEM[wk][0]}</em></button>
    <button class="tile" data-act="info" data-k="dpp"><small>Faltam</small><b>${Math.max(g.left, 0)} dias</b><em>${Math.ceil(Math.max(g.left, 0) / 7)} semanas</em></button>
    <button class="tile" data-go="gest"><small>Próximo exame</small><b style="font-size:14px">${ex ? ex[2].split(':')[0].replace(/ \(.*\)/, '') : 'Pré-natal'}</b><em>${ex ? `${ex[0]}–${ex[1]} semanas` : ''}</em></button>
    <button class="tile" data-act="info" data-k="conc"><small>Implantação</small><b>${sd(ci.imp)}</b><em>ovulação ~${sd(ci.ov)}</em></button>
  </div>
  <p class="fine">Estimativas · confirme datas com ultrassom e seu obstetra</p>`;
}
function pregBanner() {
  const g = pregInfo();
  if (!g) return '';
  return `<div class="card" style="background:var(--green-l)"><div class="row" style="border:0"><span><b>🤰 Gestação: ${g.sem}s ${g.d}d</b><br><span class="mute small">${g.tri} · parto previsto ${fmt(g.dpp)}</span></span><button class="chip" data-go="gest">Ver</button></div></div>`;
}
const chk = (k, label, act = 'chk') => `<button class="chk ${S.settings.checklist[k] ? 'on' : ''}" data-act="${act}" data-k="${k}"><span class="bx">${S.settings.checklist[k] ? "✓" : ""}</span><span>${label}</span></button>`;

const SIZES = {4:[.1,0],5:[.2,0],6:[.6,0],7:[1,1],8:[1.6,1],9:[2.3,2],10:[3.1,4],11:[4.1,7],12:[5.4,14],13:[7.4,23],14:[8.7,43],15:[10.1,70],16:[11.6,100],17:[13,140],18:[14.2,190],19:[15.3,240],20:[25.6,300],21:[26.7,360],22:[27.8,430],23:[28.9,500],24:[30,600],25:[34.6,660],26:[35.6,760],27:[36.6,875],28:[37.6,1005],29:[38.6,1150],30:[39.9,1320],31:[41.1,1500],32:[42.4,1700],33:[43.7,1920],34:[45,2150],35:[46.2,2380],36:[47.4,2620],37:[48.6,2860],38:[49.8,3080],39:[50.7,3290],40:[51.2,3460]};
const fmtSize = w => { const [cm, g] = SIZES[w]; return `${String(cm).replace('.', ',')} cm${g ? ` · ${g >= 1000 ? (g / 1000).toFixed(2).replace('.', ',') + ' kg' : g + ' g'}` : ''}`; };
const BODY = {
  1: 'Enjoo, cansaço, seios sensíveis, mais vontade de urinar, aversão a cheiros e oscilações de humor são comuns. A barriga ainda quase não aparece.',
  2: 'Costuma ser a fase mais confortável: o enjoo diminui, a barriga aparece e você começa a sentir os movimentos. Podem surgir dor nas costas, azia e cãibras.',
  3: 'A barriga pesa, o sono piora e podem surgir falta de ar, inchaço nos pés, azia e contrações de treinamento (Braxton Hicks).'
};
const FOOD = {
  1: 'Ácido fólico (400–800 µg, conforme prescrição), refeições pequenas e frequentes, hidratação em goles. Evite álcool, carnes e ovos crus, queijos não pasteurizados e excesso de cafeína (até ~200 mg/dia).',
  2: 'Ferro (feijão, carnes, folhas escuras) com vitamina C, cálcio, ômega-3 (peixes de baixo mercúrio) e fibras. Suplementos só com orientação médica.',
  3: 'Fracione as refeições para aliviar a azia, mantenha ferro e cálcio, hidrate-se bem e reduza o sal se houver inchaço importante.'
};
const DAILY = [
  ['sint', 'Sintomas da semana', '#8fbfe6', '🤢', 'Enjoo, cansaço, seios sensíveis, vontade de urinar com frequência, aversão a cheiros, oscilação de humor e cólicas leves são comuns no início.<br><br><b>Procure atendimento</b> se tiver sangramento, dor forte ou de um lado só, febre ou vômitos que impedem de comer e beber.'],
  ['naus', 'Náuseas: o que ajuda', '#e99a63', '🍋', '• Biscoito de água e sal antes de levantar<br>• Refeições pequenas, a cada 2–3 horas<br>• Gengibre, líquidos gelados em goles<br>• Evite jejum longo e cheiros que incomodam<br>• Vitamina B6 ou remédios para enjoo só com orientação médica<br><br>Vômitos o dia todo, perda de peso ou desidratação: procure seu médico (pode ser hiperêmese).'],
  ['cons', 'Guia da primeira consulta', '#12706b', '📋', '<b>Leve:</b> data da última menstruação e o histórico de ciclos (este app mostra), remédios e suplementos em uso, exames e vacinas anteriores, histórico familiar.<br><br><b>Pergunte:</b> ultrassom para datar a gestação, quais exames fazer, dose de ácido fólico, atividade física, viagens e o que evitar.<br><br>Com ciclo irregular, peça o ultrassom precoce para confirmar a data provável do parto.'],
  ['nutr', 'Nutrientes indispensáveis', '#4f5675', '🥬', 'Ácido fólico (formação do tubo neural), ferro (anemia), cálcio, vitamina D, iodo e ômega-3/DHA.<br><br>Prefira alimentos variados; suplementos só conforme prescrição. Evite álcool, peixes com muito mercúrio, carnes e ovos crus e queijos não pasteurizados.'],
  ['alert', 'Sinais de alerta', '#d2506f', '⚠️', 'Procure atendimento urgente se tiver: sangramento, perda de líquido, dor abdominal forte, febre, dor de cabeça intensa com visão turva, inchaço súbito no rosto ou mãos, ou redução dos movimentos do bebê (a partir do 3º trimestre).']
];
let INFO = {};

const ITEM = {4:['uma semente de papoula','•'],5:['uma semente de gergelim','•'],6:['um grão de lentilha','🟤'],7:['um grão de feijão','🫘'],8:['um mirtilo grande','🫐'],9:['uma azeitona','🫒'],10:['uma uva grande','🍇'],11:['um morango','🍓'],12:['um limão','🍋'],13:['um pêssego','🍑'],14:['um tomate','🍅'],15:['uma maçã','🍎'],16:['um abacate','🥑'],17:['uma pera','🍐'],18:['uma batata-doce','🍠'],19:['uma manga','🥭'],20:['uma banana','🍌'],21:['uma cenoura grande','🥕'],22:['um pepino','🥒'],23:['uma manga grande','🥭'],24:['uma espiga de milho','🌽'],25:['uma couve-flor','🥦'],26:['uma alface','🥬'],27:['um repolho pequeno','🥬'],28:['uma berinjela','🍆'],29:['uma abóbora pequena','🎃'],30:['um repolho grande','🥬'],31:['um coco','🥥'],32:['um abacaxi pequeno','🍍'],33:['um abacaxi','🍍'],34:['um melão cantalupo','🍈'],35:['um melão','🍈'],36:['uma alface-romana grande','🥬'],37:['uma acelga','🥬'],38:['um alho-poró','🧅'],39:['uma abóbora','🎃'],40:['uma melancia pequena','🍉']};
const TRIL = w => w < 14 ? [1, 13, '1º trimestre'] : w < 28 ? [14, 27, '2º trimestre'] : [28, 40, '3º trimestre'];
const triPos = w => { const [a, b, n] = TRIL(w), f = (w - a) / (b - a + 1); return `${f < .34 ? 'início' : f < .67 ? 'meio' : 'fim'} do ${n}`; };
// [semana inicial, final, sintoma (igual ao registro), por que acontece]
const SYMP = [
  [4, 13, 'Enjoo', 'Costuma começar por volta da 6ª semana e ter pico entre 9 e 12; melhora perto da 14ª'],
  [4, 13, 'Cansaço', 'A progesterona e o corpo trabalhando a mais deixam o sono e o cansaço fortes'],
  [4, 12, 'Seios sensíveis', 'Os seios ficam doloridos e maiores com o aumento dos hormônios'],
  [4, 13, 'Xixi frequente', 'O útero e o aumento do sangue sobrecarregam os rins e a bexiga'],
  [4, 10, 'Cólica leve', 'Pequenas cólicas ou repuxões enquanto o útero se adapta e o embrião se fixa'],
  [5, 14, 'Aversão a cheiros', 'O olfato fica aguçado e alguns cheiros e alimentos passam a incomodar'],
  [5, 16, 'Desejos', 'Desejos e aversões alimentares são comuns'],
  [6, 20, 'Constipação', 'A progesterona deixa o intestino mais lento'],
  [8, 14, 'Tontura', 'Pressão mais baixa e açúcar oscilando: levante devagar e coma a cada poucas horas'],
  [8, 20, 'Dor de cabeça', 'Mudanças hormonais e de volume de sangue; hidrate-se e descanse'],
  [10, 40, 'Azia', 'A progesterona relaxa a válvula do estômago, e o útero cresce e empurra o estômago'],
  [14, 27, 'Gengiva sangrando', 'Gengivas mais sensíveis e inchadas; vale ir ao dentista'],
  [14, 27, 'Nariz entupido', 'A circulação aumentada incha a mucosa do nariz'],
  [16, 26, 'Dor pélvica', 'Dor em pontada na lateral da barriga: ligamentos se esticando conforme o útero cresce'],
  [18, 40, 'Dor lombar', 'O peso da barriga muda sua postura e sobrecarrega a lombar'],
  [18, 27, 'Movimentos do bebê', 'Os primeiros movimentos costumam ser sentidos entre 18 e 22 semanas'],
  [20, 40, 'Câimbras', 'Câimbras nas pernas, mais comuns à noite; alongue e converse sobre magnésio/cálcio com seu médico'],
  [20, 40, 'Coceira', 'A pele da barriga estica; coceira intensa nas mãos e pés deve ser avaliada'],
  [20, 33, 'Contrações de treino', 'Contrações de Braxton Hicks: irregulares, sem ritmo e que passam com repouso ou água'],
  [24, 40, 'Inchaço nas pernas', 'Retenção de líquido, mais no fim do dia; eleve as pernas'],
  [26, 40, 'Insônia', 'Dificuldade de achar posição e acordar para urinar; durma de lado'],
  [28, 40, 'Falta de ar', 'O útero sobe e empurra o diafragma; melhora quando o bebê encaixa'],
  [28, 40, 'Xixi frequente', 'O bebê pressiona a bexiga'],
  [34, 40, 'Contrações de treino', 'Mais frequentes. Se virarem regulares e mais fortes, pode ser trabalho de parto'],
  [34, 40, 'Dor pélvica', 'A cabeça do bebê encaixa e pressiona a pelve']
];
const sympFor = w => SYMP.filter(([a, b]) => w >= a && w <= b);
const ALERT_G = w => ['Sangramento vaginal ou perda de líquido', 'Dor forte ou constante na barriga', 'Febre, ou dor ao urinar', w >= 20 ? 'Dor de cabeça forte com visão embaçada ou inchaço súbito no rosto e mãos (pode ser pré-eclâmpsia)' : 'Vômitos que não deixam beber nem comer nada', ...(w >= 28 ? ['Bebê bem menos ativo que o habitual'] : []), ...(w < 37 && w >= 20 ? ['Contrações regulares antes das 37 semanas'] : [])];
function symInfo(w) {
  w = Math.min(Math.max(w, 4), 40);
  INFO.sint = [`Sintomas · ${w}ª semana`, `<p class="mute small" style="margin:0 0 6px">${triPos(w)}</p>${sympFor(w).map(([, , t, why]) => `<p class="sy"><b>${t}</b><span>${why}</span></p>`).join('')}<p class="note">Nem toda gestante sente tudo isso, e a falta de sintomas também é normal. Os sintomas comuns da semana aparecem destacados no seu registro diário.</p>`];
  INFO.alert = [`Sinais de alerta · ${w}ª semana`, `<div class="alertbox" style="margin:0"><b>Procure atendimento se tiver</b><ul>${ALERT_G(w).map(x => `<li>${x}</li>`).join('')}</ul></div><p class="note">Informação geral, não substitui orientação médica.</p>`];
}
const MILES = [[5,'O tubo neural (futura medula e cérebro) se fecha e o coração começa a se formar'],[6,'O coração já bate (cerca de 110 bpm) e aparece no ultrassom; surgem os brotos de braços e pernas'],[7,'As mãos surgem como pequenas "pás"; formam-se fígado e intestino'],[8,'Os dedos das mãos se separam, pálpebras e orelhas se formam e a cauda desaparece'],[9,'Todos os órgãos principais já estão formados; começam os dedos dos pés'],[10,'Fim da fase embrionária — agora é um feto. Começam unhas e ossos; os rins produzem urina'],[11,'Os genitais começam a se diferenciar; as mãos abrem e fecham'],[12,'Surgem os reflexos e o intestino se acomoda dentro do abdome'],[13,'Formam-se as impressões digitais e as cordas vocais'],[14,'O pescoço se define e o bebê engole líquido amniótico'],[16,'Os movimentos ficam vigorosos (você ainda pode não sentir)'],[18,'A audição se desenvolve; os primeiros movimentos costumam ser sentidos entre 18 e 22 semanas'],[20,'Cobertura de vérnix e lanugo; o sexo costuma ser visível ao ultrassom'],[22,'Sobrancelhas e pálpebras ficam definidas'],[24,'Os pulmões começam a produzir surfactante; com UTI neonatal já pode sobreviver fora do útero'],[26,'Os olhos começam a abrir'],[28,'Ciclos de sono e vigília; ele pisca'],[30,'A medula óssea assume a produção de células do sangue'],[32,'Unhas completas; a maioria já está de cabeça para baixo'],[34,'Pulmões quase maduros; a gordura sob a pele aumenta'],[36,'Preparando-se para nascer; a cabeça começa a encaixar na pelve'],[37,'Considerado a termo precoce'],[39,'A termo completo'],[40,'Data provável do parto']];
let gv = null;

function fetusSvg(sem) {
  const w = Math.min(Math.max(sem, 4), 40), cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), L = (a, b, t) => a + (b - a) * cl(t);
  const sc = w < 8 ? L(.3, .55, (w - 4) / 4) : L(.55, 1.12, (w - 8) / 32);
  const c1 = w < 14 ? '#f7c2b0' : w < 28 ? '#efa88e' : '#f3bda3', c2 = w < 14 ? '#e08c76' : w < 28 ? '#cf715a' : '#dc9477';
  let g = '';
  if (w <= 5) {
    g = `<circle cx="132" cy="124" r="30" fill="#f6e3a0" opacity=".85"/><circle cx="124" cy="116" r="8" fill="#fff" opacity=".5"/><path d="M80 106C90 86 116 84 126 98C118 114 94 122 80 106Z" fill="url(#gb)"/><path d="M88 102C100 94 112 94 120 98" stroke="#b9573a" stroke-width="2" fill="none" opacity=".6"/>`;
  } else if (w <= 7) {
    const big = w === 7;
    g = `<path d="M118 112C150 124 146 140 134 146" stroke="#e6cb86" stroke-width="3" fill="none"/><circle cx="140" cy="146" r="${big ? 14 : 20}" fill="#f6e3a0" opacity=".9"/>
    <path d="M104 96C76 104 70 140 96 158C102 162 108 158 104 152C92 140 98 122 114 114Z" fill="url(#gb)"/><path d="M98 156C94 164 98 170 104 172" stroke="url(#gb)" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="110" cy="80" r="${big ? 30 : 26}" fill="url(#gb)"/><circle cx="122" cy="76" r="3.4" fill="#4a1f12"/>
    <circle cx="96" cy="112" r="${big ? 8 : 5}" fill="url(#gb)"/><circle cx="92" cy="140" r="${big ? 8 : 5}" fill="url(#gb)"/>${big ? '<ellipse cx="104" cy="82" rx="4" ry="6" fill="none" stroke="#b9573a" stroke-width="2"/>' : ''}`;
  } else {
    const f = L(.5, 1, (w - 8) / 24), hr = w >= 30 ? 32 : 30, hx = 114, hy = 62, ny = hy + hr * .72, ry = ny + 78 * f, mid = (ny + ry) / 2;
    const bw = L(24, 42, (w - 8) / 32), aw = L(7, 13, (w - 8) / 30), lw = L(9, 17, (w - 8) / 30), fing = w >= 10;
    const hand = `<circle cx="126" cy="${hy + hr * .7}" r="${L(5, 9, (w - 8) / 30)}" fill="url(#gb)"/>${fing ? `<path d="M126 ${hy + hr * .7 - 8}v-6M131 ${hy + hr * .7 - 6}l3-5M121 ${hy + hr * .7 - 6}l-3-5" stroke="${c1}" stroke-width="2.6" stroke-linecap="round"/>` : ''}`;
    const foot = `<circle cx="128" cy="${ry - 40}" r="${L(5, 9, (w - 8) / 30)}" fill="url(#gb)"/>${fing ? `<path d="M133 ${ry - 44}l5-3M133 ${ry - 40}l6 0M132 ${ry - 36}l5 3" stroke="${c1}" stroke-width="2.4" stroke-linecap="round"/>` : ''}`;
    const eye = w < 12 ? `<circle cx="${hx + hr * .45}" cy="${hy - 2}" r="2.8" fill="#4a1f12"/>` : `<path d="M${hx + hr * .32} ${hy - 1}q6 -5 12 0" stroke="#7a3a28" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    g = `<path d="M86 ${mid} C58 ${mid + 6} 62 ${ry + 14} 26 ${ry + 22}" stroke="#d96e86" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M86 ${mid} C58 ${mid + 6} 62 ${ry + 14} 26 ${ry + 22}" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-dasharray="3 5" fill="none"/>
    <path d="M104 ${ny} C 66 ${ny + (ry - ny) * .25} 68 ${ny + (ry - ny) * .8} 98 ${ry}" stroke="url(#gb)" stroke-width="${bw}" fill="none" stroke-linecap="round"/>
    ${w >= 24 ? `<path d="M104 ${ny} C 66 ${ny + (ry - ny) * .25} 68 ${ny + (ry - ny) * .8} 98 ${ry}" stroke="#fff" stroke-opacity=".14" stroke-width="${bw * .5}" fill="none" stroke-linecap="round"/>` : ''}
    <path d="M98 ${ry - 6} C 132 ${ry + 2} 146 ${ry - 26} 128 ${ry - 40}" stroke="url(#gb)" stroke-width="${lw}" fill="none" stroke-linecap="round"/>${foot}
    <circle cx="${hx}" cy="${hy}" r="${hr}" fill="url(#gb)"/>
    <path d="M100 ${ny + 14} C 118 ${ny + 32} 134 ${ny + 22} 126 ${hy + hr * .7}" stroke="url(#gb)" stroke-width="${aw}" fill="none" stroke-linecap="round"/>${hand}
    ${eye}${w >= 10 ? `<ellipse cx="${hx - hr * .15}" cy="${hy + 4}" rx="4" ry="6.5" fill="none" stroke="#b9573a" stroke-width="2"/>` : ''}
    ${w >= 11 ? `<circle cx="${hx + hr * .98}" cy="${hy + 5}" r="4" fill="${c1}"/>` : ''}${w >= 12 ? `<path d="M${hx + hr * .62} ${hy + hr * .52}q5 3 10 -1" stroke="#a24b36" stroke-width="2.2" fill="none" stroke-linecap="round"/>` : ''}
    ${w >= 20 ? `<path d="M${hx - 14} ${hy - hr + 3}q12 -6 24 -2M${hx - 4} ${hy - hr + 1}q10 -4 20 0" stroke="#7a4a35" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>` : ''}
    ${w >= 30 ? `<circle cx="${hx + hr * .55}" cy="${hy + 12}" r="8" fill="#e8708a" opacity=".25"/>` : ''}`;
  }
  return `<svg viewBox="0 0 200 200" class="fetus" role="img" aria-label="Ilustração do bebê na semana ${w}"><defs><radialGradient id="gg"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></radialGradient><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><circle cx="100" cy="100" r="94" fill="url(#gg)" stroke="#fff" stroke-opacity=".8" stroke-width="2"/><circle cx="52" cy="48" r="3" fill="#fff" opacity=".6"/><circle cx="160" cy="150" r="4" fill="#fff" opacity=".5"/><circle cx="150" cy="40" r="2" fill="#fff" opacity=".6"/><g transform="translate(100 100) scale(${sc.toFixed(2)}) translate(-100 -100)">${g}</g></svg>`;
}

function heroText(w, g) {
  const wk = Math.min(Math.max(w, 4), 40), it = ITEM[wk];
  return `<div class="gh-count">${w === g.sem ? `${g.sem} semanas, ${g.d} dias` : `Semana ${w}`} <button class="i" data-act="info" data-k="det" aria-label="Informações">ⓘ</button></div>
  <div class="gh-size"><span>${it[1]}</span> Do tamanho de ${it[0]}</div>`;
}
function heroBody(w, g) {
  const wk = Math.min(Math.max(w, 4), 40);
  return `<div class="b3d" id="b3d" data-w="${wk}">${fetusSvg(w)}</div><div class="b3dhint" id="b3dhint"></div><div id="gh-text">${heroText(w, g)}</div>`;
}
let t3 = 0;
function mount3d() {
  const el = document.getElementById('b3d');
  if (!el || !window.Baby3D) return;
  if (window.Baby3D.show(el, +el.dataset.w)) { const h = document.getElementById('b3dhint'); if (h) h.textContent = 'Arraste para girar o bebê'; }
}
window.addEventListener('baby3d-ready', () => { if (view === 'gest') mount3d(); });

function weekCards(w) {
  const wk = Math.min(Math.max(w, 4), 40), it = ITEM[wk], [cm] = SIZES[wk];
  const done = MILES.filter(m => m[0] <= wk).slice(-4), next = MILES.find(m => m[0] > wk);
  return `<div class="card"><h2>Tamanho do bebê · semana ${wk}</h2><div class="szrow"><div class="emo">${it[1]}</div><div><div class="big cap">${it[0].replace(/^(um|uma) /, '')}</div><div class="mute">${fmtSize(wk)}</div></div></div>
    <div class="ruler"><i style="width:max(${(cm / 51.2 * 100).toFixed(1)}%,8px)"></i></div><div class="mute small" style="display:flex;justify-content:space-between"><span>agora</span><span>no parto ≈ 51 cm · 3,4 kg</span></div></div>
  <div class="list">${more('Desenvolvimento do bebê', `${done.map(m => `<p class="ms done"><b>✓ ${m[0]}ª sem.</b> ${m[1]}</p>`).join('')}${next ? `<p class="ms"><b>Próximo · ${next[0]}ª sem.</b> ${next[1]}</p>` : ''}<p class="note">Ilustração e marcos aproximados; cada bebê tem seu ritmo.</p>`, next ? `próximo marco: ${next[0]}ª semana` : '', '🌱')}</div>`;
}

function vGest() {
  const g = pregInfo(), A0 = analyze(), last = A0.g.at(-1), est = g ? null : estConception(A0, TODAY), sugg = est ? add(est.ov, -14) : last ? last.start : '';
  if (!g) return `<h1>Gestação 🤰</h1><div class="card">
    ${est ? `<p style="margin:0 0 4px">Pelos seus sinais de ovulação, relações e testes, a concepção seria por volta de</p><p class="big" style="margin:0 0 4px">${fmt(est.ov, { day: 'numeric', month: 'long' })}</p><p class="mute small" style="margin:0 0 12px">Faixa provável: ${sd(est.lo)} a ${sd(est.hi)} · parto previsto em ${fmt(add(est.ov, 266), { day: 'numeric', month: 'long', year: 'numeric' })}. Não uso só a última menstruação.</p>` : `<p>Ainda não tenho dados suficientes do ciclo para estimar a concepção. Informe uma data abaixo.</p>`}
    <button class="btn" data-act="startpreg">Iniciar com a data estimada</button>
    <details style="margin-top:14px"><summary class="mute small" style="cursor:pointer">Tenho outra data (ultrassom ou médico)</summary>
      <label class="f">Data provável do parto (DPP)</label><input type="date" id="dpp">
      <label class="f">…ou data de início (DUM)</label><input type="date" id="dum" max="${TODAY}">
      <p class="note">Se preencher uma data, ela é usada no lugar da estimativa. O ultrassom do 1º trimestre é a referência mais confiável.</p></details></div>`;
  const wk = Math.min(Math.max(g.sem, 4), 40), info = WEEKS[wk], tn = g.sem < 14 ? 1 : g.sem < 28 ? 2 : 3;
  const dow = D(TODAY).getDay(), wstart = add(TODAY, -dow);
  const strip = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((n, i) => { const d = add(wstart, i), L = S.logs[d] || {}; return `<button class="wd ${d === TODAY ? 'now' : ''}" data-act="log" data-d="${d}"><small>${d === TODAY ? 'HOJE' : n}</small><b>${D(d).getDate()}</b><i>${(L.symptoms || []).length || L.perda || L.chute ? '●' : ''}</i></button>`; }).join('');
  INFO = {
    det: ['Detalhes', `<div class="stats"><div><div class="mute small">Idade gestacional</div><div class="big">${g.sem}s ${g.d}d</div></div><div><div class="mute small">Trimestre</div><div class="big">${tn}º</div></div><div><div class="mute small">Parto previsto</div><div class="big" style="font-size:16px">${fmt(g.dpp, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div><div class="mute small">Faltam</div><div class="big">${Math.max(g.left, 0)} dias</div></div><div><div class="mute small">Tamanho do bebê</div><div class="big" style="font-size:16px">${fmtSize(wk)}</div></div><div><div class="mute small">Compara-se a</div><div class="big" style="font-size:16px">${ITEM[wk][0]}</div></div></div><p class="note">DUM considerada: ${fmt(g.dum, { day: 'numeric', month: 'long', year: 'numeric' })}. Medidas aproximadas (comprimento até a 19ª semana: cabeça–nádega; depois, cabeça–pés). Com ciclo irregular, confirme a data pelo ultrassom do 1º trimestre.</p><button class="chip" data-act="editdum">Ajustar data</button>`],
    baby: ['Bebê · ' + g.sem + ' semanas', `<p class="big" style="margin:0 0 6px">${fmtSize(wk)}</p><p>Do tamanho de <b>${ITEM[wk][0]}</b> ${ITEM[wk][1]}.</p><p>${info[1]}</p><p class="note">Tamanhos são médias aproximadas.</p>`],
    body: ['Seu corpo', `<p>${BODY[tn]}</p><p class="note">Cada gestação é diferente. Qualquer sintoma que preocupe, converse com seu médico.</p>`],
    food: ['Alimentação', `<p>${FOOD[tn]}</p><p class="note">Suplementos e doses: apenas conforme prescrição médica.</p>`]
  };
  DAILY.forEach(([k, t, , , h]) => INFO[k] = [t, `<p>${h}</p><p class="note">Informação geral, não substitui orientação médica.</p>`]);
  symInfo(gv ?? g.sem);
  const cards = DAILY.map(([k, t, c, e]) => `<button class="dc" style="background:${c}" data-act="info" data-k="${k}"><b>${t}</b><span>${e}</span></button>`).join('');
  const exams = EXAMS.map(([a, b, t], i) => {
    const st = g.sem > b ? 'past' : g.sem >= a ? 'now' : 'next';
    return `<div class="exam ${st}">${chk('x' + i, `<span class="pill ${st === 'now' ? 'p-fertil' : 'p-folicular'}" style="margin-right:6px">${a}–${b}s</span>${t}`, 'chkx')}</div>`;
  }).join('');
  return `<section class="gest-hero">
    <div class="gh-top"><span>${fmt(TODAY, { day: 'numeric', month: 'long' })}</span></div>
    <div class="week">${strip}</div>
    <div id="gh-body">${heroBody(gv ?? g.sem, g)}</div>
    <button class="gh-btn" data-act="info" data-k="det">Detalhes</button>
    <div class="slide"><input type="range" class="rng" min="4" max="40" value="${Math.min(Math.max(gv ?? g.sem, 4), 40)}" data-gv aria-label="Ver outra semana"><div class="small"><span>Deslize para ver a evolução semana a semana</span></div></div>
  </section>
  <div id="wk-cards" style="margin-top:16px">${weekCards(gv ?? g.sem)}</div>
  <h2 class="sec">Meu conteúdo diário</h2>
  <div class="scroller">${cards}</div>
  <div class="card"><h3 style="margin:0 0 12px">O que esperar ao completar ${g.sem} semanas</h3>
    <div class="tiles">
      <button data-act="info" data-k="baby"><span>👶</span><b>Bebê</b><small>${fmtSize(wk).split(' · ')[0]}</small></button>
      <button data-act="info" data-k="body"><span>🤰</span><b>Seu corpo</b><small>${tn}º trimestre</small></button>
      <button data-act="info" data-k="food"><span>🥗</span><b>Alimentação</b><small>Nutrientes</small></button>
    </div></div>
  <div class="card"><h2>Parto previsto</h2><div class="bar"><div style="width:${Math.min(g.dias / 280, 1) * 100}%"></div></div><p class="mute" style="margin:0"><b>${fmt(g.dpp, { day: 'numeric', month: 'long', year: 'numeric' })}</b> · faltam ${Math.max(g.left, 0)} dias</p></div>
  <div class="list">${more('Exames e consultas', `${exams}<p class="note">Roteiro geral do pré-natal. Siga sempre as orientações do seu médico. Com ciclo irregular, confirme a data pelo ultrassom do 1º trimestre.</p>`, 'pré-natal', '📋')}</div>
  <button class="btn" data-act="log" data-d="${TODAY}">Registrar sintomas de hoje</button>`;
}

// ---------- engravidar ----------
const TIPS_E = [
  ['Quando ter relações', 'Os dias mais férteis são os 2 dias antes da ovulação e o dia dela. Relações a cada 1–2 dias durante a janela fértil dão a melhor chance — não precisa acertar o dia exato.'],
  ['Como saber que ovulou', 'Muco parecido com clara de ovo, teste de ovulação (LH) positivo, leve dor em um dos lados e subida da temperatura basal por 3 dias seguidos. Registre tudo no app.'],
  ['Teste de ovulação (LH)', 'Faça 1–2 vezes ao dia a partir de ~5 dias antes da data estimada. A ovulação costuma ocorrer 24–36 h depois do positivo. Com ciclos irregulares ele é bem mais confiável que o calendário.'],
  ['Temperatura basal', 'Meça todo dia ao acordar, antes de levantar, na mesma hora. Ela só confirma a ovulação depois que aconteceu, mas ajuda a conhecer seu padrão.'],
  ['Antes de tentar', 'Consulta pré-concepcional, ácido fólico (geralmente 400 µg/dia — o médico confirma a dose), vacinas em dia (rubéola), exames básicos e revisão de medicamentos.'],
  ['Estilo de vida', 'Evite cigarro e álcool, modere a cafeína (até ~200 mg/dia), busque peso saudável, durma bem e controle o estresse. Lubrificantes comuns podem atrapalhar os espermatozoides.'],
  ['Quando procurar ajuda', 'Abaixo de 35 anos: após 12 meses de tentativas. A partir de 35: após 6 meses. Procure antes se os ciclos forem muito irregulares ou houver condições como SOP ou endometriose.'],
  ['Quando fazer o teste', 'O teste de farmácia é confiável a partir do dia em que a menstruação atrasa. Antes disso pode dar falso negativo; o beta-HCG de sangue detecta mais cedo.']
];
const CHECK_E = ['Marcar consulta pré-concepcional', 'Começar o ácido fólico', 'Checar vacinas (rubéola, hepatite B, dTpa)', 'Parar cigarro e álcool', 'Comprar testes de ovulação (LH)', 'Medir a temperatura basal todo dia', 'Relações a cada 1–2 dias na janela fértil'];

function vEng() {
  const A = analyze(), last = A.g.at(-1), f = fertility(A);
  if (!last) return `<h1>Engravidar 🌱</h1><div class="card"><p>Registre ou importe pelo menos uma menstruação para eu calcular seus dias de ovulação.</p></div>`;
  const F = nextPeriod(A), beyond = F.late, pc = pregCheck(A);
  const lhDay = Math.max(5, (A.n ? A.min : A.lo) - 17), lhDate = add(last.start, lhDay - 1);
  const ovLo = add(last.start, A.lo - A.luteal), ovHi = add(last.start, A.hi - A.luteal);
  let plan;
  if (f?.ev) plan = `<div class="row"><span>Ovulação ${f.level2} (${ovSrc(last.start, TODAY)})</span><b>${fmt(f.ov)}</b></div><div class="row"><span>Janela fértil</span><b>${fmt(add(f.ov, -5))} – ${fmt(add(f.ov, 1))}</b></div><div class="row"><span class="green">Melhores dias</span><b style="color:var(--green)">${fmt(add(f.ov, -2))} – ${fmt(f.ov)}</b></div><div class="row"><span>Teste de gravidez a partir de</span><b>${fmt(F.center)}</b></div><p class="note">Menstruação prevista: ${sr(F.from, F.to)}.</p>`;
  else if (beyond) plan = `<p class="mute" style="margin:0">Ciclo além do seu padrão: use o teste de LH diário para ver se e quando você ovula.</p>`;
  else plan = `<div class="row"><span>Ovulação provável entre</span><b>${fmt(ovLo)} – ${fmt(ovHi)}</b></div><div class="row"><span>Começar teste de LH em</span><b>${diff(lhDate, TODAY) > 0 ? `${fmt(lhDate)} (dia ${lhDay})` : 'hoje, 1–2x ao dia'}</b></div><div class="row"><span>Teste de gravidez a partir de</span><b>${fmt(F.from)}</b></div><p class="note">${A.hi - A.lo > 6 ? 'Ciclo irregular: registre o teste de LH e o muco para a previsão ficar certeira.' : 'Confirme com teste de LH e muco.'}</p>`;
  let tries = 0;
  if (f?.ov) for (let d = add(f.ov, -5); d <= add(f.ov, 1); d = add(d, 1)) if (S.logs[d]?.sex && S.logs[d].sex !== 'Não') tries++;
  const color = f && ['Alta', 'Muito alta'].includes(f.level) ? 'var(--green)' : f?.level === 'Média' ? 'var(--amber)' : 'var(--mute)';
  return `<h1>Plano para engravidar 🌱</h1>
  ${planHeader(A)}
  <div class="card hero"><div class="mute">Chance de gravidez hoje</div><div style="font-size:36px;font-weight:800;color:${color}">${f ? f.level : '—'}</div>${f ? `<p class="note">${f.txt}.</p>` : ''}
    ${beyond ? (pc?.hasNeg ? `<div class="list" style="margin-top:8px">${more(`Teste negativo em ${sd(pc.lastNeg)}`, `<p>${pc.line}</p>`, 'o que isso significa', '🧾')}</div>` : `<p style="color:var(--pink);font-weight:700">Faça um teste de gravidez.</p>`) + `<button class="btn alt" data-go="gest">Positivo? Iniciar acompanhamento</button>` : ''}</div>
  <div class="card"><h2>Plano deste ciclo</h2>${plan}</div>
  ${f?.ov ? `<div class="card"><h2>Este ciclo</h2><div class="row"><span>Relações na janela fértil</span><b>${tries}</b></div></div>` : ''}
  <button class="btn" data-act="log" data-d="${TODAY}">Registrar hoje (muco, LH, relação…)</button>
  <div class="card" style="margin-top:14px"><h2>Checklist</h2>${CHECK_E.map((t, i) => chk('e' + i, t)).join('')}</div>
  <div class="card"><h2>Dicas</h2>${TIPS_E.map(([t, b]) => `<details><summary>${t}</summary><p>${b}</p></details>`).join('')}</div>
  <button class="btn alt" data-go="guia">Guia de saúde baseado em diretrizes</button>`;
}


// ---------- guia de saúde ----------
const GUIA = [
  ['O que é um ciclo normal', ['O ciclo conta do 1º dia de uma menstruação até o dia anterior à próxima.', 'A ACOG considera normais ciclos de 21 a 35 dias em adultas. A FIGO (2018) usa 24–38 dias, sangramento de até 8 dias e variação de até 7–9 dias entre o ciclo mais curto e o mais longo.', 'Estresse, viagens, mudanças de peso, exercício intenso, pós-parto e amamentação alteram o ciclo naturalmente.']],
  ['Ciclo irregular: causas e quando investigar', ['Causas comuns: síndrome dos ovários policísticos (SOP), alterações da tireoide, prolactina alta, estresse, baixo peso ou exercício excessivo, perimenopausa, uso ou suspensão de anticoncepcional — e gravidez.', 'Procure ginecologista se: ficar 3 meses ou mais sem menstruar, ciclos persistentemente menores que 21 ou maiores que 35 dias, sangramento por mais de 7–8 dias ou muito intenso, sangramento entre ciclos, dor forte — ou se quer engravidar.', 'Os exames costumam incluir beta-HCG, TSH, prolactina, andrógenos e ultrassom pélvico; quem decide é o médico.']],
  ['Ovulação e janela fértil', ['A janela fértil dura cerca de 6 dias e termina no dia da ovulação; os 2 dias antes e o dia da ovulação são os de maior chance (Wilcox, NEJM 1995).', 'A fase lútea (ovulação → menstruação) é relativamente estável, em torno de 12–14 dias. Por isso, em ciclos irregulares, quase toda a variação acontece antes da ovulação — e o calendário prevê mal o dia dela.', 'Teste de LH: a ovulação costuma ocorrer 24–48 h após a subida do LH. Em SOP podem ocorrer positivos falsos ou repetidos.', 'Temperatura basal: sobe ~0,2–0,5 °C depois da ovulação. Ela confirma, não antecipa.', 'Muco com aspecto de clara de ovo indica fertilidade alta.']],
  ['Como o app faz as previsões', ['Usa seus ciclos recentes (os mais novos pesam mais) e mostra uma faixa de datas em vez de um dia único.', 'Quando você registra um LH positivo ou a temperatura sobe, o app confirma a ovulação e prevê a menstruação como ovulação + sua fase lútea (±2 dias). É aí que a previsão fica realmente precisa.', 'A chance de gravidez do dia vem da fração dos seus ciclos passados em que aquele dia estaria na janela fértil.']],
  ['Tentando engravidar', ['Em casais saudáveis, a chance por ciclo é de cerca de 20–25%. A investigação costuma começar após 12 meses de tentativas (antes dos 35), 6 meses (a partir de 35) ou de imediato (a partir de 40).', 'Com ciclos irregulares não é preciso esperar: a avaliação pode começar logo (ASRM/ACOG).', 'Ácido fólico (400 µg/dia, ao menos 1 mês antes de tentar; doses maiores só com prescrição), consulta pré-concepcional, vacinas em dia e revisão de medicamentos.', 'Relações a cada 1–2 dias na janela fértil funcionam melhor do que tentar acertar um único dia.']],
  ['Teste de gravidez com ciclo irregular', ['Sem um dia previsível de atraso, use esta regra: teste cerca de 14 dias após a ovulação confirmada ou, se o ciclo passou do seu padrão, assim que perceber.', 'A primeira urina do dia é mais concentrada. Se der negativo e a menstruação não vier, repita em 3–5 dias; o beta-HCG de sangue detecta mais cedo.']],
  ['Datar a gestação quando o ciclo é irregular', ['A DUM (data da última menstruação) assume ovulação no dia 14; em ciclos irregulares ela pode errar por semanas.', 'A ACOG recomenda confirmar a data pelo ultrassom do 1º trimestre (idealmente até ~13 semanas). Use a DPP do ultrassom no app.', 'No Brasil, o Ministério da Saúde indica início do pré-natal o quanto antes e no mínimo 6 consultas (a OMS recomenda 8 contatos).']],
  ['Sinais de alerta', ['Procure atendimento urgente: sangramento tão intenso que encharca um absorvente por hora durante 2 horas ou mais, tontura ou desmaio, dor pélvica forte.', 'Com teste positivo: dor forte de um lado, sangramento ou ombro doendo podem indicar gravidez ectópica — é emergência.', 'Na gestação: sangramento, perda de líquido, febre, dor de cabeça forte com visão turva, inchaço súbito ou redução dos movimentos do bebê.']]
];
const FONTES = ['FIGO — Munro MG et al., sistema de classificação de sangramento uterino anormal (2018)', 'ACOG Committee Opinion 651 — Ciclo menstrual como sinal vital', 'ACOG/ASRM — Infertility Workup for the Women’s Health Specialist (2019)', 'ESHRE/ASRM — Diretriz internacional baseada em evidências para SOP (2023)', 'Wilcox AJ et al., NEJM 1995 — Janela fértil', 'Ministério da Saúde — Caderno de Atenção ao Pré-Natal de Baixo Risco', 'OMS — Recomendações para cuidado pré-natal (2016)'];
function vGuia() {
  return `<button class="chip" data-go="ana" style="margin-bottom:10px">‹ Voltar</button><h1>Guia de saúde</h1>
  <div class="card"><p style="margin:0" class="mute">Resumo em linguagem simples de diretrizes de sociedades médicas. Não é o texto original e não substitui consulta: confirme nas fontes abaixo e com seu ginecologista.</p></div>
  <div class="card">${GUIA.map(([t, ps]) => `<details><summary>${t}</summary>${ps.map(p => `<p>${p}</p>`).join('')}</details>`).join('')}</div>
  <div class="card"><h2>Fontes</h2>${FONTES.map(f => `<p class="small mute" style="margin:6px 0">• ${f}</p>`).join('')}</div>`;
}

// ---------- importar histórico ----------
function parseDates(line) {
  const re = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/g;
  const out = []; let m, rest = line;
  while ((m = re.exec(line))) {
    let y, mo, d;
    if (m[1]) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      d = +m[4]; mo = +m[5]; y = m[6] ? +m[6] : null;
      if (y !== null && y < 100) y += 2000;
      if (y === null) { y = new Date().getFullYear(); if (iso(new Date(y, mo - 1, d, 12)) > TODAY) y--; }
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push(iso(new Date(y, mo - 1, d, 12))); rest = rest.replace(m[0], ' ');
  }
  const n = rest.match(/\b(\d{1,2})\b/);
  return { dates: out, days: n ? +n[1] : null };
}
function importHist(text) {
  let n = 0, periods = 0;
  for (const line of text.split('\n')) {
    const { dates, days } = parseDates(line);
    if (!dates.length) continue;
    const start = dates[0];
    const end = dates[1] && dates[1] >= start ? dates[1] : add(start, (days && days >= 1 && days <= 14 ? days : S.settings.period) - 1);
    periods++;
    for (let d = start; d <= end; d = add(d, 1)) {
      const L = S.logs[d] ||= {};
      if (!['light', 'med', 'heavy'].includes(L.flow)) { L.flow = 'med'; n++; }
    }
  }
  save();
  return { n, periods };
}

// ---------- eventos ----------
const $main = document.getElementById('main'), $sheet = document.getElementById('sheet');
let pending = null;
const TD = { kind: 'preg' };
const nowHM = () => { const n = new Date(); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); };
function testDialog(kind, date) {
  TD.kind = kind;
  dialog(`<h2 style="margin:0 0 10px">Registrar teste</h2>
    <div class="chips"><button class="chip ${kind === 'preg' ? 'on' : ''}" data-act="tdk" data-v="preg">🧾 Gravidez</button><button class="chip ${kind === 'lh' ? 'on' : ''}" data-act="tdk" data-v="lh">🧪 Ovulação (LH)</button></div>
    <div style="display:flex;gap:10px;margin-top:12px"><div style="flex:1"><label class="f">Data</label><input type="date" id="tdd" value="${date}" max="${TODAY}"></div><div style="flex:1"><label class="f">Hora</label><input type="time" id="tdt" value="${nowHM()}"></div></div>
    <p class="mute small" style="margin:12px 0 8px">Resultado</p>
    <div style="display:flex;gap:10px"><button class="btn alt" style="flex:1" data-act="tdsave" data-v="Negativo">➖ Negativo</button><button class="btn" style="flex:1" data-act="tdsave" data-v="Positivo">➕ Positivo</button></div>`);
}
function saveTest(res) {
  const d = document.getElementById('tdd').value || TODAY, tm = document.getElementById('tdt').value || nowHM(), kind = TD.kind;
  const L = S.logs[d] = S.logs[d] || {};
  if (kind === 'lh') { L.lh = res; L.lhAt = tm; } else { L.test = res; L.testAt = tm; }
  save();
  if (kind === 'preg' && res === 'Positivo' && !S.settings.pregnancy) {
    const A = analyze(), last = A.g.at(-1), est = estConception(A, d), ov = est?.ov || null;
    const dum = ov ? add(ov, -14) : (last ? last.start : add(d, -28));
    S.settings.pregnancy = { dum, since: d }; S.settings.goal = 'track'; view = 'gest'; save(); render(); scrollTo(0, 0);
    dialog(`<h2 style="margin:0 0 8px">Parabéns! 💜</h2><p>Teste positivo registrado em ${sd(d)} às ${tm}. Passei o app para o acompanhamento da gestação.</p><p class="mute small">Contei as semanas a partir de ${fmt(dum, { day: 'numeric', month: 'long' })} (${ov ? `concepção estimada em ${sd(ov)}, pelos seus sinais, relações e testes` : 'início da última menstruação'}). Com ciclo irregular isso pode variar: confirme com beta-hCG e ultrassom, e ajuste a data na aba Gestação.</p>`);
    return;
  }
  render();
  let msg;
  if (kind === 'lh') msg = res === 'Positivo' ? `<p>LH positivo: a ovulação costuma ocorrer em 24–36 h. Esses são seus melhores dias para tentar.</p>` : `<p>LH negativo registrado. O app usa isso para refinar a previsão de ovulação: ainda sem pico hoje.</p>`;
  else if (res === 'Positivo') msg = `<p>Positivo registrado em ${sd(d)} às ${tm}.</p>`;
  else { const pc = pregCheck(analyze()); msg = `<p>Negativo registrado em ${sd(d)} às ${tm}.</p>${pc?.hasNeg ? `<p>${pc.line}</p>` : ''}<p class="mute small">A chance deste ciclo foi recalculada com esse teste. Se a menstruação não vier, repita em 3–5 dias com a primeira urina.</p>`; }
  dialog(`<h2 style="margin:0 0 8px">Teste registrado</h2>${msg}`);
}
function dialog(html) { $sheet.className = ''; $sheet.innerHTML = html + '<div style="height:12px"></div><button class="btn alt" data-act="close">Fechar</button>'; if (!$sheet.open) $sheet.showModal(); }
const notify = msg => dialog(`<p style="font-size:17px">${msg}</p>`);
function ask(msg, yes, fn) { pending = fn; $sheet.className = ''; $sheet.innerHTML = `<p style="font-size:17px">${msg}</p><button class="btn" data-act="yes">${yes}</button><div style="height:8px"></div><button class="btn alt" data-act="close">Cancelar</button>`; if (!$sheet.open) $sheet.showModal(); }
const bkmsg = t => { const el = document.getElementById('bkmsg'); if (el) el.textContent = t; };
function doImport(txt) {
  try { const x = JSON.parse(txt); if (!x.logs) throw 0; S = norm(x); save(); $sheet.close(); render(); } catch { bkmsg('Backup inválido: confira se colou o texto inteiro.'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-act]'); if (!t) return;
  if (t.dataset.go) { view = t.dataset.go; gv = null; render(); scrollTo(0, 0); return; }
  if (t.dataset.tab) { view = t.dataset.tab; gv = null; render(); scrollTo(0, 0); return; }
  const chip = t.closest('.chip') && !t.dataset.act && t;
  if (chip) {
    const wrap = chip.parentElement;
    if (wrap.dataset.multi === '1') chip.classList.toggle('on');
    else { const was = chip.classList.contains('on'); wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); if (!was) chip.classList.add('on'); }
    return;
  }
  switch (t.dataset.act) {
    case 'log': openDay(t.dataset.d); break;
    case 'ch': {
      const { k, v, multi } = t.dataset, Lg = DAY.L;
      if (multi === '1') { const a = new Set(Lg[k] || []); if (a.has(v)) a.delete(v); else a.add(v); if (a.size) Lg[k] = [...a]; else delete Lg[k]; t.classList.toggle('on'); }
      else { if (Lg[k] === v) delete Lg[k]; else Lg[k] = v; t.parentElement.querySelectorAll('.ch').forEach(x => x.classList.toggle('on', Lg[k] === x.dataset.v)); }
      t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
      try { navigator.vibrate?.(8); } catch {}
      commitDay(); updateCounts(); break;
    }
    case 'dprev': openDay(add(DAY.date, -1)); break;
    case 'dnext': if (DAY.date < TODAY) openDay(add(DAY.date, 1)); break;
    case 'jump': {
      const el = document.getElementById('sec-' + t.dataset.id), box = document.getElementById('dsc');
      if (el && box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 6, behavior: 'smooth' });
      break;
    }
    case 'chk': { const k = t.dataset.k, y = scrollY; S.settings.checklist[k] = !S.settings.checklist[k]; save(); render(); scrollTo(0, y); break; }
    case 'startpreg': {
      const dpp = document.getElementById('dpp').value, dum = document.getElementById('dum').value;
      const manual = !!(dpp || dum), est = manual ? null : estConception(analyze(), TODAY);
      const d = dpp ? add(dpp, -280) : dum || (est ? add(est.ov, -14) : '');
      if (!d) { notify('Informe a DUM ou a DPP.'); break; }
      S.settings.pregnancy = manual ? { dum: d, manual: true, since: TODAY } : { dum: d, since: TODAY }; S.settings.goal = 'track'; save(); render(); break;
    }
    case 'endpreg': ask('Sair do modo gestação? Seus registros continuam salvos e o app volta ao modo de ciclo.', 'Encerrar', () => { S.settings.pregnancy = null; S.settings.goal = 'track'; view = 'hoje'; save(); render(); }); break;
    case 'yes': { const f = pending; pending = null; $sheet.close(); if (f) f(); break; }
    case 'info': {
      const [title, html] = INFO[t.dataset.k];
      $sheet.className = '';
      $sheet.innerHTML = `<h1>${title}</h1>${html}<div style="height:12px"></div><button class="btn alt" data-act="close">Fechar</button>`;
      $sheet.showModal(); break;
    }
    case 'theme': { try { localStorage.setItem(THEME_KEY, isDark() ? 'light' : 'dark'); } catch {} applyTheme(); render(); break; }
    case 'q': {
      const k = t.dataset.k, Lg = S.logs[TODAY] ||= {};
      if (k === 'muc') { if (FERT_MUC.includes(Lg.mucus)) delete Lg.mucus; else Lg.mucus = 'Clara de ovo'; }
      else if (k === 'lh') { if (Lg.lh === 'Positivo') delete Lg.lh; else Lg.lh = 'Positivo'; }
      else if (k === 'pain') { const x = new Set(Lg.symptoms || []); if (x.has('Dor na ovulação')) x.delete('Dor na ovulação'); else x.add('Dor na ovulação'); if (x.size) Lg.symptoms = [...x]; else delete Lg.symptoms; }
      else if (k === 'sex') { if (Lg.sex && Lg.sex !== 'Não') delete Lg.sex; else Lg.sex = 'Sim'; }
      else if (k === 'test') { if (!Lg.test) Lg.test = 'Negativo'; else if (Lg.test === 'Negativo') Lg.test = 'Positivo'; else delete Lg.test; }
      if (!Object.keys(Lg).length) delete S.logs[TODAY];
      const y = scrollY; save(); render(); scrollTo(0, y); break;
    }
    case 'conceive': {
      const on = S.settings.goal === 'conceive';
      S.settings.goal = on ? 'track' : 'conceive';
      if (!on && !S.settings.conceiveSince) S.settings.conceiveSince = TODAY;
      view = 'hoje'; save(); render(); scrollTo(0, 0); break;
    }
    case 'more': { const m = MORE[+t.dataset.i]; if (m) dialog(`<h2 style="margin:0 0 8px">${m[0]}</h2>${m[1]}`); break; }
    case 'chkx': { const k = t.dataset.k; S.settings.checklist[k] = !S.settings.checklist[k]; save(); t.classList.toggle('on', !!S.settings.checklist[k]); t.querySelector('.bx').textContent = S.settings.checklist[k] ? '✓' : ''; break; }
    case 'testdlg': testDialog(t.dataset.k || 'preg', t.dataset.d || TODAY); break;
    case 'tdk': { TD.kind = t.dataset.v; document.querySelectorAll('[data-act="tdk"]').forEach(b => b.classList.toggle('on', b === t)); break; }
    case 'tdsave': saveTest(t.dataset.v); break;
    case 'editdum': {
      const g = pregInfo(); if (!g) break;
      dialog(`<h2 style="margin:0 0 8px">Ajustar data da gestação</h2><p class="mute small">Data de início usada para contar as semanas (equivale à DUM). Se tiver ultrassom, use a DPP do médico.</p><label class="f">DUM</label><input type="date" id="dum2" value="${g.dum}" max="${TODAY}"><div style="height:12px"></div><button class="btn" data-act="savedum">Salvar</button>`); break;
    }
    case 'savedum': { const v = document.getElementById('dum2').value; if (v) { S.settings.pregnancy = { ...S.settings.pregnancy, dum: v, manual: true }; save(); $sheet.close(); render(); } break; }
    case 'startgest': view = 'gest'; render(); scrollTo(0, 0); break;
    case 'phase': {
      const [title, html] = phaseSheet(analyze(), t.dataset.k);
      $sheet.className = ''; $sheet.innerHTML = `<h1>${title}</h1>${html}<div style="height:12px"></div><button class="btn alt" data-act="close">Fechar</button>`; $sheet.showModal(); break;
    }
    case 'sharepartner': {
      const txt = partnerText(analyze());
      const fallback = () => dialog(`<h1>Mensagem para o parceiro</h1><textarea id="bk" rows="8" readonly>${esc(txt)}</textarea><div style="height:8px"></div><button class="btn" data-act="copybk">Copiar mensagem</button><p class="note" id="bkmsg"></p>`);
      if (navigator.share) navigator.share({ text: txt }).catch(fallback); else fallback();
      break;
    }
    case 'toggleins': {
      const sec = t.closest('.insc'), o = !sec.classList.contains('open');
      sec.classList.toggle('open', o); t.setAttribute('aria-expanded', o);
      try { localStorage.setItem('ciclo.ins', o ? '1' : '0'); } catch {}
      break;
    }
    case 'close': $sheet.close(); break;
    case 'prev': cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } render(); break;
    case 'next': cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } render(); break;
    case 'hist': {
      const r = importHist(document.getElementById('hist').value);
      document.getElementById('histmsg').textContent = r.periods ? `${r.periods} menstruação(ões) importada(s) (${r.n} dias). Veja em Hoje e Calendário.` : 'Nenhuma data reconhecida.';
      break;
    }
    case 'export': {
      dialog(`<h1>Backup</h1><p class="mute small">Copie o texto abaixo e guarde onde quiser (notas, e-mail para você mesma). Para restaurar, use Importar backup e cole.</p><textarea id="bk" rows="8" readonly>${esc(JSON.stringify(S))}</textarea><div style="height:8px"></div><button class="btn" data-act="copybk">Copiar backup</button><p class="note" id="bkmsg"></p>`);
      break;
    }
    case 'copybk': {
      const ta = document.getElementById('bk');
      const fail = () => { ta.focus(); ta.select(); bkmsg('Selecione o texto e copie.'); };
      try { navigator.clipboard.writeText(ta.value).then(() => bkmsg('Copiado!'), fail); } catch { fail(); }
      break;
    }
    case 'import':
      dialog(`<h1>Importar backup</h1><label class="f">Cole o texto do backup</label><textarea id="bkin" rows="6"></textarea><div style="height:8px"></div><button class="btn" data-act="doimport">Importar texto</button><div style="height:8px"></div><button class="btn alt" data-act="pickfile">Escolher arquivo .json</button><p class="note" id="bkmsg"></p>`);
      break;
    case 'doimport': doImport(document.getElementById('bkin').value); break;
    case 'pickfile': {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = async () => { try { doImport(await i.files[0].text()); } catch { bkmsg('Não consegui ler o arquivo.'); } };
      i.click(); break;
    }
    case 'wipe': ask('Apagar todos os registros? Isso não pode ser desfeito.', 'Apagar tudo', () => { S = norm({}); save(); render(); }); break;
  }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.set; if (!k) return;
  const v = parseInt(e.target.value, 10);
  if (v) { S.settings[k] = v; save(); }
});
document.addEventListener('input', e => {
  if (e.target.dataset.gv === undefined) return;
  const g = pregInfo(); if (!g) return;
  gv = +e.target.value;
  const b3 = document.getElementById('b3d');
  b3.dataset.w = Math.min(Math.max(gv, 4), 40);
  document.getElementById('gh-text').innerHTML = heroText(gv, g);
  if (b3.querySelector('canvas')) { clearTimeout(t3); t3 = setTimeout(mount3d, 60); } else b3.innerHTML = fetusSvg(gv);
  document.getElementById('wk-cards').innerHTML = weekCards(gv); foldNotes(document.getElementById('wk-cards')); symInfo(gv);
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute?.('role') === 'button') { e.preventDefault(); e.target.click(); } });
$sheet.addEventListener('click', e => { if (e.target === $sheet && !$sheet.classList.contains('full')) $sheet.close(); });
$sheet.addEventListener('close', () => { if ($sheet.classList.contains('full')) { $sheet.className = ''; DAY = null; render(); } });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'dq') { filterDay(el.value); return; }
  if (!DAY) return;
  if (el.id === 'dn') { const v = el.value.trim(); if (v) DAY.L.notes = v; else delete DAY.L.notes; }
  else if (el.dataset.num) {
    const k = el.dataset.num, v = parseFloat(el.value.replace(',', '.')), ok = k === 'temp' ? v >= 34 && v <= 42 : k === 'agua' || k === 'chutes' ? v >= 0 && v <= 200 : v >= 25 && v <= 300;
    if (ok) DAY.L[k] = v; else delete DAY.L[k];
  } else return;
  clearTimeout(dayT); dayT = setTimeout(() => { commitDay(); updateCounts(); }, 450);
});

applyGoal();
render();
initCloud();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');

// link pessoal de importação: https://.../#import=<dados em base64>. Os dados ficam no link (nunca no repositório) e o link é limpo da barra depois de usado.
(function importFromLink() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  try {
    const x = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    history.replaceState(null, '', location.pathname + location.search);
    if (!x.logs) throw 0;
    if (Object.keys(S.logs).length) { notify('Este aparelho já tem dados. Para substituir pelo histórico do link, use Ajustes → Importar backup.'); return; }
    S = norm(x); save(); render();
    notify('Histórico importado: ' + Object.keys(S.logs).length + ' dias de registro.');
  } catch { notify('Não consegui ler o link de importação.'); }
})();

// link de atualização: https://.../#merge=<dias novos em base64>. Junta aos dados que já estão no aparelho (campos do link prevalecem).
(function mergeFromLink() {
  const m = location.hash.match(/^#merge=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  try {
    const x = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    history.replaceState(null, '', location.pathname + location.search);
    if (!x.logs) throw 0;
    let n = 0; for (const [d, f] of Object.entries(x.logs)) { S.logs[d] = { ...(S.logs[d] || {}), ...f }; n++; }
    save(); render(); notify(n + ' dias atualizados no seu histórico.');
  } catch { notify('Não consegui ler o link de atualização.'); }
})();

// se o app ficou aberto de um dia para o outro, recarrega para atualizar "hoje"
document.addEventListener('visibilitychange', () => { if (!document.hidden && iso(new Date()) !== TODAY) location.reload(); });
