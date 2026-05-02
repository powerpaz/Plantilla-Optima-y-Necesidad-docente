(function(){
  const BUILD = 'v20.0.0';
  const $ = id => document.getElementById(id);
  let lastReport = null;

  document.addEventListener('DOMContentLoaded', () => {
    $('btnValidate').addEventListener('click', validateBatch);
    $('btnDownloadXlsx').addEventListener('click', downloadXlsx);
    $('btnDownloadJson').addEventListener('click', downloadJson);
    $('btnDownloadPdf').addEventListener('click', downloadPdf);
  });

  async function validateBatch(){
    const masterFile = $('masterInput').files[0];
    const matrixFiles = Array.from($('matricesInput').files || []);

    if (!masterFile){
      renderSummaryMessage('Debes cargar el archivo maestro con la lista de AMIE.', true);
      return;
    }
    if (!matrixFiles.length){
      renderSummaryMessage('Debes cargar al menos una matriz DTD.', true);
      return;
    }

    try {
      renderSummaryMessage('Leyendo archivos y aplicando validaciones...');
      const masterWb = await readWorkbook(masterFile);
      const expected = extractExpectedAmies(masterWb);
      const matrixEntries = [];
      for (const file of matrixFiles){
        const wb = await readWorkbook(file);
        matrixEntries.push({ file, wb, ...inspectMatrixWorkbook(file.name, wb) });
      }
      lastReport = buildBatchReport(expected, matrixEntries, masterFile.name);
      renderReport(lastReport);
      setDownloadButtons(true);
    } catch (err) {
      console.error(err);
      renderSummaryMessage('No se pudo completar la validación: ' + err.message, true);
      setDownloadButtons(false);
    }
  }

  function setDownloadButtons(enabled){
    $('btnDownloadXlsx').disabled = !enabled;
    $('btnDownloadJson').disabled = !enabled;
    $('btnDownloadPdf').disabled = !enabled;
  }

  async function readWorkbook(file){
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: true, cellNF: true, cellStyles: true });
  }

  function normalize(v){
    return (v == null ? '' : String(v)).trim();
  }

  function normalizeSheetName(v){
    return normalize(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function findSheetName(wb, wanted){
    const want = wanted.map(normalizeSheetName);
    for (const name of wb.SheetNames){
      const n = normalizeSheetName(name);
      if (want.includes(n)) return name;
    }
    for (const name of wb.SheetNames){
      const n = normalizeSheetName(name);
      if (want.some(w => n.includes(w) || w.includes(n))) return name;
    }
    return null;
  }

  function sheetToAoA(wb, aliases){
    const name = findSheetName(wb, aliases);
    if (!name) return null;
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
  }

  function getCellDisplay(aoa, row1, col1){
    const row = aoa?.[row1 - 1] || [];
    return row[col1 - 1];
  }

  function toNumber(v){
    if (typeof v === 'number') return v;
    const txt = normalize(v).replace(/\./g, '').replace(',', '.');
    const m = txt.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function firstAmieInText(text){
    const m = normalize(text).toUpperCase().match(/\b\d{2}[BH]\d{5}\b/);
    return m ? m[0] : '';
  }

  function extractExpectedAmies(masterWb){
    const startRow = 3;
    const colM = 13;
    let best = null;

    masterWb.SheetNames.forEach(sheetName => {
      const aoa = XLSX.utils.sheet_to_json(masterWb.Sheets[sheetName], { header: 1, defval: null, raw: false });
      const rows = [];
      for (let r = startRow; r <= aoa.length + 20; r++){
        const value = getCellDisplay(aoa, r, colM);
        if (value == null || normalize(value) === '') continue;
        const amie = firstAmieInText(value);
        if (amie) rows.push({ row: r, amie });
      }
      if (!best || rows.length > best.rows.length) best = { sheet: sheetName, rows };
    });

    if (!best || !best.rows.length){
      throw new Error('No se encontraron códigos AMIE en la columna M desde la fila 3 del archivo maestro.');
    }

    const counts = {};
    best.rows.forEach(x => counts[x.amie] = (counts[x.amie] || 0) + 1);
    const unique = Object.keys(counts).sort();
    return { sheet: best.sheet, rows: best.rows, counts, unique, totalRows: best.rows.length };
  }

  function inspectMatrixWorkbook(fileName, wb){
    const nomina = sheetToAoA(wb, ['NOMINA', 'NÓMINA']);
    const parpo = sheetToAoA(wb, ['PAR_PO', 'PAR PO']);
    const distra = sheetToAoA(wb, ['DIS_TRA', 'DIS TRA']);
    const fileAmie = firstAmieInText(fileName);
    const nominaAmie = firstAmieInText(getCellDisplay(nomina, 5, 2));
    const parpoAmie = firstAmieInText(getCellDisplay(parpo, 3, 2));
    const amie = nominaAmie || parpoAmie || fileAmie;
    const issues = [];

    if (!nomina) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja Nómina.'));
    if (!parpo) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja Par_PO.'));
    if (!distra) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja DIS_TRA.'));
    if (!amie) issues.push(issue('error', '', fileName, 'General', '', 'No fue posible identificar el AMIE del archivo.'));
    if (fileAmie && amie && fileAmie !== amie) issues.push(issue('warning', amie, fileName, 'General', '', `El AMIE del nombre de archivo (${fileAmie}) no coincide con el AMIE leído (${amie}).`));
    if (nominaAmie && parpoAmie && nominaAmie !== parpoAmie) issues.push(issue('error', amie, fileName, 'General', '', `El AMIE de Nómina (${nominaAmie}) no coincide con Par_PO (${parpoAmie}).`));

    if (nomina) validateNomina(amie, fileName, nomina, issues);
    const parInfo = parpo ? validateParPO(amie, fileName, parpo, issues) : { paralelosActivos: 0 };
    if (distra) validateDistra(amie, fileName, distra, parInfo.paralelosActivos, issues);

    return { amie, fileName, fileAmie, nominaAmie, parpoAmie, issues };
  }

  function issue(level, amie, fileName, sheet, cell, message){
    return { level, amie, fileName, sheet, cell, message };
  }

  function validateNomina(amie, fileName, aoa, issues){
    const amieB5 = firstAmieInText(getCellDisplay(aoa, 5, 2));
    if (!amieB5) issues.push(issue('error', amie, fileName, 'Nómina', 'B5', 'La celda B5 no contiene un código AMIE válido.'));

    const needRows = [];
    for (let r = 11; r <= aoa.length; r++){
      const a = getCellDisplay(aoa, r, 1);
      const b = getCellDisplay(aoa, r, 2);
      const c = getCellDisplay(aoa, r, 3);
      const d = getCellDisplay(aoa, r, 4);
      const e = getCellDisplay(aoa, r, 5);
      const f = getCellDisplay(aoa, r, 6);
      if ([a,b,c,d,e,f].every(v => normalize(v) === '')) {
        if (r > 12) break;
        continue;
      }
      needRows.push({ r, value: toNumber(e), secuencia: a, nombre: f });
    }
    if (!needRows.length){
      issues.push(issue('warning', amie, fileName, 'Nómina', 'E11:E', 'No se encontraron filas activas de necesidad docente en la tabla superior.'));
    }
    needRows.forEach(row => {
      if (Number.isNaN(row.value)) {
        issues.push(issue('error', amie, fileName, 'Nómina', `E${row.r}`, `La necesidad en E${row.r} no es numérica.`));
      } else if (row.value < 10) {
        issues.push(issue('error', amie, fileName, 'Nómina', `E${row.r}`, `Valor ${row.value} en E${row.r}: no hay necesidad válida, no debería asignarse.`));
      } else if (row.value < 25) {
        issues.push(issue('warning', amie, fileName, 'Nómina', `E${row.r}`, `Valor ${row.value} en E${row.r}: revisar porque no llega a 25.`));
      }
    });

    for (let r = 23; r <= aoa.length; r++){
      const row = aoa[r - 1] || [];
      const joined = row.slice(0, 10).map(normalize).join('');
      if (!joined) continue;
      const gradeAnchor = normalize(getCellDisplay(aoa, r, 1));
      const cedula = normalize(row[6]);
      const nombre = normalize(row[7]);
      if (!gradeAnchor) issues.push(issue('warning', amie, fileName, 'Nómina', `A${r}`, 'Fila activa sin consecutivo o identificador en columna A desde A23.'));
      if (cedula && !nombre) issues.push(issue('warning', amie, fileName, 'Nómina', `H${r}`, 'Existe cédula pero falta nombres y apellidos.'));
      if (!cedula && nombre) issues.push(issue('warning', amie, fileName, 'Nómina', `G${r}`, 'Existe nombre pero falta número de cédula.'));
    }
  }

  function validateParPO(amie, fileName, aoa, issues){
    const amieB3 = firstAmieInText(getCellDisplay(aoa, 3, 2));
    if (!amieB3) issues.push(issue('error', amie, fileName, 'Par_PO', 'B3', 'La celda B3 no contiene AMIE válido.'));

    let paralelosActivos = 0;
    for (let r = 23; r <= aoa.length; r++){
      const grado = normalize(getCellDisplay(aoa, r, 1));
      const jornada = normalize(getCellDisplay(aoa, r, 3));
      const paralelo = normalize(getCellDisplay(aoa, r, 4));
      const estudiantesRaw = getCellDisplay(aoa, r, 5);
      const obs = normalize(getCellDisplay(aoa, r, 6));
      const active = [grado, jornada, paralelo, normalize(estudiantesRaw), obs].some(Boolean);
      if (!active) continue;
      paralelosActivos += 1;
      if (!grado) issues.push(issue('error', amie, fileName, 'Par_PO', `A${r}`, 'La columna Grado/Curso está vacía en una fila activa.'));
      const estudiantes = toNumber(estudiantesRaw);
      if (Number.isNaN(estudiantes)) {
        issues.push(issue('error', amie, fileName, 'Par_PO', `E${r}`, 'El número de estudiantes no es numérico.'));
      } else if (estudiantes < 15) {
        issues.push(issue('error', amie, fileName, 'Par_PO', `E${r}`, `Valor ${estudiantes}: no estaría en visto verde.`));
      } else if (estudiantes < 20) {
        issues.push(issue('warning', amie, fileName, 'Par_PO', `E${r}`, `Valor ${estudiantes}: revisar porque no está en visto verde.`));
      }
    }
    if (!paralelosActivos) issues.push(issue('warning', amie, fileName, 'Par_PO', 'A23:E', 'No se detectaron paralelos activos desde la fila 23.'));
    return { paralelosActivos };
  }

  function validateDistra(amie, fileName, aoa, paralelosActivos, issues){
    const headers = [];
    for (let c = 11; c <= 400; c++){
      const row8 = normalize(getCellDisplay(aoa, 8, c));
      const row9 = normalize(getCellDisplay(aoa, 9, c));
      const row7 = normalize(getCellDisplay(aoa, 7, c));
      if (!row8 && !row9 && !row7) break;
      headers.push({ c, row7, row8, row9 });
    }

    if (!headers.length){
      issues.push(issue('error', amie, fileName, 'DIS_TRA', 'K6:K9', 'No se detectaron columnas de carga horaria desde K.'));
      return;
    }

    headers.forEach(h => {
      const tronco = toNumber(getCellDisplay(aoa, 6, h.c));
      if (Number.isNaN(tronco)) {
        issues.push(issue('error', amie, fileName, 'DIS_TRA', `${colLetter(h.c)}6`, 'El valor de tronco común no es numérico.'));
      } else if (tronco !== 0) {
        issues.push(issue('error', amie, fileName, 'DIS_TRA', `${colLetter(h.c)}6`, `Tronco común debe ser 0 y se encontró ${tronco}.`));
      }
    });

    if (paralelosActivos && headers.length !== paralelosActivos){
      issues.push(issue('warning', amie, fileName, 'DIS_TRA', 'K:... vs Par_PO', `Cantidad de columnas de carga (${headers.length}) no coincide con filas activas de Par_PO (${paralelosActivos}).`));
    }
  }

  function buildBatchReport(expected, matrixEntries, masterFileName){
    const byAmie = new Map();
    matrixEntries.forEach(entry => {
      if (!entry.amie) return;
      if (!byAmie.has(entry.amie)) byAmie.set(entry.amie, []);
      byAmie.get(entry.amie).push(entry);
    });

    const expectedRows = [];
    const allIssues = [];
    const seenUploadedAmies = new Set();

    expected.unique.forEach(amie => {
      const entries = byAmie.get(amie) || [];
      entries.forEach(e => seenUploadedAmies.add(e.amie));
      if (!entries.length){
        expectedRows.push({
          amie,
          occurrencesMaster: expected.counts[amie] || 0,
          filesFound: 0,
          files: '',
          status: 'ERROR',
          errors: 1,
          warnings: 0,
          summary: 'No se cargó archivo para este AMIE.'
        });
        allIssues.push(issue('error', amie, '', 'Cruce maestro', '', 'AMIE presente en el archivo maestro pero sin matriz DTD cargada.'));
        return;
      }

      if (entries.length > 1){
        allIssues.push(issue('warning', amie, entries.map(x => x.fileName).join(' | '), 'Cruce maestro', '', `Se cargaron ${entries.length} archivos para el mismo AMIE.`));
      }

      const errors = entries.reduce((acc, e) => acc + e.issues.filter(i => i.level === 'error').length, 0);
      const warnings = entries.reduce((acc, e) => acc + e.issues.filter(i => i.level === 'warning').length, 0);
      entries.forEach(e => allIssues.push(...e.issues));
      expectedRows.push({
        amie,
        occurrencesMaster: expected.counts[amie] || 0,
        filesFound: entries.length,
        files: entries.map(e => e.fileName).join(' | '),
        status: errors ? 'ERROR' : (warnings ? 'ADVERTENCIA' : 'OK'),
        errors,
        warnings,
        summary: errors ? 'Tiene errores de revisión.' : (warnings ? 'Tiene observaciones.' : 'Sin novedades.')
      });
    });

    const unexpected = matrixEntries.filter(e => e.amie && !expected.counts[e.amie]);
    unexpected.forEach(e => allIssues.push(issue('warning', e.amie, e.fileName, 'Cruce maestro', '', 'Archivo cargado cuyo AMIE no aparece en el maestro.')));

    matrixEntries.filter(e => !e.amie).forEach(e => allIssues.push(...e.issues));

    const summary = {
      build: BUILD,
      masterFile: masterFileName,
      masterSheet: expected.sheet,
      totalRowsMaster: expected.totalRows,
      totalUniqueMaster: expected.unique.length,
      matricesLoaded: matrixEntries.length,
      matchedAmies: expectedRows.filter(r => r.filesFound > 0).length,
      missingAmies: expectedRows.filter(r => r.filesFound === 0).length,
      unexpectedFiles: unexpected.length,
      ok: expectedRows.filter(r => r.status === 'OK').length,
      warnings: expectedRows.filter(r => r.status === 'ADVERTENCIA').length,
      errors: expectedRows.filter(r => r.status === 'ERROR').length,
      totalIssues: allIssues.length
    };

    return { summary, expectedRows, allIssues, expected, matrixEntries };
  }

  function renderSummaryMessage(msg, isError=false){
    $('summaryCards').innerHTML = `<h2>2. Resumen</h2><div class="badge ${isError ? 'err' : 'warn'}">${escapeHtml(msg)}</div>`;
  }

  function renderReport(report){
    const s = report.summary;
    $('summaryCards').innerHTML = `
      <h2>2. Resumen</h2>
      <div class="kpis">
        <div class="kpi"><div class="muted">AMIE únicos en maestro</div><div class="num">${s.totalUniqueMaster}</div></div>
        <div class="kpi"><div class="muted">Matrices cargadas</div><div class="num">${s.matricesLoaded}</div></div>
        <div class="kpi"><div class="muted">AMIE sin archivo</div><div class="num">${s.missingAmies}</div></div>
        <div class="kpi"><div class="muted">Con error</div><div class="num">${s.errors}</div></div>
        <div class="kpi"><div class="muted">Con advertencia</div><div class="num">${s.warnings}</div></div>
        <div class="kpi"><div class="muted">Sin novedades</div><div class="num">${s.ok}</div></div>
      </div>
      <p class="small muted mt16">Archivo maestro: <span class="code">${escapeHtml(s.masterFile)}</span> · Hoja leída: <span class="code">${escapeHtml(s.masterSheet)}</span> · Filas AMIE detectadas: ${s.totalRowsMaster}</p>
    `;

    $('resultsTableWrap').innerHTML = buildResultsTable(report.expectedRows);
    $('issuesTableWrap').innerHTML = buildIssuesTable(report.allIssues);
  }

  function buildResultsTable(rows){
    if (!rows.length) return '<div class="muted">No hay resultados.</div>';
    return `
      <table>
        <thead><tr><th>AMIE</th><th>Veces en maestro</th><th>Archivos</th><th>Estado</th><th>Errores</th><th>Advertencias</th><th>Resumen</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.amie)}</strong></td>
              <td>${r.occurrencesMaster}</td>
              <td>${escapeHtml(r.files || '-')}</td>
              <td>${statusBadge(r.status)}</td>
              <td>${r.errors}</td>
              <td>${r.warnings}</td>
              <td>${escapeHtml(r.summary)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildIssuesTable(rows){
    if (!rows.length) return '<div class="muted">Sin novedades.</div>';
    return `
      <table>
        <thead><tr><th>Nivel</th><th>AMIE</th><th>Archivo</th><th>Hoja</th><th>Celda</th><th>Novedad</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.level === 'error' ? '<span class="badge err">ERROR</span>' : '<span class="badge warn">ADVERTENCIA</span>'}</td>
              <td>${escapeHtml(r.amie || '-')}</td>
              <td>${escapeHtml(r.fileName || '-')}</td>
              <td>${escapeHtml(r.sheet || '-')}</td>
              <td>${escapeHtml(r.cell || '-')}</td>
              <td>${escapeHtml(r.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function statusBadge(status){
    if (status === 'OK') return '<span class="badge ok">OK</span>';
    if (status === 'ADVERTENCIA') return '<span class="badge warn">ADVERTENCIA</span>';
    return '<span class="badge err">ERROR</span>';
  }

  function escapeHtml(text){
    return String(text ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function colLetter(n){
    let s='';
    while (n > 0){
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function downloadJson(){
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `reporte_validacion_dtd_${dateStamp()}.json`);
  }

  function downloadXlsx(){
    if (!lastReport) return;
    const wb = XLSX.utils.book_new();
    const resumen = [
      ['Indicador', 'Valor'],
      ...Object.entries(lastReport.summary)
    ];
    const detalle = [
      ['AMIE','Veces en maestro','Archivos encontrados','Estado','Errores','Advertencias','Resumen','Archivo(s)'],
      ...lastReport.expectedRows.map(r => [r.amie, r.occurrencesMaster, r.filesFound, r.status, r.errors, r.warnings, r.summary, r.files])
    ];
    const issues = [
      ['Nivel','AMIE','Archivo','Hoja','Celda','Novedad'],
      ...lastReport.allIssues.map(i => [i.level, i.amie, i.fileName, i.sheet, i.cell, i.message])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), 'Resultado_AMIE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(issues), 'Novedades');
    XLSX.writeFile(wb, `reporte_validacion_dtd_${dateStamp()}.xlsx`);
  }

  function downloadPdf(){
    if (!lastReport || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape' });
    const s = lastReport.summary;
    pdf.setFontSize(16);
    pdf.text('Resumen de validación masiva DTD', 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Archivo maestro: ${s.masterFile}`, 14, 24);
    pdf.text(`AMIE únicos: ${s.totalUniqueMaster} | Matrices cargadas: ${s.matricesLoaded} | Sin archivo: ${s.missingAmies}`, 14, 30);
    pdf.text(`OK: ${s.ok} | Advertencia: ${s.warnings} | Error: ${s.errors}`, 14, 36);
    pdf.autoTable({
      startY: 42,
      head: [['AMIE','Estado','Errores','Advertencias','Resumen']],
      body: lastReport.expectedRows.map(r => [r.amie, r.status, r.errors, r.warnings, r.summary]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15,76,129] }
    });
    pdf.save(`resumen_validacion_dtd_${dateStamp()}.pdf`);
  }

  function triggerDownload(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dateStamp(){
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
})();
