'use strict';

const { ipcRenderer } = require('electron');

const post = (payload) => {
  try {
    ipcRenderer.send('native-cmd', payload);
  } catch {
    /* ignore */
  }
};

window.webkit = window.webkit || {};
window.webkit.messageHandlers = Object.assign({}, window.webkit.messageHandlers, {
  native: { postMessage: post }
});

ipcRenderer.on('native-opened', (_event, name, b64) => {
  if (typeof window.nativeOpened === 'function') window.nativeOpened(name, b64);
});

ipcRenderer.on('native-saved', (_event, message, name) => {
  if (typeof window.nativeSaved === 'function') window.nativeSaved(message, name);
});

const readBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const hasFiles = (event) => {
  const types = event.dataTransfer && event.dataTransfer.types;
  return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
};

window.addEventListener(
  'dragover',
  (event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  },
  true
);

window.addEventListener(
  'drop',
  async (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    try {
      const b64 = await readBase64(file);
      if (typeof window.nativeOpened === 'function') window.nativeOpened(file.name, b64);
      else post({ cmd: 'open' });
    } catch {
      post({ cmd: 'open' });
    }
  },
  true
);
