const api = window.__toolbarAPI;

// ── Grid Size State ───────────────────────────
let gridRows = 2;
let gridCols = 2;
let minGridWidth = 400;
let minGridHeight = 300;

// ── Elements ──────────────────────────────────
const urlInput = document.getElementById("url-input");
const goBtn = document.getElementById("go-btn");
const rowsInput = document.getElementById("rows-input");
const colsInput = document.getElementById("cols-input");
const gridBtn = document.getElementById("grid-btn");
const floatToggle = document.getElementById("float-toggle");
const settingsBtn = document.getElementById("settings-btn");
const settingsDialog = document.getElementById("settings-dialog");
const settingsSave = document.getElementById("settings-save");
const settingsCancel = document.getElementById("settings-cancel");
const minWidthInput = document.getElementById("min-width-input");
const minHeightInput = document.getElementById("min-height-input");
const storageDialog = document.getElementById("storage-dialog");
const storageClose = document.getElementById("storage-close");
const storageTitle = document.getElementById("storage-title");
const storageBody = document.getElementById("storage-body");
const gridScroll = document.getElementById("grid-scroll");
const gridContent = document.getElementById("grid-content");

// ── URL Navigation ────────────────────────────
function navigateAll() {
  const url = urlInput.value.trim();
  if (!url) return;
  api.navigateAll(url);
}

goBtn.addEventListener("click", navigateAll);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigateAll();
});

// ── Grid Size ─────────────────────────────────
gridBtn.addEventListener("click", () => {
  const r = parseInt(rowsInput.value) || 2;
  const c = parseInt(colsInput.value) || 2;
  gridRows = r;
  gridCols = c;
  api.setGridSize(r, c);
});

// ── Floating Toolbar Toggle ───────────────────
floatToggle.addEventListener("change", () => {
  api.toggleFloatingToolbar(floatToggle.checked);
});

// ── Settings Dialog ───────────────────────────
settingsBtn.addEventListener("click", () => {
  minWidthInput.value = minGridWidth;
  minHeightInput.value = minGridHeight;
  api.hideViews();
  settingsDialog.classList.remove("hidden");
});

settingsCancel.addEventListener("click", () => {
  settingsDialog.classList.add("hidden");
  api.showViews();
});

settingsSave.addEventListener("click", () => {
  minGridWidth = Math.max(200, parseInt(minWidthInput.value) || 400);
  minGridHeight = Math.max(150, parseInt(minHeightInput.value) || 300);
  api.setMinSize(minGridWidth, minGridHeight);
  settingsDialog.classList.add("hidden");
  api.showViews();
});

// ── Storage Viewer Dialog ─────────────────────
storageClose.addEventListener("click", () => {
  storageDialog.classList.add("hidden");
  api.showViews();
});

function showStorage(data) {
  if (!data) return;
  storageTitle.textContent = `Storage — ${data.cellId}`;
  let html = "";

  // Cookies
  html += `<div class="storage-section"><h4>Cookies (${data.cookies.length})</h4>`;
  if (data.cookies.length) {
    html += `<table class="storage-table"><tr><th>Domain</th><th>Name</th><th>Value</th></tr>`;
    for (const c of data.cookies) {
      html += `<tr><td>${esc(c.domain)}</td><td>${esc(c.name)}</td><td>${esc(c.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="storage-empty">No cookies</p>`;
  }
  html += `</div>`;

  // localStorage
  html += `<div class="storage-section"><h4>localStorage (${data.localStorage.length})</h4>`;
  if (data.localStorage.length) {
    html += `<table class="storage-table"><tr><th>Key</th><th>Value</th></tr>`;
    for (const item of data.localStorage) {
      html += `<tr><td>${esc(item.key)}</td><td>${esc(item.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="storage-empty">No localStorage</p>`;
  }
  html += `</div>`;

  // sessionStorage
  html += `<div class="storage-section"><h4>sessionStorage (${data.sessionStorage.length})</h4>`;
  if (data.sessionStorage.length) {
    html += `<table class="storage-table"><tr><th>Key</th><th>Value</th></tr>`;
    for (const item of data.sessionStorage) {
      html += `<tr><td>${esc(item.key)}</td><td>${esc(item.value)}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p class="storage-empty">No sessionStorage</p>`;
  }
  html += `</div>`;

  storageBody.innerHTML = html;
  api.hideViews();
  storageDialog.classList.remove("hidden");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ── Scroll Handling ───────────────────────────
gridScroll.addEventListener("scroll", () => {
  api.sendScroll(gridScroll.scrollLeft, gridScroll.scrollTop);
});

// ── Grid Size Updates ─────────────────────────
api.onGridSize((data) => {
  gridContent.style.width = data.totalW + "px";
  gridContent.style.height = data.totalH + "px";

  // If viewport wider than 2*minGridWidth, no horizontal scroll needed
  // Scrollbars come from overflow:auto on gridScroll automatically
});

api.onWindowResized(() => {
  // Grid layout is recalculated in main process; scroll container stays in sync
});

// ── Init ──────────────────────────────────────
(async () => {
  const cfg = await api.getGridConfig();
  gridRows = cfg.rows;
  gridCols = cfg.cols;
  minGridWidth = cfg.minGridWidth;
  minGridHeight = cfg.minGridHeight;
  rowsInput.value = gridRows;
  colsInput.value = gridCols;
  minWidthInput.value = minGridWidth;
  minHeightInput.value = minGridHeight;
})();
