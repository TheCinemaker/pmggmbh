document.addEventListener('DOMContentLoaded', () => {
    // Ellenőrizzük, hogy admin van-e bejelentkezve
    const storedUser = sessionStorage.getItem('currentUser');
    if (!storedUser || JSON.parse(storedUser).role !== 'admin') {
        document.body.innerHTML = '<h1>Hozzáférés Megtagadva</h1><a href="index.html">Vissza a főoldalra</a>';
        return;
    }

    const userListContainer = document.getElementById('userListContainer');
    const nameFilter = document.getElementById('nameFilter');
    let allUploads = {};

    async function fetchAllUploads() {
  userListContainer.innerHTML = '<p>Adatok betöltése...</p>';
  try {
    const resp = await fetch('/.netlify/functions/getAllUploads?links=0'/*, {
      // ha használsz szerveroldali kulcsot:
      // headers: { 'x-admin-key': '***' }
    }*/);
    const text = await resp.text();
    if (!resp.ok) throw new Error(`(${resp.status}) ${text || 'Szerverhiba'}`);
    const data = text ? JSON.parse(text) : {};
    allUploads = data;
    renderList(data);
  } catch (err) {
    userListContainer.innerHTML = `<p class="status error">Hiba: ${err.message}</p>`;
  }
}

    
    function renderList(data) {
  userListContainer.innerHTML = '';
  const filterText = (nameFilter.value || '').toLowerCase();

  // Rendezett, szűrt user lista
  const users = Object.keys(data)
    .filter(u => u.toLowerCase().includes(filterText))
    .sort((a, b) => a.localeCompare(b, 'hu-HU'));

  users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'user-card';

    const files = Array.isArray(data[user]) ? data[user] : [];

    let fileListHTML = '<ul class="file-list">';
    if (files.length === 0) {
      fileListHTML += '<li class="empty">Nincs feltöltött fájl.</li>';
    } else {
      fileListHTML += files.map(file => `
        <li>
          <span class="file-icon">📄</span>
          <span class="file-name">${file.folder} / <strong>${file.name}</strong></span>
          <span class="file-date">${file.uploadedAtDisplay || ''}</span>
        </li>
      `).join('');
    }
    fileListHTML += '</ul>';

    card.innerHTML = `<h3>${user}</h3>${fileListHTML}`;
    userListContainer.appendChild(card);
  });

  // Ha nincs találat a szűrés után
  if (users.length === 0) {
    userListContainer.innerHTML = '<p class="status">Nincs találat a megadott szűrőre.</p>';
  }
}


    nameFilter.addEventListener('input', () => renderList(allUploads));
    fetchAllUploads();
});
