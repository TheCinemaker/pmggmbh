// --- DOM Elemek ---
const loginSection = document.getElementById('loginSection');
const uploadSection = document.getElementById('uploadSection');
const loginForm = document.getElementById('loginForm');
const uploadForm = document.getElementById('uploadForm');
const absenceForm = document.getElementById('absenceForm');
const loginEmployeeSelect = document.getElementById('loginEmployeeName');
const pinCodeInput = document.getElementById('pinCode');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const loginStatus = document.getElementById('loginStatus');
const uploadStatus = document.getElementById('uploadStatus');
const absenceStatus = document.getElementById('absenceStatus');
const welcomeMessage = document.getElementById('welcomeMessage');
const monthSelect = document.getElementById('monthSelect');
const absenceMonthSelect = document.getElementById('absenceMonthSelect');
const viewMonthSelect = document.getElementById('viewMonthSelect');
const fileListContainer = document.getElementById('fileListContainer');

// --- Állapotkezelés ---
let currentUser = null;

// --- FUNKCIÓK ---

// Megjeleníti a megfelelő képernyőt (login vagy upload)
function showScreen(screenName) {
    loginSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    if (screenName === 'login') {
        loginSection.classList.remove('hidden');
    } else if (screenName === 'upload') {
        uploadSection.classList.remove('hidden');
    }
}

// Hónap-listák feltöltése
async function populateMonthList(userId) {
    const selects = [monthSelect, absenceMonthSelect, viewMonthSelect];
    selects.forEach(sel => sel.innerHTML = '<option value="" disabled selected>Hónapok betöltése...</option>');
    
    try {
        const response = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Nem sikerült betölteni a hónapokat.');
        
        const folders = await response.json();
        
        if (folders.length === 0) {
            selects.forEach(sel => sel.innerHTML = '<option value="" disabled selected>Nincsenek mappák</option>');
            return;
        }

        folders.sort((a, b) => parseInt(b) - parseInt(a)); // Legfrissebb hónap legyen elöl
        
        selects.forEach(sel => {
            sel.innerHTML = '';
            folders.forEach(folderName => {
                const option = document.createElement('option');
                option.value = folderName;
                option.textContent = folderName;
                sel.appendChild(option);
            });
        });

    } catch (error) {
        uploadStatus.className = 'status error';
        uploadStatus.textContent = `Hiba: ${error.message}`;
    }
}

// Felhasználói lista lekérése és a legördülő feltöltése
async function populateEmployeeList() {
    try {
        const response = await fetch('/.netlify/functions/getUsers');
        if (!response.ok) throw new Error('Nem sikerült betölteni a felhasználókat.');
        const users = await response.json();
        
        users.sort((a, b) => a.displayName.localeCompare(b.displayName));

        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.displayName;
            loginEmployeeSelect.appendChild(option);
        });
    } catch (error) {
        loginStatus.className = 'status error';
        loginStatus.textContent = `Hiba: ${error.message}`;
    }
}

// Bejelentkezés kezelése
async function handleLogin(event) {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = 'Belépés...';
    loginStatus.textContent = '';

    const userId = loginEmployeeSelect.value;
    const pin = pinCodeInput.value;

    if (!userId || !pin) {
        loginStatus.className = 'status error';
        loginStatus.textContent = 'Kérlek, válassz nevet és adj meg PIN kódot.';
        loginButton.disabled = false;
        loginButton.textContent = 'Belépés';
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, pin }),
        });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.message);
        
        currentUser = { id: userId, displayName: result.displayName };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        welcomeMessage.textContent = `Üdv, ${currentUser.displayName}!`;
        showScreen('upload');
        populateMonthList(currentUser.id);
        loginForm.reset();

    } catch (error) {
        loginStatus.className = 'status error';
        loginStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Belépés';
    }
}

// Óralap feltöltés kezelése
async function handleUpload(event) {
    event.preventDefault();
    const submitButton = document.getElementById('submitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Feltöltés folyamatban...';
    uploadStatus.textContent = '';
    uploadStatus.className = 'status';

    const formData = new FormData();
    formData.append('employeeName', currentUser.id);
    formData.append('selectedMonth', monthSelect.value);
    formData.append('weekRange', document.getElementById('weekRange').value);
    formData.append('file', document.getElementById('fileInput').files[0]);

    try {
        const response = await fetch('/.netlify/functions/upload', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        uploadStatus.className = 'status success';
        uploadStatus.textContent = 'Sikeres feltöltés!';
        uploadForm.reset();

    } catch (error) {
        uploadStatus.className = 'status error';
        uploadStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Feltöltés';
    }
}

// Távollét jelentés kezelése
async function handleAbsenceSubmit(event) {
    event.preventDefault();
    const submitButton = document.getElementById('absenceSubmitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Küldés...';
    absenceStatus.textContent = '';
    absenceStatus.className = 'status';

    const payload = {
        userId: currentUser.id,
        absenceType: document.getElementById('absenceType').value,
        selectedMonth: absenceMonthSelect.value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
    };

    try {
        const response = await fetch('/.netlify/functions/logAbsence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        absenceStatus.className = 'status success';
        absenceStatus.textContent = result.message;
        absenceForm.reset();

    } catch (error) {
        absenceStatus.className = 'status error';
        absenceStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Jelentés elküldése';
    }
}

async function fetchAndDisplayFiles() {
    const selectedMonth = viewMonthSelect.value;
    if (!selectedMonth || !currentUser) return;

    fileListContainer.innerHTML = '<p>Fájlok betöltése...</p>';

    try {
        const response = await fetch(`/.netlify/functions/getFiles?userId=${encodeURIComponent(currentUser.id)}&selectedMonth=${encodeURIComponent(selectedMonth)}`);
        if (!response.ok) throw new Error('Hiba a fájlok lekérésekor.');
        
        const files = await response.json();
        fileListContainer.innerHTML = ''; // Töröljük a "betöltés..." szöveget

        if (files.length === 0) {
            fileListContainer.innerHTML = '<p>Nincsenek fájlok ebben a hónapban.</p>';
            return;
        }

        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-item-name">${file.name}</span>
                <a href="${file.link}" target="_blank" class="view-button">Megtekintés</a>
            `;
            fileListContainer.appendChild(fileItem);
        });

    } catch (error) {
        fileListContainer.innerHTML = `<p class="status error">${error.message}</p>`;
    }
}

// Kijelentkezés
function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    showScreen('login');
}

// --- INICIALIZÁLÁS ---

// Oldal betöltődésekor lefutó kód
document.addEventListener('DOMContentLoaded', () => {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        welcomeMessage.textContent = `Üdv, ${currentUser.displayName}!`;
        showScreen('upload');
        populateMonthList(currentUser.id);
    } else {
        showScreen('login');
    }
    // A felhasználói listát csak akkor töltjük be, ha a login képernyőn vagyunk
    if (!storedUser) {
        populateEmployeeList();
    }
});

// Eseményfigyelők
loginForm.addEventListener('submit', handleLogin);
uploadForm.addEventListener('submit', handleUpload);
logoutButton.addEventListener('click', handleLogout);
absenceForm.addEventListener('submit', handleAbsenceSubmit);
viewMonthSelect.addEventListener('change', fetchAndDisplayFiles);

/*
// =======================================================
// PWA Service Worker - ÉLESÍTÉSKOR KOMMENTET KIVENNI!
// =======================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker sikeresen regisztrálva:', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker regisztráció sikertelen:', err);
      });
  });
}
*/
