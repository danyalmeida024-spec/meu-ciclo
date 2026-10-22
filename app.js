'use strict';
// ---------- estado ----------
const KEY = 'ciclo.v1';
const DEF = { logs: {}, settings: { cycle: 28, period: 5, luteal: 14, pregnancy: null, checklist: {} } };
const norm = x => ({ logs: x.logs || {}, settings: { ...DEF.settings, ...x.settings }, savedAt: x.savedAt || 0 });
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

function analyze() {
  const g = groups();
  const lens = [];
  for (let i = 1; i < g.length; i++) { const l = diff(g[i].start, g[i - 1].start); if (l >= 15 && l <= 60) lens.push(l); }
  const recent = lens.slice(-8), n = recent.length;
  // ciclos recentes pesam mais; poucos dados => amostras sintéticas ao redor do valor inicial
  let samples = recent.map((v, i) => [v, 0.85 ** (n - 1 - i)]);
  const base = n ? samples.reduce((t, x) => t + x[0] * x[1], 0) / samples.reduce((t, x) => t + x[1], 0) : S.settings.cycle;
  if (n < 3) samples = samples.concat([[Math.round(base) - 4, 0.5], [Math.round(base) + 4, 0.5]], n ? [] : [[Math.round(base), 1]]);
  const tw = samples.reduce((t, x) => t + x[1], 0);
  const mean = samples.reduce((t, x) => t + x[0] * x[1], 0) / tw;
  const cycle = Math.round(mean);
  const lo = Math.min(wq(samples, .1), cycle - 2), hi = Math.max(wq(samples, .9), cycle + 2);
  const plens = g.slice(0, -1).map(x => diff(x.end, x.start) + 1).concat(g.length && diff(g.at(-1).end, g.at(-1).start) >= 1 ? [diff(g.at(-1).end, g.at(-1).start) + 1] : []);
  const period = plens.length ? Math.round(avg(plens.slice(-6))) : S.settings.period;
  const cyc = [], lut = [];
  for (let i = 1; i < g.length; i++) {
    const len = diff(g[i].start, g[i - 1].start); if (len < 15 || len > 60) continue;
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
  return { g, lens, n, samples, cyc, ovSamples, mean, cycle, lo, hi, period, luteal, lutMeasured: lut.length, sd, min, max, spread: n >= 2 ? Math.max(...recent) - Math.min(...recent) : null };
}

// probabilidade (0–1) de o dia do ciclo estar na janela fértil, segundo o dia em que você costuma ovular.
// Só considera ciclos em que a ovulação ainda não tinha ocorrido até o dia atual (cur). null = fora de tudo que já vi.
function fertProb(A, day, cur = day) {
  let num = 0, den = 0;
  for (const [od, w] of A.ovSamples) { if (od < cur - 1) continue; den += w; if (day >= od - 5 && day <= od + 1) num += w; }
  return den ? num / den : null;
}

// previsão da próxima menstruação: faixa; se a ovulação já foi confirmada, a faixa fica bem mais estreita
function nextPeriod(A) {
  const last = A.g.at(-1), e = ovEst(last.start, TODAY);
  if (e) { const c = add(e.date, A.luteal), hw = e.level === 'confirmada' ? 2 : e.level === 'provável' ? 3 : 4; return { center: c, from: add(c, -hw), to: add(c, hw), confirmed: e.level === 'confirmada', level: e.level, src: e.src.join(' + '), ov: e.date }; }
  return { center: add(last.start, A.cycle), from: add(last.start, A.lo), to: add(last.start, A.hi), confirmed: false };
}
const isRegular = A => A.n >= 3 && A.hi - A.lo <= 6;

function marks(A) {
  const per = new Set(), pper = new Set(), fert = new Map(), ov = new Set(), late = new Set();
  A.g.forEach(x => { for (let d = x.start; d <= x.end; d = add(d, 1)) per.add(d); });
  const mark = o => { ov.add(o); for (let k = -5; k <= 1; k++) fert.set(add(o, k), 1); };
  A.g.forEach((x, i) => {
    const next = A.g[i + 1]?.start;
    if (next) mark(detectOv(x.start, add(next, -1)) || add(next, -A.luteal));
  });
  const last = A.g.at(-1);
  if (last) {
    const F = nextPeriod(A), e = ovEst(last.start, TODAY);
    for (let d = F.from; d <= F.to; d = add(d, 1)) pper.add(d);
    if (TODAY > F.to) for (let d = add(F.to, 1); d <= TODAY; d = add(d, 1)) late.add(d);
    if (e) mark(e.date);
    else if (isRegular(A)) {
      for (let k = 1; k <= 3; k++) { const ns = add(last.start, k * A.cycle); mark(add(ns, -A.luteal)); if (k > 1) for (let j = 0; j < A.period; j++) pper.add(add(ns, j)); }
    } else if (TODAY <= F.to) {
      const cur = diff(TODAY, last.start) + 1;
      for (let i = Math.max(cur - 1, 0); i <= A.hi; i++) { const p = fertProb(A, i + 1, cur); if (p !== null && p >= .15) fert.set(add(last.start, i), p); }
    }
  }
  return { per, pper, fert, ov, late };
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
    if (e.level === 'iminente') return { ...base, level: 'Muito alta', txt: `Muco fértil registrado: a ovulação deve ocorrer em até 2 dias — faça o teste de LH hoje` };
    const tag = e.level === 'confirmada' ? 'confirmada' : 'provável';
    if (d >= 0 && d <= 2) return { ...base, level: 'Muito alta', txt: `Ovulação ${tag} (${src}): hoje é um dos dias mais férteis` };
    if (d === -1) return { ...base, level: 'Alta', txt: `Ovulação ${tag} (${src}) ontem: ainda dentro da janela` };
    if (d < -1) return { ...base, level: 'Baixa', txt: `Ovulação já ocorreu neste ciclo (${src})` };
    return { ...base, level: 'Alta', txt: `Ovulação ${tag} (${src}) para ${fmt(o)}` };
  }
  if (TODAY > F.to) return { level: 'Incerta', beyond: true, txt: `Ciclo mais longo que o seu padrão (dia ${day}): a ovulação é incerta — o teste de LH ajuda` };
  const p = fertProb(A, day);
  if (p === null) return { level: 'Incerta', txt: `Já passou do dia em que você costuma ovular (dia ${day}): a ovulação é incerta — o teste de LH ajuda` };
  let level = p >= .5 ? 'Alta' : p >= .2 ? 'Média' : 'Baixa';
  if (mucus) level = 'Alta';
  const ov = isRegular(A) ? add(add(last.start, A.cycle), -A.luteal) : null;
  return { level, p, ov, txt: `Estimativa pelo seu histórico de ovulação: ${Math.round(p * 100)}% dos seus ciclos estariam na janela fértil neste dia. Confirme com teste de LH e muco` };
}

// Cobertura do teste de gravidez: um teste negativo só "vale" para relações ocorridas pelo menos 14 dias antes dele.
function pregCheck(A) {
  const last = A.g.at(-1);
  if (!last) return null;
  const neg = Object.keys(S.logs).filter(d => d >= last.start && S.logs[d].test === 'Negativo').sort();
  if (!neg.length) return { hasNeg: false };
  const exposures = Object.keys(S.logs).filter(d => d >= last.start && d <= TODAY && ['Sem proteção', 'Sim'].includes(S.logs[d].sex)).sort();
  const unc = exposures.filter(e => !neg.some(t => diff(t, e) >= 14));
  const lastNeg = neg.at(-1), until = add(lastNeg, -14), allClear = unc.length ? add(unc.at(-1), 14) : null, fd = d => fmt(d).replace(/\.$/, '');
  const line = !unc.length ? 'O teste cobre todas as relações registradas neste ciclo: gravidez muito improvável.'
    : `O teste cobre relações até ${fd(until)}. ${allClear <= TODAY ? 'Um teste feito hoje já cobriria todas as relações registradas.' : `Para cobrir todas as relações registradas, um teste só será conclusivo a partir de ${fd(allClear)} — ou quando a menstruação vier.`}`;
  return { hasNeg: true, lastNeg, covered: !unc.length, until, allClear, line };
}

// ---------- views ----------
let view = 'hoje';
let cal = { y: new Date().getFullYear(), m: new Date().getMonth() };

function vHoje() {
  const A = analyze(), last = A.g.at(-1);
  if (!last) return `<h1>Olá 🌸</h1><div class="card"><p>Comece registrando o <b>primeiro dia da sua última menstruação</b> (ou importe o histórico em Ajustes). Com 3 ciclos o app já aprende o seu padrão.</p><button class="btn" data-act="log" data-d="${TODAY}">Registrar hoje</button></div>`;
  const day = diff(TODAY, last.start) + 1, F = nextPeriod(A), f = fertility(A);
  const ph = phaseOf(TODAY, A);
  const R = 90, C = 2 * Math.PI * R, pct = Math.min(day / Math.max(A.hi, day), 1);
  const beyond = TODAY > F.to, over = diff(TODAY, F.to), pc = pregCheck(A);
  const tdays = diff(F.center, TODAY);
  const prec = F.confirmed ? ['Alta', `ovulação confirmada por ${F.src}`] : F.level === 'provável' ? ['Média', `ovulação provável (${F.src})`] : F.level === 'iminente' ? ['Média', 'muco fértil: ovulação iminente'] : A.n >= 6 ? ['Média', 'baseada em 6+ ciclos'] : A.n >= 3 ? ['Média', `baseada em ${A.n} ciclos`] : ['Baixa', 'poucos ciclos registrados'];
  const lhDay = Math.max(5, (A.n ? A.min : A.lo) - 17), lhDate = add(last.start, lhDay - 1);
  const rows = [];
  if (beyond) rows.push(`<div class="row"><span>Próxima menstruação</span><b style="color:var(--pink)">Atrasada · dia ${day}</b></div><div class="row"><span class="mute">Seu ciclo mais longo costuma ser</span><b>${A.hi} dias</b></div>`);
  else rows.push(`<div class="row"><span>Próxima menstruação</span><b>${F.from === F.to ? fmt(F.from) : `${fmt(F.from)} – ${fmt(F.to)}`}</b></div><div class="row"><span class="mute">Mais provável</span><b>${fmt(F.center, { weekday: 'short', day: 'numeric', month: 'short' })}${tdays > 0 ? ` · em ${tdays}d` : tdays === 0 ? ' · hoje' : ''}</b></div>`);
  rows.push(`<div class="row"><span class="mute">Precisão da previsão</span><span><span class="pill ${prec[0] === 'Alta' ? 'p-fertil' : prec[0] === 'Média' ? 'p-lutea' : 'p-folicular'}">${prec[0]}</span> <span class="mute small">${prec[1]}</span></span></div>`);
  if (f?.ev) rows.push(`<div class="row"><span>Ovulação ${{ confirmada: 'confirmada', 'provável': 'provável', iminente: 'iminente' }[f.level2]}</span><b>${fmt(f.ov)}</b></div><div class="row"><span class="mute">Baseada em</span><span class="mute small" style="text-align:right">${ovSrc(last.start, TODAY)}</span></div><div class="row"><span>Janela fértil</span><b>${fmt(add(f.ov, -5))} – ${fmt(add(f.ov, 1))}</b></div>`);
  else rows.push(`<div class="row"><span>Ovulação</span><span class="mute" style="text-align:right">ainda sem sinais registrados${diff(lhDate, TODAY) > 0 ? `<br>teste de LH a partir de ${fmt(lhDate)}` : '<br>use o teste de LH e registre o muco'}</span></div>`);
  const col = f && ['Alta', 'Muito alta'].includes(f.level) ? 'var(--green)' : f?.level === 'Média' ? 'var(--amber)' : 'var(--mute)';
  if (pc?.hasNeg) rows.push(`<div class="row"><span>Gravidez</span><b style="color:var(--green)">${pc.covered ? 'Muito improvável' : 'Pouco provável'}</b></div>`);
  rows.push(`<div class="row"><span>Chance de gravidez hoje</span><b style="color:${col}">${f ? f.level : '—'}</b></div>${f ? `<p class="note">${f.txt}.</p>` : ''}`);
  const redCard = `<div class="card" style="border:1.5px solid var(--pink)"><h2 style="color:var(--pink)">Ciclo fora do seu padrão</h2><p style="margin:0 0 8px">Já são ${over} dia(s) além da sua faixa habitual (${A.lo}–${A.hi} dias). Em ciclos irregulares pode ser ovulação tardia, estresse, SOP ou tireoide — mas <b>gravidez é uma possibilidade</b>.</p><p style="margin:0" class="mute small">Faça um teste de gravidez (melhor com a primeira urina do dia) e registre o resultado aqui. Sem menstruar por 3 meses, procure seu ginecologista.</p></div>`;
  const negCard = pc?.hasNeg ? `<div class="card"><h2>Atraso com teste negativo</h2><p style="margin:0 0 8px">Teste negativo em <b>${fmt(pc.lastNeg)}</b> (${diff(TODAY, pc.lastNeg)} dias atrás). Seu ciclo está ${over} dia(s) além da faixa habitual (${A.lo}–${A.hi}); com teste negativo, as causas mais comuns são ovulação tardia, estresse, tireoide ou SOP.</p><p style="margin:0 0 8px" class="mute small">${pc.line}</p><p style="margin:0" class="mute small">Se a menstruação não vier até ${fmt(add(last.start, 90))} (3 meses sem menstruar), ou se houver dor forte ou sangramento intenso, procure seu ginecologista.</p></div>` : '';
  const alert = beyond && !S.settings.pregnancy ? (pc?.hasNeg ? negCard : redCard) : '';
  const pos = Object.entries(S.logs).filter(([d, l]) => l.test === 'Positivo' && diff(TODAY, d) <= 14).length && !S.settings.pregnancy ? `<div class="card" style="background:var(--green-l)"><b>Teste positivo registrado.</b> <button class="chip" data-go="gest">Iniciar acompanhamento</button></div>` : '';
  return `<h1 class="cap">${fmt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
  ${pregBanner()}${pos}${alert}
  <div class="card hero">
    <div class="ring"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--pink-l)" stroke-width="14"/><circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--pink)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/></svg>
    <div class="c"><div class="mute">Dia do ciclo</div><div class="n">${day}</div><div class="mute small">seu padrão: ${A.lo}–${A.hi} dias</div></div></div>
    ${ph && !beyond ? `<span class="pill p-${ph}">${PHASE[ph]}</span><p class="mute">${TIPS[ph]}</p>` : ''}
  </div>
  <div class="card">${rows.join('')}</div>
  <button class="btn" data-act="log" data-d="${TODAY}">${S.logs[TODAY] ? 'Editar registro de hoje' : 'Registrar hoje'}</button>
  <p class="note">Com ciclos irregulares as datas são faixas de probabilidade, não certezas. Elas melhoram a cada ciclo — e muito mais quando você registra testes de LH e temperatura. Não serve como método contraceptivo.</p>`;
}

function vCal() {
  const A = analyze(), K = marks(A);
  const first = new Date(cal.y, cal.m, 1, 12), n = new Date(cal.y, cal.m + 1, 0).getDate();
  let cells = '<div class="dow">D</div><div class="dow">S</div><div class="dow">T</div><div class="dow">Q</div><div class="dow">Q</div><div class="dow">S</div><div class="dow">S</div>';
  for (let i = 0; i < first.getDay(); i++) cells += '<div class="d out"></div>';
  for (let d = 1; d <= n; d++) {
    const s = iso(new Date(cal.y, cal.m, d, 12));
    const L = S.logs[s] || {};
    const c = ['d', K.per.has(s) ? 'per' : K.late.has(s) ? 'late' : K.pper.has(s) ? 'pper' : K.fert.has(s) ? 'fert' : '', K.ov.has(s) ? 'ov' : '', s === TODAY ? 'today' : ''].join(' ');
    const heart = L.sex && L.sex !== 'Não' ? '<b>♥</b>' : '';
    const dot = Object.keys(L).some(k => k !== 'flow' && k !== 'sex') ? '<i></i>' : '';
    cells += `<button class="${c}" ${K.fert.has(s) ? `style="--p:${K.fert.get(s)}"` : ''} data-act="log" data-d="${s}">${d}<span class="mk">${heart}${dot}</span></button>`;
  }
  const title = new Date(cal.y, cal.m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `<div class="cal-h"><button data-act="prev">‹</button><h1 class="cap" style="margin:0">${title}</h1><button data-act="next">›</button></div>
  <div class="grid">${cells}</div>
  <div class="legend"><span><i style="background:var(--pink);border-radius:50%"></i>Menstruação</span><span><i style="border:2px dashed var(--pink)"></i>Faixa provável da menstruação</span><span style="color:var(--teal)"><i style="background:var(--teal)"></i>Janela fértil</span><span><i style="border:2px dotted var(--teal);border-radius:50%"></i>Ovulação</span><span><i style="background:#4d5a75;border-radius:50%"></i>Atraso</span><span style="color:var(--pink)">♥ Sexo</span><span>● Outro registro</span></div>`;
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

function vAna() {
  const A = analyze();
  const reg = A.spread == null ? '—' : A.spread <= 7 ? 'Regular' : A.spread <= 9 ? 'Limítrofe' : 'Irregular';
  return `<h1>Análises</h1>
  <div class="card"><h2>Resumo</h2><div class="stats">
    <div><div class="mute small">Ciclo médio</div><div class="big">${A.n ? A.cycle + ' dias' : '—'}</div></div>
    <div><div class="mute small">Menstruação</div><div class="big">${A.g.length ? A.period + ' dias' : '—'}</div></div>
    <div><div class="mute small">Faixa habitual</div><div class="big">${A.n ? `${A.lo}–${A.hi}` : '—'}</div></div>
    <div><div class="mute small">Regularidade</div><div class="big">${reg}</div></div>
    <div><div class="mute small">Fase lútea</div><div class="big">${A.luteal} dias</div></div>
    <div><div class="mute small">Ciclos registrados</div><div class="big">${A.g.length}</div></div>
  </div><p class="note">${A.lutMeasured >= 2 ? 'Fase lútea medida pelas suas ovulações confirmadas.' : 'Fase lútea padrão (14). Com 2+ ovulações confirmadas (LH ou temperatura) o app mede a sua.'}</p></div>
  <div class="card"><h2>Interpretação</h2>${interpret(A)}</div>
  <div class="card"><h2>Seus sinais de ovulação</h2>${signalsCard(A)}</div>
  <div class="card"><h2>Duração dos ciclos</h2>${A.lens.length ? barChart(A.lens.slice(-12), avg(A.lens.slice(-12))) : '<p class="mute">Precisa de pelo menos 2 menstruações registradas.</p>'}</div>
  <div class="card"><h2>Temperatura basal (ciclo atual)</h2>${tempChart(A)}</div>
  <div class="card"><h2>Padrões por fase</h2>${patterns(A)}</div>
  <button class="btn alt" data-go="guia">Guia de saúde baseado em diretrizes</button>`;
}

function vCfg() {
  const s = S.settings;
  return `<h1>Ajustes</h1>
  <div class="card"><h2>Valores iniciais</h2><p class="mute small">Usados até o app ter histórico suficiente.</p>
    <div class="two"><div><label class="f">Ciclo (dias)</label><input type="number" min="21" max="45" data-set="cycle" value="${s.cycle}"></div><div><label class="f">Menstruação (dias)</label><input type="number" min="2" max="10" data-set="period" value="${s.period}"></div></div>
    <label class="f">Fase lútea (dias)</label><input type="number" min="10" max="16" data-set="luteal" value="${s.luteal}"></div>
  <div class="card"><h2>Importar histórico</h2><p class="mute small">Cole uma menstruação por linha, do jeito que estiver no seu outro app. Ex.: <code>15/09/2026 a 20/09/2026</code>, <code>15/09/2026 5</code> (5 dias) ou só <code>15/09</code>.</p>
    <textarea id="hist" rows="6" placeholder="15/08/2026 5&#10;12/09/2026 a 17/09/2026&#10;10/10"></textarea><div style="height:8px"></div>
    <button class="btn alt" data-act="hist">Importar datas</button><p class="note" id="histmsg"></p></div>
  <div class="card"><h2>Dados</h2><p class="mute small">Tudo fica só neste aparelho. Faça backup de vez em quando.</p>
    <button class="btn alt" data-act="export">Exportar backup (.json)</button><div style="height:8px"></div>
    <button class="btn alt" data-act="import">Importar backup</button><div style="height:8px"></div>
    <button class="btn danger" data-act="wipe">Apagar tudo</button></div>`;
}

function render() {
  $main.innerHTML = { hoje: vHoje, cal: vCal, eng: vEng, gest: vGest, ana: vAna, cfg: vCfg, guia: vGuia }[view]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
  if (view === 'gest') mount3d();
}

// ---------- registro do dia ----------
function openDay(date) {
  const L = structuredClone(S.logs[date] || {});
  const chips = (k, opts, multi) => `<div class="chips" data-k="${k}" data-multi="${multi ? 1 : 0}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; const on = multi ? (L[k] || []).includes(v) : L[k] === v; return `<button class="chip ${on ? 'on' : ''}" data-v="${v}">${l}</button>`; }).join('')}</div>`;
  $sheet.innerHTML = `<h1 class="cap">${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
    <label class="f">Fluxo</label>${chips('flow', FLOW)}
    <label class="f">Sintomas</label>${chips('symptoms', SYMPTOMS, 1)}
    <label class="f">Humor</label>${chips('mood', MOODS, 1)}
    <label class="f">Muco cervical</label>${chips('mucus', MUCUS)}
    <div class="two"><div><label class="f">Temperatura basal (°C)</label><input id="temp" inputmode="decimal" placeholder="36,50" value="${L.temp ? String(L.temp).replace('.', ',') : ''}"></div>
    <div><label class="f">Teste de ovulação</label><div style="height:2px"></div>${chips('lh', LH)}</div></div>
    <label class="f">Teste de gravidez</label>${chips('test', ['Negativo', 'Positivo'])}
    <label class="f">Relação sexual</label>${chips('sex', SEX)}
    <label class="f">Anotações</label><textarea id="notes" rows="2">${esc(L.notes || '')}</textarea>
    <div style="height:14px"></div><button class="btn" data-act="save" data-d="${date}">Salvar</button><div style="height:8px"></div><button class="btn alt" data-act="close">Cancelar</button>`;
  $sheet.showModal();
}

function saveDay(date) {
  const L = {};
  $sheet.querySelectorAll('.chips').forEach(c => {
    const on = [...c.querySelectorAll('.chip.on')].map(x => x.dataset.v);
    if (on.length) L[c.dataset.k] = c.dataset.multi === '1' ? on : on[0];
  });
  const t = parseFloat($sheet.querySelector('#temp').value.replace(',', '.'));
  if (t >= 34 && t <= 42) L.temp = t;
  const n = $sheet.querySelector('#notes').value.trim();
  if (n) L.notes = n;
  if (Object.keys(L).length) S.logs[date] = L; else delete S.logs[date];
  save(); $sheet.close(); render();
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
function pregBanner() {
  const g = pregInfo();
  if (!g) return '';
  return `<div class="card" style="background:var(--green-l)"><div class="row" style="border:0"><span><b>🤰 Gestação: ${g.sem}s ${g.d}d</b><br><span class="mute small">${g.tri} · parto previsto ${fmt(g.dpp)}</span></span><button class="chip" data-go="gest">Ver</button></div></div>`;
}
const chk = (k, label) => `<button class="chk ${S.settings.checklist[k] ? 'on' : ''}" data-act="chk" data-k="${k}"><span class="bx">${S.settings.checklist[k] ? "✓" : ""}</span><span>${label}</span></button>`;

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
  ['sint', 'Sintomas comuns', '#8fbfe6', '🤢', 'Enjoo, cansaço, seios sensíveis, vontade de urinar com frequência, aversão a cheiros, oscilação de humor e cólicas leves são comuns no início.<br><br><b>Procure atendimento</b> se tiver sangramento, dor forte ou de um lado só, febre ou vômitos que impedem de comer e beber.'],
  ['naus', 'Náuseas: o que ajuda', '#e99a63', '🍋', '• Biscoito de água e sal antes de levantar<br>• Refeições pequenas, a cada 2–3 horas<br>• Gengibre, líquidos gelados em goles<br>• Evite jejum longo e cheiros que incomodam<br>• Vitamina B6 ou remédios para enjoo só com orientação médica<br><br>Vômitos o dia todo, perda de peso ou desidratação: procure seu médico (pode ser hiperêmese).'],
  ['cons', 'Guia da primeira consulta', '#12706b', '📋', '<b>Leve:</b> data da última menstruação e o histórico de ciclos (este app mostra), remédios e suplementos em uso, exames e vacinas anteriores, histórico familiar.<br><br><b>Pergunte:</b> ultrassom para datar a gestação, quais exames fazer, dose de ácido fólico, atividade física, viagens e o que evitar.<br><br>Com ciclo irregular, peça o ultrassom precoce para confirmar a data provável do parto.'],
  ['nutr', 'Nutrientes indispensáveis', '#4f5675', '🥬', 'Ácido fólico (formação do tubo neural), ferro (anemia), cálcio, vitamina D, iodo e ômega-3/DHA.<br><br>Prefira alimentos variados; suplementos só conforme prescrição. Evite álcool, peixes com muito mercúrio, carnes e ovos crus e queijos não pasteurizados.'],
  ['alert', 'Sinais de alerta', '#d2506f', '⚠️', 'Procure atendimento urgente se tiver: sangramento, perda de líquido, dor abdominal forte, febre, dor de cabeça intensa com visão turva, inchaço súbito no rosto ou mãos, ou redução dos movimentos do bebê (a partir do 3º trimestre).']
];
let INFO = {};

const ITEM = {4:['uma semente de papoula','•'],5:['uma semente de gergelim','•'],6:['um grão de lentilha','🟤'],7:['um grão de feijão','🫘'],8:['um mirtilo grande','🫐'],9:['uma azeitona','🫒'],10:['uma uva grande','🍇'],11:['um morango','🍓'],12:['um limão','🍋'],13:['um pêssego','🍑'],14:['um tomate','🍅'],15:['uma maçã','🍎'],16:['um abacate','🥑'],17:['uma pera','🍐'],18:['uma batata-doce','🍠'],19:['uma manga','🥭'],20:['uma banana','🍌'],21:['uma cenoura grande','🥕'],22:['um pepino','🥒'],23:['uma manga grande','🥭'],24:['uma espiga de milho','🌽'],25:['uma couve-flor','🥦'],26:['uma alface','🥬'],27:['um repolho pequeno','🥬'],28:['uma berinjela','🍆'],29:['uma abóbora pequena','🎃'],30:['um repolho grande','🥬'],31:['um coco','🥥'],32:['um abacaxi pequeno','🍍'],33:['um abacaxi','🍍'],34:['um melão cantalupo','🍈'],35:['um melão','🍈'],36:['uma alface-romana grande','🥬'],37:['uma acelga','🥬'],38:['um alho-poró','🧅'],39:['uma abóbora','🎃'],40:['uma melancia pequena','🍉']};
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
  <div class="card"><h2>Desenvolvimento</h2>${done.map(m => `<p class="ms done"><b>✓ ${m[0]}ª sem.</b> ${m[1]}</p>`).join('') || '<p class="mute">O desenvolvimento começa agora.</p>'}${next ? `<p class="ms"><b>Próximo · ${next[0]}ª sem.</b> ${next[1]}</p>` : ''}<p class="note">Ilustração e marcos aproximados; cada bebê tem seu ritmo.</p></div>`;
}

function vGest() {
  const g = pregInfo(), last = analyze().g.at(-1);
  if (!g) return `<h1>Gestação 🤰</h1><div class="card"><p>Já está grávida? Informe uma das datas e eu acompanho semana a semana: tamanho do bebê, desenvolvimento, exames e contagem para o parto.</p>
    <label class="f">Data da última menstruação (DUM)</label><input type="date" id="dum" value="${last ? last.start : ''}" max="${TODAY}">
    <label class="f">…ou Data provável do parto (DPP)</label><input type="date" id="dpp">
    <div style="height:12px"></div><button class="btn" data-act="startpreg">Iniciar acompanhamento</button>
    <p class="note">Com ciclos irregulares a DUM pode errar por semanas: se você já fez ultrassom, prefira a DPP informada pelo médico.</p></div>`;
  const wk = Math.min(Math.max(g.sem, 4), 40), info = WEEKS[wk], tn = g.sem < 14 ? 1 : g.sem < 28 ? 2 : 3;
  const dow = D(TODAY).getDay(), wstart = add(TODAY, -dow);
  const strip = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((n, i) => { const d = add(wstart, i), L = S.logs[d] || {}; return `<button class="wd ${d === TODAY ? 'now' : ''}" data-act="log" data-d="${d}"><small>${d === TODAY ? 'HOJE' : n}</small><b>${D(d).getDate()}</b><i>${L.sex && L.sex !== 'Não' ? '♥' : ''}</i></button>`; }).join('');
  INFO = {
    det: ['Detalhes', `<div class="stats"><div><div class="mute small">Idade gestacional</div><div class="big">${g.sem}s ${g.d}d</div></div><div><div class="mute small">Trimestre</div><div class="big">${tn}º</div></div><div><div class="mute small">Parto previsto</div><div class="big" style="font-size:16px">${fmt(g.dpp, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div><div class="mute small">Faltam</div><div class="big">${Math.max(g.left, 0)} dias</div></div><div><div class="mute small">Tamanho do bebê</div><div class="big" style="font-size:16px">${fmtSize(wk)}</div></div><div><div class="mute small">Compara-se a</div><div class="big" style="font-size:16px">${ITEM[wk][0]}</div></div></div><p class="note">DUM considerada: ${fmt(g.dum, { day: 'numeric', month: 'long', year: 'numeric' })}. Medidas aproximadas (comprimento até a 19ª semana: cabeça–nádega; depois, cabeça–pés). Com ciclo irregular, confirme a data pelo ultrassom do 1º trimestre.</p>`],
    baby: ['Bebê · ' + g.sem + ' semanas', `<p class="big" style="margin:0 0 6px">${fmtSize(wk)}</p><p>Do tamanho de <b>${ITEM[wk][0]}</b> ${ITEM[wk][1]}.</p><p>${info[1]}</p><p class="note">Tamanhos são médias aproximadas.</p>`],
    body: ['Seu corpo', `<p>${BODY[tn]}</p><p class="note">Cada gestação é diferente. Qualquer sintoma que preocupe, converse com seu médico.</p>`],
    food: ['Alimentação', `<p>${FOOD[tn]}</p><p class="note">Suplementos e doses: apenas conforme prescrição médica.</p>`]
  };
  DAILY.forEach(([k, t, , , h]) => INFO[k] = [t, `<p>${h}</p><p class="note">Informação geral, não substitui orientação médica.</p>`]);
  const cards = DAILY.map(([k, t, c, e]) => `<button class="dc" style="background:${c}" data-act="info" data-k="${k}"><b>${t}</b><span>${e}</span></button>`).join('');
  const exams = EXAMS.map(([a, b, t], i) => {
    const st = g.sem > b ? 'past' : g.sem >= a ? 'now' : 'next';
    return `<div class="exam ${st}">${chk('x' + i, `<span class="pill ${st === 'now' ? 'p-fertil' : 'p-folicular'}" style="margin-right:6px">${a}–${b}s</span>${t}`)}</div>`;
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
  <div class="card"><h2>Exames e consultas</h2>${exams}<p class="note">Roteiro geral do pré-natal. Siga sempre as orientações do seu médico. Com ciclo irregular, confirme a data pelo ultrassom do 1º trimestre.</p></div>
  <button class="btn" data-act="log" data-d="${TODAY}">Registrar sintomas de hoje</button><div style="height:8px"></div>
  <button class="btn danger" data-act="endpreg">Encerrar acompanhamento</button>`;
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
  const F = nextPeriod(A), beyond = TODAY > F.to, pc = pregCheck(A);
  const lhDay = Math.max(5, (A.n ? A.min : A.lo) - 17), lhDate = add(last.start, lhDay - 1);
  const ovLo = add(last.start, A.lo - A.luteal), ovHi = add(last.start, A.hi - A.luteal);
  let plan;
  if (f?.ev) plan = `<div class="row"><span>Ovulação ${f.level2} (${ovSrc(last.start, TODAY)})</span><b>${fmt(f.ov)}</b></div><div class="row"><span>Janela fértil</span><b>${fmt(add(f.ov, -5))} – ${fmt(add(f.ov, 1))}</b></div><div class="row"><span class="green">Melhores dias</span><b style="color:var(--green)">${fmt(add(f.ov, -2))} – ${fmt(f.ov)}</b></div><div class="row"><span>Teste de gravidez a partir de</span><b>${fmt(F.center)}</b></div><p class="note">A menstruação costuma vir ~${A.luteal} dias após a ovulação (previsão: ${fmt(F.from)} a ${fmt(F.to)}). ${f.level2 === 'confirmada' ? '' : 'Com um teste de LH positivo ou a subida da temperatura, a previsão fica mais precisa.'}</p>`;
  else if (beyond) plan = `<p class="mute" style="margin:0">Seu ciclo está mais longo que o seu padrão, então não dá para projetar a ovulação pelo calendário. ${pc?.hasNeg ? 'Com o teste negativo, o caminho é usar o teste de LH diário para ver se e quando você vai ovular.' : 'Faça um teste de gravidez; se negativo, use o teste de LH diário para ver se e quando você vai ovular.'}</p>`;
  else plan = `<div class="row"><span>Ovulação provável entre</span><b>${fmt(ovLo)} – ${fmt(ovHi)}</b></div><div class="row"><span>Começar teste de LH em</span><b>${diff(lhDate, TODAY) > 0 ? `${fmt(lhDate)} (dia ${lhDay})` : 'hoje, 1–2x ao dia'}</b></div><div class="row"><span>Teste de gravidez a partir de</span><b>${fmt(F.from)}</b></div><p class="note">${A.hi - A.lo > 6 ? `Seu ciclo varia de ${A.lo} a ${A.hi} dias, então a ovulação pode cair em qualquer ponto dessa faixa. Quando o teste de LH der positivo, tenha relações nesse dia e nos 2 seguintes (e a cada 1–2 dias antes). Registrar o LH aqui faz o app calcular a sua menstruação com precisão.` : 'Confirme com teste de LH, muco e temperatura.'}</p>`;
  let tries = 0;
  if (f?.ov) for (let d = add(f.ov, -5); d <= add(f.ov, 1); d = add(d, 1)) if (S.logs[d]?.sex && S.logs[d].sex !== 'Não') tries++;
  const color = f && ['Alta', 'Muito alta'].includes(f.level) ? 'var(--green)' : f?.level === 'Média' ? 'var(--amber)' : 'var(--mute)';
  return `<h1>Engravidar 🌱</h1>
  <div class="card hero"><div class="mute">Chance de gravidez hoje</div><div style="font-size:36px;font-weight:800;color:${color}">${f ? f.level : '—'}</div><p class="mute">${f ? f.txt : ''}.</p>
    ${beyond ? (pc?.hasNeg ? `<p class="mute">Teste negativo em ${fmt(pc.lastNeg)}. ${pc.line}</p>` : `<p style="color:var(--pink);font-weight:700">Ciclo fora do seu padrão — faça um teste de gravidez.</p>`) + `<button class="btn alt" data-go="gest">Positivo? Iniciar acompanhamento</button>` : ''}</div>
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
function dialog(html) { $sheet.innerHTML = html + '<div style="height:12px"></div><button class="btn alt" data-act="close">Fechar</button>'; if (!$sheet.open) $sheet.showModal(); }
const notify = msg => dialog(`<p style="font-size:17px">${msg}</p>`);
function ask(msg, yes, fn) { pending = fn; $sheet.innerHTML = `<p style="font-size:17px">${msg}</p><button class="btn" data-act="yes">${yes}</button><div style="height:8px"></div><button class="btn alt" data-act="close">Cancelar</button>`; if (!$sheet.open) $sheet.showModal(); }
const bkmsg = t => { const el = document.getElementById('bkmsg'); if (el) el.textContent = t; };
function doImport(txt) {
  try { const x = JSON.parse(txt); if (!x.logs) throw 0; S = norm(x); save(); $sheet.close(); render(); } catch { bkmsg('Backup inválido: confira se colou o texto inteiro.'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.go) { view = t.dataset.go; gv = null; render(); scrollTo(0, 0); return; }
  if (t.dataset.tab) { view = t.dataset.tab; gv = null; render(); scrollTo(0, 0); return; }
  const chip = t.closest('.chip') && t;
  if (chip) {
    const wrap = chip.parentElement;
    if (wrap.dataset.multi === '1') chip.classList.toggle('on');
    else { const was = chip.classList.contains('on'); wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); if (!was) chip.classList.add('on'); }
    return;
  }
  switch (t.dataset.act) {
    case 'log': openDay(t.dataset.d); break;
    case 'save': saveDay(t.dataset.d); break;
    case 'chk': { const k = t.dataset.k, y = scrollY; S.settings.checklist[k] = !S.settings.checklist[k]; save(); render(); scrollTo(0, y); break; }
    case 'startpreg': {
      const dpp = document.getElementById('dpp').value, dum = document.getElementById('dum').value;
      const d = dpp ? add(dpp, -280) : dum;
      if (!d) { notify('Informe a DUM ou a DPP.'); break; }
      S.settings.pregnancy = { dum: d }; save(); render(); break;
    }
    case 'endpreg': ask('Encerrar o acompanhamento da gestação?', 'Encerrar', () => { S.settings.pregnancy = null; save(); render(); }); break;
    case 'yes': { const f = pending; pending = null; $sheet.close(); if (f) f(); break; }
    case 'info': {
      const [title, html] = INFO[t.dataset.k];
      $sheet.innerHTML = `<h1>${title}</h1>${html}<div style="height:12px"></div><button class="btn alt" data-act="close">Fechar</button>`;
      $sheet.showModal(); break;
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
  document.getElementById('wk-cards').innerHTML = weekCards(gv);
});
$sheet.addEventListener('click', e => { if (e.target === $sheet) $sheet.close(); });

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

// se o app ficou aberto de um dia para o outro, recarrega para atualizar "hoje"
document.addEventListener('visibilitychange', () => { if (!document.hidden && iso(new Date()) !== TODAY) location.reload(); });
