/* The website's newer content, in the app: Historic League Moments, Draft Grades, Trades & Free Agency, and the manager
   profile's Draft (tendencies) and Rivals tabs with a page for each rivalry. */
(function () {
    const { esc } = APP;
    const { pts, ord } = LIB;
    const SITE_IMG = 'https://grasstouchers.football/assets/images/';
    const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const sg = v => `${v > 0 ? '+' : ''}${pts(v)}`;
    const POS_COLOR = { QB: '#d1495b', RB: '#2e86ab', WR: '#3b7a57', TE: '#edae49', K: '#8e7dbe', P: '#7a8b99', 'D/ST': '#4a4e69', HC: '#c06c84' };
    const chip = pos => pos ? `<span class="pchip" style="background:${POS_COLOR[pos] || '#888'}">${esc(pos === 'D/ST' ? 'D' : pos)}</span>` : '';
    const grade = (g, on = false) => `<span class="gchip${on ? ' on' : ''}">${esc(g || '-')}</span>`;

    // ================================================================ HISTORIC LEAGUE MOMENTS
    let momentsP;
    const moments = () => momentsP || (momentsP = GT.query('SELECT id, season, week, sort, title, dek, payload FROM league_moments ORDER BY sort')
        .then(rows => rows.map(r => ({ ...r, d: JSON.parse(r.payload) }))));
    const winnerOf = d => { const [a, c] = d.managers || []; return a && c ? (d.final[a] >= d.final[c] ? [a, c] : [c, a]) : []; };
    const metaOf = d => {
        if (d.phantom) return `${d.season} season · ${esc(d.phantom.owner)} ${d.phantom.record[0]}-${d.phantom.record[1]}`;
        const [W, L] = winnerOf(d);
        return W ? `${d.season} · ${esc(GT.periodLabel(d.period || 'Regular', d.week))} · ${esc(W)} ${pts(d.final[W])}-${pts(d.final[L])} ${esc(L)}` : `${d.season}`;
    };

    APP.screen('moments', {
        tab: 'more',
        bar: () => ({ back: true, title: 'League Moments' }),
        async render() {
            const list = await moments();
            return `${APP.pageHead({ eyebrow: `${list.length} matchups that came down to one moment`, title: 'Historic League Moments' })}
            <div class="hm-list">${list.map(m => { const s = m.d.story || {};
                return `<a class="hm-band" href="#/moment/${encodeURIComponent(m.id)}" style="--photo:url('${SITE_IMG}${esc(s.image || 'background-10.png')}')">
                    <span class="hm-eyebrow">${metaOf(m.d)}</span><b class="hm-title">${esc(s.title || m.title)}</b></a>`; }).join('')}</div>`;
        },
        after(route, el) { fitTitles(el, '.hm-title'); }
    });

    APP.screen('moment', {
        tab: 'more',
        bar: () => ({ back: true, title: 'League Moments' }),
        async render(route) {
            const m = (await moments()).find(x => x.id === route.args[0]);
            if (!m) return '<div class="next"><h2>Not found</h2></div>';
            const d = m.d, s = d.story || {}, [A, B] = d.managers || [], tl = d.timeline || [];
            const head = `<section class="ph hm-head" style="--photo:url('${SITE_IMG}${esc(s.image || 'background-10.png')}')"><div class="ph-text">
                <div class="ph-eyebrow">${metaOf(d)}</div><h1 class="ph-title">${esc(s.title || m.title)}</h1></div></section>`;
            // the story as pages: one step at a time, and the chart (one line, A at the top, B at the bottom, 50% in the
            // middle) draws the replay up to that step's play
            const items = [...(s.steps || []).map(st => ({ ...st, kind: 'step' })), ...(s.sections || []).map(sec => ({ h: sec.h, p: sec.p, kind: 'step' })),
                           ...(s.whatif ? [{ tag: 'What if', h: s.whatif.title, p: [s.whatif.text], kind: 'whatif' }] : [])];
            const at = st => { if (!st.at) return tl.length - 1; if (st.at === 'END GAME' && !st.g) return tl.map(e => e.desc).lastIndexOf('END GAME');
                const k = tl.findIndex(e => (!st.g || String(e.g).includes(st.g)) && String(e.desc).includes(st.at)); return k < 0 ? tl.length - 1 : k; };
            const marks = items.map(at);
            const pages = items.map((st, n) => `<div class="hm-page${st.kind === 'whatif' ? ' whatif' : ''}" data-n="${n}"${n ? ' hidden' : ''}>
                ${st.tag ? `<span class="hm-tag">${esc(st.tag)}</span>` : ''}<h3>${esc(st.h || '')}</h3>${(st.p || []).map(x => `<p>${md(x)}</p>`).join('')}</div>`).join('');
            const chart = tl.length ? `<div class="chart-card hm-chart"><div class="chart" id="hm-wp"></div></div>` : '';
            this.draw = el => {
                const node = el.querySelector('#hm-wp'), c = { a: SITE.color('accent'), b: SITE.color('loss'), muted: SITE.color('muted'), line: SITE.color('line'), ink: SITE.color('ink') };
                const ch = node && typeof echarts !== 'undefined' ? echarts.init(node) : null;
                const show = n => {
                    el.querySelectorAll('.hm-page').forEach(x => { x.hidden = Number(x.dataset.n) !== n; });
                    el.querySelector('#hm-count').textContent = `${n + 1} / ${items.length}`;
                    el.querySelector('#hm-prev').disabled = n === 0; el.querySelector('#hm-next').disabled = n === items.length - 1;
                    const upto = marks[n], e = tl[upto];
                    if (e && e.a != null && e.b != null) {
                        const v = [e.a, e.b];
                        el.querySelectorAll('.hm-sc').forEach(card => { const k = Number(card.dataset.k);
                            card.querySelector('span').textContent = Number(v[k]).toFixed(2); card.classList.toggle('won', v[k] > v[1 - k]); });
                    }
                    if (!ch) return;
                    ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, animationDurationUpdate: 500, grid: { left: 62, right: 14, top: 14, bottom: 14 },
                        tooltip: { trigger: 'axis', confine: true, formatter: ps => { const e = tl[ps[0].dataIndex]; const v = e.wp * 100;
                            return `${esc(String(e.desc || '').slice(0, 90))}<br>${esc(v >= 50 ? A : B)} ${Math.round(v >= 50 ? v : 100 - v)}%`; } },
                        xAxis: { type: 'category', boundaryGap: false, data: tl.map((_, k) => k), axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false } },   // plays on the gridlines: the line ends at the dot
                        // dashed reference lines every 10%, solid lines at every 25%
                        yAxis: [{ type: 'value', min: 0, max: 100, interval: 10, axisLabel: { color: c.ink, fontSize: 10, fontWeight: 800, formatter: v => v === 100 ? A : v === 0 ? B : v === 50 ? '50%' : '' },
                                  splitLine: { lineStyle: { color: c.line, type: 'dashed' } } },
                                { type: 'value', min: 0, max: 100, interval: 25, position: 'left', axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
                                  splitLine: { lineStyle: { color: c.muted, opacity: 0.55 } } }],
                        series: [{ type: 'line', step: 'start', symbol: 'none', lineStyle: { width: 2.5, color: c.ink }, areaStyle: { origin: 50, color: c.a, opacity: 0.18 }, data: tl.map((e, k) => k <= upto ? +(e.wp * 100).toFixed(1) : null) },
                                 { type: 'scatter', symbolSize: 10, silent: true, data: tl.map((e, k) => k === upto ? +(e.wp * 100).toFixed(1) : null), itemStyle: { color: c.a, borderColor: c.ink, borderWidth: 2 } }] }, false);
                };
                // the pages share one height (the tallest), so the arrows never move
                const box = el.querySelector('.hm-pages');
                if (box) { const all = [...box.children]; all.forEach(x => { x.hidden = false; }); box.style.minHeight = `${Math.max(...all.map(x => x.offsetHeight))}px`;
                    all.forEach(x => { x.style.minHeight = box.style.minHeight; }); }
                let cur = 0;
                el.querySelector('#hm-prev').addEventListener('click', () => show(cur = Math.max(0, cur - 1)));
                el.querySelector('#hm-next').addEventListener('click', () => show(cur = Math.min(items.length - 1, cur + 1)));
                window.addEventListener('resize', () => ch && ch.resize());
                show(0);
            };
            // the two scores, updated to each step's play as the story pages forward
            const final = A && B ? `<div class="hm-final">${[A, B].map((n, k) => `<div class="hm-sc" data-k="${k}"><img src="${GT.logo(n)}" alt=""><b>${esc(n)}</b><span>${Number(d.final[n]).toFixed(2)}</span></div>`).join('')}</div>` : '';
            return head + final + chart + `<div class="hm-pages">${pages}</div>
                <div class="hm-nav"><button id="hm-prev">${APP.icon('prev')}</button><span id="hm-count"></span><button id="hm-next">${APP.icon('next')}</button></div>
                ${d.game_id ? `<a class="btn-wide" href="#/game/${d.game_id}">Open game center</a>` : ''}`;
        },
        after(route, el) { if (this.draw) { this.draw(el); this.draw = null; } }
    });
    function fitTitles(el, sel) { el.querySelectorAll(sel).forEach(h => { let s = parseFloat(getComputedStyle(h).fontSize); while (h.scrollWidth > h.clientWidth && s > 16) h.style.fontSize = `${--s}px`; }); }

    // ================================================================ DRAFT GRADES
    APP.screen('draftgrades', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Draft Grades' }),
        async render(route) {
            const b = await GT.load();
            const years = (await GT.query('SELECT DISTINCT season FROM draft_grades ORDER BY season DESC')).map(r => r.season);
            const year = years.includes(Number(route.query.get('season'))) ? Number(route.query.get('season')) : years[0];
            const view = route.query.get('view') === 'board' ? 'board' : 'teams';
            const [grades, picks] = await Promise.all([
                GT.query(`SELECT g.owner_id AS id, o.display_name AS name, g.pre_grade AS pre, g.post_grade AS post, g.post_rank AS rank, g.pre_rank AS preRank,
                                 g.best_pick AS best, g.worst_pick AS worst, g.provisional AS prov, g.actual_points AS apts, g.starters_hit AS hits
                          FROM draft_grades g JOIN owners o ON o.owner_id = g.owner_id WHERE g.season = $s ORDER BY g.post_rank`, { $s: year }),
                GT.query(`SELECT d.overall_pick AS pick, d.round, d.owner_id AS id, d.pos, d.post_grade AS grade, d.actual_points AS apts, p.player_id AS pid, p.name
                          FROM draft_picks d JOIN players p ON p.player_id = d.player_id WHERE d.season = $s ORDER BY d.overall_pick`, { $s: year })
            ]);
            const byPick = Object.fromEntries(picks.map(p => [p.pick, p]));
            const nameOf = id => (b.byId[id] || {}).name || '';
            const pickLine = n => { const p = byPick[n]; return p ? `${chip(p.pos)}<span title="Pick ${n}">${esc(p.name)}</span>` : '-'; };
            // each team expands to its draft at a glance: grades and rank, points, starters hit, its picks' best and worst
            const teams = `<div class="card">${grades.map(g => { const mine = picks.filter(p => p.id === g.id);
                return `<details class="dg-d"><summary class="dg-row"><img src="${GT.logo(g.name)}" alt=""><span class="dg-main"><b>${esc(g.name)}</b></span>
                    <span class="dg-grades">${grade(g.pre)}<i>→</i>${grade(g.post, true)}${g.prov ? '<sup>*</sup>' : ''}</span></summary>
                    <div class="dg-more"><div class="dg-kpis"><span><b>${g.rank ? ord(g.rank) : '-'}</b><small>Grade rank</small></span><span><b>${pts(g.apts)}</b><small>Points</small></span>
                        <span><b>${g.hits ?? '-'}</b><small>Starters hit</small></span><span><b>${mine.length}</b><small>Picks</small></span></div>
                        <div class="dg-pk"><em>Best</em>${pickLine(g.best)}</div><div class="dg-pk"><em>Worst</em>${pickLine(g.worst)}</div>
                        <a href="#/manager/${g.id}">Manager page →</a></div></details>`; }).join('')}</div>
                ${grades.some(g => g.prov) ? '<p class="note pad" style="margin-top:8px">* Season in progress: the after-season grade is provisional.</p>' : ''}`;
            // the board: teams across in round-1 order, rounds down; each cell is the pick, colored by position
            const order = picks.filter(p => p.round === 1).sort((x, y) => x.pick - y.pick).map(p => p.id);
            const rounds = Math.max(0, ...picks.map(p => p.round));
            const cellOf = {}; picks.forEach(p => { cellOf[`${p.round}|${p.id}`] = p; });
            const last = n => { const w = String(n).split(' '); return w.length > 1 && !/D\/ST/.test(n) ? w.slice(1).join(' ') : n.replace(' D/ST', ''); };
            const board = `<div class="db-scroll"><table class="dboard"><thead><tr><th></th>${order.map(id => `<th><img src="${GT.logo(nameOf(id))}" alt=""><span>${esc(nameOf(id))}</span></th>`).join('')}</tr></thead>
                <tbody>${Array.from({ length: rounds }, (_, i) => `<tr><th>${i + 1}</th>${order.map(id => { const p = cellOf[`${i + 1}|${id}`];
                    return p ? `<td style="--pc:${POS_COLOR[p.pos] || '#888'}" onclick="location.hash='#/player/${p.pid}'"><i>${p.pick}</i><b>${esc(last(p.name))}</b><small>${esc(p.pos === 'D/ST' ? 'D' : p.pos)}</small></td>` : '<td></td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`;
            return `${APP.pageHead({ eyebrow: `${year} draft · draft day and final grades`, title: 'Draft Grades' })}
                ${APP.seasonChips(years, year, y => `#/draftgrades?season=${y}&view=${view}`)}
                <div class="chips"><a class="chip${view === 'teams' ? ' on' : ''}" href="#/draftgrades?season=${year}" data-replace>Teams</a>
                    <a class="chip${view === 'board' ? ' on' : ''}" href="#/draftgrades?season=${year}&view=board" data-replace>Draft board</a></div>
                ${view === 'board' ? board : teams}`;
        },
        after(route, el) { APP.replaceLinks(el); }
    });

    // ================================================================ TRADES & FREE AGENCY
    APP.screen('moves', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Trades & Free Agency' }),
        async render(route) {
            const b = await GT.load();
            const years = (await GT.query('SELECT DISTINCT season FROM transaction_moves ORDER BY season DESC')).map(r => r.season);
            const year = years.includes(Number(route.query.get('season'))) ? Number(route.query.get('season')) : years[0];
            const kind = route.query.get('kind') === 'PICKUP' ? 'PICKUP' : 'TRADE';
            const rows = await GT.query(`
                SELECT m.move_id AS id, m.transaction_id AS tx, m.effective_week AS week, o.display_name AS mgr, m.owner_id AS oid, m.grade, m.net_started AS net
                FROM transaction_moves m JOIN owners o ON o.owner_id = m.owner_id WHERE m.season = $s AND m.kind = $k`, { $s: year, $k: kind });
            const players = await GT.query(`SELECT mp.move_id AS id, mp.direction AS dir, p.player_id AS pid, p.name, p.position AS pos
                FROM transaction_move_players mp JOIN players p ON p.player_id = mp.player_id JOIN transaction_moves m ON m.move_id = mp.move_id
                WHERE m.season = $s AND m.kind = $k`, { $s: year, $k: kind });
            const pl = {}; players.forEach(r => { (pl[`${r.id}|${r.dir}`] = pl[`${r.id}|${r.dir}`] || []).push(r); });
            const plist = (id, dir) => (pl[`${id}|${dir}`] || []).map(x => `<span class="pnm">${chip(x.pos)}<span>${esc(x.name)}</span></span>`).join('') || '<span class="muted">-</span>';
            const net = v => `<b class="mv-net ${(v || 0) >= 0 ? 'pos' : 'neg'}">${sg(v || 0)}</b>`;
            let list;
            if (kind === 'TRADE') {
                // one card per trade: each side's manager, the players he got, and his net started points
                const by = {}; rows.forEach(r => { (by[r.tx] = by[r.tx] || []).push(r); });
                const trades = Object.values(by).sort((x, y) => Math.max(...y.map(r => Math.abs(r.net || 0))) - Math.max(...x.map(r => Math.abs(r.net || 0))));
                list = trades.map(sides => `<div class="tr-card"><div class="tr-head"><span>Week ${sides[0].week ?? '-'}</span></div>
                    <div class="tr-sides">${sides.map(r => `<div class="tr-side"><div class="tr-who"><img src="${GT.logo(r.mgr)}" alt=""><b>${esc(r.mgr)}</b>${r.grade ? grade(r.grade, true) : ''}</div>
                        <div class="tr-got">${plist(r.id, 'IN')}</div><div class="tr-foot"><small>Net started</small>${net(r.net)}</div></div>`).join('')}</div></div>`).join('');
                list = `<div class="tr-list">${list}</div>`;
            } else {
                list = `<div class="card" data-pager>${rows.sort((x, y) => (y.net || 0) - (x.net || 0)).map(r => `<div class="fa-row"><img src="${GT.logo(r.mgr)}" alt="">
                    <span class="fa-main"><b>${esc(r.mgr)} <i>Week ${r.week ?? '-'}</i></b><span class="fa-in">${plist(r.id, 'IN')}</span></span>
                    <span class="fa-side">${net(r.net)}${r.grade ? grade(r.grade, true) : ''}</span></div>`).join('')}</div>`;
            }
            return `${APP.pageHead({ eyebrow: `${year} season`, title: kind === 'TRADE' ? 'Trades' : 'Free Agency' })}
                ${APP.seasonChips(years, year, y => `#/moves?season=${y}&kind=${kind}`)}
                <div class="chips"><a class="chip${kind === 'TRADE' ? ' on' : ''}" href="#/moves?season=${year}" data-replace>Trades</a>
                    <a class="chip${kind === 'PICKUP' ? ' on' : ''}" href="#/moves?season=${year}&kind=PICKUP" data-replace>Free agency</a></div>
                ${rows.length ? list : '<p class="muted pad">No moves this season.</p>'}`;
        },
        after(route, el) { APP.replaceLinks(el); }
    });

    // ================================================================ MANAGER PROFILE: DRAFT (career tendencies)
    APP.draftPane = async mgr => {
        const [picksAll, ptsRows] = await Promise.all([
            GT.query(`SELECT t.season, ti.overall_pick AS pick, ti.to_owner_id AS id, p.player_id AS pid, p.name, p.position AS pos, COALESCE(st.team, p.pro_team) AS nfl
                      FROM transactions t JOIN transaction_items ti ON ti.transaction_id = t.transaction_id JOIN players p ON p.player_id = ti.player_id
                      LEFT JOIN (${GT.SEASON_TEAM}) st ON st.season = t.season AND st.pid = p.player_id
                      WHERE t.type = 'DRAFT' AND ti.item_type = 'DRAFT' AND ti.overall_pick IS NOT NULL ORDER BY t.season, ti.overall_pick`),
            GT.query(`SELECT season, player_id AS pid, SUM(COALESCE(points, 0)) AS pts FROM player_week_points GROUP BY season, player_id`)
        ]);
        const ptsOf = {}; ptsRows.forEach(r => { ptsOf[`${r.season}|${r.pid}`] = r.pts; });
        const teams = {}, bySeason = {};
        picksAll.forEach(p => { (teams[p.season] = teams[p.season] || new Set()).add(p.id); (bySeason[p.season] = bySeason[p.season] || []).push(p); });
        Object.entries(bySeason).forEach(([s, list]) => {
            list.forEach(p => { p.round = Math.ceil(p.pick / teams[s].size); p.pts = ptsOf[`${s}|${p.pid}`] || 0; });
            const byPos = {}; list.forEach(p => { (byPos[p.pos] = byPos[p.pos] || []).push(p); });
            Object.values(byPos).forEach(l => { l.forEach((p, i) => { p.posPick = i + 1; }); l.slice().sort((x, y) => y.pts - x.pts).forEach((p, i) => { p.posFinish = i + 1; p.delta = p.posPick - p.posFinish; }); });
        });
        const mine = picksAll.filter(p => p.id === mgr.id);
        if (!mine.length) return '<p class="muted pad">No draft picks on file.</p>';
        const seasons = [...new Set(mine.map(p => p.season))];
        const league = picksAll.filter(p => seasons.includes(p.season));
        const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'D/ST', 'HC'].filter(p => league.some(x => x.pos === p));
        const share = (l, pos) => l.length ? l.filter(p => p.pos === pos).length / l.length : 0;
        const avg = (l, f) => l.length ? l.reduce((t, p) => t + f(p), 0) / l.length : 0;
        const groups = Object.values(mine.reduce((m, p) => { (m[p.pid] = m[p.pid] || []).push(p); return m; }, {}));
        const fav = groups.slice().sort((x, y) => y.length - x.length || avg(x, p => p.pick) - avg(y, p => p.pick))[0];
        const early = mine.filter(p => p.round <= 3), favPos = POS.map(p => [p, early.filter(x => x.pos === p).length]).sort((x, y) => y[1] - x[1])[0];
        const homer = (await GT.homers()).get(mgr.id);
        const rounds = Math.max(...mine.map(p => p.round));
        // the probability view: one smoothed distribution curve per position over the rounds (each sums to 100%)
        APP.drawDraft = el => {
            const node = el.querySelector('#dt-curve'); if (!node || node.offsetWidth === 0 || typeof echarts === 'undefined') return;
            const curve = pos => { const rs = mine.filter(p => p.pos === pos).map(p => p.round); if (!rs.length) return [];
                const pts_ = []; for (let x = 1; x <= rounds + 1e-9; x += 0.1) pts_.push([+x.toFixed(1), rs.reduce((t, r) => t + Math.exp(-0.5 * (x - r) ** 2), 0) / (rs.length * Math.sqrt(2 * Math.PI))]);
                const area = pts_.reduce((t, q) => t + q[1], 0) * 0.1; return pts_.map(([x, d]) => [x, +(d / area * 100).toFixed(1)]); };
            const ch = echarts.getInstanceByDom(node) || echarts.init(node), muted = SITE.color('muted'), line = SITE.color('line');
            ch.setOption({ textStyle: { fontFamily: 'Inter, sans-serif' }, grid: { left: 40, right: 12, top: 34, bottom: 28 },
                legend: { top: 0, left: 'center', itemWidth: 12, itemHeight: 7, textStyle: { color: muted, fontSize: 9 } },
                tooltip: { trigger: 'axis', confine: true, formatter: ps => `<b>Round ${Number(ps[0].axisValue).toFixed(1)}</b><br>${ps.map(p => `${p.marker}${p.seriesName} ${p.value[1]}%`).join('<br>')}` },
                xAxis: { type: 'value', min: 1, max: rounds, interval: 2, axisLabel: { color: muted, fontSize: 9 }, splitLine: { show: false } },
                yAxis: { type: 'value', min: 0, axisLabel: { color: muted, fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: line } } },
                series: POS.filter(p => mine.some(x => x.pos === p)).map(p => ({ name: p, type: 'line', smooth: true, symbol: 'none', data: curve(p), lineStyle: { width: 2, color: POS_COLOR[p] }, itemStyle: { color: POS_COLOR[p] } })) }, true);
            ch.resize();
        };
        const tile = (l, v, s) => `<div class="tile"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
        const sorted = mine.slice().sort((x, y) => y.delta - x.delta);
        const pickRow = p => `<a class="dg-pick" href="#/player/${p.pid}"><span class="dg-n">'${String(p.season).slice(2)}</span>
            <span class="dg-main"><b><span class="pnm">${chip(p.pos)}<span>${esc(p.name)}</span></span></b><small>Pick ${p.pick} · drafted ${p.pos} ${p.posPick}, finished ${p.pos} ${p.posFinish}</small></span>
            <span class="row-num ${p.delta >= 0 ? 'pos' : 'neg'}">${p.delta > 0 ? '+' : ''}${p.delta}</span></a>`;
        return `${homer ? `<div class="homer-line" style="background:${GT.teamColor(homer.team) || 'var(--accent)'}"><img class="${GT.whiteLogo(homer.team) ? 'logo-white' : ''}" src="assets/nfl-logos/${homer.team.toLowerCase()}.png" alt="">
                <span><b>Homer</b><small>Drafts more ${esc(homer.team)} players (${homer.n}) than any other team's</small></span></div>` : ''}
            <div class="tiles">${tile('Picks', mine.length, `${seasons.length} drafts`)}${tile('Favorite player', esc(fav[0].name), fav.length > 1 ? `drafted ${fav.length}x` : 'no repeats')}
                ${tile('Early-round favorite', favPos && favPos[1] ? favPos[0] : '-', `${favPos ? favPos[1] : 0} of ${early.length} picks in rounds 1-3`)}
                ${tile('Avg pick vs slot', `${avg(mine, p => p.delta) >= 0 ? '+' : ''}${avg(mine, p => p.delta).toFixed(1)}`, 'within the position')}</div>
            <div class="section-h"><h2>Position by Round</h2></div>
            ${APP.seg('dt-view', ['Matrix', 'Probability'])}
            <div id="dt-matrix" class="card dtm-wrap"><table class="dtm"><thead><tr><th></th>${Array.from({ length: rounds }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead>
                <tbody>${POS.map(pos => `<tr><th>${chip(pos)}</th>${Array.from({ length: rounds }, (_, i) => { const r = i + 1, mr = mine.filter(p => p.round === r), n = mr.filter(p => p.pos === pos).length, s = mr.length ? n / mr.length : 0;
                    return `<td style="${n ? `background:rgba(var(--accent-rgb),${(0.12 + s * 0.6).toFixed(2)})` : ''}">${n || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
            <div id="dt-chart" class="chart-card" hidden><div class="chart-h">Chance by round</div><div class="chart" id="dt-curve"></div></div>
            <div class="section-h"><h2>Position Mix</h2><span class="muted h-avg">vs the league</span></div>
            <div class="card">${POS.map(pos => { const m = mine.filter(p => p.pos === pos), me = share(mine, pos), lg = share(league, pos);
                return `<div class="mix-row">${chip(pos)}<span class="mix-bars"><i style="width:${(me * 100 * 2.4).toFixed(1)}%"></i><em style="width:${(lg * 100 * 2.4).toFixed(1)}%"></em></span>
                    <span class="mix-n"><b>${Math.round(me * 100)}%</b><small>lg ${Math.round(lg * 100)}%</small></span><span class="mix-r">R${m.length ? avg(m, p => p.round).toFixed(1) : '-'}</span></div>`; }).join('')}
                <div class="mix-key"><i></i>${esc(mgr.name)} <em></em>League · R = average round</div></div>
            <div class="section-h"><h2>Best Value Picks</h2></div><div class="card">${sorted.slice(0, 5).map(pickRow).join('')}</div>
            <div class="section-h"><h2>Biggest Misses</h2></div><div class="card">${sorted.slice(-5).reverse().map(pickRow).join('')}</div>`;
    };

    // ================================================================ MANAGER PROFILE: RIVALS
    const streak = list => { let cur = null, n = 0; for (let i = list.length - 1; i >= 0; i--) { const r = GT.result(list[i]); if (cur == null) cur = r; if (r !== cur) break; n++; } return cur ? `${cur}${n}` : '-'; };
    APP.rivalsPane = (mgr, all) => {
        const played = all.filter(g => g.oppId && g.pf != null && g.pa != null), by = {};
        played.forEach(g => { (by[g.oppId] = by[g.oppId] || []).push(g); });
        const lines = Object.entries(by).map(([id, list]) => ({ id, opp: list[0].opp, list, rec: GT.record(list), margin: (GT.sum(list, 'pf') - GT.sum(list, 'pa')) / list.length }))
            .sort((x, y) => y.list.length - x.list.length);
        return `<div class="card" data-pager>${lines.map(l => `<a class="row" href="#/rival/${mgr.id}/${l.id}"><img class="row-logo" src="${GT.logo(l.opp)}" alt="">
            <span class="row-main"><b>${esc(l.opp)}</b><small>${l.list.length} games · streak ${streak(l.list)}</small></span>
            <span class="row-num">${l.rec.text}<small>${l.list[l.list.length - 1].season} W${l.list[l.list.length - 1].week}</small></span></a>`).join('')}</div>`;
    };

    APP.screen('rival', {
        tab: 'managers',
        bar: () => ({ back: true, title: 'Rivalry' }),
        async render(route) {
            const b = await GT.load();
            const mgr = await GT.manager(route.args[0]), oppId = Number(route.args[1]);
            const list = (await GT.games(mgr.id)).filter(g => g.oppId === oppId && g.pf != null && g.pa != null);
            if (!list.length) return '<div class="next"><h2>No games</h2></div>';
            const opp = list[0].opp, rec = GT.record(list);
            const lineup = await GT.query(`SELECT fr.season, fr.week, fr.owner_id AS id, p.name, COALESCE(frp.actual_points, 0) AS pts, COALESCE(frp.projected_points, 0) AS proj
                FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id JOIN players p ON p.player_id = frp.player_id
                WHERE frp.slot_position NOT IN ('BE','IR') AND fr.owner_id IN ($a, $c)`, { $a: mgr.id, $c: oppId });
            const lu = {}; lineup.forEach(r => { (lu[`${r.season}|${r.week}|${r.id}`] = lu[`${r.season}|${r.week}|${r.id}`] || []).push(r); });
            const top = l => (l || []).reduce((m, p) => !m || p.pts > m.pts ? p : m, null);
            const proj = l => l && l.filter(p => p.proj > 0).length >= l.length * 0.8 ? l.reduce((t, p) => t + p.proj, 0) : null;
            const tile = (l, v, s) => `<div class="tile"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
            const big = list.filter(g => g.pf > g.pa).reduce((m, g) => !m || g.pf - g.pa > m.pf - m.pa ? g : m, null);
            const bad = list.filter(g => g.pf < g.pa).reduce((m, g) => !m || g.pa - g.pf > m.pa - m.pf ? g : m, null);
            let upsets = 0;
            const log = list.slice().reverse().map(g => {
                const a = lu[`${g.season}|${g.week}|${mgr.id}`], c = lu[`${g.season}|${g.week}|${oppId}`], pa = proj(a), pc = proj(c);
                const upset = pa != null && pc != null && g.pf !== g.pa && (g.pf > g.pa) !== (pa > pc); if (upset) upsets++;
                const ta = top(a), tc = top(c), r = GT.result(g);
                return `<a class="rv-g" href="#/game/${g.gameId}"><span class="res ${r === 'W' ? 'w' : r === 'L' ? 'l' : ''}">${r}</span>
                    <span class="dg-main"><b>${pts(g.pf)}-${pts(g.pa)} <i class="muted">${esc(GT.periodLabel(g.period, g.week))} · ${g.season}</i></b>
                        <small>${pa != null && pc != null ? `Projected ${pts(pa)}-${pts(pc)}` : 'No projection'}${upset ? ' · <em class="upset">Upset</em>' : ''}</small>
                        <small>Top: ${ta ? `${esc(ta.name)} ${pts(ta.pts)}` : '-'} / ${tc ? `${esc(tc.name)} ${pts(tc.pts)}` : '-'}</small></span>
                    <span class="row-num ${g.pf >= g.pa ? 'pos' : 'neg'}">${sg(g.pf - g.pa)}</span></a>`;
            }).join('');
            return `${APP.pageHead({ eyebrow: `${esc(mgr.name)} vs ${esc(opp)} · ${list.length} meetings`, title: `${mgr.name} ${rec.text} ${opp}` })}
                <div class="tiles">${tile('Record', rec.text, `${(rec.pct * 100).toFixed(1)}% wins`)}${tile('Points a game', `${pts(GT.sum(list, 'pf') / list.length)}-${pts(GT.sum(list, 'pa') / list.length)}`, `margin ${sg((GT.sum(list, 'pf') - GT.sum(list, 'pa')) / list.length)}`)}
                    ${tile('Biggest win', big ? `+${pts(big.pf - big.pa)}` : '-', big ? `${big.season} W${big.week}` : 'none yet')}${tile('Worst loss', bad ? pts(bad.pf - bad.pa) : '-', bad ? `${bad.season} W${bad.week}` : 'none yet')}
                    ${tile('Current streak', streak(list), `last met ${list[list.length - 1].season} W${list[list.length - 1].week}`)}${tile('Upsets', upsets, 'went against the projections')}</div>
                <div class="section-h"><h2>Game Log</h2></div><div class="card">${log}</div>`;
        }
    });
})();
