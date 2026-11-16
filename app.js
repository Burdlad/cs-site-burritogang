(() => {
'use strict';
const B = window.Bracket, SW = window.Swiss;
const $app = document.getElementById('app');
let EVENTS = [], EV = null, RAW = {}, RUNS = null, handler = null;
let stageSel = {}, simTab = 0, simOpen = false, SIM = null;

// ---------- utils ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const isAdmin = () => !!lsGet('bg_admin_mode', false);
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
function toast(msg, err) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2800); }
const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); } catch { prompt('Copy this:', text); } };
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const DAY = 864e5;
const t0 = d => Date.parse(d + 'T00:00:00Z');
function status(e) {
  if (!e.start || !e.end) return 'done';
  const n = Date.now();
  if (n < t0(e.start)) return 'upcoming';
  if (n > t0(e.end) + DAY) return 'done';
  return 'live';
}
const chipFor = s => s === 'live' ? '<span class="chip live">● LIVE</span>' : s === 'upcoming' ? '<span class="chip up">Upcoming</span>' : '<span class="chip done">Completed</span>';
const fmtRange = e => { if (!e.start) return ''; const f = d => new Date(t0(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); return f(e.start) + ' – ' + f(e.end) + ', ' + e.end.slice(0, 4); };
const teamInfo = n => EV && EV.teams.find(t => t.name === n);
const badge = (n, cls = '') => { const t = teamInfo(n); return `<span class="badge ${cls}" style="--h:${hue(n)}" title="${esc(n)}">${esc(t ? t.tag : String(n).slice(0, 4).toUpperCase())}</span>`; };
const PH = '<span class="badge q">?</span>';

// ---------- data ----------
async function loadEvents() { const r = await fetch('data/events.json?t=' + Date.now()); EVENTS = await r.json(); }
async function loadEvent(id) {
  const r = await fetch(`data/events/${id}.json?t=${Date.now()}`); if (!r.ok) return null;
  const pub = await r.json(); RAW[id] = JSON.stringify(pub);
  const draft = isAdmin() && lsGet('bg_draft_' + id, null);
  return draft || pub;
}
const seedFn = ev => { const m = new Map(ev.seeds.map((n, i) => [n, i])); return n => m.has(n) ? m.get(n) : 999; };
function runAll(ev, picks) {
  const seed = seedFn(ev), runs = [], lists = [];
  ev.stages.forEach((st, i) => {
    const real = ev.matches.filter(m => m.stage === st.id);
    let teams = null;
    if (i === 0) teams = st.entrants.slice();
    else { const p = runs[i - 1]; if (p && p.advanced.length === 8) teams = p.advanced.concat(st.entrants); }
    if (!teams && real.some(m => m.round === 1)) { const set = new Set(st.entrants); real.forEach(m => { set.add(m.a); set.add(m.b); }); teams = [...set]; }
    if (teams) teams.sort((a, b) => seed(a) - seed(b));
    lists.push(teams);
    runs.push(teams ? SW.run({ teams, seeds: seed, real, picks: (picks && picks[st.id]) || {} }) : null);
  });
  return { runs, lists };
}
const EMPTY_RUN = () => SW.run({ teams: [] });
function poOfficial(ev, runs) {
  const slots = ev.playoffs.slots || SW.playoffSlots(runs[runs.length - 1]) || Array(8).fill(null);
  return B.cleanOfficial(JSON.parse(JSON.stringify({ slots, results: ev.playoffs.results || {} })));
}
function stageState(run) {
  if (!run) return 'upcoming';
  const n = run.rounds.reduce((a, R) => a + R.groups.reduce((b, g) => b + g.matches.filter(m => m.real && m.winner).length, 0), 0);
  return run.complete ? 'done' : n ? 'live' : 'upcoming';
}

// ---------- swiss board ----------
function smHTML(m, o) {
  const tm = t => {
    const c = ['tm'];
    if (m.winner) { if (m.winner === t) c.push(m.src === 'real' ? 'win' : 'pick'); else c.push('lose'); }
    if (m.replaced && m.pick === t) c.push('rep');
    const click = o.mode === 'sim' && m.src !== 'real';
    if (click) c.push('click');
    return `<button class="${c.join(' ')}" ${click ? `data-sm="${esc(m.key)}" data-t="${esc(t)}" data-stage="${o.stage}"` : 'tabindex="-1"'} title="${esc(t)}${m.replaced && m.pick === t ? ' — your pick, replaced by the real result' : ''}">${badge(t)}</button>`;
  };
  const mid = m.score && m.src === 'real' ? `<span class="vs sc">${esc(m.score)}</span>` : '<span class="vs">vs</span>';
  return `<div class="sm">${tm(m.a)}${mid}${tm(m.b)}</div>`;
}
function grpHTML(g, o) {
  const list = o.mode === 'live' ? g.matches.filter(m => m.real) : g.matches;
  let rows = list.map(m => smHTML(m, o)).join('');
  for (let i = list.length; i < g.n; i++) rows += `<div class="sm tbd">${PH}<span class="vs">vs</span>${PH}</div>`;
  return `<div class="grp"><div class="glabel">${g.w}:${g.l}</div><div class="gbox">${rows}</div></div>`;
}
function endBox(run, keys, cls, sizes) {
  const body = keys.map((k, i) => {
    let h = (run.out[k] || []).map(t => `<span class="tm">${badge(t)}</span>`).join('');
    for (let j = (run.out[k] || []).length; j < sizes[i]; j++) h += `<span class="tm ph">${PH}</span>`;
    return `<h5>${k.replace('-', ':')}</h5><div class="endrow">${h}</div>`;
  }).join('');
  return `<div class="grp"><div class="endbox ${cls}">${body}</div></div>`;
}
function ctlHTML(r) { return `<div class="ctl"><button data-ctl="reset" data-round="${r}">Reset</button><button data-ctl="rand" data-round="${r}" title="Random winners">⚄</button><button data-ctl="seed" data-round="${r}">Higher seed</button></div>`; }
function swissHTML(run, o) {
  run = run || EMPTY_RUN();
  const cols = [];
  for (let r = 1; r <= 5; r++) {
    const R = run.rounds[r - 1]; let inner = '';
    if (r === 4) inner += endBox(run, ['3-0'], 'adv', [2]);
    if (r === 5) inner += endBox(run, ['3-1', '3-2'], 'adv', [3, 3]);
    inner += R.groups.map(g => grpHTML(g, o)).join('');
    if (r === 4) inner += endBox(run, ['0-3'], 'out', [2]);
    if (r === 5) inner += endBox(run, ['1-3', '2-3'], 'out', [3, 3]);
    cols.push(`<div class="scol">${o.mode === 'sim' ? ctlHTML(r) : ''}${inner}</div>`);
  }
  return `<div class="scroll"><div class="swiss">${cols.join('')}</div></div>`;
}

// ---------- playoffs bracket ----------
function pMatch(m, teams, o) {
  const res = o.official.results[m], w = o.winners[m];
  const rows = teams.map(t => {
    const c = ['team']; if (!t) c.push('empty');
    let mark = '';
    if (t && w === t) c.push(res ? 'actual' : 'picked');
    if (res && t === w) mark = '<span class="mark">WON</span>';
    const click = o.editable && t && (o.mode === 'sim' ? !res : teams.filter(Boolean).length === 2);
    if (click) c.push('click');
    return `<div class="${c.join(' ')}" ${click ? `data-pm="${m}" data-team="${esc(t)}"` : ''}>${t ? badge(t) : ''}<span class="name">${t ? esc(t) : 'TBD'}</span>${mark}</div>`;
  }).join('');
  const sc = res && res.score ? esc(res.score) : '';
  let tools = '';
  if (o.mode === 'official' && o.editable && teams.filter(Boolean).length === 2) tools = `<div class="mtools">Score <input class="score-in" id="sc-${m}" placeholder="2-1" value="${sc}" maxlength="8">${res ? `<button class="btn sm" data-pclear="${m}">clear</button>` : '<span>then click the winner</span>'}</div>`;
  return `<div class="match"><div class="mlabel"><span>${B.LABEL[m]}</span><span>${sc}</span></div>${rows}${tools}</div>`;
}
function bracketHTML(o) {
  const t = B.resolve(o.slots, o.winners), M = m => pMatch(m, t[m], o);
  const champ = o.winners.F ? `<div class="champ">🏆 ${esc(o.winners.F)}</div>` : '';
  return `<div class="scroll"><div class="bracket">
    <div class="col"><h4>Quarterfinals · Bo3</h4><div class="pairs"><div class="pair join">${M('QF1')}${M('QF2')}</div><div class="pair join">${M('QF3')}${M('QF4')}</div></div></div>
    <div class="col"><h4>Semifinals · Bo3</h4><div class="pairs"><div class="pair join">${M('SF1')}${M('SF2')}</div></div></div>
    <div class="col"><h4>Grand Final · Bo5</h4><div class="pairs"><div class="pair single">${M('F')}${champ}</div></div></div>
  </div><div class="third">${M('T')}</div></div>`;
}

// ---------- views ----------
function viewEvents() {
  handler = null;
  const groups = { live: [], upcoming: [], done: [] };
  EVENTS.forEach(e => groups[status(e)].push(e));
  groups.upcoming.sort((a, b) => t0(a.start) - t0(b.start));
  const card = e => `<a class="evcard ${e.detail ? '' : 'dim'}" href="#/e/${e.id}">${chipFor(status(e))}<h3>${esc(e.name)}</h3><div class="note">${esc(fmtRange(e))}${e.start ? ' · ' : ''}${esc(e.location)} · ${e.teams} teams</div>${e.detail ? '<div class="note" style="margin-top:8px">Live board + simulator</div>' : '<div class="note" style="margin-top:8px">Info only</div>'}</a>`;
  const sect = (t, l) => l.length ? `<div class="sh">${t}</div><div class="evgrid">${l.map(card).join('')}</div>` : '';
  $app.innerHTML = `<div class="hero"><h1>CS2 <em>Majors</em></h1></div>${sect('Live now', groups.live)}${sect('Upcoming', groups.upcoming)}${sect('Completed', groups.done)}`;
}

function viewEvent(id, sub) {
  handler = null;
  const ev = EV;
  if (!ev) {
    const e = EVENTS.find(x => x.id === id);
    $app.innerHTML = e ? `<div class="hero"><div><h1>${esc(e.name)}</h1><div class="chips">${chipFor(status(e))}<span class="chip">${esc(fmtRange(e))}</span><span class="chip">${esc(e.location)}</span></div></div></div><div class="card"><p class="note">No stage data is loaded for this event yet. The live board and simulator are available for events with a data file in <code>data/events/</code>.</p></div>` : '<p class="muted pad">Event not found. <a href="#/events">All majors</a></p>';
    return;
  }
  const st = status(ev);
  const { runs } = RUNS;
  const sel = stageSel[ev.id] != null ? stageSel[ev.id] : (() => { let k = 0; runs.forEach((r, i) => { if (stageState(r) !== 'upcoming') k = i; }); return k; })();
  const stg = ev.stages[sel];
  const days = Math.ceil((t0(ev.start) - Date.now()) / DAY);
  const out = {}; runs.forEach((r, i) => r && r.eliminated.forEach(t => { out[t] = ev.stages[i].name; }));
  const po = poOfficial(ev, runs);
  const adm = isAdmin();
  const groupsHTML = ev.stages.map((s, i) => { const ss = stageState(runs[i]); return `<button class="gev ${i === sel ? 'on' : ''}" data-stage="${i}"><b>${esc(s.name)}</b><span>${esc(s.dates)}</span>${chipFor(ss === 'done' ? 'done' : ss === 'live' ? 'live' : 'upcoming').replace('Completed', 'Done')}</button>`; }).join('');
  const teamsHTML = ev.seeds.map((n, i) => { const entry = ev.stages.find(s => s.entrants.includes(n)); return `<div class="tcard ${out[n] ? 'elim' : ''}">${badge(n, 'lg')}<b>${esc(n)}</b><span>${out[n] ? 'Out · ' + esc(out[n]) : 'Starts ' + esc(entry ? entry.name.replace(' & Playoffs', '') : '')} · #${i + 1}</span></div>`; }).join('');
  $app.innerHTML = `
  <div class="hero"><div><h1>${esc(ev.name)}</h1><div class="chips">${chipFor(st)}<span class="chip">${esc(fmtRange(ev))}</span><span class="chip">${esc(ev.location)}</span><span class="chip">${esc(ev.prize)}</span>${st === 'upcoming' ? `<span class="chip up">Starts in ${days} day${days === 1 ? '' : 's'}</span>` : ''}</div></div>
    <div class="row"><button class="btn pri" id="opensim">Open simulator</button><a class="btn" href="${esc(ev.hltv)}" target="_blank" rel="noopener">HLTV</a></div></div>
  <div class="card"><h3>Grouped events</h3><div class="groups">${groupsHTML}</div></div>
  <div class="card"><h3><span>Group play · ${esc(stg.name.replace(' & Playoffs', ''))}</span><button class="btn sm" id="opensim2">Simulator</button></h3>
    ${swissHTML(runs[sel], { mode: 'live', stage: stg.id })}
    ${runs[sel] && stageState(runs[sel]) === 'upcoming' && !stg.entrants.length ? '' : `<p class="note" style="margin-top:8px">Only played matches are shown as pairs; the rest are filled in as results come in.</p>`}</div>
  ${sel === ev.stages.length - 1 ? `<div class="card"><h3>Playoffs${adm ? ' — admin: click a winner' : ''}</h3><div id="powrap">${bracketHTML({ slots: po.slots, winners: B.officialWinners(po), official: po, mode: 'official', editable: adm })}</div></div>` : ''}
  <div class="card"><h3>Teams attending</h3><div class="teams">${teamsHTML}</div><p class="note" style="margin-top:10px">${esc(ev.seedsNote || '')}</p></div>`;
  $app.querySelectorAll('[data-stage].gev').forEach(b => b.onclick = () => { stageSel[ev.id] = +b.dataset.stage; viewEvent(id); });
  const open = () => go('#/e/' + ev.id + '/sim');
  document.getElementById('opensim').onclick = open; document.getElementById('opensim2').onclick = open;
  if (adm) bindPlayoffAdmin(document.getElementById('powrap'));
}

// ---------- simulator ----------
const simKey = id => 'bg_sim_' + id;
function loadSim(id, code) {
  if (code) { try { const s = b64d(code); SIM = { picks: s.picks || {}, po: s.po || {} }; lsSet(simKey(id), SIM); return; } catch {} }
  SIM = lsGet(simKey(id), null) || { picks: {}, po: {} };
}
const saveSim = () => lsSet(simKey(EV.id), { picks: SIM.picks, po: SIM.po });
function openSimulator() {
  const ev = EV; if (!ev) return;
  const modal = document.getElementById('modal') || Object.assign(document.createElement('div'), { id: 'modal', className: 'modal' });
  if (!modal.parentNode) document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  paintSim(modal);
}
function closeSimulator() { const m = document.getElementById('modal'); if (m) m.remove(); document.body.style.overflow = ''; }
function paintSim(modal) {
  const ev = EV, tabs = ev.stages.map(s => s.name.replace(' & Playoffs', '')).concat(['Playoffs']);
  const sim = runAll(ev, SIM.picks);
  const isPO = simTab === ev.stages.length;
  let body = '';
  if (!isPO) {
    const run = sim.runs[simTab], st = ev.stages[simTab];
    body = run ? swissHTML(run, { mode: 'sim', stage: st.id }) : `<div class="lock"><h3>Finish the previous stage first</h3><p class="note">Stage ${simTab + 1} starts with the 8 teams that advance from Stage ${simTab}, joined by its 8 new entrants.</p></div>`;
  } else {
    const last = sim.runs[sim.runs.length - 1], slots = ev.playoffs.slots || SW.playoffSlots(last);
    if (!slots) body = '<div class="lock"><h3>Finish Stage 3 first</h3><p class="note">The 8 teams that go 3-0, 3-1 or 3-2 make the playoffs.</p></div>';
    else {
      const off = poOfficial(ev, sim.runs); off.slots = slots;
      const cleaned = B.cleanOfficial(off);
      const r = B.reconcile({ slots, picks: B.normalize(slots, SIM.po) }, cleaned);
      SIM._po = { slots, winners: r.picks, official: cleaned };
      body = bracketHTML({ slots, winners: r.picks, official: cleaned, mode: 'sim', editable: true }) + `<p class="note" style="margin-top:10px">Click a team to pick the winner. Real results replace your picks automatically${r.changes.length ? ` — ${r.changes.length} replaced so far` : ''}.</p>`;
    }
  }
  modal.innerHTML = `<div class="sheet"><button class="x" id="simx" aria-label="Close">✕</button><h2>Simulator for ${esc(ev.name)}</h2>
    <div class="stabs">${tabs.map((t, i) => `<button class="${i === simTab ? 'on' : ''}" data-tab="${i}">${esc(t)}</button>`).join('')}</div>${body}
    <div class="row" style="margin-top:16px;justify-content:space-between"><span class="note">Picks save automatically in this browser. Matches with a real result are locked to the real winner.</span>
    <span class="row"><button class="btn" id="simshare">Copy share link</button><button class="btn danger" id="simreset">Reset everything</button></span></div></div>`;
  modal.onclick = e => { if (e.target === modal) go('#/e/' + ev.id); };
  document.getElementById('simx').onclick = () => go('#/e/' + ev.id);
  modal.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { simTab = +b.dataset.tab; paintSim(modal); });
  document.getElementById('simshare').onclick = () => copy(location.origin + location.pathname + '#/e/' + ev.id + '/sim/' + b64e({ picks: SIM.picks, po: SIM.po }), 'Share link copied');
  document.getElementById('simreset').onclick = () => { if (confirm('Clear all your simulator picks?')) { SIM = { picks: {}, po: {} }; saveSim(); paintSim(modal); } };
  modal.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => {
    const st = b.dataset.stage; SIM.picks[st] = SIM.picks[st] || {};
    const k = b.dataset.sm, t = b.dataset.t;
    if (SIM.picks[st][k] === t) delete SIM.picks[st][k]; else SIM.picks[st][k] = t;
    saveSim(); paintSim(modal);
  });
  modal.querySelectorAll('[data-ctl]').forEach(b => b.onclick = () => {
    const st = ev.stages[simTab], run = sim.runs[simTab]; if (!run) return;
    const seed = seedFn(ev), r = +b.dataset.round, P = (SIM.picks[st.id] = SIM.picks[st.id] || {});
    if (b.dataset.ctl === 'reset') run.rounds.slice(r - 1).forEach(R => R.groups.forEach(g => g.matches.forEach(m => { if (m.src !== 'real') delete P[m.key]; })));
    else run.rounds[r - 1].groups.forEach(g => g.matches.forEach(m => {
      if (m.src === 'real') return;
      P[m.key] = b.dataset.ctl === 'seed' ? (seed(m.a) <= seed(m.b) ? m.a : m.b) : (Math.random() < .5 ? m.a : m.b);
    }));
    saveSim(); paintSim(modal);
  });
  modal.querySelectorAll('[data-pm]').forEach(el => el.onclick = () => {
    const s = SIM._po; SIM.po = B.setPick(s.slots, s.winners, el.dataset.pm, el.dataset.team); saveSim(); paintSim(modal);
  });
}

// ---------- admin ----------
function draft() { return JSON.parse(JSON.stringify(EV)); }
function saveDraft(ev) { ev.matches = ev.matches || []; lsSet('bg_draft_' + ev.id, ev); EV = ev; RUNS = runAll(EV); route(); }
function bindPlayoffAdmin(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('[data-pm]').forEach(el => el.onclick = () => {
    const m = el.dataset.pm, sc = document.getElementById('sc-' + m), ev = draft(), po = poOfficial(ev, RUNS.runs);
    po.results[m] = { winner: el.dataset.team, score: sc ? sc.value.replace(/[^0-9\-]/g, '').slice(0, 8) : '' };
    ev.playoffs = { slots: ev.playoffs.slots, results: B.cleanOfficial(po).results }; saveDraft(ev);
  });
  wrap.querySelectorAll('[data-pclear]').forEach(el => el.onclick = () => { const ev = draft(); delete ev.playoffs.results[el.dataset.pclear]; B.cleanOfficial({ slots: poOfficial(ev, RUNS.runs).slots, results: ev.playoffs.results }); saveDraft(ev); });
}
function viewAdmin() {
  handler = null; lsSet('bg_admin_mode', true);
  const ev = EV;
  if (!ev) { $app.innerHTML = '<div class="hero"><h1>Admin</h1></div><div class="card"><p class="note">Pick an event with data from the menu above.</p></div>'; return; }
  const hasDraft = !!lsGet('bg_draft_' + ev.id, null);
  const lists = RUNS.lists;
  const stOpts = ev.stages.map((s, i) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const rows = ev.matches.map((m, i) => `<tr><td>${esc(ev.stages.find(s => s.id === m.stage)?.name || m.stage)}</td><td>R${m.round}</td><td>${badge(m.a)} ${esc(m.a)} vs ${badge(m.b)} ${esc(m.b)}</td><td><b>${esc(m.winner)}</b> ${esc(m.score || '')}</td><td><button class="btn sm danger" data-del="${i}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="note">No real results yet.</td></tr>';
  $app.innerHTML = `
  <div class="hero"><div><h1>Admin <em>control room</em></h1><div class="chips">${chipFor(status(ev))}<span class="chip">${esc(ev.name)}</span>${hasDraft ? '<span class="chip live">Unpublished local draft</span>' : ''}</div></div><div class="row"><button class="btn" id="exit">Exit admin</button></div></div>
  <div class="card"><p class="note">This site is static, so edits here live in <b>your browser only</b> until you publish: <b>Copy event JSON</b> and paste it over <code>data/events/${esc(ev.id)}.json</code> on GitHub (file → pencil → Commit). Everyone sees it within a couple of minutes. Playoff results: open the event page while in admin mode and click winners.</p></div>
  <div class="card"><h3>Add a real Swiss result</h3><div class="row">
    <select id="a-stage">${stOpts}</select><select id="a-round">${[1, 2, 3, 4, 5].map(r => `<option value="${r}">Round ${r}</option>`).join('')}</select>
    <select id="a-a"></select><span class="note">vs</span><select id="a-b"></select>
    <select id="a-w"><option value="a">Team A won</option><option value="b">Team B won</option></select>
    <input id="a-s" placeholder="2-1" maxlength="8" style="width:70px"><button class="btn pri" id="a-add">Add</button></div>
    <p class="note" style="margin-top:8px">Enter the pairing exactly as played. Later pairings and records update from these.</p></div>
  <div class="card"><h3>Real results (${ev.matches.length})</h3><table><thead><tr><th>Stage</th><th>Rd</th><th>Match</th><th>Result</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="card"><h3>Publish</h3><div class="row"><button class="btn pri" id="copyj">Copy event JSON</button><button class="btn" id="dlj">Download</button><button class="btn danger" id="disc">Discard local draft</button></div></div>`;
  const fillTeams = () => {
    const i = ev.stages.findIndex(s => s.id === document.getElementById('a-stage').value);
    const names = (lists[i] || ev.stages[i].entrants.concat(i ? [] : [])).slice();
    if (i > 0) ev.seeds.forEach(n => { if (!names.includes(n)) names.push(n); });
    const o = names.map(n => `<option>${esc(n)}</option>`).join('');
    document.getElementById('a-a').innerHTML = o; document.getElementById('a-b').innerHTML = o;
    if (names.length > 1) document.getElementById('a-b').selectedIndex = 1;
  };
  fillTeams(); document.getElementById('a-stage').onchange = fillTeams;
  const on = (id, fn) => { document.getElementById(id).onclick = fn; };
  on('a-add', () => {
    const v = id => document.getElementById(id).value, a = v('a-a'), b = v('a-b');
    if (a === b) return toast('Pick two different teams', true);
    const d = draft(); d.matches.push({ stage: v('a-stage'), round: +v('a-round'), a, b, winner: v('a-w') === 'a' ? a : b, score: v('a-s').replace(/[^0-9\-]/g, '') });
    saveDraft(d); toast('Result added (local draft)');
  });
  $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const d = draft(); d.matches.splice(+b.dataset.del, 1); saveDraft(d); });
  const json = () => JSON.stringify(EV, null, 1);
  on('copyj', () => copy(json(), 'Event JSON copied'));
  on('dlj', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' })); a.download = ev.id + '.json'; a.click(); });
  on('disc', async () => { lsSet('bg_draft_' + ev.id, null); EV = await loadEvent(ev.id); RUNS = runAll(EV); route(); toast('Draft discarded'); });
  on('exit', async () => { lsSet('bg_admin_mode', false); EV = await loadEvent(ev.id); RUNS = runAll(EV); go('#/e/' + ev.id); });
}

// ---------- router ----------
function currentEventId() { const m = (location.hash || '').match(/^#\/e\/([\w-]+)/); return m ? m[1] : null; }
function pickDefault() {
  const det = EVENTS.filter(e => e.detail);
  return det.find(e => status(e) === 'live') || det.filter(e => status(e) === 'upcoming').sort((a, b) => t0(a.start) - t0(b.start))[0] || det[0] || EVENTS[0];
}
function fillSelect(curId) {
  const sel = document.getElementById('evsel');
  sel.innerHTML = EVENTS.map(e => `<option value="${e.id}" ${e.id === curId ? 'selected' : ''}>${status(e) === 'live' ? '● LIVE · ' : ''}${esc(e.name)}</option>`).join('');
  sel.onchange = () => go('#/e/' + sel.value);
}
async function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', h === a.getAttribute('href')));
  let m;
  if (h === '#/' || h === '') { const d = pickDefault(); if (d) { location.replace('#/e/' + d.id); } return; }
  if (h === '#/events') { closeSimulator(); fillSelect(null); return viewEvents(); }
  if (h === '#/admin') { const d = lsGet('bg_last_event', null) || (pickDefault() || {}).id; if (!EV || EV.id !== d) { EV = await loadEvent(d); RUNS = EV && runAll(EV); } fillSelect(d); return viewAdmin(); }
  if ((m = h.match(/^#\/e\/([\w-]+)(?:\/(sim)(?:\/([\w-]+))?)?$/))) {
    const id = m[1];
    if (!EV || EV.id !== id) { const info = EVENTS.find(e => e.id === id); EV = info && info.detail ? await loadEvent(id) : null; RUNS = EV && runAll(EV); }
    lsSet('bg_last_event', id); fillSelect(id);
    viewEvent(id);
    if (m[2] && EV) { if (!SIM || SIM._id !== id || m[3]) { loadSim(id, m[3]); SIM._id = id; } simOpen = true; openSimulator(); if (m[3]) history.replaceState(null, '', '#/e/' + id + '/sim'); }
    else { simOpen = false; closeSimulator(); }
    return;
  }
  location.replace('#/');
}
window.addEventListener('hashchange', route);

// Poll the published data files so an open page picks up new results.
setInterval(async () => {
  if (document.hidden || simOpen || isAdmin() || !EV) return;
  try {
    const before = RAW[EV.id]; const fresh = await loadEvent(EV.id);
    if (fresh && RAW[EV.id] !== before) { EV = fresh; RUNS = runAll(EV); viewEvent(EV.id); toast('Results updated'); }
    document.getElementById('conn').classList.add('on');
  } catch { document.getElementById('conn').classList.remove('on'); }
}, 30000);
(async () => {
  try { await loadEvents(); await route(); document.getElementById('conn').classList.add('on'); }
  catch (e) { $app.innerHTML = '<p class="muted pad">Couldn’t load the data files.</p>'; }
})();
})();
