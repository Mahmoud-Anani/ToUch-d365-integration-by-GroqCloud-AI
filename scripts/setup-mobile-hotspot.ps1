param(
  [Parameter(Mandatory = $true)]
  [string] $LanIp
)

$ErrorActionPreference = 'Stop'
$parts = $LanIp.Split('.')
if ($parts.Count -ne 4) { throw 'LanIp must be the private IPv4 address assigned to this laptop by Phone A hotspot.' }
$octets = @()
foreach ($part in $parts) {
  $value = 0
  if (-not [int]::TryParse($part, [ref] $value) -or $value -lt 0 -or $value -gt 255) {
    throw 'LanIp must be a valid IPv4 address.'
  }
  $octets += $value
}
$private = $octets[0] -eq 10 -or
  ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
  ($octets[0] -eq 192 -and $octets[1] -eq 168)
if (-not $private) { throw 'LanIp must be a private LAN IPv4 address.' }

$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) { throw 'mkcert is required. Install it from https://github.com/FiloSottile/mkcert, then rerun this script.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$certDir = Join-Path $root 'certs'
New-Item -ItemType Directory -Path $certDir -Force | Out-Null
$certFile = Join-Path $certDir 'laptop-cert.pem'
$keyFile = Join-Path $certDir 'laptop-key.pem'

& $mkcert.Source -install
if ($LASTEXITCODE -ne 0) { throw 'mkcert could not install its local development CA.' }
& $mkcert.Source -cert-file $certFile -key-file $keyFile $LanIp localhost 127.0.0.1
if ($LASTEXITCODE -ne 0) { throw 'mkcert could not create the laptop HTTPS certificate.' }

$envPath = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Create .env from .env.example and configure the app before running this setup.' }
$lines = [Collections.Generic.List[string]]::new()
$lines.AddRange([string[]][IO.File]::ReadAllLines($envPath))
$settings = [ordered]@{
  HOST = '0.0.0.0'
  HTTPS_KEY_FILE = 'certs/laptop-key.pem'
  HTTPS_CERT_FILE = 'certs/laptop-cert.pem'
  SESSION_COOKIE_SECURE = 'true'
  DEVICE_CONNECTION_LAN_IP = $LanIp
}
foreach ($name in $settings.Keys) {
  $found = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^\s*#?\s*$([regex]::Escape($name))=") {
      $lines[$index] = "$name=$($settings[$name])"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines.Add("$name=$($settings[$name])") }
}
[IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))

$caRoot = (& $mkcert.Source -CAROOT | Select-Object -Last 1).Trim()
Write-Host "HTTPS certificate configured for $LanIp. Restart the app after setup."
Write-Host "On Phone B, install and trust only: $(Join-Path $caRoot 'rootCA.pem')"
Write-Host 'Never share rootCA-key.pem. Permit the app port only on the private Phone A hotspot network.'
