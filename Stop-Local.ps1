# Stop only CareerPilot processes launched with absolute paths by Start-Local.ps1.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$servers = @(Get-NetTCPConnection -State Listen -LocalPort 3000,8000 -ErrorAction SilentlyContinue | ForEach-Object {
    $serverProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess)
    if (!$serverProcess.CommandLine -or $serverProcess.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or $serverProcess.CommandLine -notmatch 'uvicorn main:app|next[\\/]dist[\\/]bin[\\/]next') {
        throw "Port $($_.LocalPort) is not a recognised CareerPilot process; it was left running."
    }
    $serverProcess
})
$servers | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
Write-Host 'CareerPilot local services stopped.'
