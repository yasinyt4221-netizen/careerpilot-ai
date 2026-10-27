# Start the full local app with CV uploads and CPU semantic analysis enabled.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$python = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$nextCli = Join-Path $frontendDirectory 'node_modules\next\dist\bin\next'
$logDirectory = Join-Path $projectRoot '.local'

if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath $nextCli)) {
    throw 'Install the backend and frontend dependencies using README.md before running this script.'
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

# Check every occupied port before stopping any process. Never stop other projects.
$existing = @(Get-NetTCPConnection -State Listen -LocalPort 3000,8000 -ErrorAction SilentlyContinue | ForEach-Object {
    $serverProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess)
    if (!$serverProcess.CommandLine -or $serverProcess.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or $serverProcess.CommandLine -notmatch 'uvicorn main:app|next[\\/]dist[\\/]bin[\\/]next') {
        throw "Port $($_.LocalPort) belongs to another or unrecognised process. Close it before starting CareerPilot."
    }
    $serverProcess
})
$existing | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }

$settings = @{
    STATIC_EXPORT = 'false'
    NEXT_PUBLIC_DEMO_MODE = 'false'
    NEXT_PUBLIC_HOSTED_MODE = 'false'
    NEXT_PUBLIC_BASE_PATH = ''
    NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000'
    PUBLIC_DEMO_ONLY = 'false'
    HOSTED_MODE = 'false'
    SEMANTIC_ENABLED = 'true'
    CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
}
$previousSettings = @{}
$startedProcesses = @()

function Wait-LocalUrl([string]$Url) {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        try { Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null; return }
        catch { Start-Sleep -Milliseconds 250 }
    } while ((Get-Date) -lt $deadline)
    throw "Could not start $Url. Check the logs in $logDirectory."
}

try {
    foreach ($key in $settings.Keys) {
        $previousSettings[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Write-Host 'Checking the cached local AI model...'
    Push-Location $backendDirectory
    try {
        & $python -c "from semantic import get_semantic_provider; get_semantic_provider().embed(['Local model readiness check']); print('Local AI model ready.')"
        if ($LASTEXITCODE -ne 0) { throw 'Prepare the model first: backend\.venv\Scripts\python.exe backend\prepare_semantic_model.py' }
    } finally { Pop-Location }

    $apiArguments = '-m uvicorn main:app --app-dir "' + $backendDirectory + '" --host 127.0.0.1 --port 8000'
    $apiProcess = Start-Process -FilePath $python -ArgumentList $apiArguments -WorkingDirectory $backendDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'backend.log') -RedirectStandardError (Join-Path $logDirectory 'backend.err.log') -PassThru
    $startedProcesses += $apiProcess
    Wait-LocalUrl 'http://127.0.0.1:8000/api/health'

    Write-Host 'Building the local frontend with uploads enabled...'
    Push-Location $frontendDirectory
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed.' }
    } finally { Pop-Location }

    $frontendArguments = '"' + $nextCli + '" start --hostname 127.0.0.1 --port 3000'
    $webProcess = Start-Process -FilePath $node -ArgumentList $frontendArguments -WorkingDirectory $frontendDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'frontend.log') -RedirectStandardError (Join-Path $logDirectory 'frontend.err.log') -PassThru
    $startedProcesses += $webProcess
    Wait-LocalUrl 'http://127.0.0.1:3000/workspace'

    $payload = @{ cv_text = 'Synthetic readiness check: built Python dashboards and SQL reports.'; job_description = 'Data Analyst. Required: Python and SQL. Build reporting dashboards and explain findings to business stakeholders.' } | ConvertTo-Json
    $review = Invoke-RestMethod 'http://127.0.0.1:8000/api/matches/compare' -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 30
    if ($review.mode -ne 'hybrid') { throw 'The backend started, but the local AI model is not active.' }
    @(Get-NetTCPConnection -State Listen -LocalPort 3000,8000 | Select-Object LocalPort,OwningProcess) | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDirectory 'local-servers.json')
    Write-Host ''
    Write-Host 'CareerPilot is running locally. CV uploads and local AI review are enabled.'
    Write-Host 'Open: http://localhost:3000/workspace'
    Write-Host 'Stop: .\Stop-Local.ps1'
} catch {
    # The Windows virtualenv launcher may have a separate listening child process.
    Get-NetTCPConnection -State Listen -LocalPort 3000,8000 -ErrorAction SilentlyContinue | ForEach-Object {
        $failedProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess)
        if ($failedProcess.CommandLine -and $failedProcess.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $failedProcess.CommandLine -match 'uvicorn main:app|next[\\/]dist[\\/]bin[\\/]next') {
            Stop-Process -Id $failedProcess.ProcessId -ErrorAction SilentlyContinue
        }
    }
    $startedProcesses | ForEach-Object { Stop-Process -Id $_.Id -ErrorAction SilentlyContinue }
    throw
} finally {
    foreach ($key in $previousSettings.Keys) { [Environment]::SetEnvironmentVariable($key, $previousSettings[$key], 'Process') }
}
