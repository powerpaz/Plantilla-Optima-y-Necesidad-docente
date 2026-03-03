/* PO-App v5
 * Incluye:
 * - Cálculo Plantilla Óptima (Inicial / EGB-BGU) según fórmulas oficiales compartidas.
 * - Tabla comparativa LOEI anterior vs LOEI reformada (períodos pedagógicos -> horas reloj).
 * - Validación normativa de figuras profesionales (00086 vs 00065 + equivalencias).
 * - (Opcional) lectura Excel para hoja NOMINE (si existe).
 */

const $ = (id) => document.getElementById(id);

function logLine(msg, cls=""){
  const el = $("log");
  const span = document.createElement("div");
  span.innerHTML = cls ? `<span class="${cls}">${escapeHtml(msg)}</span>` : escapeHtml(msg);
  el.appendChild(span);
}

function clearLog(){ $("log").innerHTML = ""; }

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function roundUp2(x){
  // Docentes suelen manejarse con redondeo hacia arriba a 2 decimales (ajustable)
  const v = Math.ceil((Number(x) + 1e-12) * 100) / 100;
  return v;
}

function setup(){
  $("envLabel").textContent = `Modo: ${window.PO_CONFIG?.envLabel || "GitHub Pages"}`;

  const excelInput = $("excelInput");
  const btnProcesar = $("btnProcesarExcel");
  excelInput.addEventListener("change", () => {
    btnProcesar.disabled = !(excelInput.files && excelInput.files.length);
  });

  $("btnProcesarExcel").addEventListener("click", procesarExcel);
  $("btnCalcular").addEventListener("click", calcularPO);
  $("btnLimpiar").addEventListener("click", limpiarPO);
  $("btnValidarFigura").addEventListener("click", () => {
    clearLog();
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
  limpiarPO();
}

function limpiarPO(){
  $("paralelos").value = 0;
  $("carga").value = 0;
  $("kpiDocentes").textContent = "0";
  $("kpiFormula").textContent = "-";
  $("detalleCalc").textContent = "";
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
    // Nro docentes = Σ paralelos (1 docente por paralelo)
    const k = window.PO_CONFIG?.formulas?.inicial_docentes_por_paralelo ?? 1;
    docentes = paralelos * k;
    formula = "Docentes = Σ paralelos (1 docente/paralelo)";
    detalle = `Inicial (3–4): paralelos=${paralelos} ⇒ docentes=${docentes}`;
  } else {
    // Total docentes = Σ (paralelos * carga horaria) / 25 (periodos pedagogicos)
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
  // 40 horas reloj/semana; horas reloj por período = 40/periodos
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

    const hrsPorPeriodo = relojFromPeriodos(periodos); // hrs reloj por periodo
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

  // Válida vigente
  if (vigente.includes(figura)){
    logLine(`OK: "${figuraRaw}" válida (catálogo vigente 2024-00065).`, "ok");
    return;
  }

  // Existe en catálogo anterior
  if (anterior.includes(figura)){
    const eq = equiv[figura];
    if (eq){
      logLine(`ADVERTENCIA: "${figuraRaw}" cambió de denominación. Equivalente vigente: "${eq}".`, "warn");
    } else {
      logLine(`CRÍTICO: "${figuraRaw}" existe en 2023-00086 pero NO está en 2024-00065 y no tiene equivalencia.`, "bad");
    }
    return;
  }

  // No existe en ninguno
  logLine(`CRÍTICO: "${figuraRaw}" no consta en catálogos 00086 ni 00065.`, "bad");
}

// === Lectura Excel (opcional) ===
async function procesarExcel(){
  clearLog();
  const input = $("excelInput");
  const file = input.files?.[0];
  if (!file){ logLine("Seleccione un archivo Excel.", "warn"); return; }
  if (typeof XLSX === "undefined"){ logLine("No se cargó XLSX (CDN).", "bad"); return; }

  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array", cellFormula:true });
    const sheets = wb.SheetNames || [];
    logLine(`INFO: Hojas detectadas: ${sheets.join(", ")}`);

    // Intento: extraer figura desde NOMINE!B2 (solo si existe)
    const ws = wb.Sheets["NOMINE"];
    if (ws && ws["B2"] && ws["B2"].v){
      const figura = String(ws["B2"].v);
      logLine(`INFO: Figura detectada en NOMINE!B2 = "${figura}"`);
      validarFiguraProfesional(figura);
    } else {
      logLine("INFO: No se detectó figura en NOMINE!B2 (ajustable).", "warn");
    }
  }catch(e){
    logLine(`CRÍTICO: Error leyendo Excel: ${String(e?.message || e)}`, "bad");
  }
}

document.addEventListener("DOMContentLoaded", setup);
