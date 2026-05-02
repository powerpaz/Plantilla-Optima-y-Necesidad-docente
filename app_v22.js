(function(){
  const BUILD = 'v22.1.0';
  const $ = id => document.getElementById(id);
  let lastReport = null;

  // ── NORMATIVA ──────────────────────────────────────────────────────────────
  // Art. 117 LOEI: jornada ordinaria semanal → 25 períodos pedagógicos máximo
  const MAX_HORAS_DOCENTE = 25;

  // Acuerdo 2022-00034-A: figuras con 13h en 1°/2° BT (no 10h estándar)
  const FIGURAS_REFORMADAS_RE = /electromec[aá]nica\s*automotriz|m[uú]sica/i;

  // FUNxIE: clasificación de función en la IE (Nómina)
  const FUNXIE_ES_DOCENTE    = /^docente$/i;
  const FUNXIE_ES_DIRECTIVO  = /^directivo|rector|vicerrector/i;
  const FUNXIE_CONOCIDOS     = /^(docente|directivo|rector|vicerrector|dta|personal\s*de\s*salud|udai|administrativo|inspector)$/i;

  // ── INIT ───────────────────────────────────────────────────────────────────
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
    if (typeof XLSX === 'undefined'){
      renderSummaryMessage('Error: la librería XLSX no se cargó. Verifica tu conexión a internet y recarga la página.', true);
      return;
    }
    try {
      renderSummaryMessage('Leyendo archivos y aplicando revisión normativa...');
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
    $('btnDownloadJson').disabled  = !enabled;
    $('btnDownloadPdf').disabled   = !enabled;
  }

  async function readWorkbook(file){
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type:'array', cellDates:false, cellFormula:true, cellNF:true });
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

  function normalize(v){ return (v == null ? '' : String(v)).trim(); }

  function normalizeSheetName(v){
    return normalize(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  function findSheetName(wb, wanted){
    const want = wanted.map(normalizeSheetName);
    for (const name of wb.SheetNames){
      if (want.includes(normalizeSheetName(name))) return name;
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

  function displayCell(cell){
    if (!cell) return '';
    if (cell.w != null && normalize(cell.w)) return cell.w;
    if (cell.v != null && normalize(String(cell.v))) return String(cell.v);
    return '';
  }

  function getCellDisplay(ws, address){
    const cell = ws?.[address];
    if (cell) return displayCell(cell);
    // merged cells: find anchor
    if (ws?.['!merges']){
      const target = XLSX.utils.decode_cell(address);
      for (const m of ws['!merges']){
        if (target.r >= m.s.r && target.r <= m.e.r && target.c >= m.s.c && target.c <= m.e.c){
          const anchor = XLSX.utils.encode_cell(m.s);
          if (ws[anchor]) return displayCell(ws[anchor]);
        }
      }
    }
    return '';
  }

  function toNumber(v){
    const txt = normalize(v).replace(/\./g,'').replace(',','.');
    const m = txt.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function firstAmieInText(text){
    const m = normalize(text).toUpperCase().match(/\b\d{2}[BHbh]\d{5}\b/);
    return m ? m[0] : '';
  }

  function issue(level, amie, fileName, sheet, cell, message){
    return { level, amie, fileName, sheet, cell, message };
  }

  function colLetter(n){
    let s = '';
    while (n > 0){ const m = (n-1)%26; s = String.fromCharCode(65+m)+s; n = Math.floor((n-1)/26); }
    return s;
  }

  function findColWithText(ws, row1indexed, searchText, fromC0, toC0){
    const kw = normalize(searchText).toLowerCase();
    for (let c = fromC0; c <= toC0; c++){
      const val = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:row1indexed-1, c}))).toLowerCase();
      if (val.includes(kw)) return c;
    }
    return -1;
  }

  // ── inspectMatrixWorkbook ──────────────────────────────────────────────────

  function inspectMatrixWorkbook(fileName, wb){
    const issues = [];

    const pasos  = getSheet(wb, ['PASOS']);
    const nomina = getSheet(wb, ['NOMINA','NÓMINA']);
    const parpo  = getSheet(wb, ['PAR_PO','PAR PO']);
    const distra = getSheet(wb, ['DIS_TRA','DIS TRA','DISTRA']);
    const plan   = getSheet(wb, ['PLANESTUDIO','PLAN ESTUDIO','PLAN_ESTUDIO']);
    const bt     = getSheet(wb, ['BT_','BT']);
    const ebja   = getSheet(wb, ['EBJA TEC','EBJA_TEC','EBJA']);

    const fileAmie   = firstAmieInText(fileName);
    const nominaAmie = nomina ? firstAmieInText(getCellDisplay(nomina.ws,'B5')) : '';
    const parpoAmie  = parpo  ? firstAmieInText(getCellDisplay(parpo.ws,'B3'))  : '';
    const amie = nominaAmie || parpoAmie || fileAmie;

    // Hojas obligatorias
    if (!pasos)  issues.push(issue('error',amie,fileName,'General','','Falta la hoja Pasos.'));
    if (!nomina) issues.push(issue('error',amie,fileName,'General','','Falta la hoja Nómina.'));
    if (!parpo)  issues.push(issue('error',amie,fileName,'General','','Falta la hoja Par_PO.'));
    if (!distra) issues.push(issue('error',amie,fileName,'General','','Falta la hoja DIS_TRA.'));
    if (!plan)   issues.push(issue('error',amie,fileName,'General','','Falta la hoja PlanEstudio.'));
    if (!bt)     issues.push(issue('warning',amie,fileName,'General','','No se encontró la hoja BT / BT_.'));
    if (!ebja)   issues.push(issue('warning',amie,fileName,'General','','No se encontró la hoja EBJA TEC.'));
    if (!amie)   issues.push(issue('error','',fileName,'General','','No fue posible identificar el AMIE.'));

    // Coherencia AMIE
    if (fileAmie && amie && fileAmie !== amie)
      issues.push(issue('warning',amie,fileName,'General','',
        `AMIE en nombre de archivo (${fileAmie}) difiere del AMIE leído (${amie}).`));
    if (nominaAmie && parpoAmie && nominaAmie !== parpoAmie)
      issues.push(issue('error',amie,fileName,'General','',
        `AMIE en Nómina!B5 (${nominaAmie}) ≠ Par_PO!B3 (${parpoAmie}). Verificar.`));

    // Validaciones de cada hoja
    if (pasos)  validatePasos(amie, fileName, pasos.ws, issues);
    if (nomina) validateNomina(amie, fileName, nomina.ws, issues);

    let parInfo = { paralelosActivos:0, reformedFigure:false, specialty:'', po:null, directivos:null };
    if (parpo) parInfo = validateParPO(amie, fileName, parpo.ws, issues);

    if (distra) validateDistra(amie, fileName, distra.ws, parInfo, issues);

    if (plan) validateGenericContent(amie, fileName, 'PlanEstudio', plan.ws, issues, ['A1','A2']);
    if (bt)   validateGenericContent(amie, fileName, bt.name, bt.ws, issues, ['A1']);
    if (ebja) validateGenericContent(amie, fileName, ebja.name, ebja.ws, issues, ['A2','B2']);

    // Leer NECESIDAD de Nómina E11/E12
    const necesidad = nomina ? readNecesidad(nomina.ws) : null;

    return { fileName, amie, fileAmie, nominaAmie, parpoAmie, issues,
             po: parInfo.po, directivos: parInfo.directivos, necesidad };
  }

  // ── validatePasos ──────────────────────────────────────────────────────────

  function validatePasos(amie, fileName, ws, issues){
    ['A1','A2','A7','B7','C7'].forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr)))
        issues.push(issue('error',amie,fileName,'Pasos',addr,'Celda obligatoria vacía en hoja Pasos.'));
    });
    let validSteps = 0;
    for (let r = 8; r <= 18; r++){
      const a = normalize(getCellDisplay(ws,`A${r}`));
      const b = normalize(getCellDisplay(ws,`B${r}`));
      const c = normalize(getCellDisplay(ws,`C${r}`));
      if (a||b||c) validSteps++;
      if ((a||b||c) && (!a||!b||!c))
        issues.push(issue('warning',amie,fileName,'Pasos',`A${r}:C${r}`,'Fila de instrucciones incompleta.'));
    }
    if (validSteps < 8)
      issues.push(issue('warning',amie,fileName,'Pasos','A8:C18','La tabla de pasos parece incompleta.'));
  }

  // ── validateNomina ─────────────────────────────────────────────────────────

  function validateNomina(amie, fileName, ws, issues){
    // Identificación
    if (!firstAmieInText(getCellDisplay(ws,'B5')))
      issues.push(issue('error',amie,fileName,'Nómina','B5','B5 no contiene un código AMIE válido.'));
    if (!normalize(getCellDisplay(ws,'B6')))
      issues.push(issue('error',amie,fileName,'Nómina','B6','Falta el nombre de la institución educativa.'));

    // Necesidad E11 / E12
    ['E11','E12'].forEach(addr => {
      const val = normalize(getCellDisplay(ws, addr));
      if (!val){ return; } // vacío = no hay fila
      const n = toNumber(val);
      if (isNaN(n)){
        issues.push(issue('warning',amie,fileName,'Nómina',addr,
          `${addr} = "${val}" no es numérico. Verificar fórmula NECESIDAD.`));
        return;
      }
      if (n > 0)
        issues.push(issue('info',amie,fileName,'Nómina',addr,
          `NECESIDAD: +${n.toFixed(2)} plaza(s) docente/directivo. La IE requiere más personal para cubrir su oferta (Art. 117 LOEI).`));
      else if (n < 0)
        issues.push(issue('info',amie,fileName,'Nómina',addr,
          `EXCESO: ${Math.abs(n).toFixed(2)} plaza(s) docente/directivo. La IE tiene más personal del normativo. Revisar reubicación.`));
    });

    // Detectar fila de encabezados: busca "FUNxIE"
    let headerRow = -1, funxieCol = -1, estaEnIeCol = -1;
    for (let r = 12; r <= 22 && headerRow < 0; r++){
      const c = findColWithText(ws, r, 'funxie', 0, 60);
      if (c >= 0){ headerRow = r; funxieCol = c; }
    }
    if (headerRow > 0){
      estaEnIeCol = findColWithText(ws, headerRow, 'esta en la ie', 0, 60);
    }

    const dataStart = headerRow > 0 ? headerRow + 1 : 17;
    let activeRows = 0, cntDocente = 0, cntDirectivo = 0, cntOtros = 0;

    for (let r = dataStart; r <= 450; r++){
      // Detectar fila activa por columnas clave
      const cols = ['B','C','D','E','G','H'];
      const rowVals = cols.map(c => normalize(getCellDisplay(ws,`${c}${r}`)));
      const active = rowVals.some(Boolean);
      if (!active){
        let nextFilled = false;
        for (let x = r+1; x <= Math.min(r+3,450); x++){
          if (cols.some(c => normalize(getCellDisplay(ws,`${c}${x}`)))){ nextFilled=true; break; }
        }
        if (!nextFilled) break;
        continue;
      }
      activeRows++;

      // Datos obligatorios básicos
      cols.forEach(c => {
        if (!normalize(getCellDisplay(ws,`${c}${r}`)))
          issues.push(issue('error',amie,fileName,'Nómina',`${c}${r}`,
            `Dato obligatorio vacío en la tabla de personal.`));
      });

      // FUNxIE
      if (funxieCol >= 0){
        const addr = XLSX.utils.encode_cell({r:r-1, c:funxieCol});
        const fv = normalize(getCellDisplay(ws, addr));
        if (!fv){
          issues.push(issue('error',amie,fileName,'Nómina',`${colLetter(funxieCol+1)}${r}`,
            `FUNxIE vacío. Declarar la función en la IE: Docente, Directivo, DTA, Personal de salud, Administrativo.`));
        } else if (FUNXIE_ES_DOCENTE.test(fv)){
          cntDocente++;
        } else if (FUNXIE_ES_DIRECTIVO.test(fv)){
          cntDirectivo++;
        } else if (!FUNXIE_CONOCIDOS.test(fv)){
          cntOtros++;
          issues.push(issue('warning',amie,fileName,'Nómina',`${colLetter(funxieCol+1)}${r}`,
            `FUNxIE = "${fv}" no es un valor reconocido. Valores válidos: Docente, Directivo, DTA, Personal de salud, Administrativo.`));
        } else {
          cntOtros++;
        }
      }

      // Esta en la IE
      if (estaEnIeCol >= 0){
        const addr = XLSX.utils.encode_cell({r:r-1, c:estaEnIeCol});
        const ev = normalize(getCellDisplay(ws, addr)).toLowerCase();
        if (!ev)
          issues.push(issue('warning',amie,fileName,'Nómina',`${colLetter(estaEnIeCol+1)}${r}`,
            `"Esta en la IE" vacío. Seleccionar Si o No.`));
        else if (ev !== 'si' && ev !== 'sí' && ev !== 'no')
          issues.push(issue('warning',amie,fileName,'Nómina',`${colLetter(estaEnIeCol+1)}${r}`,
            `"Esta en la IE" = "${ev}". Valor esperado: Si / No.`));
      }
    }

    if (!activeRows)
      issues.push(issue('warning',amie,fileName,'Nómina',`B${dataStart}`,
        'No se detectaron filas activas de personal en la Nómina.'));
    else
      issues.push(issue('info',amie,fileName,'Nómina','',
        `Personal en Nómina: ${cntDocente} Docente(s), ${cntDirectivo} Directivo(s), ${cntOtros} otro(s). ` +
        `Solo los Docentes cuentan en el cálculo de Plantilla Óptima (Art. 117 LOEI).`));
  }

  // ── readNecesidad (sin emitir issues, solo retorna el valor) ────────────────

  function readNecesidad(ws){
    const v11 = toNumber(getCellDisplay(ws,'E11'));
    const v12 = toNumber(getCellDisplay(ws,'E12'));
    if (!isNaN(v11)) return v11;
    if (!isNaN(v12)) return v12;
    return null;
  }

  // ── validateParPO ──────────────────────────────────────────────────────────

  function validateParPO(amie, fileName, ws, issues){
    // Bloque de identificación institucional (auto-completado por XLOOKUP desde GIEE)
    const requiredTop = ['B3','D3','F3','B4','D4','F4','B5','D5','F5','B6','D6','F6','B7','D7'];
    requiredTop.forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr)))
        issues.push(issue('error',amie,fileName,'Par_PO',addr,
          'Dato obligatorio vacío en bloque de identificación institucional.'));
    });

    // Parámetros del plan de estudios (carga horaria declarada)
    ['D9','F9','B10','D10'].forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr)))
        issues.push(issue('warning',amie,fileName,'Par_PO',addr,
          'Celda de plan de estudios / carga horaria sin contenido.'));
    });

    // Plantilla Óptima calculada (E19 = Σ horas_plan/25 por paralelo)
    const poRaw = normalize(getCellDisplay(ws,'E19'));
    const poVal = toNumber(poRaw);
    const po    = isNaN(poVal) ? null : poVal;

    // Directivos calculados (E18)
    const dirRaw = normalize(getCellDisplay(ws,'E18'));
    const dirVal = toNumber(dirRaw);
    const directivos = isNaN(dirVal) ? null : dirVal;

    if (po !== null)
      issues.push(issue('info',amie,fileName,'Par_PO','E19',
        `Plantilla Óptima calculada: ${po.toFixed(4)} plazas docentes. ` +
        `Fórmula: Σ(horas_plan_por_paralelo / 25). Art. 117 LOEI.`));
    else
      issues.push(issue('warning',amie,fileName,'Par_PO','E19',
        'No se pudo leer la Plantilla Óptima (E19). Verificar que la fórmula esté correcta.'));

    if (directivos !== null && directivos > 0)
      issues.push(issue('info',amie,fileName,'Par_PO','E18',
        `Directivos calculados: ${directivos}. (Rector / Vicerrector, no cuentan en PO docente).`));

    // Buscar fila de encabezados de la tabla PARALELO
    let headerRow = 22;
    for (let r = 18; r <= 32; r++){
      const a = normalize(getCellDisplay(ws,`A${r}`)).toLowerCase();
      if (a.includes('grado') || a.includes('nivel') || a.includes('curso')){ headerRow = r; break; }
    }

    const espCol  = findColWithText(ws, headerRow, 'especialidad', 0, 10);
    const estCol  = findColWithText(ws, headerRow, 'estudiante', 0, 20);
    const jorCol  = findColWithText(ws, headerRow, 'jornada', 0, 20);

    let paralelosActivos = 0, reformedFigure = false;
    const specialtiesFound = new Set();

    for (let r = headerRow + 1; r <= 600; r++){
      const grado = normalize(getCellDisplay(ws,`A${r}`));
      if (!grado){
        let next = false;
        for (let x = r+1; x <= Math.min(r+3,600); x++){
          if (normalize(getCellDisplay(ws,`A${x}`))){ next=true; break; }
        }
        if (!next) break;
        continue;
      }
      paralelosActivos++;

      const esBT = /bach|b\.t\.|btp\b/i.test(grado);

      // Especialidad BT
      if (esBT && espCol >= 0){
        const esp = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1, c:espCol})));
        if (!esp){
          issues.push(issue('error',amie,fileName,'Par_PO',`${colLetter(espCol+1)}${r}`,
            `Fila BT "${grado}": especialidad vacía. Completar según catálogo Acuerdo 2021-00057-A.`));
        } else {
          specialtiesFound.add(esp);
          if (FIGURAS_REFORMADAS_RE.test(esp)){
            reformedFigure = true;
            issues.push(issue('info',amie,fileName,'Par_PO',`${colLetter(espCol+1)}${r}`,
              `Figura reformada: "${esp}". Por Acuerdo 2022-00034-A (vigente desde 2022-2023): ` +
              `1° y 2° BT = 13 h/semana (no 10h). Verificar horas en DIS_TRA.`));
          }
        }
      }

      // Estudiantes
      if (estCol >= 0){
        const estAddr = XLSX.utils.encode_cell({r:r-1, c:estCol});
        const est = toNumber(getCellDisplay(ws, estAddr));
        if (!isNaN(est)){
          if (est <= 0)
            issues.push(issue('error',amie,fileName,'Par_PO',`${colLetter(estCol+1)}${r}`,
              `Paralelo "${grado}": número de estudiantes = ${est}. Debe ser mayor a 0.`));
          else if (est < 3)
            issues.push(issue('warning',amie,fileName,'Par_PO',`${colLetter(estCol+1)}${r}`,
              `Paralelo "${grado}": ${est} estudiante(s). Verificar si cumple mínimo PCEI.`));
        }
      }
    }

    if (!paralelosActivos)
      issues.push(issue('warning',amie,fileName,'Par_PO',`A${headerRow+1}`,
        'No se detectaron filas activas de paralelos en la tabla PARALELO.'));
    else
      issues.push(issue('info',amie,fileName,'Par_PO','',
        `Paralelos detectados: ${paralelosActivos}.` +
        (specialtiesFound.size ? ` Figuras BT: ${Array.from(specialtiesFound).join(', ')}.` : '')));

    return { paralelosActivos, reformedFigure,
             specialty: Array.from(specialtiesFound).join(' | '),
             headerRow, po, directivos };
  }

  // ── validateDistra ─────────────────────────────────────────────────────────

  function validateDistra(amie, fileName, ws, parInfo, issues){
    // Encabezado
    if (!normalize(getCellDisplay(ws,'A1')))
      issues.push(issue('warning',amie,fileName,'DIS_TRA','A1','Encabezado vacío en DIS_TRA.'));

    // Detectar columnas de paralelos desde col K (index 10) buscando contenido en filas 6-9
    let structureCols = 0, firstDataC = -1;
    for (let c = 10; c <= 250; c++){
      const hasContent = [5,6,7,8].some(r =>
        normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r,c}))));
      if (hasContent){ if (firstDataC < 0) firstDataC = c; structureCols++; }
      else if (structureCols > 0) break;
    }

    if (!structureCols){
      issues.push(issue('warning',amie,fileName,'DIS_TRA','K6:...',
        'No se detectó estructura de distribución horaria a partir de la columna K. ' +
        'Verificar que DIS_TRA esté completa.'));
    }

    // Tronco común BT = 0 (fila 6, 0-indexed row 5)
    // Por Acuerdo 2021-00057-A el tronco común es independiente de la figura técnica
    if (firstDataC >= 0){
      for (let c = firstDataC; c < firstDataC + structureCols; c++){
        const addr = XLSX.utils.encode_cell({r:5, c});
        const val  = toNumber(getCellDisplay(ws, addr));
        if (!isNaN(val) && val !== 0)
          issues.push(issue('error',amie,fileName,'DIS_TRA', addr,
            `Tronco común = ${val} en columna ${colLetter(c+1)}. ` +
            `Debe ser 0 para BT/PCEI (Acuerdo 2021-00057-A).`));
      }
    }

    // Cruce paralelos Par_PO ↔ DIS_TRA
    if (parInfo.paralelosActivos > 0 && structureCols > 0 && structureCols !== parInfo.paralelosActivos)
      issues.push(issue('warning',amie,fileName,'DIS_TRA','K6:...',
        `Columnas de distribución en DIS_TRA (${structureCols}) ≠ paralelos en Par_PO (${parInfo.paralelosActivos}). ` +
        `Verificar coherencia de la distribución.`));

    // ── Validación de carga horaria por docente ──
    // Columna B (index 1) = Nombres desde XLOOKUP(NOMINA) o XLOOKUP(NESC)
    // Columna I (index 8) = Tot_General = SUM(J:CC) — total de horas del docente
    // Solo se valida cuando columna I tiene un valor > 0 (fila de resumen de docente)

    let teachersWithLoad = 0, maxHours = 0, overloadCount = 0;

    for (let r0 = 9; r0 <= 500; r0++){
      // Nombre en col B
      const nameVal = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r0, c:1})));
      if (!nameVal) continue;
      if (/^(total|promedio|subtotal|suma|prome)$/i.test(nameVal)) continue;

      // Total en col I (Tot_General)
      const totI = toNumber(getCellDisplay(ws, XLSX.utils.encode_cell({r:r0, c:8})));
      if (isNaN(totI) || totI <= 0) continue;

      // Esta es una fila de resumen de docente
      teachersWithLoad++;
      if (totI > maxHours) maxHours = totI;

      if (totI > MAX_HORAS_DOCENTE){
        overloadCount++;
        issues.push(issue('error',amie,fileName,'DIS_TRA',`B${r0+1}`,
          `"${nameVal}": ${totI} períodos/semana — excede el límite de ${MAX_HORAS_DOCENTE}. ` +
          `Art. 117 LOEI: "25 períodos pedagógicos semanales de clase" es el máximo.`));
      }
    }

    // Fallback si col I no dio resultados: sumar columnas de paralelos
    if (teachersWithLoad === 0 && firstDataC >= 0){
      for (let r0 = 9; r0 <= 500; r0++){
        const nameVal = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r0, c:1})));
        if (!nameVal || /^(total|promedio)$/i.test(nameVal)) continue;

        let sumHours = 0;
        for (let c = firstDataC; c < firstDataC + structureCols; c++){
          const v = toNumber(getCellDisplay(ws, XLSX.utils.encode_cell({r:r0, c})));
          if (!isNaN(v) && v > 0) sumHours += v;
        }
        if (sumHours <= 0) continue;
        teachersWithLoad++;
        if (sumHours > maxHours) maxHours = sumHours;
        if (sumHours > MAX_HORAS_DOCENTE){
          overloadCount++;
          issues.push(issue('error',amie,fileName,'DIS_TRA',`B${r0+1}`,
            `"${nameVal}": ${sumHours} períodos/semana — excede el límite de ${MAX_HORAS_DOCENTE}. ` +
            `Art. 117 LOEI.`));
        }
      }
    }

    if (teachersWithLoad === 0)
      issues.push(issue('warning',amie,fileName,'DIS_TRA','B10:...',
        'No se detectaron docentes con carga horaria registrada en DIS_TRA.'));
    else {
      issues.push(issue('info',amie,fileName,'DIS_TRA','',
        `${teachersWithLoad} docente(s) con horas asignadas. Carga máxima detectada: ${maxHours} h/semana.` +
        (overloadCount === 0 ? ' Todos dentro del límite Art. 117 LOEI.' : '')));

      if (parInfo.reformedFigure)
        issues.push(issue('info',amie,fileName,'DIS_TRA','—',
          `Figura reformada activa: "${parInfo.specialty}". ` +
          `Verificar que en 1° y 2° BT las horas técnicas sean 13 h/semana (Acuerdo 2022-00034-A), no 10 h.`));
    }
  }

  // ── validateGenericContent ─────────────────────────────────────────────────

  function validateGenericContent(amie, fileName, sheetName, ws, issues, keyCells){
    keyCells.forEach(addr => {
      if (!normalize(getCellDisplay(ws, addr)))
        issues.push(issue('warning',amie,fileName,sheetName,addr,`Celda clave vacía en la hoja ${sheetName}.`));
    });
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (!range){ issues.push(issue('warning',amie,fileName,sheetName,'','Hoja sin contenido detectable.')); return; }
    let usedRows = 0;
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r+40); r++){
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c+10); c++){
        if (normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r,c})))){ usedRows++; break; }
      }
    }
    if (usedRows < 3)
      issues.push(issue('warning',amie,fileName,sheetName,'','La hoja tiene muy poco contenido visible.'));
  }

  // ── buildReport ────────────────────────────────────────────────────────────

  function buildReport(entries){
    const allIssues = [];
    const byAmie   = new Map();

    const fileRows = entries.map(entry => {
      entry.issues.forEach(i => allIssues.push(i));
      if (entry.amie) byAmie.set(entry.amie, (byAmie.get(entry.amie)||0)+1);

      const errors   = entry.issues.filter(i => i.level==='error').length;
      const warnings = entry.issues.filter(i => i.level==='warning').length;
      const info     = entry.issues.filter(i => i.level==='info').length;
      const status   = errors ? 'ERROR' : (warnings ? 'ADVERTENCIA' : 'OK');

      // Formatear necesidad
      let necesidadTxt = '-';
      if (entry.necesidad !== null && entry.necesidad !== undefined){
        if (entry.necesidad > 0) necesidadTxt = `+${entry.necesidad.toFixed(2)} (necesidad)`;
        else if (entry.necesidad < 0) necesidadTxt = `${entry.necesidad.toFixed(2)} (exceso)`;
        else necesidadTxt = '0 (en equilibrio)';
      }

      return {
        fileName: entry.fileName,
        amie: entry.amie || '-',
        status, errors, warnings, info,
        po: entry.po !== null && entry.po !== undefined ? entry.po.toFixed(4) : '-',
        directivos: entry.directivos !== null && entry.directivos !== undefined ? String(entry.directivos) : '-',
        necesidad: necesidadTxt,
        summary: errors ? 'Tiene errores normativos.' : (warnings ? 'Tiene observaciones.' : 'Sin novedades.')
      };
    });

    for (const [amie, count] of byAmie.entries())
      if (count > 1)
        allIssues.push(issue('warning',amie,'','Cruce','',`Se cargaron ${count} archivos para el mismo AMIE.`));

    const summary = {
      build: BUILD,
      matricesLoaded: entries.length,
      amiesDetected: Array.from(new Set(entries.map(e=>e.amie).filter(Boolean))).length,
      ok:       fileRows.filter(r=>r.status==='OK').length,
      warnings: fileRows.filter(r=>r.status==='ADVERTENCIA').length,
      errors:   fileRows.filter(r=>r.status==='ERROR').length,
      totalIssues: allIssues.length
    };
    return { summary, fileRows, allIssues };
  }

  // ── render ─────────────────────────────────────────────────────────────────

  function renderSummaryMessage(msg, isError=false){
    $('summaryCards').innerHTML =
      `<h2>2. Resumen</h2><div class="badge ${isError?'err':'warn'}">${escapeHtml(msg)}</div>`;
  }

  function renderReport(report){
    const s = report.summary;
    $('summaryCards').innerHTML = `
      <h2>2. Resumen</h2>
      <div class="kpis">
        <div class="kpi"><div class="muted">Matrices cargadas</div><div class="num">${s.matricesLoaded}</div></div>
        <div class="kpi"><div class="muted">AMIE detectados</div><div class="num">${s.amiesDetected}</div></div>
        <div class="kpi"><div class="muted">Con error normativo</div>
          <div class="num" style="color:${s.errors?'var(--err)':'var(--ok)'}">${s.errors}</div></div>
        <div class="kpi"><div class="muted">Con advertencia</div>
          <div class="num" style="color:${s.warnings?'var(--warn)':'var(--ink)'}">${s.warnings}</div></div>
        <div class="kpi"><div class="muted">Sin novedades</div>
          <div class="num" style="color:var(--ok)">${s.ok}</div></div>
      </div>
      <p class="small muted mt16">Versión: <span class="code">${escapeHtml(s.build)}</span>
        · LOEI Art.117 · Acuerdo 2021-00057-A · Acuerdo 2022-00034-A
        · Novedades: ${s.totalIssues}</p>
    `;
    $('resultsTableWrap').innerHTML  = buildResultsTable(report.fileRows);
    $('issuesTableWrap').innerHTML   = buildIssuesTable(report.allIssues);
  }

  function buildResultsTable(rows){
    if (!rows.length) return '<div class="muted">No hay resultados.</div>';
    return `<table>
      <thead><tr>
        <th>Archivo</th><th>AMIE</th><th>Estado</th>
        <th>PO calculada</th><th>Directivos</th><th>Necesidad</th>
        <th>Errores</th><th>Advert.</th><th>Info</th><th>Resumen</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${escapeHtml(r.fileName)}</td>
        <td><strong>${escapeHtml(r.amie)}</strong></td>
        <td>${statusBadge(r.status)}</td>
        <td>${escapeHtml(r.po)}</td>
        <td>${escapeHtml(r.directivos)}</td>
        <td>${necesidadBadge(r.necesidad)}</td>
        <td>${r.errors}</td><td>${r.warnings}</td><td>${r.info}</td>
        <td>${escapeHtml(r.summary)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function buildIssuesTable(rows){
    if (!rows.length) return '<div class="muted">Sin novedades.</div>';
    return `<table>
      <thead><tr><th>Nivel</th><th>AMIE</th><th>Archivo</th><th>Hoja</th><th>Celda</th><th>Novedad</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${levelBadge(r.level)}</td>
        <td>${escapeHtml(r.amie||'-')}</td>
        <td>${escapeHtml(r.fileName||'-')}</td>
        <td>${escapeHtml(r.sheet||'-')}</td>
        <td><span class="code">${escapeHtml(r.cell||'-')}</span></td>
        <td>${escapeHtml(r.message)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function levelBadge(level){
    if (level==='error')   return '<span class="badge err">ERROR</span>';
    if (level==='warning') return '<span class="badge warn">ADVERTENCIA</span>';
    return '<span class="badge ok">INFO</span>';
  }

  function statusBadge(status){
    if (status==='OK')          return '<span class="badge ok">OK</span>';
    if (status==='ADVERTENCIA') return '<span class="badge warn">ADVERTENCIA</span>';
    return '<span class="badge err">ERROR</span>';
  }

  function necesidadBadge(txt){
    if (!txt || txt === '-') return '-';
    if (txt.includes('necesidad')) return `<span class="badge warn">${escapeHtml(txt)}</span>`;
    if (txt.includes('exceso'))    return `<span class="badge err">${escapeHtml(txt)}</span>`;
    return `<span class="badge ok">${escapeHtml(txt)}</span>`;
  }

  function escapeHtml(text){
    return String(text??'').replace(/[&<>"']/g, s =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  // ── descargas ──────────────────────────────────────────────────────────────

  function downloadJson(){
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'});
    triggerDownload(blob, `reporte_dtd_${dateStamp()}.json`);
  }

  function downloadXlsx(){
    if (!lastReport) return;
    const wb = XLSX.utils.book_new();
    const resumen  = [['Indicador','Valor'],...Object.entries(lastReport.summary)];
    const detalle  = [
      ['Archivo','AMIE','Estado','PO calculada','Directivos','Necesidad','Errores','Advertencias','Info','Resumen'],
      ...lastReport.fileRows.map(r =>
        [r.fileName,r.amie,r.status,r.po,r.directivos,r.necesidad,r.errors,r.warnings,r.info,r.summary])
    ];
    const issues = [
      ['Nivel','AMIE','Archivo','Hoja','Celda','Novedad'],
      ...lastReport.allIssues.map(i => [i.level,i.amie,i.fileName,i.sheet,i.cell,i.message])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen),  'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle),  'Resultado_Archivo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(issues),   'Novedades');
    XLSX.writeFile(wb, `reporte_dtd_${dateStamp()}.xlsx`);
  }

  function downloadPdf(){
    if (!lastReport || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'landscape' });
    const s = lastReport.summary;
    pdf.setFontSize(14);
    pdf.text('Revisión normativa de matrices DTD - PCEI', 14, 14);
    pdf.setFontSize(9);
    pdf.text(`Matrices: ${s.matricesLoaded} | AMIE: ${s.amiesDetected} | OK: ${s.ok} | Adv.: ${s.warnings} | Error: ${s.errors} | Versión: ${s.build}`, 14, 21);
    pdf.autoTable({
      startY: 26,
      head:[['Archivo','AMIE','Estado','PO','Directivos','Necesidad','Errores','Advert.','Resumen']],
      body: lastReport.fileRows.map(r =>
        [r.fileName,r.amie,r.status,r.po,r.directivos,r.necesidad,r.errors,r.warnings,r.summary]),
      styles:{ fontSize:7 },
      headStyles:{ fillColor:[13,40,64] }
    });
    const finalY = pdf.lastAutoTable.finalY + 6;
    pdf.autoTable({
      startY: finalY,
      head:[['Nivel','AMIE','Hoja','Celda','Novedad']],
      body: lastReport.allIssues.map(i => [i.level,i.amie,i.sheet,i.cell,i.message]),
      styles:{ fontSize:6.5 },
      headStyles:{ fillColor:[13,40,64] }
    });
    pdf.save(`resumen_dtd_${dateStamp()}.pdf`);
  }

  function triggerDownload(blob, filename){
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dateStamp(){
    const d = new Date(), pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

})();
