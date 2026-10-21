/* Watch: members only (the website's js/watch.js, nflplus.js, live-fantasy.js and watch-matchup.js, shared). Until a
   code is entered the screen shows nothing but the code box. Laid out like the website's Watch page, for a phone:
     header        the NFL game bug, then (manager's code) the fantasy matchup score
     player        full width, the game's title and feed buttons under it
     below         manager: both sides' players in this game (side by side when there's room); "Full rosters" opens
                   both lineups in the game center's mirrored table. Commissioner: today and tomorrow's games
     box score     with live fantasy points
   Full screen is laid out like Prime Video's X-Ray: the video and its title, a tabbed panel beside it in landscape (over
   it in portrait); "Hide info" gives the video the screen. Opened from Past Seasons. The lock (data/watch.json) and
   scoring rules are read live from the site, so new codes need no new release. */
(function () {
    const { esc } = APP;
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

    async function open(body) {
        const b = await GT.load(), who = conn.who, manager = who.role === 'manager';
        const rules = await LIVEFP.rules(APP.url('data/scoring_rules.json'), b.season);
        const dayText = manager ? new Date(`${who.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
        const m = manager ? await WMATCH.load(who, b.season).catch(error => ({ missing: error.message })) : null;
        const XTABS = manager ? [['stats', 'Stats'], ['fantasy', 'Fantasy'], ['plays', 'Plays']] : [['stats', 'Stats'], ['plays', 'Plays'], ['games', 'Games']];
        body.innerHTML = `${APP.pageHead({ eyebrow: manager ? `${esc(dayText)}${m && m.opp ? ` · Week ${m.week} vs ${esc(m.opp.name)}` : ''}` : 'Members only',
                                          title: manager ? `${who.name}'s Watch` : `${b.season} Watch` })}
            <section class="w-head"><div class="w-bugwrap" id="w-bugwrap"><div class="game-band" id="w-band"></div></div>${manager ? '<div class="w-mscore" id="w-mscore"></div>' : ''}</section>
            <div class="w-watch" id="w-watch">
                <div class="w-stage"><video id="w-video" controls controlslist="nofullscreen" playsinline></video>
                    <div class="w-bar"><div class="w-now" id="w-now"><b>Pick a feed</b><small>Feeds open when the game's window does</small></div>
                        <div class="w-feeds" id="w-feeds"></div><button class="w-tool w-info" id="w-info" type="button">Hide info</button>
                        <button class="w-tool" id="w-full" type="button">Full</button></div></div>
                <aside class="w-xray" id="w-xray"><nav class="xr-tabs">${XTABS.map(([k, label], i) => `<button type="button" data-tab="${k}" class="${i ? '' : 'on'}">${label}</button>`).join('')}</nav>
                    <div class="xr-pane" id="xr-pane"></div></aside>
            </div>
            <section class="w-below" id="w-below"></section>
            <div class="w-box" id="w-box" hidden></div>
            <div class="section-h"><h2></h2><button id="w-lock" type="button">Lock</button></div>`;
        const $ = sel => body.querySelector(sel);
        const video = $('#w-video'), band = $('#w-band'), feeds = $('#w-feeds'), boxEl = $('#w-box'), wrap = $('#w-watch'), below = $('#w-below'), pane = $('#xr-pane');
        const setNow = (title, text) => { $('#w-now').innerHTML = `<b>${esc(title)}</b><small>${esc(text)}</small>`; };
        video.addEventListener('watcherror', e => setNow(e.detail.title, e.detail.text));
        $('#w-lock').addEventListener('click', () => { exitFull(wrap); WATCH.stop(); WATCH.forget(); conn = null; locked(body); });

        // ---------------------------------------------------------------- full screen (video + X-Ray panel)
        const full = () => document.fullscreenElement === wrap || wrap.classList.contains('w-fs');
        const fsLabel = () => { $('#w-full').textContent = full() ? 'Exit' : 'Full'; };
        $('#w-full').addEventListener('click', async () => {
            if (full()) { exitFull(wrap); return fsLabel(); }
            try { await wrap.requestFullscreen(); } catch (_) { wrap.classList.add('w-fs'); }   // no Fullscreen API in this WebView: cover the screen
            try { await screen.orientation.lock('landscape'); } catch (_) { /* not allowed here: the phone's own rotation decides */ }
            fsLabel(); drawPane();
        });
        document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) wrap.classList.remove('w-hide'); fsLabel(); });
        $('#w-info').addEventListener('click', e => {
            wrap.classList.toggle('w-hide');
            e.target.textContent = wrap.classList.contains('w-hide') ? 'Show info' : 'Hide info';
        });
        let xtab = XTABS[0][0];
        $('.xr-tabs').addEventListener('click', e => {
            const t = e.target.closest('button[data-tab]'); if (!t) return;
            xtab = t.dataset.tab;
            body.querySelectorAll('.xr-tabs button').forEach(x => x.classList.toggle('on', x === t));
            drawPane();
        });

        // ---------------------------------------------------------------- the games, refreshed while anything is on
        let list = [], selected = null, boxData = null, score = null, showRosters = false;
        const current = () => list.find(g => g.key === selected);
        const etDay = g => new Date(g.start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        // the guide's games, day of and day ahead, in kickoff order; arrows either side of the game bug step through them
        const stepHtml = cls => list.length > 1 ? `<button class="${cls} step-prev" type="button" data-step="-1" aria-label="Previous game">‹</button>` : '';
        const stepNext = cls => list.length > 1 ? `<button class="${cls} step-next" type="button" data-step="1" aria-label="Next game">›</button>` : '';
        const countText = () => list.length > 1 ? `${list.findIndex(g => g.key === selected) + 1} of ${list.length}` : '';
        function step(by) {
            if (list.length < 2) return;
            const i = list.findIndex(g => g.key === selected);
            selected = list[(i + by + list.length) % list.length].key; boxData = null; refresh();
        }
        const cardsHtml = () => list.length ? `<div class="np-cards">${list.map(g => NFLPLUS.card(g, g.key === selected)).join('')}</div>` : '<p class="note pad">Nothing on the guide for today or tomorrow.</p>';
        const liveNow = () => { const g = current(); return !!(g && g.event && g.event.state === 'in'); };
        function drawPane() {
            const game = current(), b2 = boxData && game && game.event && boxData.id === game.event.id ? boxData : null;
            const nav = list.length > 1 ? `<div class="xr-nav">${stepHtml('xr-step')}<span>${countText()}</span>${stepNext('xr-step')}</div>` : '';
            pane.innerHTML = xtab === 'stats' ? (game ? nav + NFLPLUS.scoreCardHtml(game, b2) + NFLPLUS.leadersHtml(b2) : '<p class="np-empty">No game on screen.</p>')
                : xtab === 'plays' ? NFLPLUS.playsHtml(b2)
                : xtab === 'fantasy' ? (score ? `<div class="xr-card">${WMATCH.boardHtml(m, score, liveNow())}</div>${WMATCH.inGameHtml(score)}` : '<div class="loading"><span class="spinner"></span>Scoring...</div>')
                : cardsHtml();
        }
        function drawBelow() {
            if (!manager) { below.innerHTML = `<div class="section-h"><h2>Today &amp; Tomorrow</h2></div>${cardsHtml()}`; return; }
            if (m && m.missing) { below.innerHTML = `<p class="note pad">${esc(m.missing)}</p>`; return; }
            below.innerHTML = `<div class="section-h"><h2>In This Game</h2><button id="w-rosters" type="button">${showRosters ? 'Hide rosters' : 'Full rosters'}</button></div>
                ${score ? WMATCH.inGameHtml(score) : '<div class="loading"><span class="spinner"></span>Scoring the matchup...</div>'}
                ${showRosters && score ? `<div class="wm-full">${WMATCH.rostersHtml(score)}</div>` : ''}`;
        }
        async function drawBox() {
            const game = current();
            if (!game || !game.event) { boxEl.hidden = true; boxData = null; return; }
            boxEl.hidden = false;
            try {
                boxData = await NFLPLUS.box(game.event.id);
                boxEl.innerHTML = NFLPLUS.boxHtml(game, boxData, boxData.state === 'pre' ? null : LIVEFP.score(boxData.raw, rules));
            } catch (error) {
                boxEl.innerHTML = `<p class="note pad">Can't load the box score from ESPN right now (${esc(error.message)}).</p>`;
            }
        }
        function drawTop() {
            const game = current();
            band.innerHTML = game ? NFLPLUS.bandHtml(game).replace('</div>', `${list.length > 1 ? `<span class="w-count">${countText()}</span>` : ''}</div>`)
                : `<div class="band-label"><span class="pill pill-dark">${esc(manager ? dayText : 'Guide')}</span>Today &amp; tomorrow</div>
                <div class="scoreboard np-band-solo"><b>Games show the day before and the day of</b></div>`;
            const wrapEl = $('#w-bugwrap');
            wrapEl.querySelectorAll('.w-step').forEach(x => x.remove());
            if (list.length > 1) { wrapEl.insertAdjacentHTML('afterbegin', stepHtml('w-step')); wrapEl.insertAdjacentHTML('beforeend', stepNext('w-step')); }
            wrapEl.classList.toggle('multi', list.length > 1);
            if (manager) $('#w-mscore').innerHTML = m && m.missing ? `<p class="note pad">${esc(m.missing)}</p>` : score ? WMATCH.boardHtml(m, score, liveNow()) : '<div class="loading"><span class="spinner"></span>Scoring...</div>';
            feeds.innerHTML = NFLPLUS.feedsHtml(game);
        }
        async function refresh() {
            clearTimeout(timer);
            if (!document.body.contains(pane)) return;           // the screen was left
            try {
                const g = await WATCH.guide(conn);
                list = NFLPLUS.games(g.programs, await NFLPLUS.events(g.programs));
            } catch (error) {
                if (!list.length) below.innerHTML = `<p class="note pad">Can't reach the guide (${esc(error.message)}). Try again later.</p>`;
            }
            if (!list.some(g => g.key === selected)) {
                const live = g => g.event && g.event.state === 'in', mine = g => manager && etDay(g) === who.date;
                const first = list.find(g => live(g) && mine(g)) || list.find(live) || list.find(mine) || list[0];
                selected = first ? first.key : null;
            }
            const ev = (current() || {}).event;
            if (!ev) { boxEl.hidden = true; boxData = null; }
            else if (!boxData || boxData.id !== ev.id || ev.state === 'in' || boxData.state !== ev.state) await drawBox();
            if (manager && m && !m.missing) {
                // the game on screen, before kickoff too (its players are listed from the start); its summary once there is one
                score = await WMATCH.score(m, rules, ev ? { id: ev.id, state: ev.state, raw: boxData && boxData.id === ev.id && boxData.state !== 'pre' ? boxData.raw : null } : null).catch(() => score);
            }
            drawTop(); drawBelow(); drawPane();
            const busy = list.some(g => (g.event && g.event.state === 'in') || g.feeds.some(f => f.open));
            timer = setTimeout(refresh, busy ? 20000 : 300000);
        }
        const pick = e => {
            const el = e.target.closest('.np-card'); if (!el || el.dataset.key === selected) return;
            selected = el.dataset.key; boxData = null; refresh();
        };
        below.addEventListener('click', e => {
            if (e.target.closest('#w-rosters')) { showRosters = !showRosters; drawBelow(); return; }
            pick(e);
        });
        pane.addEventListener('click', e => { const s = e.target.closest('[data-step]'); if (s) step(Number(s.dataset.step)); else pick(e); });
        $('#w-bugwrap').addEventListener('click', e => { const s = e.target.closest('[data-step]'); if (s) step(Number(s.dataset.step)); });
        feeds.addEventListener('click', e => {
            const btn = e.target.closest('button[data-ch]'), game = current(); if (!btn || !game) return;
            feeds.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn));
            setNow(game.title, `Starting ${btn.firstChild.textContent}...`);
            window.scrollTo({ top: wrap.offsetTop - 60, behavior: 'smooth' });
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
