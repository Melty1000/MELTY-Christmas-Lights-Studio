$appDir = 'c:\Users\HYPNO\.gemini\antigravity\scratch\Projects\[MELTY] Christmas Lights Studio\[APPLICATION]'
$localDir = "$appDir\local"

# Create local directory if it doesn't exist
if (-not (Test-Path -LiteralPath $localDir)) {
    New-Item -Path $localDir -ItemType Directory -Force | Out-Null
}

# Files in dependency order
$files = @(
    'js\config.js',
    'js\utils.js',
    'js\camera.js',
    'js\objects\wire.js',
    'js\objects\bulb.js',
    'js\objects\snow.js',
    'js\objects\stars.js',
    'js\effects\sparkle.js',
    'js\geometry.js',
    'js\UnrealBloomPass.js',
    'js\postfx.js',
    'js\ui\dropdown.js',
    'js\ui\presets.js',
    'js\tutorial.js',
    'js\renderer.js',
    'js\ui.js',
    'js\auto-update.js',
    'js\main.js'
)

$header = @"
// ===========================================================================
//  MELTY'S CHRISTMAS LIGHTS STUDIO - LOCAL BUILD
//  Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
//  This file is auto-generated. Do not edit directly.
// ===========================================================================

"@

$output = $header

foreach ($file in $files) {
    $fullPath = Join-Path $appDir $file
    if (Test-Path -LiteralPath $fullPath) {
        $lines = Get-Content -LiteralPath $fullPath -Encoding UTF8
        $filteredLines = @()
        $insideImport = $false
        
        foreach ($line in $lines) {
            # Check if we're starting a multi-line import
            if ($line -match '^\s*import\s+\{' -and $line -notmatch '\}\s*from') {
                $insideImport = $true
                continue
            }
            
            # Check if we're ending a multi-line import
            if ($insideImport) {
                if ($line -match '\}\s*from\s+') {
                    $insideImport = $false
                }
                continue
            }
            
            # Skip single-line import statements
            if ($line -match '^\s*import\s+') {
                continue
            }
            
            # Skip lines that start with 'export {' (re-export statements)
            if ($line -match '^\s*export\s*\{') {
                continue
            }
            
            # Remove 'export default' keeping the rest
            $line = $line -replace '^\s*export\s+default\s+', ''
            
            # Remove 'export' from 'export const', 'export function', 'export class', etc.
            $line = $line -replace '^\s*export\s+(const|let|var|function|class|async)\s+', '$1 '
            
            $filteredLines += $line
        }
        
        $content = $filteredLines -join "`r`n"
        
        $output += "`r`n// ===========================================================================`r`n"
        $output += "//  SOURCE FILE: $file`r`n"
        $output += "// ===========================================================================`r`n`r`n"
        $output += $content
        $output += "`r`n"
    }
    else {
        Write-Host "WARNING: File not found: $fullPath"
    }
}

# Write the merged file with UTF-8 encoding (no BOM)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$localDir\app.js", $output, $utf8NoBom)
Write-Host "Created app.js"

# Copy the main index.html
Copy-Item -LiteralPath "$appDir\index.html" -Destination "$localDir\index.html" -Force

# Fix the local index.html: just change main.js to app.js (keep import map, keep module type)
$html = [System.IO.File]::ReadAllText("$localDir\index.html", [System.Text.Encoding]::UTF8)
$html = $html -replace 'src="js/main.js"', 'src="app.js"'
[System.IO.File]::WriteAllText("$localDir\index.html", $html, $utf8NoBom)
Write-Host "Created index.html (kept import map, changed to app.js)"

# Add THREE import to the top of app.js (after the header comment)
$appJs = [System.IO.File]::ReadAllText("$localDir\app.js", [System.Text.Encoding]::UTF8)
$threeImport = "import * as THREE from 'three';`r`nimport { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';`r`nimport { CopyShader } from 'three/addons/shaders/CopyShader.js';`r`nimport { LuminosityHighPassShader } from 'three/addons/shaders/LuminosityHighPassShader.js';`r`n`r`n"
# Insert after the header block
$appJs = $appJs -replace '(// ===========================================================================\r?\n\r?\n)', "`$1$threeImport"
[System.IO.File]::WriteAllText("$localDir\app.js", $appJs, $utf8NoBom)
Write-Host "Added THREE imports to app.js"

# Copy other assets
Copy-Item -LiteralPath "$appDir\style.css" -Destination "$localDir\style.css" -Force
Copy-Item -LiteralPath "$appDir\favicon.png" -Destination "$localDir\favicon.png" -Force
Write-Host "Copied style.css and favicon.png"

Write-Host "`nLocal bundle created successfully!"
Write-Host "Files in $localDir :"
Get-ChildItem -LiteralPath $localDir | ForEach-Object { Write-Host "  - $($_.Name) ($([math]::Round($_.Length/1KB, 1)) KB)" }
