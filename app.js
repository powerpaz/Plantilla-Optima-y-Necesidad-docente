/* PO-App v11 (Institucional, sin CDN)
 * - Lee .xlsx/.xlsm (SheetJS local en /vendor)
 * - Valida hojas + reglas mínimas (según Matriz DTD)
 * - Reporte en pantalla + descarga JSON/PDF
 */

const BUILD = { version: "11.0.0", date: "2026-03-05" };
const $ = (id) => document.getElementById(id);

// -------------------------
// Utilidades
// -------------------------
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function isBlank(v){ return v === undefined || v === null || String(v).trim() === ""; }
function isDigits(v){ return /^\d+$/.test(String(v ?? "").trim()); }

function normKey(v){
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function aoaFromSheet(ws){
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
}

function cell(ws, addr){
  const c = ws?.[addr];
  return c ? (c.v ?? "") : "";
}

function addIssue(issues, level, sheet, ref, rule, detail, hint){
  issues.push({ level, sheet, ref, rule, detail, hint });
}

function issueBadge(level){
  if (level === "CRITICO") return '<span class="badge bad">CRÍTICO</span>';
  if (level === "ADVERTENCIA") return '<span class="badge warn">ADVERTENCIA</span>';
  return '<span class="badge info">INFO</span>';
}

function summarizeIssues(issues){
  const c = { CRITICO:0, ADVERTENCIA:0, INFO:0 };
  for (const it of issues) c[it.level] = (c[it.level]||0)+1;
  return c;
}

function findRowIndex(a2d, predicate, maxScan=250){
  const lim = Math.min(a2d.length, maxScan);
  for (let r=0; r<lim; r++) if (predicate(a2d[r] || [])) return r;
  return -1;
}

function findHeaderRowByAny(a2d, wantedKeys, maxScan=250){
  const wanted = wantedKeys.map(normKey);
  return findRowIndex(a2d, (row)=>{
    const keys = (row||[]).map(normKey);
    let hits = 0;
    for (const w of wanted) if (keys.includes(w)) hits++;
    return hits >= 2; // mínimo 2 coincidencias
  }, maxScan);
}

function pickColIndex(headers, variants){
  const keys = headers.map(normKey);
  for (const v of variants){
    const ix = keys.indexOf(normKey(v));
    if (ix !== -1) return ix;
  }
  return -1;
}

function buildIssuesTable(issues){
  const rows = issues.map((it, i)=>`
    <tr>
      <td class="mono">${i+1}</td>
      <td>${issueBadge(it.level)}</td>
      <td>${escapeHtml(it.sheet)}</td>
      <td class="mono">${escapeHtml(it.ref || "-")}</td>
      <td>${escapeHtml(it.rule)}</td>
      <td>${escapeHtml(it.detail)}</td>
      <td>${escapeHtml(it.hint || "-")}</td>
    </tr>
  `).join("");

  return `
    <div class="tableWrap">
      <table class="table smallTable">
        <thead>
          <tr>
            <th>#</th><th>Nivel</th><th>Hoja</th><th>Ref.</th><th>Regla</th><th>Detalle</th><th>Sugerencia</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="muted">Sin inconsistencias detectadas.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function buildSummary(meta, counts){
  const ok = counts.CRITICO === 0;
  return `
    <div class="kpiRow">
      <div class="kpi"><div class="kpiLabel">AMIE</div><div class="kpiValue mono">${escapeHtml(meta.amie || "-")}</div></div>
      <div class="kpi"><div class="kpiLabel">Institución</div><div class="kpiValue">${escapeHtml(meta.ie || "-")}</div></div>
      <div class="kpi"><div class="kpiLabel">Estado</div><div class="kpiValue ${ok?"okText":"badText"}">${ok?"VALIDADO":"CON INCONSISTENCIAS"}</div></div>
    </div>
    <div class="kpiRow">
      <div class="kpi"><div class="kpiLabel">Críticos</div><div class="kpiValue badText">${counts.CRITICO}</div></div>
      <div class="kpi"><div class="kpiLabel">Advertencias</div><div class="kpiValue warnText">${counts.ADVERTENCIA}</div></div>
      <div class="kpi"><div class="kpiLabel">Info</div><div class="kpiValue">${counts.INFO}</div></div>
    </div>
    <div class="small muted">Archivo: ${escapeHtml(meta.filename || "-")} · Build v${BUILD.version}</div>
  `;
}

// -------------------------
// Diagnóstico dependencias
// -------------------------
function checkLibsAndWarn(){
  const statusEl = $("libStatus");
  const missing = [];
  if (typeof XLSX === "undefined") missing.push("XLSX");
  if (!window.jspdf || !window.jspdf.jsPDF) missing.push("jsPDF");

  if (!statusEl) return missing.length === 0;

  statusEl.style.display = "block";
  if (missing.length){
    statusEl.className = "note danger";
    statusEl.innerHTML = `
      <b>Dependencias no cargadas:</b> ${missing.join(", ")}<br>
      <span class="muted">
        Esta versión NO usa CDN. Asegúrate de subir <code>vendor/</code> junto a <code>index.html</code> en el folder que GitHub Pages publica (root o <code>/docs</code>).
        Luego recarga con <b>Ctrl+F5</b>.
      </span>
    `;
    return false;
  }

  statusEl.className = "note";
  statusEl.innerHTML = `<b>Dependencias OK:</b> XLSX + jsPDF cargados localmente. <span class="muted">Build v${BUILD.version}</span>`;
  return true;
}

// -------------------------
// Validaciones
// -------------------------
function validateWorkbook(wb, filename){
  const issues = [];
  const meta = { filename, amie:"", ie:"" };

  const requiredSheets = ["Pasos","Nómina","Par_PO","DIS_TRA","PlanEstudio","Param"];
  const present = new Set(wb.SheetNames || []);

  for (const s of requiredSheets){
    if (!present.has(s)){
      addIssue(issues, "CRITICO", "(libro)", "-", "Hoja obligatoria faltante", `No se encontró la hoja "${s}".`, "Usa la plantilla oficial y pega datos sin cambiar nombres/estructuras.");
    }
  }

  // -------- Nómina --------
  const wsNom = wb.Sheets["Nómina"];
  if (wsNom){
    const a = aoaFromSheet(wsNom);

    meta.amie = String(cell(wsNom, "B5") || "").trim();
    meta.ie   = String(cell(wsNom, "B6") || "").trim();
    if (isBlank(meta.amie)) meta.amie = String(cell(wsNom, "B4") || "").trim();

    if (isBlank(meta.amie)){
      addIssue(issues, "CRITICO", "Nómina", "B5", "AMIE obligatorio", "No se encontró AMIE en B5 (ni en B4).", "Selecciona/ingresa AMIE en la hoja Nómina.");
    }

    const headerIdx = findHeaderRowByAny(a, [
      "nro. de cedula", "cedula", "nro de cedula", "no. cedula",
      "nombres y apellidos", "apellidos y nombres",
      "funxie", "esta en la ie", "está en la ie"
    ]);

    if (headerIdx === -1){
      addIssue(issues, "CRITICO", "Nómina", "-", "Estructura de tabla", "No se pudo ubicar la fila de cabeceras de la tabla Nómina.", "No renombres cabeceras ni muevas la tabla; pega datos dentro de la tabla.");
    } else {
      const headers = (a[headerIdx] || []).map(v=>String(v??"").trim());
      const idxCed  = pickColIndex(headers, ["Nro. de cédula","Nro de cédula","Cédula","Cedula","No. Cédula","No. Cedula"]);
      const idxNom  = pickColIndex(headers, ["Nombres y Apellidos","Apellidos y Nombres","Servidor","Nombre"]);
      const idxFunx = pickColIndex(headers, ["FUNxIE","FUNXIE","Función en la IE","Funcion en la IE","Función"]);
      const idxEsta = pickColIndex(headers, ["Esta en la IE","Está en la IE","En la IE","Se encuentra en la IE"]);
      const idxObs  = pickColIndex(headers, ["Observación","Observacion","Observaciones"]);

      const reqCols = [
        [idxCed, "Cédula"],
        [idxNom, "Nombres"],
        [idxFunx, "FUNxIE"],
        [idxEsta, "Está en la IE"],
      ];
      for (const [ix, name] of reqCols){
        if (ix === -1) addIssue(issues, "CRITICO", "Nómina", "(tabla)", "Columna obligatoria faltante", `No existe columna "${name}" (cabecera).`, "Restaura cabeceras originales de la plantilla.");
      }

      const seen = new Map();
      for (let r = headerIdx+1; r < a.length; r++){
        const row = a[r] || [];
        const anyData = row.some(v=>!isBlank(v));
        if (!anyData) continue;

        const ced  = String(row[idxCed] ?? "").trim();
        const nom  = String(row[idxNom] ?? "").trim();
        const funx = String(row[idxFunx] ?? "").trim();
        const esta = String(row[idxEsta] ?? "").trim();

        if (isBlank(ced)){
          addIssue(issues, "ADVERTENCIA", "Nómina", `fila ${r+1}`, "Fila sin cédula", "Hay datos pero falta cédula.", "Completa cédula o elimina fila.");
          continue;
        }

        if (!isDigits(ced) || ced.length !== 10){
          addIssue(issues, "CRITICO", "Nómina", `fila ${r+1}`, "Cédula inválida", `"${ced}" no es numérica de 10 dígitos.`, "Corrige a 10 dígitos, sin espacios.");
        }

        if (seen.has(ced)){
          addIssue(issues, "ADVERTENCIA", "Nómina", `fila ${r+1}`, "Cédula duplicada", `La cédula ${ced} se repite (antes en fila ${seen.get(ced)}).`, "Revisa duplicados.");
        } else {
          seen.set(ced, r+1);
        }

        if (isBlank(nom)){
          addIssue(issues, "ADVERTENCIA", "Nómina", `fila ${r+1}`, "Nombre vacío", "La fila tiene cédula pero no tiene nombre.", "Completa nombres y apellidos.");
        }

        if (isBlank(funx)){
          addIssue(issues, "CRITICO", "Nómina", `fila ${r+1}`, "FUNxIE obligatorio", "FUNxIE está vacío.", "Completa FUNxIE.");
        }

        if (isBlank(esta)){
          addIssue(issues, "CRITICO", "Nómina", `fila ${r+1}`, "'Está en la IE' obligatorio", "Campo 'Está en la IE' está vacío.", "Selecciona Si/No.");
        } else {
          const v = normKey(esta);
          if (!(v === "si" || v === "no")){
            addIssue(issues, "ADVERTENCIA", "Nómina", `fila ${r+1}`, "Valores permitidos", `"${esta}" no es Si/No.`, "Usa exactamente: Si o No.");
          }
        }

        if (idxObs !== -1){
          const obs = String(row[idxObs] ?? "").trim();
          if (!isBlank(obs) && obs.length < 5){
            addIssue(issues, "INFO", "Nómina", `fila ${r+1}`, "Observación muy corta", "La observación parece incompleta.", "Si aplica, amplía el motivo.");
          }
        }
      }
    }
  }

  // -------- Pasos (checklist) --------
  const wsPasos = wb.Sheets["Pasos"];
  if (wsPasos){
    const aP = aoaFromSheet(wsPasos);
    const headerP = findHeaderRowByAny(aP, ["paso","descripcion","descripción"]);
    if (headerP === -1){
      addIssue(issues, "ADVERTENCIA", "Pasos", "-", "Checklist no detectable", "No se identificó tabla Paso/Descripción.", "Evita modificar el formato de la hoja Pasos.");
    }
  }

  // -------- Par_PO --------
  const wsPar = wb.Sheets["Par_PO"];
  if (wsPar){
    const a = aoaFromSheet(wsPar);
    const headerIdx = findHeaderRowByAny(a, ["grado", "curso", "jornada", "paralelo", "estudiantes"]);

    if (headerIdx === -1){
      addIssue(issues, "CRITICO", "Par_PO", "-", "Estructura de tabla", "No se pudo ubicar cabecera (Grado/Curso/Jornada/Paralelo/Estudiantes).", "Restaura cabeceras originales.");
    } else {
      const headers = (a[headerIdx] || []).map(v=>String(v??"").trim());
      const idxGrado = pickColIndex(headers, ["Grado / Curso","Grado Curso","Curso","Grado"]);
      const idxJor   = pickColIndex(headers, ["Jornada","Jornada (Texto)"]);
      const idxPar   = pickColIndex(headers, ["Paralelo","Paralelos"]);
      const idxEst   = pickColIndex(headers, ["Nro. estudiantes","Nro estudiantes","No. estudiantes","Estudiantes"]);
      const idxEsp   = pickColIndex(headers, ["Especialidad","Figura profesional","Especialidad BT"]);

      if (idxGrado === -1) addIssue(issues, "CRITICO", "Par_PO", "(tabla)", "Columna faltante", "No existe columna Grado/Curso.", "No renombres cabeceras.");
      if (idxJor   === -1) addIssue(issues, "CRITICO", "Par_PO", "(tabla)", "Columna faltante", "No existe columna Jornada.", "No renombres cabeceras.");
      if (idxPar   === -1) addIssue(issues, "CRITICO", "Par_PO", "(tabla)", "Columna faltante", "No existe columna Paralelo.", "No renombres cabeceras.");
      if (idxEst   === -1) addIssue(issues, "CRITICO", "Par_PO", "(tabla)", "Columna faltante", "No existe columna Nro. estudiantes.", "No renombres cabeceras.");

      for (let r = headerIdx+1; r < a.length; r++){
        const row = a[r] || [];
        const anyData = row.some(v=>!isBlank(v));
        if (!anyData) continue;

        const grado = String(row[idxGrado] ?? "").trim();
        const jor   = String(row[idxJor] ?? "").trim();
        const par   = String(row[idxPar] ?? "").trim();
        const estRaw= row[idxEst];

        if (isBlank(grado)) addIssue(issues, "CRITICO", "Par_PO", `fila ${r+1}`, "Grado/Curso obligatorio", "Grado/Curso está vacío.", "Completa el grado/curso.");
        if (isBlank(jor))   addIssue(issues, "CRITICO", "Par_PO", `fila ${r+1}`, "Jornada obligatoria", "Jornada está vacía.", "Selecciona jornada.");
        if (isBlank(par))   addIssue(issues, "ADVERTENCIA", "Par_PO", `fila ${r+1}`, "Paralelo", "Paralelo está vacío.", "Completa paralelo si aplica.");

        const est = Number(estRaw);
        if (!Number.isFinite(est) || est < 0){
          addIssue(issues, "CRITICO", "Par_PO", `fila ${r+1}`, "Nro. estudiantes", `"${estRaw}" no es numérico >= 0.`, "Corrige estudiantes (número).");
        }

        const isBT = /\bbt\b|\bbtp\b|bachillerato/i.test(normKey(grado));
        if (isBT && idxEsp !== -1){
          const esp = String(row[idxEsp] ?? "").trim();
          if (isBlank(esp)){
            addIssue(issues, "CRITICO", "Par_PO", `fila ${r+1}`, "Especialidad BT/BTP", "BT/BTP sin especialidad.", "Completa figura profesional/especialidad.");
          }
        }
      }
    }
  }

  // -------- DIS_TRA --------
  const wsDis = wb.Sheets["DIS_TRA"];
  if (wsDis){
    const a = aoaFromSheet(wsDis);
    if (a.length < 5){
      addIssue(issues, "ADVERTENCIA", "DIS_TRA", "-", "Hoja con pocos datos", "DIS_TRA tiene muy pocas filas.", "Si aún no has llenado carga horaria, completa antes de enviar.");
    }
    const lim = Math.min(a.length, 450);
    for (let r=0; r<lim; r++){
      const row = a[r] || [];
      for (let c=0; c<row.length; c++){
        const n = Number(row[c]);
        if (Number.isFinite(n) && n < 0){
          addIssue(issues, "CRITICO", "DIS_TRA", `fila ${r+1}`, "Valor negativo", `Se encontró valor negativo (${n}).`, "No deben existir horas/cargas negativas.");
          r = lim; break;
        }
      }
    }
  }

  return { issues, meta };
}

// -------------------------
// Render Pasos
// -------------------------
function renderWorkflowSteps(wb){
  const box = $("workflowSteps");
  if (!box) return;
  box.innerHTML = "";

  const ws = wb.Sheets["Pasos"];
  if (!ws){
    box.innerHTML = `<div class="muted">No se encontró la hoja Pasos.</div>`;
    return;
  }

  const a = aoaFromSheet(ws);
  const headerIdx = findHeaderRowByAny(a, ["paso","descripcion","descripción"]);
  if (headerIdx === -1){
    box.innerHTML = `<div class="muted">No se pudo detectar la tabla Paso/Descripción.</div>`;
    return;
  }

  const headers = (a[headerIdx]||[]).map(v=>String(v??"").trim());
  const idxPaso = pickColIndex(headers, ["Paso","Nro","No","#"]);
  const idxDesc = pickColIndex(headers, ["Descripción","Descripcion","Detalle"]);
  const idxResp = pickColIndex(headers, ["Responsable","Responsables"]);

  let rows = "";
  for (let r=headerIdx+1; r<a.length; r++){
    const row = a[r] || [];
    const anyData = row.some(v=>!isBlank(v));
    if (!anyData) continue;

    const paso = idxPaso !== -1 ? row[idxPaso] : (r-headerIdx);
    const desc = idxDesc !== -1 ? row[idxDesc] : "";
    const resp = idxResp !== -1 ? row[idxResp] : "";

    if (isBlank(desc)) continue;

    rows += `
      <tr>
        <td class="mono">${escapeHtml(paso)}</td>
        <td>${escapeHtml(desc)}</td>
        <td>${escapeHtml(resp)}</td>
      </tr>
    `;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table smallTable">
        <thead><tr><th>Paso</th><th>Descripción</th><th>Responsable</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="muted">Sin pasos detectados.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// -------------------------
// Reportes (JSON / PDF)
// -------------------------
function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(report){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(14);
  doc.text(`PO-App v${BUILD.version} · Reporte de validación`, 40, 40);

  doc.setFontSize(10);
  doc.text(`Archivo: ${report.meta.filename || "-"}`, 40, 60);
  doc.text(`AMIE: ${report.meta.amie || "-"} · IE: ${report.meta.ie || "-"}`, 40, 74);

  const counts = summarizeIssues(report.issues);
  doc.text(`Críticos: ${counts.CRITICO} · Advertencias: ${counts.ADVERTENCIA} · Info: ${counts.INFO}`, 40, 92);

  const body = report.issues.map((it, i)=>[
    String(i+1), it.level, it.sheet, it.ref || "-", it.rule, it.detail
  ]);

  doc.autoTable({
    startY: 110,
    head: [["#","Nivel","Hoja","Ref","Regla","Detalle"]],
    body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 62 },
      2: { cellWidth: 70 },
      3: { cellWidth: 55 },
      4: { cellWidth: 120 },
      5: { cellWidth: 160 },
    },
    didDrawPage: (data)=>{
      doc.setFontSize(8);
      doc.text(`Generado: ${new Date().toLocaleString()}`, 40, 820);
    }
  });

  doc.save(`reporte_PO_${(report.meta.amie||"AMIE").replace(/\s+/g,"_")}.pdf`);
}

// -------------------------
// UI + flujo
// -------------------------
let LAST_REPORT = null;

async function readWorkbookFromFile(file){
  const data = await file.arrayBuffer();
  // SheetJS puede leer .xlsm; no ejecuta macros.
  return XLSX.read(data, { type: "array" });
}

function bindExcelFlow(){
  const input = $("excelInput");
  const btn = $("btnProcesarExcel");
  const btnPdf = $("btnDownloadPdf");
  const btnJson = $("btnDownloadJson");
  const hint = $("excelHint");

  input.addEventListener("change", ()=>{
    const ok = input.files && input.files.length;
    btn.disabled = !ok;
    hint.textContent = ok ? `Archivo seleccionado: ${input.files[0].name}` : "Sube un archivo para habilitar la validación.";
  });

  btn.addEventListener("click", async ()=>{
    if (!checkLibsAndWarn()){
      alert("No se cargó XLSX. Verifica la carpeta vendor/ en el sitio publicado.");
      return;
    }

    const file = input.files?.[0];
    if (!file) return;

    try{
      const wb = await readWorkbookFromFile(file);
      const { issues, meta } = validateWorkbook(wb, file.name);
      const counts = summarizeIssues(issues);

      LAST_REPORT = { meta, issues, counts, build: BUILD, generated_at: new Date().toISOString() };

      $("validationSummary").innerHTML = buildSummary(meta, counts);
      $("issuesTable").innerHTML = buildIssuesTable(issues);
      renderWorkflowSteps(wb);

      btnPdf.disabled = false;
      btnJson.disabled = false;

    } catch (e){
      console.error(e);
      alert("No se pudo leer el archivo. Si es .xlsm, asegúrate de que no esté dañado y vuelve a intentar.");
    }
  });

  btnPdf.addEventListener("click", ()=>{
    if (!LAST_REPORT) return;
    if (!checkLibsAndWarn()) return;
    downloadPdf(LAST_REPORT);
  });

  btnJson.addEventListener("click", ()=>{
    if (!LAST_REPORT) return;
    downloadJson(LAST_REPORT, `reporte_PO_${(LAST_REPORT.meta.amie||"AMIE").replace(/\s+/g,"_")}.json`);
  });

  $("btnDiagnostico").addEventListener("click", ()=>{
    const diag = {
      build: BUILD,
      hasXLSX: typeof XLSX !== "undefined",
      hasJsPDF: !!(window.jspdf && window.jspdf.jsPDF),
      location: window.location.href,
      publishedHint: "Si GitHub Pages está en /docs, index.html + vendor/ deben estar dentro de /docs",
    };
    alert(JSON.stringify(diag, null, 2));
  });
}

// -------------------------
// Calculadora + tabla LOEI (se mantiene)
// -------------------------
function initLoeiTable(){
  const tbody = $("loeiTable");
  if (!tbody) return;

  const rows = [
    { marco: "LOEI anterior", periodos: 30, hrsPedSem: 40.00, hrsPedDia: 8.00, acomp: 10, hrsAcompSem: 13.33, hrsAcompDia: 2.67, actIE: 0.00, total: 53.33 },
    { marco: "LOEI reformada", periodos: 25, hrsPedSem: 40.00, hrsPedDia: 8.00, acomp: 5, hrsAcompSem: 8.00, hrsAcompDia: 1.60, actIE: 0.00, total: 48.00 }
  ];

  tbody.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.marco}</td>
      <td class="mono">${r.periodos}</td>
      <td class="mono">${r.hrsPedSem.toFixed(2)}</td>
      <td class="mono">${r.hrsPedDia.toFixed(2)}</td>
      <td class="mono">${r.acomp}</td>
      <td class="mono">${r.hrsAcompSem.toFixed(2)}</td>
      <td class="mono">${r.hrsAcompDia.toFixed(2)}</td>
      <td class="mono">${r.actIE.toFixed(2)}</td>
      <td class="mono">${r.total.toFixed(2)}</td>
    </tr>
  `).join("");
}

function initCalculator(){
  const btnCalcular = $("btnCalcular");
  const btnLimpiar = $("btnLimpiar");
  if (!btnCalcular || !btnLimpiar) return;

  const nivel = $("nivel");
  const paralelos = $("paralelos");
  const carga = $("carga");
  const periodos = $("periodos");
  const kpiDoc = $("kpiDocentes");
  const kpiFor = $("kpiFormula");
  const detalle = $("detalleCalc");

  function calc(){
    const niv = nivel.value;
    const p = Number(paralelos.value || 0);
    const c = Number(carga.value || 0);
    const per = Number(periodos.value || 25);

    let docentes = 0;
    let formula = "-";
    let det = "";

    if (niv === "INICIAL"){
      docentes = Math.ceil(p);
      formula = "Docentes = paralelos";
      det = `Inicial: 1 docente por paralelo → ${p}`;
    } else {
      docentes = per > 0 ? Math.ceil((p * c) / per) : 0;
      formula = "Docentes = (paralelos × carga) / períodos";
      det = `EGB/BGU: (${p} × ${c}) / ${per} = ${((p*c)/per || 0).toFixed(2)}`;
    }

    kpiDoc.textContent = String(docentes);
    kpiFor.textContent = formula;
    detalle.textContent = det;
  }

  btnCalcular.addEventListener("click", calc);
  btnLimpiar.addEventListener("click", ()=>{
    paralelos.value = 0;
    carga.value = 0;
    periodos.value = 25;
    kpiDoc.textContent = "0";
    kpiFor.textContent = "-";
    detalle.textContent = "";
  });

  nivel.addEventListener("change", ()=>{
    const wrapCarga = $("wrapCarga");
    wrapCarga.style.display = (nivel.value === "EGB_BGU") ? "block" : "none";
  });

  // estado inicial
  const wrapCarga = $("wrapCarga");
  wrapCarga.style.display = (nivel.value === "EGB_BGU") ? "block" : "none";
}

function init(){
  const env = $("envLabel");
  if (env) env.textContent = `Modo: Institucional (sin CDN) · Build v${BUILD.version}`;

  checkLibsAndWarn();
  bindExcelFlow();
  initLoeiTable();
  initCalculator();
}

document.addEventListener("DOMContentLoaded", init);
