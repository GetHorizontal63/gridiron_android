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
                ${item('#/records', 'Record Book', 'Every league record, record vs. playoffs and Scorigami')}
                ${item('#/seasons', 'Past Seasons', 'Champions and final standings, every year')}
                ${item('#/marched', 'Where We Marched', 'The drum corps our members marched with')}
            </div>
            <div class="section-h"><h2>Appearance</h2></div>
            ${APP.seg('theme-seg', ['Light', 'Dark', 'System'], ['light', 'dark', 'system'].indexOf(theme))}
            <div class="section-h" style="margin-top:22px"><h2>App</h2></div>
            <div class="card">
                <div class="row tall"><span class="row-main"><b>Version ${esc(APP.version())}</b><small id="upd-status">League data loads live, so scores and stats stay current</small></span>
                    <button class="chip" id="upd-check">Check for updates</button></div>
                <a class="row tall" href="${APP.downloadPage}" target="_blank" rel="noopener"><span class="row-main"><b>Get the App page</b><small>Every version and how to install</small></span>${chev}</a>
            </div>`;
        },
        after(route, el) {
            const btn = el.querySelector('#upd-check'), status = el.querySelector('#upd-status');
            if (btn) btn.addEventListener('click', async () => {
                btn.disabled = true; status.textContent = 'Checking...';
                const r = await APP.checkUpdate(true);
                status.textContent = r.status === 'update' ? `Version ${r.latest} is out: tap the bar at the top to get it`
                    : r.status === 'current' ? "You're on the newest version" : r.status === 'dev' ? 'Test build: no update check' : "Couldn't check right now";
                btn.disabled = false;
            });
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

    // ---------------------------------------------------------------- record book (the website's full Record Book)
    const RB_TABS = [['league-records', 'League'], ['single-game', 'Single Game'], ['single-season', 'Single Season'],
                     ['record-vs-playoffs', 'vs Playoffs'], ['scorigami', 'Scorigami']];
    const holder = label => String(label || '').split(/[\s(]/)[0];
    const holderText = d => {                                   // "Owner (2019 Wk 7) - Player" -> player, then owner · week
        const m = String(d.team).match(/^(.+?) \((\d{4}) Wk (\d+)\) - (.+)$/);
        return m ? `<b>${esc(m[4])}</b><small>${esc(m[1])} · ${m[2]} Wk ${m[3]}</small>` : `<b>${esc(d.team)}</b>`;
    };
    const shown = (key, v) => /Gpa/.test(key) ? v : String(v).replace(/^([+-]?\d+\.\d)\d$/, m => Number(m).toFixed(1));
    APP.screen('records', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Record Book' }),
        async render(route) {
            const tab = RB_TABS.some(t => t[0] === route.query.get('tab')) ? route.query.get('tab') : 'league-records';
            const chips = `<div class="chips">${RB_TABS.map(([k, l]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/records?tab=${k}" data-replace>${l}</a>`).join('')}</div>`;
            if (tab === 'record-vs-playoffs') return chips + await recordOdds();
            if (tab === 'scorigami') return chips + await scorigami();
            const { categories, results } = await RB.compute(tab);
            return chips + categories.map(cat => `<div class="section-h"><h2 style="font-size:19px">${esc(cat.title)}</h2></div>
                <div class="rb-cards">${cat.cards.map(card => {
                    const data = results[card.key] || [];
                    return `<div class="rb-card"><b class="rb-t">${esc(card.title)}</b>${card.subtitle ? `<small class="rb-s">${esc(card.subtitle)}</small>` : ''}
                        ${[0, 1, 2].map(i => { const d = data[i];
                            return `<div class="rb-line${i ? '' : ' first'}"><span class="rb-rank">${i + 1}</span>${d ? `<img src="${GT.logo(holder(d.team))}" alt="">` : '<span></span>'}
                                <span class="rb-who">${d ? holderText(d) : '<b>--</b>'}</span><span class="rb-val">${d ? esc(shown(card.key, d.value)) : '--'}</span></div>`; }).join('')}</div>`;
                }).join('')}</div>${cat.note ? `<p class="note pad" style="margin-top:8px">${esc(cat.note)}</p>` : ''}`).join('');
        },
        after(route, el) {
            APP.replaceLinks(el);
            const on = el.querySelector('.chips .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
            if (el.querySelector('#scori')) drawScorigami(el);
        }
    });

    // record vs playoffs: every completed season, every team, every record it passed through; share that made the bracket
    async function recordOdds() {
        const [teamRows, scoreRows] = await Promise.all([LeagueDb.seasonTeamRows(), LeagueDb.scoreRows()]);
        const finished = new Set(teamRows.filter(r => r.place != null).map(r => r.season));
        const made = new Map(teamRows.filter(r => r.place != null).map(r => [`${r.season}|${r.owner}`, r.bracketType === 'championship']));
        const paths = new Map();
        scoreRows.forEach(g => {
            if (g['Season Period'] !== 'Regular' || !finished.has(g.Season) || !g.Team || !g.Opponent) return;
            if (g.Team.toLowerCase() === 'bye' || g.Opponent.toLowerCase() === 'bye') return;
            const us = Number(g['Team Score']), them = Number(g['Opponent Score']);
            if (Number.isNaN(us) || Number.isNaN(them)) return;
            const key = `${g.Season}|${g.Team}`;
            if (!paths.has(key)) paths.set(key, []);
            paths.get(key).push({ week: g.Week, win: us > them, loss: us < them });
        });
        const cells = new Map(); let maxW = 0, maxL = 0;
        paths.forEach((games, key) => {
            games.sort((x, y) => x.week - y.week);
            let w = 0, l = 0; const seen = new Set(['0-0']);
            games.forEach(g => { if (g.win) w++; else if (g.loss) l++; seen.add(`${w}-${l}`); });
            seen.forEach(rec => {
                const c = cells.get(rec) || { n: 0, made: 0 }; c.n++; if (made.get(key)) c.made++; cells.set(rec, c);
                const [rw, rl] = rec.split('-').map(Number); maxW = Math.max(maxW, rw); maxL = Math.max(maxL, rl);
            });
        });
        const shade = share => `hsl(${Math.round(share * 125)}, 52%, 42%)`;
        const losses = Array.from({ length: maxL + 1 }, (_, i) => i), wins = Array.from({ length: maxW + 1 }, (_, i) => maxW - i);
        return `<p class="note pad">Every team, every week, every completed season. Each square is a record (wins down, losses across):
            the share of teams at that record that made the Championship bracket (red 0% to green 100%), and how many teams were there. Swipe sideways.</p>
            <div class="ro-scroll"><table class="ro"><thead><tr><th>W / L</th>${losses.map(l => `<th>${l}</th>`).join('')}</tr></thead><tbody>
            ${wins.map(w => `<tr><th>${w}</th>${losses.map(l => { const c = cells.get(`${w}-${l}`);
                return c ? `<td style="background:${shade(c.made / c.n)}"><b>${Math.round(c.made / c.n * 100)}%</b><span>${c.n}</span></td>` : '<td class="none"></td>'; }).join('')}</tr>`).join('')}
            </tbody></table></div>`;
    }

    // scorigami: every final score (winner up, loser across, 50-250); tap a square for its games
    const SMIN = 50, SMAX = 250, SN = SMAX - SMIN + 1, CELL = 3;
    let scori = null;
    async function scorigami() {
        const rows = await LeagueDb.scoreRows();
        const cells = new Map(); let games = 0;
        rows.forEach(g => {
            if (!(Number(g['Team Owner ID']) < Number(g['Opponent Owner ID']))) return;
            if (!g.Team || !g.Opponent || g.Opponent.toLowerCase() === 'bye' || g.Team.toLowerCase() === 'bye') return;
            const a = Number(g['Team Score']), c = Number(g['Opponent Score']);
            if (Number.isNaN(a) || Number.isNaN(c) || a === c) return;
            const win = Math.floor(Math.max(a, c)), lose = Math.floor(Math.min(a, c));
            if (win < SMIN || win > SMAX || lose < SMIN) return;
            const key = `${win}-${lose}`, aw = a > c;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push({ winner: aw ? g.Team : g.Opponent, loser: aw ? g.Opponent : g.Team, win: Math.max(a, c), lose: Math.min(a, c), season: g.Season, week: g.Week });
            games++;
        });
        scori = cells;
        const possible = SN * (SN + 1) / 2;
        return `<p class="note pad">${cells.size.toLocaleString()} different final scores in ${games.toLocaleString()} games
            (${(cells.size / possible * 100).toFixed(1)}% of all possible). Swipe around and tap a square.</p>
            <div class="scori-scroll"><canvas id="scori"></canvas></div>
            <div class="card scori-tip" id="scori-tip"><p class="muted" style="padding:14px">Tap a square to see its games.</p></div>`;
    }
    function drawScorigami(el) {
        const canvas = el.querySelector('#scori'), dpr = window.devicePixelRatio || 1, AX = 34, AY = 26;
        const w = AX + SN * CELL + 6, h = SN * CELL + AY + 6;
        canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; canvas.width = w * dpr; canvas.height = h * dpr;
        const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const dark = document.documentElement.dataset.theme === 'dark';
        const fill = dark ? ['', '#5e5434', '#b58b26', '#f2b934'] : ['', '#9fd4b4', '#3b7a57', '#173d29'];
        const ink = a => (dark ? `rgba(233,236,240,${a})` : `rgba(0,0,0,${a})`);
        for (let lose = SMIN; lose <= SMAX; lose++) for (let win = lose; win <= SMAX; win++) {
            const n = Math.min(3, (scori.get(`${win}-${lose}`) || []).length);
            ctx.fillStyle = n ? fill[n] : ink(0.06);
            ctx.fillRect(AX + (lose - SMIN) * CELL, (SMAX - win) * CELL, CELL - 0.5, CELL - 0.5);
        }
        ctx.font = '10px Inter, Arial'; ctx.fillStyle = ink(0.6); ctx.textBaseline = 'middle';
        for (let v = SMIN; v <= SMAX; v += 25) {
            ctx.textAlign = 'right'; ctx.fillText(String(v), AX - 4, (SMAX - v) * CELL + CELL / 2);
            ctx.textAlign = 'center'; ctx.fillText(String(v), AX + (v - SMIN) * CELL, SN * CELL + 12);
        }
        const tip = el.querySelector('#scori-tip');
        canvas.addEventListener('click', e => {
            const r = canvas.getBoundingClientRect();
            const lose = SMIN + Math.floor((e.clientX - r.left - AX) / CELL), win = SMAX - Math.floor((e.clientY - r.top) / CELL);
            if (lose < SMIN || win > SMAX || win < lose) return;
            const list = (scori.get(`${win}-${lose}`) || []).slice().sort((x, y) => y.season - x.season || y.week - x.week);
            tip.innerHTML = `<div class="list-h">${win} - ${lose} · ${list.length ? `${list.length} game${list.length === 1 ? '' : 's'}` : 'never happened'}</div>` +
                (list.slice(0, 6).map(x => `<div class="row"><span class="row-main"><b>${esc(x.winner)} def. ${esc(x.loser)}</b><small>${x.season} · week ${x.week}</small></span>
                    <span class="row-num">${x.win.toFixed(1)}<small>${x.lose.toFixed(1)}</small></span></div>`).join('') || '<p class="muted" style="padding:14px">A scorigami waiting to happen.</p>');
        });
    }

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
            const picture = await LeagueDb.playoffPicture(year);
            const seedOf = {};
            picture.qualifiers.forEach(q => { seedOf[`${q.bracket}|${q.owner}`] = q.seed; });
            // brackets, round by round (ESPN bracket style): swipe sideways through the rounds
            const groups = [];
            picture.bracket.forEach(r => {
                let gr = groups.find(x => x.name === r.bracket);
                if (!gr) groups.push(gr = { name: r.bracket, rounds: {} });
                (gr.rounds[r.roundNumber] = gr.rounds[r.roundNumber] || []).push(r);
            });
            const roundName = (n, i, list, all) => i === all.length - 1 && list.length === 1 ? 'Final'
                : i === all.length - 2 && list.length === 2 ? 'Semifinals' : `Round ${n}`;
            const side = (gName, name, score, won) => name
                ? `<div class="br-side${won ? ' won' : ''}"><span class="br-seed">${seedOf[`${gName}|${name}`] || ''}</span><img src="${GT.logo(name)}" alt="">
                    <b>${esc(name)}</b><span class="br-score">${pts(score)}</span></div>`
                : '<div class="br-side tbd"><span class="br-seed"></span><span></span><b>TBD</b><span class="br-score"></span></div>';
            const bracketHtml = groups.map((gr, gi) => {
                const nums = Object.keys(gr.rounds).map(Number).sort((x, y) => x - y);
                const lists = nums.map(n => gr.rounds[n].sort((x, y) => x.slotInRound - y.slotInRound));
                const tallest = Math.max(...lists.map(l => l.length));
                return `<div class="br-group" data-group="${gi}"${gi ? ' hidden' : ''}>
                    <div class="chips br-rounds">${nums.map((n, i) => `<button class="chip${i ? '' : ' on'}" data-round="${i}">${roundName(n, i, lists[i], lists)}</button>`).join('')}</div>
                    <div class="br-scroll"><div class="br-track">${lists.map(list => `<div class="br-col" style="height:${tallest * 118}px">
                        ${list.map(r => { const won = r.teamScore > r.opponentScore, lost = r.opponentScore > r.teamScore;
                            return `<a class="br-game"${r.gameId ? ` href="#/game/${r.gameId}"` : ''}>${side(gr.name, r.team, r.teamScore, won)}${side(gr.name, r.opponent, r.opponentScore, lost)}</a>`; }).join('')}
                    </div>`).join('')}</div></div></div>`;
            }).join('');
            return `
            ${champ ? `<div class="champ"><img src="${GT.logo(champ.o.name)}" alt=""><span><small>${year} Champion</small><b>${esc(champ.o.name)}</b>
                <small>${esc(GT.teamName(b, champ.o.name, year))}</small></span></div>` : ''}
            <div class="row-links">
                <a class="row tall" href="#/standings?season=${year}"><span class="row-main"><b>Standings</b><small>Final regular-season table</small></span>${chev}</a>
                <a class="row tall" href="#/scores?season=${year}"><span class="row-main"><b>Scores</b><small>Every week and every game</small></span>${chev}</a>
            </div>
            ${APP.seg('ss-seg', [groups.length ? 'Bracket' : 'Bracket (none yet)', 'Placements'], groups.length ? 0 : 1)}
            <div class="ss-pane" data-pane="0"${groups.length ? '' : ' hidden'}>
                ${groups.length > 1 ? APP.seg('br-groups', groups.map(gr => gr.name)) : ''}${bracketHtml}
            </div>
            <div class="ss-pane" data-pane="1"${groups.length ? ' hidden' : ''}>
                ${places.length ? `<div class="card">${places.map(p => `<a class="row place" href="#/manager/${p.o.id}?season=${year}"><span class="yr small">${ord(p.place)}</span>
                    <span class="row-main end"><b>${esc(p.o.name)}</b><small>${esc(GT.teamName(b, p.o.name, year))}</small></span>
                    <img class="row-logo" src="${GT.logo(p.o.name)}" alt="">${chev}</a>`).join('')}</div>`
                    : '<p class="muted pad">The season is still being played.</p>'}
            </div>`;
        },
        after(route, el) {
            APP.bindSeg(el, 'ss-seg', i => el.querySelectorAll('.ss-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }));
            APP.bindSeg(el, 'br-groups', i => el.querySelectorAll('.br-group').forEach(g => { g.hidden = g.dataset.group !== String(i); }));
            // round chips <-> swipe position stay in step
            el.querySelectorAll('.br-group').forEach(group => {
                const scroller = group.querySelector('.br-scroll'), chips = [...group.querySelectorAll('.br-rounds .chip')];
                const colW = () => group.querySelector('.br-col').offsetWidth + 12;
                chips.forEach((c, i) => c.addEventListener('click', () => scroller.scrollTo({ left: i * colW(), behavior: 'smooth' })));
                scroller.addEventListener('scroll', () => {
                    const i = Math.round(scroller.scrollLeft / colW());
                    chips.forEach((c, n) => c.classList.toggle('on', n === i));
                }, { passive: true });
            });
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
