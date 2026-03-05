
/* PO-App v14 (Institucional, sin CDN) — Revisión robusta (sin Quipux/memorando)
   - Botón "Validar" SIEMPRE clickeable (no se bloquea por UI)
   - Estado visible + errores explícitos
   - Detección automática: CONSOLIDADO vs MATRIZ_DTD
   - Exporta: JSON + PDF
*/
(function(){
  const BUILD = "v14.0.0";
  const $ = (id)=>document.getElementById(id);

  function normalize(s){
    return (s ?? "").toString().trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g," ");
  }

  function ensureStatusBox(){
    let box = $("statusBox");
    if(box) return box;
    box = document.createElement("div");
    box.id = "statusBox";
    box.style.cssText = "margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);white-space:pre-wrap;font-size:13px;line-height:1.35;";
    const anchor = $("uploadSection") || document.querySelector("section") || document.body;
    anchor.appendChild(box);
    return box;
  }

  function setStatus(msg){
    ensureStatusBox().textContent = msg;
  }

  function showError(title, err){
    console.error(title, err);
    const msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
    setStatus(`${title}\n${msg}`);
    alert(`${title}: ${msg}`);
  }

  function sheetToRows(wb, sheetName){
    const ws = wb.Sheets[sheetName];
    if(!ws) return [];
    return window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  }

  function detectMode(sheetNames){
    const n = sheetNames.map(s=>normalize(s));
    if(n.includes("consolidado")) return "CONSOLIDADO";
    if(n.includes("pasos") && n.some(x=>x==="nomina" || x==="nómina" || x.includes("nomina"))) return "MATRIZ_DTD";
    if(n.some(x=>x==="nomina" || x==="nómina" || x.includes("nomina"))) return "MATRIZ_DTD";
    return "DESCONOCIDO";
  }

  function findHeaderRow(rows, candidates){
    const wants = candidates.map(normalize);
    for(let r=0;r<Math.min(rows.length,120);r++){
      const row = rows[r].map(normalize);
      let hits=0;
      const map = {};
      wants.forEach(w=>{
        const idx = row.findIndex(x=>x===w);
        if(idx>=0){ map[w]=idx; hits++; }
      });
      if(hits >= Math.max(2, Math.ceil(wants.length*0.5))){
        return { rowIndex:r, map };
      }
    }
    return null;
  }

  function is10digitCedula(x){
    const s = String(x??"").replace(/\D/g,"");
    return s.length===10;
  }

  function issue(level, sheet, message, row=null, col=null){
    const o = {level, sheet, message};
    if(row!==null) o.row = row;
    if(col!==null) o.col = col;
    return o;
  }

  function summarize(issues){
    const c = issues.filter(i=>i.level==="CRITICO").length;
    const w = issues.filter(i=>i.level==="ADVERTENCIA").length;
    const info = issues.filter(i=>i.level==="INFO").length;
    const ok = (c===0);
    return {
      ok, criticos:c, advertencias:w, info,
      status: ok ? "VALIDADO" : "CON INCONSISTENCIAS",
      summary: `Estado: ${ok ? "VALIDADO" : "CON INCONSISTENCIAS"}\nCríticos: ${c}\nAdvertencias: ${w}\nInfo: ${info}`
    };
  }

  function ensureButtons(){
    // Ensure file input & buttons exist/ids set (tolerante a cambios de HTML)
    if(!$("fileInput")){
      const inp = document.querySelector('input[type="file"]');
      if(inp) inp.id="fileInput";
    }
    if(!$("btnValidate")){
      const b = Array.from(document.querySelectorAll("button")).find(x=>/validar/i.test(x.textContent||""));
      if(b) b.id="btnValidate";
    }
    if(!$("btnDiag")){
      const b = Array.from(document.querySelectorAll("button")).find(x=>/diagnostico/i.test(x.textContent||""));
      if(b) b.id="btnDiag";
    }

    // Downloads: JSON + PDF only
    const anchor = $("uploadSection") || document.querySelector("section") || document.body;
    if(!$("btnJson")){
      const b = document.createElement("button");
      b.id="btnJson"; b.textContent="Descargar reporte (JSON)"; b.disabled=true;
      b.style.marginRight="8px";
      anchor.appendChild(b);
    }
    if(!$("btnPdf")){
      const b = document.createElement("button");
      b.id="btnPdf"; b.textContent="Descargar reporte (PDF)"; b.disabled=true;
      b.style.marginRight="8px";
      anchor.appendChild(b);
    }
  }

  function enableDownloads(report){
    const btnJson = $("btnJson");
    const btnPdf  = $("btnPdf");

    if(btnJson){
      btnJson.disabled = false;
      btnJson.onclick = ()=>{
        const blob = new Blob([JSON.stringify(report, null, 2)], {type:"application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `reporte_inconsistencias_${BUILD}.json`;
        a.click();
      };
    }

    if(btnPdf){
      btnPdf.disabled = false;
      btnPdf.onclick = ()=>{
        try{
          const jsPDF = window.jspdf?.jsPDF;
          if(!jsPDF) throw new Error("jsPDF no disponible. Verifica vendor/jspdf.umd.min.js");
          const doc = new jsPDF({ unit:"pt", format:"a4" });
          doc.setFontSize(14);
          doc.text(`Reporte de inconsistencias (${BUILD})`, 40, 50);
          doc.setFontSize(10);
          doc.text(report.summary.summary.split("\n"), 40, 70);

          let y = 120;
          const maxW = 520;
          report.issues.forEach((it)=>{
            const line = `${it.level} | ${it.sheet}${it.row!=null?` [fila ${it.row}]`:``} | ${it.message}`;
            const parts = doc.splitTextToSize(line, maxW);
            doc.text(parts, 40, y);
            y += parts.length*12 + 6;
            if(y > 780){ doc.addPage(); y = 50; }
          });
          doc.save(`reporte_inconsistencias_${BUILD}.pdf`);
        }catch(e){ showError("No se pudo generar PDF", e); }
      };
    }
  }

  function validateDTD(wb, sheetNames){
    const issues = [];
    // Required sheets (tolerant by normalize match)
    const required = ["Pasos","Nómina","Par_PO","DIS_TRA","PlanEstudio","Param"];
    const normSet = new Set(sheetNames.map(normalize));
    required.forEach(s=>{
      if(!normSet.has(normalize(s))){
        issues.push(issue("CRITICO", s, `Falta hoja requerida: ${s}`));
      }
    });

    // Nómina
    const nomName = sheetNames.find(s=>normalize(s)==="nomina" || normalize(s)==="nómina") || sheetNames.find(s=>normalize(s).includes("nomina"));
    if(nomName){
      const rows = sheetToRows(wb, nomName);
      if(!rows.length){
        issues.push(issue("CRITICO", nomName, "Hoja Nómina está vacía."));
      } else {
        const b5 = rows[4]?.[1] ?? "";
        const b4 = rows[3]?.[1] ?? "";
        const amie = String(b5||b4||"").trim();
        if(!amie) issues.push(issue("CRITICO", nomName, "AMIE no encontrado en B5 (o B4)."));

        const hdr = findHeaderRow(rows, ["Cédula","Cedula","FUNxIE","Está en la IE","Esta en la IE"]);
        if(!hdr){
          issues.push(issue("CRITICO", nomName, "No se encontró cabecera de tabla (Cédula/FUNxIE/Está en la IE)."));
        } else {
          const header = rows[hdr.rowIndex].map(normalize);
          const colCed = header.findIndex(x=>["cedula","cédula","no. cedula","no. cédula","nro. de cedula","nro. de cédula"].includes(x));
          const colFun = header.findIndex(x=>["funxie","fun xie","funcion en la ie","función en la ie"].includes(x));
          const colEsta = header.findIndex(x=>["esta en la ie","está en la ie"].includes(x));

          let count=0;
          for(let r=hdr.rowIndex+1; r<rows.length; r++){
            const ced = colCed>=0 ? rows[r][colCed] : "";
            const fun = colFun>=0 ? rows[r][colFun] : "";
            const esta = colEsta>=0 ? rows[r][colEsta] : "";
            const any = String(ced||fun||esta||"").trim();
            if(!any) continue;
            count++;

            if(colCed>=0 && ced && !is10digitCedula(ced)) issues.push(issue("CRITICO", nomName, "Cédula inválida (no 10 dígitos).", r+1, colCed+1));
            if(colFun>=0 && !String(fun).trim()) issues.push(issue("CRITICO", nomName, "FUNxIE vacío.", r+1, colFun+1));
            if(colEsta>=0){
              const v = normalize(esta);
              if(v && !["si","no"].includes(v)) issues.push(issue("CRITICO", nomName, "Está en la IE debe ser Si/No.", r+1, colEsta+1));
            }
          }
          if(count===0) issues.push(issue("ADVERTENCIA", nomName, "Tabla Nómina sin registros visibles (posible filtro/estructura distinta)."));
        }
      }
    }

    return issues;
  }

  function validateConsolidado(wb, sheetNames){
    const issues = [];
    const consName = sheetNames.find(s=>normalize(s)==="consolidado");
    const excName  = sheetNames.find(s=>normalize(s)==="excesos" || normalize(s)==="exesos");

    if(!consName) return [issue("CRITICO","Consolidado","Falta hoja 'Consolidado'.")];

    const rows = sheetToRows(wb, consName);
    if(!rows.length) return [issue("CRITICO", consName, "Hoja Consolidado está vacía.")];

    const hdr = findHeaderRow(rows, ["AMIE","Distrito","Institución","Institucion","Especialidad","Necesidad","Exceso","Docentes"]);
    if(!hdr) {
      issues.push(issue("CRITICO", consName, "No se detectó cabecera (AMIE/Distrito/Especialidad/Necesidad)."));
      return issues;
    }
    const header = rows[hdr.rowIndex].map(normalize);
    const colAmie = header.findIndex(x=>x==="amie" || x.includes("amie"));
    const colEsp  = header.findIndex(x=>x==="especialidad" || x.includes("especialidad") || x.includes("figura"));
    const colDist = header.findIndex(x=>x==="distrito" || x.includes("distrito"));
    const colNec  = header.findIndex(x=>x==="necesidad" || x.includes("necesidad"));
    const seen = new Set();

    for(let r=hdr.rowIndex+1; r<rows.length; r++){
      const amie = String(colAmie>=0 ? rows[r][colAmie] : "").trim();
      const esp  = String(colEsp>=0 ? rows[r][colEsp] : "").trim();
      const dist = String(colDist>=0 ? rows[r][colDist] : "").trim();
      const necRaw = colNec>=0 ? rows[r][colNec] : "";
      const any = String(amie||esp||dist||necRaw||"").trim();
      if(!any) continue;

      if(!amie) issues.push(issue("CRITICO", consName, "AMIE vacío.", r+1, colAmie+1 if colAmie>=0 else None));
      if(colNec>=0){
        const n = Number(String(necRaw).replace(",", "."));
        if(String(necRaw).trim() && Number.isNaN(n)) issues.push(issue("CRITICO", consName, "Necesidad no numérica.", r+1, colNec+1));
        if(!Number.isNaN(n) && n < 0) issues.push(issue("CRITICO", consName, "Necesidad negativa.", r+1, colNec+1));
      }
      if(amie && esp){
        const key = `${amie}||${normalize(esp)}`;
        if(seen.has(key)) issues.push(issue("ADVERTENCIA", consName, "Duplicado AMIE + Especialidad.", r+1, colEsp+1 if colEsp>=0 else None));
        else seen.add(key);
      }
    }

    if(!excName){
      issues.push(issue("ADVERTENCIA","Excesos","No se encontró hoja Excesos (si aplica, adjuntar)."));
    } else {
      const exRows = sheetToRows(wb, excName);
      if(!exRows.length) issues.push(issue("INFO", excName, "Hoja Excesos está vacía (si no aplica, ignorar)."));
    }

    return issues;
  }

  async function onValidate(){
    try{
      ensureButtons();
      const input = $("fileInput");
      if(!window.XLSX) throw new Error("XLSX no está cargado. Verifica vendor/xlsx.full.min.js en el folder publicado (root o /docs).");
      const file = input?.files?.[0];
      if(!file) throw new Error("Selecciona un archivo .xlsx o .xlsm antes de validar.");

      setStatus(`PO-App ${BUILD}\nLeyendo: ${file.name}\nProcesando…`);

      // IMPORTANT: Never disable the button permanently — only short during processing
      const btn = $("btnValidate");
      if(btn){ btn.disabled = true; btn.style.cursor="wait"; }

      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type:"array" });
      const sheetNames = wb.SheetNames || [];
      const mode = detectMode(sheetNames);

      let issues = [];
      if(mode==="CONSOLIDADO") issues = validateConsolidado(wb, sheetNames);
      else if(mode==="MATRIZ_DTD") issues = validateDTD(wb, sheetNames);
      else issues = [issue("ADVERTENCIA","(general)","No se identificó el tipo de matriz. Se ejecutó validación mínima.")]

      const sum = summarize(issues);
      const report = { build:BUILD, mode, summary:sum, issues, sheetNames };
      window.__PO_REPORT__ = report;

      const details = issues.length
        ? issues.map(i=>`- [${i.level}] ${i.sheet}${i.row?` (fila ${i.row})`:``}: ${i.message}`).join("\n")
        : "- (Sin observaciones)";

      setStatus(
        `PO-App ${BUILD}\nModo detectado: ${mode}\n\n` +
        `${sum.summary}\n\nHojas detectadas (${sheetNames.length}):\n- ${sheetNames.join("\n- ")}\n\n` +
        `Observaciones:\n${details}`
      );

      enableDownloads(report);

    }catch(e){
      showError("No se pudo validar y generar reporte", e);
    }finally{
      const btn = $("btnValidate");
      if(btn){ btn.disabled = false; btn.style.cursor="pointer"; }
    }
  }

  function onDiag(){
    ensureButtons();
    const hasXLSX = !!window.XLSX;
    const hasPDF = !!(window.jspdf?.jsPDF);
    setStatus(
      `PO-App ${BUILD} — Diagnóstico\n` +
      `URL: ${location.href}\n` +
      `XLSX: ${hasXLSX}\n` +
      `jsPDF: ${hasPDF}\n` +
      `Tip: si XLSX=false, revisa /vendor/xlsx.full.min.js en el folder publicado (root o /docs).\n`
    );
  }

  function patchUI(){
    ensureButtons();
    ensureStatusBox();
    // Make validate button always clickable from UI standpoint
    const btn = $("btnValidate");
    if(btn){
      btn.disabled = false;
      btn.style.cursor = "pointer";
      btn.type = "button";
      btn.title = "Ejecuta la validación del Excel cargado";
    }
    // Remove memo button if present in old HTML
    const oldMemo = $("btnMemo");
    if(oldMemo) oldMemo.remove();
  }

  window.addEventListener("DOMContentLoaded", ()=>{
    patchUI();
    $("btnValidate")?.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); onValidate(); }, {passive:false});
    $("btnDiag")?.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); onDiag(); }, {passive:false});
    setStatus(`PO-App ${BUILD} listo.\n1) Selecciona un Excel.\n2) Clic en "Validar y generar reporte".\n3) Descarga JSON/PDF.`);
  });
})();
