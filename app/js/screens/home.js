/* Home, in the website's design language: the site's Featured Games carousel, the week at a glance (stat
   tiles), the scoreboard, the standings race with each manager's last five results, and the week's top performers. */
(function () {
    const { esc, icon } = APP;
    const { pts } = LIB;
    // the site's header photo pool (loaded live from the league site, like the data; offline the hero is a plain gradient)
    const PHOTOS = [...Array.from({ length: 18 }, (_, i) => `background-${i + 1}.png`), ...Array.from({ length: 16 }, (_, i) => `background-${i + 19}.jpg`)];
    const photo = () => `https://grasstouchers.football/assets/images/${PHOTOS[Math.floor(Math.random() * PHOTOS.length)]}`;

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

            // ---- hero: the website's Featured Games carousel, from the last finished week (Highest scoring, Biggest
            // blowout, Closest loss), with the same headline, copy and score bars
            const margin = g => Math.abs(g.hs - g.aws);
            const feature = list.slice().sort((x, y) => margin(x) - margin(y))[0];
            const recent = S.played.filter(g => g.week === latest);
                        const pick = (l, score) => l.slice().sort((x, y) => score(y) - score(x))[0];
            const SLIDES = recent.length ? [
                { label: 'Highest scoring', game: pick(recent, g => g.hs + g.aws) },
                { label: 'Biggest blowout', game: pick(recent, g => margin(g)) },
                { label: 'Closest loss', game: pick(recent.filter(g => g.hs !== g.aws), g => -margin(g)) || recent[0] }
            ] : [];
            const weekScores = recent.flatMap(x => [x.hs, x.aws]).sort((x, y) => y - x);
            const slide = ({ label, game: g }, i) => {
                const homeWon = g.hs >= g.aws;
                const [wId, wName, wPts, lId, lName, lPts] = homeWon ? [g.hid, g.home, g.hs, g.aid, g.away, g.aws] : [g.aid, g.away, g.aws, g.hid, g.home, g.hs];
                const m = wPts - lPts;
                const verb = m < 5 ? 'holds off' : m < 15 ? 'defeats' : m < 35 ? 'beats' : 'routs';
                const rank = weekScores.indexOf(wPts) + 1;
                const max = Math.max(wPts, lPts) || 1;
                const bar = (name, v, won) => `<div class="ft-team${won ? ' won' : ''}"><span class="ft-name">${esc(name)}</span>
                    <span class="ft-bar"><span style="width:${(v / max * 100).toFixed(1)}%"></span></span>
                    <span class="ft-mark">${won ? '▸' : ''}</span><span class="ft-score">${pts(v)}</span></div>`;
                return `<div class="ft-slide${i === 0 ? ' on' : ''}" data-i="${i}">
                    <div class="ft-photo" style="--photo:url('${photo()}')">
                        <span class="ft-tag">${esc(label)} · Week ${g.week}</span>
                    </div>
                    <div class="ft-panel">
                        <div class="ft-kicker">Final · Grass Touchers · ${esc(GT.periodLabel(g.period, g.week))}</div>
                        <h2 class="ft-head">${esc(wName)} ${verb} ${esc(lName)}</h2>
                        <p class="ft-copy">Won by ${pts(m)}${rank === 1 ? ' · Top score of the week' : ''}</p>
                        <div class="ft-teams">${bar(wName, wPts, true)}${bar(lName, lPts, false)}</div>
                        <div class="ft-actions"><a class="ft-btn accent" href="#/game/${g.id}">Game center</a>
                            <a class="ft-btn white" href="#/manager/${wId}?season=${b.season}">${esc(wName)}</a>
                            <a class="ft-btn white" href="#/manager/${lId}?season=${b.season}">${esc(lName)}</a></div>
                    </div>
                </div>`;
            };
            const hero = SLIDES.length ? `<section class="feature"><div class="ft-carousel" id="ft">${SLIDES.map(slide).join('')}
                <div class="ft-nav" role="tablist">${SLIDES.map((s, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}" role="tab">${esc(s.label)}</button>`).join('')}</div>
            </div></section>` : '';

            // ---- the week at a glance
            const sides = list.flatMap(g => [{ name: g.home, v: g.hs, g }, { name: g.away, v: g.aws, g }]);
            let glance = '';
            if (sides.length) {
                const hi = sides.reduce((m, x) => x.v > m.v ? x : m), lo = sides.reduce((m, x) => x.v < m.v ? x : m);
                const blow = list.reduce((m, g) => margin(g) > margin(m) ? g : m), close = feature;
                const avg = sides.reduce((t, x) => t + x.v, 0) / sides.length;
                const winner = g => g.hs >= g.aws ? g.home : g.away, loser = g => g.hs >= g.aws ? g.away : g.home;
                const card = (label, value, who, href) => `<a class="h-stat" href="${href}"><span>${label}</span><b>${value}</b><small>${esc(who)}</small></a>`;
                glance = `<section class="section">
                    <div class="section-h"><h2>Week at a Glance</h2><span class="muted h-avg">League avg ${pts(avg)}</span></div>
                    <div class="h-glance">
                        ${card('High score', pts(hi.v), hi.name, `#/game/${hi.g.id}`)}
                        ${card('Low score', pts(lo.v), lo.name, `#/game/${lo.g.id}`)}
                        ${card('Biggest blowout', `+${pts(margin(blow))}`, `${winner(blow)} over ${loser(blow)}`, `#/game/${blow.id}`)}
                        ${card('Closest game', pts(margin(close)), `${winner(close)} over ${loser(close)}`, `#/game/${close.id}`)}
                    </div></section>`;
            }

            // ---- scoreboard: two compact rows, the winner in full color
            const side = (name, score, won) => `<div class="sb-side${won ? ' won' : ''}"><img src="${GT.logo(name)}" alt=""><b>${esc(name)}</b><span>${pts(score)}</span></div>`;
            const tiles = list.map(g => `<a class="sb-tile" href="#/game/${g.id}">${side(g.home, g.hs, g.hs > g.aws)}${side(g.away, g.aws, g.aws > g.hs)}</a>`).join('');

            // ---- standings, with each manager's last five regular-season results (as of this week)
            const regular = S.played.filter(g => g.period === 'Regular' && g.week <= week);
            const form = o => regular.filter(g => g.home === o || g.away === o).slice(-5).map(g => {
                const mine = g.home === o ? g.hs : g.aws, theirs = g.home === o ? g.aws : g.hs;
                return `<i class="${mine > theirs ? 'w' : mine < theirs ? 'l' : 't'}"></i>`;
            }).join('');
            const tables = S.divisions.map((d, i) => `<div class="st-table" data-div="${i}"${i ? ' hidden' : ''}>
                ${APP.standingsRows(LIB.seed(d.owners, regular), d, b)}</div>`).join('');

            // ---- top starters: the NFL team's color behind each headshot
            const strip = starters.map((s, i) => `<a class="tp-row" href="#/player/${s.pid}">${s.team && s.team !== 'TEAM0'
                    ? `<span class="tp-wm" aria-hidden="true"><img src="assets/nfl-logos/${s.team.toLowerCase()}.png" alt="" onerror="this.remove()"></span>` : ''}<span class="tp-rank">${i + 1}</span>
                <span class="tp-shot"><img src="${LIB.headshot(s.pid, s.team)}" alt="" loading="lazy" ${LIB.imgFallback}></span>
                <span class="tp-who"><b>${esc(s.name)}</b><small>${esc(s.pos)} · ${esc(s.mgr)}</small></span>
                <span class="tp-num">${Number(s.pts).toFixed(2)}</span></a>`).join('');

            APP.homeForm = form;                                  // the standings rows add the form pips after render
            return `
            ${hero}
            ${glance}
            <section class="section">
                <div class="section-h"><h2>Scores</h2><a href="#/scores?week=${week}">All games</a></div>
                <div class="hscroll sb-strip">${tiles || '<p class="muted pad">No games yet.</p>'}</div>
            </section>
            <section class="section">
                <div class="section-h"><h2>Standings</h2><a href="#/standings">Full table</a></div>
                ${S.divisions.length > 1 ? APP.seg('div-seg', S.divisions.map(d => d.name)) : ''}
                <div class="card h-standings">${tables}</div>
            </section>
            ${starters.length ? `<section class="section">
                <div class="section-h"><h2>Top Performers</h2><span class="muted h-avg">Week ${week}</span></div>
                <div class="card tp-podium">${strip}</div>
            </section>` : ''}`;
        },
        after(route, el) {
            // featured games: the tabs switch slides, and they rotate on their own like the site's (stops once tapped)
            const ft = el.querySelector('#ft');
            if (ft) {
                let cur = 0, timer = null;
                const go = i => { cur = i; ft.querySelectorAll('.ft-slide, .ft-nav button').forEach(x => x.classList.toggle('on', Number(x.dataset.i) === i)); };
                ft.querySelectorAll('.ft-nav button').forEach(btn => btn.addEventListener('click', () => { clearInterval(timer); go(Number(btn.dataset.i)); }));
                timer = setInterval(() => { if (!document.body.contains(ft)) return clearInterval(timer); go((cur + 1) % 3); }, 7000);
            }
            APP.bindSeg(el, 'div-seg', i => el.querySelectorAll('.st-table').forEach(t => { t.hidden = t.dataset.div !== String(i); }));
            // last-five form under each name in the standings
            el.querySelectorAll('.h-standings a.st-row').forEach(row => {
                const name = row.querySelector('b'); if (!name || !APP.homeForm) return;
                name.outerHTML = `<span class="h-nm"><b>${esc(name.textContent)}</b><span class="h-form">${APP.homeForm(name.textContent)}</span></span>`;
            });
            // a missing photo (offline) leaves the dark background
            el.querySelectorAll('.ft-photo').forEach(ph => {
                const m = ph.style.getPropertyValue('--photo').match(/url\('(.+)'\)/);
                if (m) { const img = new Image(); img.onerror = () => ph.style.removeProperty('--photo'); img.src = m[1]; }
            });
        }
    });
})();
