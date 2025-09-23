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
        
        currentUser = {
            id: userId,
            displayName: result.displayName,
        };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        welcomeMessage.textContent = `Üdv, ${currentUser.displayName}!`;
        showScreen('upload');
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
    formData.append('employeeName', currentUser.id); // A bejelentkezett felhasználó ID-ját küldjük!
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
    } else {
        showScreen('login');
    }
    populateEmployeeList();
});

loginForm.addEventListener('submit', handleLogin);
uploadForm.addEventListener('submit', handleUpload);
logoutButton.addEventListener('click', handleLogout);
