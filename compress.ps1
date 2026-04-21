# Script to compress deploy-package including hidden files
# Run this after .\deploy.ps1

Write-Host "Compressing deploy-package folder..." -ForegroundColor Cyan

# Remove old zip if exists
if (Test-Path "deploy-package.zip") {
    Remove-Item "deploy-package.zip" -Force
}

# Use System.IO.Compression which handles hidden files correctly
Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = Join-Path (Get-Location) "deploy-package"
$destination = Join-Path (Get-Location) "deploy-package.zip"

try {
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $source,
        $destination,
        [System.IO.Compression.CompressionLevel]::Fastest,
        $false
    )
    
    Write-Host "Done! Compression complete: deploy-package.zip" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next step: Run .\full-deploy.ps1" -ForegroundColor Yellow
}
catch {
    $errorMsg = $_.Exception.Message
    Write-Error "Compression failed: $errorMsg"
}
