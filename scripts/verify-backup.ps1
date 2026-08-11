# Verify a db-backup artifact actually contains the database.
# ---------------------------------------------------------------------------
# A backup nobody has ever opened is a hope, not a backup. This decompresses
# the dump in memory and reports what is inside it: which tables, and how many
# rows each one carries. If the loyalty tables are there with plausible counts,
# the backup is real.
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\verify-backup.ps1
#
# With no argument it picks the newest heropad backup it can find under
# Downloads / Desktop, including one still inside the .zip GitHub hands you.
#
#   powershell -ExecutionPolicy Bypass -File scripts\verify-backup.ps1 -Path C:\some\file.sql.gz
#
# Keep this file pure ASCII. Windows PowerShell 5.1 reads BOM-less files as
# ANSI, where the UTF-8 bytes of an em dash end in 0x94 - a curly closing
# quote, which terminates a string mid-line and makes the whole script fail
# to parse with errors pointing at innocent lines further down.

param([string]$Path)

$ErrorActionPreference = 'Stop'

function Find-Backup {
    $roots = @("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop") |
        Where-Object { Test-Path $_ }
    Get-ChildItem -Path $roots -Recurse -ErrorAction SilentlyContinue -Include `
        'heropad-backup*.sql.gz', 'heropad-backup*.sql', 'heropad-db*.zip' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if (-not $Path) {
    $found = Find-Backup
    if (-not $found) {
        Write-Host "No backup file found under Downloads or Desktop." -ForegroundColor Red
        Write-Host "Download the artifact from GitHub Actions -> db-backup -> Artifacts, then re-run."
        exit 1
    }
    $Path = $found.FullName
}

if (-not (Test-Path $Path)) { Write-Host "Not found: $Path" -ForegroundColor Red; exit 1 }
Write-Host "Reading: $Path" -ForegroundColor Cyan

# GitHub wraps artifacts in a .zip; unwrap to a temp dir and take the dump out.
if ($Path -like '*.zip') {
    $tmp = Join-Path $env:TEMP ("heropad-verify-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    Expand-Archive -Path $Path -DestinationPath $tmp -Force
    $inner = Get-ChildItem -Path $tmp -Recurse -Include '*.sql.gz', '*.sql' |
        Select-Object -First 1
    if (-not $inner) { Write-Host "The zip holds no .sql/.sql.gz." -ForegroundColor Red; exit 1 }
    $Path = $inner.FullName
    Write-Host "  -> extracted: $($inner.Name)" -ForegroundColor DarkGray
}

if ($Path -like '*.gz') {
    $inStream = [IO.File]::OpenRead($Path)
    $gz = New-Object IO.Compression.GzipStream($inStream, [IO.Compression.CompressionMode]::Decompress)
    $reader = New-Object IO.StreamReader($gz)
    $sql = $reader.ReadToEnd()
    $reader.Close(); $gz.Close(); $inStream.Close()
} else {
    $sql = Get-Content -Path $Path -Raw
}

$lines = $sql -split "`n"
Write-Host ("Decompressed: {0:N0} lines, {1:N1} MB of SQL" -f $lines.Count, ($sql.Length / 1MB))
Write-Host ""

$tables = $lines | Select-String -Pattern '^CREATE TABLE (?:public\.)?"?([a-z0-9_]+)"?' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }

if (-not $tables) {
    Write-Host "NO TABLES IN THIS DUMP - the backup is not usable." -ForegroundColor Red
    exit 1
}

# COPY blocks hold the actual data; each ends with a lone '\.' terminator.
# Counting the lines between gives the real row count per table.
$rows = @{}
$current = $null; $count = 0
foreach ($line in $lines) {
    if ($current) {
        if ($line.TrimEnd() -eq '\.') { $rows[$current] = $count; $current = $null; $count = 0 }
        else { $count++ }
    } elseif ($line -match '^COPY (?:public\.)?"?([a-z0-9_]+)"?') {
        $current = $Matches[1]; $count = 0
    }
}

Write-Host "TABLES IN THE BACKUP" -ForegroundColor Green
Write-Host "--------------------"
foreach ($t in ($tables | Sort-Object)) {
    $n = if ($rows.ContainsKey($t)) { $rows[$t] } else { 0 }
    $colour = if ($n -gt 0) { 'White' } else { 'DarkGray' }
    Write-Host ("  {0,-28} {1,8} rows" -f $t, $n) -ForegroundColor $colour
}
Write-Host ""

# The tables that carry the business: losing these is losing the product.
$critical = @('venues', 'user_identity', 'stamps', 'rewards_redeemed')
$missing = $critical | Where-Object { $tables -notcontains $_ }
if ($missing) {
    Write-Host "MISSING critical tables: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

$empty = $critical | Where-Object { -not $rows.ContainsKey($_) -or $rows[$_] -eq 0 }
Write-Host ("Found all {0} critical tables." -f $critical.Count) -ForegroundColor Green
if ($empty) {
    Write-Host "Note: no rows in $($empty -join ', ') - fine if that data does not exist yet." -ForegroundColor Yellow
}
Write-Host "BACKUP IS VALID." -ForegroundColor Green
