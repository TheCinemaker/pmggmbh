// admin.js – DE-only UI + "seit letztem Besuch" delta modal

//////////////////////////
// Német UI sztringek  //
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
  sinceVisitTitle: 'Neu seit deinem letzten Besuch',
  nothingSinceVisit: 'Seit deinem letzten Besuch gab es keine neuen Uploads.',
  markReviewed: 'Als gelesen markieren',
  firstVisitBaseline: 'Erster Besuch erkannt. Baseline gesetzt.',
  baselineUpdated: 'Baseline aktualisiert.',
  labels: { name: 'Name', phone: 'Telefon', email: 'E-Mail', lang: 'Sprache' },
  close: 'Schließen'
};

/////////////////////
// Állapot, helper //
/////////////////////
let allUploads = {};   // { "Name": [{ name, folder, uploadedAt, uploadedAtDisplay, link? }] }
let usersByName = {};  // { "name lower": { displayName,id,phone,email,userLang,userRole,userType } }
let personalBaselineISO = null;

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

//////////////////////////////
// Backend adatbetöltések   //
//////////////////////////////
async function fetchUsersMeta() {
  const resp = await fetch('/.netlify/functions/getUsers');
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(getUsers ${resp.status}) ${text || ''}`);
  const arr = safeJsonParse(text) || [];
  usersByName = {};
  arr.forEach(u => {
    const key = normName(u.displayName || u.id);
    if (key) usersByName[key] = u;
  });
}

async function fetchAllUploads() {
  const urlBase = '/.netlify/functions/getAllUploads';
  let resp = await fetch(`${urlBase}?links=0`);
  if (!resp.ok) resp = await fetch(urlBase);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(getAllUploads ${resp.status}) ${text || ''}`);
  const data = safeJsonParse(text) || {};

  Object.keys(data).forEach(u => {
    if (!Array.isArray(data[u])) data[u] = [];
    data[u].forEach(f => {
      f.uploadedAt = f.uploadedAt || f.uploadedAtDisplay || null;
      f.uploadedAtDisplay = f.uploadedAtDisplay || f.uploadedAt || null;
    });
  });

  allUploads = data;
  renderList(allUploads);
}

//////////////////////////////
// Lista és modal render    //
//////////////////////////////
function renderList(data) {
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  if (!userListContainer) return;

  const filter = normName(nameFilter?.value);
  const users = Object.keys(data)
    .filter(u => normName(u).includes(filter))
    .sort((a, b) => a.localeCompare(b, 'de-DE'));

  userListContainer.innerHTML = '';

  users.forEach(displayName => {
    const files = Array.isArray(data[displayName]) ? data[displayName] : [];

    const card = document.createElement('div');
    card.className = 'user-card';

    const header = document.createElement('div');
    header.className = 'user-card-header';
    header.innerHTML = `
      <h3 title="${displayName}">${displayName}</h3>
      <button class="info-btn" type="button" aria-label="Info" title="Info">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm.001 5.6a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM10.9 11.5h2.2v6h-2.2v-6z"/>
        </svg>
        <span class="sr-only">Info</span>
      </button>
    `;
    card.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'file-list';

    if (files.length === 0) {
      ul.innerHTML = `<li class="empty">${DE.emptyFiles}</li>`;
    } else {
      files.sort((a, b) => {
        const da = new Date(a.uploadedAt || 0).getTime();
        const db = new Date(b.uploadedAt || 0).getTime();
        return db - da;
      });
      ul.innerHTML = files.map(f => {
        const when = f.uploadedAtDisplay ? formatDateDE(f.uploadedAtDisplay) : '';
        const label = `${f.folder ? f.folder + ' / ' : ''}<strong>${f.name}</strong>`;
        return `
          <li>
            <span class="file-icon">📄</span>
            <span class="file-name">${label}</span>
            <span class="file-date">${when}</span>
          </li>
        `;
      }).join('');
    }
    card.appendChild(ul);

    header.querySelector('.info-btn').addEventListener('click', () => openUserInfoModal(displayName));
    userListContainer.appendChild(card);
  });

  if (users.length === 0) {
    userListContainer.innerHTML = `<p class="status">${DE.noResults}</p>`;
  }
}

function openUserInfoModal(displayName) {
  const meta = usersByName[normName(displayName)] || {};
  const phone = meta.phone || '';
  const phoneHtml = phone
    ? `<a href="tel:${phone}">${phone}</a>${E164.test(phone) ? '' : ' <span class="badge-warn" title="Vermutlich kein vollständiges internationales Format">⚠︎</span>'}`
    : '—';
  const email = meta.email || '';
  const emailHtml = email ? `<a href="mailto:${email}">${email}</a>` : '—';
  const lang = meta.userLang || '—';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-header">
        <h4 id="modalTitle">${DE.infoTitle}</h4>
        <button class="modal-close" aria-label="${DE.close}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="modal-grid">
          <div class="label">${DE.labels.name}:</div>
          <div class="value">${displayName}</div>

          <div class="label">${DE.labels.phone}:</div>
          <div class="value">${phoneHtml}</div>

          <div class="label">${DE.labels.email}:</div>
          <div class="value">${emailHtml}</div>

          <div class="label">${DE.labels.lang}:</div>
          <div class="value">${lang}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-primary">${DE.close}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

//////////////////////////
// "Since last visit"   //
//////////////////////////
// baseline beolvasása
async function loadPersonalBaseline(adminId) {
  const url = `/.netlify/functions/adminLastSeen?adminId=${encodeURIComponent(adminId)}`;
  const resp = await fetch(url);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(adminLastSeen GET ${resp.status}) ${text || ''}`);
  const data = safeJsonParse(text) || {};
  personalBaselineISO = data.lastSeen || null;   // <-- itt a fix
}

// baseline frissítése MOST-ra
async function markBaselineNow(adminId, displayName) {
  const resp = await fetch('/.netlify/functions/adminLastSeenUpdate', {  // <-- végpont fix
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId, timestamp: new Date().toISOString(), displayName }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(adminLastSeenUpdate POST ${resp.status}) ${text || ''}`);
  const data = safeJsonParse(text) || {};
  personalBaselineISO = data.lastSeen || new Date().toISOString();  // <-- kulcs fix
}

function collectSinceBaseline() {
  if (!personalBaselineISO) return {};
  const t0 = new Date(personalBaselineISO).getTime();
  if (!Number.isFinite(t0)) return {};

  const out = {};
  Object.keys(allUploads).forEach(user => {
    const arr = Array.isArray(allUploads[user]) ? allUploads[user] : [];
    const hits = arr.filter(f => {
      const t = new Date(f.uploadedAt || f.uploadedAtDisplay || 0).getTime();
      return Number.isFinite(t) && t >= t0;
    });
    if (hits.length) {
      hits.sort((a, b) =>
        new Date(b.uploadedAt || b.uploadedAtDisplay || 0) - new Date(a.uploadedAt || a.uploadedAtDisplay || 0)
      );
      out[user] = hits;
    }
  });
  return out;
}

function openSinceVisitModal(onMarkReviewed) {
  const diff = collectSinceBaseline();
  const users = Object.keys(diff).sort((a, b) => a.localeCompare(b, 'de-DE'));

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let inner = '';
  if (!users.length) {
    inner = `<p class="status">${DE.nothingSinceVisit}</p>`;
  } else {
    inner = users.map(u => {
      const files = diff[u];
      const items = files.map(f => {
        const when = f.uploadedAt ? formatDateDE(f.uploadedAt)
                   : (f.uploadedAtDisplay ? formatDateDE(f.uploadedAtDisplay) : '');
        const label = `${f.folder ? f.folder + ' / ' : ''}${f.name}`;
        return `
          <li>
            <span class="file-icon">📄</span>
            <span class="file-name"><strong>${label}</strong></span>
            <span class="file-date">${when}</span>
          </li>
        `;
      }).join('');
      return `
        <section class="user-card" style="margin-bottom:10px">
          <div class="user-card-header">
            <h3>${u} <span class="chip" title="Anzahl">${files.length}</span></h3>
          </div>
          <ul class="file-list">${items}</ul>
        </section>
      `;
    }).join('');
  }

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitleSince">
      <div class="modal-header">
        <h4 id="modalTitleSince">${DE.sinceVisitTitle}</h4>
        <button class="modal-close" aria-label="${DE.close}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${inner}</div>
      <div class="modal-footer">
        <button class="modal-primary js-mark-reviewed">${DE.markReviewed}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.js-mark-reviewed').addEventListener('click', async () => {
    await onMarkReviewed?.();
    close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

//////////////////////////
// Last updated segéd   //
//////////////////////////
function ensureLastUpdatedEl() {
  if (document.getElementById('lastUpdated')) return;
  const el = document.createElement('div');
  el.id = 'lastUpdated';
  el.className = 'last-updated';
  const header = document.querySelector('.app-header');
  if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
  else document.body.prepend(el);
}
function setLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const ts = new Date().toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  el.textContent = `${DE.refreshedAt} ${ts}`;
}

//////////////////////////////////////
// Init: auth check + betöltések    //
//////////////////////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  // Admin ellenőrzés
  try {
    const stored = sessionStorage.getItem('currentUser');
    const user = stored ? JSON.parse(stored) : null;
    if (!user || (user.role || user.userRole) !== 'admin') {
      document.body.innerHTML = `
        <div class="app-container">
          <header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header>
          <main class="content">
            <a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a>
          </main>
        </div>
      `;
      return;
    }

    // baseline betöltés (személyes)
    await loadPersonalBaseline(user.id);
    if (!personalBaselineISO) {
      await markBaselineNow(user.id, user.displayName || '');
      console.log('[admin] ', DE.firstVisitBaseline);
    }

    // "Seit letztem Besuch" gomb a headerbe
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('sinceVisitBtn')) {
      const btn = document.createElement('button');
      btn.id = 'sinceVisitBtn';
      btn.className = 'icon-button';
      btn.title = DE.sinceVisitTitle;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 1a11 11 0 1 0 11 11A11.012 11.012 0 0 0 12 1Zm1 11V6h-2v8h7v-2Z"/>
        </svg>
      `;
      headerActions.insertBefore(btn, headerActions.firstChild);
      btn.addEventListener('click', () => {
        openSinceVisitModal(async () => {
          await markBaselineNow(user.id, user.displayName || '');
          console.log(DE.baselineUpdated);
        });
      });
    }

  } catch {
    document.body.innerHTML = `
      <div class="app-container">
        <header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header>
        <main class="content">
          <a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a>
        </main>
      </div>
    `;
    return;
  }

  // Alapelemek
  ensureLastUpdatedEl();
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const refreshBtn = document.getElementById('refreshBtn');

  if (!userListContainer) {
    console.error('[admin] #userListContainer hiányzik.');
    return;
  }

  const doLoad = async () => {
    try {
      refreshBtn?.setAttribute('disabled', '');
      refreshBtn?.classList.add('spinning');
      userListContainer.innerHTML = `<p>${DE.loading}</p>`;
      await Promise.all([fetchUsersMeta(), fetchAllUploads()]);
      renderList(allUploads);
      setLastUpdated();

      if (personalBaselineISO) {
        const diff = collectSinceBaseline();
        const hasNew = Object.keys(diff).some(k => (diff[k] || []).length);
        if (hasNew) {
          openSinceVisitModal(async () => {
            const stored = sessionStorage.getItem('currentUser');
            const user = stored ? JSON.parse(stored) : null;
            if (user) {
              await markBaselineNow(user.id, user.displayName || '');
              console.log(DE.baselineUpdated);
            }
          });
        }
      }
    } catch (err) {
      console.error('[admin] Betöltési hiba:', err);
      userListContainer.innerHTML = `<p class="status error">${DE.errorPrefix} ${err.message || 'Unbekannter Fehler'}</p>`;
    } finally {
      refreshBtn?.removeAttribute('disabled');
      refreshBtn?.classList.remove('spinning');
    }
  };

  await doLoad();

  nameFilter?.addEventListener('input', () => renderList(allUploads));

  refreshBtn?.addEventListener('click', async () => {
    const saved = nameFilter ? nameFilter.value : '';
    await doLoad();
    if (nameFilter) nameFilter.value = saved;
    renderList(allUploads);
  });

  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const key = (e.key || '').toLowerCase();
    if ((isMac && e.metaKey && key === 'r') || (!isMac && e.ctrlKey && key === 'r')) {
      e.preventDefault();
      refreshBtn?.click();
    }
  });
});
