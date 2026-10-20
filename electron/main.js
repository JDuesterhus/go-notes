const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require('electron');
const path = require('path');
const Store = require('electron-store').default;

const store = new Store();
let mainWindow;

function createConfigWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 700,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile('renderer/config.html');
}

function createWebViewWindow(serverUrl) {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile('renderer/webview.html');
    
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('load-url', serverUrl);
    });
}

app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.gonotes.app');
    }

    // Exports are blob downloads from the web app inside the iframe. Ask for
    // a destination instead of silently dropping them in the download folder.
    session.defaultSession.on('will-download', (event, item) => {
        const suggested = path.join(app.getPath('downloads'), item.getFilename());
        const options = {
            title: 'Save export',
            defaultPath: suggested,
        };
        const target = mainWindow
            ? dialog.showSaveDialogSync(mainWindow, options)
            : dialog.showSaveDialogSync(options);

        if (!target) {
            item.cancel();
            return;
        }
        item.setSavePath(target);
    });

    const savedUrl = store.get('serverUrl');
    
    if (savedUrl) {
        createWebViewWindow(savedUrl);
    } else {
        createConfigWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createConfigWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('save-server-url', async (event, url) => {
    store.set('serverUrl', url);
    return true;
});

ipcMain.handle('get-server-url', async () => {
    return store.get('serverUrl');
});

ipcMain.handle('clear-server-url', async () => {
    store.delete('serverUrl');
    return true;
});

ipcMain.handle('open-config', async () => {
    mainWindow.close();
    createConfigWindow();
    return true;
});

ipcMain.handle('open-webview', async (event, url) => {
    mainWindow.close();
    createWebViewWindow(url);
    return true;
});

// The note title lives in the web app inside the iframe; it posts the value
// to the local wrapper, which forwards it here.
ipcMain.handle('set-title', async (event, title) => {
    if (typeof title === 'string' && title.length > 0 && title.length <= 500 && mainWindow) {
        mainWindow.setTitle(title);
    }
    return true;
});
