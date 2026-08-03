// admin.js – DE-only UI + REFRESH DELTA MODAL + Company Filter + Back To Top + Auto-Update + Weekly Report

//////////////////////////
// Német UI sztringek   //
//////////////////////////
const DE = {
  loading: 'Daten werden geladen…',
  errorPrefix: 'Fehler:',
  emptyFiles: 'Keine hochgeladenen Dateien.',
  noResults: 'Keine Treffer für den Filter.',
  accessDeniedTitle: 'Zugriff verweigert',
  backHome: 'Zurück zur Startseite',
  infoTitle: 'Mitarbeiterinfo',
  refreshedAt: 'Zuletzt aktualisiert:',
  updatedAtPrefix: 'Letztes Update:',
  deltaTitle: 'Neue Dateien seit letztem Update',
  deltaNone: 'Keine neuen Dateien seit dem letzten Update.',
  deltaCount: (n) => `${n} neue Datei${n === 1 ? '' : 'en'}`,
  labels: { name: 'Name', phone: 'Telefon', email: 'E-Mail', lang: 'Sprache', company: 'Firma' },
  close: 'Schließen'
};

/////////////////////
// Állapot, helper //
/////////////////////
let allUploads = {};
let usersByName = {};
let allUsers = [];
let lastSnapshot = null;
let lastUpdatedAt = null;

let autoUpdateInterval = null;
const AUTO_UPDATE_MS = 20 * 60 * 1000; // 20 perc

const E164 = /^\+\d{7,15}$/;

function formatDateDE(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
function normName(s) { return (s || '').trim().toLowerCase(); }
function safeJsonParse(text) { try { return JSON.parse(text); } catch { return null; } }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'info') {
  try {
    let el = document.getElementById('miniToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'miniToast';
      el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;padding:10px 14px;border-radius:10px;background:#222;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);font-size:14px;opacity:.95;max-width:60ch';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === 'error' ? '#b91c1c' : type === 'success' ? '#166534' : '#374151';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
  } catch {
    console[type === 'error' ? 'error' : 'log']('[toast]', msg);
  }
}

//////////////////////////////
// Snapshot / Diff segéd    //
//////////////////////////////
function buildSnapshot(data) {
  const snap = {};
  Object.keys(data || {}).forEach(user => {
    const map = {};
    (data[user] || []).forEach(f => {
      const key = `${f.folder || ''}/${f.name || ''}`;
      const t = new Date(f.uploadedAt || f.uploadedAtDisplay || 0).getTime() || 0;
      if (!map[key] || t > map[key]) map[key] = t;
    });
    snap[user] = map;
  });
  return snap;
}
function diffSnapshots(prevSnap, currData) {
  const diff = {};
  Object.keys(currData || {}).forEach(user => {
    const prev = (prevSnap && prevSnap[user]) || {};
    const list = [];
    (currData[user] || []).forEach(f => {
      const key = `${f.folder || ''}/${f.name || ''}`;
      const t = new Date(f.uploadedAt || f.uploadedAtDisplay || 0).getTime() || 0;
      const pt = prev[key] || 0;
      if (!pt || t > pt) list.push(f);
    });
    if (list.length) diff[user] = list;
  });
  return diff;
}

function populateCompanyFilter(users) {
  const companyFilter = document.getElementById('companyFilter');
  if (!companyFilter) return;
  const companies = [...new Set(users.map(u => u.company).filter(Boolean))];
  companies.sort((a, b) => a.localeCompare(b, 'de-DE'));
  companyFilter.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Alle Firmen';
  companyFilter.appendChild(allOption);
  companies.forEach(company => {
    const option = document.createElement('option');
    option.value = company;
    option.textContent = company;
    companyFilter.appendChild(option);
  });
}

//////////////////////////////
// Backend adatbetöltések   //
//////////////////////////////
async function fetchUsersMeta() {
  const url = '/.netlify/functions/getUsers';
  const resp = await fetch(url);
  const body = await resp.text();
  if (!resp.ok) throw new Error(`GET ${url} (${resp.status}) ${body || ''}`);
  const usersArray = safeJsonParse(body) || [];
  allUsers = usersArray;
  const map = {};
  usersArray.forEach(u => {
    const key = normName(u.displayName || u.id);
    if (key) map[key] = u;
  });
  usersByName = map;
  populateCompanyFilter(allUsers);
}
async function fetchAllUploads() {
  const urlBase = '/.netlify/functions/getAllUploads';

  // 1) AZONNALI KISZOLGÁLÁS SESSIONSTORAGE-BÓL (0 ms betöltési idő!)
  try {
    const cached = sessionStorage.getItem('pmg_all_uploads_cache');
    if (cached) {
      const cachedData = JSON.parse(cached);
      if (cachedData && typeof cachedData === 'object') {
        allUploads = cachedData;
        renderList(allUploads);
      }
    }
  } catch (e) {
    console.warn('[cache] SessionStorage hiba:', e);
  }

  // 2) FRISS ADATOK LEKÉRÉSE (MOST MÁR 25X GYORSABB REKURZÍV LEKÉRDEZÉSSEL!)
  let resp = await fetch(`${urlBase}?links=0`);
  if (!resp.ok) { resp = await fetch(urlBase); }
  const body = await resp.text();
  if (!resp.ok) throw new Error(`GET ${urlBase} (${resp.status}) ${body || ''}`);
  const data = safeJsonParse(body) || {};
  Object.keys(data).forEach(u => {
    if (!Array.isArray(data[u])) data[u] = [];
    data[u].forEach(f => {
      f.uploadedAt = f.uploadedAt || f.uploadedAtDisplay || null;
      f.uploadedAtDisplay = f.uploadedAtDisplay || f.uploadedAt || null;
    });
  });

  allUploads = data;
  try {
    sessionStorage.setItem('pmg_all_uploads_cache', JSON.stringify(allUploads));
  } catch (e) {}

  renderList(allUploads);
}

const thumbnailCache = new Map();

async function loadFileThumbnail(path, thumbContainer, isImage) {
  if (!path || !isImage) return;
  if (thumbnailCache.has(path)) {
    const cachedUrl = thumbnailCache.get(path);
    if (cachedUrl) {
      thumbContainer.innerHTML = `<img src="${cachedUrl}" class="card-thumb-img" alt="Vorschau" loading="lazy" />`;
    }
    return;
  }

  thumbContainer.innerHTML = `<div class="thumb-skeleton-loader"></div>`;

  try {
    const res = await fetch(`/.netlify/functions/getThumbnail?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.thumbnail) {
      thumbnailCache.set(path, data.thumbnail);
      thumbContainer.innerHTML = `<img src="${data.thumbnail}" class="card-thumb-img" alt="Vorschau" loading="lazy" />`;
    } else {
      thumbContainer.innerHTML = `<div class="file-icon-large"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
    }
  } catch (err) {
    console.warn('[loadThumbnail] Hiba:', err);
    thumbContainer.innerHTML = `<div class="file-icon-large"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  }
}

async function openFileLightbox(file, userName) {
  const modal = document.getElementById('fileLightboxModal');
  const body = document.getElementById('lightboxBody');
  if (!modal || !body) return;

  modal.classList.remove('hidden');
  body.innerHTML = `<div class="lightbox-loading"><svg class="spinner-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Vorschau wird geladen…</div>`;

  const name = file.name || '';
  const folder = file.folder || '';
  const when = file.uploadedAtDisplay ? formatDateDE(file.uploadedAtDisplay) : '';
  const ext = name.toLowerCase().split('.').pop();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

  let fileUrl = file.link || thumbnailCache.get(file.path) || null;

  if (!fileUrl && file.path) {
    try {
      const resp = await fetch('/.netlify/functions/getFileLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });
      if (resp.ok) {
        const json = await resp.json();
        fileUrl = json.link || json.url;
      }
    } catch (e) {
      console.warn('[getFileLink] Lightbox hiba:', e);
    }
  }

  let previewContent = '';
  if (isImage && fileUrl) {
    previewContent = `<img src="${fileUrl}" class="lightbox-img" alt="${escapeHtml(name)}" />`;
  } else if (ext === 'pdf' && fileUrl) {
    previewContent = `<iframe src="${fileUrl}" class="lightbox-pdf" title="${escapeHtml(name)}"></iframe>`;
  } else {
    previewContent = `<div class="lightbox-no-preview"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Keine direkte Vorschau verfügbar. Bitte herunterladen.</div>`;
  }

  let badgeClass = 'badge-stundenzettel';
  let badgeText = 'Stundenzettel';
  if (/krank/i.test(name)) {
    badgeClass = 'badge-krank'; badgeText = 'Krankenstand';
  } else if (/urlaub/i.test(name)) {
    badgeClass = 'badge-urlaub'; badgeText = 'Urlaub';
  }

  const iconUser = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const iconFolder = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const iconCalendar = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const iconDownload = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

  body.innerHTML = `
    <div class="lightbox-header">
      <div>
        <span class="card-badge ${badgeClass}">${badgeText}</span>
        <h3 class="lightbox-title">${escapeHtml(name)}</h3>
        <p class="lightbox-subtitle">${iconUser} ${escapeHtml(userName)} &bull; ${iconFolder} ${escapeHtml(folder)} &bull; ${iconCalendar} ${when}</p>
      </div>
    </div>
    <div class="lightbox-media-container">
      ${previewContent}
    </div>
    <div class="lightbox-actions">
      ${fileUrl ? `<a href="${fileUrl}" target="_blank" download="${escapeHtml(name)}" class="action-button download-btn">${iconDownload} Öffnen / Herunterladen</a>` : ''}
    </div>
  `;
}

function setupLightboxEvents() {
  const modal = document.getElementById('fileLightboxModal');
  const closeBtn = document.getElementById('closeLightboxBtn');
  const backdrop = modal?.querySelector('.lightbox-backdrop');

  const close = () => modal?.classList.add('hidden');

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      close();
    }
  });
}

//////////////////////////////
// Lista és modal render    //
//////////////////////////////
function updateKpiStats(data, filteredUsers) {
  const statMitarbeiter = document.getElementById('statMitarbeiter');
  const statFiles = document.getElementById('statFiles');
  const statKrank = document.getElementById('statKrank');
  const filterSummary = document.getElementById('filterResultsSummary');

  let totalFiles = 0;
  let totalKrank = 0;

  filteredUsers.forEach(u => {
    const files = Array.isArray(data[u]) ? data[u] : [];
    totalFiles += files.length;
    files.forEach(f => {
      if (/krank/i.test(f.name || '')) totalKrank += 1;
    });
  });

  if (statMitarbeiter) statMitarbeiter.textContent = filteredUsers.length;
  if (statFiles) statFiles.textContent = totalFiles;
  if (statKrank) statKrank.textContent = totalKrank;

  if (filterSummary) {
    filterSummary.textContent = `${filteredUsers.length} Mitarbeiter (${totalFiles} Dateien insgesamt)`;
  }
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function renderList(data) {
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const companyFilter = document.getElementById('companyFilter');
  if (!userListContainer) {
    console.error('[admin] Hiányzik #userListContainer');
    return;
  }
  const nameQuery = normName(nameFilter?.value);
  const selectedCompany = companyFilter?.value;

  const users = Object.keys(data).filter(displayName => {
    const nameMatch = normName(displayName).includes(nameQuery);
    if (!nameMatch) return false;
    if (selectedCompany) {
      const userMeta = usersByName[normName(displayName)];
      return userMeta && userMeta.company === selectedCompany;
    }
    return true;
  }).sort((a, b) => a.localeCompare(b, 'de-DE'));

  updateKpiStats(data, users);

  userListContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();

  users.forEach(displayNameRaw => {
    const displayName = String(displayNameRaw);
    const files = Array.isArray(data[displayName]) ? data[displayName] : [];
    const userMeta = usersByName[normName(displayName)];
    const company = userMeta?.company || '';

    const card = document.createElement('div');
    card.className = 'user-card';

    const header = document.createElement('div');
    header.className = 'user-card-header';
    header.innerHTML = `
      <div class="user-info-group">
        <div class="avatar-initials" title="${escapeHtml(displayName)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <h3 title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h3>
          ${company ? `<span class="company-tag">${escapeHtml(company)}</span>` : ''}
        </div>
      </div>
      <div class="user-card-header-actions">
        <span class="file-count-badge">${files.length} Datei${files.length !== 1 ? 'en' : ''}</span>
        <button class="info-btn" type="button" aria-label="Info" title="Info">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm.001 5.6a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM10.9 11.5h2.2v6h-2.2v-6z"/>
          </svg>
          <span class="sr-only">Info</span>
        </button>
      </div>`;
    card.appendChild(header);

    const ul = document.createElement('div');
    ul.className = 'file-gallery';
    if (files.length === 0) {
      ul.innerHTML = `<p class="empty">${DE.emptyFiles}</p>`;
    } else {
      files.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());

      files.forEach(f => {
        const when = f.uploadedAtDisplay ? formatDateDE(f.uploadedAtDisplay) : '';
        const folder = f.folder || '';
        const name = f.name || '';
        const ext = name.toLowerCase().split('.').pop();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

        const fileCard = document.createElement('div');
        fileCard.className = 'file-card clickable';
        fileCard.title = `${escapeHtml(name)} (Klicken zum Anzeigen)`;

        // Thumbnail container
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'file-thumbnail';

        if (isImage) {
          thumbContainer.innerHTML = `<div class="thumb-skeleton-loader"></div>`;
          loadFileThumbnail(f.path, thumbContainer, isImage);
        } else if (ext === 'pdf') {
          thumbContainer.innerHTML = `<div class="file-icon-large"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>`;
        } else {
          thumbContainer.innerHTML = `<div class="file-icon-large"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></div>`;
        }

        fileCard.appendChild(thumbContainer);

        // Típus-jelvény kiszámítása
        let badgeTag = '';
        if (/krank/i.test(name)) {
          badgeTag = `<span class="card-badge badge-krank">KRANK</span>`;
        } else if (/urlaub/i.test(name)) {
          badgeTag = `<span class="card-badge badge-urlaub">URLAUB</span>`;
        } else {
          badgeTag = `<span class="card-badge badge-stundenzettel">ZEIT</span>`;
        }

        // File info
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
          <div class="file-card-top-row">
            <span class="file-name-small" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            ${badgeTag}
          </div>
          <div class="file-meta">
            ${folder ? `<span class="file-folder">${escapeHtml(folder)}</span>` : ''}
            <span class="file-date-small">${when}</span>
          </div>
        `;
        fileCard.appendChild(fileInfo);

        // Kattintás -> Lightbox megnyitása
        fileCard.addEventListener('click', () => {
          openFileLightbox(f, displayName);
        });

        ul.appendChild(fileCard);
      });
    }
    card.appendChild(ul);

    header.querySelector('.info-btn').addEventListener('click', () => openUserInfoModal(displayName));
    fragment.appendChild(card);
  });

  userListContainer.appendChild(fragment);

  if (users.length === 0) {
    userListContainer.innerHTML = `<p class="status">${DE.noResults}</p>`;
  }
}



function openUserInfoModal(displayName) {
  const meta = usersByName[normName(displayName)] || {};
  const phone = meta.phone || '';
  const phoneHtml = phone
    ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>${E164.test(phone) ? '' : ' <span class="badge-warn" title="Vermutlich kein vollständiges internationales Format">⚠︎</span>'}`
    : '—';
  const email = meta.email || '';
  const emailHtml = email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : '—';
  const lang = meta.userLang || '—';
  const company = meta.company || '—';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal-header">
      <h4 id="modalTitle">${DE.infoTitle}</h4>
      <button class="modal-close" aria-label="${DE.close}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="modal-grid">
        <div class="label">${DE.labels.name}:</div><div class="value">${escapeHtml(displayName)}</div>
        <div class="label">${DE.labels.company}:</div><div class="value">${escapeHtml(company)}</div>
        <div class="label">${DE.labels.phone}:</div><div class="value">${phoneHtml}</div>
        <div class="label">${DE.labels.email}:</div><div class="value">${emailHtml}</div>
        <div class="label">${DE.labels.lang}:</div><div class="value">${escapeHtml(lang)}</div>
      </div>
    </div>
    <div class="modal-footer"><button class="modal-primary">${DE.close}</button></div>
  </div>`;
  document.body.appendChild(backdrop);

  const escListener = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', escListener); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
  document.addEventListener('keydown', escListener);
}

function openDeltaModal(diff) {
  const total = Object.values(diff || {}).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
  if (!total) return; // csak ha tényleg van új

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="deltaTitle">
    <div class="modal-header">
      <h4 id="deltaTitle">${DE.deltaTitle} – ${DE.deltaCount(total)}</h4>
      <button class="modal-close" aria-label="${DE.close}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div class="delta-info muted">${DE.updatedAtPrefix} ${formatDateDE(lastUpdatedAt)}</div>
      ${Object.keys(diff).sort((a, b) => a.localeCompare(b, 'de-DE')).map(user => {
    const items = diff[user] || [];
    return `
          <section class="delta-user" style="margin:10px 0 14px">
            <h5 style="margin:0 0 6px">${escapeHtml(user)} <span class="count" style="color:var(--muted)">(${items.length})</span></h5>
            <ul class="delta-files" style="list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:12px;overflow:hidden">
              ${items.map(f => {
      const when = f.uploadedAtDisplay || f.uploadedAt;
      const whenText = when ? formatDateDE(when) : '';
      const path = `${f.folder || ''} / ${f.name || ''}`;
      return `<li style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:baseline;padding:10px 12px;border-bottom:1px dashed rgba(255,255,255,.06)">
                  <span class="path" style="overflow-wrap:anywhere">${escapeHtml(path)}</span>
                  <span class="date" style="white-space:nowrap;color:var(--muted);font-size:.9rem">${whenText}</span>
                </li>`;
    }).join('')}
            </ul>
          </section>`;
  }).join('')}
    </div>
    <div class="modal-footer"><button class="modal-primary">${DE.close}</button></div>
  </div>`;

  document.body.appendChild(backdrop);
  const escListener = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', escListener); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
  document.addEventListener('keydown', escListener);
}

function ensureLastUpdatedEl() {
  if (document.getElementById('lastUpdated')) return;
  const el = document.createElement('div');
  el.id = 'lastUpdated';
  el.className = 'last-updated';
  const header = document.querySelector('.app-header');
  if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
  else document.body.prepend(el);
}
function setLastUpdated(ts) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const text = formatDateDE(ts || Date.now());
  el.textContent = `${DE.refreshedAt} ${text}`;
}

//////////////////////////////
// Weekly Report modal      //
//////////////////////////////
function openWeeklyReportModal(report, workWeek) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const statusMapping = {
    'ABGEGEBEN': { text: 'Abgegeben', class: 'status-ok' },
    'KRANK': { text: 'Krank', class: 'status-warn' },
    'URLAUB': { text: 'Urlaub', class: 'status-info' },
    'UNBEZAHLT': { text: 'Unbezahlt', class: 'status-info' },
    'FEHLT': { text: 'FEHLT', class: 'status-missing' }
  };

  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const tableHeader = workWeek.map((day, index) =>
    `<th>${dayNames[index] ?? ''}<br><small>${escapeHtml(String(day.day))}.</small></th>`
  ).join('');

  const filtered = (report || []).filter(u => u.isMissing);
  const tableRows = filtered.map(user => {
    const cells = workWeek.map(day => {
      const ws = user.weekStatus ?? {};
      const raw = ws[day.day];
      if (raw === undefined) return `<td class="status-na"></td>`;
      const key = String(raw || 'FEHLT').toUpperCase();
      const info = statusMapping[key] || statusMapping['FEHLT'];
      return `<td class="${info.class}">${info.text}</td>`;
    }).join('');
    const action = user.phone
      ? `<button class="sms-btn" data-phone="${escapeHtml(String(user.phone))}" data-name="${escapeHtml(String(user.name || ''))}">SMS</button>`
      : '';
    return `<tr><td>${escapeHtml(String(user.name || '—'))}</td>${cells}<td>${action}</td></tr>`;
  }).join('');

  const colspan = 1 + (workWeek?.length || 0) + 1;

  backdrop.innerHTML = `
    <div class="modal large" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h4>Wochenbericht (Nur fehlende Einträge)</h4>
        <button class="modal-close" aria-label="${DE.close}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="report-table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                ${tableHeader}
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || `<tr><td colspan="${colspan}">Keine fehlenden Einträge für diese Woche gefunden!</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-primary">${DE.close}</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);

  // (stub) SMS gombok
  backdrop.querySelectorAll('.sms-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phone = btn.getAttribute('data-phone');
      const name = btn.getAttribute('data-name');
      console.log('SMS:', { phone, name });
      showToast(`SMS küldés (teszt): ${name} – ${phone}`, 'info');
    });
  });
}

//////////////////////////////
// Init + refresh logika    //
//////////////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  // Auth ellenőrzés (admin)
  let stored = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
  try {
    const user = stored ? JSON.parse(stored) : null;
    const role = user?.role ?? user?.userRole;
    if (!user || role !== 'admin') {
      document.body.innerHTML =
        `<div class="app-container">
           <header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header>
           <main class="content"><a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a></main>
         </div>`;
      return;
    }
  } catch {
    document.body.innerHTML =
      `<div class="app-container">
         <header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header>
         <main class="content"><a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a></main>
       </div>`;
    return;
  }

  ensureLastUpdatedEl();
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const companyFilter = document.getElementById('companyFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoUpdateToggle = document.getElementById('autoUpdateToggle');
  const weeklyReportBtn = document.getElementById('weeklyReportBtn');

  if (!userListContainer) {
    console.error('[admin] #userListContainer hiányzik – nincs hova renderelni.');
    return;
  }

  // Snapshot / updated visszatöltés
  const savedSnap = safeJsonParse(localStorage.getItem('admin_lastSnapshot'));
  if (savedSnap) { lastSnapshot = savedSnap; }
  const savedUpdated = localStorage.getItem('admin_lastUpdated');
  if (savedUpdated) { lastUpdatedAt = Number(savedUpdated) || null; if (lastUpdatedAt) setLastUpdated(lastUpdatedAt); }

  const doLoad = async (showDelta = false) => {
    try {
      refreshBtn?.setAttribute('disabled', '');
      refreshBtn?.classList.add('spinning');
      userListContainer.innerHTML = `<p>${DE.loading}</p>`;

      const prevSnap = lastSnapshot;
      await Promise.all([fetchUsersMeta(), fetchAllUploads()]);

      if (showDelta && prevSnap) {
        const delta = diffSnapshots(prevSnap, allUploads);
        openDeltaModal(delta); // csak akkor nyit, ha van új
      }

      lastSnapshot = buildSnapshot(allUploads);
      lastUpdatedAt = Date.now();
      localStorage.setItem('admin_lastSnapshot', JSON.stringify(lastSnapshot));
      localStorage.setItem('admin_lastUpdated', String(lastUpdatedAt));
      setLastUpdated(lastUpdatedAt);
    } catch (err) {
      console.error('[admin] Betöltési hiba:', err);
      userListContainer.innerHTML = `<p class="status error">${DE.errorPrefix} ${escapeHtml(err.message || 'Unbekannter Fehler')}</p>`;
    } finally {
      refreshBtn?.removeAttribute('disabled');
      refreshBtn?.classList.remove('spinning');
    }
  };

  // Első betöltés delta modallal (ha van új)
  await doLoad(true);

  // Szűrők
  nameFilter?.addEventListener('input', () => renderList(allUploads));
  companyFilter?.addEventListener('change', () => renderList(allUploads));

  // Kézi frissítés
  refreshBtn?.addEventListener('click', async () => {
    const savedNameFilter = nameFilter ? nameFilter.value : '';
    const savedCompanyFilter = companyFilter ? companyFilter.value : '';
    await doLoad(true);
    if (nameFilter) nameFilter.value = savedNameFilter;
    if (companyFilter) companyFilter.value = savedCompanyFilter;
    renderList(allUploads);
  });

  // Wochenbericht gomb
  if (weeklyReportBtn) {
    weeklyReportBtn.addEventListener('click', async () => {
      weeklyReportBtn.disabled = true;
      const prevText = weeklyReportBtn.textContent;
      weeklyReportBtn.textContent = 'Lädt...';
      try {
        const res = await fetch('/.netlify/functions/checkWeeklyUploads');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Die Berichtserstellung ist fehlgeschlagen.');
        const { report = [], workWeek = [] } = data;
        openWeeklyReportModal(report, workWeek);
      } catch (error) {
        showToast(error.message || 'Unbekannter Fehler', 'error');
      } finally {
        weeklyReportBtn.disabled = false;
        weeklyReportBtn.textContent = prevText;
      }
    });
  }

  // Ctrl/Cmd+R intercept: app belső frissítés
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const key = (e.key || '').toLowerCase();
    if ((isMac && e.metaKey && key === 'r') || (!isMac && e.ctrlKey && key === 'r')) {
      e.preventDefault();
      refreshBtn?.click();
    }
  });

  // Back to top
  const backToTopButton = document.getElementById('backToTopBtn');
  if (backToTopButton) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) backToTopButton.classList.add('show');
      else backToTopButton.classList.remove('show');
    });
    backToTopButton.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // Auto-update
  const startAutoUpdate = () => {
    if (autoUpdateInterval) return;
    (async () => {
      try { await doLoad(true); } catch (e) { console.error('Auto-update first run error:', e); }
    })();
    autoUpdateInterval = setInterval(async () => {
      try { await doLoad(true); } catch (e) { console.error('Auto-update tick error:', e); }
    }, AUTO_UPDATE_MS);
    console.log(`Auto-update started (every ${AUTO_UPDATE_MS / 1000 / 60} min).`);
  };
  const stopAutoUpdate = () => {
    if (!autoUpdateInterval) return;
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
    console.log('Auto-update stopped.');
  };

  if (autoUpdateToggle) {
    const isEnabled = localStorage.getItem('autoUpdateEnabled') === 'true';
    autoUpdateToggle.checked = isEnabled;
    if (isEnabled) startAutoUpdate();

    autoUpdateToggle.addEventListener('change', () => {
      if (autoUpdateToggle.checked) {
        startAutoUpdate();
        localStorage.setItem('autoUpdateEnabled', 'true');
      } else {
        stopAutoUpdate();
        localStorage.setItem('autoUpdateEnabled', 'false');
      }
    });

    // Tab visibility kezelés
    document.addEventListener('visibilitychange', () => {
      const enabled = autoUpdateToggle.checked;
      if (document.hidden) stopAutoUpdate();
      else if (enabled) startAutoUpdate();
    });
  }
  window.addEventListener('admin:upload:done', async () => {
    try {
      await doLoad(true);
      renderList(allUploads);
    } catch (e) {
      console.error('admin:upload:done refresh hiba:', e);
    }
  });
});


// ===== Admin feltöltés modal (DE UI) =====
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function notify(msg, type = 'success') {
    if (window.Swal) {
      Swal.fire({ toast: true, position: 'top', timer: 2500, showConfirmButton: false, icon: type, title: msg });
    } else {
      alert(msg);
    }
  }

  async function fetchUsers() {
    const r = await fetch('/.netlify/functions/getUsers');
    const t = await r.text();
    if (!r.ok) throw new Error(t || 'Fehler beim Laden der Benutzer.');
    const users = t ? JSON.parse(t) : [];
    users.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de-DE'));
    return users;
  }

  async function fetchFolders(userId) {
    const r = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
    const t = await r.text();
    if (!r.ok) throw new Error(t || 'Fehler beim Laden der Monate.');
    const folders = t ? JSON.parse(t) : [];
    folders.sort((a, b) => parseInt(b) - parseInt(a)); // neueste zuerst
    return folders;
  }

  function currentMonthFolder() {
    const d = new Date();
    const m = d.getMonth() + 1;
    const nameDe = d.toLocaleString('de-DE', { month: 'long' });
    return `${m}. ${nameDe}`;
  }

  function openAdminUploadModal() {
    // Ne nyissunk több példányt
    if (document.querySelector('.modal-backdrop.admin-upload')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop admin-upload';

    backdrop.innerHTML = `
      <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="adminUploadTitle">
        <div class="modal-header">
          <h4 id="adminUploadTitle">Admin-Upload</h4>
          <button class="modal-close" aria-label="Schließen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div id="adminUploadStatus" class="status"></div>

          <div class="modal-grid admin-upload-grid">
            <div class="label">Mitarbeiter</div>
            <div class="value">
              <select id="adminUserSelect" required></select>
            </div>

            <div class="label">Typ</div>
            <div class="value">
              <select id="adminTypeSelect" required>
                <option value="TIMESHEET">Stundenzettel</option>
                <option value="KRANK">Krank</option>
                <option value="URLAUB">Urlaub</option>
                <option value="UNBEZAHLT">Unbezahlt</option>
              </select>
            </div>

            <div class="label">Monat</div>
            <div class="value">
              <select id="adminMonthSelect" required></select>
            </div>

            <!-- Stundenzettel-spezifisch -->
            <div class="label admin-row row-timesheet">Stundenzettel-Datum (z. B. 5–9 oder 30)</div>
            <div class="value admin-row row-timesheet">
              <input id="adminWeekRange" type="text" inputmode="numeric"
                     pattern="^[0-9]+(-[0-9]+)?$" placeholder="z. B. 1–5 oder 30">
            </div>

            <!-- Abwesenheit-spezifisch -->
            <div class="label admin-row row-absence">Zeitraum</div>
            <div class="value admin-row row-absence">
              <div class="form-group-row">
                <input id="adminStartDate" type="date">
                <input id="adminEndDate"   type="date">
              </div>
            </div>

            <!-- Datei: bei KRANK Pflicht -->
            <div class="label">Datei</div>
            <div class="value">
              <input id="adminUploadFile" type="file" accept="image/*,application/pdf">
              <small class="muted" id="adminFileHint"></small>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-primary" id="adminUploadSubmit">Hochladen</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeBtn = backdrop.querySelector('.modal-close');
    const submitBtn = byId('adminUploadSubmit');
    const userSel = byId('adminUserSelect');
    const typeSel = byId('adminTypeSelect');
    const monthSel = byId('adminMonthSelect');
    const weekRange = byId('adminWeekRange');
    const startDate = byId('adminStartDate');
    const endDate = byId('adminEndDate');
    const fileInput = byId('adminUploadFile');
    const fileHint = byId('adminFileHint');
    const statusBox = byId('adminUploadStatus');

    function setRowsForType(type) {
      const isTimesheet = (type === 'TIMESHEET');
      backdrop.querySelectorAll('.row-timesheet').forEach(el => el.style.display = isTimesheet ? '' : 'none');
      backdrop.querySelectorAll('.row-absence').forEach(el => el.style.display = !isTimesheet ? '' : 'none');

      // Pflichtfelder
      weekRange.required = isTimesheet;
      startDate.required = !isTimesheet;
      endDate.required = !isTimesheet;

      // Bei KRANK ist die Bescheinigung Pflicht
      if (type === 'KRANK') {
        fileInput.required = true;
        fileHint.textContent = 'Bei KRANK ist eine Bescheinigung erforderlich.';
      } else {
        fileInput.required = false;
        fileHint.textContent = '';
      }
    }

    setRowsForType(typeSel.value);
    typeSel.addEventListener('change', () => setRowsForType(typeSel.value));

    // Schließen (Button, Click auf Backdrop, ESC)
    function close() {
      document.removeEventListener('keydown', escListener);
      backdrop.remove();
    }
    function escListener(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escListener);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    // Upload
    submitBtn.addEventListener('click', async () => {
      statusBox.classList.remove('error');
      statusBox.textContent = '';

      const userId = userSel.value;
      const kind = typeSel.value;
      const month = monthSel.value;

      // Validierung
      if (!userId) { notify('Bitte Mitarbeiter wählen!', 'error'); return; }
      if (!month) { notify('Bitte Monat wählen!', 'error'); return; }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Hochladen…';

        let resp, result;

        if (kind === 'TIMESHEET') {
          if (!weekRange.value.trim()) throw new Error('Bitte Stundenzettel-Datum angeben (z. B. 5–9 oder 30).');
          if (!fileInput.files.length) throw new Error('Bitte eine Datei auswählen.');

          let fileToUpload = fileInput.files[0];
          if (typeof window.compressImageFile === 'function') {
            submitBtn.textContent = 'Komprimieren…';
            fileToUpload = await window.compressImageFile(fileToUpload);
            submitBtn.textContent = 'Hochladen…';
          }

          const ext = fileToUpload.name.includes('.') ? fileToUpload.name.slice(fileToUpload.name.lastIndexOf('.')) : '';
          const base = fileToUpload.name.replace(/\.[^.]+$/, '');
          const newBase = /_ADMIN(\b|$)/i.test(base) ? base : `${base}_ADMIN`;

          const fd = new FormData();
          fd.append('employeeName', userId);
          fd.append('selectedMonth', month);
          fd.append('weekRange', weekRange.value.trim());
          fd.append('uploadedByAdmin', '1');
          fd.append('file', fileToUpload, `${newBase}${ext}`);

          resp = await fetch('/.netlify/functions/upload', { method: 'POST', body: fd });
          result = await resp.json();
          if (!resp.ok) throw new Error(result.message || 'Upload-Fehler (Stundenzettel).');

        } else if (kind === 'KRANK') {
          if (!startDate.value) throw new Error('Bitte Startdatum angeben.');
          if (!endDate.value) throw new Error('Bitte Enddatum angeben.');
          if (!fileInput.files.length) throw new Error('Bei KRANK muss eine Bescheinigung hochgeladen werden.');

          let fileToUpload = fileInput.files[0];
          if (typeof window.compressImageFile === 'function') {
            submitBtn.textContent = 'Komprimieren…';
            fileToUpload = await window.compressImageFile(fileToUpload);
            submitBtn.textContent = 'Hochladen…';
          }

          const ext = fileToUpload.name.includes('.') ? fileToUpload.name.slice(fileToUpload.name.lastIndexOf('.')) : '';
          const base = fileToUpload.name.replace(/\.[^.]+$/, '');
          const newBase = /_ADMIN(\b|$)/i.test(base) ? base : `${base}_ADMIN`;

          const fd = new FormData();
          fd.append('userId', userId);
          fd.append('selectedMonth', month);
          fd.append('startDate', startDate.value);
          fd.append('endDate', endDate.value);
          fd.append('uploadedByAdmin', '1');
          fd.append('file', fileToUpload, `${newBase}${ext}`);

          resp = await fetch('/.netlify/functions/uploadSickProof', { method: 'POST', body: fd });
          result = await resp.json();
          if (!resp.ok) throw new Error(result.message || 'Upload-Fehler (Krank).');

        } else {
          // URLAUB / UNBEZAHLT – Datei optional
          if (!startDate.value) throw new Error('Bitte Startdatum angeben.');
          if (!endDate.value) throw new Error('Bitte Enddatum angeben.');

          resp = await fetch('/.netlify/functions/logAbsence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              absenceType: kind,
              selectedMonth: month,
              startDate: startDate.value,
              endDate: endDate.value,
              uploadedByAdmin: true
            })
          });
          result = await resp.json();
          if (!resp.ok) throw new Error(result.message || 'Speicherfehler (Abwesenheit).');
        }

        notify('Fertig!', 'success');
        close();

        // jelezd a főképernyőnek, hogy frissítsen
        window.dispatchEvent(new CustomEvent('admin:upload:done'));

      } catch (err) {
        console.error('Admin-Upload Fehler:', err);
        statusBox.classList.add('error');
        statusBox.textContent = err.message || 'Es ist ein Fehler aufgetreten.';
        notify(err.message || 'Es ist ein Fehler aufgetreten.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hochladen';
      }
    });

    // Init – Mitarbeiter & Monate
    (async () => {
      const userSelEl = userSel;
      userSelEl.innerHTML = `<option value="" disabled selected>Mitarbeiter werden geladen…</option>`;
      try {
        const users = await fetchUsers();
        userSelEl.innerHTML = `<option value="" disabled selected>Bitte wählen…</option>` +
          users.map(u => `<option value="${u.id}">${u.displayName}</option>`).join('');

        async function loadMonthsFor(uid) {
          const monthEl = monthSel;
          monthEl.innerHTML = `<option value="" disabled selected>Monate werden geladen…</option>`;
          try {
            const folders = await fetchFolders(uid);
            if (!folders.length) {
              monthEl.innerHTML = `<option value="" disabled selected>Kein Ordner</option>`;
              return;
            }
            monthEl.innerHTML = folders.map(f => `<option value="${f}">${f}</option>`).join('');
            // aktuellen Monat wählen, wenn vorhanden
            const cur = currentMonthFolder();
            const direct = Array.from(monthEl.options).find(o => o.value === cur);
            if (direct) monthEl.value = cur;
          } catch {
            monthEl.innerHTML = `<option value="" disabled selected>Fehler beim Laden der Monate</option>`;
          }
        }

        userSelEl.addEventListener('change', (e) => {
          const uid = e.target.value;
          if (uid) loadMonthsFor(uid);
        });

        // erste gültige Person → Monate laden
        const first = userSelEl.querySelector('option[value]:not([value=""])');
        if (first) {
          userSelEl.value = first.value;
          await loadMonthsFor(first.value);
        }
      } catch {
        userSelEl.innerHTML = `<option value="" disabled selected>Konnte nicht geladen werden</option>`;
      }
    })();
  }

  // gomb bekötése a DOM készülte után (BENN az IIFE-ben, nincs extra kapcsos/zárójel!)
  document.addEventListener('DOMContentLoaded', () => {
    setupLightboxEvents();
    const btn = document.getElementById('openAdminUpload');
    if (btn) {
      btn.addEventListener('click', openAdminUploadModal);
    } else {
      console.warn('#openAdminUpload nicht gefunden');
    }
  });
})();
