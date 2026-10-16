/* Stats: the website's analytics dashboard, rebuilt for a phone. One view at a time (chips), a season / as-of-week /
   focus picker shared by every view. Charts are ECharts (bundled), coloured from the app theme. */
(function () {
    const { esc } = APP;
    const { pts, ord } = LIB;
    const VIEWS = [['odds', 'Playoff Odds'], ['luck', 'Schedule Luck'], ['lineups', 'Lineups'], ['projections', 'Projections']];
    const pct = (v, d = 0) => (v == null || isNaN(v) ? '-' : `${(v * 100).toFixed(d)}%`);

    // ---------------------------------------------------------------- data shared by every view (loaded once)
    let metricsP = null, pairsP = null;
    const metrics = () => metricsP || (metricsP = RosterMetrics.load());
    // every game with both projections: projected margin vs actual margin -> win probability model (sigma)
    const pairs = () => pairsP || (pairsP = Promise.all([metrics(), GT.query(`
        SELECT m.game_id AS id, m.season, m.week, m.season_period AS period, a.display_name AS home, h.team_score AS hs,
               o.display_name AS away, h.opponent_score AS aws
        FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
        JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
        WHERE h.team_score IS NOT NULL`)]).then(([M, games]) => {
        const proj = (n, s, w) => { const m = M.get(`${n}|${s}|${w}`); return m && m.projected > 0 ? m.projected : null; };
        const list = games.map(g => ({ ...g, ph: proj(g.home, g.season, g.week), pa: proj(g.away, g.season, g.week) }))
            .filter(g => g.ph != null && g.pa != null).map(g => ({ ...g, pm: g.ph - g.pa, am: g.hs - g.aws }));
        const sigma = Math.sqrt(list.reduce((t, g) => t + (g.am - g.pm) ** 2, 0) / Math.max(1, list.length)) || 30;
        const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
        list.forEach(g => { g.p = 0.5 * (1 + erf(g.pm / sigma / Math.SQRT2)); });
        return { list, sigma };
    }));

    // per-manager lines through the as-of week
    async function managerLines(S, asOf) {
        const M = await metrics();
        const games = S.played.filter(g => g.period === 'Regular' && g.week <= asOf);
        const pool = {};
        games.forEach(g => { (pool[g.week] = pool[g.week] || []).push(g.hs, g.aws); });
        return S.divisions.flatMap(d => d.owners).map(o => {
            const mine = games.filter(g => g.home === o || g.away === o).map(g => (g.home === o ? { week: g.week, pf: g.hs, pa: g.aws, id: g.id } : { week: g.week, pf: g.aws, pa: g.hs, id: g.id }));
            const w = mine.reduce((t, g) => t + (g.pf > g.pa ? 1 : g.pf === g.pa ? 0.5 : 0), 0);
            const xw = mine.reduce((t, g) => { const p = pool[g.week]; return t + (p.filter(v => v < g.pf).length + (p.filter(v => v === g.pf).length - 1) / 2) / (p.length - 1); }, 0);
            const pooled = RosterMetrics.pool(mine.map(g => M.get(`${o}|${S.season}|${g.week}`)).filter(Boolean));
            const pf = mine.reduce((t, g) => t + g.pf, 0);
            return { name: o, g: mine.length, w, l: mine.length - w, xw, luck: w - xw, fp: pooled.fp, eff: pooled.eff, left: pooled.left,
                     ppg: mine.length ? pf / mine.length : null, weeks: mine.map(g => ({ ...g, m: M.get(`${o}|${S.season}|${g.week}`) })) };
        });
    }

    // ---------------------------------------------------------------- charts (ECharts, theme colours)
    const C = () => ({ accent: SITE.color('accent'), red: SITE.color('loss'), ink: SITE.color('ink'), muted: SITE.color('muted'), line: SITE.color('line'), surface: SITE.color('surface') });
    let charts = [];
    const mount = (el, id, option, onClick) => {
        const node = el.querySelector(`#${id}`);
        if (!node || typeof echarts === 'undefined') return;
        const chart = echarts.init(node, null, { renderer: 'canvas' });
        chart.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDuration: 300, ...option });
        if (onClick) chart.on('click', onClick);
        charts.push(chart);
    };
    window.addEventListener('resize', () => charts.forEach(c => c.resize()));

    // ---------------------------------------------------------------- screen
    APP.screen('stats', {
        tab: 'stats',
        async render(route) {
            charts.forEach(c => c.dispose()); charts = [];
            const b = await GT.load();
            const years = await APP.seasons();
            const year = Number(route.query.get('season')) || b.season;
            const view = VIEWS.some(v => v[0] === route.query.get('view')) ? route.query.get('view') : VIEWS[0][0];
            const S = await LIB.season(year);
            const asOf = Math.min(Number(route.query.get('week')) || S.lastWeek, S.lastWeek);
            const q = (k, v) => { const p = new URLSearchParams(route.query); p.set(k, v); return `#/stats?${p}`; };
            this.ctx = { b, S, year, view, asOf };
            const regGames = S.played.filter(g => g.period === 'Regular').length;
            const viewName = VIEWS.find(v => v[0] === view)[1];
            // the three pickers fold into one menu bar under the header
            const menu = `<details class="ctl-menu"><summary><span><b>${year}</b> · ${esc(viewName)} · Week ${asOf}</span><i></i></summary>
                ${APP.ctlBar(APP.seasonField(years, year, y => `#/stats?view=${view}&season=${y}`), { label: 'View', options: VIEWS.map(([k, l]) => [q('view', k), l, k === view]) })}
                ${APP.ctlBar({ label: 'As of', options: Array.from({ length: S.lastWeek }, (_, i) => i + 1).map(w => [q('week', w), `Week ${w}`, w === asOf]) })}</details>`;
            const head = `${APP.pageHead({ eyebrow: `${S.lastWeek} weeks · ${regGames} games`, title: `${year} Analytics` })}${menu}`;
            if (!S.lastWeek) return head + '<p class="muted pad">No games yet this season.</p>';
            return head + await ({ odds, luck, lineups, projections })[view](this.ctx);
        },
        after(route, el) {
            if (this.draw) { this.draw(el); this.draw = null; }
        }
    });
    const screen = () => APP.screenDef('stats');

    // ---------------------------------------------------------------- shared presentation
    const title = t => `<div class="sec-head"><h2 class="sec-title">${t}</h2></div>`;
    const sub = t => `<div class="sec-head small"><h3 class="sec-sub">${t}</h3></div>`;
    const mgrHref = (b, n) => `#/manager/${(b.byName[n.toLowerCase()] || {}).id}`;
    // a clean table: manager (logo right beside the name) then right-aligned number columns
    const table = (heads, widths, rows) => `<div class="card dtx" style="--cols:minmax(0,1fr) ${widths}">
        <div class="dtx-h"><span>Manager</span>${heads.map(h => `<span>${h}</span>`).join('')}</div>${rows.join('')}</div>`;
    const trow = (b, n, cells, href) => `<a class="dtx-r" href="${href || mgrHref(b, n)}"><span class="dtx-m"><img src="${GT.logo(n)}" alt=""><b>${esc(n)}</b></span>${cells.map(c => `<span>${c}</span>`).join('')}</a>`;
    const sgn1 = v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

    // ---------------------------------------------------------------- views
    async function odds({ S, asOf, b }) {
        const T = LIB.odds(S, 3000, asOf);
        const traj = [];
        for (let w = 0; w <= asOf; w++) traj.push(w === asOf ? T : LIB.odds(S, 400, w));
        const owners = Object.keys(T).sort((x, y) => (T[y].playoffs - T[x].playoffs) || (T[y].title - T[x].title));
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-traj', {
                grid: { left: 40, right: 12, top: 12, bottom: 28 },
                tooltip: { trigger: 'axis', order: 'valueDesc', valueFormatter: v => `${v}%`, confine: true },
                xAxis: { type: 'category', data: traj.map((_, w) => (w ? `W${w}` : 'Pre')), boundaryGap: false, axisLabel: { color: c.muted } },
                yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                series: owners.map(o => ({ name: o, type: 'line', smooth: true, symbol: 'none', data: traj.map(t => Math.round(t[o].playoffs * 1000) / 10), lineStyle: { width: 1.6 } }))
            });
        };
        const heads = S.playin ? ['Bye', 'Title', 'Odds'] : ['Wins', 'Odds'];
        return title('Playoff Odds') + `<div class="chart-card"><div class="chart-h">Odds by week</div><div class="chart" id="ch-traj"></div></div>`
            + table(heads, S.playin ? '46px 46px 54px' : '50px 54px', owners.map(o => { const t = T[o];
                return trow(b, o, S.playin ? [pct(t.bye), pct(t.title), `<b>${pct(t.playoffs)}</b>`] : [t.wins.toFixed(1), `<b>${pct(t.playoffs)}</b>`]); }));
    }

    async function luck({ S, asOf, b }) {
        const L = (await managerLines(S, asOf)).filter(l => l.g).sort((x, y) => y.luck - x.luck);
        const max = Math.ceil(Math.max(1, ...L.map(l => Math.max(l.w, l.xw))) + 0.5);
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-luck', {
                grid: { left: 34, right: 16, top: 12, bottom: 36 },
                tooltip: { confine: true, formatter: p => p.data && p.data.name ? `<b>${esc(p.data.name)}</b><br>${p.data.value[1]} wins, ${p.data.value[0].toFixed(1)} expected` : '' },
                xAxis: { type: 'value', name: 'Expected wins', nameLocation: 'middle', nameGap: 24, min: 0, max, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                yAxis: { type: 'value', min: 0, max, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                series: [{ type: 'line', data: [[0, 0], [max, max]], symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: c.muted } },
                         { type: 'scatter', symbolSize: 13, data: L.map(l => ({ name: l.name, value: [l.xw, l.w], itemStyle: { color: l.luck >= 0 ? c.accent : c.red, borderColor: c.surface, borderWidth: 1 },
                             label: { show: false } })) }]
            });
        };
        return title('Schedule Luck') + `<div class="chart-card"><div class="chart-h">Wins vs expected wins</div><div class="chart" id="ch-luck"></div></div>`
            + table(['Record', 'xW', 'Luck'], '46px 42px 50px', L.map(l => trow(b, l.name, [`${l.w}-${l.l}`, l.xw.toFixed(1), `<b class="${l.luck >= 0 ? 'pos' : 'neg'}">${sgn1(l.luck)}</b>`])))
            + swapGrid(S, asOf, L.map(l => l.name));
    }
    // each row's scores played against each column's schedule (facing the column manager when that schedule meets the row)
    function swapGrid(S, asOf, order) {
        const games = S.played.filter(g => g.period === 'Regular' && g.week <= asOf), score = {}, opp = {};
        games.forEach(g => { score[`${g.home}|${g.week}`] = g.hs; score[`${g.away}|${g.week}`] = g.aws; opp[`${g.home}|${g.week}`] = g.away; opp[`${g.away}|${g.week}`] = g.home; });
        const weeks = [...new Set(games.map(g => g.week))];
        const cell = (a, c) => { let w = 0; weeks.forEach(wk => { const mine = score[`${a}|${wk}`], o = opp[`${c}|${wk}`]; if (mine == null || o == null) return;
            const vs = o === a ? c : o, t = score[`${vs}|${wk}`]; if (t != null && mine > t) w++; }); return w; };
        return sub('The Swap Grid') + `<div class="sw-scroll"><table class="sw-grid"><thead><tr><th></th>${order.map(c => `<th><img src="${GT.logo(c)}" alt=""></th>`).join('')}</tr></thead>
            <tbody>${order.map(a => { const real = cell(a, a); return `<tr><th><img src="${GT.logo(a)}" alt=""></th>${order.map(c => { const d = cell(a, c) - real;
                return `<td class="${a === c ? 'me' : ''}" style="${a === c ? '' : d > 0 ? `background:color-mix(in srgb, var(--win) ${Math.min(55, 10 + d * 9)}%, transparent)` : d < 0 ? `background:color-mix(in srgb, var(--loss) ${Math.min(55, 10 - d * 9)}%, transparent)` : ''}">${cell(a, c)}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
    }

    // lineups: FP+ and efficiency, then lineup regret (each week's best possible lineup from the roster, same slots)
    async function lineups({ S, asOf, b }) {
        const L = (await managerLines(S, asOf)).filter(l => l.fp != null);
        const byFp = L.slice().sort((x, y) => x.fp - y.fp);
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-fp', {
                grid: { left: 70, right: 34, top: 6, bottom: 20 },
                tooltip: { confine: true, formatter: p => `<b>${esc(p.name)}</b><br>FP+ ${p.value.toFixed(1)}` },
                xAxis: { type: 'value', min: v => Math.floor(Math.min(90, v.min) / 5) * 5, max: v => Math.ceil(Math.max(110, v.max) / 5) * 5, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                yAxis: { type: 'category', data: byFp.map(l => l.name), axisLabel: { color: c.ink, fontSize: 10, fontWeight: 600 } },
                series: [{ type: 'bar', barWidth: '62%', data: byFp.map(l => ({ value: l.fp, itemStyle: { color: l.fp >= 100 ? c.accent : c.red } })),
                    label: { show: true, position: 'right', formatter: p => p.value.toFixed(1), fontSize: 9, color: c.muted },
                    markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { color: c.ink }, label: { show: false } } }]
            });
        };
        // lineup regret
        const rows = await GT.query(`SELECT fr.week, o.display_name AS mgr, frp.slot_position AS slot, p.position AS pos, p.name, COALESCE(frp.actual_points, 0) AS pts
            FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
            WHERE fr.season = $s AND fr.week <= $w AND frp.slot_position != 'IR'`, { $s: S.season, $w: asOf });
        const games = S.played.filter(g => g.period === 'Regular' && g.week <= asOf), FIX = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'], FLEX = ['RB', 'WR', 'TE'];
        const ros = {}; rows.forEach(r => { (ros[`${r.mgr}|${r.week}`] = ros[`${r.mgr}|${r.week}`] || []).push(r); });
        const best = l => { const need = {}; l.filter(p => p.slot !== 'BE').forEach(p => { need[p.slot] = (need[p.slot] || 0) + 1; });
            const pool = l.slice().sort((x, y) => y.pts - x.pts), used = new Set();
            FIX.forEach(s => pool.filter(p => p.pos === s).slice(0, need[s] || 0).forEach(p => used.add(p)));
            pool.filter(p => FLEX.includes(p.pos) && !used.has(p)).slice(0, need.FLEX || 0).forEach(p => used.add(p));
            const opt = [...used].reduce((t, p) => t + p.pts, 0), act = l.filter(p => p.slot !== 'BE').reduce((t, p) => t + p.pts, 0);
            // pair each benched player with the starter he'd have replaced (same slot first, FLEX next, then whatever's left)
            const ins = [...used].filter(p => p.slot === 'BE').sort((x, y) => y.pts - x.pts), outs = l.filter(p => p.slot !== 'BE' && !used.has(p));
            const swaps = ins.map(i => { const k = [outs.findIndex(o => o.slot === i.pos), outs.findIndex(o => o.slot === 'FLEX' && FLEX.includes(i.pos)), 0].find(x => x >= 0);
                const o = outs.splice(k, 1)[0]; return { i, o, gain: i.pts - (o ? o.pts : 0) }; });
            return { opt, act, left: Math.max(0, opt - act), swaps }; };
        const weeks = [];
        games.forEach(g => [[g.home, g.hs, g.aws], [g.away, g.aws, g.hs]].forEach(([m, pf, pa]) => {
            const l = ros[`${m}|${g.week}`]; if (!l) return; const r = best(l);
            weeks.push({ m, week: g.week, id: g.id, pf, pa, ...r, cost: pf < pa && r.opt > pa });
        }));
        const by = {}; weeks.forEach(w => { const x = by[w.m] || (by[w.m] = { name: w.m, left: 0, cost: 0, perfect: 0 }); x.left += w.left; x.cost += w.cost ? 1 : 0; x.perfect += w.left < 0.05 ? 1 : 0; });
        const R = Object.values(by).sort((x, y) => x.left - y.left);
        const worst = weeks.slice().sort((x, y) => y.left - x.left).slice(0, 5);
        return title('Lineups') + `<div class="chart-card"><div class="chart-h">FP+ by manager</div><div class="chart tall" id="ch-fp"></div></div>`
            + sub('Efficiency') + table(['FP+', 'Eff', 'Left'], '46px 52px 50px', L.slice().sort((x, y) => y.eff - x.eff).map(l => trow(b, l.name, [l.fp.toFixed(1), `<b>${l.eff.toFixed(1)}%</b>`, pts(l.left)])))
            + sub('Lineup Regret') + table(['Perfect', 'Lost', 'Left'], '50px 40px 50px', R.map(l => trow(b, l.name, [l.perfect, l.cost ? `<b class="neg">${l.cost}</b>` : '0', `<b>${pts(l.left)}</b>`])))
            // tap a regret to see who should have started; a red glow = the better lineup would have won that game
            + sub('Biggest Regrets') + `<div class="card">${worst.map(w => `<details class="rg-d${w.cost ? ' lost' : ''}"><summary class="rg-r"><img src="${GT.logo(w.m)}" alt="">
                <span class="rg-main"><b>${esc(w.m)}</b></span><span class="rg-n"><b class="neg">${pts(w.left)}</b><small>Week ${w.week}</small></span></summary>
                <div class="rg-more"><div class="rg-sw rg-sh"><span>Start</span><span>Bench</span><span>Gain</span></div>${w.swaps.map(s => `<div class="rg-sw"><span><b>${esc(s.i.name)}</b><small>${esc(s.i.pos)} · ${pts(s.i.pts)}</small></span>
                    <span><b>${esc(s.o ? s.o.name : 'empty slot')}</b><small>${s.o ? `${esc(s.o.slot)} · ${pts(s.o.pts)}` : ''}</small></span>
                    <span class="rg-g pos">+${pts(s.gain)}</span></div>`).join('')}<a href="#/game/${w.id}">Open game center →</a></div></details>`).join('')}</div>`;
    }

    async function projections({ S, asOf, b }) {
        const L = await managerLines(S, asOf), { list } = await pairs();
        const names = L.map(l => l.name).sort((x, y) => y.localeCompare(x));
        const cells = [];
        L.forEach(l => l.weeks.forEach(w => { if (w.m && w.m.projected > 0) cells.push({ value: [w.week - 1, names.indexOf(l.name), Math.round((w.pf - w.m.projected) * 10) / 10], name: l.name, id: w.id }); }));
        const lim = Math.max(10, ...cells.map(d => Math.abs(d.value[2])));
        const bins = [[50, 60], [60, 70], [70, 80], [80, 90], [90, 101]].map(([lo, hi]) => {
            const g = list.filter(x => { const f = Math.max(x.p, 1 - x.p) * 100; return f >= lo && f < hi && x.am !== 0; });
            return { label: `${lo}-${Math.min(hi, 100)}%`, actual: g.length ? g.filter(x => (x.p >= 0.5) === (x.am > 0)).length / g.length * 100 : null,
                     predicted: g.length ? g.reduce((t, x) => t + Math.max(x.p, 1 - x.p), 0) / g.length * 100 : null };
        });
        const ups = list.filter(g => g.season === S.season && g.week <= asOf && g.am !== 0)
            .map(g => { const hw = g.am > 0; return { g, win: hw ? g.home : g.away, lose: hw ? g.away : g.home, p: hw ? g.p : 1 - g.p, ws: hw ? g.hs : g.aws, ls: hw ? g.aws : g.hs }; })
            .sort((x, y) => x.p - y.p).slice(0, 5);
        // the matrix scrolls sideways once more than five weeks are in it
        const heatW = asOf > 5 ? 72 + asOf * 52 : 0;
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-heat', {
                grid: { left: 64, right: 8, top: 4, bottom: 44 },
                tooltip: { confine: true, formatter: p => `<b>${esc(p.data.name)}</b> · week ${p.data.value[0] + 1}<br>${p.data.value[2] >= 0 ? '+' : ''}${p.data.value[2]} vs projection` },
                xAxis: { type: 'category', data: Array.from({ length: asOf }, (_, i) => `W${i + 1}`), axisLabel: { color: c.muted, fontSize: 9 } },
                yAxis: { type: 'category', data: names, axisLabel: { fontSize: 9, fontWeight: 600, color: c.ink } },
                visualMap: { min: -lim, max: lim, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 110, itemWidth: 9, text: ['Beat it', 'Missed'], textStyle: { fontSize: 9, color: c.muted },
                             inRange: { color: [c.red, c.surface, c.accent] } },
                series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: c.surface, borderWidth: 1 } }]
            }, p => { if (p.data && p.data.id) location.hash = `#/game/${p.data.id}`; });
            mount(el, 'ch-cal', {
                grid: { left: 38, right: 10, top: 28, bottom: 26 },
                legend: { top: 0, left: 'center', itemWidth: 10, itemHeight: 7, textStyle: { fontSize: 9, color: c.muted } },
                tooltip: { trigger: 'axis', confine: true },
                xAxis: { type: 'category', data: bins.map(x => x.label), axisLabel: { color: c.muted, fontSize: 9 } },
                yAxis: { type: 'value', min: 40, max: 100, axisLabel: { formatter: '{value}%', color: c.muted, fontSize: 9 }, splitLine: { lineStyle: { color: c.line } } },
                series: [{ name: 'Actually won', type: 'bar', barWidth: '48%', data: bins.map(x => x.actual && Math.round(x.actual * 10) / 10), itemStyle: { color: c.accent } },
                         { name: 'Projected', type: 'line', data: bins.map(x => x.predicted && Math.round(x.predicted * 10) / 10), symbolSize: 6, lineStyle: { color: c.ink }, itemStyle: { color: c.ink } }]
            });
        };
        return title('Projections') + `<div class="chart-card"><div class="chart-h">Actual vs projected</div>
                <div class="heat-scroll"><div class="chart tall" id="ch-heat"${heatW ? ` style="width:${heatW}px"` : ''}></div></div></div>
            <div class="chart-card"><div class="chart-h">Projection accuracy</div><div class="chart" id="ch-cal"></div></div>
            ${sub('Biggest Upsets')}<div class="card">${ups.map(u => `<a class="rg-r" href="#/game/${u.g.id}"><img src="${GT.logo(u.win)}" alt="">
                <span class="rg-main"><b>${esc(u.win)} over ${esc(u.lose)}</b><small>W${u.g.week} · ${pts(u.ws)}-${pts(u.ls)}</small></span>
                <span class="rg-n"><b>${pct(u.p)}</b><small>win chance</small></span></a>`).join('') || '<p class="muted" style="padding:14px">No games with projections yet.</p>'}</div>`;
    }
})();
