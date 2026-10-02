/* Managers: everyone in the league (this season first); a manager's profile by season or career. */
(function () {
    const { esc, icon } = APP;
    const { pts, ord } = LIB;

    APP.screen('managers', {
        tab: 'managers',
        async render() {
            const b = await GT.load();
            const S = await LIB.season(b.season);
            const active = new Set(S.divisions.flatMap(d => d.owners));
            const totals = await GT.query(`SELECT t.owner_id AS id, SUM(t.team_score > t.opponent_score) AS w, SUM(t.team_score < t.opponent_score) AS l
                                           FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id
                                           WHERE m.season_period = 'Regular' AND t.team_score IS NOT NULL GROUP BY t.owner_id`);
            const titles = {};
            Object.entries(b.finish).forEach(([k, place]) => { if (place === 1) { const id = k.split('-')[1]; titles[id] = (titles[id] || 0) + 1; } });
            const row = o => {
                const t = totals.find(x => x.id === o.id) || { w: 0, l: 0 };
                return `<a class="row tall" href="#/manager/${o.id}"><img class="row-logo" src="${GT.logo(o.name)}" alt="">
                    <span class="row-main"><b>${esc(o.name)}${titles[o.id] ? ` <span class="crown">${'★'.repeat(titles[o.id])}</span>` : ''}</b>
                    <small>${esc(GT.teamName(b, o.name, Math.min(b.season, o.last)))}</small><small>${o.first}–${o.last} · ${t.w}-${t.l} all-time</small></span>
                    <span class="row-chev">${icon('next')}</span></a>`;
            };
            const now = b.owners.filter(o => active.has(o.name)), before = b.owners.filter(o => !active.has(o.name));
            return `
            <div class="section-h"><h2>${b.season} Managers</h2><span class="muted" style="font-size:12px">★ = title</span></div>
            <div class="card" style="margin-bottom:22px">${now.map(row).join('')}</div>
            ${before.length ? `<div class="section-h"><h2>Former Managers</h2></div><div class="card">${before.map(row).join('')}</div>` : ''}`;
        }
    });

    // ---------------------------------------------------------------- profile
    APP.screen('manager', {
        tab: 'managers',
        bar: r => ({ back: true, title: APP.managerTitle || 'Manager' }),
        async render(route) {
            const b = await GT.load();
            const mgr = await GT.manager(route.args[0]);
            if (!mgr) return '<div class="next"><h2>Not found</h2></div>';
            APP.managerTitle = mgr.name;
            const all = await GT.games(mgr.id);
            const years = [...new Set(all.map(g => g.season))].sort((x, y) => y - x);
            const career = route.query.get('season') === 'career';
            const year = career ? null : Number(route.query.get('season')) || years[0];
            const list = career ? all : all.filter(g => g.season === year);
            const reg = list.filter(g => g.period === 'Regular');
            const r = GT.record(reg);
            const place = year ? b.finish[`${year}-${mgr.id}`] : null;
            const titles = years.filter(y => b.finish[`${y}-${mgr.id}`] === 1).length;
            const tile = (label, value, sub = '') => `<div class="tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
            const hi = reg.length ? Math.max(...reg.map(g => g.pf)) : null;
            // league rank in points per game for the season
            let rank = '';
            if (year) {
                const S = await LIB.season(year);
                const ppg = LIB.lines(S.divisions.flatMap(d => d.owners), S.played.filter(g => g.period === 'Regular')).map(x => ({ o: x.owner, v: x.g ? x.pf / x.g : 0 }))
                    .sort((x, y) => y.v - x.v);
                const n = ppg.findIndex(x => x.o === mgr.name) + 1;
                if (n) rank = `${ord(n)} in the league`;
            }
            const gameRow = g => {
                const res = GT.result(g);
                return `<a class="row" href="#/game/${g.gameId}"><span class="res ${res === 'W' ? 'w' : res === 'L' ? 'l' : ''}">${res}</span>
                    <span class="row-main"><b>vs ${esc(g.opp)}</b><small>${esc(GT.periodLabel(g.period, g.week))}${career ? ` · ${g.season}` : ''}</small></span>
                    <span class="row-num">${pts(g.pf)}<small>${pts(g.pa)}</small></span></a>`;
            };
            const lastWeek = list.length ? list[list.length - 1] : null;
            const lineup = !career && lastWeek ? (await GT.roster(mgr.id, lastWeek.season, lastWeek.week)).sort(GT.slotSort) : [];
            const lineupRow = p => `<a class="row" href="#/player/${p.playerId}"><span class="slot">${esc(p.slot)}</span>
                <span class="row-main"><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(p.team || '')}</small></span><span class="row-num">${pts(p.points)}</span></a>`;

            return `
            <div class="profile">
                <img src="${GT.logo(mgr.name)}" alt="">
                <div><b>${esc(career ? mgr.name : GT.teamName(b, mgr.name, year))}</b>
                    <small>${career ? `${mgr.first}–${mgr.last} · ${years.length} seasons` : `${esc(mgr.name)} · ${year}${b.division[`${year}-${mgr.id}`] ? ' · ' + esc(b.division[`${year}-${mgr.id}`]) : ''}`}</small></div>
            </div>
            ${APP.seasonChips(years, year, y => `#/manager/${mgr.id}?season=${y}`,
                `<a class="chip${career ? ' on' : ''}" href="#/manager/${mgr.id}?season=career" data-replace>Career</a>`)}
            ${APP.seg('mg-seg', career ? ['Overview', 'Every game'] : ['Overview', 'Schedule', 'Roster'])}
            <div class="mg-pane" data-pane="0">
                <div class="tiles">
                    ${tile('Record', r.text, `${(r.pct * 100).toFixed(1)}% wins`)}
                    ${tile('Points / game', reg.length ? pts(GT.sum(reg, 'pf') / reg.length) : '-', rank)}
                    ${tile('Against / game', reg.length ? pts(GT.sum(reg, 'pa') / reg.length) : '-')}
                    ${tile('High score', hi == null ? '-' : pts(hi))}
                    ${career ? tile('Titles', titles, titles ? years.filter(y => b.finish[`${y}-${mgr.id}`] === 1).join(', ') : 'none yet')
                             : tile('Finish', place ? ord(place) : 'In progress', place === 1 ? 'Champion' : '')}
                    ${tile('Top-3 weeks', list.filter(g => g.rank && g.rank <= 3).length, 'scores in the week\'s top 3')}
                </div>
                <div class="section-h"><h2>Recent</h2></div>
                <div class="card">${list.slice(-5).reverse().map(gameRow).join('') || '<p class="muted pad" style="padding:14px">No games.</p>'}</div>
            </div>
            <div class="mg-pane" data-pane="1" hidden><div class="card">${list.slice().reverse().map(gameRow).join('')}</div></div>
            ${career ? '' : `<div class="mg-pane" data-pane="2" hidden>
                ${lastWeek ? `<p class="note pad">${esc(GT.periodLabel(lastWeek.period, lastWeek.week))} lineup</p>` : ''}
                <div class="card">${lineup.filter(GT.isStarter).map(lineupRow).join('') || '<p class="muted pad" style="padding:14px">No lineup saved.</p>'}</div>
                ${lineup.some(p => !GT.isStarter(p)) ? `<div class="section-h"><h2 style="font-size:18px">Bench</h2></div>
                <div class="card">${lineup.filter(p => !GT.isStarter(p)).map(lineupRow).join('')}</div>` : ''}
            </div>`}`;
        },
        after(route, el) {
            APP.replaceLinks(el);
            const on = el.querySelector('.chips .on');
            if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
            APP.bindSeg(el, 'mg-seg', i => el.querySelectorAll('.mg-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }));
        }
    });
})();
