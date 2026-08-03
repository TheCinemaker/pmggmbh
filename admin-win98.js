// ===== ADMIN WINDOWS 98 DESKTOP LOGIC ===== //

let allUploadsData = {};
let allUsersMeta = [];
let usersByName = {};
let selectedUser = null;
let selectedCompany = '';
let selectedDocType = 'all'; // 'all', 'krank', 'stunden'
let thumbnailCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTitleControls();
  initMenuDropdowns();
  fetchUsersMeta();
  fetchUploadsData();
  setupEvents();
});

function normName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// CLOCK IN STATUSBAR
function initClock() {
  const clockEl = document.getElementById('statusClock');
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
  }
  update();
  setInterval(update, 1000);
}

// TITLEBAR MIN/MAX/CLOSE CONTROLS
function initTitleControls() {
  document.getElementById('btnClose')?.addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    } else {
      if (confirm('PMG Stundenzettel Manager 98 wirklich beenden?')) {
        window.close();
      }
    }
  });

  document.getElementById('btnMinimize')?.addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.minimizeWindow();
  });

  document.getElementById('btnMaximize')?.addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.maximizeWindow();
  });
}

// FETCH USERS METADATA (COMPANIES, ETC.)
async function fetchUsersMeta() {
  try {
    const resp = await fetch('/.netlify/functions/getUsers');
    if (!resp.ok) return;
    const users = await resp.json();
    allUsersMeta = Array.isArray(users) ? users : [];

    const map = {};
    const companies = new Set();

    allUsersMeta.forEach(u => {
      const key = normName(u.displayName || u.id);
      if (key) map[key] = u;
      if (u.company) companies.add(u.company);
    });

    usersByName = map;

    // Populate Company Dropdown
    const compSelect = document.getElementById('win98Company');
    if (compSelect) {
      compSelect.innerHTML = `<option value="">(Alle Firmen)</option>`;
      Array.from(companies).sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        compSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('[Win98] getUsers meta hiba:', e);
  }
}

// FETCH ALL UPLOADS FROM NETLIFY / DROPBOX
async function fetchUploadsData() {
  const treeContainer = document.getElementById('treeChildren');
  const statusServer = document.getElementById('statusServer');
  const urlBase = '/.netlify/functions/getAllUploads';

  // 1) Load from sessionStorage cache if available for instant display
  try {
    const cached = sessionStorage.getItem('pmg_all_uploads_cache');
    if (cached) {
      allUploadsData = JSON.parse(cached);
      renderTree(allUploadsData);
      renderFileGrid();
    }
  } catch (e) {}

  if (statusServer) statusServer.textContent = 'Server: Verbinde mit Dropbox…';

  try {
    let resp = await fetch(`${urlBase}?links=0`);
    if (!resp.ok) resp = await fetch(urlBase);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    allUploadsData = data || {};

    try {
      sessionStorage.setItem('pmg_all_uploads_cache', JSON.stringify(allUploadsData));
    } catch (e) {}

    if (statusServer) statusServer.textContent = 'Server: Verbunden (Dropbox OK)';

    renderTree(allUploadsData);
    renderFileGrid();
    updateStatusCount();
  } catch (err) {
    console.error('[Win98 Admin] Hiba:', err);
    if (statusServer) statusServer.textContent = 'Server: FEHLER bei der Verbindung!';
    if (treeContainer && !Object.keys(allUploadsData).length) {
      treeContainer.innerHTML = `<div style="color:red; padding:6px;">Fehler beim Laden der Daten.</div>`;
    }
  }
}

// RENDER LEFT TREEVIEW (EMPLOYEES & FOLDERS)
function renderTree(data) {
  const treeChildren = document.getElementById('treeChildren');
  if (!treeChildren) return;

  treeChildren.innerHTML = '';

  let users = Object.keys(data).sort((a, b) => a.localeCompare(b, 'de-DE'));

  // Filter by company if selected
  if (selectedCompany) {
    users = users.filter(rawName => {
      const normKey = normName(rawName);
      const meta = usersByName[normKey] || Object.values(usersByName).find(u => {
        const uNorm = normName(u.displayName || u.id || '');
        const cleanKey = normKey.replace(/\.+/g, '').trim();
        return cleanKey && (uNorm.startsWith(cleanKey) || cleanKey.startsWith(uNorm));
      });
      return meta && meta.company === selectedCompany;
    });
  }

  // ALL USERS ITEM
  const allItem = document.createElement('div');
  allItem.className = `tree-node ${selectedUser === null ? 'selected' : ''}`;
  allItem.innerHTML = `<span class="tree-icon">📂</span> <span>(Alle Mitarbeiter ${selectedCompany ? `- ${escapeHtml(selectedCompany)}` : ''})</span>`;
  allItem.onclick = () => {
    selectedUser = null;
    document.getElementById('currentFolderHeader').textContent = `Stundenzettel 2026 - Alle Mitarbeiter ${selectedCompany ? `(${selectedCompany})` : ''}`;
    renderTree(data);
    renderFileGrid();
  };
  treeChildren.appendChild(allItem);

  users.forEach(displayNameRaw => {
    let displayName = String(displayNameRaw);
    const normKey = normName(displayName);

    // Full name resolver from Google Sheet metadata
    const matchedUser = usersByName[normKey] || Object.values(usersByName).find(u => {
      const uNorm = normName(u.displayName || u.id || '');
      const cleanKey = normKey.replace(/\.+/g, '').trim();
      return cleanKey && (uNorm.startsWith(cleanKey) || cleanKey.startsWith(uNorm));
    });

    if (matchedUser && matchedUser.displayName) {
      displayName = matchedUser.displayName;
    }

    const files = Array.isArray(data[displayNameRaw]) ? data[displayNameRaw] : [];
    const item = document.createElement('div');
    item.className = `tree-node ${selectedUser === displayNameRaw ? 'selected' : ''}`;
    item.innerHTML = `<span class="tree-icon">👤</span> <span>${escapeHtml(displayName)} (${files.length})</span>`;
    item.onclick = () => {
      selectedUser = displayNameRaw;
      document.getElementById('currentFolderHeader').textContent = `Stundenzettel 2026 / ${displayName}`;
      renderTree(data);
      renderFileGrid();
    };
    treeChildren.appendChild(item);
  });
}

// RENDER RIGHT FILE GRID
function renderFileGrid() {
  const grid = document.getElementById('win98FileGrid');
  const searchInput = document.getElementById('win98Search');
  if (!grid) return;

  grid.innerHTML = '';

  const searchQuery = (searchInput?.value || '').toLowerCase().trim();

  let filesToDisplay = [];

  if (selectedUser) {
    const userFiles = allUploadsData[selectedUser] || [];
    filesToDisplay = userFiles.map(f => ({ ...f, userName: selectedUser }));
  } else {
    Object.keys(allUploadsData).forEach(u => {
      // Filter by company if selected
      if (selectedCompany) {
        const normKey = normName(u);
        const meta = usersByName[normKey] || Object.values(usersByName).find(userMeta => {
          const uNorm = normName(userMeta.displayName || userMeta.id || '');
          const cleanKey = normKey.replace(/\.+/g, '').trim();
          return cleanKey && (uNorm.startsWith(cleanKey) || cleanKey.startsWith(uNorm));
        });
        if (!meta || meta.company !== selectedCompany) return;
      }

      const uFiles = allUploadsData[u] || [];
      uFiles.forEach(f => {
        filesToDisplay.push({ ...f, userName: u });
      });
    });
  }

  // Filter doc type ('krank', 'stunden')
  if (selectedDocType === 'krank') {
    filesToDisplay = filesToDisplay.filter(f => /krank/i.test(f.name || ''));
  } else if (selectedDocType === 'stunden') {
    filesToDisplay = filesToDisplay.filter(f => !/krank/i.test(f.name || ''));
  }

  // Filter search
  if (searchQuery) {
    filesToDisplay = filesToDisplay.filter(f =>
      (f.userName && f.userName.toLowerCase().includes(searchQuery)) ||
      (f.name && f.name.toLowerCase().includes(searchQuery)) ||
      (f.folder && f.folder.toLowerCase().includes(searchQuery))
    );
  }

  // Sort newest first
  filesToDisplay.sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());

  if (filesToDisplay.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; padding:20px; text-align:center; color:#808080;">Keine Dokumente in dieser Ansicht gefunden.</div>`;
    return;
  }

  filesToDisplay.forEach(f => {
    let resolvedName = f.userName;
    const normKey = normName(f.userName);
    const matchedUser = usersByName[normKey] || Object.values(usersByName).find(u => {
      const uNorm = normName(u.displayName || u.id || '');
      const cleanKey = normKey.replace(/\.+/g, '').trim();
      return cleanKey && (uNorm.startsWith(cleanKey) || cleanKey.startsWith(uNorm));
    });
    if (matchedUser && matchedUser.displayName) resolvedName = matchedUser.displayName;

    const card = document.createElement('div');
    card.className = 'win98-file-card';

    const ext = (f.name || '').toLowerCase().split('.').pop();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

    const thumbBox = document.createElement('div');
    thumbBox.className = 'win98-thumb-box';

    if (isImage) {
      thumbBox.innerHTML = `<div style="font-size:10px; color:#808080;">Lade…</div>`;
      loadThumbnail(f.path, thumbBox);
    } else if (ext === 'pdf') {
      thumbBox.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    } else {
      thumbBox.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    }

    const title = document.createElement('div');
    title.className = 'win98-file-title';
    title.innerHTML = `<b>${escapeHtml(resolvedName)}</b><br/><span style="font-size:10px; color:#555;">${escapeHtml(f.name || '')}</span>`;

    card.appendChild(thumbBox);
    card.appendChild(title);

    card.onclick = () => openLightbox({ ...f, resolvedName });

    grid.appendChild(card);
  });
}

// ROBUST THUMBNAIL LOADING WITH DIRECT LINK FALLBACK
async function loadThumbnail(path, container) {
  if (!path) return;
  if (thumbnailCache.has(path)) {
    const url = thumbnailCache.get(path);
    container.innerHTML = `<img src="${url}" class="win98-thumb-img" alt="Vorschau" />`;
    return;
  }

  // 1) Try getThumbnail endpoint first
  try {
    const res = await fetch(`/.netlify/functions/getThumbnail?path=${encodeURIComponent(path)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.thumbnail) {
        thumbnailCache.set(path, data.thumbnail);
        container.innerHTML = `<img src="${data.thumbnail}" class="win98-thumb-img" alt="Vorschau" />`;
        return;
      }
    }
  } catch (e) {}

  // 2) Fallback to getFileLink for direct image link if getThumbnail had issues
  try {
    const resp = await fetch('/.netlify/functions/getFileLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    });
    if (resp.ok) {
      const json = await resp.json();
      const directUrl = json.url || json.link;
      if (directUrl) {
        thumbnailCache.set(path, directUrl);
        container.innerHTML = `<img src="${directUrl}" class="win98-thumb-img" alt="Vorschau" />`;
        return;
      }
    }
  } catch (e) {}

  container.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

// OPEN LIGHTBOX DIALOG
async function openLightbox(file) {
  const modal = document.getElementById('win98Modal');
  const body = document.getElementById('win98ModalBody');
  const title = document.getElementById('win98ModalTitle');
  const downloadBtn = document.getElementById('win98ModalDownloadBtn');

  if (!modal || !body) return;

  modal.classList.remove('hidden');
  if (title) title.textContent = `Vorschau: ${file.name || 'Dokument'}`;
  body.innerHTML = `<div style="padding:20px; text-align:center;">Lade Dokumenten-Link von Dropbox…</div>`;

  let fileUrl = thumbnailCache.get(file.path) || null;

  if (!fileUrl) {
    try {
      const resp = await fetch('/.netlify/functions/getFileLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path })
      });
      if (resp.ok) {
        const json = await resp.json();
        fileUrl = json.url || json.link;
      }
    } catch (e) {
      console.warn('getFileLink hiba:', e);
    }
  }

  const ext = (file.name || '').toLowerCase().split('.').pop();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

  const displayName = file.resolvedName || file.userName || '';

  if (isImage && fileUrl) {
    body.innerHTML = `
      <div style="margin-bottom:10px; font-weight:bold; background:#d4d0c8; padding:4px 8px; border:1px solid #808080;">👤 Mitarbeiter: ${escapeHtml(displayName)} | 📂 Ordner: ${escapeHtml(file.folder || '')} | 📅 ${file.uploadedAtDisplay || ''}</div>
      <img src="${fileUrl}" class="lightbox-img-win98" alt="${escapeHtml(file.name)}" />
    `;
  } else if (ext === 'pdf' && fileUrl) {
    body.innerHTML = `
      <div style="margin-bottom:10px; font-weight:bold; background:#d4d0c8; padding:4px 8px; border:1px solid #808080;">👤 Mitarbeiter: ${escapeHtml(displayName)} | 📂 Ordner: ${escapeHtml(file.folder || '')} | 📅 ${file.uploadedAtDisplay || ''}</div>
      <iframe src="${fileUrl}" style="width:100%; height:55vh; border:1px solid #808080;" title="PDF"></iframe>
    `;
  } else {
    body.innerHTML = `
      <div style="padding:20px; text-align:center;">
        <p><b>${escapeHtml(file.name || '')}</b></p>
        <p>Keine direkte Vorschau im Fenster verfügbar.</p>
        ${fileUrl ? `<p><a href="${fileUrl}" target="_blank"><u>Klicken Sie hier zum Öffnen / Herunterladen</u></a></p>` : ''}
      </div>
    `;
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      if (fileUrl) window.open(fileUrl, '_blank');
    };
  }
}

// SETUP INTERACTIVE MENU DROPDOWNS
function initMenuDropdowns() {
  document.getElementById('menuWeeklyReport')?.addEventListener('click', openWeeklyReportDialog);
  document.getElementById('btnWeeklyReport')?.addEventListener('click', openWeeklyReportDialog);
}

// OPEN WOCHENBERICHT (WEEKLY REPORT DIALOG)
async function openWeeklyReportDialog() {
  const modal = document.getElementById('win98Modal');
  const body = document.getElementById('win98ModalBody');
  const title = document.getElementById('win98ModalTitle');

  if (!modal || !body) return;

  modal.classList.remove('hidden');
  if (title) title.textContent = 'Wochenbericht (Statusübersicht)';
  body.innerHTML = `<div style="padding:20px; text-align:center;">Lade Wochenbericht vom Szerver…</div>`;

  try {
    const resp = await fetch('/.netlify/functions/checkWeeklyUploads');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    let html = `
      <div style="margin-bottom:8px; font-weight:bold;">Wochenbericht für KW ${data.week || ''} (${data.dateRange || ''}):</div>
      <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff; border:1px solid #808080;">
        <thead>
          <tr style="background:#000080; color:#fff;">
            <th style="padding:4px; text-align:left; border:1px solid #808080;">Mitarbeiter</th>
            <th style="padding:4px; text-align:center; border:1px solid #808080;">Status</th>
            <th style="padding:4px; text-align:left; border:1px solid #808080;">Hochgeladene Datei</th>
          </tr>
        </thead>
        <tbody>
    `;

    const items = data.report || data.users || [];
    items.forEach(item => {
      const isUploaded = item.status === 'OK' || item.uploaded;
      const bg = isUploaded ? '#e6ffe6' : '#ffe6e6';
      const statusTag = isUploaded ? '<span style="color:green; font-weight:bold;">✔ HOCHGELADEN</span>' : '<span style="color:red; font-weight:bold;">✘ FEHLT</span>';

      html += `
        <tr style="background:${bg};">
          <td style="padding:4px; border:1px solid #808080;"><b>${escapeHtml(item.name || item.userName)}</b></td>
          <td style="padding:4px; text-align:center; border:1px solid #808080;">${statusTag}</td>
          <td style="padding:4px; border:1px solid #808080;">${escapeHtml(item.fileName || item.file || '-')}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    body.innerHTML = html;
  } catch (e) {
    console.error('Wochenbericht hiba:', e);
    body.innerHTML = `<div style="color:red; padding:10px;">Fehler beim Laden des Wochenberichts.</div>`;
  }
}

// SETUP EVENT LISTENERS
function setupEvents() {
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    sessionStorage.removeItem('pmg_all_uploads_cache');
    fetchUploadsData();
  });

  document.getElementById('win98Search')?.addEventListener('input', renderFileGrid);

  document.getElementById('win98Company')?.addEventListener('change', (e) => {
    selectedCompany = e.target.value;
    renderTree(allUploadsData);
    renderFileGrid();
  });

  document.getElementById('closeWin98Modal')?.addEventListener('click', () => {
    document.getElementById('win98Modal')?.classList.add('hidden');
  });

  document.getElementById('win98ModalCloseBtn')?.addEventListener('click', () => {
    document.getElementById('win98Modal')?.classList.add('hidden');
  });

  document.getElementById('btnPrint')?.addEventListener('click', () => {
    window.print();
  });
}

function updateStatusCount() {
  const users = Object.keys(allUploadsData);
  let fileCount = 0;
  users.forEach(u => { fileCount += (allUploadsData[u] || []).length; });

  const statusCount = document.getElementById('statusCount');
  const statusFiles = document.getElementById('statusFiles');

  if (statusCount) statusCount.textContent = `${users.length} Mitarbeiter geladen`;
  if (statusFiles) statusFiles.textContent = `${fileCount} Dateien total`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
