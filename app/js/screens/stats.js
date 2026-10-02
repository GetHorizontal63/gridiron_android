/* Stats: the website's analytics dashboard, rebuilt for a phone. One view at a time (chips), a season / as-of-week /
   focus picker shared by every view. Charts are ECharts (bundled), coloured from the app theme. */
(function () {
    const { esc } = APP;
    const { pts, ord } = LIB;
    const VIEWS = [['overview', 'Overview'], ['odds', 'Odds'], ['luck', 'Luck'], ['lineups', 'Lineups'], ['projections', 'Projections'], ['leaders', 'Leaders']];
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
            const view = VIEWS.some(v => v[0] === route.query.get('view')) ? route.query.get('view') : 'overview';
            const S = await LIB.season(year);
            const asOf = Math.min(Number(route.query.get('week')) || S.lastWeek, S.lastWeek);
            const focus = route.query.get('focus') || '';
            const q = (k, v) => { const p = new URLSearchParams(route.query); p.set(k, v); if (k !== 'view' && !v) p.delete(k); return `#/stats?${p}`; };
            this.ctx = { b, S, year, view, asOf, focus, q };

            const owners = S.divisions.flatMap(d => d.owners).sort((x, y) => x.localeCompare(y));
            const head = `
                ${APP.seasonChips(years, year, y => `#/stats?view=${view}&season=${y}`)}
                <div class="chips">${VIEWS.map(([k, l]) => `<a class="chip${k === view ? ' on' : ''}" href="${q('view', k)}" data-replace>${l}</a>`).join('')}
                    <a class="chip" href="#/standings?season=${year}">Standings ›</a></div>
                ${view === 'leaders' ? '' : `<div class="pickers">
                    <label><span>As of</span><select id="pk-week">${Array.from({ length: S.lastWeek }, (_, i) => i + 1).map(w => `<option value="${w}"${w === asOf ? ' selected' : ''}>Week ${w}</option>`).join('')}</select></label>
                    <label><span>Focus</span><select id="pk-focus"><option value="">Whole league</option>${owners.map(o => `<option${o === focus ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
                </div>`}`;
            if (!S.lastWeek) return head + '<p class="muted pad">No games yet this season.</p>';
            const body = await ({ overview, odds, luck, lineups, projections, leaders })[view](this.ctx);
            return head + body;
        },
        after(route, el) {
            APP.replaceLinks(el);
            el.querySelectorAll('.chips .on').forEach(on => on.scrollIntoView({ inline: 'center', block: 'nearest' }));
            const { q } = this.ctx;
            const wk = el.querySelector('#pk-week'), fc = el.querySelector('#pk-focus');
            if (wk) wk.addEventListener('change', () => location.replace(q('week', wk.value)));
            if (fc) fc.addEventListener('change', () => location.replace(q('focus', fc.value)));
            if (this.draw) { this.draw(el); this.draw = null; }
            el.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', () => location.replace(q('sort', btn.dataset.sort))));
            el.querySelectorAll('[data-set]').forEach(btn => btn.addEventListener('click', () => { const p = new URLSearchParams(route.query); p.set('set', btn.dataset.set); p.delete('sort'); location.replace(`#/stats?${p}`); }));
        }
    });
    const screen = () => APP.screenDef('stats');

    // ---------------------------------------------------------------- views
    const tile = (label, value, sub = '') => `<div class="tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

    async function overview({ S, asOf, focus }) {
        const L = await managerLines(S, asOf), T = LIB.odds(S, 2000, asOf);
        const P = (await pairs()).list.filter(g => g.season === S.season && g.week <= asOf && g.period === 'Regular');
        if (focus) {
            const me = L.find(l => l.name === focus), rank = k => ord(1 + L.filter(x => x[k] != null && x[k] > me[k]).length);
            return `<div class="tiles">
                ${tile('Record', `${me.w}-${me.l}`, `${me.xw.toFixed(1)} expected wins`)}
                ${tile('Luck', `${me.luck >= 0 ? '+' : ''}${me.luck.toFixed(1)}`, `wins vs expected · ${rank('luck')}`)}
                ${tile('Points / game', pts(me.ppg), `${rank('ppg')} in the league`)}
                ${tile('FP+', me.fp == null ? '-' : me.fp.toFixed(1), `vs projection · ${rank('fp')}`)}
                ${tile('Efficiency', me.eff == null ? '-' : me.eff.toFixed(1) + '%', `${pts(me.left)} pts left on bench`)}
                ${tile(S.playin ? 'Bracket odds' : 'Playoff odds', pct(T[focus].playoffs, 1), S.playin ? `title ${pct(T[focus].title, 1)}` : `${T[focus].wins.toFixed(1)} proj. wins`)}
            </div>`;
        }
        const games = S.played.filter(g => g.period === 'Regular' && g.week <= asOf);
        const ppg = games.length ? games.reduce((t, g) => t + g.hs + g.aws, 0) / (games.length * 2) : null;
        const upsets = P.filter(g => (g.p >= 0.5) !== (g.am > 0)).length;
        const mae = P.length ? P.reduce((t, g) => t + Math.abs(g.am - g.pm), 0) / P.length : null;
        const lucky = L.slice().sort((x, y) => y.luck - x.luck)[0];
        const fav = Object.entries(T).sort((x, y) => (S.playin ? y[1].title - x[1].title : y[1].playoffs - x[1].playoffs))[0];
        const lg = RosterMetrics.pool(L.flatMap(l => l.weeks.map(w => w.m)).filter(Boolean));
        return `<div class="tiles">
            ${tile('Points / game', pts(ppg), `${games.length} games`)}
            ${tile('Upset rate', P.length ? pct(upsets / P.length) : '-', `underdog won ${upsets} of ${P.length}`)}
            ${tile('Projection miss', pts(mae), 'pts off the projected margin')}
            ${tile('League FP+', lg.fp == null ? '-' : lg.fp.toFixed(1), `efficiency ${lg.eff == null ? '-' : lg.eff.toFixed(1) + '%'}`)}
            ${tile('Luckiest', lucky ? esc(lucky.name) : '-', lucky ? `${lucky.luck >= 0 ? '+' : ''}${lucky.luck.toFixed(1)} wins vs expected` : '')}
            ${tile(S.playin ? 'Title favorite' : 'Best odds', esc(fav[0]), S.playin ? pct(fav[1].title, 1) : pct(fav[1].playoffs, 1))}
        </div>
        <p class="note pad">Pick a manager in Focus to see their numbers. Odds come from simulating the rest of the season from week ${asOf}.</p>`;
    }

    async function odds({ S, asOf, focus, b }) {
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
                series: owners.map(o => ({ name: o, type: 'line', smooth: true, symbol: 'none',
                    data: traj.map(t => Math.round(t[o].playoffs * 1000) / 10),
                    lineStyle: { width: o === focus ? 3.5 : 1.4, color: o === focus ? c.accent : focus ? c.line : undefined }, z: o === focus ? 9 : 2 }))
            });
        };
        return `<div class="chart-card"><div class="chart-h">${S.playin ? 'Championship-bracket odds' : 'Playoff odds'} after each week</div><div class="chart" id="ch-traj"></div></div>
            <div class="card">${owners.map(o => { const t = T[o];
                return `<a class="odds-row${o === focus ? ' on' : ''}" href="#/manager/${b.byName[o.toLowerCase()].id}"><img src="${GT.logo(o)}" alt="">
                    <span class="odds-main"><b>${esc(o)}</b><small>${S.playin ? `Bye ${pct(t.bye)} · Play-in ${pct(t.playIn)} · Gulag ${pct(t.gulag)} · Title ${pct(t.title)}` : `${t.wins.toFixed(1)} projected wins`}</small>
                    <span class="odds-bar"><i style="width:${(t.playoffs * 100).toFixed(1)}%"></i></span></span><span class="odds-num">${pct(t.playoffs)}</span></a>`; }).join('')}</div>`;
    }

    async function luck({ S, asOf, focus, b }) {
        const L = (await managerLines(S, asOf)).filter(l => l.g);
        const max = Math.ceil(Math.max(1, ...L.map(l => Math.max(l.w, l.xw))) + 0.5);
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-luck', {
                grid: { left: 34, right: 16, top: 12, bottom: 36 },
                tooltip: { confine: true, formatter: p => p.data && p.data.name ? `<b>${esc(p.data.name)}</b><br>${p.data.value[1]} wins, ${p.data.value[0].toFixed(1)} expected` : '' },
                xAxis: { type: 'value', name: 'Expected wins', nameLocation: 'middle', nameGap: 24, min: 0, max, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                yAxis: { type: 'value', min: 0, max, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                series: [{ type: 'line', data: [[0, 0], [max, max]], symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: c.muted } },
                         { type: 'scatter', symbolSize: 13, data: L.map(l => ({ name: l.name, value: [l.xw, l.w],
                             itemStyle: { color: focus && l.name !== focus ? c.line : l.luck >= 0 ? c.accent : c.red, borderColor: c.surface, borderWidth: 1 },
                             label: { show: !focus || l.name === focus, formatter: l.name, position: 'right', fontSize: 9, color: c.ink } })) }]
            });
        };
        return `<div class="chart-card"><div class="chart-h">Actual wins vs expected wins (all-play). Above the line = lucky.</div><div class="chart" id="ch-luck"></div></div>
            <div class="card">${L.slice().sort((x, y) => y.luck - x.luck).map((l, i) => `<a class="row${l.name === focus ? ' on' : ''}" href="#/manager/${b.byName[l.name.toLowerCase()].id}">
                <span class="yr small">${i + 1}</span><img class="row-logo" src="${GT.logo(l.name)}" alt="">
                <span class="row-main"><b>${esc(l.name)}</b><small>${l.w}-${l.l} · ${l.xw.toFixed(1)} expected wins</small></span>
                <span class="row-num ${l.luck >= 0 ? 'pos' : 'neg'}">${l.luck >= 0 ? '+' : ''}${l.luck.toFixed(1)}</span></a>`).join('')}</div>`;
    }

    async function lineups({ S, asOf, focus, b }) {
        const L = (await managerLines(S, asOf)).filter(l => l.fp != null);
        const byFp = L.slice().sort((x, y) => x.fp - y.fp);
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-fp', {
                grid: { left: 70, right: 34, top: 6, bottom: 20 },
                tooltip: { confine: true, formatter: p => `<b>${esc(p.name)}</b><br>FP+ ${p.value.toFixed(1)}` },
                xAxis: { type: 'value', min: v => Math.floor(Math.min(90, v.min) / 5) * 5, max: v => Math.ceil(Math.max(110, v.max) / 5) * 5, axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.line } } },
                yAxis: { type: 'category', data: byFp.map(l => l.name), axisLabel: { color: c.ink, fontSize: 10, fontWeight: 600 } },
                series: [{ type: 'bar', barWidth: '62%', data: byFp.map(l => ({ value: l.fp, itemStyle: { color: focus && l.name !== focus ? c.line : l.fp >= 100 ? c.accent : c.red } })),
                    label: { show: true, position: 'right', formatter: p => p.value.toFixed(1), fontSize: 9, color: c.muted },
                    markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { color: c.ink }, label: { show: false } } }]
            });
        };
        return `<div class="chart-card"><div class="chart-h">FP+: starters' points ÷ ESPN projection × 100</div><div class="chart tall" id="ch-fp"></div></div>
            <div class="section-h"><h2 style="font-size:18px">Lineup efficiency</h2></div>
            <p class="note pad">Points scored ÷ the best lineup the roster allowed (bench players who beat a starter at their position).</p>
            <div class="card">${L.slice().sort((x, y) => y.eff - x.eff).map((l, i) => `<a class="row${l.name === focus ? ' on' : ''}" href="#/manager/${b.byName[l.name.toLowerCase()].id}">
                <span class="yr small">${i + 1}</span><img class="row-logo" src="${GT.logo(l.name)}" alt="">
                <span class="row-main"><b>${esc(l.name)}</b><small>${pts(l.left)} pts left on the bench</small></span>
                <span class="row-num">${l.eff.toFixed(1)}%</span></a>`).join('')}</div>`;
    }

    async function projections({ S, asOf, focus }) {
        const L = await managerLines(S, asOf), { list, sigma } = await pairs();
        const names = L.map(l => l.name).sort((x, y) => y.localeCompare(x));
        const cells = [];
        L.forEach(l => l.weeks.forEach(w => { if (w.m && w.m.projected > 0) cells.push({ value: [w.week - 1, names.indexOf(l.name), Math.round((w.pf - w.m.projected) * 10) / 10], name: l.name, id: w.id }); }));
        const lim = Math.max(10, ...cells.map(d => Math.abs(d.value[2])));
        const bins = [[50, 60], [60, 70], [70, 80], [80, 90], [90, 101]].map(([lo, hi]) => {
            const g = list.filter(x => { const f = Math.max(x.p, 1 - x.p) * 100; return f >= lo && f < hi && x.am !== 0; });
            return { label: `${lo}-${Math.min(hi, 100)}%`, n: g.length, actual: g.length ? g.filter(x => (x.p >= 0.5) === (x.am > 0)).length / g.length * 100 : null,
                     predicted: g.length ? g.reduce((t, x) => t + Math.max(x.p, 1 - x.p), 0) / g.length * 100 : null };
        });
        const ups = list.filter(g => g.season === S.season && g.week <= asOf && g.am !== 0)
            .map(g => { const hw = g.am > 0; return { g, win: hw ? g.home : g.away, lose: hw ? g.away : g.home, p: hw ? g.p : 1 - g.p, ws: hw ? g.hs : g.aws, ls: hw ? g.aws : g.hs }; })
            .filter(u => !focus || u.win === focus || u.lose === focus).sort((x, y) => x.p - y.p).slice(0, 8);
        screen().draw = el => {
            const c = C();
            mount(el, 'ch-heat', {
                grid: { left: 64, right: 8, top: 4, bottom: 44 },
                tooltip: { confine: true, formatter: p => `<b>${esc(p.data.name)}</b> · week ${p.data.value[0] + 1}<br>${p.data.value[2] >= 0 ? '+' : ''}${p.data.value[2]} vs projection` },
                xAxis: { type: 'category', data: Array.from({ length: asOf }, (_, i) => `W${i + 1}`), axisLabel: { color: c.muted, fontSize: 9 } },
                yAxis: { type: 'category', data: names, axisLabel: { fontSize: 9, fontWeight: 600, color: v => (focus && v !== focus ? c.muted : c.ink) } },
                visualMap: { min: -lim, max: lim, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 110, itemWidth: 9, text: ['Beat it', 'Missed'], textStyle: { fontSize: 9, color: c.muted },
                             inRange: { color: [c.red, c.surface, c.accent] } },
                series: [{ type: 'heatmap', data: cells.map(d => ({ ...d, itemStyle: focus && d.name !== focus ? { opacity: 0.25 } : {} })), itemStyle: { borderColor: c.surface, borderWidth: 1 } }]
            }, p => { if (p.data && p.data.id) location.hash = `#/game/${p.data.id}`; });
            mount(el, 'ch-cal', {
                grid: { left: 38, right: 10, top: 26, bottom: 26 },
                legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 7, textStyle: { fontSize: 9, color: c.muted } },
                tooltip: { trigger: 'axis', confine: true },
                xAxis: { type: 'category', data: bins.map(x => x.label), axisLabel: { color: c.muted, fontSize: 9 } },
                yAxis: { type: 'value', min: 40, max: 100, axisLabel: { formatter: '{value}%', color: c.muted, fontSize: 9 }, splitLine: { lineStyle: { color: c.line } } },
                series: [{ name: 'Actually won', type: 'bar', barWidth: '48%', data: bins.map(x => x.actual && Math.round(x.actual * 10) / 10), itemStyle: { color: c.accent } },
                         { name: 'Projected', type: 'line', data: bins.map(x => x.predicted && Math.round(x.predicted * 10) / 10), symbolSize: 6, lineStyle: { color: c.ink }, itemStyle: { color: c.ink } }]
            });
        };
        return `<div class="chart-card"><div class="chart-h">Actual minus projected starter points, week by week (tap a cell for the game)</div><div class="chart tall" id="ch-heat"></div></div>
            <div class="chart-card"><div class="chart-h">Are projections honest? Every game since 2019: the favorite's win chance vs how often they won</div><div class="chart" id="ch-cal"></div></div>
            <div class="section-h"><h2 style="font-size:18px">Biggest upsets</h2></div>
            <p class="note pad">Lowest pre-game win chance that still won (projected margin ÷ ${sigma.toFixed(1)} pts, on a normal curve).</p>
            <div class="card">${ups.map(u => `<a class="row" href="#/game/${u.g.id}"><img class="row-logo" src="${GT.logo(u.win)}" alt="">
                <span class="row-main"><b>${esc(u.win)} over ${esc(u.lose)}</b><small>Week ${u.g.week} · ${pts(u.ws)}-${pts(u.ls)}</small></span>
                <span class="row-num">${pct(u.p)}<small>win chance</small></span></a>`).join('') || '<p class="muted" style="padding:14px">No games with projections yet.</p>'}</div>`;
    }

    // ---------------------------------------------------------------- Leaders (the Stat Finder, phone-sized)
    const SETS = {
        'mgr-seasons': { label: 'Manager seasons', sorts: [['ppg', 'Points / game'], ['w', 'Wins'], ['pf', 'Points for'], ['diff', 'Differential'], ['ap', 'All-play %']] },
        'mgr-careers': { label: 'Manager careers', sorts: [['pct', 'Win %'], ['w', 'Wins'], ['ppg', 'Points / game'], ['titles', 'Titles']] },
        'games': { label: 'Team games', sorts: [['pf', 'Highest score'], ['margin', 'Biggest margin'], ['low', 'Lowest score']] },
        'h2h': { label: 'Rivalries', sorts: [['g', 'Most played'], ['pct', 'Most lopsided']] },
        'player-seasons': { label: 'Player seasons', sorts: [['pts', 'Points started'], ['pps', 'Per start'], ['starts', 'Starts']] },
        'player-games': { label: 'Player games', sorts: [['pts', 'Most points'], ['vs', 'Beat projection by']] },
        'drafts': { label: 'Draft picks', sorts: [['pts', 'Points started'], ['pps', 'Per start']] },
        'moves': { label: 'Roster moves', sorts: [['net', 'Best moves'], ['worst', 'Worst moves']] }
    };
    async function leaders({ b, year }) {
        const route = new URLSearchParams(location.hash.split('?')[1] || '');
        const set = SETS[route.get('set')] ? route.get('set') : 'mgr-seasons', def = SETS[set];
        const sort = def.sorts.some(s => s[0] === route.get('sort')) ? route.get('sort') : def.sorts[0][0];
        const scope = route.get('scope') === 'season' ? 'season' : 'all';
        const inScope = s => scope === 'all' || s === year;
        const head = `<div class="chips">${Object.entries(SETS).map(([k, v]) => `<button class="chip${k === set ? ' on' : ''}" data-set="${k}">${v.label}</button>`).join('')}</div>
            <div class="chips">${def.sorts.map(([k, l]) => `<button class="chip${k === sort ? ' on' : ''}" data-sort="${k}">${l}</button>`).join('')}
                <a class="chip${scope === 'all' ? ' on' : ''}" href="#/stats?view=leaders&season=${year}&set=${set}&sort=${sort}" data-replace>All seasons</a>
                <a class="chip${scope === 'season' ? ' on' : ''}" href="#/stats?view=leaders&season=${year}&set=${set}&sort=${sort}&scope=season" data-replace>${year} only</a></div>`;
        const row = (rank, logo, title, sub, value, valueSub, href) => `<a class="row"${href ? ` href="${href}"` : ''}><span class="yr small">${rank}</span>
            ${logo ? `<img class="row-logo" src="${logo}" alt="">` : '<span></span>'}<span class="row-main"><b>${title}</b><small>${sub}</small></span>
            <span class="row-num">${value}${valueSub ? `<small>${valueSub}</small>` : ''}</span></a>`;
        let rows = [];
        if (set === 'mgr-seasons' || set === 'mgr-careers' || set === 'games' || set === 'h2h') {
            const games = await GT.query(`SELECT m.game_id AS id, m.season, m.week, m.season_period AS period, o.display_name AS mgr, x.display_name AS opp,
                                                 t.team_score AS pf, t.opponent_score AS pa, t.owner_id AS oid
                                          FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                                          LEFT JOIN owners x ON x.owner_id = t.opponent_owner_id WHERE t.team_score IS NOT NULL`);
            const scoped = games.filter(g => inScope(g.season));
            if (set === 'games') {
                const key = { pf: g => g.pf, margin: g => g.pf - g.pa, low: g => -g.pf }[sort];
                rows = scoped.filter(g => sort !== 'low' || g.period === 'Regular').sort((x, y) => key(y) - key(x)).slice(0, 50)
                    .map((g, i) => row(i + 1, GT.logo(g.mgr), `${esc(g.mgr)} vs ${esc(g.opp || '')}`, `${esc(GT.periodLabel(g.period, g.week))} · ${g.season}`,
                        sort === 'margin' ? `+${pts(g.pf - g.pa)}` : pts(g.pf), sort === 'margin' ? `${pts(g.pf)}-${pts(g.pa)}` : '', `#/game/${g.id}`));
            } else if (set === 'h2h') {
                const pairsMap = {};
                scoped.filter(g => g.opp && g.mgr < g.opp).forEach(g => {
                    const k = `${g.mgr}|${g.opp}`, r = pairsMap[k] || (pairsMap[k] = { a: g.mgr, c: g.opp, g: 0, aw: 0 });
                    r.g++; if (g.pf > g.pa) r.aw++;
                });
                const list = Object.values(pairsMap).map(r => ({ ...r, lead: Math.max(r.aw, r.g - r.aw) / r.g, leader: r.aw >= r.g - r.aw ? r.a : r.c }));
                rows = list.filter(r => sort === 'g' || r.g >= 4).sort((x, y) => (sort === 'g' ? y.g - x.g : y.lead - x.lead) || y.g - x.g).slice(0, 50)
                    .map((r, i) => row(i + 1, GT.logo(r.leader), `${esc(r.a)} vs ${esc(r.c)}`, `${esc(r.leader)} leads`, `${r.aw}-${r.g - r.aw}`, `${r.g} games`));
            } else {
                const regular = scoped.filter(g => g.period === 'Regular');
                const pool = {};
                regular.forEach(g => { (pool[`${g.season}|${g.week}`] = pool[`${g.season}|${g.week}`] || []).push(g.pf); });
                const groups = {};
                regular.forEach(g => { const k = set === 'mgr-seasons' ? `${g.mgr}|${g.season}` : g.mgr; (groups[k] = groups[k] || []).push(g); });
                const list = Object.values(groups).map(gs => {
                    const w = gs.filter(g => g.pf > g.pa).length, pf = gs.reduce((t, g) => t + g.pf, 0), pa = gs.reduce((t, g) => t + g.pa, 0);
                    const ap = gs.reduce((t, g) => { const p = pool[`${g.season}|${g.week}`]; return t + p.filter(v => v < g.pf).length / (p.length - 1); }, 0) / gs.length;
                    const o = b.byName[gs[0].mgr.toLowerCase()];
                    const titles = Object.entries(b.finish).filter(([k, v]) => v === 1 && k.endsWith(`-${o.id}`) && inScope(Number(k.split('-')[0]))).length;
                    return { mgr: gs[0].mgr, id: o.id, season: gs[0].season, g: gs.length, w, l: gs.length - w, pf, diff: pf - pa, ppg: pf / gs.length, pct: w / gs.length, ap, titles };
                }).filter(r => r.g >= (set === 'mgr-seasons' ? 6 : 20));
                const fmt = { ppg: r => pts(r.ppg), w: r => r.w, pf: r => Math.round(r.pf), diff: r => `${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)}`, ap: r => pct(r.ap, 1), pct: r => pct(r.pct, 1), titles: r => r.titles };
                rows = list.sort((x, y) => y[sort] - x[sort] || y.ppg - x.ppg).slice(0, 50)
                    .map((r, i) => row(i + 1, GT.logo(r.mgr), esc(r.mgr) + (set === 'mgr-seasons' ? ` · ${r.season}` : ''), `${r.w}-${r.l} · ${pts(r.ppg)} per game`, fmt[sort](r), '',
                        `#/manager/${r.id}${set === 'mgr-seasons' ? `?season=${r.season}` : '?season=career'}`));
            }
        } else if (set === 'player-seasons' || set === 'player-games') {
            const starts = await GT.query(`SELECT fr.season, fr.week, o.display_name AS mgr, p.player_id AS pid, p.name, p.position AS pos,
                                                  frp.actual_points AS pts, frp.projected_points AS proj, COALESCE(frp.pro_team, p.pro_team) AS team
                                           FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id
                                           JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
                                           WHERE frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL`);
            const scoped = starts.filter(s => inScope(s.season));
            if (set === 'player-games') {
                const key = sort === 'vs' ? s => (s.proj ? s.pts - s.proj : -999) : s => s.pts;
                rows = scoped.sort((x, y) => key(y) - key(x)).slice(0, 50).map((s, i) => row(i + 1, LIB.headshot(s.pid, s.team), esc(s.name),
                    `${esc(s.pos)} · ${esc(s.mgr)} · W${s.week} ${s.season}`, pts(s.pts), sort === 'vs' ? `+${pts(s.pts - s.proj)}` : '', `#/player/${s.pid}`));
            } else {
                const groups = {};
                scoped.forEach(s => { const k = `${s.pid}|${s.season}`; (groups[k] = groups[k] || []).push(s); });
                const list = Object.values(groups).map(gs => ({ ...gs[0], starts: gs.length, pts: gs.reduce((t, s) => t + s.pts, 0),
                    mgrs: [...new Set(gs.map(s => s.mgr))].join(', ') })).map(r => ({ ...r, pps: r.pts / r.starts }))
                    .filter(r => sort !== 'pps' || r.starts >= 6);
                rows = list.sort((x, y) => y[sort] - x[sort]).slice(0, 50).map((r, i) => row(i + 1, LIB.headshot(r.pid, r.team), `${esc(r.name)} · ${r.season}`,
                    `${esc(r.pos)} · ${r.starts} starts · ${esc(r.mgrs)}`, sort === 'starts' ? r.starts : pts(r[sort]), '', `#/player/${r.pid}`));
            }
        } else if (set === 'drafts') {
            const picks = await GT.query(`SELECT t.season, ti.overall_pick AS pick, ti.to_owner_id AS oid, o.display_name AS mgr, p.player_id AS pid, p.name, p.position AS pos, p.pro_team AS team,
                    (SELECT COUNT(*) FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      WHERE fr.owner_id = ti.to_owner_id AND fr.season = t.season AND frp.player_id = ti.player_id AND frp.slot_position NOT IN ('BE','IR')) AS starts,
                    (SELECT SUM(frp.actual_points) FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                      WHERE fr.owner_id = ti.to_owner_id AND fr.season = t.season AND frp.player_id = ti.player_id AND frp.slot_position NOT IN ('BE','IR')) AS pts
                FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id
                JOIN players p ON p.player_id = ti.player_id JOIN owners o ON o.owner_id = ti.to_owner_id
                WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT'`);
            const list = picks.filter(r => inScope(r.season)).map(r => ({ ...r, pts: r.pts || 0, pps: r.starts ? (r.pts || 0) / r.starts : 0 })).filter(r => sort !== 'pps' || r.starts >= 6);
            rows = list.sort((x, y) => y[sort] - x[sort]).slice(0, 50).map((r, i) => row(i + 1, LIB.headshot(r.pid, r.team), esc(r.name),
                `Pick ${r.pick} · ${esc(r.mgr)} · ${r.season} · ${r.starts} starts`, pts(r[sort]), '', `#/player/${r.pid}`));
        } else if (set === 'moves') {
            const moves = await GT.query(`SELECT m.season, m.effective_week AS week, o.display_name AS mgr, m.kind, m.grade, m.net_started AS net,
                    (SELECT GROUP_CONCAT(p.name, ', ') FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id WHERE mp.move_id = m.move_id AND mp.direction = 'IN') AS ins,
                    (SELECT GROUP_CONCAT(p.name, ', ') FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id WHERE mp.move_id = m.move_id AND mp.direction = 'OUT') AS outs
                FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id WHERE m.provisional = 0`);
            const list = moves.filter(r => inScope(r.season) && r.net != null);
            rows = list.sort((x, y) => (sort === 'worst' ? x.net - y.net : y.net - x.net)).slice(0, 50).map((r, i) => row(i + 1, GT.logo(r.mgr),
                esc(r.ins || r.outs || r.kind), `${esc(r.kind.toLowerCase())} · ${esc(r.mgr)} · W${r.week} ${r.season}${r.outs && r.ins ? ` · out: ${esc(r.outs)}` : ''}`,
                `${r.net >= 0 ? '+' : ''}${pts(r.net)}`, r.grade ? `grade ${r.grade}` : ''));
        }
        return head + `<div class="card">${rows.join('') || '<p class="muted" style="padding:14px">Nothing here yet.</p>'}</div>`;
    }
})();
