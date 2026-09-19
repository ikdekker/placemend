# Deploy script for Placemend PWA (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "Building production bundle for Placemend..."
npm run build

Write-Host "Ensuring remote directory exists on freshcoders.nl..."
ssh -p 48700 peter@freshcoders.nl "mkdir -p /var/www/freshcoders.nl/html/placemend/assets"

Write-Host "Uploading index.html and .htaccess..."
scp -P 48700 dist\index.html peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/index.html

# Copy .htaccess if exists, or create clean fallback for HTML5 history
if (Test-Path "dist\.htaccess") {
    scp -P 48700 dist\.htaccess peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/.htaccess
}

Write-Host "Uploading assets..."
scp -P 48700 -r dist\assets\* peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/assets/

Write-Host "Setting remote permissions..."
ssh -p 48700 peter@freshcoders.nl "chmod -R 755 /var/www/freshcoders.nl/html/placemend"

Write-Host "Deployment complete! Live at https://freshcoders.nl/placemend/"
