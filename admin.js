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
        const filterText = nameFilter.value.toLowerCase();

        for (const user in data) {
            if (user.toLowerCase().includes(filterText)) {
                const card = document.createElement('div');
                card.className = 'user-card';
                
                let fileListHTML = '<ul class="file-list">';
                if (data[user].length === 0) {
                    fileListHTML += '<li>Nincs feltöltött fájl.</li>';
                } else {
                    data[user].forEach(file => {
                       fileListHTML += `<li>${file.folder} / <strong>${file.name}</strong></li>`;
                    });
                }
                fileListHTML += '</ul>';

                card.innerHTML = `<h3>${user}</h3>${fileListHTML}`;
                userListContainer.appendChild(card);
            }
        }
    }

    nameFilter.addEventListener('input', () => renderList(allUploads));
    fetchAllUploads();
});
