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

// --- I18N SZÓTÁR ---
const translations = {
    hu: {
        loginTitle: "LOGIN PAGE",
        nameLabel: "Name:",
        pinLabel: "PIN CODE:",
        selectFromList: "select your name...",
        loginButton: "SIGN IN",
        loginButtonLoading: "Singing...",
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
        loginTitle: "Logowanie",
        nameLabel: "Imię i nazwisko:",
        pinLabel: "Kod PIN:",
        selectFromList: "Wybierz z listy...",
        loginButton: "Zaloguj się",
        loginButtonLoading: "Logowanie...",
        logoutTitle: "Wyloguj się",
        welcome: "Witaj,",
        timesheetUploadTitle: "Przesyłanie Karty Godzin",
        targetMonthLabel: "Miesiąc docelowy:",
        daysLabel: "Dni (np. 5-9 lub 30)",
        timesheetFileLabel: "Karta godzin (obraz lub PDF):",
        uploadButton: "Prześlij",
        uploadButtonLoading: "Przesyłanie...",
        absenceReportTitle: "Zgłoś nieobecność",
        typeLabel: "Typ:",
        absenceTypeVacation: "Urlop (Urlaub)",
        absenceTypeSick: "Chorobowe (Krank)",
        absenceTypeUnpaid: "Urlop bezpłatny (Unbezahlt)",
        startDateLabel: "Data rozpoczęcia:",
        endDateLabel: "Data zakończenia:",
        sickProofLabel: "Prześlij zwolnienie lekarskie:",
        reportButton: "Wyślij zgłoszenie",
        reportButtonLoading: "Wysyłanie...",
        viewFilesTitle: "Wyświetl przesłane pliki",
        viewMonthLabel: "Wyświetl miesiąc:",
        loadingMonths: "Ładowanie miesięcy...",
        noFolders: "Brak folderów",
        loadingFiles: "Ładowanie plików...",
        noFiles: "Brak plików w tym miesiącu.",
        viewButton: "Zobacz",
        errorLoadingUsers: "Nie udało się załadować użytkowników.",
        errorLoadingMonths: "Ładowanie miesięcy nie powiodło się.",
        errorLoadingFiles: "Błąd podczas pobierania plików.",
        errorMissingPin: "Proszę wybrać imię i podać kod PIN.",
        errorMissingStartDate: "Proszę podać datę rozpoczęcia.",
        errorMissingSickProof: "W przypadku choroby wymagane jest zaświadczenie.",
        uploadSuccess: "Przesyłanie zakończone pomyślnie!",
        absenceSuccess: "Nieobecność została pomyślnie zarejestrowana!",
        sickProofSuccess: "Zwolnienie lekarskie zostało pomyślnie przesłane!",
    },
    de: {
        loginTitle: "Anmeldung",
        nameLabel: "Name:",
        pinLabel: "PIN-Code:",
        selectFromList: "Bitte aus der Liste wählen...",
        loginButton: "Anmelden",
        loginButtonLoading: "Anmelden...",
        logoutTitle: "Abmelden",
        welcome: "Willkommen,",
        timesheetUploadTitle: "Stundenzettel Hochladen",
        targetMonthLabel: "Zielmonat:",
        daysLabel: "Tage (z.B. 5-9 oder 30)",
        timesheetFileLabel: "Stundenzettel (Bild oder PDF):",
        uploadButton: "Hochladen",
        uploadButtonLoading: "Hochladen...",
        absenceReportTitle: "Abwesenheit Melden",
        typeLabel: "Typ:",
        absenceTypeVacation: "Urlaub",
        absenceTypeSick: "Krankenstand",
        absenceTypeUnpaid: "Unbezahlter Urlaub",
        startDateLabel: "Startdatum:",
        endDateLabel: "Enddatum:",
        sickProofLabel: "Ärztliche Bestätigung hochladen:",
        reportButton: "Meldung Senden",
        reportButtonLoading: "Senden...",
        viewFilesTitle: "Hochgeladene Dateien Anzeigen",
        viewMonthLabel: "Monat anzeigen:",
        loadingMonths: "Monate werden geladen...",
        noFolders: "Keine Ordner vorhanden",
        loadingFiles: "Dateien werden geladen...",
        noFiles: "Keine Dateien in diesem Monat.",
        viewButton: "Ansehen",
        errorLoadingUsers: "Benutzer konnten nicht geladen werden.",
        errorLoadingMonths: "Fehler beim Laden der Monate.",
        errorLoadingFiles: "Fehler beim Abrufen der Dateien.",
        errorMissingPin: "Bitte Namen auswählen und PIN eingeben.",
        errorMissingStartDate: "Bitte geben Sie das Startdatum ein.",
        errorMissingSickProof: "Im Krankheitsfall ist eine Bestätigung erforderlich.",
        uploadSuccess: "Erfolgreich hochgeladen!",
        absenceSuccess: "Abwesenheit erfolgreich gemeldet!",
        sickProofSuccess: "Ärztliche Bestätigung erfolgreich hochgeladen!",
    }
};

// --- FUNKCIÓK ---

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
    const type = userType ? userType.trim().toLowerCase() : 'oralapos';
    if (type === 'nem_oralapos') {
        if (oralapSection) oralapSection.classList.add('hidden');
    } else {
        if (oralapSection) oralapSection.classList.remove('hidden');
    }
}

async function populateMonthList(userId) {
    const lang = currentUser.lang || 'hu';
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
        fetchAndDisplayFiles();
    } catch (error) {
        if(uploadStatus) uploadStatus.textContent = `Hiba: ${error.message}`;
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
    loginButton.disabled = true;
    loginButton.textContent = translations['hu'].loginButtonLoading;
    loginStatus.textContent = '';

    const userId = loginEmployeeSelect.value;
    const pin = pinCodeInput.value;
    if (!userId || !pin) {
        loginStatus.textContent = translations['hu'].errorMissingPin;
        loginButton.disabled = false;
        loginButton.textContent = translations['hu'].loginButton;
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
        
        currentUser = { id: userId, displayName: result.displayName, type: result.userType, lang: result.userLang };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        setLanguage(currentUser.lang);
        welcomeMessage.textContent = `${translations[currentUser.lang].welcome} ${currentUser.displayName}!`;
        updateUiForUserType(currentUser.type);
        showScreen('upload');
        populateMonthList(currentUser.id);
        loginForm.reset();
    } catch (error) {
        loginStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = translations['hu'].loginButton;
    }
}

async function handleUpload(event) {
    event.preventDefault();
    const submitButton = document.getElementById('submitButton');
    const lang = currentUser.lang || 'hu';
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
        
        uploadStatus.textContent = translations[lang].uploadSuccess;
        uploadForm.reset();
    } catch (error) {
        uploadStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = translations[lang].uploadButton;
    }
}

async function handleAbsenceSubmit(event) {
    event.preventDefault();
    const submitButton = document.getElementById('absenceSubmitButton');
    const lang = currentUser.lang || 'hu';
    submitButton.disabled = true;
    submitButton.textContent = translations[lang].reportButtonLoading;
    absenceStatus.textContent = '';

    const startDateValue = document.getElementById('startDate').value;
    if (!startDateValue) {
        absenceStatus.textContent = translations[lang].errorMissingStartDate;
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
            absenceStatus.textContent = translations[lang].errorMissingSickProof;
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

        absenceStatus.textContent = translations[lang][successMessageKey];
        absenceForm.reset();
        handleAbsenceTypeChange();
    } catch (error) {
        absenceStatus.textContent = `Hiba: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = translations[lang].reportButton;
    }
}

async function fetchAndDisplayFiles() {
    const selectedMonth = viewMonthSelect.value;
    const lang = currentUser.lang || 'hu';
    if (!selectedMonth || !currentUser) return;
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
        
        // JAVÍTÁS: Ellenőrizzük a nyelvet, mielőtt használnánk
        const lang = currentUser.lang || 'hu';
        const langDict = translations[lang] || translations['hu'];

        setLanguage(lang);
        welcomeMessage.textContent = `${langDict.welcome} ${currentUser.displayName}!`;
        
        updateUiForUserType(currentUser.type);
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
