/* Geoportal AMIE - app.js
   - CSV local por defecto: data/instituciones_geo_fixed.csv
   - Supabase opcional (si config.js define window.env.SUPABASE_URL & SUPABASE_KEY)
*/
(function(){
  const CSV_PATH = "data/instituciones_geo_fixed.csv";

  const els = {
    status: document.getElementById("status"),
    search: document.getElementById("searchBox"),
    prov: document.getElementById("provSelect"),
    canton: document.getElementById("cantonSelect"),
    parr: document.getElementById("parrSelect"),
    tipo: document.getElementById("tipoSelect"),
    sost: document.getElementById("sostSelect"),
    tbody: document.getElementById("tbody"),
    btnClear: document.getElementById("btnClear"),
    btnReset: document.getElementById("btnResetFilters"),
    kpiTotal: document.getElementById("kpiTotal"),
    kpiMatriz: document.getElementById("kpiMatriz"),
    kpiEstablec: document.getElementById("kpiEstablec"),
    kpiSosten: document.getElementById("kpiSosten"),
  };

  // ---- Map
  const map = L.map("map", { preferCanvas:true }).setView([-1.5, -78.5], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OSM" }).addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const selected = new Map(); // amie -> true

  let allRows = [];
  let filteredRows = [];

  function normalize(s){
    return (s ?? "").toString().trim();
  }
  function normKey(s){
    return normalize(s).toLowerCase();
  }
  function uniq(arr){
    return Array.from(new Set(arr)).filter(Boolean).sort((a,b)=>a.localeCompare(b,"es"));
  }
  function setStatus(msg){ els.status.textContent = msg; }

  function parseBoolLike(v){
    const t = normKey(v);
    return t === "1" || t === "true" || t === "si" || t === "sí" || t === "matriz";
  }

  // ---- Data loading
  async function loadData(){
    const env = window.env || {};
    const hasSupabase = env.SUPABASE_URL && env.SUPABASE_KEY;

    if(hasSupabase){
      setStatus("Leyendo desde Supabase…");
      try{
        const rows = await loadFromSupabase(env);
        if(rows.length){
          allRows = rows;
          setStatus(`Listo: ${rows.length} registros (Supabase).`);
          initUI();
          return;
        }
        setStatus("Supabase sin datos; usando CSV local…");
      }catch(e){
        console.warn(e);
        setStatus("Error Supabase; usando CSV local…");
      }
    }

    setStatus("Leyendo CSV local…");
    Papa.parse(CSV_PATH, {
      header: true,
      skipEmptyLines: true,
      complete: (res)=>{
        allRows = (res.data || []).map(cleanRow).filter(r => r.amie && isFinite(r.lat) && isFinite(r.lon));
        setStatus(`Listo: ${allRows.length} registros (CSV).`);
        initUI();
      },
      error: (err)=>{
        console.error(err);
        setStatus("No se pudo leer el CSV. Revisa /data/instituciones_geo_fixed.csv");
      }
    });
  }

  function cleanRow(r){
    // Campos esperados (minúsculas en la app)
    const amie = normalize(r.amie || r.AMIE || r.codamie || r.CODAMIE);
    const nombre = normalize(r.nombre || r.NOMBRE || r.nomb_inst || r.NOMB_INST);
    const tipo = normalize(r.tipo || r.TIPO);
    const sostenimiento = normalize(r.sostenimiento || r.SOSTENIMIENTO);
    const provincia = normalize(r.provincia || r.PROVINCIA);
    const canton = normalize(r.canton || r.CANTON);
    const parroquia = normalize(r.parroquia || r.PARROQUIA);
    const lat = Number(r.lat ?? r.LAT ?? r.latitude ?? r.LATITUD);
    const lon = Number(r.lon ?? r.LON ?? r.longitude ?? r.LONGITUD);
    const matriz = normalize(r.matriz || r.MATRIZ); // opcional
    return { amie, nombre, tipo, sostenimiento, provincia, canton, parroquia, lat, lon, matriz };
  }

  async function loadFromSupabase(env){
    // Supabase REST: /rest/v1/<table>?select=*
    const table = env.TABLE || "instituciones";
    const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=*`;
    const resp = await fetch(url, {
      headers:{
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Accept": "application/json"
      }
    });
    if(!resp.ok) throw new Error(`Supabase HTTP ${resp.status}`);
    const data = await resp.json();
    return (data || []).map(cleanRow).filter(r => r.amie && isFinite(r.lat) && isFinite(r.lon));
  }

  // ---- UI
  function fillSelect(selectEl, values, placeholder){
    selectEl.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    selectEl.appendChild(opt0);
    for(const v of values){
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    }
  }

  function initUI(){
    // Populate top-level filters
    fillSelect(els.prov, uniq(allRows.map(r=>r.provincia)), "Todas");
    fillSelect(els.tipo, uniq(allRows.map(r=>r.tipo)), "Todos");
    fillSelect(els.sost, uniq(allRows.map(r=>r.sostenimiento)), "Todos");
    fillSelect(els.canton, [], "Todos");
    fillSelect(els.parr, [], "Todos");

    // Events
    els.search.addEventListener("input", applyFilters);
    els.prov.addEventListener("change", ()=>{
      // cascade
      const prov = els.prov.value;
      const cantons = prov ? uniq(allRows.filter(r=>r.provincia===prov).map(r=>r.canton)) : uniq(allRows.map(r=>r.canton));
      fillSelect(els.canton, cantons, "Todos");
      fillSelect(els.parr, [], "Todos");
      applyFilters();
    });
    els.canton.addEventListener("change", ()=>{
      const prov = els.prov.value;
      const canton = els.canton.value;
      let rows = allRows;
      if(prov) rows = rows.filter(r=>r.provincia===prov);
      const parroqs = canton ? uniq(rows.filter(r=>r.canton===canton).map(r=>r.parroquia)) : uniq(rows.map(r=>r.parroquia));
      fillSelect(els.parr, parroqs, "Todos");
      applyFilters();
    });

    [els.parr, els.tipo, els.sost].forEach(el => el.addEventListener("change", applyFilters));

    els.btnClear.addEventListener("click", ()=>{
      selected.clear();
      renderSelectionBadge();
      renderTable(filteredRows);
      renderMarkers(filteredRows);
    });

    els.btnReset.addEventListener("click", ()=>{
      els.search.value = "";
      els.prov.value = "";
      els.canton.value = "";
      els.parr.value = "";
      els.tipo.value = "";
      els.sost.value = "";
      fillSelect(els.canton, [], "Todos");
      fillSelect(els.parr, [], "Todos");
      applyFilters();
    });

    applyFilters();
  }

  function applyFilters(){
    const q = normKey(els.search.value);
    const prov = els.prov.value;
    const canton = els.canton.value;
    const parr = els.parr.value;
    const tipo = els.tipo.value;
    const sost = els.sost.value;

    filteredRows = allRows.filter(r=>{
      if(prov && r.provincia !== prov) return false;
      if(canton && r.canton !== canton) return false;
      if(parr && r.parroquia !== parr) return false;
      if(tipo && r.tipo !== tipo) return false;
      if(sost && r.sostenimiento !== sost) return false;
      if(q){
        const hay = (normKey(r.amie) + " " + normKey(r.nombre)).includes(q);
        if(!hay) return false;
      }
      return true;
    });

    updateKPIs(filteredRows);
    renderTable(filteredRows);
    renderMarkers(filteredRows);
    fitIfReasonable(filteredRows);
  }

  function updateKPIs(rows){
    els.kpiTotal.textContent = rows.length.toLocaleString("es");
    const matrizCount = rows.filter(r=>parseBoolLike(r.matriz)).length;
    els.kpiMatriz.textContent = matrizCount.toLocaleString("es");
    els.kpiEstablec.textContent = (rows.length - matrizCount).toLocaleString("es");
    els.kpiSosten.textContent = uniq(rows.map(r=>r.sostenimiento)).length.toLocaleString("es");
  }

  function renderSelectionBadge(){
    els.btnClear.textContent = `Limpiar selección (${selected.size})`;
  }

  function renderTable(rows){
    els.tbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    for(const r of rows){
      const tr = document.createElement("tr");
      tr.dataset.amie = r.amie;
      if(selected.has(r.amie)) tr.classList.add("selected");
      tr.innerHTML = `
        <td>${escapeHtml(r.amie)}</td>
        <td>${escapeHtml(r.nombre)}</td>
        <td>${escapeHtml(r.provincia)}</td>
        <td>${escapeHtml(r.canton)}</td>
        <td>${escapeHtml(r.parroquia)}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td>${escapeHtml(r.sostenimiento)}</td>
      `;
      tr.addEventListener("click", ()=>{
        toggleSelect(r.amie);
        tr.classList.toggle("selected");
        focusOn(r);
      });
      frag.appendChild(tr);
    }
    els.tbody.appendChild(frag);
  }

  function toggleSelect(amie){
    if(selected.has(amie)) selected.delete(amie);
    else selected.set(amie, true);
    renderSelectionBadge();
  }

  function escapeHtml(s){
    return (s ?? "").toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function renderMarkers(rows){
    markerLayer.clearLayers();

    for(const r of rows){
      const isSel = selected.has(r.amie);
      const marker = L.circleMarker([r.lat, r.lon], {
        radius: isSel ? 8 : 6,
        weight: 1,
        fillOpacity: isSel ? 0.9 : 0.75
      });
      marker.bindPopup(`
        <div style="font-family:system-ui">
          <div style="font-weight:700">${escapeHtml(r.nombre)}</div>
          <div><b>AMIE:</b> ${escapeHtml(r.amie)}</div>
          <div>${escapeHtml(r.provincia)} · ${escapeHtml(r.canton)} · ${escapeHtml(r.parroquia)}</div>
          <div>${escapeHtml(r.tipo)} · ${escapeHtml(r.sostenimiento)}</div>
        </div>
      `);
      marker.on("click", ()=>{
        toggleSelect(r.amie);
        renderTable(filteredRows);
        renderMarkers(filteredRows);
      });
      marker.addTo(markerLayer);
    }
  }

  function focusOn(r){
    if(isFinite(r.lat) && isFinite(r.lon)){
      map.setView([r.lat, r.lon], 14, { animate:true });
    }
  }

  function fitIfReasonable(rows){
    if(rows.length === 0) return;
    if(rows.length === 1){
      focusOn(rows[0]);
      return;
    }
    if(rows.length > 1500) return; // no fitBounds gigante
    const latlngs = rows.map(r => [r.lat, r.lon]);
    const b = L.latLngBounds(latlngs);
    map.fitBounds(b.pad(0.12));
  }

  // ---- Boot
  loadData();
})();
