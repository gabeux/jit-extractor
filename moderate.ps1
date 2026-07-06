# Leaderboard moderation for JIT Extractor.
# Usage: .\moderate.ps1            (interactive)
#        .\moderate.ps1 -Site https://jit-extractor.pages.dev
# The admin key is prompted for each run and never stored on disk.
param(
    [string]$Site = "https://jit-extractor.pages.dev"
)

$Site = $Site.TrimEnd('/')

Write-Host "Fetching leaderboard from $Site/api/scores ..." -ForegroundColor Cyan
try {
    $board = Invoke-RestMethod -Uri "$Site/api/scores" -Method Get
} catch {
    Write-Host "Could not reach the leaderboard: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Merge the profit and time boards into one unique-by-id list.
$entries = @{}
foreach ($list in @($board.profit, $board.time)) {
    foreach ($e in @($list)) {
        if ($null -ne $e -and $e.id) { $entries[$e.id] = $e }
    }
}
$all = @($entries.Values | Sort-Object -Property profit -Descending)

if ($all.Count -eq 0) {
    Write-Host "Leaderboard is empty. Nothing to moderate." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
$i = 1
foreach ($e in $all) {
    $when = [DateTimeOffset]::FromUnixTimeMilliseconds($e.ts).LocalDateTime.ToString("yyyy-MM-dd HH:mm")
    "{0,3}. {1,-20} profit={2,-10} time={3,8}ms  {4}  {5}  {6}" -f $i, $e.name, $e.profit, $e.timeMs, $e.country, $e.ending, $when
    $i++
}
Write-Host ""

$pick = Read-Host "Number of the entry to DELETE (blank to quit)"
if ([string]::IsNullOrWhiteSpace($pick)) { Write-Host "Nothing deleted."; exit 0 }

$idx = 0
if (-not [int]::TryParse($pick, [ref]$idx) -or $idx -lt 1 -or $idx -gt $all.Count) {
    Write-Host "Invalid number. Nothing deleted." -ForegroundColor Red
    exit 1
}

$victim = $all[$idx - 1]
$confirm = Read-Host "Delete '$($victim.name)' (profit $($victim.profit))? Type yes to confirm"
if ($confirm -ne "yes") { Write-Host "Cancelled. Nothing deleted."; exit 0 }

$keySecure = Read-Host "Admin key" -AsSecureString
$key = [System.Runtime.InteropServices.Marshal]::PtrToStringUni(
    [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($keySecure))

# id is checked before this point, so the wipe-all branch of the API can't trigger.
$encId  = [uri]::EscapeDataString($victim.id)
$encKey = [uri]::EscapeDataString($key)
try {
    $res = Invoke-RestMethod -Uri "$Site/api/scores?id=$encId&key=$encKey" -Method Delete
} catch {
    Write-Host "Delete failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "(A 403 means the admin key was wrong.)"
    exit 1
}

if ($res.removed -ge 1) {
    Write-Host "Removed '$($victim.name)' from the leaderboard." -ForegroundColor Green
} else {
    Write-Host "Server reported nothing removed - the entry may already be gone." -ForegroundColor Yellow
}
