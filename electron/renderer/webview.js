const webview = document.getElementById('webview');
const menuBtn = document.getElementById('menuBtn');
const menuPopup = document.getElementById('menuPopup');
const changeServerBtn = document.getElementById('changeServerBtn');
const connectionIndicator = document.getElementById('connectionIndicator');

let serverUrl = '';

window.electronAPI.onLoadUrl((url) => {
    serverUrl = url;
    webview.src = url;
});

// The app in the iframe cannot set this window's title (cross origin), so it
// posts the note title. Only accept messages from the configured server.
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'go-notes-title' || typeof data.title !== 'string') {
        return;
    }

    try {
        if (!serverUrl || new URL(serverUrl).origin !== event.origin) {
            return;
        }
    } catch {
        return;
    }

    document.title = data.title;
    window.electronAPI.setTitle(data.title);
});

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPopup.classList.toggle('show');
});

document.addEventListener('click', () => {
    menuPopup.classList.remove('show');
});

changeServerBtn.addEventListener('click', async () => {
    await window.electronAPI.clearServerUrl();
    await window.electronAPI.openConfig();
});

function updateConnectionStatus() {
    if (navigator.onLine) {
        connectionIndicator.classList.remove('offline');
    } else {
        connectionIndicator.classList.add('offline');
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

updateConnectionStatus();
