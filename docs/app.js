/* v12.1 hotfix: robust click handler + status + error overlay */

function ensureStatusUI(){
  const el = document.getElementById('statusBox');
  if(el) return el;
  const box = document.createElement('div');
  box.id = 'statusBox';
  box.style.cssText = 'margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);font-size:13px;line-height:1.35;white-space:pre-wrap;';
  const anchor = document.getElementById('uploadSection') || document.body;
  anchor.appendChild(box);
  return box;
}
function setStatus(msg){
  const box = ensureStatusUI();
  box.textContent = msg;
}
function showErrorOverlay(title, err){
  console.error(title, err);
  setStatus((title || 'Error') + '\n' + (err?.stack || err?.message || String(err)));
  alert((title || 'Error') + ': ' + (err?.message || String(err)));
}

/* PO-App v12 (Institucional, sin CDN)
 * - Lee .xlsx/.xlsm (SheetJS local en /vendor)
 * - Valida hojas + reglas mínimas (según Matriz DTD)
 * - Reporte en pantalla + descarga JSON/PDF
 */

const BUILD = { version: "12.0.0", date: "2026-03-05" };
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


// -------------------------
// Hojas / modo (DTD vs CONSOLIDADO)
// -------------------------
function sheetNormMap(wb){
  const m = new Map();
  for (const n of (wb.SheetNames||[])){
    m.set(normKey(n), n);
  }
  return m;
}
function getSheetNameBy(wb, variants){
  const m = sheetNormMap(wb);
  for (const v of variants){
    const key = normKey(v);
    if (m.has(key)) return m.get(key);
  }
  return null;
}
function hasAnySheet(wb, variants){
  return !!getSheetNameBy(wb, variants);
}
function detectWorkbookMode(wb){
  if (hasAnySheet(wb, ["Consolidado","Excesos"])) return "CONSOLIDADO";
  if (hasAnySheet(wb, ["Nómina","Nomina","Par_PO","Pasos"])) return "MATRIZ_DTD";
  return "DESCONOCIDO";
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

  statusEl.style.display 
function validateConsolidado(wb, issues, meta){
  // Hojas esperadas (tolerante a mayúsculas/variantes)
  const shCon = getSheetNameBy(wb, ["Consolidado"]);
  const shExc = getSheetNameBy(wb, ["Excesos","Exesos","Exceso"]);
  if (!shCon) addIssue(issues, "CRITICO", "(libro)", "-", "Hoja obligatoria faltante", 'No se encontró la hoja "Consolidado".', "Mantén el nombre exacto de la hoja.");
  if (!shExc) addIssue(issues, "CRITICO", "(libro)", "-", "Hoja obligatoria faltante", 'No se encontró la hoja "Excesos".', "Mantén el nombre exacto de la hoja.");

  // -------- Consolidado -------
  if (shCon){
    const ws = wb.Sheets[shCon];
    const a2d = aoaFromSheet(ws);
    const hr = findHeaderRowByAny(a2d, ["amie","distrito","institucion","especialidad","necesidad","docentes","brecha"], 120);
    if (hr < 0){
      addIssue(issues, "CRITICO", shCon, "-", "No se encontró cabecera", "No pude identificar la fila de encabezados en Consolidado.", "Verifica que la hoja tenga encabezados (AMIE, Distrito, Institución, Especialidad, Necesidad/Docentes).");
    } else {
      const headers = a2d[hr];
      const colAMIE = pickColIndex(headers, ["AMIE","COD AMIE","CODIGO AMIE","CODAMIE"]);
      const colDist = pickColIndex(headers, ["Distrito","Cod Distrito","Distrito educativo"]);
      const colIE   = pickColIndex(headers, ["Institucion","Institución","Nombre IE","Nombre"]);
      const colEsp  = pickColIndex(headers, ["Especialidad","Figura profesional","Asignatura","Area"]);
      const colNec  = pickColIndex(headers, ["Necesidad","Necesidad docente","Docentes requeridos","Requeridos","Brecha"]);
      const firstData = hr + 1;

      const seen = new Map(); // key -> row
      let rows = 0;
      for (let r=firstData; r<a2d.length; r++){
        const row = a2d[r] || [];
        // cortar si fila vacía
        const empty = row.every(v => String(v??"").trim()==="");
        if (empty) continue;

        rows++;
        const amie = String(row[colAMIE] ?? "").trim();
        const dist = String(row[colDist] ?? "").trim();
        const ie   = String(row[colIE] ?? "").trim();
        const esp  = String(row[colEsp] ?? "").trim();
        const necRaw = row[colNec];

        if (!amie){
          addIssue(issues, "CRITICO", shCon, r+1, "AMIE vacío", "Existe un registro sin código AMIE.", "Completa el AMIE.");
        } else if (!/^[0-9]{2}[A-Z0-9]{5,6}$/i.test(amie)){
          addIssue(issues, "ADVERTENCIA", shCon, r+1, "AMIE con formato inusual", `AMIE: "${amie}"`, "Verifica el código AMIE.");
        }
        if (!dist) addIssue(issues, "ADVERTENCIA", shCon, r+1, "Distrito vacío", "Falta distrito en el registro.", "Completa el distrito.");
        if (!ie)   addIssue(issues, "ADVERTENCIA", shCon, r+1, "Institución vacía", "Falta nombre de IE.", "Completa el nombre de la IE.");
        if (!esp)  addIssue(issues, "ADVERTENCIA", shCon, r+1, "Especialidad vacía", "Falta especialidad/figura profesional.", "Completa la especialidad.");

        const nec = toNumber(necRaw);
        if (necRaw !== "" && nec === null){
          addIssue(issues, "CRITICO", shCon, r+1, "Necesidad no numérica", `Valor: "${necRaw}"`, "Usa valores numéricos.");
        } else if (nec !== null && nec < 0){
          addIssue(issues, "CRITICO", shCon, r+1, "Necesidad negativa", `Valor: ${nec}`, "No puede ser menor a 0.");
        }

        const key = `${amie}||${normKey(esp)}`;
        if (amie && esp){
          if (seen.has(key)){
            addIssue(issues, "ADVERTENCIA", shCon, r+1, "Duplicado AMIE+Especialidad", `Duplicado de ${amie} / ${esp}`, "Unifica o revisa duplicidad.");
          } else seen.set(key, r+1);
        }
      }

      if (rows === 0){
        addIssue(issues, "CRITICO", shCon, "-", "Consolidado sin datos", "La hoja Consolidado no tiene registros.", "Asegura que la matriz esté llena antes de enviar.");
      }
    }
  }

  // -------- Excesos -------
  const excesosKeys = new Set();
  if (shExc){
    const ws = wb.Sheets[shExc];
    const a2d = aoaFromSheet(ws);
    const hr = findHeaderRowByAny(a2d, ["amie","distrito","institucion","especialidad","exceso","docente"], 120);
    if (hr < 0){
      addIssue(issues, "ADVERTENCIA", shExc, "-", "No se encontró cabecera", "No pude identificar la fila de encabezados en Excesos.", "Verifica encabezados (AMIE, Distrito, Especialidad, Exceso).");
    } else {
      const headers = a2d[hr];
      const colAMIE = pickColIndex(headers, ["AMIE","COD AMIE","CODIGO AMIE","CODAMIE"]);
      const colEsp  = pickColIndex(headers, ["Especialidad","Figura profesional","Asignatura","Area"]);
      const colExc  = pickColIndex(headers, ["Exceso","Excesos","Docentes excedentes","Excedente"]);
      const firstData = hr+1;

      let rows=0;
      for (let r=firstData; r<a2d.length; r++){
        const row = a2d[r] || [];
        const empty = row.every(v => String(v??"").trim()==="");
        if (empty) continue;
        rows++;
        const amie = String(row[colAMIE] ?? "").trim();
        const esp  = String(row[colEsp] ?? "").trim();
        const excRaw = row[colExc];

        if (!amie) addIssue(issues, "CRITICO", shExc, r+1, "AMIE vacío", "Existe un registro sin AMIE en Excesos.", "Completa el AMIE.");
        if (!esp)  addIssue(issues, "ADVERTENCIA", shExc, r+1, "Especialidad vacía", "Falta especialidad en Excesos.", "Completa la especialidad.");
        const exc = toNumber(excRaw);
        if (excRaw !== "" && exc === null){
          addIssue(issues, "CRITICO", shExc, r+1, "Exceso no numérico", `Valor: "${excRaw}"`, "Usa valores numéricos.");
        } else if (exc !== null && exc < 0){
          addIssue(issues, "CRITICO", shExc, r+1, "Exceso negativo", `Valor: ${exc}`, "No puede ser menor a 0.");
        }
        if (amie && esp) excesosKeys.add(`${amie}||${normKey(esp)}`);
      }

      if (rows === 0){
        addIssue(issues, "INFO", shExc, "-", "Excesos sin registros", "No se reportaron excesos en la matriz.", "Si existen excesos, deben reportarse con distributivo.");
      }
    }
  }

  // Consistencia: AMIE+Especialidad en ambos (necesidad y exceso)
  // Solo si ambas hojas existen y se pudieron leer claves
  if (shCon && shExc){
    // recolectar claves de Consolidado (si hay tabla)
    const ws = wb.Sheets[shCon];
    const a2d = aoaFromSheet(ws);
    const hr = findHeaderRowByAny(a2d, ["amie","especialidad"], 120);
    if (hr >= 0){
      const headers = a2d[hr];
      const colAMIE = pickColIndex(headers, ["AMIE","COD AMIE","CODIGO AMIE","CODAMIE"]);
      const colEsp  = pickColIndex(headers, ["Especialidad","Figura profesional","Asignatura","Area"]);
      for (let r=hr+1; r<a2d.length; r++){
        const row = a2d[r] || [];
        const empty = row.every(v => String(v??"").trim()==="");
        if (empty) continue;
        const amie = String(row[colAMIE] ?? "").trim();
        const esp  = String(row[colEsp] ?? "").trim();
        if (!amie || !esp) continue;
        const key = `${amie}||${normKey(esp)}`;
        if (excesosKeys.has(key)){
          addIssue(issues, "ADVERTENCIA", "(cruce)", "-", "Necesidad y exceso en la misma IE/especialidad",
            `${amie} / ${esp} aparece en Consolidado y en Excesos.`,
            "Revisar si corresponde a instituciones distintas, paralelos distintos o error de reporte.");
        }
      }
    }
  }

  // Meta básica para memorando
  meta.mode = "CONSOLIDADO";
}

= "block";
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
  const meta = { filename, amie:"", ie:"", mode:"" };

  const mode = detectWorkbookMode(wb);
  meta.mode = mode;

  if (mode === "CONSOLIDADO"){
    validateConsolidado(wb, issues, meta);
    return { issues, meta, mode };
  }

  // Por defecto: Matriz DTD (Plantilla Óptima)
  const requiredSheets = ["Pasos","Nómina","Par_PO","DIS_TRA","PlanEstudio","Param"];
  const present = new Set(wb.SheetNames || []);

  for (const s of requiredSheets){
    // aceptar variantes con/sin tilde
    const ok = present.has(s) || present.has(s.replace("ó","o").replace("í","i")) || present.has(s.replace("ó","o"));
    if (!ok){
      addIssue(issues, "CRITICO", "(libro)", "-", "Hoja obligatoria faltante", `No se encontró la hoja "${s}".`, "Usa la plantilla oficial y pega datos sin cambiar nombres/estructuras.");
    }
  }

  // -------- Nómina --------
  const nomName = getSheetNameBy(wb, ["Nómina","Nomina"]); const wsNom = nomName ? wb.Sheets[nomName] : null;
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


function downloadTxt(text, filename){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMemoText(report){
  const meta = report?.meta || {};
  const counts = report?.counts || {CRITICO:0,ADVERTENCIA:0,INFO:0};
  const total = (report?.issues||[]).length;

  const encabezado = `ASUNTO: Revisión técnica de matriz de necesidad docente – ${meta.mode === "CONSOLIDADO" ? "Consolidado zonal" : "Plantilla PO (DTD)"}\n\n`;
  const cuerpo = [
    "De mi consideración:",
    "",
    "En atención a la información remitida, se procedió a realizar la validación técnica de la matriz adjunta, verificando estructura, completitud y consistencia de datos.",
    "",
    `Resultado de la validación:`,
    `- Inconsistencias CRÍTICAS: ${counts.CRITICO || 0}`,
    `- Advertencias: ${counts.ADVERTENCIA || 0}`,
    `- Informativas: ${counts.INFO || 0}`,
    `- Total hallazgos: ${total}`,
    "",
    "Observaciones:",
    "- En caso de inconsistencias CRÍTICAS, se solicita corregir la matriz y remitir nuevamente el archivo.",
    "- Para registros con advertencias, se recomienda verificar AMIE, especialidad/figura profesional y valores numéricos reportados.",
    "",
    "Se adjunta reporte de inconsistencias generado automáticamente para su revisión.",
    "",
    "Atentamente,",
    "Dirección de Planificación / Equipo técnico"
  ].join("\n");

  return encabezado + cuerpo;
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
let LAST_MEMO_TXT = null;

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
  const btnMemo = $("btnDownloadMemo");
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

  
  if (btnMemo){
    btnMemo.addEventListener("click", ()=>{
      if (!LAST_REPORT) return;
      if (!LAST_MEMO_TXT) LAST_MEMO_TXT = buildMemoText(LAST_REPORT);
      const base = (LAST_REPORT.meta.mode === "CONSOLIDADO") ? "CONSOLIDADO" : (LAST_REPORT.meta.amie||"AMIE");
      downloadTxt(LAST_MEMO_TXT, `borrador_memorando_${String(base).replace(/\s+/g,"_")}.txt`);
    });
  }

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


async function bindValidateButton_v121(){
  const btn = document.getElementById('btnValidate');
  const input = document.getElementById('fileInput');
  if(!btn || !input) return;
  btn.type = 'button';
  btn.addEventListener('click', async (ev) => {
    try{
      ev.preventDefault();
      ev.stopPropagation();

      if(!window.XLSX){
        throw new Error('No se encontró XLSX. Verifica que exista vendor/xlsx.full.min.js en el mismo folder publicado (root o /docs).');
      }
      const file = input.files && input.files[0];
      if(!file){
        throw new Error('Selecciona un archivo .xlsx o .xlsm antes de validar.');
      }

      setStatus('Leyendo archivo: ' + file.name + '\nProcesando…');
      btn.disabled = true;
      btn.textContent = 'Procesando…';

      const data = await file.arrayBuffer();
      const wb = window.XLSX.read(data, { type: 'array' });
      const sheetNames = wb.SheetNames || [];
      setStatus('Hojas detectadas (' + sheetNames.length + '):\n- ' + sheetNames.join('\n- '));

      // Try to call existing validator if present
      if(typeof window.runValidation === 'function'){
        const result = await window.runValidation(wb);
        setStatus((result?.summary || 'Validación ejecutada.') + '\n\n(Usa los botones de descarga si están habilitados.)');
      }else if(typeof window.validateWorkbook === 'function'){
        const result = await window.validateWorkbook(wb);
        setStatus((result?.summary || 'Validación ejecutada.') + '\n\n(Usa los botones de descarga si están habilitados.)');
      }else{
        // Minimal built-in: just confirm read
        setStatus('Archivo leído correctamente.\nHojas detectadas:\n- ' + sheetNames.join('\n- ') + '\n\nNota: no se encontró función de validación en app.js. Este hotfix asegura lectura y diagnóstico.');
      }
    }catch(err){
      showErrorOverlay('No se pudo validar y generar reporte', err);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Validar y generar reporte';
    }
  }, { passive:false });
}

window.addEventListener('DOMContentLoaded', () => {
  try{ bindValidateButton_v121(); }catch(e){ console.error(e); }
});
