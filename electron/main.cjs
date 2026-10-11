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
    show: !smoke,
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
    setTimeout(() => app.exit(1), 30000).unref();
    window.webContents.on('render-process-gone', () => app.exit(1));
  }
  try {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    if (smoke) {
      const ok = await window.webContents.executeJavaScript(`new Promise(resolve => {
        const timer = setInterval(() => {
          if (document.querySelectorAll('article').length === 4 && document.body.textContent.includes('All changes saved')) {
            clearInterval(timer);
            resolve(typeof window.require === 'undefined' && !!document.querySelector('[aria-label="Draw (P)"]'));
          }
        }, 100);
      })`);
      console.log(ok ? 'Desktop smoke test passed' : 'Desktop smoke test failed');
      app.exit(ok ? 0 : 1);
    }
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on('window-all-closed', () => app.quit());
