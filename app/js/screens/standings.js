/* Standings: every division with the league tiebreak, and (for a season still being played) simulated playoff odds. */
(function () {
    const { esc } = APP;
    const pct = v => `${Math.round(v * 100)}%`;

    APP.screen('standings', {
        tab: 'stats',
        bar: r => ({ back: true, title: `${r.query.get('season') || ''} Standings`.trim() }),
        async render(route) {
            const b = await GT.load();
            const years = await APP.seasons();
            const year = Number(route.query.get('season')) || b.season;
            const S = await LIB.season(year);
            const regular = S.played.filter(g => g.period === 'Regular');
            const live = S.lastWeek < S.endWeek;                     // odds only while the regular season is still running
            const tables = S.divisions.map(d => `<div class="section-h"><h2 style="font-size:18px">${esc(d.name)}</h2></div>
                <div class="card" style="margin-bottom:16px">${APP.standingsRows(LIB.seed(d.owners, regular), d, b)}</div>`).join('');

            let oddsHtml = '';
            if (live) {
                const T = LIB.odds(S, 3000);
                const owners = S.divisions.flatMap(d => d.owners).sort((x, y) => (T[y].playoffs - T[x].playoffs) || (T[y].title - T[x].title));
                oddsHtml = `<p class="note pad">Chance of reaching the ${S.playin ? 'championship bracket (a bye, or winning the play-in)' : 'playoffs'},
                    from 3,000 simulated finishes as of week ${S.lastWeek}.</p>
                    <div class="card">${owners.map(o => {
                        const t = T[o];
                        const detail = S.playin ? `Bye ${pct(t.bye)} · Play-in ${pct(t.playIn)} · Gulag ${pct(t.gulag)} · Title ${pct(t.title)}`
                                                : `${t.wins.toFixed(1)} projected wins`;
                        return `<a class="odds-row" href="#/manager/${b.byName[o.toLowerCase()].id}">
                            <img src="${GT.logo(o)}" alt=""><span class="odds-main"><b>${esc(o)}</b><small>${detail}</small>
                            <span class="odds-bar"><i style="width:${(t.playoffs * 100).toFixed(1)}%"></i></span></span>
                            <span class="odds-num">${pct(t.playoffs)}</span></a>`;
                    }).join('')}</div>`;
            }
            return `
            ${APP.seasonChips(years, year, y => `#/standings?season=${y}`)}
            ${live ? APP.seg('st-seg', ['Table', 'Playoff odds']) : ''}
            <div class="st-pane" data-pane="0">${tables}</div>
            ${live ? `<div class="st-pane" data-pane="1" hidden>${oddsHtml}</div>` : ''}`;
        },
        after(route, el) {
            APP.replaceLinks(el);
            APP.bindSeg(el, 'st-seg', i => el.querySelectorAll('.st-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }));
        }
    });
})();
