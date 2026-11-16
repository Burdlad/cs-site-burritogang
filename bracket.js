/* Shared bracket logic (runs in Node and in the browser).
 * 8-team single elimination: QF1-4 -> SF1-2 -> F, plus T (third-place decider).
 * Slots are in QF order: QF1 = slots[0] v slots[1], QF2 = slots[2] v slots[3], ... */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bracket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ORDER = ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F', 'T'];
  const POINTS = { QF1: 1, QF2: 1, QF3: 1, QF4: 1, SF1: 2, SF2: 2, F: 4, T: 1 };
  const LABEL = {
    QF1: 'Quarterfinal 1', QF2: 'Quarterfinal 2', QF3: 'Quarterfinal 3', QF4: 'Quarterfinal 4',
    SF1: 'Semifinal 1', SF2: 'Semifinal 2', F: 'Grand Final', T: 'Third-place decider'
  };
  const MAX_POINTS = ORDER.reduce((a, m) => a + POINTS[m], 0);

  function fixSlots(slots) {
    const s = Array.isArray(slots) ? slots.slice(0, 8) : [];
    while (s.length < 8) s.push(null);
    return s.map(x => (typeof x === 'string' && x ? x : null));
  }

  // Which two teams meet in each match, given slots and a winners map.
  function resolve(slots, winners) {
    slots = fixSlots(slots); winners = winners || {};
    const t = {};
    for (let q = 1; q <= 4; q++) t['QF' + q] = [slots[(q - 1) * 2], slots[(q - 1) * 2 + 1]];
    t.SF1 = [winners.QF1 || null, winners.QF2 || null];
    t.SF2 = [winners.QF3 || null, winners.QF4 || null];
    t.F = [winners.SF1 || null, winners.SF2 || null];
    const loser = m => {
      const w = winners[m], [a, b] = t[m];
      return w && a && b ? (w === a ? b : a) : null;
    };
    t.T = [loser('SF1'), loser('SF2')];
    return t;
  }

  // Drop/repair picks that don't fit the bracket (a pick must be one of the teams in that match).
  function normalize(slots, picks) {
    slots = fixSlots(slots);
    const out = {};
    for (const m of ORDER) {
      const teams = resolve(slots, out)[m];
      const p = picks && picks[m];
      if (p && teams.includes(p)) out[m] = p;
      else if (p) { const f = teams.find(Boolean); if (f) out[m] = f; }
    }
    return out;
  }

  // User picks winner `team` in match m. Later picks of the old winner move to the new one.
  function setPick(slots, picks, m, team) {
    const next = Object.assign({}, picks);
    const old = next[m];
    next[m] = team;
    if (old && old !== team && m !== 'T') {
      for (const m2 of ORDER.slice(ORDER.indexOf(m) + 1)) if (m2 !== 'T' && next[m2] === old) next[m2] = team;
    }
    return normalize(slots, next);
  }

  // User swaps the team in a slot. Picks of the old team follow to the new one.
  function setSlot(slots, picks, i, team) {
    const s = fixSlots(slots); const old = s[i];
    if (team && s.some((x, j) => j !== i && x === team)) return { slots: s, picks: Object.assign({}, picks), error: 'dup' };
    s[i] = team || null;
    const next = Object.assign({}, picks);
    if (old) for (const m of ORDER) if (next[m] === old) { if (team) next[m] = team; else delete next[m]; }
    return { slots: s, picks: normalize(s, next) };
  }

  function officialWinners(official) {
    const w = {};
    for (const m of ORDER) { const r = official.results && official.results[m]; if (r && r.winner) w[m] = r.winner; }
    return w;
  }

  // Remove official results that no longer make sense (winner not in that match).
  function cleanOfficial(official) {
    official.slots = fixSlots(official.slots);
    official.results = official.results || {};
    for (let pass = 0; pass < 3; pass++) {
      for (const m of ORDER) {
        const r = official.results[m]; if (!r) continue;
        const teams = resolve(official.slots, officialWinners(official))[m];
        if (!teams.includes(r.winner) || teams.filter(Boolean).length < 2) delete official.results[m];
      }
    }
    return official;
  }

  /* Live bracket: whenever the official data changes, correct the bracket.
   * - Official playoff teams replace teams that didn't make it (picks follow the replacement).
   * - A wrong pick is replaced by the real winner, and later picks of the eliminated team become that winner too. */
  function reconcile(b, official) {
    const changes = [];
    let slots = fixSlots(b.slots);
    let picks = normalize(slots, b.picks || {});
    const processed = Object.assign({}, b.processed);
    const tainted = Object.assign({}, b.tainted);
    const record = Object.assign({ hit: 0, miss: 0 }, b.record);
    const offSlots = fixSlots(official.slots);

    if (offSlots.every(Boolean)) {
      const keep = new Set(offSlots), map = {};
      slots.forEach((t, i) => { if (t && t !== offSlots[i] && !keep.has(t)) map[t] = offSlots[i]; });
      const before = Object.assign({}, picks);
      for (const m of ORDER) if (picks[m] && map[picks[m]]) picks[m] = map[picks[m]];
      slots.forEach((t, i) => { if (t !== offSlots[i] && t && map[t]) changes.push({ match: 'slots', from: t, to: offSlots[i] }); });
      slots = offSlots.slice();
      picks = normalize(slots, picks);
      for (const m of ORDER) if (before[m] && picks[m] && before[m] !== picks[m]) changes.push({ match: m, from: before[m], to: picks[m] });
    }

    const win = officialWinners(official);
    for (const m of ORDER) {
      const w = win[m]; if (!w) continue;
      const p = picks[m];
      if (!processed[m]) { processed[m] = true; if (p && p === w && !tainted[m]) record.hit++; else record.miss++; }
      if (p !== w) {
        picks[m] = w;
        if (p) changes.push({ match: m, from: p, to: w });
        if (p && m !== 'T') for (const m2 of ORDER.slice(ORDER.indexOf(m) + 1)) {
          if (m2 !== 'T' && picks[m2] === p) { picks[m2] = w; tainted[m2] = true; changes.push({ match: m2, from: p, to: w }); }
        }
      }
      picks = normalize(slots, picks);
    }
    return { slots, picks, processed, tainted, record, changes };
  }

  function score(b, official) {
    const base = new Set(b.baseline || []);
    const res = official.results || {};
    const w = officialWinners(official);
    const t = resolve(official.slots, w);
    const qfLost = new Set(), sfLost = new Set();
    for (const m of ORDER) {
      if (!w[m] || m === 'T') continue;
      const l = t[m].find(x => x && x !== w[m]);
      if (l) (m[0] === 'Q' ? qfLost : m[0] === 'S' ? sfLost : new Set()).add(l);
    }
    let pts = 0, correct = 0, decided = 0, maxPossible = 0;
    for (const m of ORDER) {
      if (base.has(m)) continue;
      const r = res[m];
      if (r && r.winner) { decided++; if (b.picks && b.picks[m] === r.winner) { correct++; pts += POINTS[m]; maxPossible += POINTS[m]; } continue; }
      const p = b.picks && b.picks[m];
      if (!p) continue;
      const dead = qfLost.has(p) || (m === 'F' && sfLost.has(p));
      if (!dead) maxPossible += POINTS[m];
    }
    return { pts, correct, decided, maxPossible };
  }

  return { ORDER, POINTS, LABEL, MAX_POINTS, fixSlots, resolve, normalize, setPick, setSlot, officialWinners, cleanOfficial, reconcile, score };
});
