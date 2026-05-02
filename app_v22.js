(function(){
  const BUILD = 'v22.0.0';
  const $ = id => document.getElementById(id);
  let lastReport = null;

  // === NORMATIVA ===
  // Art. 117 LOEI: carga horaria docente máxima
  const MAX_HORAS_DOCENTE = 25;
  // Acuerdo 2022-00034-A: figuras reformadas (10→13h en 1°/2° BT)
  const FIGURAS_REFORMADAS_RE = /electromec[aá]nica\s*automotriz|m[uú]sica/i;

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
    $('btnDownloadJson').disabled = !enabled;
    $('btnDownloadPdf').disabled = !enabled;
  }

  async function readWorkbook(file){
    const buffer = await file.arrayBuffer();
    return XLSX.read(buffer, { type:'array', cellDates:false, cellFormula:true, cellNF:true, cellStyles:true });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  function normalize(v){ return (v == null ? '' : String(v)).trim(); }

  function normalizeSheetName(v){
    return normalize(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
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

  function findMergeAnchor(ws, address){
    if (!ws || !ws['!merges']) return null;
    const target = XLSX.utils.decode_cell(address);
    for (const m of ws['!merges']){
      if (target.r >= m.s.r && target.r <= m.e.r && target.c >= m.s.c && target.c <= m.e.c)
        return XLSX.utils.encode_cell(m.s);
    }
    return null;
  }

  function displayCell(cell){
    if (!cell) return '';
    if (cell.w != null && String(cell.w).trim() !== '') return cell.w;
    if (cell.v != null && String(cell.v).trim() !== '') return cell.v;
    if (cell.f != null) return '=' + cell.f;
    return '';
  }

  function getCellDisplay(ws, address){
    const direct = ws?.[address];
    if (direct) return displayCell(direct);
    const anchor = findMergeAnchor(ws, address);
    if (anchor && ws[anchor]) return displayCell(ws[anchor]);
    return '';
  }

  function toNumber(v){
    if (typeof v === 'number') return v;
    const txt = normalize(v).replace(/\./g,'').replace(',','.');
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

  function colLetter(n){
    let s = '';
    while (n > 0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
    return s;
  }

  // celda con valor numérico usando encode_cell (0-indexed r,c)
  function numCell(ws, r0, c0){
    const addr = XLSX.utils.encode_cell({r:r0, c:c0});
    return toNumber(getCellDisplay(ws, addr));
  }

  // busca texto en una fila (1-indexed row), devuelve col 0-indexed o -1
  function findColWithText(ws, row1, searchText, fromC0, toC0){
    const kw = normalize(searchText).toLowerCase();
    for (let c = fromC0; c <= toC0; c++){
      const val = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:row1-1, c}))).toLowerCase();
      if (val.includes(kw)) return c;
    }
    return -1;
  }

  // ── inspectMatrixWorkbook ─────────────────────────────────────────────────

  function inspectMatrixWorkbook(fileName, wb){
    const issues = [];
    const pasos  = getSheet(wb, ['PASOS']);
    const nomina = getSheet(wb, ['NOMINA','NÓMINA']);
    const parpo  = getSheet(wb, ['PAR_PO','PAR PO']);
    const distra = getSheet(wb, ['DIS_TRA','DIS TRA']);
    const plan   = getSheet(wb, ['PLANESTUDIO','PLAN ESTUDIO']);
    const bt     = getSheet(wb, ['BT_','BT']);
    const ebja   = getSheet(wb, ['EBJA TEC','EBJA_TEC','EBJA']);

    const fileAmie  = firstAmieInText(fileName);
    const nominaAmie= nomina ? firstAmieInText(getCellDisplay(nomina.ws,'B5')) : '';
    const parpoAmie = parpo  ? firstAmieInText(getCellDisplay(parpo.ws,'B3'))  : '';
    const amie = nominaAmie || parpoAmie || fileAmie;

    if (!pasos)  issues.push(issue('error',amie,fileName,'General','','Falta la hoja Pasos.'));
    if (!nomina) issues.push(issue('error',amie,fileName,'General','','Falta la hoja Nómina.'));
    if (!parpo)  issues.push(issue('error',amie,fileName,'General','','Falta la hoja Par_PO.'));
    if (!distra) issues.push(issue('error',amie,fileName,'General','','Falta la hoja DIS_TRA.'));
    if (!plan)   issues.push(issue('error',amie,fileName,'General','','Falta la hoja PlanEstudio.'));
    if (!bt)     issues.push(issue('warning',amie,fileName,'General','','No se encontró la hoja BT/BT_.'));
    if (!ebja)   issues.push(issue('warning',amie,fileName,'General','','No se encontró la hoja EBJA TEC.'));
    if (!amie)   issues.push(issue('error','',fileName,'General','','No fue posible identificar el AMIE.'));

    if (fileAmie && amie && fileAmie !== amie)
      issues.push(issue('warning',amie,fileName,'General','',`AMIE en nombre de archivo (${fileAmie}) ≠ AMIE leído (${amie}).`));
    if (nominaAmie && parpoAmie && nominaAmie !== parpoAmie)
      issues.push(issue('error',amie,fileName,'General','',`AMIE en Nómina (${nominaAmie}) ≠ Par_PO (${parpoAmie}).`));

    if (pasos)  validatePasos(amie,fileName,pasos.ws,issues);
    if (nomina) validateNomina(amie,fileName,nomina.ws,issues);

    let parInfo = { paralelosActivos:0, reformedFigure:false, specialty:'' };
    if (parpo) parInfo = validateParPO(amie,fileName,parpo.ws,issues);
    if (distra) validateDistra(amie,fileName,distra.ws,parInfo,issues);

    if (plan)  validateGenericContent(amie,fileName,'PlanEstudio',plan.ws,issues,['A1','A2']);
    if (bt)    validateGenericContent(amie,fileName,bt.name,bt.ws,issues,['A1']);
    if (ebja)  validateGenericContent(amie,fileName,ebja.name,ebja.ws,issues,['A2','B2']);

    return { fileName, amie, fileAmie, nominaAmie, parpoAmie, issues };
  }

  // ── validatePasos ────────────────────────────────────────────────────────

  function validatePasos(amie,fileName,ws,issues){
    ['A1','A2','A7','B7','C7'].forEach(addr => {
      if (!normalize(getCellDisplay(ws,addr)))
        issues.push(issue('error',amie,fileName,'Pasos',addr,'Celda obligatoria vacía en la hoja Pasos.'));
    });
    let validSteps=0;
    for (let r=8;r<=18;r++){
      const a=normalize(getCellDisplay(ws,`A${r}`));
      const b=normalize(getCellDisplay(ws,`B${r}`));
      const c=normalize(getCellDisplay(ws,`C${r}`));
      if (a||b||c) validSteps++;
      if ((a||b||c)&&(!a||!b||!c))
        issues.push(issue('warning',amie,fileName,'Pasos',`A${r}:C${r}`,'Fila de instrucciones incompleta.'));
    }
    if (validSteps<8)
      issues.push(issue('warning',amie,fileName,'Pasos','A8:C18','La tabla de pasos parece incompleta o recortada.'));
  }

  // ── validateNomina (MEJORADO) ─────────────────────────────────────────────

  function validateNomina(amie,fileName,ws,issues){
    // AMIE e institución
    if (!firstAmieInText(getCellDisplay(ws,'B5')))
      issues.push(issue('error',amie,fileName,'Nómina','B5','B5 no contiene un código AMIE válido.'));
    if (!normalize(getCellDisplay(ws,'B6')))
      issues.push(issue('error',amie,fileName,'Nómina','B6','Falta el nombre de la institución educativa.'));

    // Necesidad / exceso docente
    const needCheck = (addr) => {
      const val = getCellDisplay(ws, addr);
      if (!normalize(val)){
        issues.push(issue('warning',amie,fileName,'Nómina',addr,`Celda ${addr} vacía (fórmula sin resultado o archivo incompleto).`));
        return;
      }
      const n = toNumber(val);
      if (isNaN(n)){
        issues.push(issue('warning',amie,fileName,'Nómina',addr,`${addr} = "${val}" no es numérico.`));
        return;
      }
      if (n > 0)
        issues.push(issue('info',amie,fileName,'Nómina',addr,`NECESIDAD: ${n} docente(s)/directivo(s). Verificar cobertura.`));
      else if (n < 0)
        issues.push(issue('info',amie,fileName,'Nómina',addr,`EXCESO: ${Math.abs(n)} docente(s)/directivo(s). Posible redistribución.`));
    };
    needCheck('E11'); needCheck('E12');

    // Detectar fila de encabezados de la tabla de personal (busca FUNxIE)
    let headerRow = -1, funxieCol = -1, estaEnIeCol = -1;
    for (let r=12; r<=20 && headerRow<0; r++){
      const c = findColWithText(ws, r, 'funxie', 0, 60);
      if (c >= 0){ headerRow=r; funxieCol=c; }
    }
    if (headerRow > 0){
      estaEnIeCol = findColWithText(ws, headerRow, 'esta en la ie', 0, 60);
    }

    // Filas activas de personal (a partir de fila 17 o headerRow+1)
    const dataStart = headerRow > 0 ? headerRow+1 : 17;
    let activeRows = 0;
    for (let r=dataStart; r<=400; r++){
      const rowVals = ['B','C','D','E','G','H'].map(c=>normalize(getCellDisplay(ws,`${c}${r}`)));
      const active = rowVals.some(Boolean);
      if (!active){
        let nextFilled=false;
        for (let x=r+1;x<=Math.min(r+3,400);x++){
          if (['B','C','D','E','G','H'].some(c=>normalize(getCellDisplay(ws,`${c}${x}`)))) { nextFilled=true; break; }
        }
        if (!nextFilled) break;
        continue;
      }
      activeRows++;

      // Campos obligatorios básicos
      ['B','C','D','E','G','H'].forEach(c=>{
        if (!normalize(getCellDisplay(ws,`${c}${r}`)))
          issues.push(issue('error',amie,fileName,'Nómina',`${c}${r}`,'Dato obligatorio vacío en la tabla de personal.'));
      });

      // FUNxIE
      if (funxieCol >= 0){
        const fv = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1,c:funxieCol})));
        if (!fv)
          issues.push(issue('error',amie,fileName,'Nómina',`${colLetter(funxieCol+1)}${r}`,
            `FUNxIE vacío. Indicar función del docente en la Institución Educativa (paso 1 de la plantilla).`));
      }

      // Esta en la IE
      if (estaEnIeCol >= 0){
        const ev = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1,c:estaEnIeCol}))).toLowerCase();
        if (!ev)
          issues.push(issue('warning',amie,fileName,'Nómina',`${colLetter(estaEnIeCol+1)}${r}`,
            `"Esta en la IE" vacío. Seleccionar Si o No.`));
        else if (ev!=='si' && ev!=='sí' && ev!=='no')
          issues.push(issue('warning',amie,fileName,'Nómina',`${colLetter(estaEnIeCol+1)}${r}`,
            `"Esta en la IE" = "${ev}". Valor esperado: Si / No.`));
      }
    }
    if (!activeRows)
      issues.push(issue('warning',amie,fileName,'Nómina',`B${dataStart}:H`,'No se detectaron filas activas de personal.'));
  }

  // ── validateParPO (MEJORADO) ──────────────────────────────────────────────

  function validateParPO(amie,fileName,ws,issues){
    // Bloque superior de identificación
    const requiredTop=['B3','D3','F3','B4','D4','F4','B5','D5','F5','B6','D6','F6','B7','D7'];
    requiredTop.forEach(addr=>{
      if (!normalize(getCellDisplay(ws,addr)))
        issues.push(issue('error',amie,fileName,'Par_PO',addr,'Dato obligatorio vacío en el bloque de identificación.'));
    });

    // Celdas de plan de estudio / carga horaria
    ['D9','F9','H9','D10','F10'].forEach(addr=>{
      if (!normalize(getCellDisplay(ws,addr)))
        issues.push(issue('warning',amie,fileName,'Par_PO',addr,'Celda de plan de estudio / carga horaria sin contenido.'));
    });

    // Encontrar fila de encabezados (busca "Grado / Curso" en col A desde fila 18)
    let headerRow = 22; // valor por defecto basado en datos reales
    for (let r=18; r<=30; r++){
      const a = normalize(getCellDisplay(ws,`A${r}`)).toLowerCase();
      if (a.includes('grado') || (a.includes('nivel') && a.includes('curso'))){ headerRow=r; break; }
    }

    // Columna de especialidad BT (col B en datos reales = col index 1)
    const especialidadCol = findColWithText(ws, headerRow, 'especialidad', 0, 10);
    // Columna de estudiantes (col E en datos reales = col index 4)
    const estudiantesCol  = findColWithText(ws, headerRow, 'estudiante', 0, 15);

    let paralelosActivos = 0;
    let reformedFigure = false;
    const specialtiesFound = new Set();

    for (let r=headerRow+1; r<=500; r++){
      const grado = normalize(getCellDisplay(ws,`A${r}`));
      if (!grado){
        let next=false;
        for (let x=r+1;x<=Math.min(r+3,500);x++){
          if (normalize(getCellDisplay(ws,`A${x}`))){next=true;break;}
        }
        if (!next) break;
        continue;
      }
      paralelosActivos++;

      const esBT = /bach[i]?|btp\b|b\.t\.|b\.técnico|tecnico/i.test(grado);

      // Especialidad BT
      if (esBT && especialidadCol >= 0){
        const esp = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1, c:especialidadCol})));
        if (!esp){
          issues.push(issue('error',amie,fileName,'Par_PO',`${colLetter(especialidadCol+1)}${r}`,
            `Fila BT "${grado}": especialidad vacía. Completar según catálogo vigente.`));
        } else {
          specialtiesFound.add(esp);
          if (FIGURAS_REFORMADAS_RE.test(esp)){
            reformedFigure=true;
            issues.push(issue('info',amie,fileName,'Par_PO',`${colLetter(especialidadCol+1)}${r}`,
              `Figura reformada: "${esp}". Por Acuerdo 2022-00034-A, las horas técnicas en 1°/2° BT son 13h semanales (no 10h). Verificar en DIS_TRA.`));
          }
        }
      }

      // Estudiantes
      if (estudiantesCol >= 0){
        const estAddr = XLSX.utils.encode_cell({r:r-1, c:estudiantesCol});
        const est = toNumber(getCellDisplay(ws, estAddr));
        if (!isNaN(est)){
          if (est <= 0)
            issues.push(issue('error',amie,fileName,'Par_PO',`${colLetter(estudiantesCol+1)}${r}`,
              `Fila ${r}: número de estudiantes = ${est}. Debe ser mayor a 0.`));
          else if (est < 3)
            issues.push(issue('warning',amie,fileName,'Par_PO',`${colLetter(estudiantesCol+1)}${r}`,
              `Fila ${r}: ${est} estudiante(s) en "${grado}". Verificar según normativa PCEI.`));
        }
      }
    }

    if (!paralelosActivos)
      issues.push(issue('warning',amie,fileName,'Par_PO',`A${headerRow+1}:`,'No se detectaron filas activas de paralelos.'));

    return {
      paralelosActivos,
      reformedFigure,
      specialty: Array.from(specialtiesFound).join(' | '),
      headerRow
    };
  }

  // ── validateDistra (MEJORADO) ─────────────────────────────────────────────

  function validateDistra(amie,fileName,ws,parInfo,issues){
    // Celdas clave
    ['A1','J6','J7'].forEach(addr=>{
      if (!normalize(getCellDisplay(ws,addr)))
        issues.push(issue('warning',amie,fileName,'DIS_TRA',addr,'Celda clave vacía en DIS_TRA.'));
    });

    // Estructura de paralelos: columnas K+ (1-indexed col 11 → 0-indexed col 10)
    let structureCols=0, firstDataC=-1;
    for (let c=10; c<=200; c++){
      const r7=normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:6,c})));
      const r8=normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:7,c})));
      const r9=normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:8,c})));
      if (r7||r8||r9){ if(firstDataC<0)firstDataC=c; structureCols++; }
      else if (structureCols>0) break;
    }

    if (!structureCols){
      issues.push(issue('warning',amie,fileName,'DIS_TRA','K7:...','No se detectó estructura de carga horaria desde la columna K.'));
      return { teachersWithLoad:0 };
    }

    // Tronco común = 0 para BT (fila 6, 0-indexed row 5)
    for (let c=firstDataC; c<firstDataC+structureCols; c++){
      const addr = XLSX.utils.encode_cell({r:5,c});
      const val = toNumber(getCellDisplay(ws,addr));
      if (!isNaN(val) && val !== 0)
        issues.push(issue('error',amie,fileName,'DIS_TRA', XLSX.utils.encode_cell({r:5,c}),
          `Tronco común = ${val}. Para BT/PCEI debe ser 0 (Acuerdo 2021-00057-A: tronco es independiente de la figura técnica).`));
    }

    // Paralelos DIS_TRA vs Par_PO
    if (parInfo.paralelosActivos > 0 && structureCols !== parInfo.paralelosActivos)
      issues.push(issue('warning',amie,fileName,'DIS_TRA','K7:...',
        `Columnas de carga en DIS_TRA (${structureCols}) ≠ paralelos activos en Par_PO (${parInfo.paralelosActivos}). Verificar coherencia.`));

    // Columna de total: buscar "Total" en filas 6-9 (0-indexed 5-8), cols 0-15
    let totalC = -1;
    for (let r=5; r<=8 && totalC<0; r++){
      for (let c=0; c<=15; c++){
        const v = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r,c}))).toLowerCase();
        if (v.includes('total') && !v.includes('estudiant')){ totalC=c; break; }
      }
    }

    // Validación de carga horaria por docente (filas 10+)
    let teachersWithLoad = 0;
    for (let r=10; r<=300; r++){
      const nameVal = normalize(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1,c:0})));
      if (!nameVal || /total|promedio|subtotal|suma|directiv/i.test(nameVal)) continue;

      // Intentar col Total primero, luego sumar paralelos
      let totalHours = NaN;
      if (totalC >= 0){
        const tv = toNumber(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1,c:totalC})));
        if (!isNaN(tv) && tv > 0) totalHours = tv;
      }
      if (isNaN(totalHours)){
        let sum=0;
        for (let c=firstDataC; c<firstDataC+structureCols; c++){
          const v = toNumber(getCellDisplay(ws, XLSX.utils.encode_cell({r:r-1,c})));
          if (!isNaN(v) && v>0) sum+=v;
        }
        if (sum>0) totalHours=sum;
      }

      if (!isNaN(totalHours)){
        teachersWithLoad++;
        if (totalHours > MAX_HORAS_DOCENTE){
          issues.push(issue('error',amie,fileName,'DIS_TRA',`A${r}`,
            `"${nameVal}": ${totalHours} períodos/semana exceden el límite de ${MAX_HORAS_DOCENTE}. ` +
            `Art. 117 LOEI: máximo 25 períodos pedagógicos semanales.`));
        } else if (parInfo.reformedFigure && totalHours > 13 && totalHours <= MAX_HORAS_DOCENTE){
          // Solo informativo: figura reformada, verificar que los 13h técnicos estén correctos
          // No emitir issue para no generar ruido; ya se notificó en Par_PO
        }
      }
    }

    if (teachersWithLoad === 0)
      issues.push(issue('warning',amie,fileName,'DIS_TRA','A10:...',
        'No se detectaron docentes con carga horaria asignada. Verificar si las filas están completas.'));

    // Aviso normativo si se detectó figura reformada
    if (parInfo.reformedFigure)
      issues.push(issue('info',amie,fileName,'DIS_TRA','—',
        `Acuerdo 2022-00034-A activo: figura reformada "${parInfo.specialty}". ` +
        `Confirmar que 1°/2° BT tienen 13h técnicas/semana en DIS_TRA (no 10h).`));

    return { teachersWithLoad };
  }

  // ── validateGenericContent ────────────────────────────────────────────────

  function validateGenericContent(amie,fileName,sheetName,ws,issues,keyCells){
    keyCells.forEach(addr=>{
      if (!normalize(getCellDisplay(ws,addr)))
        issues.push(issue('warning',amie,fileName,sheetName,addr,'Celda clave vacía en la hoja.'));
    });
    let used=0;
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (range){
      for (let r=range.s.r;r<=Math.min(range.e.r,range.s.r+40);r++){
        let rowHas=false;
        for (let c=range.s.c;c<=Math.min(range.e.c,range.s.c+10);c++){
          if (normalize(getCellDisplay(ws,XLSX.utils.encode_cell({r,c})))){ rowHas=true; break; }
        }
        if (rowHas) used++;
      }
    }
    if (used<3)
      issues.push(issue('warning',amie,fileName,sheetName,'','La hoja tiene muy poco contenido visible.'));
  }

  // ── buildReport ───────────────────────────────────────────────────────────

  function buildReport(entries){
    const allIssues=[];
    const byAmie=new Map();
    const fileRows=entries.map(entry=>{
      entry.issues.forEach(i=>allIssues.push(i));
      if (entry.amie){ byAmie.set(entry.amie,(byAmie.get(entry.amie)||0)+1); }
      const errors=entry.issues.filter(i=>i.level==='error').length;
      const warnings=entry.issues.filter(i=>i.level==='warning').length;
      const info=entry.issues.filter(i=>i.level==='info').length;
      return {
        fileName:entry.fileName, amie:entry.amie||'-',
        status:errors?'ERROR':(warnings?'ADVERTENCIA':'OK'),
        errors, warnings, info,
        summary:errors?'Tiene errores.':(warnings?'Tiene observaciones.':'Sin novedades.')
      };
    });
    for (const [amie,count] of byAmie.entries())
      if (count>1) allIssues.push(issue('warning',amie,'','Cruce','',`Se cargaron ${count} archivos para el mismo AMIE.`));

    const summary={
      build:BUILD,
      matricesLoaded:entries.length,
      amiesDetected:Array.from(new Set(entries.map(e=>e.amie).filter(Boolean))).length,
      ok:fileRows.filter(r=>r.status==='OK').length,
      warnings:fileRows.filter(r=>r.status==='ADVERTENCIA').length,
      errors:fileRows.filter(r=>r.status==='ERROR').length,
      totalIssues:allIssues.length
    };
    return { summary, fileRows, allIssues };
  }

  // ── render ────────────────────────────────────────────────────────────────

  function renderSummaryMessage(msg,isError=false){
    $('summaryCards').innerHTML=`<h2>2. Resumen</h2><div class="badge ${isError?'err':'warn'}">${escapeHtml(msg)}</div>`;
  }

  function renderReport(report){
    const s=report.summary;
    $('summaryCards').innerHTML=`
      <h2>2. Resumen</h2>
      <div class="kpis">
        <div class="kpi"><div class="muted">Matrices cargadas</div><div class="num">${s.matricesLoaded}</div></div>
        <div class="kpi"><div class="muted">AMIE detectados</div><div class="num">${s.amiesDetected}</div></div>
        <div class="kpi"><div class="muted">Con error</div><div class="num">${s.errors}</div></div>
        <div class="kpi"><div class="muted">Con advertencia</div><div class="num">${s.warnings}</div></div>
        <div class="kpi"><div class="muted">Sin novedades</div><div class="num">${s.ok}</div></div>
      </div>
      <p class="small muted mt16">Versión: <span class="code">${escapeHtml(s.build)}</span> · Novedades detectadas: ${s.totalIssues}</p>
    `;
    $('resultsTableWrap').innerHTML=buildResultsTable(report.fileRows);
    $('issuesTableWrap').innerHTML=buildIssuesTable(report.allIssues);
  }

  function buildResultsTable(rows){
    if (!rows.length) return '<div class="muted">No hay resultados.</div>';
    return `<table>
      <thead><tr><th>Archivo</th><th>AMIE</th><th>Estado</th><th>Errores</th><th>Advertencias</th><th>Info</th><th>Resumen</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${escapeHtml(r.fileName)}</td>
        <td><strong>${escapeHtml(r.amie)}</strong></td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.errors}</td><td>${r.warnings}</td><td>${r.info}</td>
        <td>${escapeHtml(r.summary)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function buildIssuesTable(rows){
    if (!rows.length) return '<div class="muted">Sin novedades.</div>';
    return `<table>
      <thead><tr><th>Nivel</th><th>AMIE</th><th>Archivo</th><th>Hoja</th><th>Celda</th><th>Novedad</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${levelBadge(r.level)}</td>
        <td>${escapeHtml(r.amie||'-')}</td>
        <td>${escapeHtml(r.fileName||'-')}</td>
        <td>${escapeHtml(r.sheet||'-')}</td>
        <td>${escapeHtml(r.cell||'-')}</td>
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

  function escapeHtml(text){
    return String(text??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  // ── descargas ─────────────────────────────────────────────────────────────

  function downloadJson(){
    if (!lastReport) return;
    const blob=new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'});
    triggerDownload(blob,`reporte_dtd_v22_${dateStamp()}.json`);
  }

  function downloadXlsx(){
    if (!lastReport) return;
    const wb=XLSX.utils.book_new();
    const resumen=[['Indicador','Valor'],...Object.entries(lastReport.summary)];
    const detalle=[['Archivo','AMIE','Estado','Errores','Advertencias','Info','Resumen'],
      ...lastReport.fileRows.map(r=>[r.fileName,r.amie,r.status,r.errors,r.warnings,r.info,r.summary])];
    const issues=[['Nivel','AMIE','Archivo','Hoja','Celda','Novedad'],
      ...lastReport.allIssues.map(i=>[i.level,i.amie,i.fileName,i.sheet,i.cell,i.message])];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(resumen),'Resumen');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detalle),'Resultado_Archivo');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(issues),'Novedades');
    XLSX.writeFile(wb,`reporte_dtd_v22_${dateStamp()}.xlsx`);
  }

  function downloadPdf(){
    if (!lastReport||!window.jspdf) return;
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape'});
    const s=lastReport.summary;
    pdf.setFontSize(16);
    pdf.text('Revisión de matrices DTD - PCEI',14,16);
    pdf.setFontSize(10);
    pdf.text(`Matrices: ${s.matricesLoaded} | AMIE: ${s.amiesDetected} | OK: ${s.ok} | Adv.: ${s.warnings} | Error: ${s.errors}`,14,24);
    pdf.autoTable({
      startY:32,
      head:[['Archivo','AMIE','Estado','Errores','Advertencias','Resumen']],
      body:lastReport.fileRows.map(r=>[r.fileName,r.amie,r.status,r.errors,r.warnings,r.summary]),
      styles:{fontSize:8},
      headStyles:{fillColor:[15,76,129]}
    });
    pdf.save(`resumen_dtd_v22_${dateStamp()}.pdf`);
  }

  function triggerDownload(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function dateStamp(){
    const d=new Date(), pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
})();
