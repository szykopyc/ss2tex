const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, net, shell, systemPreferences, desktopCapturer } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ocr = require('../ocr');

const SERVER_TIMEOUT_MS = 15_000;
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const BUNDLE_ID = 'io.github.szykopyc.ss2tex'; // set by --app-bundle-id in scripts/build-mac.sh
const PRELOAD = path.join(__dirname, 'preload.js');
const SCREEN_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

let win;
let config = { server: '', fallback: false, wrap: false, autoCopy: true, shortcut: 'CommandOrControl+Shift+L' };
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
} catch {} // first run: keep defaults

const status = (text) => win.webContents.send('status', text);

// ponytail: macOS-only snip via the native `screencapture -i`; needs an overlay window for Windows/Linux.
function snip() {
  const file = path.join(os.tmpdir(), `ss2tex-${Date.now()}.png`);
  return new Promise((resolve) => {
    execFile('screencapture', ['-i', '-x', file], () => resolve(fs.existsSync(file) ? file : null));
  });
}

async function viaServer(file) {
  const res = await net.fetch(new URL('/ocr', config.server).href, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: fs.readFileSync(file),
    signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`server: ${text || res.status}`);
  return text;
}

async function recognize(file) {
  if (!config.server) return { latex: await ocr.toLatex(file) };
  try {
    return { latex: await viaServer(file) };
  } catch (err) {
    if (!config.fallback) throw err;
    status('Server unreachable, reading locally…');
    return { latex: await ocr.toLatex(file), note: `ran locally (${err.message})` };
  }
}

function reveal() {
  win.restore();
  win.show();
}

async function capture() {
  // Minimised (or hidden with ⌘H): stay out of the way and rely on auto-copy.
  const background = win.isMinimized() || !win.isVisible();
  if (!background) win.hide();
  const file = await snip();
  if (!background) win.show();
  if (!file) return; // selection cancelled with Esc

  status(config.server ? 'Sending to server…' : 'Reading…');
  try {
    win.webContents.send('result', await recognize(file));
    if (background && !config.autoCopy) reveal();
  } catch (err) {
    status(`Error: ${err.message}`);
    if (background) reveal();
  } finally {
    fs.unlinkSync(file);
  }
}

// Without Screen Recording access, `screencapture` silently grabs only the wallpaper.
async function askForScreenAccess() {
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return;
  // Ad-hoc signing ties a grant to one exact build, so a reinstall leaves a stale "on" entry in Settings
  // that no longer applies. Clearing it lets this build be listed and switched on fresh.
  if (app.isPackaged) await promisify(execFile)('tccutil', ['reset', 'ScreenCapture', BUNDLE_ID]).catch(() => {});
  desktopCapturer.getSources({ types: ['screen'] }).catch(() => {}); // adds ss2tex to the list in System Settings
  const prompt = new BrowserWindow({
    width: 380,
    height: 170,
    parent: win,
    resizable: false,
    minimizable: false,
    webPreferences: { preload: PRELOAD },
  });
  prompt.loadFile(path.join(__dirname, 'permissions.html'));
}

function bindShortcut(next, previous) {
  globalShortcut.unregisterAll();
  if (globalShortcut.register(next, capture)) return next;
  status(`Couldn't bind ${next}, it may be taken by another app`);
  if (previous) globalShortcut.register(previous, capture);
  return previous;
}

function warmUp() {
  if (config.server) return status(`Using ${config.server}`);
  status('Loading model…');
  ocr.load().then(
    () => status('Ready'),
    (err) => status(`Model failed to load: ${err.message}`),
  );
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 520,
    height: 420,
    webPreferences: { preload: PRELOAD },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', warmUp);
  askForScreenAccess();

  ipcMain.handle('get-config', () => config);
  ipcMain.handle('set-config', (_, next) => {
    const previous = config;
    config = {
      server: String(next.server).trim(),
      fallback: Boolean(next.fallback),
      wrap: Boolean(next.wrap),
      autoCopy: Boolean(next.autoCopy),
      shortcut: String(next.shortcut),
    };
    if (config.shortcut !== previous.shortcut) config.shortcut = bindShortcut(config.shortcut, previous.shortcut);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    if (config.server !== previous.server) warmUp();
    return config;
  });
  ipcMain.on('snip', capture);
  ipcMain.on('copy', (_, text) => clipboard.writeText(text));
  ipcMain.on('open-screen-settings', () => shell.openExternal(SCREEN_SETTINGS));
  ipcMain.on('relaunch', () => {
    app.relaunch();
    app.exit();
  });
  bindShortcut(config.shortcut);
});

app.on('window-all-closed', () => app.quit());
