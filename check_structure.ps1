# check_structure.ps1
# Run: powershell -File check_structure.ps1
# Checks file placement rules for DOTG_update

$errors = @()
$root = $PSScriptRoot

# Rule 1: No Python source files in root
$allowedRootPy = @("requirements.txt")
Get-ChildItem $root -Filter "*.py" -File | ForEach-Object {
    if ($_.Name -notin $allowedRootPy) {
        $errors += "Python file in root: '$($_.Name)' -- move to backend/"
    }
}

# Rule 2: No .ts/.tsx files outside frontend/
$frontendPath = Join-Path $root "frontend"
Get-ChildItem $root -Recurse -File | Where-Object {
    ($_.Extension -eq ".ts" -or $_.Extension -eq ".tsx") -and
    (-not $_.FullName.StartsWith($frontendPath))
} | ForEach-Object {
    $errors += "TS file outside frontend/: $($_.Name) in $($_.DirectoryName)"
}

# Rule 3: No user profile JSONs in root
Get-ChildItem $root -File | Where-Object { $_.Name -like "user_profile_*.json" } | ForEach-Object {
    $errors += "User profile in root: '$($_.Name)' -- move to data/users/"
}

# Rule 4: No generated question/evaluation files in root
Get-ChildItem $root -File | Where-Object { $_.Name -like "questions_*.txt" } | ForEach-Object {
    $errors += "Generated file in root: '$($_.Name)' -- delete or move to data/"
}
Get-ChildItem $root -File | Where-Object { $_.Name -like "*_evaluation.*" } | ForEach-Object {
    $errors += "Evaluation artifact in root: '$($_.Name)' -- delete"
}

# Rule 5: .env covered by .gitignore
$giPath = Join-Path $root ".gitignore"
if (Test-Path $giPath) {
    $giLines = Get-Content $giPath
    $covered = $giLines | Where-Object { $_.Trim() -eq ".env" }
    if (-not $covered) {
        $errors += "WARNING: .env not listed in .gitignore"
    }
}

# Report
if ($errors.Count -eq 0) {
    Write-Host "PASS: All file placement rules satisfied." -ForegroundColor Green
}
else {
    Write-Host "FAIL: $($errors.Count) file placement violation(s):" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "  >> $_" -ForegroundColor Yellow }
    Write-Host ""
    exit 1
}
