PO-App v20 - revisión masiva DTD

Uso:
1. Abrir index.html en navegador.
2. Cargar el archivo maestro "Necesidades_excesos_docentes ZONA 7.xlsx".
3. Cargar una o varias matrices DTD (.xlsx/.xlsm).
4. Pulsar "Validar lote".
5. Descargar reporte XLSX, JSON o PDF.

Reglas de revisión implementadas:
- Lee AMIE desde columna M, fila 3 en adelante, buscando la hoja con mayor cantidad de códigos.
- Cruza AMIE del maestro contra AMIE de cada matriz.
- Hoja Nómina:
  * B5 debe contener un AMIE válido.
  * Revisa la tabla de necesidad desde E11 hacia abajo; <10 = error, 10-24 = advertencia, 25 = correcto.
  * Revisa filas activas desde A23.
- Hoja Par_PO:
  * B3 debe contener AMIE válido.
  * Cuenta filas activas desde A23.
  * Revisa estudiantes desde E23; <15 = error, 15-19 = advertencia.
- Hoja DIS_TRA:
  * Revisa fila 6 desde K en adelante; Tronco común debe ser 0.
  * Cuenta columnas activas desde K usando filas 7, 8 y 9.
  * Compara el total contra los paralelos activos de Par_PO.

Nota:
La parte de "visto verde" se aproximó por umbral de estudiantes, porque al leer Excel desde navegador no se recupera de forma confiable el icono de formato condicional.
