const { Dropbox } = require('dropbox');
// ... (Ugyanaz a konfigurációs blokk, mint az upload.js-ben) ...

exports.handler = async (event) => {
    // ... (Header és OPTIONS ellenőrzés) ...
    try {
        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, /*...*/ });
        const year = new Date().getFullYear();
        const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;

        let allFiles = {};
        const userFolders = await dbx.filesListFolder({ path: basePath });

        for (const userFolder of userFolders.result.entries) {
            if (userFolder['.tag'] === 'folder') {
                allFiles[userFolder.name] = [];
                const monthFolders = await dbx.filesListFolder({ path: userFolder.path_lower });
                
                for (const monthFolder of monthFolders.result.entries) {
                    if (monthFolder['.tag'] === 'folder') {
                        const files = await dbx.filesListFolder({ path: monthFolder.path_lower });
                        files.result.entries.forEach(file => {
                            if (file['.tag'] === 'file') {
                                allFiles[userFolder.name].push({
                                    name: file.name,
                                    folder: monthFolder.name
                                });
                            }
                        });
                    }
                }
            }
        }

        return { statusCode: 200, headers, body: JSON.stringify(allFiles) };
    } catch (error) {
        return { statusCode: 500, /*...*/ };
    }
};
