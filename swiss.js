/* Swiss-stage engine for a 16-team CS2 Major stage (first to 3 wins advances, 3 losses out).
 * Used by the website (live board + simulator) and by scripts/sync.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Swiss = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Board layout: which record groups exist in each round and how many matches each holds.
  const LAYOUT = [
    { round: 1, groups: [{ w: 0, l: 0, n: 8 }] },
    { round: 2, groups: [{ w: 1, l: 0, n: 4 }, { w: 0, l: 1, n: 4 }] },
    { round: 3, groups: [{ w: 2, l: 0, n: 2 }, { w: 1, l: 1, n: 4 }, { w: 0, l: 2, n: 2 }] },
    { round: 4, groups: [{ w: 2, l: 1, n: 3 }, { w: 1, l: 2, n: 3 }] },
    { round: 5, groups: [{ w: 2, l: 2, n: 3 }] }
  ];
  const END = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'];
  const pairKey = (a, b) => [a, b].sort().join('|');
  const mkey = (round, a, b) => 'R' + round + ':' + pairKey(a, b);

  // Pair the teams of one record group. Round 1: 1v9, 2v10... Later: strongest Buchholz vs weakest, no rematches.
  function pairGroup(list, rec, seed, round) {
    const bh = t => rec[t].opps.reduce((s, o) => s + (rec[o] ? rec[o].w - rec[o].l : 0), 0);
    const order = list.slice().sort((x, y) => round === 1 ? seed(x) - seed(y) : (bh(y) - bh(x)) || (seed(x) - seed(y)));
    if (round === 1) { const h = order.length / 2; return order.slice(0, h).map((t, i) => [t, order[i + h]]); }
    const solve = arr => {
      if (!arr.length) return [];
      const a = arr[0];
      for (let j = arr.length - 1; j >= 1; j--) {
        const b = arr[j]; if (rec[a].opps.includes(b)) continue;
        const rest = solve(arr.slice(1, j).concat(arr.slice(j + 1)));
        if (rest) return [[a, b]].concat(rest);
      }
      return null;
    };
    const got = solve(order);
    if (got) return got;
    const out = []; for (let i = 0; i < order.length - 1; i += 2) out.push([order[i], order[i + 1]]);
    return out;
  }

  /* opts: { teams:[names in seed order], seeds:(name)=>number, real:[{round,a,b,winner,score}], picks:{key:winner} }
   * Real results always win over picks. Returns the board with rounds, groups, matches and end-of-stage buckets. */
  function run(opts) {
    const teams = opts.teams || [], real = opts.real || [], picks = opts.picks || {};
    const seedIdx = new Map(teams.map((t, i) => [t, i]));
    const seed = opts.seeds ? opts.seeds : t => seedIdx.get(t);
    const rec = {}; teams.forEach(t => { rec[t] = { w: 0, l: 0, opps: [] }; });
    const rounds = [];
    for (const L of LAYOUT) {
      const groups = [], decided = [];
      for (const g of L.groups) {
        const grp = { round: L.round, w: g.w, l: g.l, n: g.n, matches: [], ready: false };
        const here = teams.filter(t => rec[t].w === g.w && rec[t].l === g.l);
        const realM = real.filter(m => m.round === L.round && rec[m.a] && rec[m.b] && rec[m.a].w === g.w && rec[m.a].l === g.l);
        const used = new Set(); realM.forEach(m => { used.add(m.a); used.add(m.b); });
        const rest = here.filter(t => !used.has(t));
        const pairs = realM.map(m => ({ a: m.a, b: m.b, real: m }));
        if (here.length === g.n * 2 || (rest.length && rest.length % 2 === 0 && pairs.length + rest.length / 2 === g.n)) {
          pairGroup(rest, rec, seed, L.round).forEach(([a, b]) => pairs.push({ a, b, real: null }));
        }
        grp.ready = pairs.length === g.n;
        for (const p of pairs) {
          const key = mkey(L.round, p.a, p.b);
          let winner = null, src = null, score = '';
          if (p.real && (p.real.winner === p.a || p.real.winner === p.b)) { winner = p.real.winner; src = 'real'; score = p.real.score || ''; }
          else if (picks[key] === p.a || picks[key] === p.b) { winner = picks[key]; src = 'pick'; }
          const pickWas = picks[key] && (picks[key] === p.a || picks[key] === p.b) ? picks[key] : null;
          const m = { key, round: L.round, a: p.a, b: p.b, winner, src, score, real: !!p.real, pick: pickWas, replaced: src === 'real' && pickWas && pickWas !== winner };
          grp.matches.push(m); if (winner) decided.push(m);
        }
        groups.push(grp);
      }
      for (const m of decided) {
        const lose = m.winner === m.a ? m.b : m.a;
        rec[m.winner].w++; rec[lose].l++; rec[m.a].opps.push(m.b); rec[m.b].opps.push(m.a);
      }
      rounds.push({ round: L.round, groups });
    }
    const bh = t => rec[t].opps.reduce((s, o) => s + rec[o].w - rec[o].l, 0);
    const out = {}; END.forEach(k => { out[k] = []; });
    teams.forEach(t => { const k = rec[t].w + '-' + rec[t].l; if (out[k]) out[k].push(t); });
    const by = (x, y) => (bh(y) - bh(x)) || (seed(x) - seed(y));
    END.forEach(k => out[k].sort(by));
    const advanced = [].concat(out['3-0'], out['3-1'], out['3-2']);
    return { rounds, rec, out, advanced, eliminated: [].concat(out['0-3'], out['1-3'], out['2-3']), complete: advanced.length === 8 && teams.length === 16 };
  }

  // Playoff seeding from a finished stage: seeds 1-8, bracket order 1v8, 4v5 | 2v7, 3v6.
  function playoffSlots(r) {
    if (!r || r.advanced.length !== 8) return null;
    const s = r.advanced;
    return [s[0], s[7], s[3], s[4], s[1], s[6], s[2], s[5]];
  }

  // Assign Swiss round numbers to a chronological list of finished series (used by sync). Non-Swiss matches are returned as playoffs.
  function classify(teams, series) {
    const rec = {}; teams.forEach(t => { rec[t] = { w: 0, l: 0 }; });
    const swiss = [], playoffs = [];
    for (const s of series) {
      const a = rec[s.a], b = rec[s.b];
      if (a && b && a.w < 3 && a.l < 3 && b.w < 3 && b.l < 3 && a.w === b.w && a.l === b.l) {
        swiss.push({ round: a.w + a.l + 1, a: s.a, b: s.b, winner: s.winner, score: s.score });
        const lose = s.winner === s.a ? s.b : s.a; rec[s.winner].w++; rec[lose].l++;
      } else playoffs.push(s);
    }
    return { swiss, playoffs };
  }

  return { LAYOUT, END, pairKey, mkey, run, playoffSlots, classify };
});
