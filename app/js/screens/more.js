/* More: players, league records, past seasons, Where We Marched, appearance. */
(function () {
    const { esc, icon } = APP;
    const { pts, ord } = LIB;
    const chev = `<span class="row-chev">${icon('next')}</span>`;

    APP.screen('more', {
        tab: 'more',
        async render() {
            const theme = (() => { try { return localStorage.getItem('gt-theme') || 'system'; } catch (_) { return 'system'; } })();
            const item = (href, title, sub) => `<a class="row tall" href="${href}"><span class="row-main"><b>${title}</b><small>${sub}</small></span>${chev}</a>`;
            return `
            <div class="section-h"><h2>Explore</h2></div>
            <div class="card" style="margin-bottom:22px">
                ${item('#/players', 'Players', 'Every NFL player since 2019, game by game')}
                ${item('#/records', 'League Records', 'Highs, lows, blowouts and the closest games')}
                ${item('#/seasons', 'Past Seasons', 'Champions and final standings, every year')}
                ${item('#/marched', 'Where We Marched', 'The drum corps our members marched with')}
            </div>
            <div class="section-h"><h2>Appearance</h2></div>
            ${APP.seg('theme-seg', ['Light', 'Dark', 'System'], ['light', 'dark', 'system'].indexOf(theme))}
            <p class="note pad" style="margin-top:22px">League data loads live from the league site, so scores and stats stay current without updating the app.</p>`;
        },
        after(route, el) {
            APP.bindSeg(el, 'theme-seg', i => {
                const pick = ['light', 'dark', 'system'][i];
                if (pick === 'system') {
                    try { localStorage.removeItem('gt-theme'); } catch (_) { /* private mode */ }
                    document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                } else APP.setTheme(pick);
            });
        }
    });

    // ---------------------------------------------------------------- players
    const FANTASY = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', P: 'P', 'D/ST': 'D/ST' };
    const POS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
    APP.screen('players', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Players' }),
        async render() {
            return `<div class="search"><input id="pl-q" type="search" placeholder="Search players" autocomplete="off" enterkeyhint="search"></div>
                <div class="chips" id="pl-pos">${POS.map((p, i) => `<button class="chip${i ? '' : ' on'}" data-pos="${p}">${p}</button>`).join('')}</div>
                <div class="card" id="pl-list"><div class="loading"><span class="spinner"></span>Loading players...</div></div>
                <button class="more-btn" id="pl-more" hidden>Show more</button>`;
        },
        async after(route, el) {
            const b = await GT.load();
            const year = String(b.season);
            const all = (await PS.index()).filter(p => FANTASY[p.pos]).map(p => {
                const s = (p.fp || {})[year] || {}, total = (s.REG || [0, 0])[1] + (s.POST || [0, 0])[1];
                const career = Object.values(p.fp || {}).reduce((t, x) => t + (x.REG || [0, 0])[1] + (x.POST || [0, 0])[1], 0);
                return { ...p, group: FANTASY[p.pos], now: total, career };
            });
            let pos = 'All', q = '', shown = 40;
            const draw = () => {
                const ql = q.trim().toLowerCase();
                const list = all.filter(p => (pos === 'All' || p.group === pos) && (!ql || p.name.toLowerCase().includes(ql)))
                    .sort((x, y) => (ql ? y.career - x.career : (y.now - x.now) || (y.career - x.career)));
                el.querySelector('#pl-list').innerHTML = list.slice(0, shown).map(p => `<a class="row" href="#/player/${encodeURIComponent(p.id)}">
                    <span class="row-shot"><img src="${LIB.headshot(Number(p.id), p.team)}" alt="" loading="lazy" ${LIB.imgFallback}></span>
                    <span class="row-main"><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(p.team || '')}</small></span>
                    <span class="row-num">${pts(ql ? p.career : p.now)}<small>${ql ? 'career' : year}</small></span></a>`).join('')
                    || '<p class="muted" style="padding:16px">No players found.</p>';
                el.querySelector('#pl-more').hidden = list.length <= shown;
            };
            el.querySelector('#pl-q').addEventListener('input', e => { q = e.target.value; shown = 40; draw(); });
            el.querySelectorAll('#pl-pos .chip').forEach(c => c.addEventListener('click', () => {
                el.querySelectorAll('#pl-pos .chip').forEach(x => x.classList.toggle('on', x === c));
                pos = c.dataset.pos; shown = 40; draw();
            }));
            el.querySelector('#pl-more').addEventListener('click', () => { shown += 40; draw(); });
            draw();
        }
    });

    APP.screen('player', {
        tab: 'more',
        bar: () => ({ back: true, title: APP.playerTitle || 'Player' }),
        async render(route) {
            const id = route.args[0];
            const [p, games, league] = await Promise.all([PS.player(id).catch(() => null), PS.games().catch(() => ({})), PS.leagueHistory(id).catch(() => [])]);
            if (!p) {                                         // head coaches have no NFL stat line, only league history
                APP.playerTitle = 'Player';
                return `<div class="card">${league.map(h => `<div class="row"><span class="row-main"><b>${h.season} · ${esc(h.owner)}</b><small>${h.starts} starts</small></span><span class="row-num">${pts(h.pts)}</span></div>`).join('')
                        || '<p class="muted" style="padding:16px">No stats on file.</p>'}</div>`;
            }
            APP.playerTitle = p.name;
            const rows = p.games.map(r => ({ r, g: games[r.g] })).filter(x => x.g);
            const years = [...new Set(rows.map(x => x.g.season))].sort((a, c) => c - a);
            const year = Number(route.query.get('season')) || years[0];
            const mine = rows.filter(x => x.g.season === year && x.g.type !== 'PRE');
            const tot = mine.reduce((t, x) => t + (x.r.fpts || 0), 0);
            const best = mine.slice().sort((a, c) => (c.r.fpts || 0) - (a.r.fpts || 0))[0];
            const team = (mine[mine.length - 1] || rows[rows.length - 1] || {}).r?.tm || '';
            const cols = PS.cols(p.pos).slice(0, 3);
            const line = r => cols.map(([h, k]) => `${PS.n(r, k)} ${h}`).join(' · ');
            const tile = (label, value, sub = '') => `<div class="tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
            return `
            <div class="profile player">
                <span class="row-shot big"><img src="${LIB.headshot(Number(p.id), team)}" alt="" ${LIB.imgFallback}></span>
                <div><b>${esc(p.name)}</b><small>${esc(p.pos)} · ${esc(team)}${p.bio && p.bio.college ? ' · ' + esc(p.bio.college) : ''}</small></div>
            </div>
            ${APP.seasonChips(years, year, y => `#/player/${encodeURIComponent(id)}?season=${y}`)}
            <div class="tiles">
                ${tile('Games', mine.length)}
                ${tile('Fantasy pts', pts(tot))}
                ${tile('Per game', mine.length ? pts(tot / mine.length) : '-')}
                ${tile('Best game', best ? pts(best.r.fpts) : '-', best ? `${PS.typeLabel(best.g)} vs ${esc(PS.side(best.r, best.g).opp)}` : '')}
            </div>
            <div class="section-h"><h2>Game Log</h2></div>
            <div class="card">${mine.slice().reverse().map(({ r, g }) => {
                const s = PS.side(r, g), won = s.us > s.them;
                return `<div class="row"><span class="res ${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span>
                    <span class="row-main"><b>${esc(PS.typeLabel(g))} ${s.home ? 'vs' : '@'} ${esc(s.opp)}</b><small>${esc(line(r))}</small></span>
                    <span class="row-num">${pts(r.fpts)}<small>pts</small></span></div>`;
            }).join('') || '<p class="muted" style="padding:16px">No games this season.</p>'}</div>
            ${league.length ? `<div class="section-h"><h2>In the League</h2></div>
            <div class="card">${league.slice(0, 8).map(h => `<div class="row"><img class="row-logo" src="${GT.logo(h.owner)}" alt="">
                <span class="row-main"><b>${esc(h.owner)}</b><small>${h.season} · ${h.starts} start${h.starts === 1 ? '' : 's'}</small></span>
                <span class="row-num">${pts(h.pts)}</span></div>`).join('')}</div>` : ''}`;
        },
        after(route, el) {
            APP.replaceLinks(el);
            const on = el.querySelector('.chips .on');
            if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
        }
    });

    // ---------------------------------------------------------------- league records
    APP.screen('records', {
        tab: 'more',
        bar: () => ({ back: true, title: 'League Records' }),
        async render() {
            const one = sql => GT.query(sql).then(r => r[0]);
            const base = `FROM matchup_team_stats t JOIN matchups m ON m.game_id = t.game_id JOIN owners o ON o.owner_id = t.owner_id
                          JOIN owners x ON x.owner_id = t.opponent_owner_id WHERE t.team_score IS NOT NULL`;
            const cols = 'm.game_id AS id, m.season, m.week, m.season_period AS period, o.display_name AS mgr, x.display_name AS opp, t.team_score AS pf, t.opponent_score AS pa';
            const [high, low, blowout, close, bench, player, season] = await Promise.all([
                one(`SELECT ${cols} ${base} ORDER BY t.team_score DESC LIMIT 1`),
                one(`SELECT ${cols} ${base} AND m.season_period = 'Regular' ORDER BY t.team_score ASC LIMIT 1`),
                one(`SELECT ${cols} ${base} ORDER BY t.team_score - t.opponent_score DESC LIMIT 1`),
                one(`SELECT ${cols} ${base} AND t.team_score > t.opponent_score ORDER BY t.team_score - t.opponent_score ASC LIMIT 1`),
                one(`SELECT ${cols}, t.bench_score AS bench ${base} ORDER BY t.bench_score DESC LIMIT 1`),
                one(`SELECT p.player_id AS pid, p.name, p.position AS pos, o.display_name AS mgr, fr.season, fr.week, frp.actual_points AS pts
                     FROM fantasy_roster_players frp JOIN fantasy_rosters fr ON fr.roster_id = frp.roster_id JOIN players p ON p.player_id = frp.player_id
                     JOIN owners o ON o.owner_id = fr.owner_id WHERE frp.slot_position NOT IN ('BE','IR') ORDER BY frp.actual_points DESC LIMIT 1`),
                one(`SELECT o.display_name AS mgr, m.season, AVG(t.team_score) AS ppg, COUNT(*) AS g ${base} AND m.season_period = 'Regular'
                     GROUP BY t.owner_id, m.season HAVING COUNT(*) >= 10 ORDER BY ppg DESC LIMIT 1`)
            ]);
            const rec = (label, value, who, when, href) => `<a class="record" ${href ? `href="${href}"` : ''}>
                <span class="rc-label">${label}</span><b>${value}</b><span class="rc-who">${who}</span><small>${when}</small></a>`;
            const g = (r, value) => rec('', value, `${esc(r.mgr)} vs ${esc(r.opp)}`, `${esc(GT.periodLabel(r.period, r.week))} · ${r.season}`, `#/game/${r.id}`);
            const label = (html, text) => html.replace('<span class="rc-label"></span>', `<span class="rc-label">${text}</span>`);
            return `<div class="records">
                ${label(g(high, pts(high.pf)), 'Highest score')}
                ${label(g(low, pts(low.pf)), 'Lowest score')}
                ${label(g(blowout, `+${pts(blowout.pf - blowout.pa)}`), 'Biggest blowout')}
                ${label(g(close, `+${(close.pf - close.pa).toFixed(2)}`), 'Closest win')}
                ${label(g(bench, pts(bench.bench)), 'Most bench points')}
                ${rec('Best player game', pts(player.pts), `${esc(player.name)} · ${esc(player.pos)}`, `started by ${esc(player.mgr)} · W${player.week} ${player.season}`, `#/player/${player.pid}`)}
                ${rec('Best season scoring', pts(season.ppg), esc(season.mgr), `${season.season} · ${season.g} games`, '')}
            </div>`;
        }
    });

    // ---------------------------------------------------------------- past seasons
    APP.screen('seasons', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Past Seasons' }),
        async render() {
            const b = await GT.load();
            const years = await APP.seasons();
            const placed = (y, n) => { const k = Object.keys(b.finish).find(key => key.startsWith(`${y}-`) && b.finish[key] === n); return k ? b.byId[k.split('-')[1]] : null; };
            return `<div class="card">${years.map(y => {
                const champ = placed(y, 1), second = placed(y, 2);
                return `<a class="row tall" href="#/season/${y}"><span class="yr">${y}</span>
                    ${champ ? `<img class="row-logo" src="${GT.logo(champ.name)}" alt="">` : '<span class="row-logo"></span>'}
                    <span class="row-main"><b>${champ ? esc(champ.name) : 'In progress'}</b><small>${champ ? `Champion${second ? ` · ${esc(second.name)} 2nd` : ''}` : 'Season underway'}</small></span>${chev}</a>`;
            }).join('')}</div>`;
        }
    });
    APP.screen('season', {
        tab: 'more',
        bar: r => ({ back: true, title: `${r.args[0]} Season` }),
        async render(route) {
            const b = await GT.load();
            const year = Number(route.args[0]);
            const places = Object.entries(b.finish).filter(([k]) => k.startsWith(`${year}-`)).map(([k, place]) => ({ o: b.byId[k.split('-')[1]], place }))
                .sort((x, y) => x.place - y.place);
            const champ = places[0];
            return `
            ${champ ? `<div class="champ"><img src="${GT.logo(champ.o.name)}" alt=""><span><small>${year} Champion</small><b>${esc(champ.o.name)}</b>
                <small>${esc(GT.teamName(b, champ.o.name, year))}</small></span></div>` : ''}
            <div class="row-links">
                <a class="row tall" href="#/standings?season=${year}"><span class="row-main"><b>Standings</b><small>Final regular-season table</small></span>${chev}</a>
                <a class="row tall" href="#/scores?season=${year}"><span class="row-main"><b>Scores</b><small>Every week and every game</small></span>${chev}</a>
            </div>
            ${places.length ? `<div class="section-h"><h2>Final Placements</h2></div>
            <div class="card">${places.map(p => `<a class="row" href="#/manager/${p.o.id}?season=${year}"><span class="yr small">${ord(p.place)}</span>
                <img class="row-logo" src="${GT.logo(p.o.name)}" alt=""><span class="row-main"><b>${esc(p.o.name)}</b><small>${esc(GT.teamName(b, p.o.name, year))}</small></span>${chev}</a>`).join('')}</div>`
                : '<p class="muted pad">The season is still being played.</p>'}`;
        }
    });

    // ---------------------------------------------------------------- Where We Marched
    APP.screen('marched', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Where We Marched' }),
        async render() {
            const b = await GT.load();
            const data = (await LeagueDb.dci()).DCI_Corps;
            const DARK = ['cav', 'man', 'rcr', 'tro'];             // white logos: use their dark versions on light cards
            const logo = c => { const a = c.abbreviation.toLowerCase(); return `assets/icons/dci-logos/${a}${DARK.includes(a) ? '-drk' : ''}.png`; };
            const card = c => {
                const members = c.members ? c.members.split(',').map(m => m.trim()).filter(Boolean) : [];
                return `<div class="corps${members.length ? '' : ' empty'}"><img src="${logo(c)}" alt="" onerror="this.src='assets/icons/dci-logos/dci.png';this.onerror=null">
                    <b>${esc(c.name)}</b><span>${members.map(m => { const o = b.byName[m.toLowerCase()];
                        return o ? `<a href="#/manager/${o.id}">${esc(m)}</a>` : `<i>${esc(m)}</i>`; }).join('') || '<em>No members</em>'}</span></div>`;
            };
            return [['World_Class', 'World Class'], ['Open_Class', 'Open Class'], ['All_Age', 'All Age']].map(([k, label]) => {
                const list = (data[k] || []).slice().sort((x, y) => (!!y.members - !!x.members) || x.name.localeCompare(y.name));
                return list.length ? `<div class="section-h"><h2>${label}</h2><span class="muted" style="font-size:12px">${list.filter(c => c.members).length} with members</span></div>
                    <div class="corps-grid">${list.map(card).join('')}</div>` : '';
            }).join('');
        }
    });
})();
