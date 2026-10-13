$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resRoot = Join-Path $projectRoot 'android/app/src/main/res'
$templateArchive = Join-Path $projectRoot 'node_modules/@capacitor/cli/assets/android-template.tar.gz'
$iconPath = Join-Path $projectRoot 'assets/icons/icon-512.png'
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'capacitor.config.json') -Raw | ConvertFrom-Json
if (!(Test-Path -LiteralPath $templateArchive)) { throw 'Capacitor template is missing. Run npm ci first.' }
if (!(Test-Path -LiteralPath $iconPath)) { throw 'Application icon is missing: assets/icons/icon-512.png' }
if (!$config.appName -or !$config.appId) { throw 'capacitor.config.json must define appName and appId.' }
Get-Command tar -ErrorAction Stop | Out-Null

# Build in a fresh directory; no existing res files are needed.
$toolsRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.tools/android'))
$stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $toolsRoot ('resources-' + [guid]::NewGuid().ToString('N'))))
$stagingRes = [System.IO.Path]::GetFullPath((Join-Path $stagingRoot 'app/src/main/res'))
if (!$toolsRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar) -or !$stagingRoot.StartsWith($toolsRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Resource staging path escaped the project.' }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
try {
    & tar -xzf $templateArchive -C $stagingRoot 'app/src/main/res'
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $stagingRes)) { throw 'Could not extract Android resource template.' }

    $source = [System.Drawing.Bitmap]::new($iconPath)
    try {
        $pngPaths = Get-ChildItem -LiteralPath $stagingRes -Recurse -File -Filter '*.png'
        foreach ($pngPath in $pngPaths) {
            $existing = [System.Drawing.Bitmap]::new($pngPath.FullName)
            $width=$existing.Width; $height=$existing.Height; $existing.Dispose()
            $bitmap = [System.Drawing.Bitmap]::new($width,$height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                if ($pngPath.Name -eq 'splash.png') {
                    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f8fa'))
                    $iconSize=[Math]::Max(48,[int]([Math]::Min($width,$height)*0.15))
                    $graphics.DrawImage($source,[int](($width-$iconSize)/2),[int](($height-$iconSize)/2),$iconSize,$iconSize)
                } elseif ($pngPath.Name -eq 'ic_launcher_foreground.png') {
                    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#7461cd'))
                    $iconSize=[int]([Math]::Min($width,$height)*0.67)
                    $graphics.DrawImage($source,[int](($width-$iconSize)/2),[int](($height-$iconSize)/2),$iconSize,$iconSize)
                } else {
                    $graphics.DrawImage($source,0,0,$width,$height)
                }
                $bitmap.Save($pngPath.FullName,[System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $graphics.Dispose(); $bitmap.Dispose()
            }
        }
    } finally { $source.Dispose() }

    # These overrides were previously applied by one-off commands.
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText((Join-Path $stagingRes 'values/colors.xml'), @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#7461cd</color>
    <color name="colorPrimaryDark">#7461cd</color>
    <color name="colorAccent">#7461cd</color>
</resources>
'@, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $stagingRes 'values/ic_launcher_background.xml'), @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#7461cd</color>
</resources>
'@, $utf8)
    $appName = [System.Security.SecurityElement]::Escape($config.appName)
    $appId = [System.Security.SecurityElement]::Escape($config.appId)
    [System.IO.File]::WriteAllText((Join-Path $stagingRes 'values/strings.xml'), @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">$appName</string>
    <string name="title_activity_main">$appName</string>
    <string name="package_name">$appId</string>
    <string name="custom_url_scheme">$appId</string>
</resources>
"@, $utf8)

    # Only replace the generated resource directory within this checkout.
    $resRoot = [System.IO.Path]::GetFullPath($resRoot)
    $expectedResRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'android/app/src/main/res'))
    if ($resRoot -ne $expectedResRoot -or !$resRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Resource path escaped the project.' }
    $previousRes = Join-Path $stagingRoot 'previous-res'
    if (Test-Path -LiteralPath $resRoot) { Move-Item -LiteralPath $resRoot -Destination $previousRes }
    try {
        New-Item -ItemType Directory -Path (Split-Path $resRoot -Parent) -Force | Out-Null
        Move-Item -LiteralPath $stagingRes -Destination $resRoot
    } catch {
        if (Test-Path -LiteralPath $previousRes) { Move-Item -LiteralPath $previousRes -Destination $resRoot }
        throw
    }
    Write-Output 'Generated Android resources in android/app/src/main/res/'
} finally {
    $stagingRoot = [System.IO.Path]::GetFullPath($stagingRoot)
    if (!$stagingRoot.StartsWith($toolsRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Resource staging path escaped the tools directory.' }
    if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}
