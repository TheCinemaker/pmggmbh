// ===== ADMIN WINDOWS 98 DESKTOP LOGIC ===== //

let allUploadsData = {};
let allUsersMeta = [];
let usersByName = {};
let selectedUser = null;
let selectedMonth = null;
let selectedCompany = '';
let selectedDocType = 'all'; // 'all', 'krank', 'stunden'
let expandedUsers = new Set();
let selectedFiles = new Set();
let statusRegistry = {};
let thumbnailCache = new Map();

const STANDARD_MONTHS = [
  '1. Januar', '2. Februar', '3. März', '4. April',
  '5. Mai', '6. Juni', '7. Juli', '8. August',
  '9. September', '10. Oktober', '11. November', '12. Dezember'
];

let thumbObserver = null;

function initThumbObserver() {
  if ('IntersectionObserver' in window) {
    thumbObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const box = entry.target;
          const path = box.dataset.path;
          const fileId = box.dataset.fileid;
          if (path) {
            loadThumbnail(path, box, fileId);
          }
          observer.unobserve(box);
        }
      });
    }, { rootMargin: '150px' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTitleControls();
  initThumbObserver();
  loadThumbCache();
  fetchStatusRegistry();
  fetchUsersMeta();
  loadPersistentCache();
  fetchUploadsData(true);
  setupEvents();
  setInterval(() => fetchUploadsData(true), 60000);
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

// PERSISTENT LOCALSTORAGE THUMBNAIL CACHE
function loadThumbCache() {
  try {
    const raw = localStorage.getItem('pmg_win98_thumb_cache_v3');
    if (raw) {
      const obj = JSON.parse(raw);
      Object.keys(obj).forEach(k => thumbnailCache.set(k, obj[k]));
    }
  } catch (e) {}
}

function saveThumbCache() {
  try {
    const obj = {};
    thumbnailCache.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem('pmg_win98_thumb_cache_v3', JSON.stringify(obj));
  } catch (e) {}
}

// INSTANT LOAD FROM LOCALSTORAGE
function loadPersistentCache() {
  try {
    const cached = localStorage.getItem('pmg_win98_uploads_cache_v3') || sessionStorage.getItem('pmg_all_uploads_cache');
    if (cached) {
      allUploadsData = JSON.parse(cached);
      renderTree(allUploadsData);
      renderFileGrid();
      updateStatusCount();
      const statusServer = document.getElementById('statusServer');
      if (statusServer) statusServer.textContent = 'Server: Verbunden (Cache) - Synchronisiere im Hintergrund…';
    }
  } catch (e) {
    console.warn('[Cache] Load error:', e);
  }
}

// FETCH ALL UPLOADS FROM NETLIFY / DROPBOX WITH SILENT BACKGROUND SYNC
async function fetchUploadsData(silent = false) {
  const treeContainer = document.getElementById('treeChildren');
  const statusServer = document.getElementById('statusServer');
  const urlBase = '/.netlify/functions/getAllUploads';

  if (!silent && !Object.keys(allUploadsData).length && statusServer) {
    statusServer.textContent = 'Server: Verbinde mit Dropbox…';
  }

  try {
    let resp = await fetch(`${urlBase}?links=0`);
    if (!resp.ok) resp = await fetch(urlBase);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    allUploadsData = data || {};

    try {
      localStorage.setItem('pmg_win98_uploads_cache_v3', JSON.stringify(allUploadsData));
      sessionStorage.setItem('pmg_all_uploads_cache', JSON.stringify(allUploadsData));
    } catch (e) {}

    if (statusServer) statusServer.textContent = 'Server: Verbunden (Dropbox OK - Synchronisiert)';

    renderTree(allUploadsData);
    renderFileGrid();
    updateStatusCount();
    updateNewUploadsBadge();
  } catch (err) {
    console.error('[Win98 Admin] Hiba:', err);
    if (statusServer && !Object.keys(allUploadsData).length) {
      statusServer.textContent = 'Server: FEHLER bei der Verbindung!';
    }
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

  let users = Object.keys(data).filter(u => {
    const low = String(u || '').toLowerCase();
    return !low.includes('ausgeschieden') && !low.includes('system');
  });

  // Sort workers alphabetically A-Z by resolved display name
  users.sort((a, b) => {
    const nameA = usersByName[normName(a)]?.displayName || a;
    const nameB = usersByName[normName(b)]?.displayName || b;
    return nameA.localeCompare(nameB, 'hu', { sensitivity: 'base' });
  });

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
    selectedMonth = null;
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

    // Group file counts by month folder
    const monthCounts = {};
    files.forEach(f => {
      if (f.folder) {
        monthCounts[f.folder] = (monthCounts[f.folder] || 0) + 1;
      }
    });

    const customFolders = Object.keys(monthCounts).filter(m => !STANDARD_MONTHS.includes(m));
    const allUserFolders = [...STANDARD_MONTHS, ...customFolders];

    const isExpanded = expandedUsers.has(displayNameRaw);
    const isUserSelected = selectedUser === displayNameRaw && selectedMonth === null;

    const userWrap = document.createElement('div');
    userWrap.className = 'user-tree-wrap';

    const item = document.createElement('div');
    item.className = `tree-node ${isUserSelected ? 'selected' : ''}`;

    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'tree-toggle';
    toggleBtn.textContent = isExpanded ? '-' : '+';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      if (expandedUsers.has(displayNameRaw)) {
        expandedUsers.delete(displayNameRaw);
      } else {
        expandedUsers.add(displayNameRaw);
      }
      renderTree(data);
    };

    const iconSpan = document.createElement('span');
    iconSpan.className = 'tree-icon';
    iconSpan.textContent = '👤';

    const labelSpan = document.createElement('span');
    labelSpan.innerHTML = `${escapeHtml(displayName)} <b>(${files.length})</b>`;

    item.appendChild(toggleBtn);
    item.appendChild(iconSpan);
    item.appendChild(labelSpan);

    item.onclick = () => {
      selectedUser = displayNameRaw;
      selectedMonth = null;
      document.getElementById('currentFolderHeader').textContent = `Stundenzettel 2026 / ${displayName}`;
      renderTree(data);
      renderFileGrid();
    };

    userWrap.appendChild(item);

    // Render month subfolders when expanded
    if (isExpanded) {
      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'tree-children';

      allUserFolders.forEach(mName => {
        const count = monthCounts[mName] || 0;
        const isMonthSelected = selectedUser === displayNameRaw && selectedMonth === mName;

        const subItem = document.createElement('div');
        subItem.className = `tree-node ${isMonthSelected ? 'selected' : ''}`;
        subItem.innerHTML = `<span class="tree-icon">${count > 0 ? '📂' : '📁'}</span> <span>${escapeHtml(mName)} (${count})</span>`;
        subItem.onclick = (e) => {
          e.stopPropagation();
          selectedUser = displayNameRaw;
          selectedMonth = mName;
          document.getElementById('currentFolderHeader').textContent = `Stundenzettel 2026 / ${displayName} / ${mName}`;
          renderTree(data);
          renderFileGrid();
        };
        childrenDiv.appendChild(subItem);
      });

      userWrap.appendChild(childrenDiv);
    }

    treeChildren.appendChild(userWrap);
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
    
    // Filter by specific month folder if selected
    if (selectedMonth) {
      filesToDisplay = filesToDisplay.filter(f => f.folder === selectedMonth);
    }
  } else {
    Object.keys(allUploadsData).forEach(u => {
      const uLow = String(u || '').toLowerCase();
      if (uLow.includes('ausgeschieden') || uLow.includes('system')) return;

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
        const fPathLow = String(f.path || f.folder || '').toLowerCase();
        if (fPathLow.includes('ausgeschieden') || fPathLow.includes('system')) return;
        filesToDisplay.push({ ...f, userName: u });
      });
    });
  }

  // Filter by last 2 months (current month + previous month) unless a specific month was clicked in the tree
  if (!selectedMonth) {
    const now = new Date();
    const currentM = now.getMonth() + 1; // 1-12
    const prevM = currentM === 1 ? 12 : currentM - 1;

    filesToDisplay = filesToDisplay.filter(f => {
      if (!f.folder) return true;
      const m = f.folder.match(/^(\d+)\./);
      if (!m) return true;
      const fNum = parseInt(m[1], 10);
      return fNum === currentM || fNum === prevM;
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

  // Sort naturally by numerical filename order (e.g. 1.jpg, 2.jpg, 10.jpg)
  filesToDisplay.sort((a, b) => {
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  });

  if (filesToDisplay.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; padding:20px; text-align:center; color:#808080;">Keine Dokumente in dieser Ansicht gefunden.</div>`;
    return;
  }

  // 2-LEVEL NESTED GROUPING: Worker Name -> Month Folder
  const groupedByWorker = {};
  filesToDisplay.forEach(f => {
    const uName = f.userName || 'Unkategorisiert';
    if (!groupedByWorker[uName]) groupedByWorker[uName] = {};

    const mFolder = f.folder || 'Sonstige';
    if (!groupedByWorker[uName][mFolder]) groupedByWorker[uName][mFolder] = [];

    groupedByWorker[uName][mFolder].push(f);
  });

  // Filter out Ausgeschieden folders and sort worker sections alphabetically A-Z
  let workerKeys = Object.keys(groupedByWorker).filter(u => {
    const low = String(u || '').toLowerCase();
    return !low.includes('ausgeschieden') && !low.includes('system');
  });

  workerKeys.sort((a, b) => {
    const nameA = usersByName[normName(a)]?.displayName || a;
    const nameB = usersByName[normName(b)]?.displayName || b;
    return nameA.localeCompare(nameB, 'hu', { sensitivity: 'base' });
  });

  // Render Worker sections & Month sub-sections
  workerKeys.forEach(uName => {
    let resolvedWorkerName = uName;
    const normKey = normName(uName);
    const matchedUser = usersByName[normKey] || Object.values(usersByName).find(u => {
      const uNorm = normName(u.displayName || u.id || '');
      const cleanKey = normKey.replace(/\.+/g, '').trim();
      return cleanKey && (uNorm.startsWith(cleanKey) || cleanKey.startsWith(uNorm));
    });
    if (matchedUser && matchedUser.displayName) resolvedWorkerName = matchedUser.displayName;

    const workerMonths = groupedByWorker[uName];
    let totalWorkerFiles = 0;
    Object.values(workerMonths).forEach(arr => totalWorkerFiles += arr.length);

    // 1) WORKER HEADER
    const workerSectionHeader = document.createElement('div');
    workerSectionHeader.className = 'grid-worker-section';
    workerSectionHeader.innerHTML = `
      <div class="grid-worker-header">
        <span>👤 <b>${escapeHtml(resolvedWorkerName)}</b></span>
        <span style="font-size:11px; font-weight:normal;">(${totalWorkerFiles} Dokumente total)</span>
      </div>
    `;
    grid.appendChild(workerSectionHeader);

    // 2) MONTH SUB-HEADERS & FILE CARDS
    Object.keys(workerMonths).forEach(mFolder => {
      const mFiles = workerMonths[mFolder];
      mFiles.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));

      const monthSectionHeader = document.createElement('div');
      monthSectionHeader.className = 'grid-month-section';
      monthSectionHeader.innerHTML = `
        <div class="grid-month-header">
          <span>📅 ${escapeHtml(mFolder)}</span>
          <span style="font-size:10px; font-weight:normal;">(${mFiles.length} Dokumente)</span>
        </div>
      `;
      grid.appendChild(monthSectionHeader);

      mFiles.forEach(f => {
        const fileName = (f.name || '').toLowerCase();
        const isNote = fileName.startsWith('notes_') || fileName.endsWith('.txt');
        const ext = fileName.split('.').pop();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

        const card = document.createElement('div');
        card.className = `win98-file-card ${isNote ? 'note-card' : ''}`;

        // Checkbox for multi-select / batch print
        const cbWrap = document.createElement('div');
        cbWrap.className = 'file-checkbox-wrap';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'file-checkbox';
        cb.checked = selectedFiles.has(f.path);
        cb.onclick = (e) => {
          e.stopPropagation();
          if (cb.checked) {
            selectedFiles.add(f.path);
          } else {
            selectedFiles.delete(f.path);
          }
          updateSelectAllLabel();
        };
        cbWrap.appendChild(cb);
        card.appendChild(cbWrap);

        const thumbBox = document.createElement('div');
        thumbBox.className = 'win98-thumb-box';

        if (isNote) {
          thumbBox.innerHTML = `<div style="font-size:28px;">📝</div>`;
        } else if (isImage) {
          if (thumbnailCache.has(f.path)) {
            loadThumbnail(f.path, thumbBox, f.id);
          } else {
            thumbBox.innerHTML = `<div style="font-size:10px; color:#808080;">📷</div>`;
            thumbBox.dataset.path = f.path;
            if (f.id) thumbBox.dataset.fileid = f.id;
            if (thumbObserver) {
              thumbObserver.observe(thumbBox);
            } else {
              loadThumbnail(f.path, thumbBox, f.id);
            }
          }
        } else if (ext === 'pdf') {
          thumbBox.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        } else {
          thumbBox.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#000080" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
        }

        const title = document.createElement('div');
        title.className = 'win98-file-title';
        title.innerHTML = `<b>${escapeHtml(resolvedWorkerName)}</b><br/><span style="font-size:10px; color:#555;">${isNote ? '📝 Notiz: ' : ''}${escapeHtml(f.name || '')}</span>`;

        card.appendChild(thumbBox);
        card.appendChild(title);

        card.onclick = () => openLightbox({ ...f, resolvedName: resolvedWorkerName });

        grid.appendChild(card);
      });
    });
  });
}

// ROBUST THUMBNAIL LOADING WITH DIRECT LINK FALLBACK
async function loadThumbnail(path, container, fileId) {
  if (!path) return;
  if (thumbnailCache.has(path)) {
    const url = thumbnailCache.get(path);
    container.innerHTML = `<img src="${url}" class="win98-thumb-img" alt="Vorschau" />`;
    return;
  }

  // 1) Try getThumbnail endpoint first
  try {
    const qs = new URLSearchParams({ path });
    if (fileId) qs.set('fileId', fileId);
    const res = await fetch(`/.netlify/functions/getThumbnail?${qs}`);
    const data = res.ok ? await res.json() : null;
    if (data && data.thumbnail) {
      thumbnailCache.set(path, data.thumbnail);
      saveThumbCache();
      container.innerHTML = `<img src="${data.thumbnail}" class="win98-thumb-img" alt="Vorschau" />`;
      return;
    }
    // A szerver 200-at ad üres thumbnaillel is – itt derül ki a valódi ok.
    console.warn('[Thumbnail] Nincs link:', path, data?.error || `HTTP ${res.status}`);
  } catch (e) {
    console.warn('[Thumbnail] getThumbnail hiba:', path, e);
  }

  // 2) Fallback to getFileLink for direct image link if getThumbnail had issues
  try {
    const resp = await fetch('/.netlify/functions/getFileLink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, fileId })
    });
    const json = await resp.json().catch(() => null);
    const directUrl = resp.ok ? (json?.url || json?.link) : null;
    if (directUrl) {
      thumbnailCache.set(path, directUrl);
      saveThumbCache();
      container.innerHTML = `<img src="${directUrl}" class="win98-thumb-img" alt="Vorschau" />`;
      return;
    }
    console.warn('[Thumbnail] getFileLink fallback bukott:', path, json?.error || `HTTP ${resp.status}`, json?.attempts || '');
  } catch (e) {
    console.warn('[Thumbnail] getFileLink hiba:', path, e);
  }

  container.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

let currentLightboxFile = null;

// OPEN LIGHTBOX DIALOG
async function openLightbox(file) {
  currentLightboxFile = file;
  const modal = document.getElementById('win98Modal');
  const body = document.getElementById('win98ModalBody');
  const title = document.getElementById('win98ModalTitle');
  const downloadBtn = document.getElementById('win98ModalDownloadBtn');

  if (!modal || !body) return;

  modal.style.zIndex = '100050';
  modal.classList.remove('hidden');
  if (title) title.textContent = `Vorschau: ${file.name || 'Dokument'}`;
  body.innerHTML = `<div style="padding:20px; text-align:center;">Lade Dokumenten-Link von Dropbox…</div>`;

  let fileUrl = thumbnailCache.get(file.path) || null;
  let linkError = null;

  if (!fileUrl) {
    try {
      const resp = await fetch('/.netlify/functions/getFileLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path, fileId: file.id })
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok && (json?.url || json?.link)) {
        fileUrl = json.url || json.link;
      } else {
        linkError = json?.error || `HTTP ${resp.status}`;
        console.warn('getFileLink bukott:', file.path, linkError, json?.attempts || '');
      }
    } catch (e) {
      linkError = e.message;
      console.warn('getFileLink hiba:', e);
    }
  }

  const ext = (file.name || '').toLowerCase().split('.').pop();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

  const displayName = file.resolvedName || file.userName || '';

  if (isImage && fileUrl) {
    resetImgZoomPan();
    body.innerHTML = `
      <div style="margin-bottom:6px; font-weight:bold; background:#d4d0c8; padding:4px 8px; border:1px solid #808080; font-size:11px;">👤 Mitarbeiter: ${escapeHtml(displayName)} | 📂 Ordner: ${escapeHtml(file.folder || '')} | 📅 ${file.uploadedAtDisplay || ''}</div>
      <div id="lightboxImgViewport" style="position:relative; overflow:hidden; width:100%; height:60vh; background:#505050; border:2px inset #808080; display:flex; align-items:center; justify-content:center; user-select:none;">
        <img src="${fileUrl}" class="lightbox-img-win98" alt="${escapeHtml(file.name)}" style="max-width:100%; max-height:100%; transition:transform 0.05s ease-out; transform-origin:center center;" />
      </div>
      <div style="font-size:10px; color:#333; text-align:center; margin-top:4px; font-weight:bold;">💡 Zoom-Lupe: Mausrad zum Zoomen (50%-400%) | Doppelklick für 200% | Ziehen zum Verschieben | Buttons unten benutzen</div>
    `;
    setTimeout(initLightboxZoomEvents, 50);
  } else if (ext === 'pdf' && fileUrl) {
    body.innerHTML = `
      <div style="margin-bottom:6px; font-weight:bold; background:#d4d0c8; padding:4px 8px; border:1px solid #808080; font-size:11px; display:flex; justify-content:space-between; align-items:center;">
        <span>👤 Mitarbeiter: ${escapeHtml(displayName)} | 📂 Ordner: ${escapeHtml(file.folder || '')} | 📄 PDF Dokument</span>
        <a href="${fileUrl}" target="_blank" style="color:#000080; text-decoration:underline; font-weight:bold;">🔗 In neuem Tab öffnen</a>
      </div>
      <object data="${fileUrl}" type="application/pdf" style="width:100%; height:58vh; border:1px solid #808080;">
        <iframe src="https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true" style="width:100%; height:58vh; border:none;" title="PDF Preview">
          <div style="padding:20px; text-align:center;">
            <p>PDF-Vorschau kann nicht direkt eingebettet werden.</p>
            <a href="${fileUrl}" target="_blank" class="win98-btn">📄 PDF öffnen / herunterladen</a>
          </div>
        </iframe>
      </object>
    `;
  } else if (['txt', 'text', 'log', 'csv', 'md', 'json'].includes(ext) && fileUrl) {
    body.innerHTML = `
      <div style="margin-bottom:6px; font-weight:bold; background:#d4d0c8; padding:4px 8px; border:1px solid #808080; font-size:11px;">👤 Mitarbeiter: ${escapeHtml(displayName)} | 📂 Ordner: ${escapeHtml(file.folder || '')} | 📝 Textdokument</div>
      <div id="txtPreviewBox" style="background:#fff; border:2px inset #808080; padding:10px; font-family:'Courier New', monospace; font-size:12px; height:56vh; overflow-y:auto; white-space:pre-wrap; color:#000;">Lade Textinhalt vom Server...</div>
    `;
    fetch(fileUrl)
      .then(r => r.text())
      .then(txt => {
        const box = document.getElementById('txtPreviewBox');
        if (box) box.textContent = txt;
      })
      .catch(err => {
        const box = document.getElementById('txtPreviewBox');
        if (box) box.innerHTML = `<span style="color:red;">Fehler beim Laden des Textinhalts: ${escapeHtml(err.message)}</span>`;
      });
  } else {
    body.innerHTML = `
      <div style="padding:20px; text-align:center;">
        <p><b>${escapeHtml(file.name || '')}</b></p>
        <p>Keine direkte Vorschau im Fenster verfügbar.</p>
        ${fileUrl
          ? `<p><a href="${fileUrl}" target="_blank"><u>Klicken Sie hier zum Öffnen / Herunterladen</u></a></p>`
          : `<p style="color:#a00;">Dropbox-Link konnte nicht erstellt werden:<br/><code>${escapeHtml(linkError || 'unbekannter Fehler')}</code></p>`}
      </div>
    `;
  }

  if (downloadBtn) {
    downloadBtn.disabled = !fileUrl;
    downloadBtn.onclick = () => {
      if (!fileUrl) return;
      // Electronban a window.open csak akkor nyit ablakot, ha a main process
      // setWindowOpenHandler-e engedi – a <a download> minden környezetben megy.
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = file.name || '';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }
}

// ========================================================
// INTERACTIVE LIGHTBOX ZOOM, PAN & ROTATION TOOL
// ========================================================
let currentZoomScale = 1.0;
let currentRotateDeg = 0;
let currentPanX = 0;
let currentPanY = 0;
let isDraggingImg = false;
let startDragX = 0;
let startDragY = 0;

function resetImgZoomPan() {
  currentZoomScale = 1.0;
  currentRotateDeg = 0;
  currentPanX = 0;
  currentPanY = 0;
  applyImgTransform();
}

function applyImgTransform() {
  const img = document.querySelector('.lightbox-img-win98');
  const zoomDisplay = document.getElementById('zoomLevelDisplay');
  if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentZoomScale * 100)}%`;

  if (img) {
    img.style.transform = `translate(${currentPanX}px, ${currentPanY}px) scale(${currentZoomScale}) rotate(${currentRotateDeg}deg)`;
    img.style.cursor = currentZoomScale > 1.0 ? (isDraggingImg ? 'grabbing' : 'grab') : 'zoom-in';
  }
}

function initLightboxZoomEvents() {
  const container = document.getElementById('lightboxImgViewport');
  const img = document.querySelector('.lightbox-img-win98');
  if (!container || !img) return;

  // Mouse wheel zoom
  container.onwheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      currentZoomScale = Math.min(4.0, currentZoomScale + 0.25);
    } else {
      currentZoomScale = Math.max(0.5, currentZoomScale - 0.25);
      if (currentZoomScale <= 1.0) {
        currentPanX = 0;
        currentPanY = 0;
      }
    }
    applyImgTransform();
  };

  // Double click toggle zoom 100% <-> 200%
  img.ondblclick = (e) => {
    e.preventDefault();
    if (currentZoomScale === 1.0) {
      currentZoomScale = 2.0;
    } else {
      currentZoomScale = 1.0;
      currentPanX = 0;
      currentPanY = 0;
    }
    applyImgTransform();
  };

  // Drag pan when zoomed
  img.onmousedown = (e) => {
    if (e.button !== 0) return;
    isDraggingImg = true;
    startDragX = e.clientX - currentPanX;
    startDragY = e.clientY - currentPanY;
    if (img) img.style.cursor = 'grabbing';
  };

  window.onmousemove = (e) => {
    if (!isDraggingImg) return;
    currentPanX = e.clientX - startDragX;
    currentPanY = e.clientY - startDragY;
    applyImgTransform();
  };

  window.onmouseup = () => {
    if (isDraggingImg) {
      isDraggingImg = false;
      applyImgTransform();
    }
  };
}

// ========================================================
// NEUE UPLOADS SEIT DEM LETZTEN BESUCH (NEW UPLOADS TRACKER)
// ========================================================
function getSeenSnapshot() {
  try {
    const raw = localStorage.getItem('pmg_win98_seen_files_snapshot');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSeenSnapshot(paths) {
  try {
    localStorage.setItem('pmg_win98_seen_files_snapshot', JSON.stringify(paths || []));
  } catch (e) {}
}

function getNewFilesSinceLastView() {
  const snapshot = getSeenSnapshot();
  const allCurrentPaths = [];
  const newFiles = [];

  Object.keys(allUploadsData || {}).forEach(userKey => {
    const lowUser = String(userKey || '').toLowerCase();
    if (lowUser.includes('ausgeschieden') || lowUser.includes('system')) return;

    let resolvedName = userKey;
    const normKey = normName(userKey);
    const matched = usersByName[normKey];
    if (matched && matched.displayName) resolvedName = matched.displayName;

    const userFiles = allUploadsData[userKey] || [];
    userFiles.forEach(f => {
      if (!f.path) return;
      allCurrentPaths.push(f.path);

      if (snapshot && Array.isArray(snapshot)) {
        if (!snapshot.includes(f.path)) {
          newFiles.push({ ...f, userName: userKey, resolvedName });
        }
      }
    });
  });

  // If first time (no snapshot saved yet), initialize snapshot with current files
  if (snapshot === null) {
    saveSeenSnapshot(allCurrentPaths);
    return [];
  }

  return newFiles;
}

function updateNewUploadsBadge() {
  const badge = document.getElementById('newUploadsBadge');
  if (!badge) return;

  const newFiles = getNewFilesSinceLastView();
  if (newFiles.length > 0) {
    badge.textContent = `${newFiles.length}`;
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '0';
    badge.style.display = 'none';
  }
}

function openNewUploadsDialog() {
  const modal = document.getElementById('win98NewUploadsModal');
  const summaryEl = document.getElementById('newUploadsSummaryText');
  const container = document.getElementById('newUploadsListContainer');

  if (!modal) return;

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');

  const newFiles = getNewFilesSinceLastView();

  if (summaryEl) {
    summaryEl.textContent = newFiles.length > 0
      ? `✨ Es wurden ${newFiles.length} neue Upload(s) seit Ihrem letzten Besuch gefunden:`
      : `✔ Keine neuen Uploads seit dem letzten Besuch. (Alle Dokumente sind auf dem neuesten Stand)`;
  }

  if (!container) return;

  if (newFiles.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #808080; font-size: 12px;">
        ✔ Alle hochgeladenen Stundenzettel wurden bereits gesehen.
      </div>
    `;
    return;
  }

  let html = `
    <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff; border:1px solid #808080;">
      <thead>
        <tr style="background:#000080; color:#fff;">
          <th style="padding:4px; text-align:left; border:1px solid #808080;">Mitarbeiter</th>
          <th style="padding:4px; text-align:left; border:1px solid #808080;">Ordner (Monat)</th>
          <th style="padding:4px; text-align:left; border:1px solid #808080;">Dateiname</th>
          <th style="padding:4px; text-align:center; border:1px solid #808080;">Aktion</th>
        </tr>
      </thead>
      <tbody>
  `;

  newFiles.forEach((f, idx) => {
    html += `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f0f0f0'};">
        <td style="padding:4px; border:1px solid #808080;"><b>👤 ${escapeHtml(f.resolvedName || f.userName)}</b></td>
        <td style="padding:4px; border:1px solid #808080;">📂 ${escapeHtml(f.folder || '')}</td>
        <td style="padding:4px; border:1px solid #808080;">📄 ${escapeHtml(f.name || '')}</td>
        <td style="padding:4px; text-align:center; border:1px solid #808080;">
          <button class="win98-btn" onclick="openNewUploadFileByIndex(${idx})" style="font-size:10px; padding:1px 6px;">👁️ Vorschau</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // Store transient reference for openNewUploadFileByIndex
  window._activeNewFilesList = newFiles;
}

function openNewUploadFileByIndex(idx) {
  const list = window._activeNewFilesList || [];
  if (list[idx]) {
    openLightbox(list[idx]);
  }
}

function markNewUploadsAsRead() {
  const allCurrentPaths = [];
  Object.keys(allUploadsData || {}).forEach(userKey => {
    (allUploadsData[userKey] || []).forEach(f => {
      if (f.path) allCurrentPaths.push(f.path);
    });
  });

  saveSeenSnapshot(allCurrentPaths);
  updateNewUploadsBadge();

  const summaryEl = document.getElementById('newUploadsSummaryText');
  const container = document.getElementById('newUploadsListContainer');

  if (summaryEl) {
    summaryEl.textContent = '✔ Alle neuen Uploads wurden als gelesen markiert.';
  }
  if (container) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: green; font-size: 12px; font-weight: bold;">
        ✅ Snapshot aktualisiert! Alle aktuellen Dateien als gesehen markiert.
      </div>
    `;
  }
}

// SETUP EVENT LISTENERS
function setupEvents() {
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    sessionStorage.clear();
    localStorage.removeItem('pmg_win98_uploads_cache_v3');
    localStorage.removeItem('pmg_win98_uploads_cache_v4');
    localStorage.removeItem('pmg_win98_thumb_cache_v3');
    allUploadsData = {};
    const statusServer = document.getElementById('statusServer');
    if (statusServer) statusServer.textContent = 'Server: Cache geleert, lade neu…';
    fetchUploadsData(false);
    fetchStatusRegistry();
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

  document.getElementById('win98ModalPrintBtn')?.addEventListener('click', printCurrentLightboxFile);
  document.getElementById('win98ModalRenameBtn')?.addEventListener('click', handleRenameFile);

  document.getElementById('btnNewNote')?.addEventListener('click', openNoteDialog);
  document.getElementById('closeWin98NoteModal')?.addEventListener('click', () => {
    document.getElementById('win98NoteModal')?.classList.add('hidden');
  });
  document.getElementById('btnCancelNote')?.addEventListener('click', () => {
    document.getElementById('win98NoteModal')?.classList.add('hidden');
  });
  document.getElementById('btnSaveNoteSubmit')?.addEventListener('click', handleSaveNoteSubmit);

  document.getElementById('btnSelectAll')?.addEventListener('click', toggleSelectAllDisplayed);
  document.getElementById('btnPrint')?.addEventListener('click', printSelectedFiles);

  document.getElementById('btnCalendar')?.addEventListener('click', openCalendarDialog);
  document.getElementById('closeWin98CalendarModal')?.addEventListener('click', () => {
    document.getElementById('win98CalendarModal')?.classList.add('hidden');
  });
  document.getElementById('closeCalModalBtn')?.addEventListener('click', () => {
    document.getElementById('win98CalendarModal')?.classList.add('hidden');
  });
  document.getElementById('btnCalPrevMonth')?.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    const targetWorker = selectedUser || Object.keys(allUploadsData)[0] || '';
    renderCalendar(targetWorker, calCurrentDate.getFullYear(), calCurrentDate.getMonth());
  });
  document.getElementById('btnCalNextMonth')?.addEventListener('click', () => {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    const targetWorker = selectedUser || Object.keys(allUploadsData)[0] || '';
    renderCalendar(targetWorker, calCurrentDate.getFullYear(), calCurrentDate.getMonth());
  });

  // WORKER MANAGEMENT EVENT LISTENERS
  document.getElementById('btnManageUsers')?.addEventListener('click', openUsersManagerModal);
  document.getElementById('closeWin98UsersModal')?.addEventListener('click', () => {
    document.getElementById('win98UsersModal')?.classList.add('hidden');
  });
  document.getElementById('closeUsersModalBtn')?.addEventListener('click', () => {
    document.getElementById('win98UsersModal')?.classList.add('hidden');
  });
  document.getElementById('userMgrSearch')?.addEventListener('input', (e) => {
    renderUserMgrList(e.target.value);
  });
  document.getElementById('btnNewUserForm')?.addEventListener('click', resetUserEditForm);
  document.getElementById('btnSaveUserSubmit')?.addEventListener('click', () => handleSaveUserSubmit(false));
  document.getElementById('btnMarkInactiveUser')?.addEventListener('click', () => handleSaveUserSubmit(true));

  // NEW UPLOADS TRACKER EVENT LISTENERS
  document.getElementById('btnNewUploads')?.addEventListener('click', openNewUploadsDialog);
  document.getElementById('closeWin98NewUploadsModal')?.addEventListener('click', () => {
    document.getElementById('win98NewUploadsModal')?.classList.add('hidden');
  });
  document.getElementById('closeNewUploadsModalBtn')?.addEventListener('click', () => {
    document.getElementById('win98NewUploadsModal')?.classList.add('hidden');
  });
  document.getElementById('btnMarkNewUploadsAsRead')?.addEventListener('click', markNewUploadsAsRead);

  // LIGHTBOX ZOOM CONTROLS
  document.getElementById('btnZoomIn')?.addEventListener('click', () => {
    currentZoomScale = Math.min(4.0, currentZoomScale + 0.25);
    applyImgTransform();
  });
  document.getElementById('btnZoomOut')?.addEventListener('click', () => {
    currentZoomScale = Math.max(0.5, currentZoomScale - 0.25);
    if (currentZoomScale <= 1.0) {
      currentPanX = 0;
      currentPanY = 0;
    }
    applyImgTransform();
  });
  document.getElementById('btnZoomReset')?.addEventListener('click', resetImgZoomPan);
  document.getElementById('btnRotateImg')?.addEventListener('click', () => {
    currentRotateDeg = (currentRotateDeg + 90) % 360;
    applyImgTransform();
  });

  // GENERAL FILE UPLOAD EVENT LISTENERS
  document.getElementById('btnUploadFile')?.addEventListener('click', openUploadModal);
  document.getElementById('closeWin98UploadModal')?.addEventListener('click', () => {
    document.getElementById('win98UploadModal')?.classList.add('hidden');
  });
  document.getElementById('closeUploadModalBtn')?.addEventListener('click', () => {
    document.getElementById('win98UploadModal')?.classList.add('hidden');
  });
  document.getElementById('btnSubmitUpload')?.addEventListener('click', handleUploadSubmit);

  // CALENDAR WORKER NAVIGATION LISTENERS
  document.getElementById('btnCalPrevWorker')?.addEventListener('click', () => navigateCalWorker(-1));
  document.getElementById('btnCalNextWorker')?.addEventListener('click', () => navigateCalWorker(1));
  document.getElementById('calWorkerSelect')?.addEventListener('change', (e) => {
    selectedUser = e.target.value;
    renderCalendar(e.target.value, calCurrentDate.getFullYear(), calCurrentDate.getMonth());
  });

  // MAC THEME TOGGLE LISTENER
  document.getElementById('btnToggleMacTheme')?.addEventListener('click', toggleMacTheme);
  initTheme();
}

// MAC THEME FUNCTIONS
function initTheme() {
  const savedTheme = localStorage.getItem('pmg_theme') || 'win98';
  if (savedTheme === 'macos') {
    document.body.classList.add('macos-theme');
  } else {
    document.body.classList.remove('macos-theme');
  }
  updateThemeBtnText();
}

function toggleMacTheme() {
  const isMac = document.body.classList.toggle('macos-theme');
  localStorage.setItem('pmg_theme', isMac ? 'macos' : 'win98');
  updateThemeBtnText();
}

function updateThemeBtnText() {
  const txt = document.getElementById('themeToggleBtnText');
  if (txt) {
    txt.textContent = document.body.classList.contains('macos-theme') ? '💻 Win98 Theme' : '🍎 macOS Theme';
  }
}

// FETCH STATUS REGISTRY
async function fetchStatusRegistry() {
  try {
    const res = await fetch('/.netlify/functions/updateStatus');
    if (res.ok) {
      statusRegistry = await res.json();
      renderTree(allUploadsData);
    }
  } catch (e) {
    console.warn('[Status] fetch error:', e);
  }
}

// SAVE STATUS
async function saveStatus(key, status, note = '') {
  try {
    const res = await fetch('/.netlify/functions/updateStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, status, note })
    });
    if (res.ok) {
      const data = await res.json();
      statusRegistry[key] = data.statusData;
      renderTree(allUploadsData);
    }
  } catch (e) {
    console.error('[Status] save error:', e);
  }
}

// OPEN NOTE DIALOG
function openNoteDialog() {
  const modal = document.getElementById('win98NoteModal');
  const label = document.getElementById('noteTargetFolderLabel');
  const titleInput = document.getElementById('noteTitleInput');
  const textInput = document.getElementById('noteTextInput');
  const msg = document.getElementById('noteStatusMsg');

  if (!modal) return;

  modal.style.zIndex = '100000';

  let folderLabel = 'Stundenzettel 2026';
  if (selectedUser && selectedMonth) {
    folderLabel = `Stundenzettel 2026 / ${selectedUser} / ${selectedMonth}`;
  } else if (selectedUser) {
    folderLabel = `Stundenzettel 2026 / ${selectedUser}`;
  }

  if (label) label.textContent = `Ziel-Ordner (Cél mappa): ${folderLabel}`;
  if (titleInput) titleInput.value = '';
  if (textInput) textInput.value = '';
  if (msg) msg.textContent = '';

  modal.classList.remove('hidden');
}

// SAVE NOTE SUBMIT
async function handleSaveNoteSubmit() {
  const titleInput = document.getElementById('noteTitleInput');
  const textInput = document.getElementById('noteTextInput');
  const msg = document.getElementById('noteStatusMsg');
  const submitBtn = document.getElementById('btnSaveNoteSubmit');

  const noteTitle = (titleInput?.value || '').trim();
  const noteText = (textInput?.value || '').trim();

  if (!noteText) {
    if (msg) msg.textContent = '❌ Bitte Notiztext eingeben!';
    return;
  }

  let folderPath = '/PMG Mindenes - PMG ALLES/Stundenzettel 2026';
  if (selectedUser && selectedMonth) {
    folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel 2026/${selectedUser}/${selectedMonth}`;
  } else if (selectedUser) {
    folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel 2026/${selectedUser}`;
  }

  let customFileName = '';
  if (noteTitle) {
    customFileName = noteTitle;
    if (!customFileName.toLowerCase().endsWith('.txt')) {
      customFileName += '.txt';
    }
  }

  if (msg) msg.textContent = '⏳ Notiz wird gespeichert...';
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/saveNote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, noteText, fileName: customFileName })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (msg) msg.textContent = '✅ Notiz erfolgreich gespeichert!';
      setTimeout(() => {
        document.getElementById('win98NoteModal')?.classList.add('hidden');
        fetchUploadsData(false);
      }, 1000);
    } else {
      if (msg) msg.textContent = `❌ Fehler beim Speichern: ${data.message || 'Unbekannter Fehler'}`;
    }
  } catch (e) {
    if (msg) msg.textContent = `❌ Fehler: ${e.message}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ========================================================
// GENERAL FILE UPLOAD DIALOG (WIN98 UPLOAD MODAL)
// ========================================================
function openUploadModal() {
  console.log('[Upload] Opening win98UploadModal...');
  const modal = document.getElementById('win98UploadModal');
  const workerSelect = document.getElementById('uploadWorkerSelect');
  const monthSelect = document.getElementById('uploadMonthSelect');
  const targetLabel = document.getElementById('uploadTargetLabel');
  const nameInput = document.getElementById('uploadCustomNameInput');
  const fileInput = document.getElementById('uploadFileInputs');
  const statusMsg = document.getElementById('uploadStatusMsg');

  if (!modal) {
    console.error('[Upload] Error: win98UploadModal not found in DOM');
    return;
  }

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');

  if (nameInput) nameInput.value = '';
  if (fileInput) fileInput.value = '';
  if (statusMsg) {
    statusMsg.style.color = '#000080';
    statusMsg.textContent = '';
  }

  // Populate workers dropdown
  if (workerSelect) {
    workerSelect.innerHTML = '';
    const validUsers = Object.keys(allUploadsData || {}).filter(u => {
      const low = String(u || '').toLowerCase();
      return !low.includes('ausgeschieden') && !low.includes('system');
    });

    validUsers.forEach(u => {
      let dispName = u;
      const matched = usersByName[normName(u)];
      if (matched && matched.displayName) dispName = matched.displayName;
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = dispName;
      if (u === selectedUser) opt.selected = true;
      workerSelect.appendChild(opt);
    });
  }

  populateUploadMonths();
  workerSelect?.addEventListener('change', populateUploadMonths);

  function populateUploadMonths() {
    if (!monthSelect) return;
    monthSelect.innerHTML = '';
    const userKey = workerSelect?.value || selectedUser || '';
    const userFiles = allUploadsData[userKey] || [];
    const monthsSet = new Set(['8. August']);
    userFiles.forEach(f => {
      if (f.folder) monthsSet.add(f.folder);
    });

    const monthNamesDe = ['1. Januar', '2. Februar', '3. März', '4. April', '5. Mai', '6. Juni', '7. Juli', '8. August', '9. September', '10. Oktober', '11. November', '12. Dezember'];
    monthNamesDe.forEach(m => monthsSet.add(m));

    Array.from(monthsSet).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === selectedMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    });
  }

  if (targetLabel) {
    targetLabel.textContent = `Ziel: Stundenzettel 2026 / ${workerSelect?.value || selectedUser || '-'} / ${monthSelect?.value || selectedMonth || '-'}`;
  }
}

async function handleUploadSubmit() {
  const workerSelect = document.getElementById('uploadWorkerSelect');
  const monthSelect = document.getElementById('uploadMonthSelect');
  const docTypeSelect = document.getElementById('uploadDocTypeSelect');
  const customNameInput = document.getElementById('uploadCustomNameInput');
  const fileInput = document.getElementById('uploadFileInputs');
  const statusMsg = document.getElementById('uploadStatusMsg');
  const submitBtn = document.getElementById('btnSubmitUpload');

  const employeeName = workerSelect?.value || '';
  const selectedMonth = monthSelect?.value || '';
  const docType = docTypeSelect?.value || 'stunden';
  const customName = (customNameInput?.value || '').trim();
  const files = fileInput?.files || [];

  if (!employeeName || !selectedMonth) {
    if (statusMsg) {
      statusMsg.style.color = 'red';
      statusMsg.textContent = '❌ Bitte Mitarbeiter und Monat auswählen!';
    }
    return;
  }

  if (!files || files.length === 0) {
    if (statusMsg) {
      statusMsg.style.color = 'red';
      statusMsg.textContent = '❌ Bitte mindestens eine Datei auswählen!';
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (statusMsg) {
      statusMsg.style.color = '#000080';
      statusMsg.textContent = `⏳ Lade Datei ${i + 1} von ${files.length} hoch: "${file.name}"...`;
    }

    try {
      const formData = new FormData();
      formData.append('employeeName', employeeName);
      formData.append('selectedMonth', selectedMonth);
      formData.append('docType', docType);
      if (customName) formData.append('customName', customName);
      formData.append('file', file);

      const resp = await fetch('/.netlify/functions/upload', {
        method: 'POST',
        body: formData
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && (data.success || data.message)) {
        successCount++;
      } else {
        failCount++;
        console.warn('Upload failed:', data);
      }
    } catch (e) {
      failCount++;
      console.error('Upload error:', e);
    }
  }

  if (submitBtn) submitBtn.disabled = false;

  if (successCount > 0) {
    if (statusMsg) {
      statusMsg.style.color = 'green';
      statusMsg.textContent = `✅ ${successCount} Datei(en) erfolgreich hochgeladen!`;
    }
    setTimeout(() => {
      document.getElementById('win98UploadModal')?.classList.add('hidden');
      fetchUploadsData(false);
    }, 1200);
  } else {
    if (statusMsg) {
      statusMsg.style.color = 'red';
      statusMsg.textContent = `❌ Fehler beim Hochladen (${failCount} Datei(en) fehlgeschlagen).`;
    }
  }
}

// TOGGLE SELECT ALL / DESELECT ALL
function toggleSelectAllDisplayed() {
  const searchInput = document.getElementById('win98Search');
  const searchQuery = (searchInput?.value || '').toLowerCase().trim();

  let filesToDisplay = [];
  if (selectedUser) {
    const userFiles = allUploadsData[selectedUser] || [];
    filesToDisplay = userFiles.map(f => ({ ...f, userName: selectedUser }));
    if (selectedMonth) filesToDisplay = filesToDisplay.filter(f => f.folder === selectedMonth);
  } else {
    Object.keys(allUploadsData).forEach(u => {
      const uFiles = allUploadsData[u] || [];
      uFiles.forEach(f => filesToDisplay.push({ ...f, userName: u }));
    });
  }

  const allSelected = filesToDisplay.length > 0 && filesToDisplay.every(f => selectedFiles.has(f.path));

  if (allSelected) {
    filesToDisplay.forEach(f => selectedFiles.delete(f.path));
  } else {
    filesToDisplay.forEach(f => selectedFiles.add(f.path));
  }

  updateSelectAllLabel();
  renderFileGrid();
}

function updateSelectAllLabel() {
  const lbl = document.getElementById('selectAllLabel');
  if (lbl) {
    lbl.textContent = selectedFiles.size > 0 ? `Ausgewählt (${selectedFiles.size})` : 'Alle ausw.';
  }
}

function printCurrentLightboxFile() {
  if (!currentLightboxFile) {
    alert('Kein Dokument zum Drucken ausgewählt.');
    return;
  }
  printSelectedFiles([currentLightboxFile]);
}

async function handleRenameFile() {
  if (!currentLightboxFile || !currentLightboxFile.path) {
    alert('Keine Datei zum Umbenennen ausgewählt.');
    return;
  }

  const oldName = currentLightboxFile.name || '';
  const newName = prompt(`Neuen Dateinamen eingeben (${oldName}):`, oldName);

  if (!newName || newName.trim() === '' || newName.trim() === oldName) {
    return;
  }

  const fromPath = currentLightboxFile.path;
  const modalBody = document.getElementById('win98ModalBody');
  if (modalBody) {
    modalBody.innerHTML = `<div style="padding:20px; text-align:center; font-weight:bold;">⏳ Datei wird in Dropbox umbenannt...<br/>("${escapeHtml(oldName)}" ➔ "${escapeHtml(newName.trim())}")</div>`;
  }

  try {
    const res = await fetch('/.netlify/functions/renameFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPath, newName: newName.trim() })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ Datei erfolgreich umbenannt: "${newName.trim()}"`);
      document.getElementById('win98Modal')?.classList.add('hidden');
      sessionStorage.clear();
      localStorage.removeItem('pmg_win98_uploads_cache_v3');
      localStorage.removeItem('pmg_win98_uploads_cache_v4');
      localStorage.removeItem('pmg_win98_uploads_cache_v5');
      fetchUploadsData(false);
    } else {
      alert(`❌ Fehler beim Umbenennen: ${data.message || 'Unbekannter Fehler'}`);
      openLightbox(currentLightboxFile);
    }
  } catch (e) {
    console.error('Rename error:', e);
    alert(`❌ Fehler beim Umbenennen: ${e.message}`);
    openLightbox(currentLightboxFile);
  }
}

// BATCH TIME SHEET PRINTING
async function printSelectedFiles(overrideFilesList = null) {
  let filesToPrint = [];

  if (overrideFilesList && Array.isArray(overrideFilesList) && overrideFilesList.length > 0) {
    filesToPrint = overrideFilesList;
  } else if (selectedFiles.size > 0) {
    Object.keys(allUploadsData).forEach(u => {
      (allUploadsData[u] || []).forEach(f => {
        if (selectedFiles.has(f.path)) {
          filesToPrint.push({ ...f, userName: u });
        }
      });
    });
  } else {
    // If none checked, print all images in current view
    if (selectedUser) {
      const userFiles = allUploadsData[selectedUser] || [];
      filesToPrint = userFiles.map(f => ({ ...f, userName: selectedUser }));
      if (selectedMonth) filesToPrint = filesToPrint.filter(f => f.folder === selectedMonth);
    } else {
      Object.keys(allUploadsData).forEach(u => {
        (allUploadsData[u] || []).forEach(f => filesToPrint.push({ ...f, userName: u }));
      });
    }
  }

  // Filter only image files for time sheet paper printing
  filesToPrint = filesToPrint.filter(f => {
    const ext = (f.name || '').toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
  });

  if (filesToPrint.length === 0) {
    alert('Kein druckbares Stundenzettel-Bild ausgewählt!');
    return;
  }

  // Build print container
  let existingContainer = document.getElementById('printContainer');
  if (!existingContainer) {
    existingContainer = document.createElement('div');
    existingContainer.id = 'printContainer';
    document.body.appendChild(existingContainer);
  }

  existingContainer.innerHTML = `<div style="padding:20px; font-weight:bold; font-size:16px;">Bilder werden zum Drucken vorbereitet... (${filesToPrint.length} Stundenzettel)</div>`;

  // Fetch image links for all files
  const printPagesHtml = [];
  for (const f of filesToPrint) {
    let resolvedName = f.userName;
    const normKey = normName(f.userName);
    const matchedUser = usersByName[normKey];
    if (matchedUser && matchedUser.displayName) resolvedName = matchedUser.displayName;

    let fileUrl = thumbnailCache.get(f.path) || null;
    if (!fileUrl) {
      try {
        const resp = await fetch('/.netlify/functions/getFileLink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: f.path, fileId: f.id })
        });
        const json = await resp.json().catch(() => null);
        fileUrl = json?.url || json?.link || null;
      } catch (e) {}
    }

    if (fileUrl) {
      printPagesHtml.push(`
        <div class="print-page">
          <div class="print-page-header">
            PMG GmbH - Stundenzettel | ${escapeHtml(resolvedName)} | ${escapeHtml(f.folder || '')} | ${escapeHtml(f.name || '')}
          </div>
          <img src="${fileUrl}" alt="${escapeHtml(f.name)}" />
        </div>
      `);
    }
  }

  if (printPagesHtml.length === 0) {
    alert('Gültige Bildlinks konnten nicht zum Drucken abgerufen werden.');
    existingContainer.innerHTML = '';
    return;
  }

  existingContainer.innerHTML = printPagesHtml.join('');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      if (existingContainer) existingContainer.innerHTML = '';
    }, 1000);
  }, 500);
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

// WIN98 WORKER MONTHLY CALENDAR DIALOG
let calCurrentDate = new Date();
let calActiveFilesMap = [];

function populateCalWorkerSelect(activeWorker) {
  const select = document.getElementById('calWorkerSelect');
  if (!select) return;

  select.innerHTML = '';
  const validUsers = Object.keys(allUploadsData || {}).filter(u => {
    const low = String(u || '').toLowerCase();
    return !low.includes('ausgeschieden') && !low.includes('system');
  });

  validUsers.forEach(u => {
    let dispName = u;
    const normKey = normName(u);
    const matched = usersByName[normKey];
    if (matched && matched.displayName) dispName = matched.displayName;

    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = dispName;
    if (u === activeWorker) opt.selected = true;
    select.appendChild(opt);
  });
}

function navigateCalWorker(step) {
  const validUsers = Object.keys(allUploadsData || {}).filter(u => {
    const low = String(u || '').toLowerCase();
    return !low.includes('ausgeschieden') && !low.includes('system');
  });

  if (validUsers.length === 0) return;

  const currentSelect = document.getElementById('calWorkerSelect');
  const currentWorker = currentSelect?.value || selectedUser || validUsers[0];
  let currIdx = validUsers.indexOf(currentWorker);
  if (currIdx === -1) currIdx = 0;

  let newIdx = (currIdx + step + validUsers.length) % validUsers.length;
  const newWorker = validUsers[newIdx];

  if (currentSelect) currentSelect.value = newWorker;
  selectedUser = newWorker;
  renderCalendar(newWorker, calCurrentDate.getFullYear(), calCurrentDate.getMonth());
}

function openCalendarDialog() {
  console.log('[Calendar] Opening calendar dialog...');
  const modal = document.getElementById('win98CalendarModal');
  if (!modal) {
    console.error('[Calendar] Error: win98CalendarModal element not found in DOM!');
    return;
  }

  const validUsers = Object.keys(allUploadsData || {}).filter(u => {
    const low = String(u || '').toLowerCase();
    return !low.includes('ausgeschieden') && !low.includes('system');
  });

  const targetWorker = selectedUser || validUsers[0] || '';

  populateCalWorkerSelect(targetWorker);

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');
  renderCalendar(targetWorker, calCurrentDate.getFullYear(), calCurrentDate.getMonth());
}

function parseFileDateRangeAndType(file, targetYear, targetMonth) {
  const name = String(file.name || '').toLowerCase();
  
  // 1. Determine Type & Color Category
  let type = 'stunden'; // 🟢 Green default (Stundenzettel)
  if (/urlaub|urlaubs|szabadsag/i.test(name)) {
    type = 'urlaub'; // 🔵 Blue (Urlaub)
  } else if (/krank|beteg|krankschreibung/i.test(name)) {
    type = 'krank'; // 🟠 Orange (Krankenstand)
  }

  let startDay = null;
  let endDay = null;

  // Pattern A: Full YYYY-MM-DD or YYYY.MM.DD range e.g. 2026.08.14-2026.08.20 or 2026-08-14_2026-08-20
  const fullDateMatch = name.match(/(\d{4}[.\-_/]\d{1,2}[.\-_/]\d{1,2})\s*[-_~a]\s*(\d{4}[.\-_/]\d{1,2}[.\-_/]\d{1,2})/);
  if (fullDateMatch) {
    const d1 = new Date(fullDateMatch[1].replace(/[._]/g, '-'));
    const d2 = new Date(fullDateMatch[2].replace(/[._]/g, '-'));
    if (!isNaN(d1) && !isNaN(d2)) {
      startDay = d1.getDate();
      endDay = d2.getDate();
    }
  }

  // Pattern B: DD.MM to DD.MM range e.g. 14.08 - 20.08 or 14.8-20.8
  if (!startDay) {
    const dayMonthMatch = name.match(/(\d{1,2})\.(\d{1,2})\s*[-_~a]\s*(\d{1,2})\.(\d{1,2})/);
    if (dayMonthMatch) {
      startDay = parseInt(dayMonthMatch[1], 10);
      endDay = parseInt(dayMonthMatch[3], 10);
    }
  }

  // Pattern C: Simple day range e.g. 14-20 or 14_20 or 14 - 20
  if (!startDay) {
    const dayRangeMatch = name.match(/(?:^|[^\d])(\d{1,2})\s*[-_~]\s*(\d{1,2})(?:[^\d]|$)/);
    if (dayRangeMatch) {
      const d1 = parseInt(dayRangeMatch[1], 10);
      const d2 = parseInt(dayRangeMatch[2], 10);
      if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && d1 <= d2) {
        startDay = d1;
        endDay = d2;
      }
    }
  }

  // Pattern D: Single day number e.g. 14.jpg or 14
  if (!startDay) {
    const singleDayMatch = name.match(/(?:^|[^\d])(\d{1,2})(?:[^\d]|$)/);
    if (singleDayMatch) {
      const d = parseInt(singleDayMatch[1], 10);
      if (d >= 1 && d <= 31) {
        startDay = d;
        endDay = d;
      }
    }
  }

  // Fallback: Upload date if present
  if (!startDay && file.uploadedAt) {
    const dt = new Date(file.uploadedAt);
    if (!isNaN(dt) && dt.getMonth() === targetMonth) {
      startDay = dt.getDate();
      endDay = dt.getDate();
    }
  }

  if (!startDay) {
    startDay = 1;
    endDay = 1;
  }

  return { type, startDay, endDay };
}

function renderCalendar(userName, year, month) {
  const container = document.getElementById('calGridContainer');
  const monthLabel = document.getElementById('calMonthLabel');
  if (!container) return;

  calActiveFilesMap = [];

  const monthNamesDe = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  if (monthLabel) monthLabel.textContent = `${monthNamesDe[month]} ${year}`;

  if (!userName || !allUploadsData[userName]) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color:#808080;">Bitte wählen Sie einen Mitarbeiter in der linken Baumansicht aus!</div>`;
    return;
  }

  const userFiles = allUploadsData[userName] || [];
  const monthPattern = `${month + 1}.`; // e.g. "8." for August

  // Map each day (1..31) to files covering that day
  const dayCoverMap = {}; // dayNum -> array of { file, type, fileIdx }

  userFiles.forEach(f => {
    const folderLow = String(f.folder || '').toLowerCase();
    const targetMonthLow = monthNamesDe[month].toLowerCase();
    const isThisMonth = folderLow.startsWith(monthPattern) || folderLow.includes(targetMonthLow) || !f.folder;

    if (isThisMonth) {
      const parsed = parseFileDateRangeAndType(f, year, month);
      const fileIdx = calActiveFilesMap.length;
      calActiveFilesMap.push({ ...f, userName });

      const s = Math.max(1, Math.min(31, parsed.startDay));
      const e = Math.max(s, Math.min(31, parsed.endDay));

      for (let day = s; day <= e; day++) {
        if (!dayCoverMap[day]) dayCoverMap[day] = [];
        dayCoverMap[day].push({ file: f, type: parsed.type, fileIdx });
      }
    }
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  let startingDay = firstDay.getDay() - 1; // 0 = Mon
  if (startingDay === -1) startingDay = 6;

  let html = `
    <table class="win98-cal-table">
      <thead>
        <tr>
          <th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th><th>Sa</th><th>So</th>
        </tr>
      </thead>
      <tbody>
        <tr>
  `;

  let currentCol = 0;
  for (let i = 0; i < startingDay; i++) {
    html += `<td class="empty-day"></td>`;
    currentCol++;
  }

  for (let d = 1; d <= totalDays; d++) {
    if (currentCol === 7) {
      html += `</tr><tr>`;
      currentCol = 0;
    }

    const covers = dayCoverMap[d] || [];
    let cellStyle = '';
    let eventHtml = '';

    if (covers.length > 0) {
      const primaryType = covers.some(c => c.type === 'urlaub') ? 'urlaub'
                        : covers.some(c => c.type === 'krank') ? 'krank'
                        : 'stunden';

      if (primaryType === 'urlaub') {
        cellStyle = 'background: #d0e6ff; border: 1px solid #0055cc;';
      } else if (primaryType === 'krank') {
        cellStyle = 'background: #ffe6cc; border: 1px solid #ff8800;';
      } else {
        cellStyle = 'background: #e6ffe6; border: 1px solid #009933;';
      }

      const seenInCell = new Set();
      covers.forEach(c => {
        if (seenInCell.has(c.fileIdx)) return;
        seenInCell.add(c.fileIdx);

        const idx = c.fileIdx;
        let badgeCls = 'cal-uploaded';
        let badgeLabel = '🟢 Stundenzettel';
        if (c.type === 'urlaub') {
          badgeCls = 'cal-urlaub';
          badgeLabel = '🔵 Urlaub';
        } else if (c.type === 'krank') {
          badgeCls = 'cal-sick';
          badgeLabel = '🟠 Krank';
        }

        eventHtml += `<span class="cal-event-badge ${badgeCls}" title="${escapeHtml(c.file.name)}" onclick="event.stopPropagation(); openCalFileByIndex(${idx});">${badgeLabel}</span>`;
      });
    }

    html += `
      <td style="${cellStyle}">
        <div class="cal-day-num">${d}</div>
        ${eventHtml}
      </td>
    `;
    currentCol++;
  }

  while (currentCol < 7) {
    html += `<td class="empty-day"></td>`;
    currentCol++;
  }

  html += `</tr></tbody></table>`;
  container.innerHTML = html;
}

// ==========================================
// WORKER MANAGEMENT MODAL & GOOGLE SHEET SYNC
// ==========================================
let editingWorker = null; // null if creating new, or worker object if editing

function openUsersManagerModal() {
  const modal = document.getElementById('win98UsersModal');
  if (!modal) return;

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');

  renderUserMgrList();
  resetUserEditForm();
}

function renderUserMgrList(filterQuery = '') {
  const container = document.getElementById('userMgrList');
  const searchInput = document.getElementById('userMgrSearch');
  if (!container) return;

  const query = (filterQuery || searchInput?.value || '').toLowerCase().trim();

  let sortedUsers = [...allUsersMeta];
  if (sortedUsers.length === 0) {
    sortedUsers = Object.keys(allUploadsData).map(u => ({ id: u, displayName: u }));
  }

  sortedUsers.sort((a, b) => (a.displayName || a.id || '').localeCompare(b.displayName || b.id || '', undefined, { numeric: true, sensitivity: 'base' }));

  if (query) {
    sortedUsers = sortedUsers.filter(u => {
      const name = (u.displayName || u.id || '').toLowerCase();
      const comp = (u.company || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      return name.includes(query) || comp.includes(query) || phone.includes(query);
    });
  }

  if (sortedUsers.length === 0) {
    container.innerHTML = `<div style="padding:10px; color:#808080; text-align:center;">Keine Mitarbeiter gefunden.</div>`;
    return;
  }

  let html = '';
  sortedUsers.forEach(u => {
    const isInactive = (u.company || '').toLowerCase().includes('ausgeschieden');
    const badge = isInactive ? `<span style="color:#a00; font-weight:bold; font-size:10px;"> [Ausgeschieden]</span>` : '';
    const compStr = u.company ? `<div style="font-size:10px; color:#666;">Firma: ${escapeHtml(u.company)}</div>` : '';
    const isSelected = editingWorker && (editingWorker.id === u.id || editingWorker.displayName === u.displayName);
    const activeStyle = isSelected ? 'background:#000080; color:#fff;' : '';

    html += `
      <div class="user-mgr-item" data-id="${escapeHtml(u.id)}" style="padding:4px 6px; border-bottom:1px solid #e0e0e0; cursor:pointer; ${activeStyle}" onclick="selectWorkerForEdit('${escapeHtml(u.id)}')">
        <div style="font-weight:bold;">👤 ${escapeHtml(u.displayName || u.id)}${badge}</div>
        ${compStr}
      </div>
    `;
  });

  container.innerHTML = html;
}

function selectWorkerForEdit(workerId) {
  const worker = allUsersMeta.find(u => u.id === workerId || u.displayName === workerId) || { id: workerId, displayName: workerId };
  editingWorker = worker;

  const titleEl = document.getElementById('userFormTitle');
  if (titleEl) titleEl.textContent = `Mitarbeiter bearbeiten: ${worker.displayName || worker.id}`;

  const editIdEl = document.getElementById('editUserId');
  if (editIdEl) editIdEl.value = worker.id || worker.displayName || '';

  const editPinEl = document.getElementById('editUserPin');
  if (editPinEl) editPinEl.value = worker.pin || '';

  const editCompEl = document.getElementById('editUserCompany');
  if (editCompEl) editCompEl.value = worker.company || '';

  const editPhoneEl = document.getElementById('editUserPhone');
  if (editPhoneEl) editPhoneEl.value = worker.phone || '';

  const editEmailEl = document.getElementById('editUserEmail');
  if (editEmailEl) editEmailEl.value = worker.email || '';

  const editRoleEl = document.getElementById('editUserRole');
  if (editRoleEl) editRoleEl.value = worker.userRole || '';

  const editTypeEl = document.getElementById('editUserType');
  if (editTypeEl) editTypeEl.value = worker.userType || '';

  const editLangEl = document.getElementById('editUserLang');
  if (editLangEl) editLangEl.value = worker.userLang || '';

  const editMunkEl = document.getElementById('editUserMunkarend');
  if (editMunkEl) editMunkEl.value = worker.munkarend || '';

  const editBauEl = document.getElementById('editUserBaustelle');
  if (editBauEl) editBauEl.value = worker.baustelle || '';

  const editVorNameEl = document.getElementById('editUserVorarbeiterName');
  if (editVorNameEl) editVorNameEl.value = worker.vorarbeiterName || '';

  const editVorTelEl = document.getElementById('editUserVorarbeiterTelefon');
  if (editVorTelEl) editVorTelEl.value = worker.vorarbeiterTelefon || '';

  const msg = document.getElementById('userMgrStatusMsg');
  if (msg) msg.textContent = '';

  renderUserMgrList();
}

function resetUserEditForm() {
  editingWorker = null;
  const titleEl = document.getElementById('userFormTitle');
  if (titleEl) titleEl.textContent = '➕ Neuen Mitarbeiter erstellen';
  
  const form = document.getElementById('userEditForm');
  if (form) form.reset();

  const msg = document.getElementById('userMgrStatusMsg');
  if (msg) msg.textContent = '';

  const editIdEl = document.getElementById('editUserId');
  if (editIdEl) {
    editIdEl.value = '';
    editIdEl.focus();
  }

  renderUserMgrList();
}

async function handleSaveUserSubmit(isInactiveAction = false) {
  const msg = document.getElementById('userMgrStatusMsg');
  const saveBtn = document.getElementById('btnSaveUserSubmit');
  const inactiveBtn = document.getElementById('btnMarkInactiveUser');

  const id = editingWorker ? (editingWorker.id || editingWorker.displayName) : '';
  const newId = (document.getElementById('editUserId')?.value || '').trim();
  const pin = (document.getElementById('editUserPin')?.value || '').trim();
  const company = (document.getElementById('editUserCompany')?.value || '').trim();
  const phone = (document.getElementById('editUserPhone')?.value || '').trim();
  const email = (document.getElementById('editUserEmail')?.value || '').trim();
  const userRole = (document.getElementById('editUserRole')?.value || '').trim();
  const userType = (document.getElementById('editUserType')?.value || '').trim();
  const userLang = (document.getElementById('editUserLang')?.value || '').trim();
  const munkarend = (document.getElementById('editUserMunkarend')?.value || '').trim();
  const baustelle = (document.getElementById('editUserBaustelle')?.value || '').trim();
  const vorarbeiterName = (document.getElementById('editUserVorarbeiterName')?.value || '').trim();
  const vorarbeiterTelefon = (document.getElementById('editUserVorarbeiterTelefon')?.value || '').trim();

  let action = editingWorker ? 'update' : 'add';

  if (isInactiveAction) {
    action = 'set_inactive';
    if (!id && !newId) {
      if (msg) {
        msg.style.color = '#a00';
        msg.textContent = '❌ Bitte wählen Sie einen Mitarbeiter aus!';
      }
      return;
    }
    if (!confirm(`Möchten Sie "${newId || id}" wirklich als "Ausgeschieden" markieren?`)) {
      return;
    }
  } else {
    if (!newId) {
      if (msg) {
        msg.style.color = '#a00';
        msg.textContent = '❌ Név_ID (Mitarbeiter Name) ist erforderlich!';
      }
      document.getElementById('editUserId')?.focus();
      return;
    }
  }

  if (msg) {
    msg.style.color = '#000080';
    msg.textContent = '⏳ Mitarbeiterdaten werden in Google Sheets gespeichert...';
  }
  if (saveBtn) saveBtn.disabled = true;
  if (inactiveBtn) inactiveBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/saveUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        id: id || newId,
        newId,
        pin,
        userType,
        userLang,
        userRole,
        phone,
        email,
        company,
        munkarend,
        baustelle,
        vorarbeiterName,
        vorarbeiterTelefon
      })
    });

    const data = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
    if (res.ok && data.success) {
      if (msg) {
        msg.style.color = '#008000';
        msg.textContent = `✅ ${data.message || 'Erfolgreich gespeichert!'}`;
      }
      
      // Refresh Users metadata
      await fetchUsersMeta();
      renderUserMgrList();
      renderTree(allUploadsData);
      renderFileGrid();

      if (action === 'add') {
        resetUserEditForm();
      }
    } else {
      if (msg) {
        msg.style.color = '#a00';
        msg.textContent = `❌ Fehler: ${data.message || 'Speichern fehlgeschlagen'}`;
      }
    }
  } catch (e) {
    console.error('Save user error:', e);
    if (msg) {
      msg.style.color = '#a00';
      msg.textContent = `❌ Fehler: ${e.message}`;
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (inactiveBtn) inactiveBtn.disabled = false;
  }
}
