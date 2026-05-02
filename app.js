
(function(){
  const BUILD="v17.0.0";
  const $=id=>document.getElementById(id);

  function ensureIds(){
    const inp = $("fileInput") || document.querySelector('input[type="file"]');
    if(inp) inp.id="fileInput";
    const btnV = $("btnValidate") || Array.from(document.querySelectorAll("button")).find(b=>/validar/i.test(b.textContent||""));
    if(btnV) btnV.id="btnValidate";
    const btnD = $("btnDiag") || Array.from(document.querySelectorAll("button")).find(b=>/diagnostico/i.test(b.textContent||""));
    if(btnD) btnD.id="btnDiag";
    if(!$("validationSummary")){
      const div=document.createElement("div");
      div.id="validationSummary";
      div.className="po-status";
      (document.body.querySelector("section")||document.body).appendChild(div);
    }
  }
  function forceEnable(){
    const btn=$("btnValidate");
    if(!btn) return;
    btn.disabled=false;
    btn.removeAttribute("disabled");
    btn.style.pointerEvents="auto";
    btn.style.cursor="pointer";
  }
  function setStatus(t){ $("validationSummary").textContent=t; }

  async function diag(){
    ensureIds(); forceEnable();
    const hasX = !!window.XLSX;
    const info=[
      `PO-App ${BUILD} — Diagnóstico`,
      `URL: ${location.href}`,
      `XLSX: ${hasX}`,
      `Vendor XLSX: ${new URL("vendor/xlsx.full.min.js", location.href).toString()}`
    ].join("\n");
    setStatus(info);
    alert(info);
  }

  async function validate(){
    ensureIds(); forceEnable();
    try{
      if(!window.XLSX) throw new Error("No se cargó XLSX (vendor/xlsx.full.min.js).");
      const inp=$("fileInput");
      const file=inp?.files?.[0];
      if(!file) throw new Error("Selecciona un archivo .xlsx o .xlsm.");
      setStatus(`Leyendo: ${file.name}\nProcesando…`);
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, {type:"array"});
      const sheets = wb.SheetNames || [];
      setStatus(`OK ✅\nHojas detectadas (${sheets.length}):\n- `+sheets.join("\n- "));
    }catch(e){
      console.error(e);
      setStatus(`ERROR\n${e.stack||e.message||e}`);
      alert(`No se pudo validar: ${e.message||e}`);
    }finally{
      forceEnable();
    }
  }

  function hook(){
    ensureIds();
    const v=$("btnValidate");
    const d=$("btnDiag");
    if(v){
      v.type="button";
      v.addEventListener("click",(e)=>{e.preventDefault(); e.stopPropagation(); validate();},{passive:false});
    }
    if(d){
      d.type="button";
      d.addEventListener("click",(e)=>{e.preventDefault(); e.stopPropagation(); diag();},{passive:false});
    }
    forceEnable();
    const obs=new MutationObserver(()=>forceEnable());
    obs.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["disabled","class","style"]});
    setInterval(forceEnable,1200);
    setStatus(`PO-App ${BUILD} listo.\n1) Examinar (Excel)\n2) Validar y generar reporte\n3) Diagnóstico (si falla)`);
  }

  window.addEventListener("DOMContentLoaded", hook);
})();
