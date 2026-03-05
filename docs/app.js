
document.addEventListener("DOMContentLoaded",()=>{

const input=document.getElementById("fileInput")
const btn=document.getElementById("btnValidate")
const diag=document.getElementById("btnDiag")
const summary=document.getElementById("validationSummary")

btn.disabled=false

btn.onclick=async()=>{

 if(!input.files.length){
  alert("Seleccione un archivo Excel")
  return
 }

 const file=input.files[0]

 const reader=new FileReader()

 reader.onload=e=>{

  const data=new Uint8Array(e.target.result)
  const wb=XLSX.read(data,{type:'array'})
  const sheets=wb.SheetNames

  summary.innerHTML="<h3>Hojas detectadas</h3>"+sheets.join("<br>")

 }

 reader.readAsArrayBuffer(file)

}

diag.onclick=()=>{

 alert("Diagnóstico\nXLSX cargado: "+(typeof XLSX!=='undefined'))

}

})
