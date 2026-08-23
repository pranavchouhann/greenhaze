# Creates your private local.config.json file without saving a password in this project archive.

if (Test-Path ".\local.config.json") {
  Write-Host "local.config.json already exists. Edit it directly if you want to change your settings." -ForegroundColor Yellow
  exit 0
}

$password = Read-Host "Choose a local GreenHaze admin password (minimum 8 characters)" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

if ($plainPassword.Length -lt 8) {
  Write-Host "Password must have at least 8 characters. No file was created." -ForegroundColor Red
  exit 1
}

$config = Get-Content ".\local.config.example.json" -Raw | ConvertFrom-Json
$config.adminPassword = $plainPassword
$config | ConvertTo-Json | Set-Content ".\local.config.json" -Encoding UTF8

Write-Host "Created private local.config.json. Now run: pnpm start" -ForegroundColor Green
