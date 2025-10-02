// admin.js – DE-only UI + REFRESH DELTA MODAL + Company Filter + Back To Top + Auto-Update

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
  renderList(allUploads);
}

//////////////////////////////
// Lista és modal render    //
//////////////////////////////
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

  userListContainer.innerHTML = '';
  users.forEach(displayName => {
    const files = Array.isArray(data[displayName]) ? data[displayName] : [];
    const card = document.createElement('div');
    card.className = 'user-card';

    const header = document.createElement('div');
    header.className = 'user-card-header';
    header.innerHTML = `<h3 title="${displayName}">${displayName}</h3>
      <button class="info-btn" type="button" aria-label="Info" title="Info">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm.001 5.6a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM10.9 11.5h2.2v6h-2.2v-6z"/></svg>
        <span class="sr-only">Info</span>
      </button>`;
    card.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'file-list';
    if (files.length === 0) {
      ul.innerHTML = `<li class="empty">${DE.emptyFiles}</li>`;
    } else {
      files.sort((a, b) =>
        new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
      );
      ul.innerHTML = files.map(f => {
        const when = f.uploadedAtDisplay ? formatDateDE(f.uploadedAtDisplay) : '';
        const label = `${f.folder ? f.folder + ' / ' : ''}<strong>${f.name}</strong>`;
        return `<li>
          <span class="file-icon">📄</span>
          <span class="file-name">${label}</span>
          <span class="file-date">${when}</span>
        </li>`;
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
        <div class="label">${DE.labels.name}:</div><div class="value">${displayName}</div>
        <div class="label">${DE.labels.company}:</div><div class="value">${company}</div>
        <div class="label">${DE.labels.phone}:</div><div class="value">${phoneHtml}</div>
        <div class="label">${DE.labels.email}:</div><div class="value">${emailHtml}</div>
        <div class="label">${DE.labels.lang}:</div><div class="value">${lang}</div>
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
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  if (!total) {
    backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="deltaTitle">
      <div class="modal-header">
        <h4 id="deltaTitle">${DE.deltaTitle}</h4>
        <button class="modal-close" aria-label="${DE.close}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
        </button>
      </div>
      <div class="modal-body"><p>${DE.deltaNone}</p></div>
      <div class="modal-footer"><button class="modal-primary">${DE.close}</button></div>
    </div>`;
    document.body.appendChild(backdrop);
  } else {
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
        ${Object.keys(diff).sort((a,b)=>a.localeCompare(b,'de-DE')).map(user => {
          const items = diff[user] || [];
          return `<section class="delta-user" style="margin:10px 0 14px">
            <h5 style="margin:0 0 6px">${user} <span class="count" style="color:var(--muted)">(${items.length})</span></h5>
            <ul class="delta-files" style="list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:12px;overflow:hidden">
              ${items.map(f => {
                const when = f.uploadedAtDisplay || f.uploadedAt;
                const whenText = when ? formatDateDE(when) : '';
                const path = `${f.folder || ''} / ${f.name || ''}`;
                return `<li style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:baseline;padding:10px 12px;border-bottom:1px dashed rgba(255,255,255,.06)">
                  <span class="path" style="overflow-wrap:anywhere">${path}</span>
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
  }

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

function openWeeklyReportModal(report, workWeek) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  
  const statusToClass = {
    'LEADVA': 'status-ok',
    'KRANK': 'status-warn',
    'URLAUB': 'status-info',
    'UNBEZAHLT': 'status-info',
    'HIÁNYZIK': 'status-missing'
  };

  const tableHeader = workWeek.map(day => `<th>${day.dayOfWeek === 1 ? 'Mo' : day.dayOfWeek === 2 ? 'Di' : day.dayOfWeek === 3 ? 'Mi' : day.dayOfWeek === 4 ? 'Do' : 'Fr'}<br><small>${day.day}.</small></th>`).join('');

  const tableRows = report
    .filter(user => user.isMissing) // Csak a mulasztókat mutatjuk
    .map(user => {
      const cells = workWeek.map(day => {
        const status = user.weekStatus[day.day] || '';
        const className = statusToClass[status] || '';
        return `<td class="${className}">${status}</td>`;
      }).join('');
      // Az SMS gombhoz kelleni fog egy sendSms function, de egyelőre csak a gombot rakjuk ki
      const action = user.phone ? `<button class="sms-btn" data-phone="${user.phone}" data-name="${user.name}">SMS</button>` : '';

      return `<tr>
        <td>${user.name}</td>
        ${cells}
        <td>${action}</td>
      </tr>`;
  }).join('');
  
  const modalContent = `
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
              ${tableRows || `<tr><td colspan="7">Keine fehlenden Einträge für diese Woche gefunden!</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-primary">${DE.close}</button>
      </div>
    </div>`;

  backdrop.innerHTML = modalContent;
  document.body.appendChild(backdrop);

  // TODO: SMS küldő gombok bekötése
  
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-primary').addEventListener('click', close);
}  

//////////////////////////////
// Init + refresh logika    //
//////////////////////////////
document.addEventListener('DOMContentLoaded', async () => {
  // SAFER AUTH READ: sessionStorage majd fallback localStorage
  let stored = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
  try {
    const user = stored ? JSON.parse(stored) : null;
    const role = user?.role ?? user?.userRole;
    if (!user || role !== 'admin') {
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
  const companyFilter = document.getElementById('companyFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoUpdateToggle = document.getElementById('autoUpdateToggle');

  if (!userListContainer) {
    console.error('[admin] #userListContainer hiányzik – nincs hova renderelni.');
    return;
  }

  // Snapshot előtöltés
  const savedSnap = safeJsonParse(localStorage.getItem('admin_lastSnapshot'));
  if (savedSnap) {
    lastSnapshot = savedSnap;
  }
  const savedUpdated = localStorage.getItem('admin_lastUpdated');
  if (savedUpdated) {
    lastUpdatedAt = Number(savedUpdated) || null;
    if (lastUpdatedAt) setLastUpdated(lastUpdatedAt);
  }

  const doLoad = async (showDelta = false) => {
    try {
      refreshBtn?.setAttribute('disabled', '');
      refreshBtn?.classList.add('spinning');
      userListContainer.innerHTML = `<p>${DE.loading}</p>`;

      const prevSnap = lastSnapshot;

      await Promise.all([fetchUsersMeta(), fetchAllUploads()]);

      if (showDelta && prevSnap) {
        const delta = diffSnapshots(prevSnap, allUploads);
        openDeltaModal(delta);
      }

      lastSnapshot = buildSnapshot(allUploads);
      lastUpdatedAt = Date.now();
      localStorage.setItem('admin_lastSnapshot', JSON.stringify(lastSnapshot));
      localStorage.setItem('admin_lastUpdated', String(lastUpdatedAt));
      setLastUpdated(lastUpdatedAt);
    } catch (err) {
      console.error('[admin] Betöltési hiba:', err);
      userListContainer.innerHTML = `<p class="status error">${DE.errorPrefix} ${err.message || 'Unbekannter Fehler'}</p>`;
    } finally {
      refreshBtn?.removeAttribute('disabled');
      refreshBtn?.classList.remove('spinning');
    }
  };

  // Első betöltés delta modallal
  await doLoad(true);

  nameFilter?.addEventListener('input', () => renderList(allUploads));
  companyFilter?.addEventListener('change', () => renderList(allUploads));

  refreshBtn?.addEventListener('click', async () => {
    const savedNameFilter = nameFilter ? nameFilter.value : '';
    const savedCompanyFilter = companyFilter ? companyFilter.value : '';
    await doLoad(true);
    if (nameFilter) nameFilter.value = savedNameFilter;
    if (companyFilter) companyFilter.value = savedCompanyFilter;
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

  const backToTopButton = document.getElementById('backToTopBtn');
  if (backToTopButton) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) { backToTopButton.classList.add('show'); }
      else { backToTopButton.classList.remove('show'); }
    });
    backToTopButton.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // --- AUTO-UPDATE: közvetlen doLoad hívás + azonnali indulás + tab visibility kezelés ---
  const startAutoUpdate = () => {
    if (autoUpdateInterval) return;

    // Azonnali első futás bekapcsoláskor
    (async () => {
      try { await doLoad(true); } catch (e) { console.error('Auto-update first run error:', e); }
    })();

    console.log(`Auto-update started (every ${AUTO_UPDATE_MS / 1000 / 60} min).`);
    autoUpdateInterval = setInterval(async () => {
      console.log('Auto-update tick…');
      try { await doLoad(true); } catch (e) { console.error('Auto-update tick error:', e); }
    }, AUTO_UPDATE_MS);
  };

  const stopAutoUpdate = () => {
    if (!autoUpdateInterval) return;
    console.log('Auto-update stopped.');
    clearInterval(autoUpdateInterval);
    autoUpdateInterval = null;
  };

  // Toggle bekötése + állapot visszaállítás
  if (!autoUpdateToggle) {
    console.warn('[admin] #autoUpdateToggle not found in DOM.');
  } else if (autoUpdateToggle.type !== 'checkbox') {
    console.warn('[admin] #autoUpdateToggle should be <input type="checkbox">.');
  }

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

    // Tab háttér/előtt kezelés
    document.addEventListener('visibilitychange', () => {
      const enabled = autoUpdateToggle.checked;
      if (document.hidden) {
        stopAutoUpdate();
      } else if (enabled) {
        startAutoUpdate();
      }
    });
  }
});

// Az admin.js-ben, cseréld le a teljes openWeeklyReportModal függvényt

function openWeeklyReportModal(report, workWeek) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  
  // --- JAVÍTÁS: Német státuszok és színek ---
  const statusMapping = {
    'ABGEGEBEN': { text: 'Abgegeben', class: 'status-ok' },
    'KRANK':     { text: 'Krank',     class: 'status-warn' },
    'URLAUB':    { text: 'Urlaub',    class: 'status-info' },
    'UNBEZAHLT': { text: 'Unbezahlt', class: 'status-info' },
    'FEHLT':     { text: 'FEHLT',     class: 'status-missing' }
  };

  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const tableHeader = workWeek.map((day, index) => 
    `<th>${dayNames[index]}<br><small>${day.day}.</small></th>`
  ).join('');

  const tableRows = report
    .filter(user => user.isMissing)
    .map(user => {
      const cells = workWeek.map(day => {
        // Ha egy nap nem elvárt, hagyjuk üresen
        if (user.weekStatus[day.day] === undefined) {
            return `<td class="status-na"></td>`;
        }
        const statusKey = user.weekStatus[day.day] || 'FEHLT';
        const statusInfo = statusMapping[statusKey];
        return `<td class="${statusInfo.class}">${statusInfo.text}</td>`;
      }).join('');
      
      const action = user.phone ? `<button class="sms-btn" data-phone="${user.phone}" data-name="${user.name}">SMS</button>` : '';

      return `<tr>
        <td>${user.name}</td>
        ${cells}
        <td>${action}</td>
      </tr>`;
  }).join('');
  
  
  
  
