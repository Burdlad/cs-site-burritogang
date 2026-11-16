// Best-effort HLTV sync. Fills data/events/<id>.json with real Swiss results + playoff results.
// Needs: npm i hltv, and each stage's "hltvEventId" set in the event file (HLTV lists each stage as its own event).
// HLTV sits behind Cloudflare; if it blocks the runner this exits without changing anything.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SW = require('../swiss.js'), B = require('../bracket.js');
const FILE = process.argv[2] || 'data/events/pgl-singapore-2026.json';
const ev = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let H;
try { const m = await import('hltv'); H = m.default?.default || m.default || m.HLTV || m; } catch { console.log('hltv package not installed; nothing to do'); process.exit(0); }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const alias = new Map(); ev.teams.forEach(t => [t.name, t.tag, ...(t.aliases || [])].forEach(a => alias.set(norm(a), t.name)));
const seedIdx = new Map(ev.seeds.map((n, i) => [n, i])), seed = n => seedIdx.has(n) ? seedIdx.get(n) : 999;

let matches = [], playoffs = [], prev = null, slotsFinal = null;
for (let i = 0; i < ev.stages.length; i++) {
  const st = ev.stages[i];
  const teams = (i === 0 ? st.entrants.slice() : (prev ? prev.concat(st.entrants) : null));
  if (!st.hltvEventId || !teams) { prev = null; matches.push(...ev.matches.filter(m => m.stage === st.id)); continue; }
  let results;
  try { results = await H.getResults({ eventIds: [Number(st.hltvEventId)], delayBetweenPageRequests: 1500 }); }
  catch (e) { console.log(`${st.name}: HLTV request failed (${e.message}); keeping existing data`); prev = null; matches.push(...ev.matches.filter(m => m.stage === st.id)); continue; }
  const series = results.map(r => {
    const a = alias.get(norm(r.team1 && r.team1.name)), b = alias.get(norm(r.team2 && r.team2.name));
    const s1 = Number(r.result && r.result.team1), s2 = Number(r.result && r.result.team2);
    if (!a || !b || isNaN(s1) || isNaN(s2) || s1 === s2) return null;
    return { a, b, winner: s1 > s2 ? a : b, score: Math.max(s1, s2) + '-' + Math.min(s1, s2), date: r.date || 0 };
  }).filter(Boolean).sort((x, y) => x.date - y.date);
  teams.sort((x, y) => seed(x) - seed(y));
  const { swiss, playoffs: po } = SW.classify(teams, series);
  matches.push(...swiss.map(m => Object.assign({ stage: st.id }, m)));
  const run = SW.run({ teams, seeds: seed, real: swiss });
  prev = run.complete ? run.advanced : null;
  if (po.length) { slotsFinal = SW.playoffSlots(run); playoffs = po; }
  console.log(`${st.name}: ${series.length} results, ${swiss.length} Swiss`);
}
const results = {};
if (slotsFinal) {
  const off = { slots: slotsFinal, results: {} };
  for (const s of playoffs) {
    const t = B.resolve(off.slots, B.officialWinners(off));
    const m = B.ORDER.find(k => !off.results[k] && t[k].includes(s.a) && t[k].includes(s.b));
    if (m) off.results[m] = { winner: s.winner, score: s.score, source: 'hltv' };
  }
  Object.assign(results, B.cleanOfficial(off).results);
}
const next = Object.assign({}, ev, { matches, playoffs: { slots: ev.playoffs.slots, results: slotsFinal ? results : ev.playoffs.results } });
const out = JSON.stringify(next, null, 1);
if (out !== JSON.stringify(ev, null, 1)) { fs.writeFileSync(FILE, out); console.log('updated', FILE); } else console.log('no changes');
