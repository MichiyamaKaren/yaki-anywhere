param([switch]$AcceptLicense)
$ErrorActionPreference = 'Stop'
if (!$AcceptLicense) { throw 'Pass -AcceptLicense only after accepting the Android SDK license at https://developer.android.com/studio#terms-and-conditions' }
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.tools/android'))
$sdkRoot = Join-Path $toolsRoot 'sdk'
$archivePath = Join-Path $toolsRoot 'commandlinetools.zip'
$expectedHash = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
if (!(Test-Path -LiteralPath $archivePath) -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower() -ne $expectedHash) {
    & curl.exe --noproxy '*' --fail --location --retry 2 --connect-timeout 20 --max-time 600 --output $archivePath 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Android SDK command line tools download failed' }
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower() -ne $expectedHash) { throw 'Android tools checksum mismatch' }
$sdkManager = Join-Path $sdkRoot 'cmdline-tools/latest/bin/sdkmanager.bat'
if (!(Test-Path -LiteralPath $sdkManager)) {
    $extractedRoot = Join-Path $toolsRoot 'extracted'
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractedRoot -Force
    $moveSource = [System.IO.Path]::GetFullPath((Join-Path $extractedRoot 'cmdline-tools'))
    $moveTarget = [System.IO.Path]::GetFullPath((Join-Path $sdkRoot 'cmdline-tools/latest'))
    foreach ($checkedPath in @($moveSource,$moveTarget)) {
        if (!$checkedPath.StartsWith($toolsRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Android tools move escaped the project tools directory' }
    }
    New-Item -ItemType Directory -Path (Join-Path $sdkRoot 'cmdline-tools') -Force | Out-Null
    Move-Item -LiteralPath $moveSource -Destination $moveTarget
}
# Approval to accept the SDK license is required before calling this script.
(1..12 | ForEach-Object { 'y' }) | & $sdkManager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK package installation failed' }
Write-Output "Android SDK ready at $sdkRoot"

