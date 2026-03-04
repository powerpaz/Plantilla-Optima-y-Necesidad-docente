/* PO-App v7
 * Novedades:
 * - Validador integral de plantilla PO (.xlsm/.xlsx) basado en la Matriz DTD:
 *   - Verifica existencia de hojas clave.
 *   - Valida Nómina (cédula, FUNxIE, 'Está en la IE').
 *   - Valida Par_PO (paralelos/estudiantes, campos obligatorios, BT/BTP).
 *   - Valida DIS_TRA (carga horaria por docente, valores numéricos y totales razonables).
 * - Genera reporte descargable (JSON + PDF).
 *
 * Nota: XLSX (SheetJS) no calcula fórmulas; el validador se centra en datos ingresados.
 */

const $ = (id) => document.getElementById(id);

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function clear(el){ el.innerHTML = ""; }

function toIntSafe(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isBlank(v){
  return v === undefined || v === null || String(v).trim() === "";
}

function isDigits(s){
  return /^\d+$/.test(String(s || "").trim());
}

function normalizeHeader(v){
  return String(v ?? "").trim().replace(/\s+/g," ");
}

function findRowIndex(a2d, predicate, maxScan=200){
  const lim = Math.min(a2d.length, maxScan);
  for (let r=0;r<lim;r++){
    if (predicate(a2d[r] || [])) return r;
  }
  return -1;
}

function aoaFromSheet(ws){
  return XLSX.utils.sheet_to_json(ws, { header:1, defval:"", blankrows:false });
}

function cell(ws, addr){
  const c = ws?.[addr];
  if (!c) return "";
  return c.v ?? "";
}

function addIssue(issues, level, sheet, ref, rule, detail, hint){
  issues.push({
    level,
    sheet,
    ref,
    rule,
    detail,
    hint
  });
}

function issueBadge(level){
  if (level === "CRITICO") return '<span class="badge bad">CRÍTICO</span>';
  if (level === "ADVERTENCIA") return '<span class="badge warn">ADVERTENCIA</span>';
  return '<span class="badge info">INFO</span>';
}

function summarizeIssues(issues){
  const counts = { CRITICO:0, ADVERTENCIA:0, INFO:0 };
  for (const it of issues){ counts[it.level] = (counts[it.level]||0)+1; }
  return counts;
}

function buildIssuesTable(issues){
  const rows = issues.map((it, idx) => `
    <tr>
      <td class="mono">${idx+1}</td>
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
            <th>#</th>
            <th>Nivel</th>
            <th>Hoja</th>
            <th>Ref.</th>
            <th>Regla</th>
            <th>Detalle</th>
            <th>Sugerencia</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">Sin inconsistencias detectadas.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function buildSummary(meta, counts){
  const ok = counts.CRITICO === 0;
  return `
    <div class="kpiRow">
      <div class="kpi">
        <div class="kpiLabel">AMIE</div>
        <div class="kpiValue mono">${escapeHtml(meta.amie || "-")}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Institución</div>
        <div class="kpiValue">${escapeHtml(meta.ie || "-")}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Estado</div>
        <div class="kpiValue ${ok?"okText":"badText"}">${ok?"VALIDADO":"CON INCONSISTENCIAS"}</div>
      </div>
    </div>
    <div class="kpiRow">
      <div class="kpi">
        <div class="kpiLabel">Críticos</div>
        <div class="kpiValue badText">${counts.CRITICO}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Advertencias</div>
        <div class="kpiValue warnText">${counts.ADVERTENCIA}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Info</div>
        <div class="kpiValue">${counts.INFO}</div>
      </div>
    </div>
    <div class="small muted">Archivo: ${escapeHtml(meta.filename || "-")}</div>
  `;
}

// =========================
// VALIDACIONES
// =========================

function validateWorkbook(wb, filename){
  const issues = [];
  const meta = { filename, amie:"", ie:"" };

  const requiredSheets = ["Pasos","Nómina","Par_PO","DIS_TRA","PlanEstudio","Param"]; // núcleo
  const present = new Set(wb.SheetNames || []);

  for (const s of requiredSheets){
    if (!present.has(s)){
      addIssue(issues, "CRITICO", "(libro)", "-", "Hoja obligatoria faltante", `No se encontró la hoja "${s}".`, "Vuelve a descargar la plantilla oficial y copia tus datos ahí.");
    }
  }

  // ===== Nómina =====
  const wsNom = wb.Sheets["Nómina"];
  if (wsNom){
    const a = aoaFromSheet(wsNom);

    // Metadatos básicos
    meta.amie = String(cell(wsNom, "B5") || "").trim();
    meta.ie = String(cell(wsNom, "B6") || "").trim();

    if (isBlank(meta.amie)){
      addIssue(issues, "CRITICO", "Nómina", "B5", "AMIE obligatorio", "La celda AMIE está vacía.", "Selecciona/ingresa el AMIE en Nómina.");
    } else {
      if (!/^[0-9A-Za-z]{6,12}$/.test(meta.amie)){
        addIssue(issues, "ADVERTENCIA", "Nómina", "B5", "Formato AMIE", `AMIE "${meta.amie}" tiene un formato inusual.`, "Verifica que no tenga espacios ni caracteres extra.");
      }
    }

    // Tabla NOMINA: buscar cabecera
    const headerIdx = findRowIndex(a, (row) => row.some(v => normalizeHeader(v) === "Nro. de cédula"));
    if (headerIdx === -1){
      addIssue(issues, "CRITICO", "Nómina", "-", "Estructura de tabla", "No se encontró la cabecera " + '"Nro. de cédula"' + ".", "No cambies el formato de la plantilla (filas/columnas/cabeceras).");
    } else {
      const headers = (a[headerIdx] || []).map(normalizeHeader);
      const idxCed = headers.indexOf("Nro. de cédula");
      const idxNom = headers.indexOf("Nombres y Apellidos");
      const idxFunx = headers.indexOf("FUNxIE");
      const idxEsta = headers.indexOf("Esta en la IE");
      const idxObs = headers.indexOf("Observación");

      const requiredCols = [
        [idxCed, "Nro. de cédula"],
        [idxNom, "Nombres y Apellidos"],
        [idxFunx, "FUNxIE"],
        [idxEsta, "Esta en la IE"],
      ];
      for (const [ix, name] of requiredCols){
        if (ix === -1) addIssue(issues, "CRITICO", "Nómina", "(tabla)", "Columna obligatoria faltante", `No existe la columna "${name}".`, "No renombres cabeceras.");
      }

      // filas
      for (let r = headerIdx+1; r < a.length; r++){
        const row = a[r] || [];
        const ced = String(row[idxCed] ?? "").trim();
        const nom = String(row[idxNom] ?? "").trim();
        const funx = String(row[idxFunx] ?? "").trim();
        const esta = String(row[idxEsta] ?? "").trim();
        const obs = idxObs>-1 ? String(row[idxObs] ?? "").trim() : "";

        if (isBlank(ced) && isBlank(nom)){
          // fin probable
          continue;
        }

        // Cédula
        if (!isBlank(ced)){
          if (!isDigits(ced) || String(ced).length !== 10){
            addIssue(issues, "CRITICO", "Nómina", `Fila ${r+1}`, "Cédula inválida", `"${ced}" no tiene 10 dígitos numéricos.`, "Corrige la cédula (10 dígitos, sin guiones)." );
          }
        } else {
          addIssue(issues, "ADVERTENCIA", "Nómina", `Fila ${r+1}`, "Cédula vacía", `Hay un registro con nombre "${nom || "(sin nombre)"}" pero sin cédula.`, "Completa o elimina el registro." );
        }

        // FUNxIE + Está en IE
        if (!isBlank(ced) || !isBlank(nom)){
          if (isBlank(funx)){
            addIssue(issues, "CRITICO", "Nómina", `Fila ${r+1}`, "FUNxIE obligatorio", "No se ha seleccionado FUNxIE.", "Usa la lista desplegable (Docente/Directivo/DECE/etc.).");
          }
          if (isBlank(esta)){
            addIssue(issues, "CRITICO", "Nómina", `Fila ${r+1}`, "Estado en IE obligatorio", "No se ha seleccionado si está laborando en la IE.", "Usa la lista desplegable (Si/No).");
          } else {
            const e = esta.toUpperCase();
            if (!(e === "SI" || e === "SÍ" || e === "NO")){
              addIssue(issues, "ADVERTENCIA", "Nómina", `Fila ${r+1}`, "Valores permitidos", `"Esta en la IE" tiene "${esta}".`, "Usa solo Si/No desde la lista desplegable.");
            }
          }

          // Observación si es docente añadido por IE
          if (!isBlank(obs) && obs.toLowerCase().includes("remitido") && isBlank(funx)){
            addIssue(issues, "ADVERTENCIA", "Nómina", `Fila ${r+1}`, "Consistencia", "Observación sugiere que fue añadido por la IE, pero FUNxIE está vacío.", "Completa FUNxIE y revisa el registro.");
          }
        }
      }
    }
  }

  // ===== Par_PO =====
  const wsPar = wb.Sheets["Par_PO"];
  if (wsPar){
    const a = aoaFromSheet(wsPar);

    // Buscar tabla PARALELO
    const headerIdx = findRowIndex(a, (row) => row.some(v => normalizeHeader(v) === "Grado / Curso"));
    if (headerIdx === -1){
      addIssue(issues, "CRITICO", "Par_PO", "-", "Estructura de tabla", "No se encontró la cabecera " + '"Grado / Curso"' + ".", "No modifiques el formato de la plantilla.");
    } else {
      const headers = (a[headerIdx] || []).map(normalizeHeader);
      const idxGr = headers.indexOf("Grado / Curso");
      const idxEsp = headers.indexOf("Especialidad BT /BTP");
      const idxJor = headers.indexOf("Jornada");
      const idxParal = headers.indexOf("Paralelo");
      const idxEst = headers.indexOf("Nro. estudiantes");

      for (let r = headerIdx+1; r < a.length; r++){
        const row = a[r] || [];
        const grado = String(row[idxGr] ?? "").trim();
        const esp = idxEsp>-1 ? String(row[idxEsp] ?? "").trim() : "";
        const jornada = String(row[idxJor] ?? "").trim();
        const paralelo = String(row[idxParal] ?? "").trim();
        const est = row[idxEst];

        const allBlank = [grado, jornada, paralelo, String(est ?? "").trim()].every(isBlank);
        if (allBlank) continue;

        if (isBlank(grado)) addIssue(issues, "CRITICO", "Par_PO", `Fila ${r+1}`, "Grado/Ccurso obligatorio", "Falta " + '"Grado / Curso"' + ".", "Selecciona el grado desde la lista.");
        if (isBlank(jornada)) addIssue(issues, "CRITICO", "Par_PO", `Fila ${r+1}`, "Jornada obligatoria", "Falta " + '"Jornada"' + ".", "Selecciona la jornada desde la lista.");
        if (isBlank(paralelo)) addIssue(issues, "CRITICO", "Par_PO", `Fila ${r+1}`, "Paralelo obligatorio", "Falta " + '"Paralelo"' + ".", "Ej.: A, B, C...");

        // estudiantes
        if (isBlank(est)){
          addIssue(issues, "CRITICO", "Par_PO", `Fila ${r+1}`, "Nro. estudiantes obligatorio", "Falta número de estudiantes.", "Ingresa un entero >= 0.");
        } else {
          const n = toIntSafe(est);
          if (n === null || n < 0){
            addIssue(issues, "CRITICO", "Par_PO", `Fila ${r+1}`, "Nro. estudiantes inválido", `Valor "${est}" no es un entero >= 0.`, "Usa solo números (sin texto).");
          }
          if (n !== null && n > 60){
            addIssue(issues, "ADVERTENCIA", "Par_PO", `Fila ${r+1}`, "Nro. estudiantes alto", `Paralelo con ${n} estudiantes.`, "Verifica (posible error de digitación).");
          }
        }

        // BT / BTP requieren especialidad
        const gUp = grado.toUpperCase();
        if ((gUp.includes("BACH") || gUp.includes("BTP") || gUp.includes("TÉCNICO") || gUp.includes("TECNICO")) && isBlank(esp)){
          addIssue(issues, "ADVERTENCIA", "Par_PO", `Fila ${r+1}`, "Especialidad recomendada", "Parece ser BT/BTP, pero falta especialidad.", "Selecciona la especialidad (si aplica).");
        }
      }
    }
  }

  // ===== DIS_TRA =====
  const wsDis = wb.Sheets["DIS_TRA"];
  if (wsDis){
    const a = aoaFromSheet(wsDis);
    const headerIdx = findRowIndex(a, (row) => row.some(v => normalizeHeader(v) === "Tot_General"));

    if (headerIdx === -1){
      addIssue(issues, "CRITICO", "DIS_TRA", "-", "Estructura de tabla", "No se encontró la cabecera " + '"Tot_General"' + ".", "No modifiques el formato de la plantilla.");
    } else {
      const headers = (a[headerIdx] || []).map(normalizeHeader);
      const idxNro = headers.indexOf("Nro.");
      const idxNom = headers.indexOf("Nómina");
      const idxFun = headers.indexOf("Función");
      const idxTot = headers.indexOf("Tot_General");

      if (idxNro === -1 || idxNom === -1 || idxTot === -1){
        addIssue(issues, "CRITICO", "DIS_TRA", "(cabecera)", "Columnas clave", "No se detectan columnas Nro./Nómina/Tot_General.", "Plantilla alterada.");
      } else {
        const startCarga = idxTot + 1;

        // Escaneo limitado (evitar archivos gigantes). En práctica se usa un rango corto.
        const maxRows = Math.min(a.length, headerIdx + 3000);

        for (let r = headerIdx+1; r < maxRows; r++){
          const row = a[r] || [];
          const nro = row[idxNro];
          const nom = String(row[idxNom] ?? "").trim();
          const fun = idxFun>-1 ? String(row[idxFun] ?? "").trim() : "";

          const active = (!isBlank(nom)) || (Number.isFinite(Number(nro)) && Number(nro) > 0);
          if (!active) continue;

          let sum = 0;
          let any = false;
          let badCell = false;

          for (let c = startCarga; c < row.length; c++){
            const v = row[c];
            if (isBlank(v)) continue;
            any = true;
            const n = Number(v);
            if (!Number.isFinite(n)){
              badCell = true;
              continue;
            }
            if (n < 0){
              addIssue(issues, "CRITICO", "DIS_TRA", `Fila ${r+1}`, "Carga horaria negativa", `Se encontró ${n} en una celda de carga horaria.`, "Las horas deben ser >= 0.");
            }
            if (n > 40){
              addIssue(issues, "ADVERTENCIA", "DIS_TRA", `Fila ${r+1}`, "Carga horaria alta", `Se encontró ${n} en una celda (posible digitación).`, "Revisa la celda (debería ser 0–40).");
            }
            sum += n;
          }

          if (badCell){
            addIssue(issues, "ADVERTENCIA", "DIS_TRA", `Fila ${r+1}`, "Valores no numéricos", "Hay celdas con texto en columnas de carga horaria.", "Deja solo números (0–40).");
          }

          // Reglas de total
          if (!any || sum === 0){
            addIssue(issues, "CRITICO", "DIS_TRA", `Fila ${r+1}`, "Docente sin carga", `"${nom || "(sin nombre)"}" no tiene horas asignadas.`, "Asigna carga por plan de estudios/paralelos o elimina el registro.");
          }
          if (sum > 45){
            addIssue(issues, "CRITICO", "DIS_TRA", `Fila ${r+1}`, "Total de horas excedido", `Total calculado=${sum.toFixed(2)} (excede 45).`, "Revisa la distribución; no debería superar el máximo.");
          } else if (sum > 35){
            addIssue(issues, "ADVERTENCIA", "DIS_TRA", `Fila ${r+1}`, "Total de horas alto", `Total calculado=${sum.toFixed(2)}.`, "Verifica si corresponde a BT/BTP u horas especiales.");
          }

          // Para rol docente, sugerir 25
          if (fun && fun.toLowerCase().includes("doc")){
            if (sum > 0 && Math.abs(sum - 25) > 2.5 && sum <= 35){
              addIssue(issues, "ADVERTENCIA", "DIS_TRA", `Fila ${r+1}`, "Referencia 25h", `Total=${sum.toFixed(2)} difiere de 25h.`, "Si es Docente regular, revisa. Si es caso especial, ignora.");
            }
          }
        }
      }
    }
  }

  // ===== Param (mínimo) =====
  const wsParam = wb.Sheets["Param"];
  if (wsParam){
    // chequeo simple de cabeceras clave
    const a = aoaFromSheet(wsParam);
    const firstRow = (a[0] || []).map(normalizeHeader);
    if (!firstRow.includes("COD_GRADO") || !firstRow.includes("GRADO")){
      addIssue(issues, "ADVERTENCIA", "Param", "Fila 1", "Estructura Param", "No se detectan cabeceras COD_GRADO/GRADO.", "Si editaron Param, repongan la versión oficial.");
    }
  }

  return { meta, issues, counts: summarizeIssues(issues) };
}

// =========================
// PDF (jsPDF)
// =========================

function issuesToPdf(report){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"landscape", unit:"pt", format:"a4" });

  const title = "Reporte de Validación — Plantilla Óptima (PO)";
  doc.setFontSize(14);
  doc.text(title, 40, 40);

  doc.setFontSize(10);
  doc.text(`AMIE: ${report.meta.amie || "-"}    IE: ${report.meta.ie || "-"}`, 40, 60);
  doc.text(`Archivo: ${report.meta.filename || "-"}`, 40, 74);

  const { CRITICO, ADVERTENCIA, INFO } = report.counts;
  doc.text(`Críticos: ${CRITICO}   Advertencias: ${ADVERTENCIA}   Info: ${INFO}`, 40, 92);

  const body = report.issues.map((it, i) => ([
    String(i+1),
    it.level,
    it.sheet,
    it.ref || "-",
    it.rule,
    it.detail,
    it.hint || "-",
  ]));

  doc.autoTable({
    head: [["#","Nivel","Hoja","Ref.","Regla","Detalle","Sugerencia"]],
    body,
    startY: 110,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [20,20,20] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 70 },
      2: { cellWidth: 70 },
      3: { cellWidth: 60 },
      4: { cellWidth: 130 },
      5: { cellWidth: 230 },
      6: { cellWidth: 160 },
    },
    margin: { left: 40, right: 40 },
  });

  return doc;
}

// =========================
// UI
// =========================

function renderWorkflowSteps(){
  const box = $("workflowSteps");
  if (!box) return;

  const steps = [
    { n:1, d:"Colocar la nómina de personal en la hoja Nómina.", r:"Distrito" },
    { n:2, d:"Seleccionar/ingresar el código AMIE en Nómina.", r:"Distrito" },
    { n:3, d:"Verificar la nómina cargada por el distrito.", r:"Institución Educativa" },
    { n:4, d:"Completar FUNxIE (función en la IE).", r:"Institución Educativa" },
    { n:5, d:"Completar 'Está en la IE' (Si/No).", r:"Institución Educativa" },
    { n:6, d:"Si hay personal no remitido, añadir al final y en Observación indicar 'Docente remitido por la IE'.", r:"Institución Educativa" },
    { n:7, d:"En Nómina se encuentra la matriz de necesidad (si aplica).", r:"Institución Educativa" },
    { n:8, d:"En Par_PO llenar estudiantes, paralelos y jornada; en BT/BTP incluir especialidad.", r:"Institución Educativa" },
    { n:9, d:"PlanEstudio y BT_/EBJA: validar que el plan corresponde a lo reportado.", r:"Institución Educativa" },
    { n:10, d:"Ir a DIS_TRA: se generan grados/especialidad/jornada y se llena la carga horaria por docente.", r:"Institución Educativa" },
    { n:11, d:"Revisar totales y necesidad/exceso antes de remitir.", r:"Institución Educativa" },
  ];

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table smallTable">
        <thead><tr><th>Paso</th><th>Descripción</th><th>Responsable</th></tr></thead>
        <tbody>
          ${steps.map(s=>`<tr><td class="mono">${s.n}</td><td>${escapeHtml(s.d)}</td><td>${escapeHtml(s.r)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function setup(){
  $("envLabel").textContent = `Modo: ${window.PO_CONFIG?.envLabel || "GitHub Pages"}`;

  const excelInput = $("excelInput");
  const btnProcesar = $("btnProcesarExcel");

  excelInput.addEventListener("change", () => {
    const ok = !!(excelInput.files && excelInput.files.length);
    btnProcesar.disabled = !ok;
    $("btnDownloadPdf").disabled = true;
    $("btnDownloadJson").disabled = true;
    clear($("validationSummary"));
    clear($("issuesTable"));
  });

  btnProcesar.addEventListener("click", procesarExcel);
  $("btnCalcular").addEventListener("click", calcularPO);
  $("btnLimpiar").addEventListener("click", limpiarPO);
  $("btnValidarFigura").addEventListener("click", () => {
    clear($("log"));
    validarFiguraProfesional(($("figura").value || "").trim());
  });

  // Toggle de carga horaria según nivel
  $("nivel").addEventListener("change", () => {
    const isEgb = $("nivel").value === "EGB_BGU";
    $("wrapCarga").style.display = isEgb ? "block" : "none";
  });
  $("wrapCarga").style.display = "none";

  // Periodos default
  $("periodos").value = window.PO_CONFIG?.formulas?.egb_bgu_periodos_default ?? 25;

  renderLOEITable();
  renderWorkflowSteps();
  limpiarPO();
}

function logLine(msg, cls=""){
  const el = $("log");
  const span = document.createElement("div");
  span.innerHTML = cls ? `<span class="${cls}">${escapeHtml(msg)}</span>` : escapeHtml(msg);
  el.appendChild(span);
}

function limpiarPO(){
  $("paralelos").value = 0;
  $("carga").value = 0;
  $("kpiDocentes").textContent = "0";
  $("kpiFormula").textContent = "-";
  $("detalleCalc").textContent = "";
}

function roundUp2(x){
  const v = Math.ceil((Number(x) + 1e-12) * 100) / 100;
  return v;
}

function calcularPO(){
  const nivel = $("nivel").value;
  const paralelos = Number($("paralelos").value || 0);
  const carga = Number($("carga").value || 0);
  const periodos = Number($("periodos").value || 25);

  if (paralelos < 0 || carga < 0 || periodos <= 0){
    $("detalleCalc").textContent = "Valores inválidos.";
    return;
  }

  let docentes = 0;
  let formula = "";
  let detalle = "";

  if (nivel === "INICIAL"){
    const k = window.PO_CONFIG?.formulas?.inicial_docentes_por_paralelo ?? 1;
    docentes = paralelos * k;
    formula = "Docentes = Σ paralelos (1 docente/paralelo)";
    detalle = `Inicial (3–4): paralelos=${paralelos} ⇒ docentes=${docentes}`;
  } else {
    docentes = (paralelos * carga) / periodos;
    docentes = roundUp2(docentes);
    formula = "Docentes = (Σ paralelos × carga horaria) / períodos pedagógicos";
    detalle = `EGB/BGU: paralelos=${paralelos}, carga=${carga}, períodos=${periodos} ⇒ docentes=${docentes}`;
  }

  $("kpiDocentes").textContent = String(docentes);
  $("kpiFormula").textContent = formula;
  $("detalleCalc").textContent = detalle;
}

function relojFromPeriodos(periodos){
  const total = window.PO_CONFIG?.formulas?.horas_reloj_semanales ?? 40;
  return total / periodos;
}

function renderLOEITable(){
  const tb = $("loeiTable");
  tb.innerHTML = "";

  const loei = window.PO_CONFIG?.loei;
  const totalHrs = window.PO_CONFIG?.formulas?.horas_reloj_semanales ?? 40;

  const rows = [
    { name: "LOEI anterior", key: "anterior" },
    { name: "LOEI reformada", key: "reformada" },
  ];

  for (const r of rows){
    const cfg = loei?.[r.key];
    const periodos = Number(cfg?.periodos_pedagogicos ?? (r.key==="anterior"?30:25));
    const acomp = Number(cfg?.acomp_periodos ?? (r.key==="anterior"?10:5));
    const actIE = Number(cfg?.actividades_hrs_reloj_sem ?? 10);

    const hrsPorPeriodo = relojFromPeriodos(periodos);
    const hrsPedSem = periodos * hrsPorPeriodo;
    const hrsPedDia = hrsPedSem / 5;

    const hrsAcompSem = acomp * hrsPorPeriodo;
    const hrsAcompDia = hrsAcompSem / 5;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${periodos}</td>
      <td>${hrsPedSem.toFixed(2)}</td>
      <td>${hrsPedDia.toFixed(2)}</td>
      <td>${acomp}</td>
      <td>${hrsAcompSem.toFixed(2)}</td>
      <td>${hrsAcompDia.toFixed(2)}</td>
      <td>${actIE.toFixed(2)}</td>
      <td>${totalHrs.toFixed(2)}</td>
    `;
    tb.appendChild(tr);
  }
}

// === Validación normativa figuras profesionales ===
function validarFiguraProfesional(figuraRaw){
  const cfg = window.PO_CONFIG?.catalogos;
  const vigente = (cfg?.vigente_2024_00065 || []).map(x => String(x).toUpperCase().trim());
  const anterior = (cfg?.catalogo_2023_00086 || []).map(x => String(x).toUpperCase().trim());
  const equiv = cfg?.equivalencias || {};

  const figura = String(figuraRaw || "").toUpperCase().trim();

  if (!figura){
    logLine("Ingrese una figura profesional.", "warn");
    return;
  }

  if (vigente.includes(figura)){
    logLine(`OK: "${figuraRaw}" válida (catálogo vigente 2024-00065).`, "ok");
    return;
  }

  if (anterior.includes(figura)){
    const eq = equiv[figura];
    if (eq){
      logLine(`ADVERTENCIA: "${figuraRaw}" cambió de denominación. Equivalente vigente: "${eq}".`, "warn");
    } else {
      logLine(`CRÍTICO: "${figuraRaw}" existe en 2023-00086 pero NO está en 2024-00065 y no tiene equivalencia.`, "bad");
    }
    return;
  }

  logLine(`CRÍTICO: "${figuraRaw}" no consta en catálogos 00086 ni 00065.`, "bad");
}

async function procesarExcel(){
  const input = $("excelInput");
  const file = input.files?.[0];
  if (!file) return;

  if (typeof XLSX === "undefined"){
    alert("No se cargó XLSX (CDN).");
    return;
  }

  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array", cellFormula:true, cellNF:true, cellText:true });

    const report = validateWorkbook(wb, file.name);

    // Render
    $("validationSummary").innerHTML = buildSummary(report.meta, report.counts);
    $("issuesTable").innerHTML = buildIssuesTable(report.issues);

    // Habilitar descargas
    const btnJson = $("btnDownloadJson");
    const btnPdf  = $("btnDownloadPdf");
    btnJson.disabled = false;
    btnPdf.disabled  = false;

    btnJson.onclick = () => downloadJson(report);
    btnPdf.onclick  = () => downloadPdf(report);

  } catch(e){
    alert("Error leyendo Excel: " + String(e?.message || e));
  }
}

function downloadJson(report){
  const blob = new Blob([JSON.stringify(report, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte_PO_${(report.meta.amie||"AMIE").replace(/\W+/g,"_")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPdf(report){
  try{
    const doc = issuesToPdf(report);
    doc.save(`reporte_PO_${(report.meta.amie||"AMIE").replace(/\W+/g,"_")}.pdf`);
  } catch(e){
    alert("No se pudo generar PDF (verifica que jsPDF cargue desde CDN): " + String(e?.message || e));
  }
}

document.addEventListener("DOMContentLoaded", setup);
