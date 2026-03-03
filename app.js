/* PO-Check v0.1
 * - Carga .xlsx/.xlsm
 * - Valida hojas mínimas y presencia de "NOMINE"
 * - Genera log (JSON/TXT) descargable
 *
 * Próximo (v0.2):
 * - detectar celdas con fórmulas rotas
 * - validaciones por columnas mínimas en NOMINE
 * - PO/ND motor (Norma Técnica PO 2024)
 */

/** =========================
 * CONFIG (config.js)
 * ========================= */
const DEFAULT_RULES = {
  mustHaveSheet: "NOMINE",
  nomine: {
    requiredHeaders: [],
    requiredCells: [],
  },
};

const CFG = (window.PO_CHECK_CONFIG && typeof window.PO_CHECK_CONFIG === "object")
  ? window.PO_CHECK_CONFIG
  : {
      appName: "PO-Check",
      envLabel: "Local (GitHub Pages)",
      rules: DEFAULT_RULES,
    };

/** =========================
 * UI refs
 * ========================= */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const filesList = document.getElementById("filesList");

const btnValidate = document.getElementById("btnValidate");
const btnClear = document.getElementById("btnClear");
const btnDownloadJson = document.getElementById("btnDownloadJson");
const btnDownloadTxt = document.getElementById("btnDownloadTxt");

const kpiFiles = document.getElementById("kpiFiles");
const kpiCritical = document.getElementById("kpiCritical");
const kpiWarn = document.getElementById("kpiWarn");
const kpiInfo = document.getElementById("kpiInfo");

const obsTable = document.getElementById("obsTable");
const envLabel = document.getElementById("envLabel");
const fileHint = document.getElementById("fileHint");

const fCritical = document.getElementById("fCritical");
const fWarn = document.getElementById("fWarn");
const fInfo = document.getElementById("fInfo");
const searchBox = document.getElementById("searchBox");

/** =========================
 * State
 * ========================= */
let selectedFiles = [];
let observations = []; // {severity, file, sheet, message}

/** =========================
 * Helpers
 * ========================= */
function sevRank(sev){
  if (sev === "CRITICO") return 3;
  if (sev === "ADVERTENCIA") return 2;
  return 1;
}

function addObs(severity, file, sheet, message){
  observations.push({ severity, file, sheet, message });
}

function resetAll(){
  selectedFiles = [];
  observations = [];
  renderFiles();
  renderObs();
  updateKPIs();
  btnValidate.disabled = true;
  btnClear.disabled = true;
  btnDownloadJson.disabled = true;
  btnDownloadTxt.disabled = true;
  fileInput.value = "";
  fileHint.textContent = "";
}

function downloadText(filename, content){
  const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, obj){
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeSheetName(name){
  return String(name || "").trim().toUpperCase();
}

/** =========================
 * Render
 * ========================= */
function renderFiles(){
  filesList.innerHTML = "";
  kpiFiles.textContent = String(selectedFiles.length);

  if (selectedFiles.length === 0){
    filesList.innerHTML = `<div class="muted small">No hay archivos cargados.</div>`;
    return;
  }

  for (const f of selectedFiles){
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const badge = ext === "xlsm" ? "XLSM" : "XLSX";
    const el = document.createElement("div");
    el.className = "fileItem";
    el.innerHTML = `
      <div>
        <div class="fileName">${escapeHtml(f.name)}</div>
        <div class="muted small">${formatBytes(f.size)}</div>
      </div>
      <div class="badge">${badge}</div>
    `;
    filesList.appendChild(el);
  }
}

function renderObs(){
  const q = (searchBox.value || "").trim().toLowerCase();
  const showC = fCritical.checked;
  const showW = fWarn.checked;
  const showI = fInfo.checked;

  const filtered = observations
    .filter(o => {
      if (o.severity === "CRITICO" && !showC) return false;
      if (o.severity === "ADVERTENCIA" && !showW) return false;
      if (o.severity === "INFO" && !showI) return false;

      if (!q) return true;
      const hay = `${o.severity} ${o.file} ${o.sheet} ${o.message}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => sevRank(b.severity) - sevRank(a.severity));

  obsTable.innerHTML = "";
  if (filtered.length === 0){
    obsTable.innerHTML = `<tr><td colspan="4" class="muted">Sin observaciones (o filtradas).</td></tr>`;
    return;
  }

  for (const o of filtered){
    const sevClass = (o.severity === "CRITICO") ? "bad" : (o.severity === "ADVERTENCIA") ? "warn" : "info";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sev ${sevClass}">${o.severity}</td>
      <td><span class="fileName">${escapeHtml(o.file)}</span></td>
      <td>${escapeHtml(o.sheet || "-")}</td>
      <td>${escapeHtml(o.message)}</td>
    `;
    obsTable.appendChild(tr);
  }
}

function updateKPIs(){
  const c = observations.filter(o => o.severity === "CRITICO").length;
  const w = observations.filter(o => o.severity === "ADVERTENCIA").length;
  const i = observations.filter(o => o.severity === "INFO").length;
  kpiCritical.textContent = String(c);
  kpiWarn.textContent = String(w);
  kpiInfo.textContent = String(i);

  const has = observations.length > 0;
  btnDownloadJson.disabled = !has;
  btnDownloadTxt.disabled = !has;
}

/** =========================
 * Excel parsing
 * ========================= */
async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:"array", cellFormula:true, cellStyles:false });
  return wb;
}

function validateWorkbook(fileName, wb){
  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0){
    addObs("CRITICO", fileName, "-", "El archivo no contiene hojas legibles.");
    return;
  }

  addObs("INFO", fileName, "-", `Hojas detectadas: ${sheetNames.join(", ")}`);

  const normalized = sheetNames.map(normalizeSheetName);
  const must = normalizeSheetName(CFG.rules.mustHaveSheet || "NOMINE");

  if (!normalized.includes(must)){
    addObs("CRITICO", fileName, "-", `No se encontró la hoja obligatoria "${CFG.rules.mustHaveSheet}".`);
  } else {
    addObs("INFO", fileName, CFG.rules.mustHaveSheet, `Hoja "${CFG.rules.mustHaveSheet}" presente.`);
    validateNomine(fileName, wb, CFG.rules.mustHaveSheet);
  }
}

function validateNomine(fileName, wb, sheetName){
  const ws = wb.Sheets[sheetName];
  if (!ws){
    addObs("CRITICO", fileName, sheetName, "No se pudo acceder a la hoja NOMINE.");
    return;
  }

  const ref = ws["!ref"];
  if (!ref){
    addObs("ADVERTENCIA", fileName, sheetName, "La hoja NOMINE parece vacía (!ref no encontrado).");
    return;
  }

  const range = XLSX.utils.decode_range(ref);
  const rows = range.e.r - range.s.r + 1;
  const cols = range.e.c - range.s.c + 1;

  addObs("INFO", fileName, sheetName, `Rango usado: ${ref} (aprox. ${rows} filas x ${cols} columnas).`);

  const requiredHeaders = CFG.rules.nomine?.requiredHeaders || [];
  if (requiredHeaders.length > 0){
    const firstRow = [];
    for (let c = range.s.c; c <= range.e.c; c++){
      const cell = ws[XLSX.utils.encode_cell({r: range.s.r, c})];
      firstRow.push(String(cell?.v ?? "").trim().toUpperCase());
    }
    for (const h of requiredHeaders){
      const hn = String(h).trim().toUpperCase();
      if (!firstRow.includes(hn)){
        addObs("CRITICO", fileName, sheetName, `Header obligatorio no encontrado en la primera fila: "${h}".`);
      }
    }
  } else {
    addObs("INFO", fileName, sheetName, "Headers obligatorios no configurados (ok por ahora).");
  }
}

/** =========================
 * Events
 * ========================= */
function setFiles(files){
  selectedFiles = Array.from(files || [])
    .filter(f => {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      return ext === "xlsx" || ext === "xlsm";
    });

  renderFiles();
  observations = [];
  renderObs();
  updateKPIs();

  const ok = selectedFiles.length > 0;
  btnValidate.disabled = !ok;
  btnClear.disabled = !ok;

  if (!ok){
    fileHint.textContent = "Cargue al menos 1 archivo .xlsx o .xlsm";
  } else {
    fileHint.textContent = `Listo: ${selectedFiles.length} archivo(s) para validación.`;
  }
}

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  if (e.dataTransfer?.files?.length) setFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => {
  setFiles(e.target.files);
});

btnClear.addEventListener("click", resetAll);

btnValidate.addEventListener("click", async () => {
  observations = [];
  renderObs();
  updateKPIs();

  if (typeof XLSX === "undefined"){
    addObs("CRITICO", "-", "-", "No se cargó la librería XLSX (CDN). Revise conexión o bloqueo corporativo.");
    renderObs(); updateKPIs();
    return;
  }

  addObs("INFO", "-", "-", `Validación iniciada (${new Date().toLocaleString()}).`);

  for (const file of selectedFiles){
    try{
      const wb = await readWorkbook(file);
      validateWorkbook(file.name, wb);
    } catch (err){
      addObs("CRITICO", file.name, "-", `Error leyendo Excel: ${String(err?.message || err)}`);
    }
  }

  addObs("INFO", "-", "-", "Validación finalizada.");
  renderObs();
  updateKPIs();
});

btnDownloadJson.addEventListener("click", () => {
  const payload = {
    app: CFG.appName,
    timestamp: new Date().toISOString(),
    files: selectedFiles.map(f => ({ name: f.name, size: f.size })),
    observations
  };
  downloadJson("po-check-log.json", payload);
});

btnDownloadTxt.addEventListener("click", () => {
  const lines = [];
  lines.push(`PO-Check log | ${new Date().toLocaleString()}`);
  lines.push(`Archivos: ${selectedFiles.map(f => f.name).join(" | ")}`);
  lines.push("----");
  for (const o of observations.sort((a,b)=>sevRank(b.severity)-sevRank(a.severity))){
    lines.push(`[${o.severity}] file="${o.file}" sheet="${o.sheet}" :: ${o.message}`);
  }
  downloadText("po-check-log.txt", lines.join("\\n"));
});

[fCritical, fWarn, fInfo, searchBox].forEach(el => el.addEventListener("input", () => renderObs()));

/** =========================
 * Utilities
 * ========================= */
function formatBytes(bytes){
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B","KB","MB","GB"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length-1){ v /= 1024; i++; }
  return `${v.toFixed(i===0?0:1)} ${units[i]}`;
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/** =========================
 * Init
 * ========================= */
(function init(){
  envLabel.textContent = `Modo: ${CFG.envLabel || "Local (GitHub Pages)"}`;
  resetAll();
})();