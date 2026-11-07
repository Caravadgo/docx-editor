'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const APP_DIR = __dirname;
const APP_URL = 'app://docx/index.html';
const TITLE = 'DOCX-редактор';
const FILTERS = [
  { name: 'Документы', extensions: ['docx'] },
  { name: 'Текст и книги', extensions: ['txt', 'md', 'markdown', 'fb2'] },
  { name: 'Все файлы', extensions: ['*'] }
];

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

app.setName('docx-editor');
app.setPath('userData', path.join(app.getPath('appData'), 'docx-editor'));
if (process.platform === 'linux') app.setDesktopName('docx-editor.desktop');
if (process.platform === 'win32') app.setAppUserModelId('ru.docxeditor.app');

let win = null;
let currentPath = null;
const pendingFiles = [];

const send = (channel, ...args) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

const pageEval = (code) => {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return win.webContents.executeJavaScript(code, true).catch(() => {});
};

async function openDialog() {
  const res = await dialog.showOpenDialog(win, {
    title: 'Открыть документ',
    properties: ['openFile'],
    filters: FILTERS
  });
  if (res.canceled || !res.filePaths.length) return;
  await loadFile(res.filePaths[0]);
}

function baseName(file) {
  const name = path.basename(file);
  return name.replace(/\.[^.]+$/, '') || 'Документ';
}

async function loadFile(file) {
  try {
    const buf = await fs.readFile(file);
    currentPath = file;
    const name = path.basename(file);
    send('native-opened', name, buf.toString('base64'));
    if (win && !win.isDestroyed()) win.setTitle(`${name} — ${TITLE}`);
    app.addRecentDocument(file);
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: TITLE,
      message: 'Не удалось открыть файл',
      detail: String((err && err.message) || err)
    });
  }
}

async function saveAs(payload) {
  const name = (payload && payload.name) || `${baseName(currentPath || '')}_ред.docx`;
  const defaultPath = currentPath
    ? path.join(path.dirname(currentPath), name)
    : path.join(app.getPath('documents'), name);
  const res = await dialog.showSaveDialog(win, {
    title: 'Сохранить как',
    defaultPath,
    filters: FILTERS
  });
  if (res.canceled || !res.filePath) return;
  await writeFile(res.filePath, payload && payload.b64);
}

async function saveCurrent(payload) {
  if (!currentPath) return saveAs(payload);
  await writeFile(currentPath, payload && payload.b64);
}

async function writeFile(file, b64) {
  try {
    await fs.writeFile(file, Buffer.from(String(b64 || ''), 'base64'));
    currentPath = file;
    const name = path.basename(file);
    send('native-saved', `Сохранено: ${name}`, name);
    if (win && !win.isDestroyed()) win.setTitle(`${name} — ${TITLE}`);
    app.addRecentDocument(file);
  } catch (err) {
    await dialog.showMessageBox(win, {
      type: 'error',
      title: TITLE,
      message: 'Не удалось сохранить файл',
      detail: String((err && err.message) || err)
    });
  }
}

ipcMain.on('native-cmd', (_event, payload) => {
  const cmd = payload && payload.cmd;
  if (cmd === 'open') openDialog();
  else if (cmd === 'saveNew') saveAs(payload);
  else if (cmd === 'saveCurrent') saveCurrent(payload);
});

ipcMain.handle('file-b64', async (_event, filePath) => {
  try {
    const buf = await fs.readFile(filePath);
    return { name: path.basename(filePath), b64: buf.toString('base64') };
  } catch {
    return null;
  }
});

function clickPage(id) {
  pageEval(`(() => { const el = document.getElementById('${id}'); if (el) el.click(); })()`);
}

function buildMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Открыть…', accelerator: 'CmdOrCtrl+O', click: () => openDialog() },
        { label: 'Сохранить', accelerator: 'CmdOrCtrl+S', click: () => clickPage('sc') },
        { label: 'Сохранить как…', accelerator: 'CmdOrCtrl+Shift+S', click: () => clickPage('sn') },
        { type: 'separator' },
        { label: 'Печать…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print({}) },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', role: 'undo' },
        { label: 'Повторить', role: 'redo' },
        { type: 'separator' },
        { label: 'Вырезать', role: 'cut' },
        { label: 'Копировать', role: 'copy' },
        { label: 'Вставить', role: 'paste' },
        { label: 'Выделить всё', role: 'selectAll' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Обычный масштаб', role: 'resetZoom' },
        { label: 'Увеличить', role: 'zoomIn' },
        { label: 'Уменьшить', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Полный экран', accelerator: 'F11', click: () => clickPage('fsBtn') },
        { label: 'Перезагрузить', role: 'reload' }
      ]
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'О программе',
          click: () => pageEval('typeof showAbout === "function" && showAbout()')
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function serveApp() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (!rel || rel === '/') rel = '/index.html';
    const target = path.join(APP_DIR, path.normalize(rel).replace(/^[/\\]+/, ''));
    if (target !== APP_DIR && !target.startsWith(APP_DIR + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 380,
    minHeight: 480,
    backgroundColor: '#f8f6f1',
    title: TITLE,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    flushPendingFiles();
  });

  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  win.on('closed', () => {
    win = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  win.loadURL(APP_URL);
}

function flushPendingFiles() {
  while (pendingFiles.length) {
    const file = pendingFiles.shift();
    loadFile(file);
  }
}

function fileFromArgv(argv) {
  const args = argv.slice(1);
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) continue;
    if (/\.(docx|txt|md|markdown|fb2)$/i.test(arg)) return arg;
  }
  return null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileFromArgv(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (file) loadFile(file);
    } else if (file) {
      pendingFiles.push(file);
      createWindow();
    }
  });

  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (win) loadFile(file);
    else pendingFiles.push(file);
  });

  app.whenReady().then(() => {
    serveApp();
    buildMenu();
    const file = fileFromArgv(process.argv);
    if (file) pendingFiles.push(file);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
