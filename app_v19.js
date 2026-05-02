/**
 * PO-App v19.0.0 - Validador de Plantilla Óptima MinEduc Ecuador
 * Basado en Norma Técnica de PO 06-2025
 * Validación específica para Matriz DTD (Distributivo de Trabajo Docente)
 */

(function(){
  const BUILD = "v19.0.3";
  const $ = id => document.getElementById(id);

  // Estado global
  let validationReport = null;
  let pasosSheetName = null;
  let currentWorkbook = null;
  let workbookData = {
    pasos: [],
    nomina: [],
    parPO: [],
    disTra: [],
    param: [],
    planEstudio: []
  };

  // ============ UTILIDADES ============
  
  function ensureIds(){
    const inp = $("fileInput") || document.querySelector('input[type="file"]');
    if(inp) inp.id = "fileInput";
    
    const btnV = $("btnValidate") || Array.from(document.querySelectorAll("button"))
      .find(b => /validar/i.test(b.textContent || ""));
    if(btnV) btnV.id = "btnValidate";
    
    const btnD = $("btnDiag") || Array.from(document.querySelectorAll("button"))
      .find(b => /diagnostico/i.test(b.textContent || ""));
    if(btnD) btnD.id = "btnDiag";
    
    if(!$("validationSummary")){
      const div = document.createElement("div");
      div.id = "validationSummary";
      div.className = "po-status";
      (document.body.querySelector("section") || document.body).appendChild(div);
    }
  }

  function forceEnable(){
    const btn = $("btnValidate");
    if(!btn) return;
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.style.pointerEvents = "auto";
    btn.style.cursor = "pointer";
  }

  function setStatus(html, isError = false){ 
    const summary = $("validationSummary");
    if(!summary) return;
    summary.innerHTML = html;
    summary.className = isError ? "po-status error" : "po-status";
  }

  function normalizeSheetName(s){
    return (s || "")
      .toString()
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "");
  }

  function findSheetName(wb, desired, aliases=[]){
  if (!wb || !Array.isArray(wb.SheetNames)) return null;
  const wants = [desired, ...aliases].map(normalizeSheetName);
  for (const name of wb.SheetNames){
    const norm = normalizeSheetName(name);
    if (wants.includes(norm)) return name; // match exact normalizado
  }
  // fallback: match parcial (algunas hojas vienen como "PASOS (1)" o con espacios)
  for (const name of wb.SheetNames){
    const norm = normalizeSheetName(name);
    if (wants.some(w => norm.includes(w) || w.includes(norm))) return name;
  }
  return null;
}

  function getSheetData(wb, sheetName, aliases=[]){
  const realName = findSheetName(wb, sheetName, aliases);
  if (!realName) return null;
  const ws = wb.Sheets[realName];
  const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  return Array.isArray(arr) ? arr : null;
}

  // ============ VALIDACIONES ESPECÍFICAS MINEDUC ============

  /**
   * Paso 1-2: Validar que existe AMIE y está seleccionado
   */
  function validateAMIE(nominaData) {
    const issues = [];
    
    // Buscar fila con AMIE: (típicamente fila 5)
    let amieRow = nominaData.find(row => 
      row && row[0] && String(row[0]).trim().toUpperCase().includes('AMIE')
    );
    
    if (!amieRow) {
      issues.push({
        severity: "error",
        sheet: "Nómina",
        paso: "1-2",
        row: 0,
        message: "No se encontró el campo AMIE en la hoja Nómina"
      });
      return issues;
    }
    
    const amieValue = amieRow[1];
    if (!amieValue || amieValue === 0 || amieValue === '0') {
      issues.push({
        severity: "error",
        sheet: "Nómina",
        paso: "2",
        row: nominaData.indexOf(amieRow) + 1,
        message: "Debe seleccionar un código AMIE válido (Paso 2: Seleccionar su código AMIE)"
      });
    }
    
    return issues;
  }

  /**
   * Paso 3: Validar que la nómina docente tiene datos
   */
  function validateNomina(nominaData) {
    const issues = [];
    
    // Buscar fila de encabezados (contiene "Nro.", "Test_CH", "FUN_HOM", etc.)
    let headerRowIndex = nominaData.findIndex(row => 
      row && row[0] && String(row[0]).trim() === 'Nro.'
    );
    
    if (headerRowIndex === -1) {
      issues.push({
        severity: "error",
        sheet: "Nómina",
        paso: "3",
        row: 0,
        message: "No se encontró la tabla de nómina con encabezados válidos"
      });
      return issues;
    }
    
    // Validar que hay datos después del encabezado
    const dataRows = nominaData.slice(headerRowIndex + 1).filter(row => 
      row && row.some(cell => cell !== null && cell !== '')
    );
    
    if (dataRows.length === 0) {
      issues.push({
        severity: "warning",
        sheet: "Nómina",
        paso: "3",
        row: headerRowIndex + 1,
        message: "La nómina no contiene datos de personal (Paso 3: Verificar nómina cargada)"
      });
    }
    
    // Validar columnas críticas en cada fila de datos
    const headers = nominaData[headerRowIndex];
    const colIndexes = {
      nro: headers.indexOf('Nro.'),
      cedula: headers.findIndex(h => h && h.includes('cédula')),
      nombres: headers.findIndex(h => h && h.includes('Nombres')),
      funHom: headers.indexOf('FUN_HOM'),
      funxIE: headers.indexOf('FUNxIE'),
      estaEnIE: headers.findIndex(h => h && h.includes('Esta en la IE'))
    };
    
    dataRows.forEach((row, idx) => {
      const actualRow = headerRowIndex + idx + 2;
      
      // Validar cédula
      if (colIndexes.cedula !== -1) {
        const cedula = row[colIndexes.cedula];
        if (!cedula || String(cedula).trim() === '') {
          issues.push({
            severity: "warning",
            sheet: "Nómina",
            paso: "3",
            row: actualRow,
            message: "Fila sin número de cédula"
          });
        }
      }
      
      // Validar nombres
      if (colIndexes.nombres !== -1) {
        const nombres = row[colIndexes.nombres];
        if (!nombres || String(nombres).trim() === '') {
          issues.push({
            severity: "warning",
            sheet: "Nómina",
            paso: "3",
            row: actualRow,
            message: "Fila sin nombres y apellidos"
          });
        }
      }
      
      // Paso 4: Validar FUNxIE (Función en la IE)
      if (colIndexes.funxIE !== -1) {
        const funxIE = row[colIndexes.funxIE];
        if (!funxIE || String(funxIE).trim() === '') {
          issues.push({
            severity: "warning",
            sheet: "Nómina",
            paso: "4",
            row: actualRow,
            message: "Falta asignar función en la IE (FUNxIE) - Paso 4"
          });
        }
      }
      
      // Paso 5: Validar "Esta en la IE"
      if (colIndexes.estaEnIE !== -1) {
        const estaEnIE = row[colIndexes.estaEnIE];
        if (!estaEnIE || (estaEnIE !== 'Si' && estaEnIE !== 'No')) {
          issues.push({
            severity: "warning",
            sheet: "Nómina",
            paso: "5",
            row: actualRow,
            message: "Debe indicar Si/No en 'Esta en la IE' - Paso 5"
          });
        }
      }
    });
    
    return issues;
  }

  /**
   * Paso 8-9: Validar Par_PO (Información de la IE y paralelos)
   */
  function validateParPO(workbook, parPOData){
  if (!Array.isArray(parPOData)) {
    return [{
      severity: 'CRITICAL',
      sheet: 'Par_PO',
      step: '8-9',
      row: '',
      description: "No se pudo leer la hoja 'Par_PO' (no encontrada, nombre distinto o no legible)."
    }];
  }

  const issues = [];

  function isBlank(v){ return v == null || String(v).trim() === ''; }

  // --- (A3 en adelante) campos obligatorios del encabezado: se buscan por etiqueta y se valida el valor a la derecha
  function findLabelValue(labelRegex){
    for (let r=0; r<parPOData.length; r++){
      const row = parPOData[r] || [];
      for (let c=0; c<row.length; c++){
        const cell = row[c];
        if (cell == null) continue;
        const txt = String(cell).trim();
        if (!txt) continue;
        if (labelRegex.test(txt.toUpperCase())){
          const val = row[c+1];
          return { r: r+1, c: c+2, value: val };
        }
      }
    }
    return null;
  }

  const required = [
    { key:'AMIE', re:/^AMIE:?$/ },
    { key:'NOMBRE DE LA IE', re:/^NOMBRE/ },
    { key:'SOSTENIMIENTO', re:/^SOSTENIMIENTO/ },
    { key:'REGIMEN', re:/^REGIMEN/ },
    { key:'JURISDICCION', re:/^JURISDICCION/ },
    { key:'ZONA', re:/^ZONA/ },
    { key:'DISTRITO', re:/^DISTRITO/ },
    { key:'PROVINCIA', re:/^PROVINCIA/ },
    { key:'CANTON', re:/^CANTON/ },
    { key:'PARROQUIA', re:/^PARROQUIA/ },
    { key:'MODALIDAD', re:/^MODALIDAD/ },
    { key:'TIPO DE EDUCACION', re:/^TIPO DE EDUCACION/ },
    { key:'AÑO LECTIVO', re:/^A(N|Ñ)O LECTIVO/ },
    { key:'CATEGORIA', re:/^CATEGORIA/ },
  ];

  for (const f of required){
    const hit = findLabelValue(f.re);
    if (!hit){
      issues.push({
        severity:'WARNING',
        sheet:'Par_PO',
        step:'8-9',
        row:'',
        description:`No se encontró el campo obligatorio '${f.key}' en el encabezado (A3 en adelante).`
      });
    } else if (isBlank(hit.value)){
      issues.push({
        severity:'CRITICAL',
        sheet:'Par_PO',
        step:'8-9',
        row: hit.r,
        description:`Campo obligatorio '${f.key}' sin información (valor a la derecha de la etiqueta).`
      });
    }
  }

  // --- Validación adicional solicitada: celda L13 debe estar tipeada
  const L13 = (parPOData[12] || [])[11]; // fila 13, col L
  if (isBlank(L13)){
    issues.push({
      severity:'WARNING',
      sheet:'Par_PO',
      step:'8-9',
      row: 13,
      description:"La celda L13 está vacía. Verifique que se haya ingresado/seleccionado la información requerida en esa sección."
    });
  }

  // --- Tabla principal: validar paralelos y estudiantes (sin tocar 'tomate'/fórmulas)
  const headerRowIndex = parPOData.findIndex(r => String((r||[])[0]||'').toUpperCase().includes('GRADO'));
  if (headerRowIndex === -1){
    issues.push({
      severity:'WARNING',
      sheet:'Par_PO',
      step:'9',
      row:'',
      description:'No se encontró la tabla principal (cabecera con "Grado / Curso").'
    });
    return issues;
  }

  const dataStart = headerRowIndex + 1;
  let hasAny = false;

  for (let i=dataStart; i<parPOData.length; i++){
    const row = parPOData[i] || [];
    const grado = row[0];
    const paralelo = row[3];
    const estudiantes = row[4];

    if (isBlank(grado) && isBlank(paralelo) && isBlank(estudiantes)) continue;

    hasAny = true;

    if (!isBlank(grado)){
      if (isBlank(paralelo)){
        issues.push({
          severity:'WARNING',
          sheet:'Par_PO',
          step:'9',
          row: i+1,
          description:`Grado/curso '${grado}' sin paralelo.`
        });
      }
      if (isBlank(estudiantes)){
        issues.push({
          severity:'WARNING',
          sheet:'Par_PO',
          step:'9',
          row: i+1,
          description:`Grado/curso '${grado}' sin número de estudiantes.`
        });
      }
    }
  }

  if (!hasAny){
    issues.push({
      severity:'WARNING',
      sheet:'Par_PO',
      step:'9',
      row:'',
      description:'La tabla de grados/paralelos parece vacía.'
    });
  }

  return issues;
}


  /**
   * Paso 11: Validar DIS_TRA (Distributivo de Trabajo)
   */
  function validateDisTra(disTraData) {
    const issues = [];
    
    // Buscar encabezado de la tabla
    let headerRowIndex = disTraData.findIndex(row => 
      row && row[0] === 'Nro.' && row.some(cell => cell && String(cell).includes('Nómina'))
    );
    
    if (headerRowIndex === -1) {
      issues.push({
        severity: "warning",
        sheet: "DIS_TRA",
        paso: "11",
        row: 0,
        message: "No se encontró la tabla de distribución de trabajo"
      });
      return issues;
    }
    
    const dataRows = disTraData.slice(headerRowIndex + 1).filter(row => 
      row && row.some(cell => cell !== null && cell !== '')
    );
    
    const headers = disTraData[headerRowIndex];
    const colTotal = headers.findIndex(h => h && String(h).includes('Tot_General'));
    
    dataRows.forEach((row, idx) => {
      const actualRow = headerRowIndex + idx + 2;
      
      // Validar que las horas totales sean numéricas
      if (colTotal !== -1) {
        const total = row[colTotal];
        if (total && isNaN(Number(total))) {
          issues.push({
            severity: "error",
            sheet: "DIS_TRA",
            paso: "11",
            row: actualRow,
            message: `Total de horas no numérico: "${total}"`
          });
        }
        
        // Validación de carga horaria por docente (según guía de llenado)
        // - Monogrado: ~25h (24–26 suele ser aceptable por materias no múltiplo)
        // - Multigrado puede superar 25h
        // Alertas fuertes: cargas muy bajas (5–6h) o <10h
        if (total !== null && total !== '' && !isNaN(Number(total))) {
          const t = Number(total);

          if (t > 40) {
            issues.push({
              severity: "error",
              sheet: "DIS_TRA",
              paso: "11",
              row: actualRow,
              message: `Total de horas (${t}) excede 40. Revisar duplicaciones o fórmulas.`
            });
          } else if (t < 10) {
            issues.push({
              severity: "error",
              sheet: "DIS_TRA",
              paso: "11",
              row: actualRow,
              message: `Carga horaria muy baja (${t} h). No debería existir un docente con menos de 10 horas. Revisar asignación.`
            });
          } else if (t < 20) {
            issues.push({
              severity: "warning",
              sheet: "DIS_TRA",
              paso: "11",
              row: actualRow,
              message: `Carga horaria baja (${t} h). Revisar si es apoyo parcial o falta de asignación.`
            });
          } else if (t > 35) {
            issues.push({
              severity: "warning",
              sheet: "DIS_TRA",
              paso: "11",
              row: actualRow,
              message: `Carga horaria alta (${t} h). Validar si corresponde a multigrado o redistribución.`
            });
        }
        }
      }
    });

    return issues;
  }

  /**
   * Validación CRÍTICA: DIS_TRA (Tronco común / Plan estudios)
   * Evita errores como colocar 50h en una sola celda (duplicación de horas pedagógicas).
   * Reglas:
   * - K7 y L7 deben ser valores de catálogo: 0, 25, 30, 35, 40
   * - Nunca > 40 en una sola celda (ej. 50 es incorrecto)
   */
  function validateDisTraPlanCells(wb){
    const issues = [];
    const sheetName = findSheetName(wb, "DIS_TRA");
    if (!sheetName) return issues;

    const ws = wb.Sheets[sheetName];
    const cells = ["K7", "L7"];
    const allowed = new Set([0, 25, 30, 35, 40]);

    cells.forEach(cellAddr => {
      const cell = ws[cellAddr];
      if (!cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === "") return;

      const raw = cell.v;
      const num = Number(raw);

      if (Number.isNaN(num)) {
        issues.push({
          severity: "error",
          sheet: "DIS_TRA",
          paso: "11",
          row: 7,
          message: `Celda ${cellAddr} (Plan estudios - Tronco común) no es numérica: "${raw}".`
        });
        return;
      }

      if (num > 40) {
        issues.push({
          severity: "error",
          sheet: "DIS_TRA",
          paso: "11",
          row: 7,
          message: `Celda ${cellAddr} tiene ${num} horas pedagógicas. Esto no debe ocurrir (ej. 50 indica duplicación). Debe distribuirse correctamente (p.ej. 25 | 25).`
        });
        return;
      }

      if (!allowed.has(num)) {
        issues.push({
          severity: "warning",
          sheet: "DIS_TRA",
          paso: "11",
          row: 7,
          message: `Celda ${cellAddr} tiene ${num}. Valores esperados: 0, 25, 30, 35, 40. Verificar plan de estudios.`
        });
      }
    });

    return issues;
  }


  /**
   * Validar coherencia entre hojas
   */
  function validateCoherencia(data) {
    const issues = [];
    
    // Validar que el AMIE sea el mismo en Nómina, Par_PO y DIS_TRA
    const amies = {
      nomina: null,
      parPO: null,
      disTra: null
    };
    
    // Extraer AMIE de cada hoja
    if (data.nomina) {
      const row = data.nomina.find(r => r && r[0] && String(r[0]).includes('AMIE'));
      if (row) amies.nomina = row[1];
    }
    
    if (data.parPO) {
      const row = data.parPO.find(r => r && r[0] && String(r[0]).includes('AMIE'));
      if (row) amies.parPO = row[1];
    }
    
    if (data.disTra) {
      const row = data.disTra.find(r => r && r[0] && String(r[0]).includes('AMIE'));
      if (row) amies.disTra = row[1];
    }
    
    // Validar coherencia
    if (amies.nomina && amies.parPO && amies.nomina !== amies.parPO) {
      issues.push({
        severity: "error",
        sheet: "Coherencia",
        paso: "General",
        row: 0,
        message: `AMIE diferente entre Nómina (${amies.nomina}) y Par_PO (${amies.parPO})`
      });
    }
    
    if (amies.nomina && amies.disTra && amies.nomina !== amies.disTra) {
      issues.push({
        severity: "error",
        sheet: "Coherencia",
        paso: "General",
        row: 0,
        message: `AMIE diferente entre Nómina (${amies.nomina}) y DIS_TRA (${amies.disTra})`
      });
    }
    
    return issues;
  }

  /**
   * Extraer pasos de la hoja Pasos
   */
  function extractWorkflowSteps(wb) {
    const data = getSheetData(wb, "Pasos");
    if (!data || data.length === 0) return [];

    const steps = [];
    let inSteps = false;
    
    data.forEach(row => {
      if (!row) return;
      
      // Detectar inicio de tabla de pasos
      if (row[0] === 'Paso' && row[1] === 'Descripción') {
        inSteps = true;
        return;
      }
      
      if (inSteps && row[0] && typeof row[0] === 'number') {
        steps.push({
          paso: row[0],
          descripcion: row[1] || "",
          responsable: row[2] || ""
        });
      }
    });
    
    return steps;
  }

  // ============ GENERACIÓN DE REPORTE ============

  function generateReport(wb) {
    const report = {
      timestamp: new Date().toISOString(),
      fileName: currentWorkbook?.fileName || "desconocido",
      sheets: wb.SheetNames,
      issues: [],
      pasos: extractWorkflowSteps(wb),
      summary: { errors: 0, warnings: 0 },
      status: "VALIDADO",
      metodologia: "Norma Técnica PO 06-2025 - MinEduc Ecuador"
    };

    // Cargar datos de hojas
    const data = {
      nomina: getSheetData(wb, "Nómina"),
      parPO: getSheetData(wb, "Par_PO"),
      disTra: getSheetData(wb, "DIS_TRA"),
      param: getSheetData(wb, "Param")
    };

    // Guardar en estado global
    workbookData = data;

    // Ejecutar validaciones específicas por paso
    if (data.nomina) {
      report.issues.push(...validateAMIE(data.nomina));
      report.issues.push(...validateNomina(data.nomina));
    }
    
    if (data.parPO) {
      report.issues.push(...validateParPO(data.parPO));
    }
    
    if (data.disTra) {
      report.issues.push(...validateDisTra(data.disTra));
      report.issues.push(...validateDisTraPlanCells(wb));
    }
    
    // Validar coherencia entre hojas
    report.issues.push(...validateCoherencia(data));

    // Contar errores y warnings
    report.issues.forEach(issue => {
      if (issue.severity === "error") report.summary.errors++;
      if (issue.severity === "warning") report.summary.warnings++;
    });

    // Determinar estado final
    if (report.summary.errors > 0) {
      report.status = "⚠️ ERRORES CRÍTICOS - REQUIERE CORRECCIÓN";
    } else if (report.summary.warnings > 0) {
      report.status = "✓ VALIDADO CON OBSERVACIONES";
    } else {
      report.status = "✅ VALIDADO - CUMPLE NORMA TÉCNICA";
    }

    return report;
  }

  // ============ UI - MOSTRAR RESULTADOS ============

  function displayReport(report) {
    const { errors, warnings } = report.summary;
    const total = errors + warnings;

    let statusClass = 'status-success';
    let statusIcon = '✅';
    if (errors > 0) {
      statusClass = 'status-error';
      statusIcon = '❌';
    } else if (warnings > 0) {
      statusClass = 'status-warning';
      statusIcon = '⚠️';
    }

    let statusHTML = `
      <div class="status-header ${statusClass}">
        <h3>${statusIcon} ${report.status}</h3>
        <div class="status-badges">
          <span class="badge badge-error">❌ ${errors} Errores Críticos</span>
          <span class="badge badge-warning">⚠️ ${warnings} Observaciones</span>
        </div>
      </div>
      <div class="report-meta">
        <p><strong>📁 Archivo:</strong> ${report.fileName}</p>
        <p><strong>📊 Hojas:</strong> ${report.sheets.join(", ")}</p>
        <p><strong>📋 Metodología:</strong> ${report.metodologia}</p>
        <p><strong>🕐 Validación:</strong> ${new Date(report.timestamp).toLocaleString('es-EC')}</p>
        <p><strong>📝 Pasos detectados:</strong> ${report.pasos.length} pasos de la metodología</p>
      </div>
    `;

    setStatus(statusHTML, errors > 0);

    // Mostrar tabla de issues
    if (total > 0) {
      displayIssuesTable(report.issues);
    } else {
      $("issuesTable").innerHTML = '<div class="success-message">✅ Validación exitosa - La matriz cumple con todos los requisitos de la Norma Técnica</div>';
    }

    // Mostrar pasos del flujo
    displayWorkflowSteps(report.pasos);

    // Habilitar botones de descarga
    $("btnDownloadPdf").disabled = false;
    $("btnDownloadJson").disabled = false;
  }

  function displayIssuesTable(issues) {
    if (issues.length === 0) {
      $("issuesTable").innerHTML = "";
      return;
    }

    let html = `
      <h3>📋 Inconsistencias detectadas (${issues.length})</h3>
      <div class="table-note">
        <strong>Nota:</strong> Revise cada observación y corrija según el paso indicado de la metodología.
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Severidad</th>
            <th>Hoja</th>
            <th>Paso</th>
            <th>Fila</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Agrupar por severidad
    const errorIssues = issues.filter(i => i.severity === "error");
    const warningIssues = issues.filter(i => i.severity === "warning");
    
    [...errorIssues, ...warningIssues].forEach(issue => {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      const className = issue.severity === "error" ? "error-row" : "warning-row";
      html += `
        <tr class="${className}">
          <td>${icon} ${issue.severity.toUpperCase()}</td>
          <td><strong>${issue.sheet}</strong></td>
          <td>${issue.paso}</td>
          <td>${issue.row || "General"}</td>
          <td>${issue.message}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    $("issuesTable").innerHTML = html;
  }

  function displayWorkflowSteps(pasos) {
    if (pasos.length === 0) {
      $("workflowSteps").innerHTML = '<p class="muted">No se encontró la hoja "Pasos" (o viene con otro nombre). Verifica que exista una hoja llamada "Pasos".</p>';
      return;
    }

    let html = '<h4>📋 Flujo de trabajo (según hoja Pasos)</h4><table class="table workflow-table"><thead><tr><th>Paso</th><th>Descripción</th><th>Responsable</th></tr></thead><tbody>';
    
    pasos.forEach(paso => {
      html += `
        <tr>
          <td><strong>${paso.paso}</strong></td>
          <td>${paso.descripcion}</td>
          <td><span class="badge badge-info">${paso.responsable}</span></td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    $("workflowSteps").innerHTML = html;
  }

  // ============ EXPORTAR REPORTES ============

  async function generatePDF() {
    if (!validationReport) {
      alert("No hay reporte para descargar. Primero valida un archivo.");
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Título
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text("Reporte de Validación - Plantilla Óptima", 20, 20);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text("Ministerio de Educación del Ecuador", 20, 27);
      doc.text("Norma Técnica PO 06-2025", 20, 32);

      // Información del archivo
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text("Información del Archivo", 20, 42);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Archivo: ${validationReport.fileName}`, 20, 49);
      doc.text(`Estado: ${validationReport.status}`, 20, 55);
      doc.text(`Fecha: ${new Date(validationReport.timestamp).toLocaleString('es-EC')}`, 20, 61);
      doc.text(`Hojas: ${validationReport.sheets.join(", ")}`, 20, 67);

      // Resumen
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text("Resumen de Validación", 20, 77);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Errores críticos: ${validationReport.summary.errors}`, 20, 84);
      doc.text(`Observaciones: ${validationReport.summary.warnings}`, 20, 90);

      // Tabla de issues
      if (validationReport.issues.length > 0) {
        const tableData = validationReport.issues.map(issue => [
          issue.severity.toUpperCase(),
          issue.sheet,
          issue.paso,
          issue.row || "Gen.",
          issue.message.substring(0, 80) + (issue.message.length > 80 ? "..." : "")
        ]);

        doc.autoTable({
          head: [['Severidad', 'Hoja', 'Paso', 'Fila', 'Descripción']],
          body: tableData,
          startY: 100,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [44, 107, 255] },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 25 },
            2: { cellWidth: 15 },
            3: { cellWidth: 15 },
            4: { cellWidth: 100 }
          }
        });
      }

      // Guardar
      const filename = `Reporte_PO_${validationReport.fileName.replace(/\.[^/.]+$/, "")}_${Date.now()}.pdf`;
      doc.save(filename);
      
    } catch (error) {
      console.error("Error generando PDF:", error);
      alert("Error al generar PDF: " + error.message);
    }
  }

  function generateJSON() {
    if (!validationReport) {
      alert("No hay reporte para descargar. Primero valida un archivo.");
      return;
    }

    const dataStr = JSON.stringify(validationReport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `Reporte_PO_${validationReport.fileName.replace(/\.[^/.]+$/, "")}_${Date.now()}.json`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============ DIAGNÓSTICO ============

  async function diag(){
    ensureIds(); forceEnable();
    const hasX = !!window.XLSX;
    const hasJsPDF = !!window.jspdf;
    const info = [
      `🔍 PO-App ${BUILD} — Diagnóstico`,
      `📍 URL: ${location.href}`,
      `📊 XLSX: ${hasX ? "✅ Cargado" : "❌ NO disponible"}`,
      `📄 jsPDF: ${hasJsPDF ? "✅ Cargado" : "❌ NO disponible"}`,
      `🔧 Vendor XLSX: ${new URL("vendor/xlsx.full.min.js", location.href).toString()}`,
      `📦 Navegador: ${navigator.userAgent.substring(0, 60)}...`
    ].join("\n");
    setStatus(`<pre>${info}</pre>`);
    alert(info);
  }

  // ============ VALIDACIÓN PRINCIPAL ============

  async function validate(){
    ensureIds(); forceEnable();
    try{
      if(!window.XLSX) {
        throw new Error("❌ Librería XLSX no disponible. Verifica que vendor/xlsx.full.min.js esté cargado.");
      }
      
      const inp = $("fileInput");
      const file = inp?.files?.[0];
      
      if(!file) {
        throw new Error("⚠️ Selecciona un archivo .xlsx o .xlsm de la Matriz DTD.");
      }
      
      setStatus(`<div class="loading">⏳ Procesando: <strong>${file.name}</strong><br>Validando según Norma Técnica PO 06-2025...</div>`);
      
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, {type: "array"});
      
      currentWorkbook = { wb, fileName: file.name };
      
      // Generar reporte
      validationReport = generateReport(wb);
      
      // Mostrar resultados
      displayReport(validationReport);
      
      console.log("✅ Validación completada:", validationReport);
      
    } catch(e) {
      console.error("❌ Error en validación:", e);
      setStatus(`
        <div class="error-message">
          <h3>❌ Error en validación</h3>
          <p><strong>Mensaje:</strong> ${e.message || e}</p>
          <details>
            <summary>Ver detalles técnicos</summary>
            <pre>${e.stack || "No disponible"}</pre>
          </details>
          <p class="help-text">
            <strong>Solución:</strong> Verifica que el archivo sea una Matriz DTD válida con las hojas:
            Pasos, Nómina, Par_PO, DIS_TRA, Param
          </p>
        </div>
      `, true);
      alert(`❌ No se pudo validar: ${e.message || e}`);
    } finally {
      forceEnable();
    }
  }

  // ============ INICIALIZACIÓN ============

  function hook(){
    ensureIds();
    
    const v = $("btnValidate");
    const d = $("btnDiag");
    const pdfBtn = $("btnDownloadPdf");
    const jsonBtn = $("btnDownloadJson");

    if(v){
      v.type = "button";
      v.addEventListener("click", (e) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        validate();
      }, {passive: false});
    }
    
    if(d){
      d.type = "button";
      d.addEventListener("click", (e) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        diag();
      }, {passive: false});
    }

    if(pdfBtn) {
      pdfBtn.addEventListener("click", generatePDF);
    }

    if(jsonBtn) {
      jsonBtn.addEventListener("click", generateJSON);
    }

    // File input change
    const fileInput = $("fileInput");
    if(fileInput){
      fileInput.addEventListener("change", () => {
        const hint = $("excelHint");
        if(fileInput.files.length > 0){
          hint.textContent = `📁 Archivo seleccionado: ${fileInput.files[0].name}`;
          hint.style.color = "#3ddc84";
        }
      });
    }

    forceEnable();
    
    const obs = new MutationObserver(() => forceEnable());
    obs.observe(document.documentElement, {
      subtree: true, 
      attributes: true, 
      attributeFilter: ["disabled","class","style"]
    });
    
    setInterval(forceEnable, 1200);

    setStatus(`
      <div class="welcome-message">
        <h3>🚀 PO-App ${BUILD} - Validador MinEduc Ecuador</h3>
        <p><strong>Norma Técnica de Plantilla Óptima 06-2025</strong></p>
        <ol>
          <li>📂 <strong>Selecciona</strong> tu archivo Matriz DTD (.xlsx / .xlsm)</li>
          <li>✅ <strong>Valida</strong> según la metodología oficial</li>
          <li>📊 <strong>Revisa</strong> los errores y observaciones por paso</li>
          <li>💾 <strong>Descarga</strong> el reporte en PDF o JSON</li>
        </ol>
        <div class="metodologia-note">
          <strong>📋 Pasos validados:</strong> AMIE, Nómina docente, FUNxIE, Esta en IE, 
          Par_PO (datos IE), DIS_TRA (carga horaria), coherencia entre hojas
        </div>
      </div>
    `);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hook);
  } else {
    setTimeout(hook, 100);
  }
})();
