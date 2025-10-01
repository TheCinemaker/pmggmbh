// admin.js – DE-only UI + REFRESH DELTA MODAL

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
  labels: { name: 'Name', phone: 'Telefon', email: 'E-Mail', lang: 'Sprache', company: 'Firma' }, // --- ÚJ --- company label
  close: 'Schließen'
};

/////////////////////
// Állapot, helper //
/////////////////////
let allUploads = {};    // { "Name": [ { name, folder, uploadedAt, uploadedAtDisplay, link? } ] }
let usersByName = {};   // { "name lower": { displayName,id,phone,email,userLang,userRole,userType,company? } }
let allUsers = [];      // --- ÚJ --- Felhasználók listája a cégadattal együtt

// delta állapot
let lastSnapshot = null;   // { user: { "folder/name": timestamp } }
let lastUpdatedAt = null;  // number (ms)

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

// --- ÚJ --- Függvény a cég-szűrő dinamikus feltöltéséhez
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
  allUsers = usersArray; // --- ÚJ ---
  
  const map = {};
  usersArray.forEach(u => { // --- ÚJ --- arr helyett usersArray
    const key = normName(u.displayName || u.id);
    if (key) map[key] = u;
  });
  usersByName = map;
  
  populateCompanyFilter(allUsers); // --- ÚJ ---
}

async function fetchAllUploads() {
  const urlBase = '/.netlify/functions/getAllUploads';
  let resp = await fetch(`${urlBase}?links=0`);
  if (!resp.ok) {
    resp = await fetch(urlBase);
  }
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
  renderList(allUploads);
}

//////////////////////////////
// Lista és modal render    //
//////////////////////////////
function renderList(data) {
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const companyFilter = document.getElementById('companyFilter'); // --- ÚJ ---
  if (!userListContainer) {
    console.error('[admin] Hiányzik #userListContainer');
    return;
  }

  const nameQuery = normName(nameFilter?.value); // --- ÚJ --- átnevezve filter -> nameQuery
  const selectedCompany = companyFilter?.value; // --- ÚJ ---

  const users = Object.keys(data)
    .filter(displayName => {
      // --- ÚJ --- Kibővített szűrési logika
      const nameMatch = normName(displayName).includes(nameQuery);
      if (!nameMatch) return false;

      if (selectedCompany) {
        const userMeta = usersByName[normName(displayName)];
        return userMeta && userMeta.company === selectedCompany;
      }
      
      return true;
    })
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
  const company = meta.company || '—'; // --- ÚJ ---

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
          
          <!-- ÚJ --- Cég info a modálban -->
          <div class="label">${DE.labels.company}:</div>
          <div class="value">${company}</div>

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

//////////////////////////////
// Delta modal megjelenítés //
//////////////////////////////
function openDeltaModal(diff) {
  const total = Object.values(diff || {}).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  if (!total) {
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="deltaTitle"><div class="modal-header"><h4 id="deltaTitle">${DE.deltaTitle}</h4><button class="modal-close" aria-label="${DE.close}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg></button></div><div class="modal-body"><p>${DE.deltaNone}</p></div><div class="modal-footer"><button class="modal-primary">${DE.close}</button></div></div>`;
    document.body.appendChild(backdrop);
  } else {
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="deltaTitle"><div class="modal-header"><h4 id="deltaTitle">${DE.deltaTitle} – ${DE.deltaCount(total)}</h4><button class="modal-close" aria-label="${DE.close}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg></button></div><div class="modal-body"><div class="delta-info muted">${DE.updatedAtPrefix} ${formatDateDE(lastUpdatedAt)}</div>${Object.keys(diff).sort((a,b)=>a.localeCompare(b,'de-DE')).map(user => { const items = diff[user] || []; return `<section class="delta-user" style="margin:10px 0 14px"><h5 style="margin:0 0 6px">${user} <span class="count" style="color:var(--muted)">(${items.length})</span></h5><ul class="delta-files" style="list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:12px;overflow:hidden">${items.map(f => { const when = f.uploadedAtDisplay || f.uploadedAt; const whenText = when ? formatDateDE(when) : ''; const path = `${f.folder || ''} / ${f.name || ''}`; return `<li style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:baseline;padding:10px 12px;border-bottom:1px dashed rgba(255,255,255,.06)"><span class="path" style="overflow-wrap:anywhere">${path}</span><span class="date" style="white-space:nowrap;color:var(--muted);font-size:.9rem">${whenText}</span></li>`; }).join('')}</ul></section>`; }).join('')}</div><div class="modal-footer"><button class="modal-primary">${DE.close}</button></div></div>`;
    document.body.appendChild(backdrop);
  }
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown', esc);} });
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

function setLastUpdated(ts) {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const text = formatDateDE(ts || Date.now());
  el.textContent = `${DE.refreshedAt} ${text}`;
}

//////////////////////////////
// Init + refresh logika    //
//////////////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const stored = sessionStorage.getItem('currentUser');
    const user = stored ? JSON.parse(stored) : null;
    if (!user || (user.role || user.userRole) !== 'admin') {
      document.body.innerHTML = `<div class="app-container"><header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header><main class="content"><a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a></main></div>`;
      return;
    }
  } catch {
    document.body.innerHTML = `<div class="app-container"><header class="app-header"><h1>${DE.accessDeniedTitle}</h1></header><main class="content"><a class="logout-button" href="index.html" title="${DE.backHome}">${DE.backHome}</a></main></div>`;
    return;
  }

  ensureLastUpdatedEl();
  const userListContainer = document.getElementById('userListContainer');
  const nameFilter = document.getElementById('nameFilter');
  const companyFilter = document.getElementById('companyFilter'); // --- ÚJ ---
  const refreshBtn = document.getElementById('refreshBtn');

  if (!userListContainer) {
    console.error('[admin] #userListContainer hiányzik – nincs hova renderelni.');
    return;
  }

  const savedSnap = safeJsonParse(sessionStorage.getItem('admin_lastSnapshot'));
  if (savedSnap) lastSnapshot = savedSnap;
  const savedUpdated = sessionStorage.getItem('admin_lastUpdated');
  if (savedUpdated) { lastUpdatedAt = Number(savedUpdated) || Date.now(); setLastUpdated(lastUpdatedAt); }

  const doLoad = async (showDelta = false) => {
    try {
      refreshBtn?.setAttribute('disabled', '');
      refreshBtn?.classList.add('spinning');
      userListContainer.innerHTML = `<p>${DE.loading}</p>`;
      const prevSnap = lastSnapshot || null;
      await Promise.all([fetchUsersMeta(), fetchAllUploads()]);
      renderList(allUploads);
      lastUpdatedAt = Date.now();
      setLastUpdated(lastUpdatedAt);
      sessionStorage.setItem('admin_lastUpdated', String(lastUpdatedAt));
      if (showDelta && prevSnap) {
        const delta = diffSnapshots(prevSnap, allUploads);
        openDeltaModal(delta);
      }
      lastSnapshot = buildSnapshot(allUploads);
      sessionStorage.setItem('admin_lastSnapshot', JSON.stringify(lastSnapshot));
    } catch (err) {
      console.error('[admin] Betöltési hiba:', err);
      userListContainer.innerHTML = `<p class="status error">${DE.errorPrefix} ${err.message || 'Unbekannter Fehler'}</p>`;
    } finally {
      refreshBtn?.removeAttribute('disabled');
      refreshBtn?.classList.remove('spinning');
    }
  };

  await doLoad(false);

  nameFilter?.addEventListener('input', () => renderList(allUploads));
  companyFilter?.addEventListener('change', () => renderList(allUploads)); // --- ÚJ ---

  refreshBtn?.addEventListener('click', async () => {
    const savedNameFilter = nameFilter ? nameFilter.value : '';
    const savedCompanyFilter = companyFilter ? companyFilter.value : ''; // --- ÚJ ---
    await doLoad(true);
    if (nameFilter) nameFilter.value = savedNameFilter;
    if (companyFilter) companyFilter.value = savedCompanyFilter; // --- ÚJ ---
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

// --- ÚJ: Vissza a tetejére gomb logikája ---
  const backToTopButton = document.getElementById('backToTopBtn');
  if (backToTopButton) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopButton.classList.add('show');
      } else {
        backToTopButton.classList.remove('show');
      }
    });
    backToTopButton.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});
