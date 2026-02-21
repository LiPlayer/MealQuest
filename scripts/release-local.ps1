$ErrorActionPreference = "Stop"

Write-Host "[release] Running local release gate..."
node .\scripts\release-local.js
