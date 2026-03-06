(function(){
  const BUILD = 'v21.0.0';
  const $ = id => document.getElementById(id);
  let lastReport = null;

  document.addEventListener('DOMContentLoaded', () => {
    $('btnValidate').addEventListener('click', validateBatch);
    $('btnDownloadXlsx').addEventListener('click', downloadXlsx);
    $('btnDownloadJson').addEventListener('click', downloadJson);
    $('btnDownloadPdf').addEventListener('click', downloadPdf);
  });

  async function validateBatch(){
    const matrixFiles = Array.from($('matricesInput').files || []);
    if (!matrixFiles.length){
      renderSummaryMessage('Debes cargar al menos una matriz DTD institucional.', true);
      return;
    }
    try {
      renderSummaryMessage('Leyendo archivos y aplicando la revisión de la primera parte...');
      const entries = [];
      for (const file of matrixFiles){
        const wb = await readWorkbook(file);
        entries.push(inspectMatrixWorkbook(file.name, wb));
      }
      lastReport = buildReport(entries);
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

  function getSheet(wb, aliases){
    const name = findSheetName(wb, aliases);
    return name ? { name, ws: wb.Sheets[name] } : null;
  }

  function getCellDisplay(ws, address){
    const direct = ws?.[address];
    if (direct) return displayCell(direct);
    const mergeAnchor = findMergeAnchor(ws, address);
    if (mergeAnchor && ws[mergeAnchor]) return displayCell(ws[mergeAnchor]);
    return '';
  }

  function displayCell(cell){
    if (!cell) return '';
    if (cell.w != null && String(cell.w).trim() !== '') return cell.w;
    if (cell.v != null && String(cell.v).trim() !== '') return cell.v;
    if (cell.f != null && String(cell.f).trim() !== '') return '=' + cell.f;
    return '';
  }

  function findMergeAnchor(ws, address){
    if (!ws || !ws['!merges']) return null;
    const target = XLSX.utils.decode_cell(address);
    for (const m of ws['!merges']){
      if (target.r >= m.s.r && target.r <= m.e.r && target.c >= m.s.c && target.c <= m.e.c){
        return XLSX.utils.encode_cell(m.s);
      }
    }
    return null;
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

  function issue(level, amie, fileName, sheet, cell, message){
    return { level, amie, fileName, sheet, cell, message };
  }

  function inspectMatrixWorkbook(fileName, wb){
    const issues = [];
    const pasos = getSheet(wb, ['PASOS']);
    const nomina = getSheet(wb, ['NOMINA', 'NÓMINA']);
    const parpo = getSheet(wb, ['PAR_PO', 'PAR PO']);
    const distra = getSheet(wb, ['DIS_TRA', 'DIS TRA']);
    const plan = getSheet(wb, ['PLANESTUDIO', 'PLAN ESTUDIO']);
    const bt = getSheet(wb, ['BT_', 'BT']);
    const ebja = getSheet(wb, ['EBJA TEC', 'EBJA_TEC', 'EBJA']);

    const fileAmie = firstAmieInText(fileName);
    const nominaAmie = nomina ? firstAmieInText(getCellDisplay(nomina.ws, 'B5')) : '';
    const parpoAmie = parpo ? firstAmieInText(getCellDisplay(parpo.ws, 'B3')) : '';
    const amie = nominaAmie || parpoAmie || fileAmie;

    if (!pasos) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja Pasos.'));
    if (!nomina) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja Nómina.'));
    if (!parpo) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja Par_PO.'));
    if (!distra) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja DIS_TRA.'));
    if (!plan) issues.push(issue('error', amie, fileName, 'General', '', 'Falta la hoja PlanEstudio.'));
    if (!bt) issues.push(issue('warning', amie, fileName, 'General', '', 'No se encontró la hoja BT/BT_.'));
    if (!ebja) issues.push(issue('warning', amie, fileName, 'General', '', 'No se encontró la hoja EBJA TEC.'));
    if (!amie) issues.push(issue('error', '', fileName, 'General', '', 'No fue posible identificar el AMIE del archivo.'));
    if (fileAmie && amie && fileAmie !== amie) issues.push(issue('warning', amie, fileName, 'General', '', `El AMIE del nombre de archivo (${fileAmie}) no coincide con el AMIE leído (${amie}).`));
    if (nominaAmie && parpoAmie && nominaAmie !== parpoAmie) issues.push(issue('error', amie, fileName, 'General', '', `El AMIE de Nómina (${nominaAmie}) no coincide con Par_PO (${parpoAmie}).`));

    if (pasos) validatePasos(amie, fileName, pasos.ws, issues);
    if (nomina) validateNomina(amie, fileName, nomina.ws, issues);
    if (parpo) validateParPO(amie, fileName, parpo.ws, issues);
    if (distra) validateDistra(amie, fileName, distra.ws, issues);
    if (plan) validateGenericContent(amie, fileName, 'PlanEstudio', plan.ws, issues, ['A1','A2']);
    if (bt) validateGenericContent(amie, fileName, bt.name, bt.ws, issues, ['A1']);
    if (ebja) validateGenericContent(amie, fileName, ebja.name, ebja.ws, issues, ['A2','B2']);

    return { fileName, amie, fileAmie, nominaAmie, parpoAmie, issues };
  }

  function validatePasos(amie, fileName, ws, issues){
    ['A1','A2','A7','B7','C7'].forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('error', amie, fileName, 'Pasos', addr, 'Celda obligatoria vacía en la hoja Pasos.'));
      }
    });
    let validSteps = 0;
    for (let r = 8; r <= 18; r++){
      const a = normalize(getCellDisplay(ws, `A${r}`));
      const b = normalize(getCellDisplay(ws, `B${r}`));
      const c = normalize(getCellDisplay(ws, `C${r}`));
      if (a || b || c) validSteps += 1;
      if ((a || b || c) && (!a || !b || !c)){
        issues.push(issue('warning', amie, fileName, 'Pasos', `A${r}:C${r}`, 'Fila de instrucciones incompleta en la hoja Pasos.'));
      }
    }
    if (validSteps < 8){
      issues.push(issue('warning', amie, fileName, 'Pasos', 'A8:C18', 'La tabla de pasos parece incompleta o recortada.'));
    }
  }

  function validateNomina(amie, fileName, ws, issues){
    const b5 = normalize(getCellDisplay(ws, 'B5'));
    const b6 = normalize(getCellDisplay(ws, 'B6'));
    const e11 = getCellDisplay(ws, 'E11');
    const e12 = getCellDisplay(ws, 'E12');

    if (!firstAmieInText(b5)) issues.push(issue('error', amie, fileName, 'Nómina', 'B5', 'B5 no contiene un código AMIE válido.'));
    if (!b6) issues.push(issue('error', amie, fileName, 'Nómina', 'B6', 'Falta el nombre de la institución educativa.'));
    ['E11','E12'].forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('error', amie, fileName, 'Nómina', addr, `La celda ${addr} está vacía.`));
      }
    });
    [ ['E11', e11], ['E12', e12] ].forEach(([addr,val]) => {
      const n = toNumber(val);
      if (!Number.isNaN(n) && n < 10){
        issues.push(issue('warning', amie, fileName, 'Nómina', addr, `Valor ${n} detectado en ${addr}. Queda reportado para revisión de necesidad.`));
      }
    });

    let activeRows = 0;
    for (let r = 17; r <= 400; r++){
      const rowVals = ['B','C','D','E','G','H'].map(c => normalize(getCellDisplay(ws, `${c}${r}`)));
      const active = rowVals.some(Boolean);
      if (!active){
        if (activeRows > 0) {
          let nextFilled = false;
          for (let x = r + 1; x <= Math.min(r + 3, 400); x++){
            if (['B','C','D','E','G','H'].some(c => normalize(getCellDisplay(ws, `${c}${x}`)))) { nextFilled = true; break; }
          }
          if (!nextFilled) break;
        }
        continue;
      }
      activeRows += 1;
      ['B','C','D','E','G','H'].forEach(c => {
        if (!normalize(getCellDisplay(ws, `${c}${r}`))){
          issues.push(issue('error', amie, fileName, 'Nómina', `${c}${r}`, 'Fila activa con dato obligatorio vacío en la tabla de personal.'));
        }
      });
    }
    if (!activeRows){
      issues.push(issue('warning', amie, fileName, 'Nómina', 'B17:H', 'No se detectaron filas activas de personal en la hoja Nómina.'));
    }
  }

  function validateParPO(amie, fileName, ws, issues){
    const requiredTop = ['B3','D3','F3','B4','D4','F4','B5','D5','F5','B6','D6','F6','B7','D7'];
    requiredTop.forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('error', amie, fileName, 'Par_PO', addr, 'Dato obligatorio vacío en el bloque superior de identificación.'));
      }
    });

    const planCells = ['D9','F9','H9','D10','F10'];
    planCells.forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('warning', amie, fileName, 'Par_PO', addr, 'Celda de plan de estudio / carga horaria sin contenido.'));
      }
    });

    let activeRows = 0;
    for (let r = 23; r <= 500; r++){
      const vals = ['A','C','D','E'].map(c => normalize(getCellDisplay(ws, `${c}${r}`)));
      const active = vals.some(Boolean);
      if (!active){
        if (activeRows > 0) {
          let nextFilled = false;
          for (let x = r + 1; x <= Math.min(r + 3, 500); x++){
            if (['A','C','D','E'].some(c => normalize(getCellDisplay(ws, `${c}${x}`)))) { nextFilled = true; break; }
          }
          if (!nextFilled) break;
        }
        continue;
      }
      activeRows += 1;
      ['A','C','D','E'].forEach(c => {
        if (!normalize(getCellDisplay(ws, `${c}${r}`))){
          issues.push(issue('error', amie, fileName, 'Par_PO', `${c}${r}`, 'Fila activa con dato obligatorio vacío.'));
        }
      });
    }
    if (!activeRows){
      issues.push(issue('warning', amie, fileName, 'Par_PO', 'A23:E', 'No se detectaron filas activas de paralelos desde la fila 23.'));
    }
  }

  function validateDistra(amie, fileName, ws, issues){
    ['A1','J6','J7'].forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('warning', amie, fileName, 'DIS_TRA', addr, 'Celda clave vacía en DIS_TRA.'));
      }
    });
    let structureCols = 0;
    for (let c = 11; c <= 80; c++){
      const row7 = normalize(getCellDisplay(ws, `${colLetter(c)}7`));
      const row8 = normalize(getCellDisplay(ws, `${colLetter(c)}8`));
      const row9 = normalize(getCellDisplay(ws, `${colLetter(c)}9`));
      if (row7 || row8 || row9) structureCols += 1;
      else if (structureCols > 0) break;
    }
    if (!structureCols){
      issues.push(issue('warning', amie, fileName, 'DIS_TRA', 'K7:...', 'No se detectó estructura de carga horaria desde la columna K.'));
    }
  }

  function validateGenericContent(amie, fileName, sheetName, ws, issues, keyCells){
    keyCells.forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr))){
        issues.push(issue('warning', amie, fileName, sheetName, addr, 'Celda clave vacía en la hoja.'));
      }
    });
    let used = 0;
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (range){
      for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40); r++){
        let rowHas = false;
        for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 10); c++){
          if (normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r,c})))) { rowHas = true; break; }
        }
        if (rowHas) used += 1;
      }
    }
    if (used < 3){
      issues.push(issue('warning', amie, fileName, sheetName, '', 'La hoja tiene muy poco contenido visible y conviene revisarla.'));
    }
  }

  function buildReport(entries){
    const allIssues = [];
    const byAmie = new Map();
    const fileRows = entries.map(entry => {
      entry.issues.forEach(i => allIssues.push(i));
      if (entry.amie){
        if (!byAmie.has(entry.amie)) byAmie.set(entry.amie, 0);
        byAmie.set(entry.amie, byAmie.get(entry.amie) + 1);
      }
      const errors = entry.issues.filter(i => i.level === 'error').length;
      const warnings = entry.issues.filter(i => i.level === 'warning').length;
      const info = entry.issues.filter(i => i.level === 'info').length;
      return {
        fileName: entry.fileName,
        amie: entry.amie || '-',
        status: errors ? 'ERROR' : (warnings ? 'ADVERTENCIA' : 'OK'),
        errors,
        warnings,
        info,
        summary: errors ? 'Tiene errores de revisión.' : (warnings ? 'Tiene observaciones.' : 'Sin novedades.')
      };
    });

    for (const [amie, count] of byAmie.entries()){
      if (count > 1){
        allIssues.push(issue('warning', amie, '', 'Cruce interno', '', `Se cargaron ${count} archivos para el mismo AMIE.`));
      }
    }

    const summary = {
      build: BUILD,
      matricesLoaded: entries.length,
      amiesDetected: Array.from(new Set(entries.map(e => e.amie).filter(Boolean))).length,
      ok: fileRows.filter(r => r.status === 'OK').length,
      warnings: fileRows.filter(r => r.status === 'ADVERTENCIA').length,
      errors: fileRows.filter(r => r.status === 'ERROR').length,
      totalIssues: allIssues.length
    };

    return { summary, fileRows, allIssues };
  }

  function renderSummaryMessage(msg, isError=false){
    $('summaryCards').innerHTML = `<h2>2. Resumen</h2><div class="badge ${isError ? 'err' : 'warn'}">${escapeHtml(msg)}</div>`;
  }

  function renderReport(report){
    const s = report.summary;
    $('summaryCards').innerHTML = `
      <h2>2. Resumen</h2>
      <div class="kpis">
        <div class="kpi"><div class="muted">Matrices cargadas</div><div class="num">${s.matricesLoaded}</div></div>
        <div class="kpi"><div class="muted">AMIE detectados</div><div class="num">${s.amiesDetected}</div></div>
        <div class="kpi"><div class="muted">Con error</div><div class="num">${s.errors}</div></div>
        <div class="kpi"><div class="muted">Con advertencia</div><div class="num">${s.warnings}</div></div>
        <div class="kpi"><div class="muted">Sin novedades</div><div class="num">${s.ok}</div></div>
      </div>
      <p class="small muted mt16">Versión: <span class="code">${escapeHtml(s.build)}</span> · Total de novedades detectadas: ${s.totalIssues}</p>
    `;
    $('resultsTableWrap').innerHTML = buildResultsTable(report.fileRows);
    $('issuesTableWrap').innerHTML = buildIssuesTable(report.allIssues);
  }

  function buildResultsTable(rows){
    if (!rows.length) return '<div class="muted">No hay resultados.</div>';
    return `
      <table>
        <thead><tr><th>Archivo</th><th>AMIE</th><th>Estado</th><th>Errores</th><th>Advertencias</th><th>Resumen</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.fileName)}</td>
              <td><strong>${escapeHtml(r.amie)}</strong></td>
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
              <td>${levelBadge(r.level)}</td>
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

  function levelBadge(level){
    if (level === 'error') return '<span class="badge err">ERROR</span>';
    if (level === 'warning') return '<span class="badge warn">ADVERTENCIA</span>';
    return '<span class="badge ok">INFO</span>';
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
    triggerDownload(blob, `reporte_validacion_dtd_v21_${dateStamp()}.json`);
  }

  function downloadXlsx(){
    if (!lastReport) return;
    const wb = XLSX.utils.book_new();
    const resumen = [['Indicador', 'Valor'], ...Object.entries(lastReport.summary)];
    const detalle = [['Archivo','AMIE','Estado','Errores','Advertencias','Resumen'], ...lastReport.fileRows.map(r => [r.fileName, r.amie, r.status, r.errors, r.warnings, r.summary])];
    const issues = [['Nivel','AMIE','Archivo','Hoja','Celda','Novedad'], ...lastReport.allIssues.map(i => [i.level, i.amie, i.fileName, i.sheet, i.cell, i.message])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), 'Resultado_Archivo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(issues), 'Novedades');
    XLSX.writeFile(wb, `reporte_validacion_dtd_v21_${dateStamp()}.xlsx`);
  }

  function downloadPdf(){
    if (!lastReport || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape' });
    const s = lastReport.summary;
    pdf.setFontSize(16);
    pdf.text('Resumen de revisión directa DTD', 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Matrices: ${s.matricesLoaded} | AMIE detectados: ${s.amiesDetected} | OK: ${s.ok} | Advertencia: ${s.warnings} | Error: ${s.errors}`, 14, 24);
    pdf.autoTable({
      startY: 32,
      head: [['Archivo','AMIE','Estado','Errores','Advertencias','Resumen']],
      body: lastReport.fileRows.map(r => [r.fileName, r.amie, r.status, r.errors, r.warnings, r.summary]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15,76,129] }
    });
    pdf.save(`resumen_validacion_dtd_v21_${dateStamp()}.pdf`);
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
