(() => {
'use strict';
const B = window.Bracket;
const $app = document.getElementById('app');
let S = null;
let handler = null;     // click handler for the current bracket view
let homeTab = 'live';


// ---------- utils ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const isAdmin = () => !!lsGet('bg_admin_mode', false);
function toast(msg, err) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2800); }
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const team = n => S.teams.find(t => t.name === n);
const badge = n => `<span class="badge" style="--h:${hue(n)}">${esc(team(n) ? team(n).tag : String(n).slice(0, 3).toUpperCase())}</span>`;
const ago = ts => { if (!ts) return ''; const s = Math.max(1, (Date.now() - ts) / 1000 | 0); return s < 60 ? s + 's ago' : s < 3600 ? (s / 60 | 0) + 'm ago' : s < 86400 ? (s / 3600 | 0) + 'h ago' : (s / 86400 | 0) + 'd ago'; };
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); } catch { prompt('Copy this:', text); } };

// ---------- data (static files in /data + this browser's localStorage) ----------
let FILES = null;
async function load() {
  const get = u => fetch(u + '?t=' + Date.now()).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
  const [t, off, lv] = await Promise.all([get('data/teams.json'), get('data/results.json'), get('data/live.json')]);
  FILES = { off, lv };
  build(t);
}
function build(t) {
  t = t || { event: S.event, teams: S.teams };
  const draftOff = lsGet('bg_draft_official', null), draftLive = lsGet('bg_draft_live', null);
  const official = B.cleanOfficial(JSON.parse(JSON.stringify(draftOff || FILES.off)));
  const lv = draftLive || FILES.lv;
  const r = B.reconcile({ slots: lv.slots, picks: lv.picks }, official);
  const stamp = official.updated || 0;
  const live = { id: 'live', name: lv.name || 'Live bracket', author: lv.author || 'Burrito Gang', live: true, slots: r.slots, picks: r.picks, record: r.record, changes: r.changes.map(c => Object.assign(c, { at: stamp })) };
  const mine = lsGet('bg_brackets', {});
  const list = [{ id: 'live', name: live.name, author: live.author, live: true, score: B.score(live, official), champion: live.picks.F || null, record: r.record }]
    .concat(Object.values(mine).map(b => ({ id: b.id, name: b.name, author: b.author, live: false, created: b.created, score: B.score(b, official), champion: b.picks.F || null })).sort((a, b) => b.score.pts - a.score.pts || b.score.maxPossible - a.score.maxPossible || a.created - b.created));
  S = { event: t.event, teams: t.teams, official, live, list, maxPoints: B.MAX_POINTS, drafts: { official: !!draftOff, live: !!draftLive } };
}
async function refresh() { await load(); render(); }

// ---------- bracket rendering ----------
function matchHTML(m, teams, o) {
  const res = o.official.results[m], w = o.winners[m];
  const lock = o.mode === 'pred' && !!res;
  const rows = teams.map(t => {
    const c = ['team'];
    if (!t) c.push('empty');
    if (t && w === t) c.push('picked');
    let mark = '';
    if (o.mode === 'pred' && res && t) {
      if (t === w) { c.push(res.winner === w ? 'correct' : 'wrong'); mark = res.winner === w ? '<span class="mark ok">✓</span>' : '<span class="mark no">✕</span>'; }
      else if (t === res.winner) { c.push('actual'); mark = '<span class="mark ok">WON</span>'; }
    }
    if (o.mode === 'official' && res && t === res.winner) { c.push('actual'); mark = '<span class="mark ok">WON</span>'; }
    const clickable = o.editable && t && !lock && (o.mode === 'pred' || teams.filter(Boolean).length === 2);
    if (clickable) c.push('click');
    const label = t ? esc(t) : (o.mode === 'pred' && m[0] === 'Q' ? 'Choose team' : 'TBD');
    return `<div class="${c.join(' ')}" ${clickable ? `data-m="${m}" data-team="${esc(t)}"` : ''}>${t ? badge(t) : ''}<span class="name">${label}</span>${mark}</div>`;
  }).join('');
  const sc = res && res.score ? esc(res.score) : '';
  let tools = '';
  if (o.mode === 'official' && o.editable && teams.filter(Boolean).length === 2) {
    tools = `<div class="mtools">Score <input class="score-in" id="sc-${m}" placeholder="2-1" value="${sc}" maxlength="8">${res ? `<button data-clear="${m}">clear</button>` : '<span>then click the winner</span>'}</div>`;
  }
  return `<div class="match"><div class="mlabel"><span>${B.LABEL[m]}</span><span>${sc}</span></div>${rows}${tools}</div>`;
}
function bracketHTML(o) {
  const t = B.resolve(o.slots, o.winners);
  const M = m => matchHTML(m, t[m], o);
  const champ = o.winners.F ? `<div class="champ">🏆 ${esc(o.winners.F)}</div>` : '';
  return `<div class="scroll"><div class="bracket">
    <div class="col"><h4>Quarterfinals · Bo3</h4><div class="pairs"><div class="pair join">${M('QF1')}${M('QF2')}</div><div class="pair join">${M('QF3')}${M('QF4')}</div></div></div>
    <div class="col"><h4>Semifinals · Bo3</h4><div class="pairs"><div class="pair join">${M('SF1')}${M('SF2')}</div></div></div>
    <div class="col"><h4>Grand Final · Bo5</h4><div class="pairs"><div class="pair single">${M('F')}${champ}</div></div></div>
  </div><div class="third">${M('T')}</div></div>`;
}
function bindBracket(root) {
  root.querySelectorAll('[data-m][data-team]').forEach(el => el.onclick = () => handler && handler(el.dataset.m, el.dataset.team));
}

// ---------- shared bits ----------
function statusChips() {
  const n = Object.keys(S.official.results).length, start = Date.parse(S.event.playoffsStart);
  let c;
  if (S.official.results.F) c = '<span class="chip good">Complete</span>';
  else if (n) c = '<span class="chip live">● LIVE</span>';
  else { const d = Math.ceil((start - Date.now()) / 864e5); c = `<span class="chip">${d > 0 ? 'Playoffs in ' + d + ' day' + (d === 1 ? '' : 's') : 'Playoffs starting'}</span>`; }
  return `${c}<span class="chip">${esc(S.event.playoffs)}</span><span class="chip">${esc(S.event.venue)}</span>`;
}
function recordHTML(live) {
  const r = live.record || { hit: 0, miss: 0 }, d = r.hit + r.miss;
  if (!d) return '<span class="note">No matches decided yet.</span>';
  return `<div class="stat"><div><b>${r.hit}</b><span>Picks right</span></div><div><b>${r.miss}</b><span>Replaced</span></div><div><b>${d}</b><span>Decided</span></div></div>`;
}
function changesHTML(live) {
  const c = live.changes || [];
  if (!c.length) return '<p class="note">When a pick turns out wrong, it shows up here and the bracket updates itself.</p>';
  return '<ul class="changes">' + c.slice(0, 12).map(x => x.match === 'slots'
    ? `<li>${badge(x.from)} ${esc(x.from)} <span class="arrow">→</span> ${badge(x.to)} <b>${esc(x.to)}</b> <span class="note">playoff spot · ${ago(x.at)}</span></li>`
    : `<li><span class="chip">${esc(B.LABEL[x.match])}</span>${badge(x.from)} <s class="muted">${esc(x.from)}</s> <span class="arrow">→</span> ${badge(x.to)} <b>${esc(x.to)}</b> <span class="note">${ago(x.at)}</span></li>`).join('') + '</ul>';
}
function leaderboardHTML(limit) {
  const rows = S.list.slice(0, limit || 999).map((b, i) => {
    const s = b.score, pick = b.champion;
    return `<tr class="${b.live ? 'livetr' : ''}"><td>${b.live ? '●' : i}</td><td><a href="#/b/${b.id}"><b>${esc(b.name)}</b></a>${b.live ? ' <span class="chip live">LIVE</span>' : ''}<div class="note">${esc(b.author)}</div></td><td>${pick ? badge(pick) + ' ' + esc(pick) : '<span class="muted">—</span>'}</td><td class="num">${b.live ? (b.record ? b.record.hit + '/' + (b.record.hit + b.record.miss) : '-') : s.correct + '/' + s.decided}</td><td class="num"><b>${b.live ? '—' : s.pts}</b></td><td class="num">${b.live ? '—' : s.maxPossible}</td></tr>`;
  });
  return `<table><thead><tr><th>#</th><th>Bracket</th><th>Champion pick</th><th class="num">Right</th><th class="num">Pts</th><th class="num">Max</th></tr></thead><tbody>${rows.join('')}</tbody></table>
  <p class="note" style="margin-top:12px">Points: quarterfinal 1 · semifinal 2 · final 4 · third place 1 (max ${S.maxPoints}). Brackets made after a match is decided don’t score it.</p>`;
}

// ---------- views ----------
function viewHome() {
  handler = null;
  const live = S.live, off = S.official;
  const offReady = B.fixSlots(off.slots).some(Boolean);
  const offHTML = offReady ? bracketHTML({ slots: off.slots, winners: B.officialWinners(off), official: off, mode: 'official', editable: false }) : '<p class="muted pad">The official playoff teams haven’t been set yet — they’re locked in once Stage 3 finishes.</p>';
  $app.innerHTML = `
  <div class="hero"><div><h1>${esc(S.event.name)} <em>bracket</em></h1><div class="chips">${statusChips()}</div></div>
    <div class="row"><a class="btn pri" href="#/new">Build your bracket</a><a class="btn" href="#/brackets">All brackets</a></div></div>
  <div class="grid2"><div>
    <div class="card"><div class="tabs"><button class="tab ${homeTab === 'live' ? 'on' : ''}" data-tab="live">Live bracket</button><button class="tab ${homeTab === 'official' ? 'on' : ''}" data-tab="official">Official results</button></div>
      ${homeTab === 'live' ? bracketHTML({ slots: live.slots, winners: live.picks, official: off, mode: 'pred', editable: false }) + '<p class="note" style="margin-top:10px">Green = right, red = wrong. Wrong picks are swapped for the real winner automatically.</p>' : offHTML}
    </div></div>
    <div><div class="card"><h3>Live bracket record</h3>${recordHTML(live)}</div>
    <div class="card"><h3>Pick changes</h3>${changesHTML(live)}</div></div></div>
  <div class="card"><h3>Live bracket &amp; your brackets</h3>${leaderboardHTML(10)}</div>`;
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { homeTab = b.dataset.tab; viewHome(); });
}
function viewBrackets() {
  handler = null;
  $app.innerHTML = `<div class="hero"><h1>Your brackets</h1><a class="btn pri" href="#/new">+ New bracket</a></div><div class="card">${leaderboardHTML()}</div>`;
}

function commitDraft(off) { off.updated = Date.now(); lsSet('bg_draft_official', off); build(); render(); }
const curOff = () => JSON.parse(JSON.stringify({ slots: S.official.slots, results: S.official.results, updated: S.official.updated || 0 }));
const rid = () => Math.random().toString(36).slice(2, 10);

function viewEditor(D) {
  const off = S.official;
  const slotsLocked = B.fixSlots(off.slots).every(Boolean) || Object.keys(off.results).length > 0;
  const canEdit = D.canEdit;
  const opts = sel => {
    const groups = [3, 2, 1].map(st => `<optgroup label="Starts in Stage ${st}">${S.teams.filter(t => t.stage === st).map(t => `<option value="${esc(t.name)}" ${t.name === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
    return `<option value="">— choose —</option>${groups}`;
  };
  const slotSel = D.slots.map((t, i) => `<label>QF${(i >> 1) + 1} · ${i % 2 ? 'B' : 'A'}<select data-slot="${i}" ${canEdit && !slotsLocked ? '' : 'disabled'}>${opts(t)}</select></label>`).join('');
  $app.innerHTML = `
  <div class="hero"><div><h1>${D.isNew ? 'New bracket' : esc(D.name)}</h1><div class="chips">${D.live ? '<span class="chip live">LIVE</span>' : ''}${D.isNew ? '' : `<span class="chip">by ${esc(D.author || 'anon')}</span>`}${statusChips()}</div></div></div>
  <div class="grid2"><div><div class="card" id="bwrap"></div></div><div>
    <div class="card"><h3>${canEdit ? 'Your bracket' : 'Bracket'}</h3>
      <div class="field"><label>Name</label><input id="name" maxlength="40" value="${esc(D.name)}" ${canEdit ? '' : 'disabled'}></div>
      ${D.live ? '' : `<div class="field"><label>Your name</label><input id="author" maxlength="24" value="${esc(D.author)}" ${canEdit ? '' : 'disabled'}></div>`}
      <div class="row">${canEdit ? `<button class="btn pri" id="save">${D.isNew ? 'Save bracket' : 'Save changes'}</button>` : ''}${D.shared ? '<button class="btn pri" id="dupe">Save a copy to my browser</button>' : (!D.isNew ? `<button class="btn" id="dupe">${D.live ? 'Snapshot live bracket' : 'Make a copy'}</button>` : '')}${!D.isNew && !D.live ? '<button class="btn" id="share">Copy share link</button>' : ''}${D.live && canEdit ? '<button class="btn" id="copylive">Copy live.json</button>' : ''}${canEdit && !D.isNew && !D.live ? '<button class="btn danger" id="del">Delete</button>' : ''}</div>
      ${D.isNew ? `<p class="note" style="margin-top:12px">Brackets are saved in this browser. Use <b>Copy share link</b> afterwards to send one to friends.</p><div class="row" style="margin-top:8px"><button class="btn" id="fromlive">Start from the live bracket</button></div>` : ''}
      ${D.live && canEdit ? '<p class="note" style="margin-top:12px">Saved as a local draft. To publish it, click <b>Copy live.json</b> and paste it over <code>data/live.json</code> in the repo.</p>' : ''}
      ${D.live && !canEdit ? '<p class="note" style="margin-top:12px">The live bracket fixes itself as results are published.</p>' : ''}
    </div>
    <div class="card"><h3>Playoff teams</h3><div class="slots">${slotSel}</div>
      <p class="note" style="margin-top:10px">${slotsLocked ? 'Teams are locked now that the playoffs are set.' : 'Pick the 8 teams you think make the playoffs, in quarterfinal order. Then click winners in the bracket.'}</p></div>
    ${D.live ? `<div class="card"><h3>Record</h3>${recordHTML(S.live)}</div><div class="card"><h3>Pick changes</h3>${changesHTML(S.live)}</div>` : (D.score ? `<div class="card"><h3>Score</h3><div class="stat"><div><b>${D.score.pts}</b><span>Points</span></div><div><b>${D.score.correct}/${D.score.decided}</b><span>Right</span></div><div><b>${D.score.maxPossible}</b><span>Max possible</span></div></div></div>` : '')}
  </div></div>`;

  const paint = () => {
    const w = document.getElementById('bwrap');
    w.innerHTML = bracketHTML({ slots: D.slots, winners: D.picks, official: off, mode: 'pred', editable: canEdit }) +
      `<p class="note" style="margin-top:10px">${canEdit ? 'Click a team to pick it as the winner. Matches already decided are locked.' : ''}</p>`;
    bindBracket(w);
  };
  handler = (m, t) => { D.picks = B.setPick(D.slots, D.picks, m, t); paint(); };
  paint();
  $app.querySelectorAll('[data-slot]').forEach(sel => sel.onchange = () => {
    const r = B.setSlot(D.slots, D.picks, +sel.dataset.slot, sel.value || null);
    if (r.error) { toast('That team is already in the bracket', true); sel.value = D.slots[+sel.dataset.slot] || ''; return; }
    D.slots = r.slots; D.picks = r.picks; viewEditor(D);
  });
  const val = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = async () => { try { await fn(); } catch (e2) { toast(e2.message, true); } }; };
  const make = extra => {
    const id = rid();
    let slots = D.slots;
    if (B.fixSlots(off.slots).every(Boolean)) slots = off.slots.slice();
    const picks = Object.assign({}, D.picks);
    Object.keys(off.results).forEach(m => { picks[m] = off.results[m].winner; });
    const b = Object.assign({ id, name: val('name') || 'My bracket', author: val('author') || D.author || 'anon', slots, picks: B.normalize(slots, picks), baseline: Object.keys(off.results), created: Date.now() }, extra);
    const all = lsGet('bg_brackets', {}); all[id] = b; lsSet('bg_brackets', all);
    build(); go('#/b/' + id); toast('Bracket saved');
  };
  on('save', async () => {
    if (D.live) { lsSet('bg_draft_live', { name: val('name') || D.name, author: D.author, slots: D.slots, picks: D.picks }); build(); toast('Live bracket saved as a local draft'); return viewBracket('live'); }
    if (D.isNew) return make({});
    const all = lsGet('bg_brackets', {}), old = all[D.id];
    const picks = Object.assign({}, D.picks);
    Object.keys(off.results).forEach(m => { picks[m] = old.picks[m]; });
    all[D.id] = Object.assign(old, { name: val('name') || old.name, author: val('author') || old.author, picks: B.normalize(old.slots, picks), slots: slotsLocked ? old.slots : D.slots });
    lsSet('bg_brackets', all); build(); toast('Saved'); viewBracket(D.id);
  });
  on('dupe', async () => make({ name: (val('name') || 'Bracket') + (D.live ? ' (snapshot)' : D.shared ? '' : ' (copy)') }));
  on('del', async () => { if (!confirm('Delete this bracket?')) return; const all = lsGet('bg_brackets', {}); delete all[D.id]; lsSet('bg_brackets', all); build(); go('#/brackets'); });
  on('share', async () => copy(location.origin + location.pathname + '#/s/' + b64e({ name: D.name, author: D.author, slots: D.slots, picks: D.picks }), 'Share link copied'));
  on('copylive', async () => copy(JSON.stringify({ name: val('name') || D.name, author: D.author, slots: D.slots, picks: D.picks }, null, 2), 'live.json copied'));
  on('fromlive', async () => { D.slots = S.live.slots.slice(); D.picks = Object.assign({}, S.live.picks); viewEditor(D); });
}
function viewNew() {
  const off = S.official;
  const slots = B.fixSlots(B.fixSlots(off.slots).every(Boolean) ? off.slots : null);
  const picks = {};
  Object.keys(off.results).forEach(m => { picks[m] = off.results[m].winner; });
  viewEditor({ isNew: true, canEdit: true, name: 'My bracket', author: '', slots, picks: B.normalize(slots, picks) });
}
function viewBracket(id) {
  if (id === 'live') { const l = S.live; return viewEditor({ id: 'live', name: l.name, author: l.author, live: true, slots: B.fixSlots(l.slots), picks: l.picks, canEdit: isAdmin() }); }
  const b = lsGet('bg_brackets', {})[id];
  if (!b) { handler = null; $app.innerHTML = '<p class="muted pad">That bracket isn’t saved in this browser. Brackets live in the browser that made them — ask for a share link. <a href="#/brackets">Back</a></p>'; return; }
  viewEditor({ id: b.id, name: b.name, author: b.author, slots: B.fixSlots(b.slots), picks: b.picks, canEdit: true, score: B.score(b, S.official) });
}
function viewShared(code) {
  try {
    const b = b64d(code);
    const slots = B.fixSlots(b.slots), picks = B.normalize(slots, b.picks || {});
    viewEditor({ name: String(b.name || 'Shared bracket').slice(0, 40), author: String(b.author || '').slice(0, 24), shared: true, slots, picks, canEdit: false, score: B.score({ picks }, S.official) });
  } catch { $app.innerHTML = '<p class="muted pad">That share link is broken.</p>'; }
}

// ---------- admin ----------
function viewAdmin() {
  handler = null; lsSet('bg_admin_mode', true);
  const off = S.official;
  const opts = sel => [3, 2, 1].map(st => `<optgroup label="Stage ${st} entrants">${S.teams.filter(t => t.stage === st).map(t => `<option value="${esc(t.name)}" ${t.name === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  const slotSel = B.fixSlots(off.slots).map((t, i) => `<label>QF${(i >> 1) + 1} · ${i % 2 ? 'B' : 'A'}<select data-oslot="${i}"><option value="">—</option>${opts(t)}</select></label>`).join('');
  $app.innerHTML = `
  <div class="hero"><div><h1>Admin <em>control room</em></h1><div class="chips">${statusChips()}${S.drafts.official ? '<span class="chip live">Unpublished local draft</span>' : ''}</div></div><div class="row"><a class="btn" href="#/b/live">Edit live bracket</a></div></div>
  <div class="card"><p class="note">This site is static (GitHub Pages), so changes you make here live in <b>your browser only</b> until you publish them: click <b>Copy results.json</b> and paste it over <code>data/results.json</code> in the repo (GitHub → file → pencil icon → Commit). Everyone sees it within a minute or two.</p></div>
  <div class="grid2"><div><div class="card"><h3>Official bracket — click the winner of each match</h3><div id="owrap"></div></div></div>
  <div><div class="card"><h3>Official playoff teams</h3><div class="slots">${slotSel}</div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="saveslots">Save teams</button></div>
    <p class="note" style="margin-top:10px">The 8 Stage 3 qualifiers in quarterfinal order. The live bracket swaps in the real teams automatically.</p></div>
  <div class="card"><h3>Publish</h3><div class="row"><button class="btn pri" id="copyres">Copy results.json</button><button class="btn" id="dlres">Download</button></div>
    <div class="row" style="margin-top:10px"><button class="btn danger" id="reset">Clear results</button><button class="btn" id="discard">Discard local drafts</button></div></div></div></div>`;
  const wrap = document.getElementById('owrap');
  const paint = () => {
    wrap.innerHTML = bracketHTML({ slots: S.official.slots, winners: B.officialWinners(S.official), official: S.official, mode: 'official', editable: true });
    bindBracket(wrap);
    wrap.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { const o = curOff(); delete o.results[b.dataset.clear]; commitDraft(B.cleanOfficial(o)); });
  };
  handler = (m, t) => {
    const sc = document.getElementById('sc-' + m), o = curOff();
    o.results[m] = { winner: t, score: sc ? sc.value.replace(/[^0-9\-]/g, '').slice(0, 8) : '' };
    commitDraft(B.cleanOfficial(o)); toast(B.LABEL[m] + ': ' + t);
  };
  paint();
  const on = (id, fn) => { document.getElementById(id).onclick = fn; };
  const json = () => JSON.stringify(curOff(), null, 2);
  on('saveslots', () => {
    const slots = [...$app.querySelectorAll('[data-oslot]')].map(s => s.value || null);
    const seen = slots.filter(Boolean); if (new Set(seen).size !== seen.length) return toast('A team appears twice', true);
    const o = curOff(); o.slots = slots; commitDraft(B.cleanOfficial(o)); toast('Playoff teams saved (local draft)');
  });
  on('copyres', () => copy(json(), 'results.json copied — paste it into data/results.json'));
  on('dlres', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' })); a.download = 'results.json'; a.click(); });
  on('reset', () => { if (!confirm('Clear all official results (local draft)?')) return; const o = curOff(); o.results = {}; commitDraft(o); });
  on('discard', () => { lsSet('bg_draft_official', null); lsSet('bg_draft_live', null); build(); render(); toast('Drafts discarded'); });
}

// ---------- router ----------
function render() {
  if (!S) return;
  const h = location.hash || '#/';
  let m;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', h === a.getAttribute('href') || (a.dataset.r === 'brackets' && /^#\/(b|s)\//.test(h))));
  if ((m = h.match(/^#\/b\/([\w-]+)/))) return viewBracket(m[1]);
  if ((m = h.match(/^#\/s\/([\w-]+)/))) return viewShared(m[1]);
  if (h === '#/new') return viewNew();
  if (h === '#/brackets') return viewBrackets();
  if (h === '#/admin') return viewAdmin();
  viewHome();
}
window.addEventListener('hashchange', render);
// Poll the published data files so an open page picks up new results.
setInterval(async () => {
  if (document.hidden) return;
  const h = location.hash || '#/';
  if (h === '#/new' || h === '#/admin' || /^#\/b\//.test(h) && h !== '#/b/live') return;
  try { const before = JSON.stringify(FILES); await load(); if (JSON.stringify(FILES) !== before) { render(); toast('Results updated'); } } catch {}
}, 30000);
(async () => { try { await load(); render(); const dot = document.getElementById('conn'); if (dot) dot.classList.add('on'); } catch (e) { $app.innerHTML = '<p class="muted pad">Couldn’t load the data files.</p>'; } })();
})();
