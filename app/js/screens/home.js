/* Home: this week's scoreboard strip, the standings race, and the week's top starters. */
(function () {
    const { esc, icon } = APP;
    const { pts } = LIB;

    APP.screen('home', {
        tab: 'home',
        async render(route) {
            const b = await GT.load();
            const S = await LIB.season(b.season);
            const weeks = [...new Set(S.played.map(g => g.week))];
            const latest = weeks[weeks.length - 1];
            const week = Number(route.query.get('week')) || latest;
            const list = S.played.filter(g => g.week === week);
            const period = list[0] ? GT.periodLabel(list[0].period, week).replace(/ W\d+$/, '') : 'Regular';
            const kick = GT.weekDate(b, b.season, week);
            const starters = await GT.query(`
                SELECT p.player_id AS pid, p.name, p.position AS pos, COALESCE(frp.pro_team, p.pro_team) AS team,
                       o.display_name AS mgr, frp.actual_points AS pts
                FROM fantasy_rosters fr JOIN fantasy_roster_players frp ON frp.roster_id = fr.roster_id
                JOIN players p ON p.player_id = frp.player_id JOIN owners o ON o.owner_id = fr.owner_id
                WHERE fr.season = $s AND fr.week = $w AND frp.slot_position NOT IN ('BE','IR') AND frp.actual_points IS NOT NULL
                ORDER BY frp.actual_points DESC LIMIT 10`, { $s: b.season, $w: week });

            const side = (name, score, won) => `<div class="sb-side${won ? ' won' : ''}">
                <img src="${GT.logo(name)}" alt=""><b>${esc(name)}</b><span>${pts(score)}</span></div>`;
            const tiles = list.map(g => `<a class="sb-tile" href="#/game/${g.id}">${side(g.home, g.hs, g.hs > g.aws)}${side(g.away, g.aws, g.aws > g.hs)}</a>`).join('');
            const regular = S.played.filter(g => g.period === 'Regular');
            const tables = S.divisions.map((d, i) => `<div class="st-table" data-div="${i}"${i ? ' hidden' : ''}>
                ${APP.standingsRows(LIB.seed(d.owners, regular), d, b)}</div>`).join('');
            const strip = starters.map(s => `<a class="starter" href="#/player/${s.pid}">
                <span class="shot"><img src="${LIB.headshot(s.pid, s.team)}" alt="" loading="lazy" ${LIB.imgFallback}></span>
                <b>${esc(s.name)}</b><small>${esc(s.pos)} · ${esc(s.mgr)}</small><span class="pts">${pts(s.pts)}</span></a>`).join('');

            return `
            <section class="section">
                <div class="section-h"><h2>Scores</h2><a href="#/scores?week=${week}">All games</a></div>
                <div class="week-switch">
                    <button data-week="${weeks[weeks.indexOf(week) - 1] || ''}" ${weeks.indexOf(week) <= 0 ? 'disabled' : ''} aria-label="Previous week">${icon('prev')}</button>
                    <div class="wk">Week ${week}<small>${esc(period)}${kick ? ' · ' + GT.fmtDate(kick) : ''}</small></div>
                    <button data-week="${weeks[weeks.indexOf(week) + 1] || ''}" ${week === latest ? 'disabled' : ''} aria-label="Next week">${icon('next')}</button>
                </div>
                <div class="hscroll sb-strip">${tiles || '<p class="muted pad">No games yet.</p>'}</div>
            </section>
            <section class="section">
                <div class="section-h"><h2>Standings</h2><a href="#/standings">Full table</a></div>
                ${S.divisions.length > 1 ? APP.seg('div-seg', S.divisions.map(d => d.name)) : ''}
                <div class="card">${tables}</div>
            </section>
            ${starters.length ? `<section class="section">
                <div class="section-h"><h2>Top Starters</h2><span class="muted" style="font-size:12px">Week ${week}</span></div>
                <div class="hscroll">${strip}</div>
            </section>` : ''}`;
        },
        after(route, el) {
            el.querySelectorAll('.week-switch button[data-week]').forEach(btn => btn.addEventListener('click', () => {
                if (btn.dataset.week) location.replace(`#/home?week=${btn.dataset.week}`);     // back leaves Home, not every week
            }));
            APP.bindSeg(el, 'div-seg', i => el.querySelectorAll('.st-table').forEach(t => { t.hidden = t.dataset.div !== String(i); }));
        }
    });
})();
