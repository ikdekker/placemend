# Deploy script for Placemend PWA (PowerShell)
# Target: the "fc" SSH host (see ~/.ssh/config) -> homeserver, nick@192.168.178.167
# Site root on the server: ~/freshcoders/html (served by the Docker nginx + php-fpm stack)
# Note: "fc-old" is the previous server (94.213.32.68:48700) and no longer serves freshcoders.nl
$ErrorActionPreference = "Stop"

$remote = "fc"
$root = "freshcoders/html/placemend"

Write-Host "Building production bundle for Placemend..."
npm run build

Write-Host "Ensuring remote directories exist on $remote..."
ssh $remote "mkdir -p $root/assets $root/api/data"

Write-Host "Uploading index.html and .htaccess..."
scp dist\index.html "${remote}:$root/index.html"

if (Test-Path "dist\.htaccess") {
    scp dist\.htaccess "${remote}:$root/.htaccess"
}

Write-Host "Uploading frontend assets..."
scp -r dist\assets\* "${remote}:$root/assets/"

Write-Host "Uploading backend API..."
scp -r server\api\* "${remote}:$root/api/"

Write-Host "Setting remote permissions..."
# php-fpm runs as www-data inside the container, so api/data must be writable by everyone
ssh $remote "chmod -R a+rX $root 2>/dev/null; chmod -R a+rwX $root/api/data 2>/dev/null || true"

Write-Host "Deployment complete! Live at https://freshcoders.nl/placemend/ and API at https://freshcoders.nl/placemend/api/"
