// --- DOM Elemek ---
const loginSection            = document.getElementById('loginSection');
const uploadSection           = document.getElementById('uploadSection');
const loginForm               = document.getElementById('loginForm');
const uploadForm              = document.getElementById('uploadForm');
const absenceForm             = document.getElementById('absenceForm');
const loginEmployeeSelect     = document.getElementById('loginEmployeeName');
const pinCodeInput            = document.getElementById('pinCode');
const loginButton             = document.getElementById('loginButton');
const logoutButton            = document.getElementById('logoutButton');
const loginStatus             = document.getElementById('loginStatus');
const uploadStatus            = document.getElementById('uploadStatus');
const absenceStatus           = document.getElementById('absenceStatus');
const welcomeMessage          = document.getElementById('welcomeMessage');
const monthSelect             = document.getElementById('monthSelect');
const absenceMonthSelect      = document.getElementById('absenceMonthSelect');
const viewMonthSelect         = document.getElementById('viewMonthSelect');
const fileListContainer       = document.getElementById('fileListContainer');
const oralapSection           = document.getElementById('oralapSection');
const sickProofUploadGroup    = document.getElementById('sickProofUploadGroup');
const sickProofFile           = document.getElementById('sickProofFile');
const absenceTypeSelect       = document.getElementById('absenceType');
const adminButton             = document.getElementById('adminButton');
const languageSelect          = document.getElementById('languageSelect'); // ha van

// --- Állapotkezelés ---
let currentUser = null;

// PIN show/hide
const pinInput  = document.getElementById('pinCode');
const eyeBtn    = document.getElementById('togglePinVisibility');

if (pinInput && eyeBtn) {
  // állapot beállító helper
  const setVisible = (visible) => {
    pinInput.type = visible ? 'text' : 'password';
    eyeBtn.classList.toggle('is-visible', visible);
    eyeBtn.setAttribute('aria-pressed', String(visible));
    const label = visible ? 'Hide PIN' : 'Show PIN';
    eyeBtn.setAttribute('aria-label', label);
    eyeBtn.title = label;
  };

  // kattintásra vált
  eyeBtn.addEventListener('click', () => {
    const next = pinInput.type !== 'text'; // ha most nem látszik, tegyük láthatóvá
    setVisible(next);
  });

  // biztos ami biztos: induláskor rejtve
  setVisible(false);
}



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
    daysLabel: "Óralap dátumai (pl. 5-9)",
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

// --- I18N helper-ek ---
function getCurrentLang() {
  const userLang = currentUser?.lang;
  const stored   = localStorage.getItem('appLang');
  const lang     = (userLang || stored || 'hu').toLowerCase();
  return ['hu', 'de', 'pl'].includes(lang) ? lang : 'hu';
}

function getLangDict(lang) {
  const dict = translations[lang];
  return (dict && Object.keys(dict).length) ? dict : translations.hu;
}

// --- UI / Toast ---
function showToast(message, type = 'success') {
  if (!window.Swal) { console.warn('SweetAlert2 nincs betöltve'); return; }
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
  Toast.fire({ icon: type, title: message });
}

function setLanguage(lang = 'hu') {
  const langDict = getLangDict(lang);
  document.querySelectorAll('[data-translate-key]').forEach(el => {
    const key = el.getAttribute('data-translate-key');
    if (langDict[key]) el.textContent = langDict[key];
  });
  if (logoutButton && langDict.logoutTitle) {
    logoutButton.title = langDict.logoutTitle;
  }
}

function showScreen(screenName) {
  if (loginSection)  loginSection.classList.add('hidden');
  if (uploadSection) uploadSection.classList.add('hidden');
  if (screenName === 'login' && loginSection)  loginSection.classList.remove('hidden');
  if (screenName === 'upload' && uploadSection) uploadSection.classList.remove('hidden');
}

function updateUiForUserType(userType) {
  const type = (userType || 'oralapos').trim().toLowerCase();
  if (!oralapSection) return;
  if (type === 'nem_oralapos') oralapSection.classList.add('hidden');
  else oralapSection.classList.remove('hidden');
}

function updateUiForUserRole(userRole) {
  const isAdmin = (userRole || '').toLowerCase() === 'admin';
  if (adminButton) adminButton.classList.toggle('hidden', !isAdmin);
}

// --- Fájlok megjelenítése ---
async function fetchAndDisplayFiles() {
  if (!viewMonthSelect || !fileListContainer) return;
  const selectedMonth = viewMonthSelect.value;
  const lang = getCurrentLang();

  if (!selectedMonth || !currentUser) {
    fileListContainer.innerHTML = '';
    return;
  }
  fileListContainer.innerHTML = `<p>${getLangDict(lang).loadingFiles}</p>`;

  try {
    const resp = await fetch(`/.netlify/functions/getFiles?userId=${encodeURIComponent(currentUser.id)}&selectedMonth=${encodeURIComponent(selectedMonth)}`);
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || getLangDict(lang).errorLoadingFiles);
    const files = text ? JSON.parse(text) : [];

    fileListContainer.innerHTML = '';
    if (!files.length) {
      fileListContainer.innerHTML = `<p>${getLangDict(lang).noFiles}</p>`;
      return;
    }
    files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <span class="file-item-name">${file.name}</span>
        <a href="${file.link}" target="_blank" class="view-button">${getLangDict(lang).viewButton}</a>
      `;
      fileListContainer.appendChild(fileItem);
    });
  } catch (error) {
    fileListContainer.innerHTML = `<p class="status error">${error.message}</p>`;
  }
}

// --- Hónap név formázó: "9. September" az aktuális dátumból ---
function makeFolderNameFromDate(d = new Date()) {
  const m = d.getMonth() + 1; // 1..12
  const monthNameDe = d.toLocaleString('de-DE', { month: 'long' }); // pl. "September"
  return `${m}. ${monthNameDe}`;
}

// --- Kiválasztja az aktuális hónapot, ha létezik; különben a legújabb mappát ---
function selectBestMonth(sel, folders, targetName) {
  if (!sel || !folders.length) return;

  // 1) direkt egyezés (ideális eset)
  if (folders.includes(targetName)) {
    sel.value = targetName;
    return;
  }

  // 2) robust: egyezés hónapszám alapján (vezető nullák, eltérő case, extra szóközök esetére)
  const targetNum = String(parseInt(targetName, 10)); // pl. "9"
  const found = folders.find(fn => String(parseInt(fn, 10)) === targetNum);

  sel.value = found || folders[0];
}

// --- Hónap lista betöltés (VÉGLEGES) ---
async function populateMonthList(userId) {
  const lang = getCurrentLang();
  const selects = [monthSelect, absenceMonthSelect, viewMonthSelect];

  // ideiglenes "Betöltés..." opció
  selects.forEach(sel => {
    if (sel) sel.innerHTML = `<option value="" disabled selected>${getLangDict(lang).loadingMonths}</option>`;
  });

  try {
    const resp = await fetch(`/.netlify/functions/getFolders?userId=${encodeURIComponent(userId)}`);
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || getLangDict(lang).errorLoadingMonths);
    const folders = text ? JSON.parse(text) : [];

    // pl. ["9. September","8. August", ...] – legújabb elöl
    folders.sort((a, b) => parseInt(b) - parseInt(a));

    // feltöltjük a selecteket
    selects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      if (!folders.length) {
        sel.innerHTML = `<option value="" disabled selected>${getLangDict(lang).noFolders}</option>`;
        return;
      }
      folders.forEach(folderName => {
        const option = document.createElement('option');
        option.value = folderName;
        option.textContent = folderName;
        sel.appendChild(option);
      });
    });

    // LÉNYEG: mindig az AKTUÁLIS hónapot állítsuk be (pl. "9. September")
    const currentMonthFolder = makeFolderNameFromDate(new Date());
    selectBestMonth(monthSelect,        folders, currentMonthFolder);
    selectBestMonth(absenceMonthSelect, folders, currentMonthFolder);
    selectBestMonth(viewMonthSelect,    folders, currentMonthFolder);

    // Frissítsük a fájllistát a view-nál
    fetchAndDisplayFiles();
  } catch (error) {
    showToast(`Hiba: ${error.message}`, 'error');
  }
}

// --- Felhasználók betöltése (login) ---
async function populateEmployeeList() {
  try {
    if (loginEmployeeSelect) {
      loginEmployeeSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Betöltés…';
      opt.disabled = true;
      opt.selected = true;
      loginEmployeeSelect.appendChild(opt);
    }

    const resp = await fetch('/.netlify/functions/getUsers');
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || getLangDict('hu').errorLoadingUsers);
    const users = text ? JSON.parse(text) : [];

    if (loginEmployeeSelect) {
      loginEmployeeSelect.innerHTML = '';
      users.sort((a, b) => a.displayName.localeCompare(b.displayName));
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = getLangDict('hu').selectFromList || 'Válassz a listából…';
      ph.disabled = true; ph.selected = true;
      loginEmployeeSelect.appendChild(ph);

      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.displayName;
        loginEmployeeSelect.appendChild(option);
      });
    }
  } catch (error) {
    if (loginStatus) loginStatus.textContent = `Hiba: ${error.message}`;
    console.error('getUsers hiba:', error);
  }
}

// --- Login ---
async function handleLogin(event) {
  event.preventDefault();
  const lang = getCurrentLang();
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = getLangDict(lang).loginButtonLoading || '...';
  }
  if (loginStatus) loginStatus.textContent = '';

  const userId = loginEmployeeSelect?.value;
  const pin    = pinCodeInput?.value;

  if (!userId || !pin) {
    if (loginStatus) loginStatus.textContent = getLangDict(lang).errorMissingPin;
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = getLangDict(lang).loginButton;
    }
    return;
  }

  try {
    const resp = await fetch('/.netlify/functions/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin }),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message);

    currentUser = {
      id: userId,
      displayName: result.displayName,
      type: result.userType,
      lang: (['hu','de','pl'].includes((result.userLang || '').toLowerCase()) ? result.userLang.toLowerCase() : getCurrentLang()),
      role: result.userRole
    };
    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));

    const uiLang = getCurrentLang();
    const dict   = getLangDict(uiLang);
    setLanguage(uiLang);
    if (welcomeMessage && dict.welcome) {
      welcomeMessage.textContent = `${dict.welcome} ${currentUser.displayName}!`;
    }
    updateUiForUserType(currentUser.type);
    updateUiForUserRole(currentUser.role);
    showScreen('upload');
    populateMonthList(currentUser.id);
    if (loginForm) loginForm.reset();
  } catch (error) {
    if (loginStatus) loginStatus.textContent = `Hiba: ${error.message}`;
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = getLangDict(getCurrentLang()).loginButton;
    }
  }
}

// --- Feltöltés ---
async function handleUpload(event) {
  event.preventDefault();
  const submitButton = document.getElementById('submitButton');
  const lang = getCurrentLang();

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = getLangDict(lang).uploadButtonLoading;
  }
  if (uploadStatus) uploadStatus.textContent = '';

  const targetMonth = monthSelect && monthSelect.value;
  const fileInput   = document.getElementById('fileInput');
  const file        = fileInput && fileInput.files && fileInput.files[0];

  if (!targetMonth) {
    showToast('Válassz cél hónapot!', 'error');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = getLangDict(lang).uploadButton;
    }
    return;
  }
  if (!file) {
    showToast('Válassz fájlt a feltöltéshez!', 'error');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = getLangDict(lang).uploadButton;
    }
    return;
  }

  const formData = new FormData();
  formData.append('employeeName', currentUser.id);
  formData.append('selectedMonth', targetMonth);
  formData.append('weekRange', document.getElementById('weekRange')?.value || '');
  formData.append('file', file);

  try {
    const resp = await fetch('/.netlify/functions/upload', { method: 'POST', body: formData });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message);

    showToast(getLangDict(lang).uploadSuccess, 'success');
    if (uploadForm) uploadForm.reset();
    fetchAndDisplayFiles(); // lista frissítése
  } catch (error) {
    showToast(`Hiba: ${error.message}`, 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = getLangDict(lang).uploadButton;
    }
  }
}

// --- Távollét beküldés ---
async function handleAbsenceSubmit(event) {
  event.preventDefault();
  const submitButton = document.getElementById('absenceSubmitButton');
  const lang = getCurrentLang();

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = getLangDict(lang).reportButtonLoading;
  }
  if (absenceStatus) absenceStatus.textContent = '';

  const startDateValue = document.getElementById('startDate')?.value;
  if (!startDateValue) {
    showToast(getLangDict(lang).errorMissingStartDate, 'error');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = getLangDict(lang).reportButton;
    }
    return;
  }

  const startDate   = new Date(startDateValue);
  const month       = startDate.getMonth() + 1;
  const monthName   = startDate.toLocaleString('de-DE', { month: 'long' });
  const selectedMonth = `${month}. ${monthName}`;
  const absenceType = absenceTypeSelect?.value;

  let endpoint = '';
  let options  = { method: 'POST' };
  let successMessageKey = 'absenceSuccess';

  if (absenceType === 'KRANK') {
    if (!sickProofFile?.files || !sickProofFile.files.length) {
      showToast(getLangDict(lang).errorMissingSickProof, 'error');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = getLangDict(lang).reportButton;
      }
      return;
    }
    endpoint = '/.netlify/functions/uploadSickProof';
    successMessageKey = 'sickProofSuccess';
    const formData = new FormData();
    formData.append('userId', currentUser.id);
    formData.append('selectedMonth', selectedMonth);
    formData.append('startDate', startDateValue);
    formData.append('endDate', document.getElementById('endDate')?.value || '');
    formData.append('file', sickProofFile.files[0]);
    options.body = formData;
  } else {
    endpoint = '/.netlify/functions/logAbsence';
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify({
      userId: currentUser.id,
      absenceType,
      selectedMonth,
      startDate: startDateValue,
      endDate: document.getElementById('endDate')?.value || '',
    });
  }

  try {
    const resp = await fetch(endpoint, options);
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.message);

    const successMsg = getLangDict(lang)[successMessageKey];
    showToast(successMsg, 'success');
    if (absenceForm) absenceForm.reset();
    handleAbsenceTypeChange();
    fetchAndDisplayFiles();
  } catch (error) {
    showToast(`Hiba: ${error.message}`, 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = getLangDict(lang).reportButton;
    }
  }
}

function handleAbsenceTypeChange() {
  if (!sickProofUploadGroup || !sickProofFile || !absenceTypeSelect) return;
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
  setLanguage(getCurrentLang());
}

// --- INICIALIZÁLÁS ---
document.addEventListener('DOMContentLoaded', () => {
  const startLang = getCurrentLang();
  setLanguage(startLang);

  if (languageSelect) {
    languageSelect.value = startLang;
    languageSelect.addEventListener('change', (e) => {
      const chosen = (e.target.value || 'hu').toLowerCase();
      localStorage.setItem('appLang', chosen);
      setLanguage(chosen);
    });
  }

  const storedUser = sessionStorage.getItem('currentUser');
  if (storedUser) {
    currentUser = JSON.parse(storedUser);

    const lang = getCurrentLang();
    const dict = getLangDict(lang);
    setLanguage(lang);
    if (welcomeMessage && dict.welcome) {
      welcomeMessage.textContent = `${dict.welcome} ${currentUser.displayName}!`;
    }

    updateUiForUserType(currentUser.type);
    updateUiForUserRole(currentUser.role);
    showScreen('upload');
    populateMonthList(currentUser.id);
  } else {
    showScreen('login');
    populateEmployeeList();
  }
});

// --- Eseményfigyelők (defenzíven) ---
if (loginForm)        loginForm.addEventListener('submit', handleLogin);
if (uploadForm)       uploadForm.addEventListener('submit', handleUpload);
if (logoutButton)     logoutButton.addEventListener('click', handleLogout);
if (absenceForm)      absenceForm.addEventListener('submit', handleAbsenceSubmit);
if (viewMonthSelect)  viewMonthSelect.addEventListener('change', fetchAndDisplayFiles);
if (absenceTypeSelect)absenceTypeSelect.addEventListener('change', handleAbsenceTypeChange);

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
