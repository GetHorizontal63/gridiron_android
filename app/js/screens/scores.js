/* Scores: every week of the season as chips, every matchup as a card; Game Center: one matchup, slot by slot. */
(function () {
    const { esc } = APP;
    const { pts } = LIB;

    APP.screen('scores', {
        tab: 'scores',
        async render(route) {
            const b = await GT.load();
            const year = Number(route.query.get('season')) || b.season;
            const [S, years] = await Promise.all([LIB.season(year), APP.seasons()]);
            const weeks = [...new Set(S.played.map(g => g.week))];
            const week = Number(route.query.get('week')) || weeks[weeks.length - 1];
            const list = S.played.filter(g => g.week === week);
            const label = w => { const g = S.played.find(x => x.week === w); return g && g.period !== 'Regular' ? GT.periodLabel(g.period, w).replace(/ W\d+$/, '') : `Week ${w}`; };
            const team = (name, score, won) => `<div class="m-team${won ? ' won' : ''}">
                <img src="${GT.logo(name)}" alt=""><span class="m-name"><b>${esc(name)}</b><small>${esc(GT.teamName(b, name, year))}</small></span>
                <span class="m-score">${pts(score)}</span></div>`;
            const kick = GT.weekDate(b, year, week);
            return `
            ${APP.seasonChips(years, year, y => `#/scores?season=${y}`)}
            <div class="chips" id="week-chips">${weeks.map(w => `<a class="chip${w === week ? ' on' : ''}" href="#/scores?season=${year}&week=${w}" data-replace>${esc(label(w))}</a>`).join('')}</div>
            <div class="section-h"><h2>${esc(label(week))}</h2><span class="muted" style="font-size:12px">${kick ? GT.fmtDate(kick) : ''}</span></div>
            <div class="matchups">${list.map(g => `<a class="match" href="#/game/${g.id}">
                ${team(g.home, g.hs, g.hs > g.aws)}${team(g.away, g.aws, g.aws > g.hs)}</a>`).join('') || '<p class="muted pad">No games this week.</p>'}</div>`;
        },
        after(route, el) {
            const on = el.querySelector('#week-chips .on');
            if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
            APP.replaceLinks(el);
        }
    });

    // ---------------------------------------------------------------- Game Center
    APP.screen('game', {
        tab: 'scores',
        bar: () => ({ back: true, title: 'Game Center' }),
        async render(route) {
            const b = await GT.load();
            const [g] = await GT.query(`
                SELECT m.game_id AS id, m.season, m.week, m.season_period AS period, h.owner_id AS hid, a.display_name AS home, h.team_score AS hs,
                       h.opponent_owner_id AS aid, o.display_name AS away, h.opponent_score AS aws, h.bench_score AS hb, h.opponent_bench_score AS ab
                FROM matchups m JOIN matchup_team_stats h ON h.game_id = m.game_id AND h.owner_id < h.opponent_owner_id
                JOIN owners a ON a.owner_id = h.owner_id JOIN owners o ON o.owner_id = h.opponent_owner_id
                WHERE m.game_id = $id`, { $id: Number(route.args[0]) });
            if (!g) return '<div class="next"><h2>Not found</h2></div>';
            const [left, right] = await Promise.all([GT.roster(g.hid, g.season, g.week), GT.roster(g.aid, g.season, g.week)]);
            const homeWon = g.hs > g.aws, awayWon = g.aws > g.hs;
            const side = (name, score, won, align) => `<a class="gc-side ${align}${won ? ' won' : ''}" href="#/manager/${b.byName[name.toLowerCase()].id}?season=${g.season}">
                <img src="${GT.logo(name)}" alt=""><b>${esc(name)}</b><small>${esc(GT.teamName(b, name, g.season))}</small><span>${pts(score)}</span></a>`;

            // starters paired slot by slot (QB vs QB, RB1 vs RB1 ...), then bench
            const ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K', 'P', 'HC'];
            const bySlot = rows => { const m = {}; rows.filter(GT.isStarter).sort((x, y) => (y.points || 0) - (x.points || 0)).forEach(r => { (m[r.slot] = m[r.slot] || []).push(r); }); return m; };
            const L = bySlot(left), R = bySlot(right);
            // box scores sit two across, so players show as "C. McCaffrey"; team units (D/ST, coaches) keep their full name
            const short = n => { const parts = String(n).split(' '); return parts.length > 1 && !/D\/ST|Coach/.test(n) ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n; };
            const cell = (r, align) => r ? `<a class="bx-p ${align}" href="#/player/${r.playerId}"><b>${esc(short(r.name))}</b><small>${esc(r.pos)} · ${esc(r.team || '')}</small></a>` : `<span class="bx-p ${align} muted">-</span>`;
            const num = (r, other) => `<span class="bx-n${r && other && (r.points || 0) > (other.points || 0) ? ' up' : ''}">${r ? pts(r.points) : '-'}</span>`;
            const slotRows = ORDER.flatMap(slot => {
                const n = Math.max((L[slot] || []).length, (R[slot] || []).length);
                return Array.from({ length: n }, (_, i) => {
                    const a = (L[slot] || [])[i], c = (R[slot] || [])[i];
                    return `<div class="bx-row">${cell(a, 'l')}${num(a, c)}<span class="bx-slot">${esc(slot)}</span>${num(c, a)}${cell(c, 'r')}</div>`;
                });
            }).join('');
            const hasRoster = left.length || right.length;
            const L1 = LIB.lineup(left), R1 = LIB.lineup(right);
            // efficiency: each team's lineup grade, then the bench players who should have started (and who they'd replace)
            const grade = (name, m) => `<div class="eff-team">
                <div class="eff-head"><img src="${GT.logo(name)}" alt=""><b>${esc(name)}</b></div>
                <div class="eff-stats">
                    <span><b>${m.eff == null ? '-' : m.eff.toFixed(1) + '%'}</b><small>Efficiency</small></span>
                    <span><b>${m.fp == null ? '-' : m.fp.toFixed(1)}</b><small>FP+</small></span>
                    <span><b>${pts(m.optimal - m.actual)}</b><small>Left on bench</small></span>
                </div></div>`;
            const swapRows = (name, m) => m.swaps.length
                ? m.swaps.map(o => `<div class="swap"><img src="${GT.logo(name)}" alt="">
                    <span class="swap-main"><b>${esc(short(o.bench.name))} <i>in</i></b><small>${o.starter ? `for ${esc(short(o.starter.name))} (${pts(o.starter.points)}) · ${esc(o.bench.pos)}` : o.bench.pos ? `open ${esc(o.bench.pos)} spot` : 'no matching starter'}</small></span>
                    <span class="swap-gain">+${pts(o.gain)}</span></div>`).join('')
                : `<div class="swap none"><img src="${GT.logo(name)}" alt=""><span class="swap-main"><b>Perfect lineup</b><small>No bench player beat a starter</small></span></div>`;
            return `
            <div class="gc-head">
                <div class="gc-meta">${esc(GT.periodLabel(g.period, g.week))} · ${g.season}</div>
                <div class="gc-board">${side(g.home, g.hs, homeWon, 'l')}<span class="gc-vs">FINAL</span>${side(g.away, g.aws, awayWon, 'r')}</div>
                ${hasRoster ? `<div class="gc-proj"><span>Proj ${pts(L1.projected)}</span><span></span><span>Proj ${pts(R1.projected)}</span></div>` : ''}
            </div>
            ${hasRoster ? `
            ${APP.seg('gc-seg', ['Box score', 'Efficiency'])}
            <div class="card gc-pane" data-pane="0">${slotRows}</div>
            <div class="gc-pane" data-pane="1" hidden>
                <div class="card eff-grid">${grade(g.home, L1)}${grade(g.away, R1)}</div>
                <div class="section-h" style="margin-top:16px"><h2 style="font-size:18px">Replacements</h2></div>
                <p class="note pad">Bench players who outscored a starter at their position, and who they'd have replaced in the best lineup.</p>
                <div class="card">${swapRows(g.home, L1)}${swapRows(g.away, R1)}</div>
            </div>` : '<p class="muted pad">No lineups were saved for this game.</p>'}`;
        },
        after(route, el) {
            APP.bindSeg(el, 'gc-seg', i => el.querySelectorAll('.gc-pane').forEach(p => { p.hidden = p.dataset.pane !== String(i); }));
        }
    });
})();
