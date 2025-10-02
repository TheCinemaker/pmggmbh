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
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function showToast(msg, type='info') {
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
  const fragment = document.createDocumentFragment();

  users.forEach(displayNameRaw => {
    const displayName = String(displayNameRaw);
    const files = Array.isArray(data[displayName]) ? data[displayName] : [];

    const card = document.createElement('div');
    card.className = 'user-card';

    const header = document.createElement('div');
    header.className = 'user-card-header';
    header.innerHTML =
      `<h3 title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h3>
       <button class="info-btn" type="button" aria-label="Info" title="Info">
         <svg viewBox="0 0 24 24" aria-hidden="true">
           <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm.001 5.6a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM10.9 11.5h2.2v6h-2.2v-6z"/>
         </svg>
         <span class="sr-only">Info</span>
       </button>`;
    card.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'file-list';
    if (files.length === 0) {
      ul.innerHTML = `<li class="empty">${DE.emptyFiles}</li>`;
    } else {
      files.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
      ul.innerHTML = files.map(f => {
        const when = f.uploadedAtDisplay ? formatDateDE(f.uploadedAtDisplay) : '';
        const folder = f.folder ? `${escapeHtml(f.folder)} / ` : '';
        const name = `<strong>${escapeHtml(f.name)}</strong>`;
        return `<li>
          <span class="file-icon">📄</span>
          <span class="file-name">${folder}${name}</span>
          <span class="file-date">${when}</span>
        </li>`;
      }).join('');
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
      ${Object.keys(diff).sort((a,b)=>a.localeCompare(b,'de-DE')).map(user => {
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
    'KRANK':     { text: 'Krank',     class: 'status-warn' },
    'URLAUB':    { text: 'Urlaub',    class: 'status-info' },
    'UNBEZAHLT': { text: 'Unbezahlt', class: 'status-info' },
    'FEHLT':     { text: 'FEHLT',     class: 'status-missing' }
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
      ? `<button class="sms-btn" data-phone="${escapeHtml(String(user.phone))}" data-name="${escapeHtml(String(user.name||''))}">SMS</button>`
      : '';
    return `<tr><td>${escapeHtml(String(user.name||'—'))}</td>${cells}<td>${action}</td></tr>`;
  }).join('');

  const colspan = 1 + (workWeek?.length || 0) + 1;

  backdrop.innerHTML = `
    <div class="modal large" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h4>Wochenbericht (Nur fehlende Einträge)</h4>
        <label class="toggle-all">
          <input id="showAllToggle" type="checkbox">
          <span>Alle anzeigen</span>
          </label>
        <button class="modal-close" aria-label="${DE.close}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="report-table-wrapper">
        <div class="report-legend">
        <span class="badge status-ok" title="Abgegeben">Abgegeben</span>
        <span class="badge status-warn" title="Krank">Krank</span>
        <span class="badge status-info" title="Urlaub/Unbezahlt">Urlaub/Unbezahlt</span>
        <span class="badge status-missing" title="FEHLT">FEHLT</span>
        <span class="badge status-na" title="Nicht erwartet">—</span>
        </div>
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
      const name  = btn.getAttribute('data-name');
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
});
