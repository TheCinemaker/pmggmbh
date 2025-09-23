// --- BEÁLLÍTÁSOK ---
// Itt add meg az összes dolgozót.
// id: Ékezet- és szóközmentes azonosító. PONTOSAN egyezzen meg a Drive mappa nevével!
// displayName: A szép, olvasható név, amit a felhasználó lát.
const employeeData = [
    { id: "AVAR_Szilveszter", displayName: "AVAR Szilveszter" },
    { id: "BARCIK_Grzegorz_Jan", displayName: "BARCIK Grzegorz Jan" },
    { id: "BIZEK_Tomasz", displayName: "BIZEK Tomasz" },
    { id: "BOROS_Mark", displayName: "BOROS Mark" },
    { id: "BOTOS_Peter", displayName: "BOTOS Peter" },
    { id: "CSIZMAZIA_Kornel", displayName: "CSIZMAZIA Kornel" },
    { id: "EGEI_Laszlo_Attila", displayName: "EGEI Laszlo Attila" },
    { id: "FABIAN_Daniel", displayName: "FABIAN Daniel" },
    { id: "GEROLY_Alex", displayName: "GERÖLY Alex" },
    { id: "GEROLY_Erik", displayName: "GERÖLY Erik" },
    { id: "GUTJAHR_David", displayName: "GUTJAHR Dávid" },
    { id: "GYORKEI_Lajos", displayName: "GYÖRKEI Lajos" },
    { id: "HORVATH_Mark", displayName: "HORVATH Mark" },
    { id: "KAMRADEK_Bogdan_Jozef", displayName: "KAMRADEK Bogdan Jozef" },
    { id: "KESJAR_Mihaly", displayName: "KESJAR Mihaly" },
    { id: "KESZTHELYI_Kristof", displayName: "KESZTHELYI Kristof" },
    { id: "KOROS_Attila", displayName: "KOROS Attila" },
    { id: "KOTAI_Balasz", displayName: "KOTAI Balasz" },
    { id: "MOLNAR_Kristof", displayName: "MOLNAR Kristof" },
    { id: "ODOR_Roland", displayName: "ODOR Roland" },
    { id: "ROZSAHEGYI_Gabor", displayName: "RÓZSAHEGYI Gábor" },
    { id: "SMIALKOWSKI_Szymon", displayName: "SMIALKOWSKI Szymon" },
    { id: "SOVANY_Zoltan", displayName: "SOVANY Zoltan" },
    { id: "TRUPPER_Balint", displayName: "TRUPPER Balint" },
    { id: "VIGH_Janos", displayName: "VIGH Janos" }
];
// --- BEÁLLÍTÁSOK VÉGE ---

const form = document.getElementById('uploadForm');
const employeeSelect = document.getElementById('employeeName');
const submitButton = document.getElementById('submitButton');
const statusMessage = document.getElementById('statusMessage');

// Legördülő lista feltöltése a szép nevekkel, de a háttérben a tiszta ID-val
employeeData.sort((a, b) => a.displayName.localeCompare(b.displayName)); // ABC sorrendbe teszi
employeeData.forEach(employee => {
    const option = document.createElement('option');
    option.value = employee.id; // Az érték a tiszta ID lesz!
    option.textContent = employee.displayName; // De a felhasználó a szép nevet látja!
    employeeSelect.appendChild(option);
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Feltöltés folyamatban...';
    statusMessage.textContent = '';
    statusMessage.className = 'status';

    const formData = new FormData();
    formData.append('employeeName', document.getElementById('employeeName').value);
    formData.append('weekRange', document.getElementById('weekRange').value);
    formData.append('file', document.getElementById('fileInput').files[0]);

    try {
        const response = await fetch('/.netlify/functions/upload', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (response.ok) {
            statusMessage.textContent = 'Sikeres feltöltés!';
            statusMessage.classList.add('success');
            form.reset();
        } else {
            throw new Error(result.message || 'Ismeretlen hiba történt.');
        }
    } catch (error) {
        statusMessage.textContent = `Hiba: ${error.message}`;
        statusMessage.classList.add('error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Feltöltés';
    }
});
