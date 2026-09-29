param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$clusterRoot = Join-Path $tempRoot ('ranti-test-pg-' + [guid]::NewGuid().ToString('N'))
$dataDir = Join-Path $clusterRoot 'data'
$serverStarted = $false
$testExitCode = 1
$previousUrl = $env:TEST_DATABASE_URL
$previousMarker = $env:RANTI_EPHEMERAL_DB

foreach ($binary in @('initdb.exe', 'pg_ctl.exe', 'createdb.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $binary))) {
        throw "No se encontró $binary en $PostgresBin. Usa -PostgresBin para indicar la instalación."
    }
}

New-Item -ItemType Directory -Path $clusterRoot | Out-Null
try {
    # Puerto disponible para una instancia exclusiva de esta ejecución.
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()

    & (Join-Path $PostgresBin 'initdb.exe') -D $dataDir -U ranti_test -A trust --no-locale --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar PostgreSQL temporal.' }
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -l (Join-Path $clusterRoot 'postgres.log') -o "-h 127.0.0.1 -p $port -F" -w start
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL temporal.' }
    $serverStarted = $true
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $port -U ranti_test ranti_test
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base de pruebas.' }

    $env:TEST_DATABASE_URL = "postgres://ranti_test@127.0.0.1:$port/ranti_test"
    $env:RANTI_EPHEMERAL_DB = '1'
    Push-Location (Join-Path $repoRoot 'server')
    try {
        npm test
        $testExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    $env:TEST_DATABASE_URL = $previousUrl
    $env:RANTI_EPHEMERAL_DB = $previousMarker
    if ($serverStarted) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataDir -m immediate -w stop
        if ($LASTEXITCODE -ne 0) { throw "No se pudo detener la instancia temporal en $clusterRoot. Se conserva su directorio." }
    }
    # Borrar exclusivamente la carpeta temporal generada por esta ejecución.
    $resolvedRoot = [IO.Path]::GetFullPath($clusterRoot)
    if ((Split-Path -Parent $resolvedRoot).TrimEnd('\') -ne $tempRoot.TrimEnd('\') -or
        (Split-Path -Leaf $resolvedRoot) -notmatch '^ranti-test-pg-[a-f0-9]{32}$') {
        throw 'Se rechazó la limpieza: la ruta temporal no coincide con la esperada.'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}

exit $testExitCode
