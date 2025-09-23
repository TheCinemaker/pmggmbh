// --- BEÁLLÍTÁSOK ---
const employeeList = [
    "Avar Szilveszter",
    "Barcik Gergorz Jan",
    "Bizek Tomasz",
    "Boros Mark",
    // ... Ide másold be az összes nevet, pontosan!
];
// --- BEÁLLÍTÁSOK VÉGE ---

const form = document.getElementById('uploadForm');
const employeeSelect = document.getElementById('employeeName');
const submitButton = document.getElementById('submitButton');
const statusMessage = document.getElementById('statusMessage');

// Legördülő lista feltöltése
employeeList.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
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
