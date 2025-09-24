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
const oralapSection = document.getElementById('oralapSection');
const sickProofUploadGroup = document.getElementById('sickProofUploadGroup');
const sickProofFile = document.getElementById('sickProofFile');
const absenceTypeSelect = document.getElementById('absenceType');

// --- Állapotkezelés ---
let currentUser = null;

// --- FUNKCIÓK ---

function showScreen(screenName) {
    loginSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    if (screenName === 'login') loginSection.classList.remove('hidden');
    else if (screenName === 'upload') uploadSection.classList.remove('hidden');
}

function updateUiForUserType(userType) {
    if (userType === 'nem_óralapos') {
        if (oralapSection) oralapSection.classList.add('hidden');
    } else {
        if (oralapSection) oralapSection.classList.remove('hidden');
    }
}

async function populateMonthList(userId) {
    const selects = [monthSelect, absenceMonthSelect, viewMonthSelect];
    selects.forEach(sel => { if(sel) sel.innerHTML = '<option value="" disabled selected>Hónapok betöltése...</option>'; });
    
    try {
        const response = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Hónapok betöltése sikertelen.');
        
        const folders = await response.json();
        
        selects.forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            if (folders.length === 0) {
                sel.innerHTML = '<option value="" disabled selected>Nincsenek mappák</option>';
            } else {
                folders.sort((a, b) => parseInt(b) - parseInt(a));
                folders.forEach(folderName => {
                    const option = document.createElement('option');
                    option.value = folderName;
                    option.textContent = folderName;
                    sel.appendChild(option);
                });
            }
        });
        fetchAndDisplayFiles();
    } catch (error) {
        if(uploadStatus) uploadStatus.textContent = `Hiba: ${error.message}`;
    }
}

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
        loginStatus.textContent = `Hiba: ${error.message}`;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = 'Belépés...';
    loginStatus.textContent = '';

    const userId = loginEmployeeSelect.value;
    const pin = pinCodeInput.value;
    if (!userId || !pin) {
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
        
        currentUser = { id: userId, displayName: result.displayName, type: result.userType };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        welcomeMessage.textContent = `Üdv, ${currentUser.displayName}!`;
        updateUiForUserType(currentUser.type);
        showScreen('upload');
        populateMonthList(currentUser.id);
        loginForm.reset();
    } catch (error) {
        loginStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Belépés';
    }
}

async function handleUpload(event) {
    event.preventDefault();
    const submitButton = document.getElementById('submitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Feltöltés folyamatban...';
    uploadStatus.textContent = '';

    const formData = new FormData();
    formData.append('employeeName', currentUser.id);
    formData.append('selectedMonth', monthSelect.value);
    formData.append('weekRange', document.getElementById('weekRange').value);
    formData.append('file', document.getElementById('fileInput').files[0]);

    try {
        const response = await fetch('/.netlify/functions/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        uploadStatus.textContent = 'Sikeres feltöltés!';
        uploadForm.reset();
    } catch (error) {
        uploadStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Feltöltés';
    }
}

async function handleAbsenceSubmit(event) {
    event.preventDefault();
    const submitButton = document.getElementById('absenceSubmitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Küldés...';
    absenceStatus.textContent = '';

    const startDateValue = document.getElementById('startDate').value;
    if (!startDateValue) {
        absenceStatus.textContent = 'Kérlek, add meg a kezdő dátumot.';
        submitButton.disabled = false;
        submitButton.textContent = 'Jelentés elküldése';
        return;
    }

    const startDate = new Date(startDateValue);
    const month = startDate.getMonth() + 1;
    const monthName = startDate.toLocaleString('de-DE', { month: 'long' });
    const selectedMonth = `${month}. ${monthName}`;
    
    const absenceType = absenceTypeSelect.value;
    let endpoint = '';
    let options = { method: 'POST' };

    if (absenceType === 'KRANK') {
        if (!sickProofFile.files || sickProofFile.files.length === 0) {
            absenceStatus.textContent = 'Betegség esetén kötelező igazolást feltölteni.';
            submitButton.disabled = false;
            submitButton.textContent = 'Jelentés elküldése';
            return;
        }
        endpoint = '/.netlify/functions/uploadSickProof';
        const formData = new FormData();
        formData.append('userId', currentUser.id);
        formData.append('selectedMonth', selectedMonth);
        formData.append('startDate', startDateValue);
        formData.append('endDate', document.getElementById('endDate').value);
        formData.append('file', sickProofFile.files[0]);
        options.body = formData;
    } else {
        endpoint = '/.netlify/functions/logAbsence';
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify({
            userId: currentUser.id,
            absenceType: absenceType,
            selectedMonth: selectedMonth,
            startDate: startDateValue,
            endDate: document.getElementById('endDate').value,
        });
    }
    
    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        absenceStatus.textContent = result.message;
        absenceForm.reset();
        handleAbsenceTypeChange(); // Visszaállítjuk az űrlapot
    } catch (error) {
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
        fileListContainer.innerHTML = '';

        if (files.length === 0) {
            fileListContainer.innerHTML = '<p>Nincsenek fájlok ebben a hónapban.</p>';
            return;
        }
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `<span class="file-item-name">${file.name}</span><a href="${file.link}" target="_blank" class="view-button">Megtekintés</a>`;
            fileListContainer.appendChild(fileItem);
        });
    } catch (error) {
        fileListContainer.innerHTML = `<p class="status error">${error.message}</p>`;
    }
}

function handleAbsenceTypeChange() {
    if (absenceTypeSelect.value === 'KRANK') {
        sickProofUploadGroup.classList.remove('hidden');
        sickProofFile.required = true;
    } else {
        sickProofUploadGroup.classList.add('hidden');
        sickProofFile.required = false;
    }
}

function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    showScreen('login');
}

// --- INICIALIZÁLÁS ---

document.addEventListener('DOMContentLoaded', () => {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        welcomeMessage.textContent = `Üdv, ${currentUser.displayName}!`;
        updateUiForUserType(currentUser.type);
        showScreen('upload');
        populateMonthList(currentUser.id);
    } else {
        showScreen('login');
        populateEmployeeList();
    }
});

// Eseményfigyelők
loginForm.addEventListener('submit', handleLogin);
uploadForm.addEventListener('submit', handleUpload);
logoutButton.addEventListener('click', handleLogout);
absenceForm.addEventListener('submit', handleAbsenceSubmit);
viewMonthSelect.addEventListener('change', fetchAndDisplayFiles);
absenceTypeSelect.addEventListener('change', handleAbsenceTypeChange);

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
