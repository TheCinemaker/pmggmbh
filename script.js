// --- DOM Elemek ---
const loginSection = document.getElementById('loginSection');
const uploadSection = document.getElementById('uploadSection');
const loginForm = document.getElementById('loginForm');
const uploadForm = document.getElementById('uploadForm');
const loginEmployeeSelect = document.getElementById('loginEmployeeName');
const pinCodeInput = document.getElementById('pinCode');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const loginStatus = document.getElementById('loginStatus');
const uploadStatus = document.getElementById('uploadStatus');
const welcomeMessage = document.getElementById('welcomeMessage');
const monthSelect = document.getElementById('monthSelect');
const absenceForm = document.getElementById('absenceForm');
const absenceMonthSelect = document.getElementById('absenceMonthSelect');
const absenceStatus = document.getElementById('absenceStatus')

// --- Állapotkezelés ---
let currentUser = null;

// --- Funkciók ---

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

// Felhasználói lista lekérése és a legördülő feltöltése
async function populateMonthList(userId) {
    const selects = [monthSelect, absenceMonthSelect];
    selects.forEach(sel => sel.innerHTML = '<option value="" disabled selected>Hónapok betöltése...</option>');
    
    try {
        const response = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Nem sikerült betölteni a hónapokat.');
        
        const folders = await response.json();
        
        if (folders.length === 0) {
            selects.forEach(sel => sel.innerHTML = '<option value="" disabled selected>Nincsenek mappák</option>');
            return;
        }

        // ABC sorrend helyett a hónapok száma szerinti sorrend
        folders.sort((a, b) => parseInt(a) - parseInt(b));
        
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
        
        currentUser = {
            id: userId,
            displayName: result.displayName,
        };
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

// Feltöltés kezelése
async function handleUpload(event) {
    event.preventDefault();
    const submitButton = document.getElementById('submitButton');
    submitButton.disabled = true;
    submitButton.textContent = 'Feltöltés folyamatban...';
    uploadStatus.textContent = '';
    uploadStatus.className = 'status';

    const formData = new FormData();
    formData.append('employeeName', currentUser.id); 
    formData.append('selectedMonth', document.getElementById('monthSelect').value);
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

async function populateMonthList(userId) {
    monthSelect.innerHTML = '<option value="" disabled selected>Hónapok betöltése...</option>';
    try {
        const response = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error('Nem sikerült betölteni a hónapokat.');
        
        const folders = await response.json();
        
        if (folders.length === 0) {
            monthSelect.innerHTML = '<option value="" disabled selected>Nincsenek mappák ehhez az évhez</option>';
            return;
        }

        monthSelect.innerHTML = ''; // Töröljük a "betöltés..." szöveget
        folders.sort().reverse().forEach(folderName => { // Legfrissebb hónap legyen elöl
            const option = document.createElement('option');
            option.value = folderName;
            option.textContent = folderName;
            monthSelect.appendChild(option);
        });

    } catch (error) {
        uploadStatus.className = 'status error';
        uploadStatus.textContent = `Hiba: ${error.message}`;
    }
}

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
        selectedMonth: document.getElementById('absenceMonthSelect').value,
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

// Kijelentkezés
function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    showScreen('login');
}

// --- Eseményfigyelők és Inicializálás ---

// Oldal betöltődésekor
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
    populateEmployeeList();
});

loginForm.addEventListener('submit', handleLogin);
uploadForm.addEventListener('submit', handleUpload);
logoutButton.addEventListener('click', handleLogout);
absenceForm.addEventListener('submit', handleAbsenceSubmit);
