
function validar(){
  const files = document.getElementById("fileInput").files;
  const output = document.getElementById("output");
  output.textContent = "";

  const cfg = window.PO_CHECK_CONFIG.catalogos;
  const vigente = cfg.vigente_2024_00065.map(x => x.toUpperCase());
  const anterior = cfg.catalogo_2023_00086.map(x => x.toUpperCase());
  const equivalencias = cfg.equivalencias;

  for (let file of files){
    const nombre = file.name.toUpperCase();

    for (let figura of anterior){
      if (!vigente.includes(figura)){
        if (equivalencias[figura]){
          output.textContent += `[ADVERTENCIA] ${figura} cambió a ${equivalencias[figura]}\n`;
        } else {
          output.textContent += `[CRITICO] ${figura} no vigente según 2024-00065-A\n`;
        }
      }
    }

    output.textContent += `[INFO] Validación normativa completada para ${nombre}\n`;
  }
}
