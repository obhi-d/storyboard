const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const smoke = process.argv.includes('--smoke-test');
let smokeData;
if (smoke) {
  smokeData = fs.mkdtempSync(path.join(os.tmpdir(), 'storyboard-smoke-'));
  app.setPath('userData', smokeData);
}
app.setName('Storyboard');
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 600,
    minHeight: 480,
    title: 'Storyboard',
    backgroundColor: '#f5f6f1',
    show: true,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const external = (url) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    external(url);
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  if (smoke) {
    setTimeout(() => {
      console.error('Desktop smoke test timed out');
      app.exit(1);
    }, 30000).unref();
    window.webContents.on('console-message', (_event, _level, message) =>
      console.log('Renderer:', message),
    );
    window.webContents.on('render-process-gone', () => app.exit(1));
  }
  try {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    if (smoke) {
      let state;
      for (let attempt = 0; attempt < 100; attempt++) {
        state = await window.webContents.executeJavaScript(`({
          cards: document.querySelectorAll('article').length,
          saved: document.body.textContent.includes('All changes saved'),
          isolated: typeof window.require === 'undefined',
          pen: !!document.querySelector('[aria-label="Draw (P)"]'),
          status: document.querySelector('.save-state')?.textContent,
          canvas: !!document.querySelector('[aria-label="Storyboard canvas"]')
        })`);
        if (state.cards > 0 && state.saved && state.isolated && state.pen && state.canvas) {
          console.log('Desktop smoke test passed', JSON.stringify(state));
          app.exit(0);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      console.error('Desktop smoke test failed', JSON.stringify(state));
      app.exit(1);
    }
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on('window-all-closed', () => app.quit());
