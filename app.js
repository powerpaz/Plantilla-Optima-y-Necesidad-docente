
function procesarArchivo() {
    const file = document.getElementById('excelInput').files[0];
    const output = document.getElementById('output');
    output.textContent = "";

    if (!file) {
        output.textContent = "Seleccione un archivo Excel.";
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Simulación: se espera que figura esté en celda B2 hoja NOMINE
        const sheet = workbook.Sheets["NOMINE"];
        if (!sheet) {
            output.textContent = "No existe hoja NOMINE.";
            return;
        }

        const figura = sheet["B2"] ? sheet["B2"].v.toString().toUpperCase().trim() : "";

        const vigente = window.PO_CONFIG.catalogo_vigente_00065;
        const anterior = window.PO_CONFIG.catalogo_00086;
        const equivalencias = window.PO_CONFIG.equivalencias;

        if (!figura) {
            output.textContent = "No se encontró figura profesional en B2.";
            return;
        }

        if (vigente.includes(figura)) {
            output.textContent += "Figura vigente validada según 00065.\n";
        }
        else if (anterior.includes(figura)) {
            if (equivalencias[figura]) {
                output.textContent += "Figura en transición. Equivalente actual: " + equivalencias[figura] + "\n";
            } else {
                output.textContent += "CRÍTICO: Figura pertenece a 00086 y no tiene equivalencia.\n";
            }
        }
        else {
            output.textContent += "CRÍTICO: Figura no consta en catálogos oficiales.\n";
        }
    };
    reader.readAsArrayBuffer(file);
}
