<#
.SYNOPSIS
  Bitig icin yerel (self-signed) bir kod imzalama sertifikasi uretir.

.DESCRIPTION
  Uretilen .pfx dosyasi build/ altina yazilir ve .gitignore ile depoya
  girmesi engellenir. electron-builder sertifikayi CSC_LINK ve
  CSC_KEY_PASSWORD ortam degiskenlerinden okur:

      $env:CSC_LINK = "$PWD\build\bitig-codesign.pfx"
      $env:CSC_KEY_PASSWORD = "<sifre>"
      npm run dist

  NOT: Self-signed sertifika, exe'nin yayinci alanini "Samet Gurtuna" yapar
  ancak Windows SmartScreen uyarisini TAMAMEN kaldirmaz - bunun icin ticari
  bir OV/EV kod imzalama sertifikasi gerekir. Sertifikayi bu makinede
  guvenilir kabul ettirmek icin asagidaki "Trusted Root" adimi kullanilabilir
  (yonetici hakki ister).

.PARAMETER Password
  .pfx dosyasi icin kullanilacak sifre. Verilmezse istenir.

.PARAMETER TrustLocally
  Sertifikayi bu makinedeki Trusted Root deposuna da ekler (yonetici gerekir).
#>
[CmdletBinding()]
param(
  [string]$Password,
  [switch]$TrustLocally
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $repoRoot 'build'
$pfxPath = Join-Path $buildDir 'bitig-codesign.pfx'

if (-not (Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

if (-not $Password) {
  $secure = Read-Host -Prompt 'PFX sifresi' -AsSecureString
} else {
  $secure = ConvertTo-SecureString -String $Password -Force -AsPlainText
}

Write-Host 'Sertifika uretiliyor: CN=Samet Gurtuna'
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=Samet Gurtuna, O=Bitig' `
  -KeyUsage DigitalSignature `
  -FriendlyName 'Bitig Code Signing' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(3) `
  -HashAlgorithm SHA256

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure | Out-Null
Write-Host "PFX yazildi: $pfxPath"

if ($TrustLocally) {
  Write-Host 'Sertifika Trusted Root deposuna ekleniyor (yonetici gerekir)...'
  $cerPath = Join-Path $buildDir 'bitig-codesign.cer'
  Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
  Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
  Write-Host 'Eklendi.'
}

Write-Host ''
Write-Host 'Imzali build icin:'
Write-Host "  `$env:CSC_LINK = `"$pfxPath`""
Write-Host '  $env:CSC_KEY_PASSWORD = "<sifre>"'
Write-Host '  npm run dist'
