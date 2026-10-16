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
            const homers = await GT.homers();
            const reigning = (() => { const k = Object.entries(b.finish).filter(([, p]) => p === 1).map(([k]) => k.split('-').map(Number)); return k.length ? k.reduce((m, x) => x[0] > m[0] ? x : m)[1] : null; })();
            // the website's manager cards: logo watermark, champion band on the left (gold = reigning), HOMER band on the right
            const row = o => {
                const t = totals.find(x => x.id === o.id) || { w: 0, l: 0 }, n = titles[o.id] || 0, hm = homers.get(o.id);
                return `<a class="mc${n ? ' mc-won' : ''}${o.id === reigning ? ' reigning' : ''}${hm ? ' homer' : ''}" href="#/manager/${o.id}">
                    <span class="mc-wm" aria-hidden="true"><img src="${GT.logo(o.name)}" alt=""></span>
                    ${n ? `<span class="mc-champ"><span>Champion${n > 1 ? ` ×${n}` : ''}</span></span>` : ''}
                    ${hm ? `<span class="mc-homer" style="background:${GT.teamColor(hm.team) || 'var(--accent)'}"><i class="mc-dot"><img class="${GT.whiteLogo(hm.team) ? 'logo-white' : ''}" src="assets/nfl-logos/${hm.team.toLowerCase()}.png" alt=""></i><span>Homer</span></span>` : ''}
                    <span class="mc-info"><b>${esc(o.name)}</b><small>${esc(GT.teamName(b, o.name, Math.min(b.season, o.last)))}</small>
                        <small>${o.first}–${o.last} · ${t.w}-${t.l} career</small></span></a>`;
            };
            const now = b.owners.filter(o => active.has(o.name)), before = b.owners.filter(o => !active.has(o.name));
            return `${APP.pageHead({ eyebrow: `${b.owners.length} managers since 2019 · ${now.length} active in ${b.season}`, title: 'Managers' })}
            <div class="section-h"><h2>${b.season} Managers</h2></div>
            <div class="mc-list" style="margin-bottom:22px">${now.map(row).join('')}</div>
            ${before.length ? `<div class="section-h"><h2>Former Managers</h2></div><div class="mc-list">${before.map(row).join('')}</div>` : ''}`;
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
            const career = true;                              // the manager page is career only
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
                    <span class="row-main"><b>vs ${esc(g.opp)}</b><small>${g.season} · ${esc(GT.periodLabel(g.period, g.week))}</small></span>
                    <span class="row-num">${pts(g.pf)}<small>${pts(g.pa)}</small></span></a>`;
            };
            const lastWeek = list.length ? list[list.length - 1] : null;

            return `
            ${APP.pageHead({ logo: GT.logo(mgr.name), title: career ? GT.teamName(b, mgr.name, years[0]) : GT.teamName(b, mgr.name, year),
                eyebrow: `Manager ${esc(mgr.name)}${!career && b.division[`${year}-${mgr.id}`] ? ' · ' + esc(b.division[`${year}-${mgr.id}`]) : ''}`,
                meta: career ? `Career · ${mgr.first}–${mgr.last} · ${years.length} seasons${titles ? ` · ${titles}× champion` : ''}` : `${year} · record ${r.text}` })}
            ${APP.seg('mg-seg', ['Overview', career ? 'Games' : 'Schedule', 'Draft', 'Rivals'])}
            <div class="mg-pane" data-pane="0">
                <div class="tiles">
                    ${tile('Record', r.text, `${(r.pct * 100).toFixed(1)}% wins`)}
                    ${tile('High score', hi == null ? '-' : pts(hi))}
                    ${tile('Points / game', reg.length ? pts(GT.sum(reg, 'pf') / reg.length) : '-', rank)}
                    ${tile('Against / game', reg.length ? pts(GT.sum(reg, 'pa') / reg.length) : '-')}
                    ${career ? tile('Titles', titles, titles ? years.filter(y => b.finish[`${y}-${mgr.id}`] === 1).join(', ') : 'none yet')
                             : tile('Finish', place ? ord(place) : 'In progress', place === 1 ? 'Champion' : '')}
                    ${tile('Top-3 weeks', list.filter(g => g.rank && g.rank <= 3).length, 'scores in the week\'s top 3')}
                </div>
                <div class="section-h"><h2>Recent</h2></div>
                <div class="card">${list.slice(-5).reverse().map(gameRow).join('') || '<p class="muted pad" style="padding:14px">No games.</p>'}</div>
            </div>
            <div class="mg-pane" data-pane="1" hidden><div class="card" data-pager>${list.slice().reverse().map(gameRow).join('')}</div></div>
            <div class="mg-pane" data-pane="2" hidden>${await APP.draftPane(mgr)}</div>
            <div class="mg-pane" data-pane="3" hidden>${APP.rivalsPane(mgr, all)}</div>`;
        },
        after(route, el) {
            APP.replaceLinks(el);
            const on = el.querySelector('.chips .on');
            if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
            APP.bindSeg(el, 'mg-seg', i => { el.querySelectorAll('.mg-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }); if (APP.drawDraft) APP.drawDraft(el); });
            APP.bindSeg(el, 'dt-view', i => { el.querySelector('#dt-matrix').hidden = i !== 0; el.querySelector('#dt-chart').hidden = i !== 1; if (APP.drawDraft) APP.drawDraft(el); });
        }
    });
})();
