const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__toolbarAPI", {
  navigateAll: (url) => ipcRenderer.invoke("navigate-all", url),
  toggleFloatingToolbar: (val) =>
    ipcRenderer.invoke("toggle-floating-toolbar", val),
  getGridConfig: () => ipcRenderer.invoke("get-grid-config"),
  setGridSize: (rows, cols) => ipcRenderer.invoke("set-grid-size", rows, cols),
  setMinSize: (w, h) => ipcRenderer.invoke("set-min-size", w, h),
  getStorage: (r, c) => ipcRenderer.invoke("get-storage", r, c),
  onGridSize: (cb) => ipcRenderer.on("grid-size", (e, v) => cb(v)),
  onWindowResized: (cb) => ipcRenderer.on("window-resized", () => cb()),
  sendScroll: (sx, sy) => ipcRenderer.invoke("scroll-changed", sx, sy),
  hideViews: () => ipcRenderer.invoke("hide-views"),
  showViews: () => ipcRenderer.invoke("show-views"),
});
