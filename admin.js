// admin.js

// --- Német UI sztringek ---
const DE = {
  loading: 'Daten werden geladen…',
  errorPrefix: 'Fehler:',
  emptyFiles: 'Keine hochgeladenen Dateien.',
  noResults: 'Keine Treffer für den Filter.',
  accessDeniedTitle: 'Zugriff verweigert',
  backHome: 'Zurück zur Startseite',
  infoTitle: 'Mitarbeiterinfo',
  labels: {
    name: 'Name',
    phone: 'Telefon',
    email: 'E-Mail',
    role: 'Rolle',
    type: 'Typ',
    lang: 'Sprache'
  },
  close: 'Schließen'
};

// --- Állapot ---
let allUploads = {};     // { "Max Mustermann": [ { name, folder, uploadedAt, uploadedAtDisplay } ] }
let usersByName = {};    // { "max mustermann": { displayName,id,phone,email,userRole,userType,userLang } }

// --- Helper-ek ---
const E164 = /^\+\d{7,15}$/;

function formatDateDE(isoOrAny) {
  if (!isoOrAny) return '';
  const d = new Date(isoOrAny);
  if (isNaN(d.getTime())) return String(isoOrAny);
  return d.toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function safeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function normName(s) {
  return (s || '').trim().toLowerCase();
}

// --- Adatok betöltése ---
async function fetchUsersMeta() {
  const resp = await fetch('/.netlify/functions/getUsers');
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(${resp.status}) ${text || 'Serverfehler'}`);
  const arr = safeJson(text) || [];
  usersByName = {};
  arr.forEach(u => {
    const key = normName(u.displayName || u.id);
    if (key) usersByName[key] = u;
  });
}

async function fetchAllUploads() {
  const userListContainer = document.getElementById('userListContainer');
  userListContainer.innerHTML = `<p>${DE.loading}</p>`;

  const resp = await fetch('/.netlify/functions/getAllUploads?links=0');
  const text = await resp.text();
  if (!resp.ok) throw new Error(`(${resp.status}) ${text || 'Serverfehler'}`);
  const data = safeJson(text) || {};
  allUploads = data;
  renderList(data);
}

// --- Lista kirajzolás ---
function renderList(data) {
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');

  userListContainer.innerHTML = '';
  const filterText = normName(nameFilter?.value);

  const users = Object.keys(data)
    .filter(u => normName(u).includes(filterText))
    .sort((a, b) => a.localeCompare(b, 'de-DE'));

  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'user-card';

    // Fejléc + info gomb
    const header = document.createElement('div');
    header.className = 'user-card-header';
    header.innerHTML = `
  <h3>${user}</h3>
  <button class="info-btn" type="button" aria-label="Info" title="Info">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm.001 5.6a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM10.9 11.5h2.2v6h-2.2v-6z"/>
    </svg>
    <span class="sr-only">Info</span>
  </button>
`;
    card.appendChild(header);

    // Fájl lista
    const files = Array.isArray(data[user]) ? data[user] : [];
    const ul = document.createElement('ul');
    ul.className = 'file-list';

    if (!files.length) {
      ul.innerHTML = `<li class="empty">${DE.emptyFiles}</li>`;
    } else {
      // rendezés: legfrissebb fel tetején
      files.sort((a, b) => {
        const da = new Date(a.uploadedAt || a.uploadedAtDisplay || 0).getTime();
        const db = new Date(b.uploadedAt || b.uploadedAtDisplay || 0).getTime();
        return db - da;
      });
      ul.innerHTML = files.map(file => {
        const when = file.uploadedAtDisplay || formatDateDE(file.uploadedAt);
        return `
          <li>
            <span class="file-icon">📄</span>
            <span class="file-name" title="${file.folder} / ${file.name}">${file.folder} / <strong>${file.name}</strong></span>
            <span class="file-date">${when || ''}</span>
          </li>
        `;
      }).join('');
    }
    card.appendChild(ul);

    // info modal megnyitása
    header.querySelector('.info-btn').addEventListener('click', () => openUserInfoModal(user));

    userListContainer.appendChild(card);
  });

  if (!users.length) {
    userListContainer.innerHTML = `<p class="status">${DE.noResults}</p>`;
  }
}

// --- Info modal ---
function openUserInfoModal(displayName) {
  const meta = usersByName[normName(displayName)] || {};
  const phone = meta.phone || '';
  const phoneHtml = phone
    ? `<a href="tel:${phone}">${phone}</a>${E164.test(phone) ? '' : ' <span class="badge-warn" title="Vermutlich kein vollständiges internationales Format">⚠︎</span>'}`
    : '—';

  const email = meta.email || '';
  const emailHtml = email ? `<a href="mailto:${email}">${email}</a>` : '—';

  const role = meta.userRole || '—';
  const type = meta.userType || '—';
  const lang = meta.userLang || '—';

  // ha már van nyitott modal, zárjuk
  document.querySelectorAll('.modal-backdrop').forEach(n => n.remove());

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

          <div class="label">${DE.labels.role}:</div>
          <div class="value">${role}</div>

          <div class="label">${DE.labels.type}:</div>
          <div class="value">${type}</div>

          <div class="label">${DE.labels.lang}:</div>
          <div class="value">${lang}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-primary">${DE.close}</button>
      </div>
    </div>
  `;

  // ⛔️ Itt volt az elgépelés
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}


// --- Init / Admin védelem ---
document.addEventListener('DOMContentLoaded', async () => {
  // --- Admin ellenőrzés ---
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

  // --- Elemszelektorok ---
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const refreshBtn = document.getElementById('refreshBtn');

  // --- Helper: "Zuletzt aktualisiert" frissítése ---
  const setLastUpdated = () => {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    const ts = new Date().toLocaleString('de-DE', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const prefix = (typeof DE === 'object' && DE.refreshedAt) ? DE.refreshedAt : 'Zuletzt aktualisiert:';
    el.textContent = `${prefix} ${ts}`;
  };

  // --- Első betöltés / fallback frissítés ---
  const doLoad = async () => {
    try {
      refreshBtn?.setAttribute('disabled', '');
      refreshBtn?.classList.add('spinning');
      userListContainer.innerHTML = `<p>${DE.loading}</p>`;
      await Promise.all([fetchUsersMeta(), fetchAllUploads()]);
      renderList(allUploads);
      setLastUpdated();
    } catch (err) {
      userListContainer.innerHTML = `<p class="status error">${DE.errorPrefix} ${err.message}</p>`;
    } finally {
      refreshBtn?.removeAttribute('disabled');
      refreshBtn?.classList.remove('spinning');
    }
  };

  // --- Indító betöltés ---
  await doLoad();

  // --- Szűrő ---
  if (nameFilter) {
    nameFilter.addEventListener('input', () => renderList(allUploads));
  }

  // --- Frissítés gomb ---
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const saved = nameFilter ? nameFilter.value : '';
      // ha van dedikált refreshAdminData(), használjuk azt; különben fallback
      if (typeof refreshAdminData === 'function') {
        await refreshAdminData();
      } else {
        await doLoad();
        if (nameFilter) nameFilter.value = saved;
        renderList(allUploads);
      }
    });
  }

  // --- Ctrl/Cmd + R lokális frissítésre (oldal reload helyett) ---
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const key = (e.key || '').toLowerCase();
    if ((isMac && e.metaKey && key === 'r') || (!isMac && e.ctrlKey && key === 'r')) {
      e.preventDefault();
      refreshBtn?.click();
    }
  });
});

