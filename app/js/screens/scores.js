/* Scores = the website's Schedule page (week tiles, one card per game with records, top starters, projections and
   weekly score ranks); Game Center = the website's Game Center (scoreboard band, Top Performers with real NFL lines,
   Best Start / Best Seat callouts, Team Rosters, Roster Analysis). Laid out for a phone. */
(function () {
    const { esc } = APP;
    const { pts } = LIB;
    const f1 = v => v == null || v === '' ? '-' : Number(v).toFixed(1);
    const nflLogo = t => t ? `<img class="gx-nfl" src="assets/nfl-logos/${String(t).toLowerCase()}.png" alt="${esc(t)}" onerror="this.src='assets/nfl-logos/nfl.png';this.onerror=null">` : '';
    const fpClass = (a, p) => !a || !p ? '' : a > p ? 'pos' : a < p ? 'neg' : '';
    const pill = (text, dark = true) => `<span class="pill ${dark ? 'pill-dark' : 'pill-accent'}">${esc(text)}</span>`;
    const tile = (v, l, s = '') => `<div class="tile"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

    // ================================================================ SCORES (the site's Schedule page)
    APP.screen('scores', {
        tab: 'scores',
        async render(route) {
            const b = await GT.load();
            const year = Number(route.query.get('season')) || b.season;
            const [S, years] = await Promise.all([LIB.season(year), APP.seasons()]);
            const weeks = [...new Set(S.played.map(g => g.week))];
            const week = Number(route.query.get('week')) || weeks[weeks.length - 1];
            const wk = S.played.filter(g => g.week === week);
            const label = w => { const g = S.played.find(x => x.week === w); return GT.periodLabel(g ? g.period : 'Regular', w); };
            const kick = GT.weekDate(b, year, week);
            const [lineups, ranks] = await Promise.all([
                GT.query(`SELECT o.display_name AS owner, p.player_id AS pid, p.name, p.position AS pos, frp.actual_points AS pts, frp.projected_points AS proj
                          FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                          JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
                          WHERE fr.season = $s AND fr.week = $w AND frp.slot_position NOT IN ('BE','IR')`, { $s: year, $w: week }),
                GT.query(`SELECT o.display_name AS owner, t.score_rank_on_week AS rank FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
                          JOIN owners o ON o.owner_id = t.owner_id WHERE m.season = $s AND m.week = $w`, { $s: year, $w: week })
            ]);
            const teams = wk.length * 2;
            const info = name => {
                const mine = lineups.filter(l => l.owner === name);
                const top = mine.filter(l => l.pts != null).sort((x, y) => y.pts - x.pts)[0];
                const proj = mine.reduce((t, l) => t + (Number(l.proj) || 0), 0);
                const before = S.played.filter(g => g.week < week && g.period === 'Regular' && (g.home === name || g.away === name));
                const w = before.filter(g => (g.home === name ? g.hs > g.aws : g.aws > g.hs)).length, l = before.filter(g => (g.home === name ? g.hs < g.aws : g.aws < g.hs)).length;
                return { top, proj, rec: `${w}-${l}`, rank: (ranks.find(r => r.owner === name) || {}).rank };
            };
            const teamRow = (name, score, won, x) => `<div class="sc-team${won ? ' won' : ''}">
                <img src="${GT.logo(name)}" alt="">
                <div class="sc-who"><b>${esc(name)}</b><small>${x.rank ? `#${x.rank}` : '-'}</small></div>
                <div class="sc-pts"><span class="sc-score">${f1(score)}</span><small>${x.proj ? `Proj ${pts(x.proj)}` : ''}</small></div></div>`;
            const card = g => {
                const h = info(g.home), a = info(g.away), hw = g.hs > g.aws, aw = g.aws > g.hs;
                return `<a class="sc-card" href="#/game/${g.id}"><div class="sc-head">${pill('Final')}<span class="sc-open">Margin ${pts(Math.abs(g.hs - g.aws))}</span></div>
                    ${teamRow(g.home, g.hs, hw, h)}${teamRow(g.away, g.aws, aw, a)}</a>`;
            };
            const scores = wk.flatMap(g => [{ n: g.home, v: g.hs }, { n: g.away, v: g.aws }]);
            const hi = scores.reduce((m, x) => !m || x.v > m.v ? x : m, null), lo = scores.reduce((m, x) => !m || x.v < m.v ? x : m, null);
            const close = wk.reduce((m, g) => !m || Math.abs(g.hs - g.aws) < Math.abs(m.hs - m.aws) ? g : m, null);
            const avg = scores.length ? scores.reduce((t, x) => t + x.v, 0) / scores.length : null;
            return `${APP.pageHead({ eyebrow: `${weeks.length} weeks · ${S.played.length} games`, title: `${year} Schedule` })}
            ${APP.ctlBar(APP.seasonField(years, year, y => `#/scores?season=${y}`), { label: 'Week', options: weeks.map(w => [`#/scores?season=${year}&week=${w}`, `Week ${w}`, w === week]) })}
            ${scores.length ? `<div class="tiles">${tile(pts(hi.v), 'High score', esc(hi.n))}${tile(pts(lo.v), 'Low score', esc(lo.n))}
                ${tile(pts(avg), 'League average', `${scores.length} teams`)}${tile(pts(Math.abs(close.hs - close.aws)), 'Closest game', `${esc(close.home)} v ${esc(close.away)}`)}</div>` : ''}
            <div class="sc-grid">${wk.map(card).join('') || '<p class="muted pad">No games this week.</p>'}</div>`;
        }
    });

    // ================================================================ GAME CENTER (the site's Game Center)
    APP.screen('game', {
        tab: 'scores',
        bar: () => ({ back: true, title: 'Game Center' }),
        async render(route) {
            const b = await GT.load();
            const [g] = await GT.query(`
                SELECT m.game_id AS id, m.season, m.week, m.season_period AS period, h.owner_id AS hid, a.display_name AS home, h.team_score AS hs,
                       h.opponent_owner_id AS aid, o.display_name AS away, h.opponent_score AS aws
                FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
                JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id WHERE m.game_id = $id`, { $id: Number(route.args[0]) });
            if (!g) return '<div class="next"><h2>Not found</h2></div>';
            const [left, right, nfl, rules] = await Promise.all([GT.roster(g.hid, g.season, g.week), GT.roster(g.aid, g.season, g.week),
                GT.query('SELECT home_team AS h, away_team AS a, home_score AS hs, away_score AS aws, completed FROM nfl_games WHERE season = $s AND week = $w', { $s: g.season, $w: g.week }),
                GT.query('SELECT * FROM roster_rules ORDER BY season')]);
            // each player's NFL game: opponent and result
            const byTeam = {};
            nfl.forEach(n => { byTeam[n.h] = { opp: n.a, own: n.hs, them: n.aws, done: n.completed }; byTeam[n.a] = { opp: n.h, own: n.aws, them: n.hs, done: n.completed }; });
            [left, right].forEach(r => r.forEach(p => { const n = byTeam[String(p.team || '').toUpperCase()]; if (!n) return;
                p.opp = n.opp; if (n.done && n.own != null) { p.outcome = n.own > n.them ? 'W' : n.own < n.them ? 'L' : 'T'; p.result = `${n.own}-${n.them}`; } }));
            const lgTop = await GT.query(`SELECT frp.player_id AS pid FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                WHERE fr.season = $s AND fr.week = $w AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL ORDER BY frp.actual_points DESC LIMIT 3`, { $s: g.season, $w: g.week });
            const podium = id => { const i = lgTop.findIndex(r => r.pid === id); return i < 0 ? '' : ` tp-g${i + 1}`; };
            const label = GT.periodLabel(g.period, g.week);
            const homeWon = g.hs > g.aws, awayWon = g.aws > g.hs;
            const mid = n => (b.byName[n.toLowerCase()] || {}).id;

            // ---- scoreboard band
            // the game's feature panel, in the Home hero's style: photo with the week tag, then the dark panel with the
            // headline, a line of copy and the striped score bars
            const [wN, wP, lN, lP] = homeWon || g.hs === g.aws ? [g.home, g.hs, g.away, g.aws] : [g.away, g.aws, g.home, g.hs];
                        const max = Math.max(wP, lP) || 1;
            const bar = (name, v, won) => `<a class="ft-team${won ? ' won' : ''}" href="#/manager/${mid(name)}?season=${g.season}"><span class="ft-name">${esc(name)}</span>
                <span class="ft-bar"><span style="width:${(v / max * 100).toFixed(1)}%"></span></span><span class="ft-mark">${won ? '▸' : ''}</span><span class="ft-score">${f1(v)}</span></a>`;
            const band = `<section class="feature gx-feature"><div class="ft-photo gx-photo" style="--photo:url('${APP.photo()}')"><span class="ft-tag">Final · ${g.season} W${g.week}</span></div>
                <div class="ft-panel gx-panel"><div class="ft-teams">${bar(wN, wP, true)}${bar(lN, lP, false)}</div></div></section>`;
            if (!left.length && !right.length) return `${band}<p class="muted pad">No lineups were saved for this game.</p>`;

            // ---- top performers + callouts
            const all = [...left.map(p => ({ ...p, owner: g.home })), ...right.map(p => ({ ...p, owner: g.away }))];
            const starters = all.filter(p => GT.isStarter(p) && p.points != null);
            const top = starters.slice().sort((x, y) => y.points - x.points).slice(0, 6);
            const bestOf = n => starters.filter(p => p.owner === n).sort((x, y) => y.points - x.points)[0];
            const L1 = LIB.lineup(left), R1 = LIB.lineup(right);
            const benchBest = [...L1.swaps.map(o => ({ ...o.bench, owner: g.home })), ...R1.swaps.map(o => ({ ...o.bench, owner: g.away }))].sort((x, y) => (y.points || 0) - (x.points || 0))[0];
            const shot = p => `<span class="tp-shot"><img src="${LIB.headshot(p.playerId, p.team)}" alt="" ${LIB.imgFallback}></span>`;
            const perfRow = p => `<a class="tp-row${podium(p.playerId)}" href="#/player/${p.playerId}">${shot(p)}<span class="tp-who"><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(p.owner)}</small>
                <em class="gx-line" data-pid="${p.playerId}"></em></span><span class="tp-num">${f1(p.points)}</span></a>`;
            const callout = (title, p, note) => p ? `<a class="gx-call" href="#/player/${p.playerId}"><span class="gx-ct">${title}</span>${shot(p)}
                <span class="tp-who"><b>${f1(p.points)} · ${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(note)}</small><em class="gx-line" data-pid="${p.playerId}"></em></span></a>` : '';
            const performers = `<div class="sec-head"><h2 class="sec-title">Top Performers</h2></div>
                <div class="gx-perf">${top.map(perfRow).join('')}</div>
                <div class="gx-calls">${callout(`Best Start · ${esc(g.home)}`, bestOf(g.home), GT.teamName(b, g.home, g.season))}${callout(`Best Start · ${esc(g.away)}`, bestOf(g.away), GT.teamName(b, g.away, g.season))}
                    ${callout('Best Seat on the Bench', benchBest, `left on ${benchBest ? benchBest.owner : ''}'s bench`)}</div>`;

            // ---- team rosters: slot by slot, both teams, with NFL team, opponent, result, projected and actual points
            const rule = rules.filter(r => r.season <= g.season).pop() || {};
            const ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'];
            const started = {}; [left, right].forEach(r => { const c = {}; r.filter(GT.isStarter).forEach(p => { c[p.slot] = (c[p.slot] || 0) + 1; }); Object.entries(c).forEach(([s, n]) => { started[s] = Math.max(started[s] || 0, n); }); });
            const slots = ORDER.flatMap(s => Array(Math.max(Number(rule[s.toLowerCase().replace('/', '')]) || 0, started[s] || 0)).fill(s));
            const take = (r, slot, used) => { const p = r.find(x => x.slot === slot && !used.has(x)); if (p) used.add(p); return p; };
            const short = n => { const parts = String(n).split(' '); return parts.length > 1 && !/D\/ST|Coach/.test(n) ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n; };
            const side = (p, al) => p ? `<a class="gx-p ${al}" href="#/player/${p.playerId}"><b>${esc(short(p.name))}</b><small>${al === 'r' ? `${p.result ? `<i class="${p.outcome === 'W' ? 'pos' : p.outcome === 'L' ? 'neg' : ''}">${p.result}</i> ` : ''}vs ${esc(p.opp || '-')} ${nflLogo(p.team)}` : `${nflLogo(p.team)} vs ${esc(p.opp || '-')}${p.result ? ` <i class="${p.outcome === 'W' ? 'pos' : p.outcome === 'L' ? 'neg' : ''}">${p.result}</i>` : ''}`}</small></a>` : '<span class="gx-p muted">-</span>';
            const num = (p, o) => `<span class="gx-n ${p ? fpClass(p.points, p.proj) : ''}${p && o && (p.points || 0) > (o.points || 0) ? ' up' : ''}"><b>${p ? f1(p.points) : '-'}</b><small>${p ? f1(p.proj) : ''}</small></span>`;
            const uL = new Set(), uR = new Set();
            const startRows = slots.map(s => { const a = take(left, s, uL), c = take(right, s, uR); return `<div class="gx-row">${side(a, 'l')}${num(a, c)}<span class="gx-slot">${s}</span>${num(c, a)}${side(c, 'r')}</div>`; }).join('');
            const tot = (r, k) => r.reduce((t, p) => t + (Number(p[k]) || 0), 0);
            const sL = left.filter(p => uL.has(p)), sR = right.filter(p => uR.has(p));
            const totals = (a, c, lab) => `<div class="gx-row gx-tot"><span class="gx-p l"><small>Proj ${f1(tot(a, 'proj'))}</small></span><span class="gx-n"><b>${f1(tot(a, 'points'))}</b></span><span class="gx-slot">${lab}</span>
                <span class="gx-n"><b>${f1(tot(c, 'points'))}</b></span><span class="gx-p r"><small>Proj ${f1(tot(c, 'proj'))}</small></span></div>`;
            const bL = left.filter(p => p.slot === 'BE'), bR = right.filter(p => p.slot === 'BE');
            const benchRows = Array.from({ length: Math.max(bL.length, bR.length) }, (_, i) => `<div class="gx-row">${side(bL[i], 'l')}${num(bL[i])}<span class="gx-slot">BE</span>${num(bR[i])}${side(bR[i], 'r')}</div>`).join('');
            const teamsHead = `<div class="gx-teams"><img src="${GT.logo(g.home)}" alt=""><b>${esc(g.home)}</b><span></span><b class="r">${esc(g.away)}</b><img src="${GT.logo(g.away)}" alt=""></div>`;
            const rosters = `<div class="sec-head"><h2 class="sec-title">Team Rosters</h2></div>
                <div class="card">${teamsHead}${startRows}${totals(sL, sR, 'TOT')}</div>
                <div class="sec-head small"><h3 class="sec-sub">Bench Players</h3></div><div class="card">${teamsHead}${benchRows}${totals(bL, bR, 'TOT')}</div>`;

            // ---- roster analysis: position FP+ and lineup optimization
            const posStats = r => { const by = {}; r.filter(GT.isStarter).forEach(p => { const s = by[p.slot] || (by[p.slot] = { a: 0, p: 0 }); s.a += Number(p.points) || 0; s.p += Number(p.proj) || 0; }); return by; };
            const posTable = (name, r) => { const by = posStats(r);
                return `<div class="card gx-an">
                    <div class="gx-th"><span>Position</span><span>Points</span><span>Proj</span><span>FP+</span></div>
                    ${ORDER.filter(p => by[p]).map(p => { const s = by[p]; return `<div class="gx-tr"><span><b>${p}</b></span><span>${s.a.toFixed(1)}</span><span>${s.p.toFixed(1)}</span>
                        <span class="${fpClass(s.a, s.p)}"><b>${s.p > 0 ? (s.a / s.p).toFixed(2) : '0.00'}</b></span></div>`; }).join('')}</div>`; };
            const optCard = (name, m) => { const score = m.eff == null ? 100 : Math.round(m.eff), tier = score >= 95 ? 'excellent' : score >= 85 ? 'good' : score >= 75 ? 'average' : 'poor';
                return `<div class="card gx-an">
                    <div class="gx-opt"><div class="gx-ring ${tier}" style="--p:${score}"><b>${score}%</b><span>Efficiency</span></div>
                        <ul class="gx-kv"><li><span>Actual points</span><b>${m.actual.toFixed(1)}</b></li><li><span>Optimal points</span><b>${m.optimal.toFixed(1)}</b></li>
                            <li><span>Left on bench</span><b class="${m.optimal - m.actual > 0 ? 'neg' : ''}">${(m.optimal - m.actual).toFixed(1)}</b></li></ul></div>
                    <h4 class="gx-sub">${m.swaps.length ? 'Missed Opportunities' : 'Perfect Lineup'}</h4>
                    ${m.swaps.length ? m.swaps.map(o => `<div class="gx-miss"><span><b>${esc(o.bench.name)}</b><small>${esc(o.bench.pos)} · <i class="pos">${f1(o.bench.points)}</i></small></span>
                        <span class="gx-over">over</span><span class="r"><b>${esc(o.starter ? o.starter.name : `Empty ${o.bench.pos}`)}</b><small>${o.starter ? f1(o.starter.points) : '0.0'}</small></span></div>`).join('')
                        : '<p class="muted gx-perfect">This team started its best possible lineup.</p>'}</div>`; };
            const analysis = `<div class="sec-head"><h2 class="sec-title">Roster Analysis</h2></div>
                ${APP.seg('gx-mgr', [g.home, g.away])}
                ${[[g.home, left, L1], [g.away, right, R1]].map(([n, r, m], i) => `<div class="gx-pane" data-pane="${i}"${i ? ' hidden' : ''}>
                    ${posTable(n, r)}${optCard(n, m)}</div>`).join('')}`;
            return `${band}${rosters}${top.length ? performers : ''}${analysis}`;
        },
        async after(route, el) {
            APP.bindSeg(el, 'gx-mgr', i => el.querySelectorAll('.gx-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }));
            // the real NFL stat line for each performer and callout (from the player database)
            const sid = route.args[0];
            try {
                const games = await PS.games(), lines = el.querySelectorAll('.gx-line');
                const ids = [...new Set([...lines].map(e => e.dataset.pid))].filter(id => Number(id) > 0);
                const [meta] = await GT.query('SELECT season, week FROM matchups WHERE game_id = $id', { $id: Number(sid) });
                const files = await Promise.all(ids.map(id => PS.player(id).catch(() => null)));
                const byId = Object.fromEntries(ids.map((id, i) => [id, files[i]]));
                const line = r => { const p = [];
                    if (r.pass_att) p.push(`${r.pass_cmp || 0}/${r.pass_att} · ${r.pass_yds || 0} PYD · ${r.pass_td || 0} PTD`);
                    if (r.rush_att) p.push(`${r.rush_att} RuAtt · ${r.rush_yds || 0} RuYD${r.rush_td ? ` · ${r.rush_td} RuTD` : ''}`);
                    if (r.rec) p.push(`${r.rec} Rec · ${r.rec_yds || 0} ReYD${r.rec_td ? ` · ${r.rec_td} ReTD` : ''}`);
                    if (r.fg_att || r.xp_att) p.push(`${r.fg_made || 0}/${r.fg_att || 0} FG · ${r.xp_made || 0}/${r.xp_att || 0} XP`);
                    if (r.punt) p.push(`${r.punt} punts · ${r.punt_in20 || 0} in 20`);
                    if (r.pts_allowed != null) p.push(`${r.pts_allowed} PA · ${r.def_sck || 0} sacks`);
                    return p.slice(0, 2).join(' · '); };
                lines.forEach(e => { const f = byId[e.dataset.pid]; if (!f || !meta) return;
                    const r = f.games.find(x => { const gm = games[x.g]; return gm && gm.season === meta.season && gm.week === meta.week && gm.type !== 'PRE'; });
                    if (r) e.textContent = line(r); });
            } catch (_) { /* the stat lines are extra */ }
        }
    });
})();
