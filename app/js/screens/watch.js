/* Watch: members only (the website's js/watch.js, nflplus.js, live-fantasy.js, watch-matchup.js and fp-ticker.js, shared).
   Built from the app's game center pieces:
     feature band   the video in the photo slot; the dark panel under it: the NFL game (arrows step through the guide's
                    games), the feed buttons, then your matchup as the striped score bars with projected finals and win odds
     Matchup        both lineups in the game center's mirrored rows: live points, projections, bench
     Ticker         each play's fantasy points for anyone in your matchup ("+2.70 Stevenson · 18-yd catch"), ~15 s behind
   Whose matchup: a manager's code says; with the commissioner's passcode it's "Your team" (More). Points come only from
   ESPN's live box score; projections (ESPN's, in league.db) only feed the projected finals and win odds.
   Full screen: the video and its bar; the chevron pulls out a panel with the ticker, the matchup and the game's stats. */
(function () {
    const { esc } = APP;
    const f2 = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
    const f1 = v => (Math.round((Number(v) || 0) * 10) / 10).toFixed(1);
    const etDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const STARTER = s => s !== 'BE' && s !== 'IR';
    const PLAY_DELAY = 15000;
    let lock = null, conn = null, timer = null;

    APP.screen('watch', {
        tab: 'more',
        bar: () => ({ back: true, title: 'Watch' }),
        async render() {
            const b = await GT.load();
            lock = await WATCH.loadLock(APP.url('data/watch.json'));
            if (!lock) return `${APP.pageHead({ eyebrow: 'Members only', title: `${b.season} Watch` })}<div class="next"><h2>Not set up yet</h2><p>The commissioner hasn't turned on Watch for this season.</p></div>`;
            return '<div id="w-body"></div>';
        },
        after(route, el) {
            const body = el.querySelector('#w-body');
            if (!body) return;
            conn = WATCH.remembered(lock);
            if (conn) open(body); else locked(body);
        }
    });

    async function locked(body, message = '') {
        clearTimeout(timer);
        const b = await GT.load();
        body.innerHTML = `${APP.pageHead({ eyebrow: 'Members only', title: `${b.season} Watch` })}
            <form id="w-form" autocomplete="off"><div class="search"><input id="w-pass" type="password" placeholder="Code" aria-label="Code"></div>
            <button class="btn-wide" type="submit" style="width:calc(100% - 24px);border:0">Unlock</button><p class="note pad w-msg" id="w-msg">${esc(message)}</p></form>`;
        const msg = body.querySelector('#w-msg');
        body.querySelector('#w-form').addEventListener('submit', async e => {
            e.preventDefault();
            msg.textContent = 'Checking...';
            const code = body.querySelector('#w-pass').value;
            const unlocked = code ? await WATCH.unlock(lock, code).catch(() => null) : null;
            if (unlocked) { conn = unlocked; open(body); } else msg.textContent = "That code doesn't open Watch.";
        });
    }

    // ---------------------------------------------------------------- projections: projected finals and win odds
    // a starter's projected final: points so far plus his projection for the time still to play (all of it before
    // kickoff, none after the final); win odds from the gap between the two projected finals, each player's remaining
    // spread taken as half his remaining projection
    const timeLeft = g => {
        if (!g) return 0;
        if (g.state === 'pre') return 1;
        if (g.state === 'post') return 0;
        const [mm, ss] = String(g.clock || '0:00').split(':').map(Number);
        const played = (Math.max(1, g.period) - 1) * 15 + (15 - (mm || 0) - (ss || 0) / 60);
        return Math.max(0, Math.min(1, (60 - played) / 60));
    };
    const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
    function project(side, proj) {
        let total = 0, varSum = 0;
        side.all.filter(p => STARTER(p.slot)).forEach(p => {
            const rem = timeLeft(p.game), pj = proj[String(p.id)] || 0;
            total += p.pts + pj * rem; varSum += Math.pow(0.5 * pj * rem, 2);
        });
        return { total, varSum };
    }
    function odds(a, b) {
        const sd = Math.sqrt(a.varSum + b.varSum);
        if (!sd) return a.total > b.total ? 1 : a.total < b.total ? 0 : 0.5;
        return 0.5 * (1 + erf((a.total - b.total) / sd / Math.SQRT2));
    }

    async function open(body) {
        const b = await GT.load(), who = conn.who;
        const rules = await LIVEFP.rules(APP.url('data/scoring_rules.json'), b.season);
        const myId = who.role === 'manager' ? Number(who.owner) : APP.me();
        const myName = myId ? (b.byId[myId] || {}).name || 'You' : null;
        body.innerHTML = `<section class="feature w-feature">
                <div class="w-watch" id="w-watch">
                    <div class="w-stage"><video id="w-video" controls controlslist="nofullscreen" playsinline></video>
                        <div class="w-bar"><div class="w-now" id="w-now"><b>Pick a feed</b><small>Feeds light up when the game is on</small></div>
                            <div class="w-feeds" id="w-feeds"></div><button class="w-tool" id="w-full" type="button">Full</button></div></div>
                    <aside class="w-xray" id="w-xray"><nav class="xr-tabs">${[['ticker', 'Ticker'], ['matchup', 'Matchup'], ['stats', 'Stats']].map(([k, l], i) => `<button type="button" data-tab="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</nav>
                        <div class="xr-pane" id="xr-pane"></div></aside>
                    <button class="w-chev" id="w-chev" type="button" aria-label="Show or hide the stats">›</button>
                </div>
                <div class="ft-panel w-panel"><div class="w-game" id="w-game"></div><div id="w-bars"></div></div>
            </section>
            ${myId ? APP.seg('w-seg', ['Matchup', 'Ticker']) : ''}
            <div id="w-below"></div>
            <div class="section-h"><h2></h2><button id="w-lock" type="button">Lock Watch</button></div>`;
        const $ = sel => body.querySelector(sel);
        const video = $('#w-video'), feeds = $('#w-feeds'), wrap = $('#w-watch'), gameEl = $('#w-game'), barsEl = $('#w-bars'), below = $('#w-below'), pane = $('#xr-pane');
        const setNow = (title, text) => { $('#w-now').innerHTML = `<b>${esc(title)}</b><small>${esc(text)}</small>`; };
        $('#w-lock').addEventListener('click', () => { exitFull(wrap); WATCH.stop(); WATCH.forget(); conn = null; locked(body); });

        // ---------------------------------------------------------------- state
        let list = [], selected = null, boxData = null, active = null, view = 0, xtab = 'ticker';
        let m = null, mKey = null, score = null, proj = {}, ticks = [];
        const current = () => list.find(g => g.key === selected);
        video.addEventListener('watcherror', e => { setNow(e.detail.title, e.detail.text); active = null; feeds.innerHTML = NFLPLUS.feedsHtml(current(), active); });

        // ---------------------------------------------------------------- full screen + the chevron panel
        const full = () => document.fullscreenElement === wrap || wrap.classList.contains('w-fs');
        const chev = () => { $('#w-chev').textContent = wrap.classList.contains('w-hide') ? '‹' : '›'; };
        $('#w-full').addEventListener('click', async () => {
            if (full()) { exitFull(wrap); $('#w-full').textContent = 'Full'; return chev(); }
            try { await wrap.requestFullscreen(); } catch (_) { wrap.classList.add('w-fs'); }
            try { await screen.orientation.lock('landscape'); } catch (_) { /* not allowed here */ }
            wrap.classList.add('w-hide'); $('#w-full').textContent = 'Exit'; chev(); drawPane();
        });
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { wrap.classList.remove('w-hide'); $('#w-full').textContent = 'Full'; } chev(); });
        $('#w-chev').addEventListener('click', () => { wrap.classList.toggle('w-hide'); chev(); drawPane(); });
        $('.xr-tabs').addEventListener('click', e => { const t = e.target.closest('button[data-tab]'); if (!t) return; xtab = t.dataset.tab;
            body.querySelectorAll('.xr-tabs button').forEach(x => x.classList.toggle('on', x === t)); drawPane(); });

        // ---------------------------------------------------------------- pieces
        const when = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        // the NFL game: ‹ [logo] NE 7  10 CHI [logo] ›, the status under it
        function drawGame() {
            const game = current(), g = game && game.event, n = list.length;
            const arrow = (d, s) => n > 1 ? `<button class="w-arrow" type="button" data-step="${d}" aria-label="${d < 0 ? 'Previous' : 'Next'} game">${s}</button>` : '<span></span>';
            if (!game) { gameEl.innerHTML = `<div class="ft-kicker">Today &amp; tomorrow</div><div class="w-gline"><span></span><b class="w-none">Nothing on the guide yet</b><span></span></div>`; feeds.innerHTML = ''; return; }
            const logo = a => `<img src="assets/nfl-logos/${String(a).toLowerCase()}.png" alt="" onerror="this.src='assets/nfl-logos/nfl.png';this.onerror=null">`;
            const st = !g ? when(game.start) : g.state === 'in' ? `Live · ${g.detail}` : g.state === 'post' ? g.detail : when(g.date);
            const pre = !g || g.state === 'pre', [A, H] = g ? g.teams : [];
            gameEl.innerHTML = `<div class="ft-kicker">${esc(game.label)}${n > 1 ? ` · ${list.indexOf(game) + 1} of ${n}` : ''}</div>
                <div class="w-gline">${arrow(-1, '‹')}${g ? `<span class="w-gt">${logo(A.abbr)}<b>${esc(A.abbr)}</b></span>
                    <span class="w-gs"><b class="${!pre && Number(A.score) > Number(H.score) ? 'won' : ''}">${pre ? '–' : esc(A.score)}</b><i>${pre ? '@' : ''}</i><b class="${!pre && Number(H.score) > Number(A.score) ? 'won' : ''}">${pre ? '–' : esc(H.score)}</b></span>
                    <span class="w-gt r"><b>${esc(H.abbr)}</b>${logo(H.abbr)}</span>` : `<b class="w-none">${esc(game.title)}</b>`}${arrow(1, '›')}</div>
                <div class="ft-copy w-status">${esc(st)}${g && g.situation ? ` · ${esc(g.situation.text)}` : ''}</div>`;
            feeds.innerHTML = NFLPLUS.feedsHtml(game, active);
        }
        // your matchup as the game center's striped bars, with projected finals and win odds
        function drawBars() {
            if (!myId) { barsEl.innerHTML = `<a class="w-pickme" href="#/more">Set <b>Your team</b> in More to see your matchup and ticker ›</a>`; return; }
            if (!m || m.missing) { barsEl.innerHTML = `<p class="ft-copy">${esc(m && m.missing ? m.missing : 'Loading your matchup...')}</p>`; return; }
            if (!score) { barsEl.innerHTML = '<p class="ft-copy">Scoring your matchup...</p>'; return; }
            const pa = project(score.me, proj), pb = project(score.opp, proj), p = odds(pa, pb);
            const max = Math.max(pa.total, pb.total, 1);
            const bar = (t, lead) => `<div class="ft-team${lead ? ' won' : ''}"><span class="ft-name">${esc(t.name)}</span>
                <span class="ft-bar"><span style="width:${(t.total / max * 100).toFixed(1)}%"></span></span><span class="ft-mark">${lead ? '▸' : ''}</span><span class="ft-score">${f2(t.total)}</span></div>`;
            barsEl.innerHTML = `<div class="ft-teams w-teams">${bar(score.me, score.me.total > score.opp.total)}${bar(score.opp, score.opp.total > score.me.total)}</div>
                <div class="w-odds"><span>Proj ${f1(pa.total)} – ${f1(pb.total)}</span><span class="w-oddbar"><i style="width:${(p * 100).toFixed(0)}%"></i></span><b>${Math.round(p * 100)}% to win</b></div>`;
        }
        // the matchup in the game center's mirrored rows
        function matchupHtml() {
            if (!score) return '<div class="loading"><span class="spinner"></span>Scoring your matchup...</div>';
            const ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST', 'P', 'HC'];
            const count = (s, slot) => s.all.filter(p => p.slot === slot).length;
            const slots = ORDER.flatMap(slot => Array(Math.max(count(score.me, slot), count(score.opp, slot))).fill(slot));
            const take = (all, slot, used) => { const p = all.find(x => x.slot === slot && !used.has(x)); if (p) used.add(p); return p; };
            const status = p => !p.game ? 'Bye' : p.game.state === 'pre' ? when(p.game.date).split(',')[0] : p.game.state === 'post' ? 'Final' : p.game.detail;
            const short = n => { const parts = String(n).split(' '); return parts.length > 1 && !/D\/ST|Coach/.test(n) ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n; };
            const side = (p, al) => p ? `<span class="gx-p ${al}"><b>${esc(short(p.name))}</b><small>${esc(p.team)} · ${esc(status(p))}</small></span>` : '<span class="gx-p muted">-</span>';
            const num = (p, o) => `<span class="gx-n${p && p.game && p.game.state === 'in' ? ' live' : ''}${p && o && p.pts > o.pts ? ' up' : ''}"><b>${p ? f2(p.pts) : '-'}</b><small>${p ? f1(proj[String(p.id)] || 0) : ''}</small></span>`;
            const uA = new Set(), uB = new Set();
            const rows = list2 => list2.map(slot => { const a = take(score.me.all, slot, uA), c = take(score.opp.all, slot, uB); return `<div class="gx-row">${side(a, 'l')}${num(a, c)}<span class="gx-slot">${slot}</span>${num(c, a)}${side(c, 'r')}</div>`; }).join('');
            const head = `<div class="gx-teams"><img src="${GT.logo(score.me.name)}" alt=""><b>${esc(score.me.name)}</b><span></span><b class="r">${esc(score.opp.name)}</b><img src="${GT.logo(score.opp.name)}" alt=""></div>`;
            const tot = (s, bench) => s.all.filter(p => bench ? p.slot === 'BE' : STARTER(p.slot)).reduce((t, p) => t + p.pts, 0);
            const totalRow = bench => `<div class="gx-row gx-tot"><span class="gx-p l"></span><span class="gx-n"><b>${f2(tot(score.me, bench))}</b></span><span class="gx-slot">TOT</span><span class="gx-n"><b>${f2(tot(score.opp, bench))}</b></span><span class="gx-p r"></span></div>`;
            const bench = Math.max(count(score.me, 'BE'), count(score.opp, 'BE'));
            return `<div class="card">${head}${rows(slots)}${totalRow(false)}</div>
                ${bench ? `<div class="sec-head small"><h3 class="sec-sub">Bench</h3></div><div class="card">${head}${rows(Array(bench).fill('BE'))}${totalRow(true)}</div>` : ''}
                <p class="note pad">Points live from ESPN's box score; the small numbers are ESPN's projections.</p>`;
        }
        // the ticker: fantasy points per play for anyone in your matchup, newest first, ~15 s behind like the video
        function tickerHtml() {
            if (!score) return '<div class="loading"><span class="spinner"></span>Scoring your matchup...</div>';
            const cutoff = Date.now() - PLAY_DELAY, shown = ticks.filter(t => !t.wall || t.wall <= cutoff).slice().reverse();
            if (!shown.length) return `<p class="note pad">${boxData && boxData.state !== 'pre' ? 'No fantasy points for your matchup in this game yet.' : 'The ticker starts at kickoff.'}</p>`;
            const shot = t => t.id > 0 ? `https://a.espncdn.com/i/headshots/nfl/players/full/${t.id}.png` : `assets/nfl-logos/${String(t.team).toLowerCase()}.png`;
            return `<div class="card w-ticks">${shown.map(t => `<div class="w-tick${t.mine ? ' mine' : ''}">
                <span class="tp-shot"><img src="${shot(t)}" alt="" onerror="this.src='assets/nfl-logos/nfl.png';this.onerror=null"></span>
                <span class="w-tw"><b>${esc(t.name)}</b><small>${esc(t.what)} · Q${esc(t.q)} ${esc(t.clock)}${STARTER(t.slot) ? '' : ' · bench'}</small></span>
                <span class="w-tp${t.pts < 0 ? ' neg' : ''}"><b>${t.pts > 0 ? '+' : ''}${f2(t.pts)}</b><small>${esc(t.manager)}</small></span></div>`).join('')}</div>
                <p class="note pad">Per play, read from the play-by-play; the box score total is the official one.</p>`;
        }
        function drawBelow() {
            if (!myId) { below.innerHTML = ''; return; }
            below.innerHTML = view === 0 ? matchupHtml() : tickerHtml();
        }
        function drawPane() {
            if (wrap.classList.contains('w-hide') || !full()) return;
            const game = current(), b2 = boxData && game && game.event && boxData.id === game.event.id ? boxData : null;
            pane.innerHTML = xtab === 'stats' ? (game ? NFLPLUS.statsPaneHtml(game, b2, 0) : '<p class="np-empty">No game on screen.</p>')
                : !myId ? '<p class="np-empty">Set Your team in More to see your matchup and ticker.</p>'
                : xtab === 'matchup' ? `<div class="xr-card w-xbars">${barsEl.innerHTML}</div>${matchupHtml()}` : tickerHtml();
        }

        // ---------------------------------------------------------------- data
        async function loadMatchup(game) {
            if (!myId) return;
            const want = who.role === 'manager' ? who.date : game ? etDay(game.start) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            if (mKey === want) return;
            mKey = want; score = null;
            m = await WMATCH.load({ owner: myId, name: myName, date: want }, b.season).catch(error => ({ missing: error.message }));
            proj = {};
            if (m && !m.missing) {
                const ids = [...m.me.roster, ...m.opp.roster].map(p => Number(p.id)).filter(Number.isFinite);
                const rows = await GT.query(`SELECT player_id AS id, projected FROM player_week_points WHERE season = $s AND week = $w AND player_id IN (${ids.join(',') || 0})`,
                                            { $s: b.season, $w: m.week }).catch(() => []);
                proj = Object.fromEntries(rows.map(r => [String(r.id), Number(r.projected) || 0]));
            }
        }
        function buildTicks() {
            ticks = [];
            if (!score || !boxData || boxData.state === 'pre' || !boxData.raw) return;
            const owner = {};
            [[score.me, true], [score.opp, false]].forEach(([s, mine]) => s.all.forEach(p => { owner[String(p.id)] = { ...p, mine, manager: s.name }; }));
            TICKER.plays(boxData.raw, rules).forEach(pl => pl.gains.forEach(g => { const p = owner[g.id];
                if (p) ticks.push({ id: Number(g.id), name: p.name, team: p.team, slot: p.slot, mine: p.mine, manager: p.manager, pts: g.pts, what: g.what, q: pl.q, clock: pl.clock, wall: pl.wall }); }));
        }
        async function refresh() {
            clearTimeout(timer);
            if (!document.body.contains(gameEl)) return;
            try {
                const g = await WATCH.guide(conn);
                list = NFLPLUS.games(g.programs, await NFLPLUS.events(g.programs));
            } catch (error) {
                if (!list.length) gameEl.innerHTML = `<p class="ft-copy">Can't reach the guide (${esc(error.message)}).</p>`;
            }
            if (!list.some(g => g.key === selected)) {
                const live = g => g.event && g.event.state === 'in', mine = g => who.role === 'manager' && etDay(g.start) === who.date;
                const first = list.find(g => live(g) && mine(g)) || list.find(live) || list.find(mine) || list[0];
                selected = first ? first.key : null;
            }
            const game = current(), ev = game && game.event;
            await loadMatchup(game);
            if (!ev) boxData = null;
            else if (!boxData || boxData.id !== ev.id || ev.state === 'in' || boxData.state !== ev.state) boxData = await NFLPLUS.box(ev.id).catch(() => boxData);
            if (m && !m.missing) score = await WMATCH.score(m, rules, ev ? { id: ev.id, state: ev.state, raw: boxData && boxData.id === ev.id && boxData.state !== 'pre' ? boxData.raw : null } : null).catch(() => score);
            buildTicks();
            drawGame(); drawBars(); drawBelow(); drawPane();
            const busy = list.some(g => (g.event && g.event.state === 'in') || g.feeds.some(f => f.open)), soon = NFLPLUS.nextStart(list);
            timer = setTimeout(refresh, Math.min(busy ? 20000 : 300000, soon != null ? soon + 1500 : Infinity));
        }
        // the ticker's 15 s delay: re-check every 3 s while it's showing
        const tickTimer = setInterval(() => { if (!document.body.contains(below)) return clearInterval(tickTimer);
            if (view === 1) drawBelow(); if (full() && xtab === 'ticker') drawPane(); }, 3000);

        // ---------------------------------------------------------------- input
        gameEl.addEventListener('click', e => { const s = e.target.closest('[data-step]'); if (!s || list.length < 2) return;
            const i = list.findIndex(g => g.key === selected); selected = list[(i + Number(s.dataset.step) + list.length) % list.length].key; boxData = null; refresh(); });
        if (myId) APP.bindSeg(body, 'w-seg', i => { view = i; drawBelow(); });
        feeds.addEventListener('click', e => {
            const btn = e.target.closest('button[data-ch]'), game = current(); if (!btn || !game) return;
            active = { key: game.key, ch: btn.dataset.ch }; feeds.innerHTML = NFLPLUS.feedsHtml(game, active);
            setNow(game.title, `Starting ${btn.firstChild.textContent}...`);
            try { WATCH.play(conn, btn.dataset.ch, video); setNow(game.title, `${btn.firstChild.textContent} · channel ${btn.dataset.ch}`); }
            catch (error) { setNow(game.title, error.message); }
        });
        refresh();
    }
    function exitFull(wrap) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        try { screen.orientation.unlock(); } catch (_) { /* nothing locked */ }
        if (wrap) wrap.classList.remove('w-fs', 'w-hide');
    }

    // leaving the screen stops the stream (freeing the channel) and the refreshes
    window.addEventListener('hashchange', () => {
        if (/^#\/watch\b/.test(location.hash)) return;
        clearTimeout(timer); WATCH.stop(); exitFull(document.getElementById('w-watch'));
    });
})();
