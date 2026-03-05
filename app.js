
/* PO-App v13 (Institucional, sin CDN) — Validador robusto
   - No depende de handlers previos
   - Siempre muestra estado / errores
   - Detecta modo DTD vs CONSOLIDADO
   - Exporta JSON y PDF (si jsPDF está disponible)
*/
(function(){
  const BUILD = "v13.0.0";
  const $ = (id)=>document.getElementById(id);

  function normalize(s){
    return (s ?? "").toString().trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\s+/g," ");
  }

  function setStatus(msg){
    const box = $("statusBox");
    if(box) box.textContent = msg;
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
    // Use XLSX utils if available
    if(window.XLSX?.utils?.sheet_to_json){
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    }
    return [];
  }

  function detectMode(sheetNames){
    const n = sheetNames.map(s=>normalize(s));
    if(n.includes("consolidado")) return "CONSOLIDADO";
    if(n.includes("pasos") && (n.includes("nomina") || n.includes("nómina") || n.includes("nomina"))) return "MATRIZ_DTD";
    // fallback: if has Nómina at least
    if(n.includes("nomina") || n.includes("nómina")) return "MATRIZ_DTD";
    return "DESCONOCIDO";
  }

  function findHeaderRow(rows, headerCandidates){
    // returns {rowIndex, colMap} where colMap maps key->colIndex
    const wants = headerCandidates.map(h=>normalize(h));
    for(let r=0;r<Math.min(rows.length, 80);r++){
      const row = rows[r].map(c=>normalize(c));
      const colMap = {};
      let hits = 0;
      wants.forEach((w,i)=>{
        const idx = row.findIndex(x=>x===w);
        if(idx>=0){ colMap[w] = idx; hits++; }
      });
      if(hits >= Math.max(2, Math.ceil(wants.length*0.5))){
        return { rowIndex: r, colMap };
      }
    }
    return null;
  }

  function is10digitCedula(x){
    const s = String(x??"").replace(/\D/g,"");
    return s.length===10;
  }

  function runValidationDTD(wb, sheetNames){
    const issues = [];
    const needSheets = ["Pasos","Nómina","Par_PO","DIS_TRA","PlanEstudio","Param"];
    needSheets.forEach(s=>{
      if(!sheetNames.includes(s)){
        // tolerate accents/variants by normalize match
        const ok = sheetNames.map(n=>normalize(n)).includes(normalize(s));
        if(!ok) issues.push({level:"CRITICO", sheet:s, message:`Falta hoja requerida: ${s}`});
      }
    });

    // Nómina checks
    const nomName = sheetNames.find(s=>normalize(s)==="nomina" || normalize(s)==="nómina") || sheetNames.find(s=>normalize(s).includes("nomina"));
    if(nomName){
      const rows = sheetToRows(wb, nomName);
      if(!rows.length){
        issues.push({level:"CRITICO", sheet:nomName, message:"Hoja Nómina está vacía."});
      } else {
        // AMIE in B5 or B4
        const b5 = rows[4]?.[1] ?? "";
        const b4 = rows[3]?.[1] ?? "";
        const amie = String(b5||b4||"").trim();
        if(!amie) issues.push({level:"CRITICO", sheet:nomName, message:"AMIE no encontrado en B5 (o B4)."});

        const hdr = findHeaderRow(rows, ["Nro. de cédula","Cédula","FUNxIE","Está en la IE","Esta en la IE"]);
        if(!hdr){
          issues.push({level:"CRITICO", sheet:nomName, message:"No se encontró encabezado de tabla en Nómina (cédula / FUNxIE / Está en la IE)."});
        } else {
          const start = hdr.rowIndex+1;
          // locate columns
          const rowHdr = rows[hdr.rowIndex].map(c=>normalize(c));
          const colCed = rowHdr.findIndex(x=>["nro. de cedula","nro. de cédula","cedula","cédula","no. cedula","no. cédula"].includes(x));
          const colFun = rowHdr.findIndex(x=>["funxie","fun xie","funcion en la ie","función en la ie"].includes(x));
          const colEsta = rowHdr.findIndex(x=>["esta en la ie","está en la ie"].includes(x));
          let count=0, badCed=0, badFun=0, badEsta=0;
          for(let r=start; r<rows.length; r++){
            const ced = rows[r][colCed] ?? "";
            const fun = rows[r][colFun] ?? "";
            const esta = rows[r][colEsta] ?? "";
            const any = String(ced||fun||esta||"").trim();
            if(!any) continue;
            count++;
            if(colCed>=0 && ced && !is10digitCedula(ced)) badCed++;
            if(colFun>=0 && !String(fun).trim()) badFun++;
            if(colEsta>=0){
              const v = normalize(esta);
              if(v && !["si","no"].includes(v)) badEsta++;
            }
          }
          if(count==0) issues.push({level:"ADVERTENCIA", sheet:nomName, message:"Tabla Nómina sin registros visibles."});
          if(badCed>0) issues.push({level:"CRITICO", sheet:nomName, message:`Cédulas inválidas (no 10 dígitos): ${badCed}.`});
          if(badFun>0) issues.push({level:"CRITICO", sheet:nomName, message:`FUNxIE vacío en ${badFun} registros.`});
          if(badEsta>0) issues.push({level:"CRITICO", sheet:nomName, message:`'Está en la IE' distinto de Si/No en ${badEsta} registros.`});
        }
      }
    }

    return { mode:"MATRIZ_DTD", issues };
  }

  function runValidationConsolidado(wb, sheetNames){
    const issues = [];
    const consName = sheetNames.find(s=>normalize(s)==="consolidado");
    const excName  = sheetNames.find(s=>normalize(s)==="excesos" || normalize(s)==="exesos");

    if(!consName) issues.push({level:"CRITICO", sheet:"Consolidado", message:"Falta hoja 'Consolidado'."});

    // Validate Consolidado basic
    if(consName){
      const rows = sheetToRows(wb, consName);
      if(!rows.length) issues.push({level:"CRITICO", sheet:consName, message:"Hoja Consolidado está vacía."});
      else {
        // Find headers with common fields
        const hdr = findHeaderRow(rows, ["AMIE","Distrito","Institución","Especialidad","Necesidad","Docentes"]);
        if(!hdr){
          issues.push({level:"CRITICO", sheet:consName, message:"No se detectó cabecera en Consolidado (AMIE/Distrito/Especialidad/Necesidad)."});
        } else {
          const header = rows[hdr.rowIndex].map(c=>normalize(c));
          const colAmie = header.findIndex(x=>x==="amie" || x.includes("amie"));
          const colEsp  = header.findIndex(x=>x==="especialidad" || x.includes("especialidad") || x.includes("figura"));
          const colNec  = header.findIndex(x=>x==="necesidad" || x.includes("necesidad"));
          let emptyAmie=0, negNec=0, nonNum=0, dup=0;
          const seen = new Set();
          for(let r=hdr.rowIndex+1; r<rows.length; r++){
            const amie = String(rows[r][colAmie] ?? "").trim();
            const esp  = String(rows[r][colEsp] ?? "").trim();
            const nec  = rows[r][colNec];
            const any = String(amie||esp||nec||"").trim();
            if(!any) continue;
            if(!amie) emptyAmie++;
            const n = Number(String(nec).replace(",", "."));
            if(String(nec).trim() && Number.isNaN(n)) nonNum++;
            if(!Number.isNaN(n) && n < 0) negNec++;
            const key = `${amie}||${normalize(esp)}`;
            if(amie && esp){
              if(seen.has(key)) dup++;
              else seen.add(key);
            }
          }
          if(emptyAmie>0) issues.push({level:"CRITICO", sheet:consName, message:`AMIE vacío en ${emptyAmie} filas.`});
          if(nonNum>0) issues.push({level:"CRITICO", sheet:consName, message:`Necesidad no numérica en ${nonNum} filas.`});
          if(negNec>0) issues.push({level:"CRITICO", sheet:consName, message:`Necesidad negativa en ${negNec} filas.`});
          if(dup>0) issues.push({level:"ADVERTENCIA", sheet:consName, message:`Duplicados AMIE+Especialidad: ${dup}.`});
        }
      }
    }

    if(excName){
      const rows = sheetToRows(wb, excName);
      if(!rows.length) issues.push({level:"INFO", sheet:excName, message:"Hoja Excesos está vacía (si no aplica, ignorar)."});
    } else {
      issues.push({level:"ADVERTENCIA", sheet:"Excesos", message:"No se encontró hoja Excesos (si aplica, adjuntar)."});
    }

    return { mode:"CONSOLIDADO", issues };
  }

  function summarize(issues){
    const c = issues.filter(i=>i.level==="CRITICO").length;
    const w = issues.filter(i=>i.level==="ADVERTENCIA").length;
    const info = issues.filter(i=>i.level==="INFO").length;
    const ok = (c===0);
    return {
      ok,
      criticos:c, advertencias:w, info,
      status: ok ? "VALIDADO" : "CON INCONSISTENCIAS",
      summary: `Estado: ${ok ? "VALIDADO" : "CON INCONSISTENCIAS"}\nCríticos: ${c}\nAdvertencias: ${w}\nInfo: ${info}`
    };
  }

  function enableDownloads(report){
    const btnJson = $("btnJson");
    const btnPdf  = $("btnPdf");
    const btnMemo = $("btnMemo");
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
          const jspdf = window.jspdf?.jsPDF;
          if(!jspdf) throw new Error("jsPDF no está disponible (verifica vendor/jspdf.umd.min.js).");
          const doc = new jspdf({ unit:"pt", format:"a4" });
          doc.setFontSize(14);
          doc.text(`Reporte de inconsistencias (${BUILD})`, 40, 50);
          doc.setFontSize(10);
          doc.text(report.summary.summary.split("\n"), 40, 70);
          let y = 120;
          report.issues.forEach((it, idx)=>{
            const line = `${it.level} | ${it.sheet} | ${it.message}`;
            doc.text(line.length>120 ? line.slice(0,120)+"…" : line, 40, y);
            y += 14;
            if(y > 780){ doc.addPage(); y = 50; }
          });
          doc.save(`reporte_inconsistencias_${BUILD}.pdf`);
        }catch(e){ showError("No se pudo generar PDF", e); }
      };
    }
    if(btnMemo){
      btnMemo.disabled = false;
      btnMemo.onclick = ()=>{
        const s = report.summary;
        const lines = [
          `ASUNTO: Observaciones a la matriz remitida (PO / Necesidad docente) — ${BUILD}`,
          "",
          "De mi consideración:",
          "",
          "En atención a la información remitida, se procedió a ejecutar la validación técnica automatizada de la matriz adjunta.",
          "",
          s.summary,
          "",
          "Observaciones:",
          ...report.issues.map(i=>`- [${i.level}] (${i.sheet}) ${i.message}`),
          "",
          "Se solicita efectuar los ajustes correspondientes y remitir la versión corregida, a fin de garantizar la consistencia de la información reportada."
        ];
        const blob = new Blob([lines.join("\n")], {type:"text/plain;charset=utf-8"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `borrador_memorando_${BUILD}.txt`;
        a.click();
      };
    }
  }

  async function onValidate(){
    try{
      const input = $("fileInput");
      const btn = $("btnValidate");
      if(!window.XLSX) throw new Error("XLSX no está cargado. Asegúrate de publicar vendor/xlsx.full.min.js.");
      const file = input?.files?.[0];
      if(!file) throw new Error("Selecciona un archivo .xlsx o .xlsm antes de validar.");
      setStatus(`PO-App ${BUILD}\nLeyendo: ${file.name}\nProcesando…`);
      btn && (btn.disabled = true);
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type:"array" });
      const sheetNames = wb.SheetNames || [];
      setStatus(`PO-App ${BUILD}\nHojas detectadas (${sheetNames.length}):\n- ` + sheetNames.join("\n- "));

      const mode = detectMode(sheetNames);
      let result;
      if(mode==="CONSOLIDADO") result = runValidationConsolidado(wb, sheetNames);
      else if(mode==="MATRIZ_DTD") result = runValidationDTD(wb, sheetNames);
      else result = { mode, issues:[{level:"ADVERTENCIA", sheet:"(general)", message:"No se identificó el tipo de matriz; se ejecutó validación mínima."}] };

      const sum = summarize(result.issues);
      const report = { build:BUILD, mode:result.mode, summary:sum, issues:result.issues };
      window.__PO_REPORT__ = report;

      setStatus(`PO-App ${BUILD}\nModo: ${result.mode}\n\n${sum.summary}\n\nDetalles:\n` + result.issues.map(i=>`- [${i.level}] ${i.sheet}: ${i.message}`).join("\n"));
      enableDownloads(report);

    }catch(e){
      showError("No se pudo validar y generar reporte", e);
    }finally{
      const btn = $("btnValidate");
      btn && (btn.disabled = false);
    }
  }

  function onDiag(){
    const hasXLSX = !!window.XLSX;
    const hasPDF = !!(window.jspdf?.jsPDF);
    const publishedFrom = location.href;
    setStatus(`PO-App ${BUILD} — Diagnóstico\nURL: ${publishedFrom}\nXLSX: ${hasXLSX}\njsPDF: ${hasPDF}\nTip: si XLSX=false, revisa que /vendor/xlsx.full.min.js exista en el folder publicado (root o /docs).\n`);
  }

  function ensureIds(){
    // If original HTML didn't include our ids, try to map by text
    if(!$("fileInput")){
      const inp = document.querySelector('input[type="file"]');
      if(inp) inp.id="fileInput";
    }
    if(!$("btnValidate")){
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find(x=>/validar/i.test(x.textContent||""));
      if(b) b.id="btnValidate";
    }
    if(!$("btnDiag")){
      const btns = Array.from(document.querySelectorAll("button"));
      const b = btns.find(x=>/diagnostico/i.test(x.textContent||""));
      if(b) b.id="btnDiag";
    }
  }

  function injectStatusBox(){
    if($("statusBox")) return;
    const box = document.createElement("div");
    box.id = "statusBox";
    box.style.cssText = "margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);white-space:pre-wrap;font-size:13px;line-height:1.35;";
    const anchor = document.querySelector("#uploadSection") || document.querySelector("section") || document.body;
    anchor.appendChild(box);
    setStatus(`PO-App ${BUILD} listo.\nSelecciona un Excel y presiona "Validar y generar reporte".`);
  }

  function wireDownloads(){
    // Make sure buttons exist; if not, create minimal ones
    const anchor = document.querySelector("#uploadSection") || document.querySelector("section") || document.body;
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
    if(!$("btnMemo")){
      const b = document.createElement("button");
      b.id="btnMemo"; b.textContent="Descargar borrador memorando (TXT)"; b.disabled=true;
      anchor.appendChild(b);
    }
  }

  window.addEventListener("DOMContentLoaded", ()=>{
    ensureIds();
    injectStatusBox();
    wireDownloads();
    $("btnValidate")?.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); onValidate(); }, {passive:false});
    $("btnDiag")?.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); onDiag(); }, {passive:false});
  });
})();
