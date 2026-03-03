/* global XLSX, PO_CONFIG */

const $ = (id) => document.getElementById(id);

const state = {
  files: [],
  results: [],
  equivalencias: new Map(), // oldNorm -> newNorm
  catalogIndex: null,
  reportText: ""
};

function normalizeText(s) {
  if (s == null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[“”"'`´]/g, "")
    .replace(/[\(\)\[\]{}]/g, "")
    .replace(/[\.,;:¡!¿?]/g, "")
    .trim();
}

function buildCatalogIndex() {
  const idx = new Map();
  const all = [];
  for (const a of PO_CONFIG.normaVigente.areas) {
    for (const f of a.familias) {
      for (const fig of f.figuras) {
        const key = normalizeText(fig);
        idx.set(key, { figura: fig, familia: f.familia, area: a.area });
        all.push({ area: a.area, familia: f.familia, figura: fig });
      }
    }
  }
  state.catalogIndex = idx;
  return all;
}

function renderCatalogo() {
  const all = buildCatalogIndex();
  const byArea = new Map();
  for (const it of all) {
    if (!byArea.has(it.area)) byArea.set(it.area, new Map());
    const famMap = byArea.get(it.area);
    if (!famMap.has(it.familia)) famMap.set(it.familia, []);
    famMap.get(it.familia).push(it.figura);
  }

  const el = $("catalogoVigente");
  el.innerHTML = "";
  for (const [area, famMap] of byArea.entries()) {
    const sec = document.createElement("div");
    sec.style.marginBottom = "10px";
    const h = document.createElement("div");
    h.innerHTML = `<span class="badge ok">Área</span> <b>${escapeHtml(area)}</b>`;
    sec.appendChild(h);

    for (const [familia, figs] of famMap.entries()) {
      const p = document.createElement("div");
      p.style.marginTop = "6px";
      p.innerHTML = `<span class="badge">Familia</span> <b>${escapeHtml(familia)}</b><br><span class="muted">${figs.map(escapeHtml).join(" · ")}</span>`;
      sec.appendChild(p);
    }

    el.appendChild(sec);
  }
}

function renderGlosario() {
  const el = $("glosario");
  el.innerHTML = "";
  for (const g of PO_CONFIG.glosario) {
    const item = document.createElement("div");
    item.className = "glossItem";
    item.innerHTML = `<b>${escapeHtml(g.termino)}</b><div class="muted">${escapeHtml(g.definicion)}</div>`;
    el.appendChild(item);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readWorkbook(file) {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  return wb;
}

function sheetTo2D(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
}

function detectCandidateSheets(wb) {
  const names = wb.SheetNames || [];
  const pri = PO_CONFIG.excel.sheetsPriority.map((x) => normalizeText(x));
  const out = [];
  for (const n of names) {
    const nn = normalizeText(n);
    // prioriza por match directo
    if (pri.includes(nn)) out.push(n);
  }
  // agrega el resto si no hay
  if (out.length === 0) return names.slice(0, Math.min(10, names.length));
  // agrega otras cercanas
  for (const n of names) {
    if (!out.includes(n)) out.push(n);
    if (out.length >= 10) break;
  }
  return out;
}

function findFiguresInWorkbook(wb) {
  const figuresFound = new Map(); // normKey -> original samples
  const candidateSheets = detectCandidateSheets(wb);

  // 1) Construye lista de figuras vigentes (para match rápido)
  const catalogKeys = Array.from(state.catalogIndex.keys());

  // 2) Busca coincidencias por celdas (exact / contains)
  for (const sname of candidateSheets) {
    const grid = sheetTo2D(wb, sname);
    if (!grid || grid.length === 0) continue;

    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const text = normalizeText(cell);
        if (!text || text.length < 6) continue;

        // match exacto
        if (state.catalogIndex.has(text)) {
          figuresFound.set(text, { sample: cell, sheet: sname });
          continue;
        }

        // match por contains (para textos largos)
        for (const k of catalogKeys) {
          if (text.includes(k)) {
            figuresFound.set(k, { sample: cell, sheet: sname });
          }
        }
      }
    }
  }

  // 3) También intenta por encabezados típicos (si existen)
  const headerHints = PO_CONFIG.excel.figureHeaders.map(normalizeText);
  for (const sname of candidateSheets) {
    const grid = sheetTo2D(wb, sname);
    if (!grid || grid.length < 2) continue;

    // busca fila de encabezados en las primeras 40 filas
    for (let r = 0; r < Math.min(40, grid.length); r++) {
      const row = grid[r].map((x) => normalizeText(x));
      const headerCols = [];
      for (let c = 0; c < row.length; c++) {
        if (headerHints.includes(row[c])) headerCols.push(c);
      }
      if (headerCols.length === 0) continue;

      // toma hasta 200 filas debajo
      for (let rr = r + 1; rr < Math.min(r + 201, grid.length); rr++) {
        for (const cc of headerCols) {
          const v = grid[rr][cc];
          const nv = normalizeText(v);
          if (!nv) continue;
          // si coincide con vigente
          if (state.catalogIndex.has(nv)) figuresFound.set(nv, { sample: v, sheet: sname });
          // si viene en equivalencias (antiguo)
          if (state.equivalencias.has(nv)) {
            const newKey = state.equivalencias.get(nv);
            if (state.catalogIndex.has(newKey)) figuresFound.set(newKey, { sample: v, sheet: sname, via: "equiv" });
          }
        }
      }
      break;
    }
  }

  return Array.from(figuresFound.keys()).map((k) => ({
    key: k,
    ...state.catalogIndex.get(k),
    evidence: figuresFound.get(k)
  }));
}

function collectUnknownFigures(wb) {
  // Escanea valores de celdas para encontrar términos que parezcan "figuras" pero no estén en catálogo
  // (heurística: contienen palabras clave)
  const keywords = ["figura", "gestion", "produccion", "soporte", "redes", "mecatronica", "electro", "hosteleria", "climatizacion", "turistica", "seguridad", "cuidado", "arte", "diseno", "datos"]; 
  const candidateSheets = detectCandidateSheets(wb);

  const unknown = new Map(); // norm -> sample
  for (const sname of candidateSheets) {
    const grid = sheetTo2D(wb, sname);
    if (!grid || grid.length === 0) continue;

    for (let r = 0; r < Math.min(200, grid.length); r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        const nt = normalizeText(cell);
        if (!nt || nt.length < 8) continue;
        if (state.catalogIndex.has(nt)) continue;
        const hit = keywords.some((k) => nt.includes(k));
        if (!hit) continue;

        // si viene en equivalencias, no es desconocido
        if (state.equivalencias.has(nt)) continue;

        // guarda muestra
        if (!unknown.has(nt)) unknown.set(nt, { sample: cell, sheet: sname });
        if (unknown.size >= 25) return Array.from(unknown.entries()).map(([k, v]) => ({ key: k, ...v }));
      }
    }
  }
  return Array.from(unknown.entries()).map(([k, v]) => ({ key: k, ...v }));
}

async function loadEquivalencias(file) {
  state.equivalencias.clear();
  if (!file) return;

  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    // espera columnas: anterior,nueva
    for (const line of lines.slice(0, 1000)) {
      const parts = line.split(",");
      if (parts.length < 2) continue;
      const oldKey = normalizeText(parts[0]);
      const newKey = normalizeText(parts[1]);
      if (oldKey && newKey) state.equivalencias.set(oldKey, newKey);
    }
    return;
  }

  const wb = await readWorkbook(file);
  const sheet = wb.SheetNames[0];
  const grid = sheetTo2D(wb, sheet);
  if (!grid || grid.length === 0) return;

  // intenta detectar encabezados
  let colOld = 0;
  let colNew = 1;
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r].map((x) => normalizeText(x));
    const iOld = row.findIndex((x) => ["anterior", "figura anterior", "00086", "catalogo anterior"].includes(x));
    const iNew = row.findIndex((x) => ["nueva", "figura nueva", "00065", "vigente"].includes(x));
    if (iOld >= 0 && iNew >= 0) {
      colOld = iOld;
      colNew = iNew;
      // datos desde la fila siguiente
      for (let rr = r + 1; rr < grid.length; rr++) {
        const oldKey = normalizeText(grid[rr][colOld]);
        const newKey = normalizeText(grid[rr][colNew]);
        if (oldKey && newKey) state.equivalencias.set(oldKey, newKey);
      }
      return;
    }
  }

  // fallback: 2 primeras columnas
  for (let rr = 0; rr < grid.length; rr++) {
    const oldKey = normalizeText(grid[rr][0]);
    const newKey = normalizeText(grid[rr][1]);
    if (oldKey && newKey) state.equivalencias.set(oldKey, newKey);
  }
}

function renderResultados() {
  const el = $("resultados");
  const res = state.results;

  // KPIs
  $("kpiFiles").textContent = String(state.files.length);

  const figurasUnicas = new Set();
  let crit = 0;
  for (const r of res) {
    for (const f of r.figurasVigentes) figurasUnicas.add(f.key);
    crit += r.criticas.length;
  }
  $("kpiFig").textContent = String(figurasUnicas.size);
  $("kpiCrit").textContent = String(crit);

  if (res.length === 0) {
    el.innerHTML = `<div class="muted">Aún no hay resultados. Sube un Excel.</div>`;
    return;
  }

  const blocks = [];
  for (const r of res) {
    const okCount = r.figurasVigentes.length;
    const unkCount = r.criticas.length;

    blocks.push(`
      <div style="margin-bottom:14px">
        <div class="row">
          <span class="badge ok">Archivo</span>
          <b>${escapeHtml(r.fileName)}</b>
          <span class="badge ok">Vigentes: ${okCount}</span>
          <span class="badge ${unkCount ? "crit" : "ok"}">Críticas: ${unkCount}</span>
        </div>

        ${okCount ? renderTableVigentes(r.figurasVigentes) : `<div class="muted" style="margin-top:8px">No se detectaron figuras vigentes en el archivo (o no están visibles como texto).</div>`}

        ${unkCount ? renderTableCriticas(r.criticas) : ``}
      </div>
    `);
  }

  el.innerHTML = blocks.join("\n");

  // reporte para descarga
  state.reportText = buildReportText();
}

function renderTableVigentes(figs) {
  const rows = figs
    .sort((a, b) => (a.area + a.familia + a.figura).localeCompare(b.area + b.familia + b.figura))
    .map((f) => {
      const ev = f.evidence ? `(${escapeHtml(f.evidence.sheet)}${f.evidence.via ? " · equiv" : ""})` : "";
      return `<tr><td>${escapeHtml(f.area)}</td><td>${escapeHtml(f.familia)}</td><td>${escapeHtml(f.figura)}</td><td class="muted">${ev}</td></tr>`;
    })
    .join("");

  return `
    <table class="table">
      <thead><tr><th>Área</th><th>Familia</th><th>Figura profesional</th><th>Evidencia</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTableCriticas(criticas) {
  const rows = criticas
    .map((c) => {
      let accion = "Revisar: no coincide con catálogo 00065.";
      const equiv = state.equivalencias.get(c.key);
      if (equiv && state.catalogIndex.has(equiv)) {
        const target = state.catalogIndex.get(equiv).figura;
        accion = `Posible equivalencia: “${escapeHtml(target)}”.`;
      }
      return `<tr><td>${escapeHtml(c.sample)}</td><td>${escapeHtml(c.sheet)}</td><td><span class="badge crit">Crítica</span> ${accion}</td></tr>`;
    })
    .join("");

  return `
    <div style="margin-top:10px" class="row"><span class="badge crit">Observaciones críticas</span><span class="muted">(posibles figuras no vigentes / denominaciones no homologadas)</span></div>
    <table class="table">
      <thead><tr><th>Texto encontrado</th><th>Hoja</th><th>Acción sugerida</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildReportText() {
  const lines = [];
  lines.push("PLANTILLA ÓPTIMA | REPORTE DE VALIDACIÓN\n");
  lines.push(`Norma vigente (catálogo figuras): ${PO_CONFIG.normaVigente.codigo}`);
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push("\n==================================================\n");

  for (const r of state.results) {
    lines.push(`Archivo: ${r.fileName}`);
    lines.push(`- Figuras vigentes detectadas: ${r.figurasVigentes.length}`);
    for (const f of r.figurasVigentes) {
      lines.push(`  • ${f.area} / ${f.familia} / ${f.figura} ${f.evidence ? `[${f.evidence.sheet}]` : ""}`);
    }
    lines.push(`- Observaciones críticas: ${r.criticas.length}`);
    for (const c of r.criticas) {
      const equiv = state.equivalencias.get(c.key);
      if (equiv && state.catalogIndex.has(equiv)) {
        lines.push(`  • ${c.sample} [${c.sheet}] -> Sugerencia equivalencia: ${state.catalogIndex.get(equiv).figura}`);
      } else {
        lines.push(`  • ${c.sample} [${c.sheet}] -> No coincide con catálogo 00065`);
      }
    }
    lines.push("\n--------------------------------------------------\n");
  }

  lines.push("Notas:");
  lines.push("- Si tienes el archivo oficial de equivalencias (DNB), súbelo en el campo 'Equivalencias' para mejorar la detección de cambios de denominación.");
  lines.push("- Si tus figuras están en celdas con validación/lista o en imágenes, puede que no se detecten como texto.");
  lines.push("");

  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearAll() {
  state.files = [];
  state.results = [];
  state.reportText = "";
  $("fileDTD").value = "";
  $("fileNecesidades").value = "";
  $("fileEquiv").value = "";
  $("fileOtros").value = "";
  renderResultados();
}

function updateBTP() {
  const p = Number($("btpParalelos").value || 0);
  const docentes = Math.max(0, Math.round(2 * p));
  $("btpDoc").textContent = String(docentes);
}

async function handleFilesSelected(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;

  state.files.push(...files);

  for (const file of files) {
    // Solo procesamos excels aquí
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) continue;

    try {
      const wb = await readWorkbook(file);
      const figs = findFiguresInWorkbook(wb);
      const unknown = collectUnknownFigures(wb);

      state.results.push({
        fileName: file.name,
        figurasVigentes: figs,
        criticas: unknown
      });
    } catch (err) {
      state.results.push({
        fileName: file.name,
        figurasVigentes: [],
        criticas: [{ key: "error", sample: `Error leyendo archivo: ${err.message || err}`, sheet: "-" }]
      });
    }
  }

  renderResultados();
}

function wireUI() {
  renderCatalogo();
  renderGlosario();
  renderResultados();
  updateBTP();

  $("btpParalelos").addEventListener("input", updateBTP);
  $("btpEst").addEventListener("input", updateBTP);

  $("fileEquiv").addEventListener("change", async (e) => {
    await loadEquivalencias(e.target.files?.[0]);
    // Recalcula resultados existentes (para sugerencias)
    renderResultados();
  });

  $("fileDTD").addEventListener("change", (e) => handleFilesSelected(e.target.files));
  $("fileNecesidades").addEventListener("change", (e) => handleFilesSelected(e.target.files));
  $("fileOtros").addEventListener("change", (e) => handleFilesSelected(e.target.files));

  $("btnDownload").addEventListener("click", () => {
    const txt = state.reportText || buildReportText();
    downloadText("PO-reporte-validacion.txt", txt);
  });

  $("btnClear").addEventListener("click", clearAll);
}

wireUI();
