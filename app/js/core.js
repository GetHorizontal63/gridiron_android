/* App core: the small SITE helper the shared data modules expect, the screen router, and the app bar / tab bar.
   League data is read live from the published site (DATA_BASE); everything else ships inside the app. */
(function () {
    const DATA_BASE = 'https://grasstouchers.football/';           // the league site (GitHub Pages, custom domain)
    window.LEAGUE_DB_URL = DATA_BASE + 'data/league.db';                 // read by league-db.js

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const url = path => (path.startsWith('data/') ? DATA_BASE : '') + path;
    const cols = (...widths) => `<colgroup>${widths.map(w => `<col style="width:${w}">`).join('')}</colgroup>`;
    const color = name => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
    let season = null;
    // data.js / players.js / analytics.js use these; the website's header, hero and footer have no place in the app
    window.SITE = { url, esc, cols, color, param: () => null, setSeason: s => { season = s; } };

    // ---------------------------------------------------------------- icons (24px line icons)
    const I = {
        home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
        scores: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M3 12h4M17 12h4"/>',
        standings: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        managers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11.5a3 3 0 1 0 0-6M17.5 20h4a5.5 5.5 0 0 0-4.5-5.4"/>',
        more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
        back: '<path d="M15 5l-7 7 7 7"/>',
        prev: '<path d="M15 5l-7 7 7 7"/>',
        next: '<path d="M9 5l7 7-7 7"/>'
    };
    const icon = (name, fill = false) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;

    // ---------------------------------------------------------------- tabs + router
    const TABS = [['home', 'Home'], ['scores', 'Scores'], ['stats', 'Stats'], ['managers', 'Managers'], ['more', 'More']];
    const screens = {};
    const screenEl = document.getElementById('screen');

    function renderTabbar(active) {
        document.getElementById('tabbar').innerHTML = TABS.map(([key, label]) =>
            `<a href="#/${key}" class="${key === active ? 'on' : ''}" aria-label="${label}">${icon(key === 'stats' ? 'standings' : key, key === 'more')}<span>${label}</span></a>`).join('');
    }
    // top-level tabs show the league brand; detail screens show a back arrow and their own title
    // one app bar everywhere: the league brand. No back arrows; the phone's own back gesture / button handles that.
    function renderAppbar({ title, subtitle } = {}) { const back = false;
        document.getElementById('appbar').innerHTML = back
            ? `<button class="ab-btn" onclick="history.back()" aria-label="Back">${icon('back')}</button>
               <div class="ab-title"><span style="min-width:0"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span></div><span></span>`
            : `<span></span><div class="ab-title" style="justify-content:center"><img src="assets/logos/logo_2.png" alt="">
               <span style="min-width:0"><b>Grass Touchers</b><small>${esc(subtitle || (season ? `${season} season` : 'Fantasy Football League'))}</small></span></div><span></span>`;
    }

    // route: #/name/arg1/arg2?key=value
    function parse() {
        const [path, query] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
        const [name, ...args] = path.split('/');
        return { name: screens[name] ? name : 'home', args: args.map(decodeURIComponent), query: new URLSearchParams(query || '') };
    }
    let token = 0;
    async function show() {
        if (window.GT && !season) { try { await GT.load(); } catch (_) { /* offline: the bar falls back */ } }   // the bar shows the season on every screen
        const route = parse(), screen = screens[route.name], mine = ++token;
        renderTabbar(screen.tab || route.name);
        renderAppbar({});
        screenEl.className = 'screen';
        screenEl.innerHTML = '<div class="loading"><span class="spinner"></span>Loading...</div>';
        window.scrollTo(0, 0);
        try {
            const html = await screen.render(route);
            if (mine !== token) return;                     // the user already moved on
            screenEl.innerHTML = html;
            void screenEl.offsetWidth; screenEl.classList.add('enter');
            screenEl.querySelectorAll('select[data-nav]').forEach(s => s.addEventListener('change', () => location.replace(s.value)));
            screenEl.querySelectorAll('[data-pager]').forEach(list => paginate(list));
            // page header titles stay on one line: shrink the text to fit, like the website's hero title
            screenEl.querySelectorAll('.ph-title').forEach(h => { let s = parseFloat(getComputedStyle(h).fontSize); while (h.scrollWidth > h.clientWidth && s > 18) h.style.fontSize = `${--s}px`; });
            if (screen.after) screen.after(route, screenEl);
            renderAppbar({});                                // again, once the season is known
        } catch (error) {
            console.error(error);
            if (mine === token) screenEl.innerHTML = `<div class="next"><h2>Can't load</h2><p>Check your connection and try again.</p></div>`;
        }
    }
    window.addEventListener('hashchange', show);

    // ---------------------------------------------------------------- shared pieces used by several screens
    // segmented control: seg('id', ['A', 'B']) + bindSeg(el, 'id', i => ...)
    const seg = (id, labels, on = 0) => `<div class="seg" id="${id}">${labels.map((l, i) => `<button class="${i === on ? 'on' : ''}" data-i="${i}">${esc(l)}</button>`).join('')}</div>`;
    const bindSeg = (el, id, onPick) => el.querySelectorAll(`#${id} button`).forEach(btn => btn.addEventListener('click', () => {
        el.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === btn));
        onPick(Number(btn.dataset.i));
    }));
    // links marked data-replace switch the view in place (weeks, seasons) instead of stacking back-history
    const replaceLinks = el => el.querySelectorAll('a[data-replace]').forEach(a => a.addEventListener('click', e => {
        e.preventDefault(); location.replace(a.getAttribute('href'));
    }));
    let seasonList = null;
    const seasons = () => seasonList || (seasonList = GT.query('SELECT DISTINCT season FROM matchups ORDER BY season DESC').then(r => r.map(x => x.season)));
    // the website's controls: labeled dropdowns in one bar. A field = { label, options: [[href, text, selected]] };
    // picking an option goes to its href (in place, no back-history)
    const ctl = field => `<label class="ctl"><span>${esc(field.label)}</span><select data-nav>${field.options.map(([href, text, on]) =>
        `<option value="${esc(href)}"${on ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
    const ctlBar = (...fields) => `<div class="ctl-bar" style="--n:${fields.filter(Boolean).length}">${fields.filter(Boolean).map(ctl).join('')}</div>`;
    const seasonField = (list, year, href, extra = []) => ({ label: 'Season', options: [...extra, ...list.map(y => [href(y), `${y} season`, y === year])] });
    const seasonChips = (list, year, href, extra = []) => ctlBar(seasonField(list, year, href, extra));
    // division standings rows (seed, logo, manager, W-L, diff, PF) with the bye / play-in / playoff cut lines
    function standingsRows(rows, d, b) {
        const cut = n => n && (n === d.auto || (d.playin && n === d.auto + d.playin));
        return `<div class="st-row head"><span>#</span><span></span><span>Manager</span><span class="num">W-L</span><span class="num">Diff</span><span class="num">PF</span></div>
            ${rows.map((r, n) => `<a class="st-row${cut(n) ? ' cut' : ''}" href="#/manager/${b.byName[r.owner.toLowerCase()].id}">
                <span class="seed">${n + 1}</span><img src="${GT.logo(r.owner)}" alt=""><b>${esc(r.owner)}</b>
                <span class="num">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</span><span class="num ${r.diff >= 0 ? 'pos' : 'neg'}">${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)}</span>
                <span class="num">${Math.round(r.pf)}</span></a>`).join('')}
            ${d.auto ? `<div class="st-legend">${d.playin ? `1–${d.auto} bye · ${d.auto + 1}–${d.auto + d.playin} play-in · ${d.auto + d.playin + 1}+ Gulag` : `Top ${d.auto} make the playoffs`}</div>` : ''}`;
    }

    // ---------------------------------------------------------------- ten rows at a time (lists marked data-pager, or paginate(el))
    function paginate(list, per = 10) {
        if (list.nextElementSibling && list.nextElementSibling.classList.contains('pager')) list.nextElementSibling.remove();
        const rows = [...list.children], pages = Math.ceil(rows.length / per);
        rows.forEach(r => { r.hidden = false; });
        if (pages < 2) return;
        const bar = document.createElement('div'); bar.className = 'pager';
        list.after(bar);
        const go = n => {
            rows.forEach((r, i) => { r.hidden = Math.floor(i / per) !== n; });
            bar.innerHTML = `<button ${n ? '' : 'disabled'} data-p="${n - 1}">${icon('prev')}</button><span>${n * per + 1}–${Math.min(rows.length, n * per + per)} of ${rows.length}</span>
                <button ${n < pages - 1 ? '' : 'disabled'} data-p="${n + 1}">${icon('next')}</button>`;
            bar.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => go(Number(btn.dataset.p))));
        };
        go(0);
    }

    // ---------------------------------------------------------------- page header: the website's page hero (a league photo in
    // black and white under a dark gradient, a small-caps eyebrow, a big uppercase title, optionally a logo on a white square)
    const PHOTOS = [...Array.from({ length: 18 }, (_, i) => `background-${i + 1}.png`), ...Array.from({ length: 16 }, (_, i) => `background-${i + 19}.jpg`)];
    const photo = () => `https://grasstouchers.football/assets/images/${PHOTOS[Math.floor(Math.random() * PHOTOS.length)]}`;
    // image: a fixed header photo for a page (a file in the site's photo pool); otherwise a random one
    const pageHead = ({ eyebrow = '', title, logo = '', round = false, meta = '', image = '' }) => `<section class="ph" style="--photo:url('${image ? `https://grasstouchers.football/assets/images/${image}` : photo()}')">
        ${logo ? `<span class="ph-logo${round ? ' round' : ''}"><img src="${logo}" alt="" ${round ? `onerror="this.src='assets/nfl-logos/nfl.png';this.onerror=null"` : ''}></span>` : ''}
        <div class="ph-text">${eyebrow ? `<div class="ph-eyebrow">${eyebrow}</div>` : ''}<h1 class="ph-title">${esc(title)}</h1>${meta ? `<div class="ph-meta">${meta}</div>` : ''}</div>
    </section>`;

    // ---------------------------------------------------------------- update check: newest release on GitHub vs this build
    const DOWNLOAD_PAGE = 'https://grasstouchers.football/pages/app.html';
    const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
        for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
    async function checkUpdate(force = false) {
        const mine = window.APP_VERSION;
        if (!mine || mine === 'dev') return { status: 'dev' };
        try {
            const r = await fetch('https://api.github.com/repos/GetHorizontal63/gridiron_android/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
            if (!r.ok) return { status: 'error' };
            const latest = (await r.json()).tag_name.replace(/^v/, '');
            if (!newer(latest, mine)) return { status: 'current', latest };
            let dismissed = null; try { dismissed = localStorage.getItem('gt-update-dismissed'); } catch (_) { /* private mode */ }
            if (force || dismissed !== latest) showUpdate(latest);
            return { status: 'update', latest };
        } catch (_) { return { status: 'error' }; }
    }
    function showUpdate(latest) {
        if (document.getElementById('update-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'update-bar'; bar.className = 'update-bar';
        bar.innerHTML = `<a href="${DOWNLOAD_PAGE}" target="_blank" rel="noopener"><b>Update available</b><span>Version ${esc(latest)} · tap to download</span></a>
            <button aria-label="Dismiss">×</button>`;
        bar.querySelector('button').addEventListener('click', () => {
            try { localStorage.setItem('gt-update-dismissed', latest); } catch (_) { /* private mode */ }
            bar.remove(); document.body.classList.remove('has-update');
        });
        document.body.appendChild(bar); document.body.classList.add('has-update');
    }

    window.APP = {
        checkUpdate, version: () => window.APP_VERSION || 'dev', downloadPage: DOWNLOAD_PAGE,
        esc, icon, url, seg, bindSeg, replaceLinks, seasons, seasonChips, seasonField, ctlBar, standingsRows, pageHead, photo, paginate,
        screen: (name, def) => { screens[name] = def; },
        screenDef: name => screens[name],
        go: hash => { location.hash = hash; },
        start: () => show(),
        refresh: () => show(),
        setTheme: t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('gt-theme', t); } catch (_) { /* private mode */ } }
    };
})();
