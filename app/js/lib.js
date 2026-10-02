/* Shared app logic: formatting, a season's games, division seeding (the league tiebreak) and playoff odds. */
window.LIB = (() => {
    const pts = v => (v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toFixed(1));
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const rec = r => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
    const headshot = (pid, team) => (pid > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`
                                             : `assets/nfl-logos/${String(team || 'nfl').toLowerCase()}.png`);
    const imgFallback = `onerror="this.src='assets/nfl-logos/nfl.png';this.onerror=null"`;

    // ---- one season: every game (both sides once), divisions and playoff slots; cached
    const seasons = {};
    function season(s) {
        if (seasons[s]) return seasons[s];
        seasons[s] = Promise.all([
            GT.query(`SELECT m.game_id AS id, m.week, m.season_period AS period, h.owner_id AS hid, a.display_name AS home, h.team_score AS hs,
                             h.opponent_owner_id AS aid, o.display_name AS away, h.opponent_score AS aws
                      FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
                      JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
                      WHERE m.season = $s ORDER BY m.week, m.game_id`, { $s: s }),
            GT.query(`SELECT d.division_id AS id, d.division_name AS name, o.display_name AS owner
                      FROM divisions d JOIN division_members dm ON dm.division_id = d.division_id JOIN owners o ON o.owner_id = dm.owner_id
                      WHERE d.season = $s ORDER BY d.division_id`, { $s: s }),
            GT.query('SELECT division_id AS id, auto_slots AS auto, playin_slots AS playin FROM playoff_division_slots WHERE season = $s', { $s: s }),
            GT.query('SELECT qualification_method AS method, regular_season_end_week AS endWeek FROM playoff_rules WHERE season = $s', { $s: s })
        ]).then(([games, divs, slots, rules]) => {
            const played = games.filter(g => g.hs != null && g.aws != null);
            const rule = rules[0] || {};
            const playin = rule.method === 'divisional_top_n_plus_playin';
            const regWeeks = played.filter(g => g.period === 'Regular').map(g => g.week);
            const divisions = [...new Set(divs.map(d => d.name))].map(name => {
                const id = divs.find(d => d.name === name).id, slot = slots.find(x => x.id === id) || {};
                return { id, name, owners: divs.filter(d => d.name === name).map(d => d.owner), auto: slot.auto || 0, playin: slot.playin || 0 };
            });
            return { season: s, games, played, divisions, playin,
                     endWeek: playin ? 13 : Math.max(rule.endWeek || 0, ...regWeeks, 0),
                     lastWeek: regWeeks.length ? Math.max(...regWeeks) : 0 };
        });
        return seasons[s];
    }

    // ---- standings line for a list of owners over a list of games
    function lines(owners, games) {
        return owners.map(o => {
            const r = { owner: o, w: 0, l: 0, t: 0, pf: 0, pa: 0, g: 0 };
            games.forEach(g => {
                const me = g.home === o ? [g.hs, g.aws] : g.away === o ? [g.aws, g.hs] : null;
                if (!me) return;
                r.g++; r.pf += me[0]; r.pa += me[1];
                if (me[0] > me[1]) r.w++; else if (me[0] < me[1]) r.l++; else r.t++;
            });
            r.pct = r.g ? (r.w + r.t / 2) / r.g : 0;
            r.diff = r.pf - r.pa;
            return r;
        });
    }

    // League tiebreak: win %, then head-to-head only when every tied team has played every other, then point
    // differential, then points for; after each pick the remaining tied teams start over.
    function seed(owners, games) {
        const met = (a, c) => games.some(g => (g.home === a && g.away === c) || (g.home === c && g.away === a));
        const h2h = (a, c) => games.reduce((t, g) => t + (g.home === a && g.away === c ? Math.sign(g.hs - g.aws)
                                                             : g.away === a && g.home === c ? Math.sign(g.aws - g.hs) : 0), 0);
        const rows = lines(owners, games).sort((x, y) => y.pct - x.pct), out = [];
        for (let i = 0; i < rows.length;) {
            let j = i; while (j < rows.length && rows[j].pct === rows[i].pct) j++;
            const left = rows.slice(i, j);
            while (left.length) {
                const allMet = left.every(a => left.every(c => a === c || met(a.owner, c.owner)));
                const hv = r => left.reduce((t, o) => (o === r ? t : t + h2h(r.owner, o.owner)), 0);
                const pick = left.slice().sort((x, y) => (allMet ? hv(y) - hv(x) : 0) || y.diff - x.diff || y.pf - x.pf || x.owner.localeCompare(y.owner))[0];
                out.push(pick); left.splice(left.indexOf(pick), 1);
            }
            i = j;
        }
        return out;
    }

    // ---- playoff odds: Monte Carlo of the rest of the regular season (and the play-in bracket when the season has one).
    // Each team scores around its average so far, pulled toward the league average as if it had played four average
    // games; known future matchups are used when on file, random pairings otherwise. Seeds use the league tiebreak.
    function odds(S, sims = 3000) {
        const reg = S.played.filter(g => g.period === 'Regular');
        const owners = S.divisions.flatMap(d => d.owners);
        const scores = Object.fromEntries(owners.map(o => [o, []]));
        reg.forEach(g => { scores[g.home] && scores[g.home].push(g.hs); scores[g.away] && scores[g.away].push(g.aws); });
        const all = Object.values(scores).flat(), lg = all.length ? all.reduce((a, v) => a + v, 0) / all.length : 130;
        let ss = 0, dof = 0;
        Object.values(scores).forEach(l => { if (!l.length) return; const m = l.reduce((a, v) => a + v, 0) / l.length; l.forEach(v => { ss += (v - m) ** 2; }); dof += l.length - 1; });
        const sd = Math.sqrt((ss + 28 * 28 * 20) / (dof + 20));
        const mu = Object.fromEntries(owners.map(o => [o, (scores[o].reduce((a, v) => a + v, 0) + 4 * lg) / (scores[o].length + 4)]));
        const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        const score = o => mu[o] + sd * gauss();
        const future = [];
        for (let w = S.lastWeek + 1; w <= S.endWeek; w++) {
            const known = S.games.filter(g => g.week === w && g.period === 'Regular').map(g => [g.home, g.away]);
            future.push(known.length ? known : null);
        }
        const tally = Object.fromEntries(owners.map(o => [o, { seeds: {}, bye: 0, playIn: 0, gulag: 0, playoffs: 0, title: 0, wins: 0 }]));
        for (let k = 0; k < sims; k++) {
            const games = reg.slice();
            future.forEach(list => {
                let pairs = list;
                if (!pairs) { const o = owners.slice().sort(() => Math.random() - 0.5); pairs = []; for (let i = 0; i + 1 < o.length; i += 2) pairs.push([o[i], o[i + 1]]); }
                pairs.forEach(([a, c]) => games.push({ home: a, away: c, hs: score(a), aws: score(c) }));
            });
            const seeds = S.divisions.map(d => seed(d.owners, games));
            seeds.forEach((list, di) => list.forEach((r, si) => {
                const t = tally[r.owner], d = S.divisions[di];
                t.seeds[si + 1] = (t.seeds[si + 1] || 0) + 1; t.wins += r.w + r.t / 2;
                if (S.playin) { if (si < d.auto) t.bye++; else if (si < d.auto + d.playin) t.playIn++; else t.gulag++; }
                else if (si < d.auto) t.playoffs++;
            }));
            if (S.playin && seeds.length === 2) {
                const A = seeds[0].map(r => r.owner), B = seeds[1].map(r => r.owner), win = (x, y) => (score(x) >= score(y) ? x : y);
                const pi = [win(B[3], A[4]), win(A[2], B[5]), win(A[3], B[4]), win(B[2], A[5])];
                const qf = [A[0], B[1], B[0], A[1]];
                [...qf, ...pi].forEach(o => tally[o].playoffs++);
                const q = qf.map((o, i) => win(o, pi[i]));
                tally[win(win(q[0], q[1]), win(q[2], q[3]))].title++;
            }
        }
        Object.values(tally).forEach(t => {
            ['bye', 'playIn', 'gulag', 'playoffs', 'title', 'wins'].forEach(k => { t[k] /= sims; });
            Object.keys(t.seeds).forEach(s => { t.seeds[s] /= sims; });
        });
        return tally;
    }

    return { pts, ord, rec, headshot, imgFallback, season, lines, seed, odds };
})();
