<#
.SYNOPSIS
    ZWM Daily 10x Brief — PowerShell wrapper for Windows Task Scheduler.
.DESCRIPTION
    Windows equivalent of run-daily.sh. Changes to the script directory,
    loads .env, and runs zwm-daily.mjs.
.NOTES
    To schedule with Windows Task Scheduler (equivalent of cron):
      schtasks /create /tn "ZWM Daily Brief" /tr "powershell -ExecutionPolicy Bypass -File C:\path\to\zwm-daily\run-daily.ps1" /sc daily /st 06:00
    To remove:
      schtasks /delete /tn "ZWM Daily Brief" /f
#>

$ErrorActionPreference = 'Stop'

# Change to script directory (fixes "ran in wrong directory" problem)
Set-Location $PSScriptRoot

# Load .env if it exists in the script directory
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $trimmed = $line.Trim()
        if ($trimmed -and -not $trimmed.StartsWith('#')) {
            $eqIndex = $trimmed.IndexOf('=')
            if ($eqIndex -gt 0) {
                $key = $trimmed.Substring(0, $eqIndex).Trim()
                $val = $trimmed.Substring($eqIndex + 1).Trim()
                [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
            }
        }
    }
} else {
    Write-Warning ".env file not found at: $envFile"
    Write-Warning "Copy .env.example to .env inside the zwm-daily/ folder and add your API key."
    Write-Warning "Do NOT place .env in your home directory — it must be inside zwm-daily/"
    exit 1
}

# Verify node is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed or not in PATH. Install from https://nodejs.org/"
    exit 1
}

# Verify dependencies are installed
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Warning "node_modules/ not found. Running 'npm install' first..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed. Check your network and try again."
        exit 1
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "[$(Get-Date -Format 'o')] Starting ZWM Daily Brief"
Write-Host "=========================================="

node zwm-daily.mjs
$exitCode = $LASTEXITCODE

Write-Host "[$(Get-Date -Format 'o')] Brief generation complete (exit code: $exitCode)"
exit $exitCode
