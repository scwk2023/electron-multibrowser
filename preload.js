const { contextBridge, ipcRenderer } = require("electron");

// Each cell preload — receives row/col via URL query or we use a simpler approach
// The main process will tell us our coordinates
let myRow = -1;
let myCol = -1;

contextBridge.exposeInMainWorld("__mbCellAPI", {
  setCell: (r, c) => {
    myRow = r;
    myCol = c;
  },
  refresh: () => ipcRenderer.invoke("refresh-cell", myRow, myCol),
  viewStorage: () => ipcRenderer.invoke("get-storage", myRow, myCol).then((data) => {
    ipcRenderer.send("show-storage-viewer", data);
  }),
});

// Listen for cell coordinate assignment from main process
ipcRenderer.on("assign-cell", (e, r, c) => {
  myRow = r;
  myCol = c;
});
