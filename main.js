const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  session,
} = require("electron");
const path = require("path");

// ── State ──────────────────────────────────────────────
let mainWindow;
let gridRows = 2;
let gridCols = 2;
let minGridWidth = 400;
let minGridHeight = 300;
let showFloatingToolbar = false;
const cellViews = []; // flat array [row*cols+col] = BrowserView
const TOOLBAR_HEIGHT = 48;
const BORDER_GAP = 1;

let lastUrl = "";

// ── Helpers ────────────────────────────────────────────
function cellId(r, c) {
  return `cell-${r}-${c}`;
}

function partitionName(r, c) {
  return `persist:${cellId(r, c)}`;
}

function getContentSize() {
  const [w, h] = mainWindow.getContentSize();
  return { w, h: h - TOOLBAR_HEIGHT };
}

function calcGridGeometry() {
  const { w, h } = getContentSize();
  const cols = gridCols;
  const rows = gridRows;
  const cellW = Math.max(minGridWidth, Math.floor(w / cols));
  const cellH = Math.max(minGridHeight, Math.floor(h / rows));
  const totalW = cellW * cols;
  const totalH = cellH * rows;
  return { cellW, cellH, totalW, totalH, cols, rows };
}

// ── Floating Toolbar Injection ─────────────────────────
const floatingToolbarCSS = `
  #__mb_float_toolbar {
    position: fixed;
    top: 0; left: 0;
    z-index: 2147483647;
    display: flex;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(30,30,30,0.92);
    border-bottom-right-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-family: system-ui, sans-serif;
  }
  #__mb_float_toolbar button {
    background: #444;
    color: #eee;
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  #__mb_float_toolbar button:hover { background: #666; }
`;

const floatingToolbarJS = (r, c) => `
  (function() {
    if (document.getElementById('__mb_float_toolbar')) return;
    const tb = document.createElement('div');
    tb.id = '__mb_float_toolbar';
    const btnBack = document.createElement('button');
    btnBack.textContent = '← Back';
    btnBack.onclick = () => { try { window.__mbCellAPI.goBack(); } catch(e) { history.back(); } };
    const btnFwd = document.createElement('button');
    btnFwd.textContent = '→ Fwd';
    btnFwd.onclick = () => { try { window.__mbCellAPI.goForward(); } catch(e) { history.forward(); } };
    const btnRefresh = document.createElement('button');
    btnRefresh.textContent = '⟳ Refresh';
    btnRefresh.onclick = () => { try { window.__mbCellAPI.refresh(); } catch(e) { location.reload(); } };
    const btnStorage = document.createElement('button');
    btnStorage.textContent = '📦 Storage';
    btnStorage.onclick = () => { try { window.__mbCellAPI.viewStorage(); } catch(e) {} };
    tb.appendChild(btnBack);
    tb.appendChild(btnFwd);
    tb.appendChild(btnRefresh);
    tb.appendChild(btnStorage);
    (document.body || document.documentElement).appendChild(tb);
  })();
`;

const removeToolbarJS = `
  (function(){ const el=document.getElementById('__mb_float_toolbar'); if(el)el.remove(); })(); 
`;

function injectFloatingToolbar(view, r, c) {
  if (!showFloatingToolbar) {
    view.webContents.executeJavaScript(removeToolbarJS).catch(() => {});
    return;
  }
  view.webContents.insertCSS(floatingToolbarCSS).catch(() => {});
  view.webContents.executeJavaScript(floatingToolbarJS(r, c)).catch(() => {});
}

// ── BrowserView Management ─────────────────────────────
function createCellView(r, c) {
  const view = new BrowserView({
    webPreferences: {
      partition: partitionName(r, c),
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view._mbRow = r;
  view._mbCol = c;
  view.webContents.loadURL("about:blank");

  // Assign cell coordinates to the preload
  view.webContents.on("did-finish-load", () => {
    view.webContents.send("assign-cell", r, c);
    injectFloatingToolbar(view, r, c);
  });

  view.webContents.on("did-navigate", () => {
    injectFloatingToolbar(view, r, c);
  });

  view.webContents.on("dom-ready", () => {
    view.webContents.send("assign-cell", r, c);
    injectFloatingToolbar(view, r, c);
  });

  return view;
}

function buildGrid() {
  // Remove old views
  for (const v of cellViews) {
    mainWindow.removeBrowserView(v);
    v.webContents.close();
  }
  cellViews.length = 0;

  // Create new views
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const view = createCellView(r, c);
      cellViews.push(view);
      mainWindow.addBrowserView(view);
    }
  }
  layoutGrid();
}

function layoutGrid() {
  const { cellW, cellH, totalW, totalH } = calcGridGeometry();
  const { w, h } = getContentSize();

  // Get scroll offsets from toolbar renderer
  mainWindow.webContents
    .executeJavaScript(
      `document.getElementById('grid-scroll') ? [document.getElementById('grid-scroll').scrollLeft, document.getElementById('grid-scroll').scrollTop] : [0,0]`
    )
    .then(([sx, sy]) => {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const idx = r * gridCols + c;
          const view = cellViews[idx];
          if (!view) continue;
          const leftBorder = c > 0 ? BORDER_GAP : 0;
          const topBorder = r > 0 ? BORDER_GAP : 0;
          const rightShrink = c < gridCols - 1 ? BORDER_GAP : 0;
          const bottomShrink = r < gridRows - 1 ? BORDER_GAP : 0;
          const x = c * cellW - sx + leftBorder;
          const y = r * cellH - sy + TOOLBAR_HEIGHT + topBorder;
          view.setBounds({ x, y, width: cellW - leftBorder - rightShrink, height: cellH - topBorder - bottomShrink });
        }
      }
    })
    .catch(() => {});

  // Update scroll container size
  mainWindow.webContents.send("grid-size", {
    cellW,
    cellH,
    totalW,
    totalH,
    viewW: w,
    viewH: h,
  });
}

// ── Main Window ────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "MultiBrowser Simulator",
    webPreferences: {
      preload: path.join(__dirname, "toolbar-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("toolbar.html");

  mainWindow.on("resize", () => {
    layoutGrid();
    mainWindow.webContents.send("window-resized");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    buildGrid();
  });
}

// ── Storage Viewer Window ──────────────────────────────
function openStorageViewer(data) {
  const win = new BrowserWindow({
    width: 700,
    height: 600,
    title: `Storage — ${data.cellId}`,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const escHtml = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      body { font-family: system-ui; background: #1e1e1e; color: #ccc; padding: 16px; }
      h3 { color: #0078d4; }
      table { width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px; }
      th,td { text-align:left; padding:4px 8px; border:1px solid #444; word-break:break-all; }
      th { background:#383838; color:#aaa; }
      td { color:#ddd; }
      .empty { color:#666; font-style:italic; }
    </style></head><body>`;

  html += `<h3>Cookies (${data.cookies.length})</h3>`;
  if (data.cookies.length) {
    html += `<table><tr><th>Domain</th><th>Name</th><th>Value</th></tr>`;
    for (const c of data.cookies) {
      html += `<tr><td>${escHtml(c.domain)}</td><td>${escHtml(c.name)}</td><td>${escHtml(c.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="empty">No cookies</p>`;
  }

  html += `<h3>localStorage (${data.localStorage.length})</h3>`;
  if (data.localStorage.length) {
    html += `<table><tr><th>Key</th><th>Value</th></tr>`;
    for (const item of data.localStorage) {
      html += `<tr><td>${escHtml(item.key)}</td><td>${escHtml(item.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="empty">No localStorage</p>`;
  }

  html += `<h3>sessionStorage (${data.sessionStorage.length})</h3>`;
  if (data.sessionStorage.length) {
    html += `<table><tr><th>Key</th><th>Value</th></tr>`;
    for (const item of data.sessionStorage) {
      html += `<tr><td>${escHtml(item.key)}</td><td>${escHtml(item.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="empty">No sessionStorage</p>`;
  }

  html += `</body></html>`;

  win.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(html)
  );
}

// ── IPC Handlers ───────────────────────────────────────
ipcMain.handle("navigate-all", async (e, url) => {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  lastUrl = url;
  for (const view of cellViews) {
    view.webContents.loadURL(url).catch(() => {});
  }
});

ipcMain.handle("refresh-cell", async (e, r, c) => {
  const idx = r * gridCols + c;
  if (cellViews[idx]) {
    cellViews[idx].webContents.reload();
  }
});

ipcMain.handle("go-back", async (e, r, c) => {
  const idx = r * gridCols + c;
  if (cellViews[idx] && cellViews[idx].webContents.canGoBack()) {
    cellViews[idx].webContents.goBack();
  }
});

ipcMain.handle("go-forward", async (e, r, c) => {
  const idx = r * gridCols + c;
  if (cellViews[idx] && cellViews[idx].webContents.canGoForward()) {
    cellViews[idx].webContents.goForward();
  }
});

ipcMain.handle("toggle-floating-toolbar", async (e, val) => {
  showFloatingToolbar = val;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const idx = r * gridCols + c;
      if (cellViews[idx]) {
        injectFloatingToolbar(cellViews[idx], r, c);
      }
    }
  }
});

ipcMain.handle("get-grid-config", async () => {
  return { rows: gridRows, cols: gridCols, minGridWidth, minGridHeight };
});

ipcMain.handle("set-grid-size", async (e, rows, cols) => {
  gridRows = Math.max(1, rows);
  gridCols = Math.max(1, cols);
  buildGrid();
  if (lastUrl) {
    for (const view of cellViews) {
      view.webContents.loadURL(lastUrl).catch(() => {});
    }
  }
});

ipcMain.handle("set-min-size", async (e, w, h) => {
  minGridWidth = Math.max(200, w);
  minGridHeight = Math.max(150, h);
  layoutGrid();
});

ipcMain.handle("get-storage", async (e, r, c) => {
  const idx = r * gridCols + c;
  const view = cellViews[idx];
  if (!view) return null;

  const part = partitionName(r, c);
  const ses = session.fromPartition(part);

  const cookies = await ses.cookies.get({});

  let localStorage = [];
  let sessionStorage = [];
  try {
    localStorage = await view.webContents.executeJavaScript(
      `(() => { const r=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);r.push({key:k,value:localStorage.getItem(k)});} return r; })()`
    );
    sessionStorage = await view.webContents.executeJavaScript(
      `(() => { const r=[]; for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);r.push({key:k,value:sessionStorage.getItem(k)});} return r; })()`
    );
  } catch {
    // about:blank or restricted
  }

  return { cookies, localStorage, sessionStorage, cellId: cellId(r, c) };
});

ipcMain.handle("scroll-changed", async (e, sx, sy) => {
  const { cellW, cellH } = calcGridGeometry();
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const idx = r * gridCols + c;
      const view = cellViews[idx];
      if (!view) continue;
      const leftBorder = c > 0 ? BORDER_GAP : 0;
      const topBorder = r > 0 ? BORDER_GAP : 0;
      const rightShrink = c < gridCols - 1 ? BORDER_GAP : 0;
      const bottomShrink = r < gridRows - 1 ? BORDER_GAP : 0;
      const x = c * cellW - sx + leftBorder;
      const y = r * cellH - sy + TOOLBAR_HEIGHT + topBorder;
      view.setBounds({ x, y, width: cellW - leftBorder - rightShrink, height: cellH - topBorder - bottomShrink });
    }
  }
});

// Storage viewer from cell preload
ipcMain.on("show-storage-viewer", (e, data) => {
  if (data) openStorageViewer(data);
});

// ── App Lifecycle ──────────────────────────────────────
app.whenReady().then(createMainWindow);

app.on("window-all-closed", () => {
  app.quit();
});
