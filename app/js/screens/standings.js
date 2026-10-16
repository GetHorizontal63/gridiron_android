/* Standings = the website's Standings page: a table per division (seed, manager and team, W-L, Pct, PF, Diff, finish,
   with the bye / play-in / Gulag lines) and the overall table, plus simulated playoff odds while the season is running. */
(function () {
    const { esc } = APP;
    const { ord } = LIB;
    const pct = v => `${Math.round(v * 100)}%`;

    APP.screen('standings', {
        tab: 'stats',
        bar: () => ({ back: true, title: 'Standings' }),
        async render(route) {
            const b = await GT.load();
            const years = await APP.seasons();
            const year = Number(route.query.get('season')) || b.season;
            const S = await LIB.season(year);
            const regular = S.played.filter(g => g.period === 'Regular');
            const live = S.lastWeek < S.endWeek;
            const view = live && route.query.get('view') === 'odds' ? 'odds' : 'table';
            const id = n => (b.byName[n.toLowerCase()] || {}).id;
            const table = (rows, d) => {
                const cut = n => d && n && (n === d.auto || (d.playin && n === d.auto + d.playin));
                return `<div class="stx-h"><span>#</span><span>Manager</span><span>W-L</span><span>Pct</span><span>PF</span><span>Diff</span><span>Fin</span></div>
                    ${rows.map((r, n) => { const fin = b.finish[`${year}-${id(r.owner)}`];
                        return `<a class="stx-r${cut(n) ? ' cut' : ''}" href="#/manager/${id(r.owner)}?season=${year}"><span class="stx-n">${n + 1}</span>
                            <span class="stx-m"><img src="${GT.logo(r.owner)}" alt=""><span><b>${esc(r.owner)}</b><small>${esc(GT.teamName(b, r.owner, year))}</small></span></span>
                            <span>${r.w}-${r.l}${r.t ? '-' + r.t : ''}</span><span>${r.pct.toFixed(3).replace(/^0/, '')}</span><span>${Math.round(r.pf)}</span>
                            <span class="${r.diff >= 0 ? 'pos' : 'neg'}">${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)}</span><span><b>${fin ? ord(fin) : '-'}</b></span></a>`; }).join('')}
                    ${d && d.auto ? `<div class="stx-key">${d.playin ? `1–${d.auto} bye · ${d.auto + 1}–${d.auto + d.playin} play-in · ${d.auto + d.playin + 1}+ Gulag` : `Top ${d.auto} make the playoffs`}</div>` : ''}`;
            };
            const divisions = S.divisions.map(d => `<div class="sec-head small"><h3 class="sec-sub">${esc(d.name)}</h3></div><div class="card">${table(LIB.seed(d.owners, regular), d)}</div>`).join('');
            const overall = LIB.lines(S.divisions.flatMap(d => d.owners), regular).sort((x, y) => y.pct - x.pct || y.diff - x.diff);
            let odds = '';
            if (view === 'odds') {
                const T = LIB.odds(S, 3000);
                const owners = S.divisions.flatMap(d => d.owners).sort((x, y) => (T[y].playoffs - T[x].playoffs) || (T[y].title - T[x].title));
                odds = `<p class="sec-copy pad" style="margin:0 0 12px">Chance of reaching the ${S.playin ? 'championship bracket (a bye, or winning the play-in)' : 'playoffs'}, from 3,000 simulated finishes as of week ${S.lastWeek}.</p>
                    <div class="card">${owners.map(o => { const t = T[o];
                        return `<a class="odds-row" href="#/manager/${id(o)}"><img src="${GT.logo(o)}" alt=""><span class="odds-main"><b>${esc(o)}</b>
                            <small>${S.playin ? `Bye ${pct(t.bye)} · Play-in ${pct(t.playIn)} · Gulag ${pct(t.gulag)} · Title ${pct(t.title)}` : `${t.wins.toFixed(1)} projected wins`}</small>
                            <span class="odds-bar"><i style="width:${(t.playoffs * 100).toFixed(1)}%"></i></span></span><span class="odds-num">${pct(t.playoffs)}</span></a>`; }).join('')}</div>`;
            }
            return `${APP.pageHead({ eyebrow: `Regular season · ${year >= 2026 ? 'record, diff, H2H, PF' : 'record, H2H, diff, PF'}`, title: `${year} Standings` })}
                ${APP.seasonChips(years, year, y => `#/standings?season=${y}`)}
                ${live ? `<div class="chips"><a class="chip${view === 'table' ? ' on' : ''}" href="#/standings?season=${year}" data-replace>Standings</a>
                    <a class="chip${view === 'odds' ? ' on' : ''}" href="#/standings?season=${year}&view=odds" data-replace>Playoff odds</a></div>` : ''}
                ${view === 'odds' ? odds : `<div class="sec-head"><div class="eyebrow">${year} season${live ? ` · through week ${S.lastWeek}` : ''}</div><h2 class="sec-title">Standings</h2></div>
                    ${divisions}<div class="sec-head small"><h3 class="sec-sub">Overall</h3></div><div class="card">${table(overall)}</div>`}`;
        },
        after(route, el) { APP.replaceLinks(el); }
    });
})();
