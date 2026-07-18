[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$tailscale = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"

if (-not (Test-Path $tailscale)) {
    throw "Tailscale is not installed. Install Tailscale.Tailscale first, then sign in."
}

$statusJson = & $tailscale status --json 2>$null
if ($LASTEXITCODE -ne 0 -or -not $statusJson) {
    & $tailscale up
    $statusJson = & $tailscale status --json
}
$status = $statusJson | ConvertFrom-Json
if ($status.BackendState -ne "Running") {
    throw "Tailscale is not connected. Complete the sign-in flow and run this script again."
}

$dnsName = $status.Self.DNSName.TrimEnd(".")
if (-not $dnsName) {
    throw "Tailscale did not return a MagicDNS name. Enable MagicDNS in the tailnet."
}

$publicUrl = "https://$dnsName"
$envFile = Join-Path $repoRoot ".env"
$envText = Get-Content $envFile -Raw
if ($envText -match "(?m)^PUBLIC_BASE_URL=") {
    $envText = $envText -replace "(?m)^PUBLIC_BASE_URL=.*$", "PUBLIC_BASE_URL=$publicUrl"
}
else {
    $envText += "`r`nPUBLIC_BASE_URL=$publicUrl`r`n"
}
[System.IO.File]::WriteAllText($envFile, $envText, [System.Text.UTF8Encoding]::new($false))

Push-Location $repoRoot
try {
    docker compose up -d --force-recreate gateway frontend forgejo spaces-runner
    & $tailscale serve --bg --yes http://127.0.0.1:8090
    & $tailscale serve status
}
finally {
    Pop-Location
}

Write-Host "OpenFace is available inside your tailnet: $publicUrl"
