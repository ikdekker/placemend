# Deploy script for Placemend PWA (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "Building production bundle for Placemend..."
npm run build

Write-Host "Ensuring remote directories exist on freshcoders.nl..."
ssh -p 48700 peter@freshcoders.nl "mkdir -p /var/www/freshcoders.nl/html/placemend/assets /var/www/freshcoders.nl/html/placemend/api/data"

Write-Host "Uploading index.html and .htaccess..."
scp -P 48700 dist\index.html peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/index.html

if (Test-Path "dist\.htaccess") {
    scp -P 48700 dist\.htaccess peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/.htaccess
}

Write-Host "Uploading frontend assets..."
scp -P 48700 -r dist\assets\* peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/assets/

Write-Host "Uploading backend API..."
scp -P 48700 -r server\api\* peter@freshcoders.nl:/var/www/freshcoders.nl/html/placemend/api/

Write-Host "Setting remote permissions..."
ssh -p 48700 peter@freshcoders.nl "chmod -R 755 /var/www/freshcoders.nl/html/placemend 2>/dev/null; chmod 777 /var/www/freshcoders.nl/html/placemend/api/data 2>/dev/null || true"

Write-Host "Deployment complete! Live at https://freshcoders.nl/placemend/ and API at https://freshcoders.nl/placemend/api/"
