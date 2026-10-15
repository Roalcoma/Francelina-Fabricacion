# Instalador de Fabricación para un cliente nuevo.
# Uso (PowerShell como administrador, desde la carpeta de la app):
#   powershell -ExecutionPolicy Bypass -File instalar.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js no está instalado. Descárgalo de https://nodejs.org (versión LTS) y vuelve a ejecutar.'
}

function Preguntar($texto, $defecto = '') {
    $sufijo = if ($defecto) { " [$defecto]" } else { '' }
    $r = Read-Host "$texto$sufijo"
    if ([string]::IsNullOrWhiteSpace($r)) { $defecto } else { $r.Trim() }
}

# ── 1. Configuración (.env) ─────────────────────────────────
if (Test-Path "$root\.env") {
    Write-Host '[instalar] Ya existe .env, se conserva.'
} else {
    Write-Host "`n[instalar] Datos de conexión al SQL Server de ICG"
    $passSeguro = Read-Host 'Contraseña SQL' -AsSecureString
    $vals = [ordered]@{
        FAB_HOST        = Preguntar 'Servidor SQL' '127.0.0.1'
        FAB_PORT        = Preguntar 'Puerto SQL' '1433'
        FAB_USER        = Preguntar 'Usuario SQL' 'sa'
        FAB_PASS        = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($passSeguro))
        FAB_DB          = Preguntar 'Base de fabricación (se crea si no existe)' 'FABRICACION'
        FAB_LOCO_DB     = Preguntar 'Base del ERP ICG (artículos, recetas, stock)'
        FAB_USUARIOS_DB = Preguntar 'Base con la tabla USUARIOS' 'GENERAL'
        FAB_ADMINS      = Preguntar 'CODUSUARIO de los administradores, separados por coma'
        PORT            = Preguntar 'Puerto web de la app' '3000'
    }
    $lineas = $vals.GetEnumerator() | ForEach-Object { "$($_.Key)='$($_.Value)'" }
    [IO.File]::WriteAllLines("$root\.env", [string[]]$lineas, (New-Object Text.UTF8Encoding $false))
    Write-Host '[instalar] .env creado.'
}

# ── 2. Dependencias y compilación (se omite si el paquete ya viene compilado) ──
$precompilado = (Test-Path "$root\dist\index.js") -and (Test-Path "$root\frontend\dist\index.html") -and (Test-Path "$root\node_modules\express")
if ($precompilado) {
    Write-Host "`n[instalar] Paquete precompilado: no hace falta instalar dependencias ni compilar."
} else {
    Write-Host "`n[instalar] Instalando dependencias y compilando (puede tardar unos minutos)"
    npm install --silent;               if ($LASTEXITCODE) { throw 'npm install (backend) falló' }
    npx tsc;                            if ($LASTEXITCODE) { throw 'Compilación del backend falló' }
    Set-Location "$root\frontend"
    npm install --silent;               if ($LASTEXITCODE) { throw 'npm install (frontend) falló' }
    npm run build;                      if ($LASTEXITCODE) { throw 'Compilación del frontend falló' }
    Set-Location $root
}

# ── 3. Primer arranque: crea la base, aplica migraciones y valida ICG ──
$puerto = ((Get-Content "$root\.env" | Where-Object { $_ -match '^PORT=' }) -replace "^PORT=|'", '')
if (-not $puerto) { $puerto = '3000' }
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
Write-Host "`n[instalar] Primer arranque de prueba en el puerto $puerto"
$proc = Start-Process node -ArgumentList 'dist\index.js' -WorkingDirectory $root -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$root\logs\primer-inicio.log" -RedirectStandardError "$root\logs\primer-inicio-error.log"
$ok = $false
for ($i = 0; $i -lt 60 -and -not $proc.HasExited; $i++) {
    Start-Sleep 1
    try { Invoke-WebRequest "http://localhost:$puerto/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true; break } catch {}
}
if (-not $proc.HasExited) { Stop-Process $proc -Force }
Get-Content "$root\logs\primer-inicio.log", "$root\logs\primer-inicio-error.log" -Encoding UTF8 -ErrorAction SilentlyContinue
if (-not $ok) { throw 'La app no pudo arrancar. Revisa el mensaje de arriba y el archivo .env, luego vuelve a ejecutar instalar.ps1' }
Write-Host '[instalar] Arranque correcto: base de datos lista.'

# ── 4. Servicio de Windows (opcional, requiere NSSM en el PATH) ──
$servicio = 'Fabricacion'
if (Get-Command nssm -ErrorAction SilentlyContinue) {
    if ((Preguntar '¿Dejar la app como servicio de Windows que arranca sola? (s/n)' 's') -eq 's') {
        nssm status $servicio *> $null
        if ($LASTEXITCODE) {
            nssm install $servicio (Get-Command node).Source "$root\dist\index.js" | Out-Null
            nssm set $servicio AppDirectory $root | Out-Null
            nssm set $servicio AppStdout "$root\logs\salida.log" | Out-Null
            nssm set $servicio AppStderr "$root\logs\error.log" | Out-Null
            nssm set $servicio Start SERVICE_AUTO_START | Out-Null
        }
        nssm restart $servicio | Out-Null
        Write-Host "[instalar] Servicio '$servicio' instalado e iniciado."
    }
} else {
    Write-Host "`nPara iniciar la app:  node dist\index.js"
    Write-Host 'Recomendado: instala NSSM (https://nssm.cc) y vuelve a ejecutar este script para dejarla como servicio.'
}

Write-Host "`nListo. Abre http://localhost:$puerto"
