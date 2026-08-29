<#
.SYNOPSIS
    Downloads all Fineli open data packages and converts them to foods.json format.

.DESCRIPTION
    Downloads the three official Fineli CSV data packages from https://fineli.fi/fineli/fi/avoin-data:

    1. Basic package 1 - 4232 food items, 55 nutrients (website content)
    2. Basic package 2 - 4232 food items, 74 nutrients (extended)
    3. Ingredients     - 1370 raw ingredients, 40 industry-focused nutrients

    Uses Package 2 as the primary source (most complete nutrient data), and merges
    any additional food items from the other packages. The ingredients package is a
    subset of the basic packages but is downloaded for completeness.

    Data source: Fineli(R), Finnish Institute for Health and Welfare (THL)
    License: CC-BY 4.0

.PARAMETER OutputPath
    Path to write the output JSON file. Defaults to foods.json in the script directory.

.EXAMPLE
    .\fetch-fineli-data.ps1
    .\fetch-fineli-data.ps1 -OutputPath "C:\output\foods.json"
#>
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "foods.json")
)

$ErrorActionPreference = "Stop"

# All three Fineli open data packages
$packages = @(
    @{ Name = "Basic package 2 (74 nutrients)"; Url = "https://fineli.fi/fineli/content/file/49"; Primary = $true }
    @{ Name = "Basic package 1 (55 nutrients)"; Url = "https://fineli.fi/fineli/content/file/47"; Primary = $false }
    @{ Name = "Ingredients (1370 items)";       Url = "https://fineli.fi/fineli/content/file/48"; Primary = $false }
)

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$tempBase = Join-Path ([System.IO.Path]::GetTempPath()) "fineli-import-$timestamp"

# Component codes we need (per 100g values from Fineli CSV)
# ENERC = energy kJ, FAT = total fat, CHOAVL = carbohydrate, PROT = protein
# SUGAR = total sugars, FIBC = dietary fibre, FASAT = saturated fat
# NACL = salt (NaCl) in mg
$nutrientCodes = @{
    "ENERC"  = "energyKj"
    "FAT"    = "fat"
    "CHOAVL" = "carbohydrate"
    "PROT"   = "protein"
    "SUGAR"  = "sugar"
    "FIBC"   = "fiber"
    "FASAT"  = "saturatedFat"
    "NACL"   = "salt"
}

# Fineli CSV files are encoded in ISO-8859-1 (Latin-1)
$latin1 = [System.Text.Encoding]::GetEncoding("iso-8859-1")

# Helper to import CSV with correct encoding
function Import-FineliCsv {
    param([string]$Path)
    Get-Content $Path -Encoding $latin1 | ConvertFrom-Csv -Delimiter ";"
}

# Title-case helper: "SOKERI, PALASOKERI" -> "Sokeri, palasokeri"
function ConvertTo-TitleCase {
    param([string]$Name)
    if ([string]::IsNullOrEmpty($Name)) { return "" }
    return $Name.Substring(0, 1).ToUpper() + $Name.Substring(1).ToLower()
}

$extractDirs = @()
$zipPaths = @()

try {
    # Step 1: Download all packages
    Write-Host "Downloading Fineli data packages..." -ForegroundColor Cyan
    foreach ($pkg in $packages) {
        $zipPath = "$tempBase-$($pkg.Name -replace '[^a-zA-Z0-9]', '').zip"
        $extractDir = "$tempBase-$($pkg.Name -replace '[^a-zA-Z0-9]', '')"
        $zipPaths += $zipPath
        $extractDirs += $extractDir

        Write-Host "  $($pkg.Name)..." -NoNewline
        Invoke-WebRequest -Uri $pkg.Url -OutFile $zipPath
        $sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
        Write-Host " $sizeMB MB" -ForegroundColor Green

        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    }

    # Step 2: Use primary package (Package 2) as the base, merge others
    $primaryDir = $extractDirs[0]
    Write-Host ""
    Write-Host "Using $($packages[0].Name) as primary source" -ForegroundColor Cyan

    # Step 3: Load food names (FI, EN, SV) — merge from all packages
    Write-Host "Loading food names..." -ForegroundColor Cyan

    $namesFi = @{}
    $namesEn = @{}
    $namesSv = @{}

    foreach ($dir in $extractDirs) {
        Import-FineliCsv "$dir\foodname_FI.csv" | ForEach-Object {
            if (-not $namesFi.ContainsKey($_.FOODID)) { $namesFi[$_.FOODID] = $_.FOODNAME }
        }
        Import-FineliCsv "$dir\foodname_EN.csv" | ForEach-Object {
            if (-not $namesEn.ContainsKey($_.FOODID)) { $namesEn[$_.FOODID] = $_.FOODNAME }
        }
        Import-FineliCsv "$dir\foodname_SV.csv" | ForEach-Object {
            if (-not $namesSv.ContainsKey($_.FOODID)) { $namesSv[$_.FOODID] = $_.FOODNAME }
        }
    }
    Write-Host "  FI: $($namesFi.Count), EN: $($namesEn.Count), SV: $($namesSv.Count) names"

    # Step 4: Load category (function class) mapping from primary
    Write-Host "Loading categories..." -ForegroundColor Cyan

    $categories = @{}
    Import-FineliCsv "$primaryDir\fuclass_FI.csv" | ForEach-Object {
        $categories[$_.THSCODE] = $_.DESCRIPT
    }

    # Step 5: Load foods with their category codes — merge from all packages
    Write-Host "Loading food items..." -ForegroundColor Cyan

    $foodData = @{}
    foreach ($dir in $extractDirs) {
        Import-FineliCsv "$dir\food.csv" | ForEach-Object {
            if (-not $foodData.ContainsKey($_.FOODID)) {
                $foodData[$_.FOODID] = @{
                    Id           = [int]$_.FOODID
                    CategoryCode = $_.FUCLASS
                }
            }
        }
    }
    Write-Host "  $($foodData.Count) unique food items (merged from all packages)"

    # Step 6: Load nutrient values — primary first, then fill gaps from others
    Write-Host "Loading nutrient values..." -ForegroundColor Cyan

    $nutrients = @{}
    foreach ($foodId in $foodData.Keys) {
        $nutrients[$foodId] = @{}
    }

    $valueCount = 0
    foreach ($dir in $extractDirs) {
        Import-FineliCsv "$dir\component_value.csv" | ForEach-Object {
            if ($nutrientCodes.ContainsKey($_.EUFDNAME) -and $nutrients.ContainsKey($_.FOODID)) {
                # Only set if not already loaded (primary package takes precedence)
                if (-not $nutrients[$_.FOODID].ContainsKey($_.EUFDNAME)) {
                    $val = $_.BESTLOC -replace ",", "."
                    if ([double]::TryParse($val, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$null)) {
                        $nutrients[$_.FOODID][$_.EUFDNAME] = [double]$val
                        $valueCount++
                    }
                }
            }
        }
    }
    Write-Host "  Loaded $valueCount nutrient values"

    # Step 7: Build output
    Write-Host "Building output..." -ForegroundColor Cyan

    $outputFoods = [System.Collections.Generic.List[object]]::new()
    $skippedArchived = 0

    foreach ($foodId in ($foodData.Keys | Sort-Object { [int]$_ })) {
        $food = $foodData[$foodId]
        $n = $nutrients[$foodId]

        $nameFi = ConvertTo-TitleCase ($namesFi[$foodId])
        $nameEn = ConvertTo-TitleCase ($namesEn[$foodId])

        # Skip archived items — prefixed with "(arc)" in Fineli data
        if ($nameFi -match '^\(arc\)' -or $nameEn -match '^\(arc\)') {
            $skippedArchived++
            continue
        }

        $energyKj = if ($n.ContainsKey("ENERC")) { [math]::Round($n["ENERC"], 1) } else { 0 }
        # Convert kJ to kcal (1 kcal = 4.184 kJ)
        $energyKcal = [math]::Round($energyKj / 4.184, 1)

        $categoryName = if ($food.CategoryCode -and $categories.ContainsKey($food.CategoryCode)) {
            $categories[$food.CategoryCode]
        } else { $null }

        $item = [ordered]@{
            fineliId     = $food.Id
            nameFi       = $nameFi
            nameEn       = $nameEn
            nameSv       = if ($namesSv.ContainsKey($foodId)) { ConvertTo-TitleCase ($namesSv[$foodId]) } else { $null }
            category     = $categoryName
            energyKcal   = $energyKcal
            energyKj     = $energyKj
            protein      = if ($n.ContainsKey("PROT")) { [math]::Round($n["PROT"], 1) } else { 0 }
            fat          = if ($n.ContainsKey("FAT")) { [math]::Round($n["FAT"], 1) } else { 0 }
            saturatedFat = if ($n.ContainsKey("FASAT")) { [math]::Round($n["FASAT"], 1) } else { $null }
            carbohydrate = if ($n.ContainsKey("CHOAVL")) { [math]::Round($n["CHOAVL"], 1) } else { 0 }
            sugar        = if ($n.ContainsKey("SUGAR")) { [math]::Round($n["SUGAR"], 1) } else { $null }
            fiber        = if ($n.ContainsKey("FIBC")) { [math]::Round($n["FIBC"], 1) } else { $null }
            # NACL is in mg in the CSV, convert to g
            salt         = if ($n.ContainsKey("NACL")) { [math]::Round($n["NACL"] / 1000, 2) } else { $null }
        }

        $outputFoods.Add([PSCustomObject]$item)
    }

    # Step 8: Write JSON
    Write-Host "Writing output..." -ForegroundColor Cyan
    
    $jsonOutput = $outputFoods | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($OutputPath, $jsonOutput, [System.Text.UTF8Encoding]::new($false))

    Write-Host ""
    Write-Host "Done! $($outputFoods.Count) food items written to: $OutputPath" -ForegroundColor Green
    Write-Host "  Skipped $skippedArchived archived (arc) items"
    Write-Host ""
    Write-Host "Data source: Fineli(R), Finnish Institute for Health and Welfare (THL)"
    Write-Host "License: CC-BY 4.0"
}
finally {
    # Cleanup temp files
    foreach ($z in $zipPaths) {
        if (Test-Path $z) { Remove-Item $z -Force -ErrorAction SilentlyContinue }
    }
    foreach ($d in $extractDirs) {
        if (Test-Path $d) { Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
