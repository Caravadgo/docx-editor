const APP_URL = 'index.html';
const KEY = 'appWindow';

async function openApp() {
  const { [KEY]: saved } = await chrome.storage.local.get(KEY);
  if (saved?.id != null) {
    try {
      await chrome.windows.update(saved.id, { focused: true });
      return;
    } catch {
      await chrome.storage.local.remove(KEY);
    }
  }
  const win = await chrome.windows.create({
    url: APP_URL,
    type: 'popup',
    width: saved?.width || 1280,
    height: saved?.height || 860,
    left: saved?.left,
    top: saved?.top,
  });
  await remember(win);
}

async function remember(win) {
  if (win?.type !== 'popup') return;
  await chrome.storage.local.set({
    [KEY]: { id: win.id, width: win.width, height: win.height, left: win.left, top: win.top },
  });
}

let boundsTimer;
chrome.windows.onBoundsChanged.addListener((win) => {
  if (win.type !== 'popup') return;
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => remember(win), 400);
});

chrome.windows.onRemoved.addListener(async (id) => {
  const { [KEY]: saved } = await chrome.storage.local.get(KEY);
  if (saved?.id === id) await chrome.storage.local.remove(KEY);
});

chrome.action.onClicked.addListener(openApp);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') openApp();
});
