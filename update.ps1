param([string]$Url)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip  = "$env:TEMP\fab_update.zip"
$tmp  = "$env:TEMP\fab_update_extracted"

Write-Host "[update] Descargando $Url"
Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force

# GitHub ZIP tiene una carpeta raíz con el nombre del repo + rama
$inner = Get-ChildItem $tmp | Select-Object -First 1 -ExpandProperty FullName

Write-Host "[update] Copiando archivos a $root"
# Copiar src y frontend/src (no node_modules, no dist, no .env)
Copy-Item "$inner\src"          "$root\src"          -Recurse -Force
Copy-Item "$inner\frontend\src" "$root\frontend\src" -Recurse -Force
if (Test-Path "$inner\frontend\index.html") {
    Copy-Item "$inner\frontend\index.html" "$root\frontend\index.html" -Force
}
if (Test-Path "$inner\package.json") {
    Copy-Item "$inner\package.json" "$root\package.json" -Force
}

Write-Host "[update] Compilando frontend"
Set-Location "$root\frontend"
npm install --silent
npm run build

Write-Host "[update] Listo. El proceso principal reiniciará."
