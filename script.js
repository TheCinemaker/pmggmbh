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
const adminButton = document.getElementById('adminButton');

// --- Állapotkezelés ---
let currentUser = null;

// --- I18N SZÓTÁR ---
const translations = {
    hu: {
        loginTitle: "LOGIN PAGE",
        nameLabel: "Name:",
        pinLabel: "PIN CODE:",
        selectFromList: "select your name...",
        loginButton: "SIGN IN",
        loginButtonLoading: "Signing in...",
        logoutTitle: "Kijelentkezés",
        welcome: "Üdv,",
        timesheetUploadTitle: "Óralap Feltöltése",
        targetMonthLabel: "Cél hónap:",
        daysLabel: "Napok (pl. 5-9 vagy 30)",
        timesheetFileLabel: "Óralap (kép vagy PDF):",
        uploadButton: "Feltöltés",
        uploadButtonLoading: "Feltöltés...",
        absenceReportTitle: "Távolmaradás Jelentése",
        typeLabel: "Típus:",
        absenceTypeVacation: "Szabadság (Urlaub)",
        absenceTypeSick: "Betegség (Krank)",
        absenceTypeUnpaid: "Fizetés nélküli (Unbezahlt)",
        startDateLabel: "Kezdő dátum:",
        endDateLabel: "Záró dátum:",
        sickProofLabel: "Orvosi igazolás feltöltése:",
        reportButton: "Jelentés elküldése",
        reportButtonLoading: "Küldés...",
        viewFilesTitle: "Feltöltött Fájlok",
        viewMonthLabel: "Hónap megtekintése:",
        loadingMonths: "Hónapok betöltése...",
        noFolders: "Nincsenek mappák",
        loadingFiles: "Fájlok betöltése...",
        noFiles: "Nincsenek fájlok ebben a hónapban.",
        viewButton: "Megtekintés",
        errorLoadingUsers: "Nem sikerült betölteni a felhasználókat.",
        errorLoadingMonths: "Hónapok betöltése sikertelen.",
        errorLoadingFiles: "Hiba a fájlok lekérésekor.",
        errorMissingPin: "Kérlek, válassz nevet és adj meg PIN kódot.",
        errorMissingStartDate: "Kérlek, add meg a kezdő dátumot.",
        errorMissingSickProof: "Betegség esetén kötelező igazolást feltölteni.",
        uploadSuccess: "Sikeres feltöltés!",
        absenceSuccess: "Távollét sikeresen rögzítve!",
        sickProofSuccess: "Táppénzes igazolás sikeresen feltöltve!",
    },
    pl: {
        // ... (lengyel fordítások)
    },
    de: {
        // ... (német fordítások)
    }
};

// --- FUNKCIÓK ---

function showToast(message, type = 'success') {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    Toast.fire({
        icon: type,
        title: message
    });
}

function setLanguage(lang = 'hu') {
    const langDict = translations[lang] || translations['hu'];
    document.querySelectorAll('[data-translate-key]').forEach(element => {
        const key = element.getAttribute('data-translate-key');
        if (langDict[key]) {
            element.textContent = langDict[key];
        }
    });
    if (logoutButton) logoutButton.title = langDict.logoutTitle;
}

function showScreen(screenName) {
    loginSection.classList.add('hidden');
    uploadSection.classList.add('hidden');
    if (screenName === 'login') loginSection.classList.remove('hidden');
    else if (screenName === 'upload') uploadSection.classList.remove('hidden');
}

function updateUiForUserType(userType) {
    const type = (userType || 'oralapos').trim().toLowerCase();
    if (type === 'nem_oralapos') {
        if (oralapSection) oralapSection.classList.add('hidden');
    } else {
        if (oralapSection) oralapSection.classList.remove('hidden');
    }
}

function updateUiForUserRole(userRole) {
    const role = (userRole || 'user').trim().toLowerCase();
    if (role === 'admin') {
        if (adminButton) adminButton.classList.remove('hidden');
    } else {
        if (adminButton) adminButton.classList.add('hidden');
    }
}

async function fetchAndDisplayFiles() {
    if (!viewMonthSelect) return;
    const selectedMonth = viewMonthSelect.value;
    const lang = (currentUser && currentUser.lang) || 'hu';
    if (!selectedMonth || !currentUser) {
        fileListContainer.innerHTML = '';
        return;
    };
    fileListContainer.innerHTML = `<p>${translations[lang].loadingFiles}</p>`;

    try {
        const response = await fetch(`/.netlify/functions/getFiles?userId=${encodeURIComponent(currentUser.id)}&selectedMonth=${encodeURIComponent(selectedMonth)}`);
        if (!response.ok) throw new Error(translations[lang].errorLoadingFiles);
        const files = await response.json();
        fileListContainer.innerHTML = '';

        if (files.length === 0) {
            fileListContainer.innerHTML = `<p>${translations[lang].noFiles}</p>`;
            return;
        }
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `<span class="file-item-name">${file.name}</span><a href="${file.link}" target="_blank" class="view-button">${translations[lang].viewButton}</a>`;
            fileListContainer.appendChild(fileItem);
        });
    } catch (error) {
        fileListContainer.innerHTML = `<p class="status error">${error.message}</p>`;
    }
}

async function populateMonthList(userId) {
    const lang = (currentUser && currentUser.lang) || 'hu';
    const selects = [monthSelect, absenceMonthSelect, viewMonthSelect];
    selects.forEach(sel => { if(sel) sel.innerHTML = `<option value="" disabled selected>${translations[lang].loadingMonths}</option>`; });
    
    try {
        const response = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error(translations[lang].errorLoadingMonths);
        const folders = await response.json();
        
        selects.forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            if (folders.length === 0) {
                sel.innerHTML = `<option value="" disabled selected>${translations[lang].noFolders}</option>`;
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
        fetchAndDisplayFiles(); // Automatikusan betöltjük az első hónap fájljait
    } catch (error) {
        if(uploadStatus) showToast(`Hiba: ${error.message}`, 'error');
    }
}

async function populateEmployeeList() {
    try {
        const response = await fetch('/.netlify/functions/getUsers');
        if (!response.ok) throw new Error(translations['hu'].errorLoadingUsers);
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
    const lang = 'hu';
    loginButton.disabled = true;
    loginButton.textContent = translations[lang].loginButtonLoading;
    loginStatus.textContent = '';

    const userId = loginEmployeeSelect.value;
    const pin = pinCodeInput.value;
    if (!userId || !pin) {
        loginStatus.textContent = translations[lang].errorMissingPin;
        loginButton.disabled = false;
        loginButton.textContent = translations[lang].loginButton;
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
        
        currentUser = { id: userId, displayName: result.displayName, type: result.userType, lang: result.userLang, role: result.userRole };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // JAVÍTÁS: HELYES SORREND
        const userLang = currentUser.lang || 'hu';
        setLanguage(userLang); // 1. Nyelv beállítása
        welcomeMessage.textContent = `${translations[userLang].welcome} ${currentUser.displayName}!`; // 2. Üdvözlés a helyes nyelven
        
        updateUiForUserType(currentUser.type);
        updateUiForUserRole(currentUser.role);
        showScreen('upload');
        populateMonthList(currentUser.id);
        loginForm.reset();
    } catch (error) {
        loginStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = translations[lang].loginButton;
    }
}
async function handleUpload(event) {
  event.preventDefault();
  const submitButton = document.getElementById('submitButton');
  const lang = (currentUser && currentUser.lang) || 'hu';

  submitButton.disabled = true;
  submitButton.textContent = translations[lang].uploadButtonLoading;
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

    showToast(translations[lang].uploadSuccess, 'success');
    uploadForm.reset();
    fetchAndDisplayFiles(); // Frissítjük a fájllistát feltöltés után
  } catch (error) {
    showToast(`Hiba: ${error.message}`, 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = translations[lang].uploadButton;
  }
}


async function handleAbsenceSubmit(event) {
    event.preventDefault();
    const submitButton = document.getElementById('absenceSubmitButton');
    const lang = (currentUser && currentUser.lang) || 'hu';
    submitButton.disabled = true;
    submitButton.textContent = translations[lang].reportButtonLoading;
    absenceStatus.textContent = '';

    const startDateValue = document.getElementById('startDate').value;
    if (!startDateValue) {
        showToast(translations[lang].errorMissingStartDate, 'error');
        submitButton.disabled = false;
        submitButton.textContent = translations[lang].reportButton;
        return;
    }

    const startDate = new Date(startDateValue);
    const month = startDate.getMonth() + 1;
    const monthName = startDate.toLocaleString('de-DE', { month: 'long' });
    const selectedMonth = `${month}. ${monthName}`;
    const absenceType = absenceTypeSelect.value;
    let endpoint = '';
    let options = { method: 'POST' };
    let successMessageKey = 'absenceSuccess';

    if (absenceType === 'KRANK') {
        if (!sickProofFile.files || sickProofFile.files.length === 0) {
            showToast(translations[lang].errorMissingSickProof, 'error');
            submitButton.disabled = false;
            submitButton.textContent = translations[lang].reportButton;
            return;
        }
        endpoint = '/.netlify/functions/uploadSickProof';
        successMessageKey = 'sickProofSuccess';
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

        const successMsg = translations[lang][successMessageKey];
        showToast(successMsg, 'success');
        absenceForm.reset();
        handleAbsenceTypeChange();
        fetchAndDisplayFiles(); // Frissítjük a fájllistát
    } catch (error) {
        showToast(`Hiba: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = translations[lang].reportButton;
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
    setLanguage('hu');
}

// --- INICIALIZÁLÁS ---

document.addEventListener('DOMContentLoaded', () => {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        
        // JAVÍTÁS: HELYES SORREND
        const lang = currentUser.lang || 'hu';
        setLanguage(lang); // 1. Nyelv beállítása
        welcomeMessage.textContent = `${translations[lang].welcome} ${currentUser.displayName}!`; // 2. Üdvözlés a helyes nyelven
        
        updateUiForUserType(currentUser.type);
        updateUiForUserRole(currentUser.role);
        showScreen('upload');
        populateMonthList(currentUser.id);
    } else {
        setLanguage('hu');
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
