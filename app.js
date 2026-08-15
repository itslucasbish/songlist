let db = [], filtered = [], currentMode = 'trending';
let limit = 20;
const modalState = { activeUuid: null, animationFrameId: null, bufferIntervalId: null, isReadyToPlay: false };
const $ = id => document.getElementById(id);

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeColor(color) {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#667eea';
}

function normalizeSong(uuid, m) {
    const rawColor = m.cor ? `#${m.cor}` : (m.color?.startsWith('#') ? m.color : `#${m.color || '667eea'}`);
    return {
        ...m,
        uuid,
        bpm: m.bpm || 120,
        color: sanitizeColor(rawColor),
        genreList: m.genre?.length ? m.genre : ['Sem Gênero'],
        decadeList: m.decade?.length ? m.decade : ['Sem Década'],
        playersStr: (m.coachCount || 1).toString(),
        gameStr: m.originalJDVersion ? m.originalJDVersion.toString() : 'Desconhecido'
    };
}

document.addEventListener('DOMContentLoaded', () => {
    fetch('songs.json')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            db = Object.keys(data).map(uuid => normalizeSong(uuid, data[uuid]));
            initApp();
        })
        .catch(err => {
            console.error('Erro ao carregar songs.json:', err);
            $('loadingSection').innerHTML =
                '<h2>Erro ao carregar o catálogo.</h2>' +
                '<p>Certifique-se de que songs.json está na mesma pasta e você está rodando um servidor local.</p>' +
                '<button type="button" id="retryLoad">Tentar novamente</button>';
            $('retryLoad')?.addEventListener('click', () => location.reload());
        });

    bindEvents();
});

function bindEvents() {
    $('themeToggle').addEventListener('click', toggleTheme);
    $('tabTrending').addEventListener('click', () => switchTab('trending'));
    $('tabLibrary').addEventListener('click', () => switchTab('library'));
    $('weightSp').addEventListener('input', scheduleUpdateRanks);
    $('weightYt').addEventListener('input', scheduleUpdateRanks);
    $('btnResetFilters').addEventListener('click', resetFilters);
    $('musicGrid').addEventListener('click', handleGridClick);
    $('modalClose').addEventListener('click', closeModal);
    $('videoModal').addEventListener('click', e => { if (e.target.id === 'videoModal') closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && $('videoModal').classList.contains('active')) closeModal();
    });

    let searchDebounceId = null;
    $('searchGeneral').addEventListener('input', () => {
        clearTimeout(searchDebounceId);
        searchDebounceId = setTimeout(applyFilters, 120);
    });
    ['filterGenre', 'filterDecade', 'filterPlayers', 'filterGame'].forEach(id =>
        $(id).addEventListener('change', applyFilters)
    );
}

function initApp() {
    $('loadingSection').classList.add('hidden');
    $('mainApp').classList.remove('hidden');
    $('totalMusics').textContent = db.length;

    const gSet = new Set(), dSet = new Set();
    db.forEach(m => {
        m.genreList.forEach(g => gSet.add(g));
        m.decadeList.forEach(d => dSet.add(d));
    });

    populateSelect('filterGenre', [...gSet]);
    populateSelect('filterDecade', [...dSet]);
    populateSelect('filterPlayers', [...new Set(db.map(m => m.playersStr))]);
    populateSelect('filterGame', [...new Set(db.map(m => m.gameStr))]);
    $('uniqueGames').textContent = [...new Set(db.map(m => m.gameStr))].length;

    calculatePositionalRanks();
    restoreTheme();
    updateThemeIcon();
}

function calculatePositionalRanks() {
    [...db].sort((a, b) => (b.spotify_streams || 0) - (a.spotify_streams || 0))
        .forEach((m, i) => { m.rank_sp = i + 1; });
    [...db].sort((a, b) => (b.youtube_views || 0) - (a.youtube_views || 0))
        .forEach((m, i) => { m.rank_yt = i + 1; });
    updateRanks();
}

let ranksRAF = null;
function scheduleUpdateRanks() {
    $('valSp').textContent = $('weightSp').value;
    $('valYt').textContent = $('weightYt').value;
    if (ranksRAF) return;
    ranksRAF = requestAnimationFrame(() => { ranksRAF = null; updateRanks(); });
}

function updateRanks() {
    const wSp = parseFloat($('weightSp').value) || 0;
    const wYt = parseFloat($('weightYt').value) || 0;
    $('valSp').textContent = wSp;
    $('valYt').textContent = wYt;

    db.forEach(m => { m.score = (m.rank_sp * wSp) + (m.rank_yt * wYt); });
    applyFilters();
}

function populateSelect(id, items) {
    const options = [...items].sort().map(item =>
        `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
    ).join('');
    $(id).innerHTML = `<option value="">Todos</option>${options}`;
}

function switchTab(tab) {
    currentMode = tab;
    const isTrending = tab === 'trending';
    $('tabTrending').classList.toggle('active', isTrending);
    $('tabTrending').setAttribute('aria-selected', String(isTrending));
    $('tabLibrary').classList.toggle('active', !isTrending);
    $('tabLibrary').setAttribute('aria-selected', String(!isTrending));
    $('weightControls').classList.toggle('hidden', !isTrending);
    $('catalogPanel').setAttribute('aria-labelledby', isTrending ? 'tabTrending' : 'tabLibrary');
    applyFilters();
}

function applyFilters() {
    const s = $('searchGeneral').value.toLowerCase();
    const gen = $('filterGenre').value;
    const dec = $('filterDecade').value;
    const pla = $('filterPlayers').value;
    const gam = $('filterGame').value;

    filtered = db.filter(m => {
        const matchS = !s || m.nome.toLowerCase().includes(s) || m.artista.toLowerCase().includes(s);
        const matchGen = !gen || m.genreList.includes(gen);
        const matchDec = !dec || m.decadeList.includes(dec);
        const matchPla = !pla || m.playersStr === pla;
        const matchGam = !gam || m.gameStr === gam;
        return matchS && matchGen && matchDec && matchPla && matchGam;
    });

    if (currentMode === 'library') {
        filtered.sort((a, b) => a.nome.localeCompare(b.nome));
    } else {
        filtered.sort((a, b) => a.score - b.score);
    }

    limit = 20;
    $('resultCount').textContent = filtered.length;
    render();
}

function resetFilters() {
    ['searchGeneral', 'filterGenre', 'filterDecade', 'filterPlayers', 'filterGame']
        .forEach(id => { $(id).value = ''; });
    applyFilters();
}

function handleGridClick(e) {
    const btn = e.target.closest('.btn-preview');
    if (btn) openModal(btn.dataset.uuid);
}

function render(append = false) {
    const wrap = $('musicGrid');
    if (!filtered.length) {
        wrap.innerHTML =
            '<div class="empty-state">' +
            '<h2>Sem resultados</h2>' +
            '<p>Tente ajustar os filtros ou limpar a busca.</p>' +
            '<button type="button" id="emptyReset">Limpar filtros</button>' +
            '</div>';
        $('emptyReset')?.addEventListener('click', resetFilters);
        return;
    }

    const chunk = append ? filtered.slice(limit - 20, limit) : filtered.slice(0, limit);
    const html = chunk.map(m => {
        const tags = [...m.genreList, ...m.decadeList]
            .map(t => `<span class="music-tag">${escapeHtml(t)}</span>`)
            .join('');
        const rankBadge = currentMode === 'trending'
            ? `<span class="badge badge-rank">Score: ${escapeHtml(m.score)}</span>`
            : '';
        const btn = (m.video_url && m.audio_url)
            ? `<button type="button" class="btn-preview" data-uuid="${escapeHtml(m.uuid)}">▶ Prévia</button>`
            : '';
        const coverUrl = `https://raw.githubusercontent.com/itslucasbish/songlist/main/covers/${encodeURIComponent(m.uuid)}.webp`;
        const color = sanitizeColor(m.color);

        return `<article class="music-card" style="border-bottom:4px solid ${color}">
            <div class="music-cover-wrapper" style="background:linear-gradient(135deg,#111,${color} 150%)">
                ${rankBadge}
                <img src="${coverUrl}" class="music-cover" loading="lazy" decoding="async" fetchpriority="low"
                     width="320" height="180" alt="Capa de ${escapeHtml(m.nome)}"
                     onerror="this.style.opacity='0.3'">
                <span class="badge badge-players">👤 ${escapeHtml(m.playersStr)}</span>
                <span class="badge badge-game">${escapeHtml(m.gameStr)}</span>
            </div>
            <div class="music-info">
                <div>
                    <div class="music-name">${escapeHtml(m.nome)}</div>
                    <div class="music-artist">${escapeHtml(m.artista)}</div>
                </div>
                <div class="music-tags">${tags}</div>
                ${btn}
            </div>
        </article>`;
    }).join('');

    if (append) wrap.insertAdjacentHTML('beforeend', html);
    else wrap.innerHTML = html;
}

let scrollFramePending = false;
window.addEventListener('scroll', () => {
    if (scrollFramePending) return;
    scrollFramePending = true;
    requestAnimationFrame(() => {
        scrollFramePending = false;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 && limit < filtered.length) {
            limit += 20;
            render(true);
        }
    });
}, { passive: true });

const vp = $('modalVideoPlayer');
const ap = $('modalAudioPlayer');
const bl = $('bufferLoading');
const modalBox = $('modalContentBox');
const videoModal = $('videoModal');

function getActiveBpm() {
    const m = db.find(x => x.uuid === modalState.activeUuid);
    return m?.bpm || 120;
}

function openModal(uuid) {
    const m = db.find(x => x.uuid === uuid);
    if (!m) return;
    modalState.activeUuid = uuid;

    $('modalTitle').textContent = m.nome;
    $('modalArtist').textContent = m.artista;

    const tagsHTML = [
        `<span class="music-tag">👤 ${escapeHtml(m.playersStr)}</span>`,
        `<span class="music-tag">${escapeHtml(m.gameStr)}</span>`,
        ...m.genreList.map(t => `<span class="music-tag">${escapeHtml(t)}</span>`),
        ...m.decadeList.map(t => `<span class="music-tag">${escapeHtml(t)}</span>`)
    ].join('');
    $('modalTags').innerHTML = tagsHTML;

    document.documentElement.style.setProperty('--music-color', m.color);

    vp.preload = 'auto';
    ap.preload = 'auto';
    vp.src = m.video_url;
    ap.src = m.audio_url;
    vp.pause();
    ap.pause();

    bl.style.display = 'block';
    bl.textContent = 'Preparando sincronia...';
    modalState.isReadyToPlay = false;

    clearInterval(modalState.bufferIntervalId);
    modalState.bufferIntervalId = setInterval(() => {
        if (modalState.isReadyToPlay) return;
        const vReady = vp.readyState >= 3;
        const aReady = ap.readyState >= 3;
        const getBufferPct = media =>
            (media.duration > 0 && media.buffered.length > 0)
                ? media.buffered.end(media.buffered.length - 1) / media.duration
                : 0;

        const vBuf = getBufferPct(vp);
        const aBuf = getBufferPct(ap);
        bl.textContent = `Preparando sincronia (${Math.floor(Math.min(vBuf, aBuf) * 100)}%)...`;

        if ((vReady && aReady) || (vBuf >= 0.3 && aBuf >= 0.3)) {
            modalState.isReadyToPlay = true;
            clearInterval(modalState.bufferIntervalId);
            bl.style.display = 'none';
            vp.play().catch(() => {});
            ap.play().catch(() => {});
            startPulse();
        }
    }, 300);

    videoModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

let pulseAnchor = null;
let lastShadowCss = null;
let lastPulseFrameTs = 0;
const IDLE_SHADOW = '0 0 10px rgba(0,0,0,0.5)';
const mqMobile = window.matchMedia('(max-width:768px)');

function syncPulseAnchor() {
    pulseAnchor = performance.now() - (vp.currentTime * 1000);
}

function setShadow(css) {
    if (css === lastShadowCss) return;
    modalBox.style.boxShadow = css;
    lastShadowCss = css;
}

function startPulse() {
    syncPulseAnchor();
    cancelAnimationFrame(modalState.animationFrameId);

    function loop(now) {
        modalState.animationFrameId = requestAnimationFrame(loop);

        if (now - lastPulseFrameTs < 33) return;
        lastPulseFrameTs = now;

        if (vp.paused || vp.seeking || pulseAnchor === null) {
            setShadow(IDLE_SHADOW);
            return;
        }

        const bpm = getActiveBpm();
        const beatDur = 60 / bpm;
        const t = (now - pulseAnchor) / 1000;
        const dur = vp.duration || 30;

        if (t < beatDur || t > (dur - beatDur)) {
            setShadow(IDLE_SHADOW);
            return;
        }

        const phase = (t % beatDur) / beatDur;
        const intensity = Math.exp(-6 * phase);
        const maxBlur = mqMobile.matches ? 50 : 80;
        const shadowSize = Math.round(10 + (maxBlur * intensity));
        setShadow(`0 0 ${shadowSize}px var(--music-color)`);
    }
    modalState.animationFrameId = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        cancelAnimationFrame(modalState.animationFrameId);
    } else if (modalState.activeUuid !== null && modalState.isReadyToPlay) {
        syncPulseAnchor();
        startPulse();
    }
});

vp.onended = () => { ap.pause(); ap.currentTime = 0; };
vp.onseeked = () => { ap.currentTime = vp.currentTime; };
vp.onpause = () => ap.pause();
vp.onplay = vp.onplaying = () => { if (modalState.isReadyToPlay) ap.play(); };
vp.onwaiting = () => ap.pause();
vp.ontimeupdate = () => {
    if (!ap.paused && Math.abs(vp.currentTime - ap.currentTime) > 0.25) {
        ap.currentTime = vp.currentTime;
    }
    syncPulseAnchor();
};

function closeModal() {
    if (!videoModal.classList.contains('active')) return;
    videoModal.classList.remove('active');
    document.body.style.overflow = '';

    clearInterval(modalState.bufferIntervalId);
    cancelAnimationFrame(modalState.animationFrameId);
    modalState.activeUuid = null;
    modalState.isReadyToPlay = false;
    vp.pause();
    ap.pause();
    vp.src = '';
    ap.src = '';
    vp.preload = 'metadata';
    ap.preload = 'metadata';
    pulseAnchor = null;
    lastShadowCss = null;
    modalBox.style.boxShadow = IDLE_SHADOW;
    bl.style.display = 'none';
}

function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
}

function restoreTheme() {
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('themeToggle').textContent = isDark ? '🌙' : '☀️';
    $('themeToggle').setAttribute('aria-label', isDark ? 'Ativar tema claro' : 'Ativar tema escuro');
}
