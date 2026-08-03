// ===== ELECTRON MAIN PROCESS FOR WINDOWS 98 DESKTOP APP ===== //
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icons', 'icon-512x512.png'),
    frame: true, // Native Windows 98 frame window
    title: 'PMG Stundenzettel Manager 98',
    backgroundColor: '#008080',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'desktop-preload.js')
    }
  });

  // Remove standard browser menu bar for true native Windows feel
  mainWindow.setMenuBarVisibility(false);

  // Load the Win98 admin app
  const appUrl = process.env.APP_URL || 'https://dev--pmggmbh.netlify.app/admin-win98.html';
  mainWindow.loadURL(appUrl).catch(() => {
    mainWindow.loadFile(path.join(__dirname, 'admin-win98.html'));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
