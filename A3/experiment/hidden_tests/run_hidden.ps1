# Score one GitCore run and record it in results/results.csv and results/runs.md
# (Windows PowerShell 5.1+). Two modes:
#
#   ISSUE RUN (b1 b2 f1 f2 v1): run the hidden acceptance tests on the run's PR, read the run's
#   summary/stop/review comments, record one row (run_type = issue).
#     powershell -ExecutionPolicy Bypass -File run_hidden.ps1 <fork> <b1|b2|f1|f2|v1> [<PR number | branch>] [options]
#
#   SEEDED PR REVIEW (sp1 ... sp5): read the "/autose review" result on a seeded PR, compare it with
#   experiment/seeded_prs/labels.json, record one row (run_type = seeded). No tests are run.
#     powershell -ExecutionPolicy Bypass -File run_hidden.ps1 <fork> <sp1..sp5> [<PR number | branch>] [options]
#
# Examples (from A3\experiment\hidden_tests):
#   ... run_hidden.ps1 ..\..\..\Gitwallah_v2 b2 3                    # issue PR #3
#   ... run_hidden.ps1 ..\..\..\Gitwallah_v2 v1 -RunId <id|url>      # issue run without a PR
#   ... run_hidden.ps1 ..\..\..\Gitwallah_v2 sp3                     # seeded PR, found by its branch
#   ... run_hidden.ps1 ..\..\..\Gitwallah_v2 sp3 -DefectCaught yes   # ... after you read the findings
#
# Options:
#   -RunId <id|url>        pick a specific Actions run (default: the latest one for this PR)
#   -Variant <name>        default | E1-A | E2-B ...   (default: "default")
#   -BuilderModel <code>   issue runs: builder model code (default: value from the previous CSV row)
#   -DefectCaught yes|no   seeded runs: does a finding name the planted defect? (your judgement)
#   -Notes <text>          free text added to the notes column
#   -NoRecord              only print; do not write results.csv / runs.md
#
# Where the numbers come from (nothing is typed in by hand except -BuilderModel, -Variant, -DefectCaught):
#   hidden_passed/total          the hidden test run below, on the PR head as it is now
#   stages, attempts, tokens     the "GitCore run summary" comment that finalize posts on the issue
#   status / stop reason         the "GitCore stopped" comment (absent when a PR was opened)
#   verdicts, reviewer model     the "GitCore independent review" comments on the PR
#   expected verdict (seeded)    experiment/seeded_prs/labels.json
#   duration, run URL            the GitHub Actions API
# All of these are public on a public fork, so no token is needed. If $env:GITHUB_TOKEN is set,
# it is sent to api.github.com to raise the rate limit; it is never printed or written to a file.
# Rows are keyed by run_id: running the script again for the same run replaces its row.
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Fork,
  [Parameter(Mandatory = $true, Position = 1)][string]$Id,
  [Parameter(Position = 2)][string]$Ref = "",
  [string]$RunId = "",
  [string]$Variant = "default",
  [string]$BuilderModel = "",
  [ValidateSet("", "yes", "no")][string]$DefectCaught = "",
  [string]$Notes = "",
  [switch]$NoRecord
)

$ErrorActionPreference = "Stop"
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Assert-Native([string]$What) {
  if ($LASTEXITCODE -ne 0) { throw "failed: $What (exit $LASTEXITCODE)" }
}

$Fork = (Resolve-Path $Fork).Path
$Here = $PSScriptRoot
$Id = $Id.ToLower()
$Seeded = $Id -match '^sp\d+$'
$ResultsDir = (Resolve-Path (Join-Path $Here "..\..\results")).Path
$CsvPath = Join-Path $ResultsDir "results.csv"
$RunsMd = Join-Path $ResultsDir "runs.md"
if ($Seeded) {
  $Item = $Id
  $Label = (Get-Content (Join-Path $Here "..\seeded_prs\labels.json") -Raw -Encoding UTF8 | ConvertFrom-Json) |
    Where-Object { $_.id -eq $Id } | Select-Object -First 1
  if ($null -eq $Label) { Write-Host "no seeded PR '$Id' in labels.json"; exit 2 }
} else {
  $Item = $Id.ToUpper()
  $Test = Get-ChildItem -Path $Here -Filter "hidden_$($Id)_*.test.js" | Select-Object -First 1
  if ($null -eq $Test) { Write-Host "no hidden test file for '$Id'"; exit 2 }
}

# ------------------------------------------------------------------ GitHub API (read-only)
$origin = (git -C $Fork remote get-url origin).Trim()
if ($origin -notmatch 'github\.com[:/](.+?/.+?)(\.git)?$') { throw "origin is not a GitHub repo: $origin" }
$Slug = $Matches[1]
$Api = "https://api.github.com/repos/$Slug"
$Headers = @{ 'Accept' = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'gitcore-hidden-tests' }
if ($env:GITHUB_TOKEN) { $Headers['Authorization'] = "Bearer $env:GITHUB_TOKEN" }

function Get-Api([string]$Path) { Invoke-RestMethod -Headers $Headers -Uri "$Api$Path" }
# PowerShell 5.1 emits a JSON array as one object; this unrolls it into its items.
function Get-ApiList([string]$Path) { @(Invoke-RestMethod -Headers $Headers -Uri "$Api$Path" | ForEach-Object { $_ }) }
function ConvertTo-Utc($v) { ([datetime]$v).ToUniversalTime() }
function Format-Num([double]$v, [string]$f) { ($f -f $v).Replace(',', '.') }

# ------------------------------------------------------------------ recording helpers
function ConvertTo-CsvField([string]$v) {
  if ($null -eq $v) { return '' }
  if ($v -match '[",\r\n]') { return '"' + $v.Replace('"', '""') + '"' }
  return $v
}

function Get-CsvRows {
  $lines = [IO.File]::ReadAllLines($CsvPath, $Utf8)
  if ($lines.Count -gt 1) { return @(Import-Csv -Path $CsvPath -Encoding UTF8) }
  return @()
}

function Save-CsvRow($row) {   # upsert by run_id, keeps the header order of the file
  $headerLine = [IO.File]::ReadAllLines($CsvPath, $Utf8)[0]
  $header = $headerLine.Split(',')
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add($headerLine)
  $replaced = $false
  foreach ($r in (Get-CsvRows)) {
    if ($r.run_id -eq $row.run_id) { $out.Add((($header | ForEach-Object { ConvertTo-CsvField ([string]$row[$_]) }) -join ',')); $replaced = $true }
    else { $out.Add((($header | ForEach-Object { ConvertTo-CsvField ([string]$r.$_) }) -join ',')) }
  }
  if (-not $replaced) { $out.Add((($header | ForEach-Object { ConvertTo-CsvField ([string]$row[$_]) }) -join ',')) }
  [IO.File]::WriteAllText($CsvPath, (($out -join "`n") + "`n"), $Utf8)
}

# Upsert $MdRow into the runs.md table whose header line starts with $HeaderStart; the row
# containing $Key is replaced, otherwise the empty template row is replaced, otherwise appended.
# $IssueItem / $IssueNo fill the issue table once.
function Save-MdRow([string]$HeaderStart, [string]$Key, [string]$MdRow, [string]$IssueItem, [string]$IssueNo) {
  $md = [IO.File]::ReadAllText($RunsMd, $Utf8)
  $nl = "`n"; if ($md.Contains("`r`n")) { $nl = "`r`n" }
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.AddRange([string[]]($md -split "\r?\n"))
  if ($IssueItem -and $IssueNo) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\| $IssueItem \| \w+ \| ``#`` \|") {
        $lines[$i] = $lines[$i] -replace '`#`', "[#$IssueNo](https://github.com/$Slug/issues/$IssueNo)"
      }
    }
  }
  $hdr = -1
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].StartsWith($HeaderStart)) { $hdr = $i; break } }
  if ($hdr -lt 0) { Write-Host "warning: table '$HeaderStart' not found in runs.md"; return }
  $existing = -1
  for ($i = $hdr + 2; $i -lt $lines.Count -and $lines[$i].StartsWith('|'); $i++) { if ($lines[$i].Contains($Key)) { $existing = $i } }
  if ($existing -ge 0) { $lines[$existing] = $MdRow }
  else {
    $at = $hdr + 2
    while ($at -lt $lines.Count -and $lines[$at].StartsWith('|') -and $lines[$at] -notmatch '^\|(\s*\|)+\s*$') { $at++ }
    if ($at -lt $lines.Count -and $lines[$at] -match '^\|(\s*\|)+\s*$') { $lines[$at] = $MdRow }
    else { $lines.Insert($at, $MdRow) }
  }
  [IO.File]::WriteAllText($RunsMd, ($lines -join $nl), $Utf8)
}

# PR number from "<number>" or "<branch>" (empty if there is no PR for the branch)
function Resolve-PrNumber([string]$R) {
  if ($R -match '^\d+$') { return $R }
  if (-not $R) { return "" }
  $owner = $Slug.Split('/')[0]
  $p = Get-ApiList "/pulls?state=all&head=$($owner):$R"
  if ($p.Count -gt 0) { return [string]$p[0].number }
  return ""
}

# ------------------------------------------------------------------ hidden tests on a PR head
function Invoke-Hidden([string]$TheRef) {
  # native tools write progress/noise to stderr; under "Stop" PowerShell 5.1 would treat that as an error
  $ErrorActionPreference = 'Continue'
  Push-Location $Fork
  $wt = $null
  try {
    git fetch -q origin; Assert-Native "git fetch"
    $r = $TheRef
    if ($r -match '^\d+$') {
      git fetch -q -f origin "pull/$r/head:gitcore-hidden-pr-$r"; Assert-Native "fetch PR #$r"
      $r = "gitcore-hidden-pr-$r"
    } else {
      git rev-parse -q --verify "origin/$r" *> $null
      if ($LASTEXITCODE -eq 0) { $r = "origin/$r" }
    }
    $sha = (git rev-parse $r).Trim(); Assert-Native "resolve $r"
    $wt = Join-Path $env:TEMP ("gitcore-hidden-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
    git worktree add -q --detach $wt $sha; Assert-Native "git worktree add"

    Set-Location (Join-Path $wt "backend")
    npm.cmd ci --ignore-scripts --no-audit --no-fund --silent; Assert-Native "npm ci"
    Copy-Item $Test.FullName tests\
    $report = "hidden-report.json"
    Write-Host "== $Id hidden tests on $sha ($TheRef)"
    npx.cmd vitest run "tests/$($Test.Name)" --reporter=default --reporter=json "--outputFile.json=$report" 2>$null
    if (-not (Test-Path $report)) { throw "vitest wrote no report" }
    $j = Get-Content $report -Raw | ConvertFrom-Json
    $failed = @()
    foreach ($f in $j.testResults) { foreach ($a in $f.assertionResults) { if ($a.status -ne 'passed') { $failed += $a.title } } }
    Write-Host ("hidden: {0}/{1} passed" -f $j.numPassedTests, $j.numTotalTests)
    foreach ($t in $failed) { Write-Host "  FAIL $t" }

    Write-Host "== full suite on the PR head (without the hidden file)"
    Remove-Item "tests\$($Test.Name)"
    npx.cmd vitest run --reporter=dot 2>$null | Out-String -Stream | Select-String -Pattern 'Tests |Test Files' | ForEach-Object { Write-Host $_.Line }
    return @{ passed = [int]$j.numPassedTests; total = [int]$j.numTotalTests; sha = $sha; failed = $failed }
  }
  finally {
    Set-Location $Fork
    if ($wt) { git worktree remove --force $wt *> $null }
    Pop-Location
  }
}

if ($RunId -match 'runs/(\d+)') { $RunId = $Matches[1] }

# ================================================================== SEEDED PR REVIEW
if ($Seeded) {
  $theRef = $Ref; if (-not $theRef) { $theRef = $Label.branch }
  $PrNum = Resolve-PrNumber $theRef
  if (-not $PrNum) { throw "no PR found for '$theRef'. Open the seeded PR first (see experiment/seeded_prs/README.md)" }
  $pr = Get-Api "/pulls/$PrNum"
  $reviews = @(Get-ApiList "/issues/$PrNum/comments?per_page=100" | Where-Object { $_.body -like '## GitCore independent review*' })
  if ($reviews.Count -eq 0) { throw "PR #$PrNum has no GitCore review comment yet. Comment '/autose review' on it and wait for the run" }

  # which Actions run posted each review: the footer names it; older comments are matched by time
  $recent = $null
  function Get-RunOfComment($c) {
    if ($c.body -match 'Run: \S*actions/runs/(\d+)') { return $Matches[1] }
    if ($null -eq $script:recent) {
      $from = (ConvertTo-Utc $reviews[0].created_at).AddDays(-1).ToString("yyyy-MM-dd")
      $script:recent = Get-ApiList "/actions/runs?event=issue_comment&per_page=100&created=%3E%3D$from" | ForEach-Object { $_.workflow_runs } | ForEach-Object { $_ }
    }
    $t = ConvertTo-Utc $c.created_at
    $inWindow = @($script:recent | Where-Object { (ConvertTo-Utc $_.run_started_at) -le $t -and (ConvertTo-Utc $_.updated_at).AddMinutes(1) -ge $t })
    $m = @($inWindow | Where-Object { $_.display_title -eq $pr.title })   # a /autose review run is titled after the PR
    if ($m.Count -ge 1) { return [string]$m[0].id }
    if ($inWindow.Count -eq 1) { return [string]$inWindow[0].id }      # only one run was active then
    return ""
  }
  $review = $null
  if ($RunId) {
    foreach ($c in $reviews) { if ((Get-RunOfComment $c) -eq $RunId) { $review = $c } }
    if ($null -eq $review) { throw "no review comment on PR #$PrNum comes from run $RunId" }
  } else {
    $review = $reviews[-1]
    $RunId = Get-RunOfComment $review
    if (-not $RunId) { throw "cannot tell which Actions run posted the latest review on PR #$PrNum; pass -RunId" }
  }
  $run = Get-Api "/actions/runs/$RunId"
  $rb = $review.body

  $verdict = ""
  if ($rb -match 'round \d+: \*\*(APPROVE|REQUEST CHANGES)\*\*') { $verdict = $Matches[1].ToLower().Replace(' ', '_') }
  $model = ""; if ($rb -match 'reviewer model `([^`]+)`') { $model = $Matches[1] }
  $toolCalls = ""; if ($rb -match 'tool calls: (\d+)') { $toolCalls = $Matches[1] }
  $tokR = ""; $usdR = ""
  if ($rb -match 'Reviewer tokens: (\d+) \(\$([\d.]+)\)') { $tokR = $Matches[1]; $usdR = Format-Num ([double]$Matches[2]) '{0:0.0000}' }
  $findings = @(($rb -split "\r?\n") | Where-Object { $_ -match '^\| `' })
  $expected = $Label.expected_verdict
  $correct = ([string]($verdict -eq $expected)).ToLower()
  $caught = $DefectCaught
  if ($expected -eq 'approve') { $caught = 'n/a' }
  $start = ConvertTo-Utc $run.run_started_at
  $end = ConvertTo-Utc $run.updated_at

  Write-Host "== $Id (PR #$PrNum, run $RunId, variant $Variant)"
  Write-Host "   verdict: $verdict   expected: $expected   correct: $correct   model: $model   tool calls: $toolCalls   findings: $($findings.Count)"
  foreach ($f in $findings) { Write-Host "   $f" }
  if ($expected -ne 'approve') {
    Write-Host "   planted defect: $($Label.planted_defect)"
    Write-Host "   a good reviewer says: $($Label.what_a_good_reviewer_should_say)"
    if (-not $caught) { Write-Host "   -> read the findings above, then rerun with -DefectCaught yes|no (left empty for now)" }
  }
  if ($rb -match 'unsupported approval') { Write-Host "   note: an approval was downgraded by code (no evidence / no tool calls)" }
  if ($NoRecord) { Write-Host "(-NoRecord: results.csv and runs.md not changed)"; exit 0 }

  $noteParts = @("tool calls $toolCalls", "$($findings.Count) findings")
  if ($rb -match 'unsupported approval') { $noteParts += 'approval downgraded by code' }
  if ($Notes) { $noteParts += $Notes }
  $row = [ordered]@{
    run_id = $RunId; run_type = 'seeded'; item = $Item; variant = $Variant
    builder_model = ''; reviewer_model = $model
    s1_spec = 'skip'; s2_design = 'skip'; s3_impl = 'skip'; s4_test = 'skip'; s5_release = 'skip'
    s6_review_r1 = $verdict; s6_review_r2 = 'skip'; final_status = "review/$verdict"
    impl_attempts = ''; redesigns = ''; hidden_passed = ''; hidden_total = ''
    expected_verdict = $expected; reviewer_correct = $correct; defect_caught = $caught
    tokens_builder = ''; tokens_reviewer = $tokR; usd_total = $usdR
    duration_min = Format-Num ($end - $start).TotalMinutes '{0:0.0}'
    actions_run_url = $run.html_url; pr_url = $pr.html_url
    notes = ($noteParts -join '; ')
  }
  Save-CsvRow $row
  $mdRow = "| $Id | $Variant | [#$PrNum]($($pr.html_url)) | [$RunId]($($run.html_url)) | [comment]($($review.html_url)) | $verdict | $expected |"
  Save-MdRow '| Seeded PR | Variant |' "actions/runs/$RunId)" $mdRow "" ""
  Write-Host ""
  Write-Host "recorded seeded review $RunId ($Id, PR #$PrNum): $verdict (expected $expected, correct $correct, defect caught '$caught')"
  Write-Host "  -> $CsvPath"
  Write-Host "  -> $RunsMd"
  exit 0
}

# ================================================================== ISSUE RUN
$PrNum = Resolve-PrNumber $Ref
if (-not $RunId) {
  if (-not $PrNum) { throw "give a PR number/branch with an open PR, or -RunId" }
  $pr = Get-Api "/pulls/$PrNum"
  $issueNo = ""
  if ($pr.head.ref -match 'issue-(\d+)') { $issueNo = $Matches[1] }
  elseif ($pr.body -match '#(\d+)') { $issueNo = $Matches[1] }
  if (-not $issueNo) { throw "cannot tell which issue PR #$PrNum belongs to; pass -RunId" }
  $ic = Get-ApiList "/issues/$issueNo/comments?per_page=100"
  $s = @($ic | Where-Object { $_.body -like '*GitCore run summary*' -and $_.body -match "PR #$PrNum\b" }) | Select-Object -Last 1
  if ($null -eq $s -or $s.body -notmatch 'actions/runs/(\d+)') { throw "no GitCore run summary names PR #$PrNum yet (is the run finished?)" }
  $RunId = $Matches[1]
}

$run = Get-Api "/actions/runs/$RunId"
if ($run.status -ne 'completed') { throw "run $RunId is still $($run.status); wait for it to finish" }
$start = ConvertTo-Utc $run.run_started_at
$end = ConvertTo-Utc $run.updated_at
$since = $start.AddMinutes(-1).ToString("yyyy-MM-ddTHH:mm:ssZ")
$comments = Get-ApiList "/issues/comments?since=$since&sort=created&direction=asc&per_page=100" |
  Where-Object { (ConvertTo-Utc $_.created_at) -le $end.AddMinutes(5) }

$summary = $comments | Where-Object { $_.body -like '*GitCore run summary*' -and $_.body -match "runs/$RunId\b" } | Select-Object -Last 1
if ($null -eq $summary) { throw "run $RunId has no 'GitCore run summary' comment (finalize did not run?)" }
$sb = $summary.body
$IssueNo = ($summary.issue_url -split '/')[-1]

# ------------------------------------------------------------------ parse the summary
$stageNames = @('Requirements', 'Design', 'Implementation', 'Testing')
$passes = @()
foreach ($n in $stageNames) { $passes += [bool]($sb -match "\|\s*\d $n\s*\|\s*pass") }
$attempts = ""; $redesigns = ""
if ($sb -match 'attempts (\d+), redesigns (\d+)') { $attempts = $Matches[1]; $redesigns = $Matches[2] }
$runPr = ""; $ci = ""
if ($sb -match 'PR #(\d+)[^|]*CI:\s*([\w-]+)') { $runPr = $Matches[1]; $ci = $Matches[2] }
elseif ($sb -match 'no PR[^|]*CI:\s*([\w-]+)') { $ci = $Matches[1] }
$verdicts = @{}
foreach ($m in [regex]::Matches($sb, 'Review round (\d) \|\s*(\w+)')) { $verdicts[$m.Groups[1].Value] = $m.Groups[2].Value }
$tokB = ""; $usdB = 0.0; $tokR = ""; $usdR = 0.0
if ($sb -match 'Builder tokens: (\d+) \(\$([\d.]+)\)') { $tokB = $Matches[1]; $usdB = [double]$Matches[2] }
if ($sb -match 'reviewer tokens: (\d+) \(\$([\d.]+)\)') { $tokR = $Matches[1]; $usdR = [double]$Matches[2] }

$stop = $comments | Where-Object { $_.body -like 'GitCore stopped*' -and $_.issue_url -eq $summary.issue_url } | Select-Object -Last 1
$status = ""; $reason = ""
if ($stop) {
  if ($stop.body -match 'Status: `(\w+)`') { $status = $Matches[1] }
  if ($stop.body -match 'Reason:\s*(.+)') { $reason = $Matches[1] }
} elseif ($runPr) { $status = "ready" } else { $status = "unknown" }
# keep the reason short and free of links (stop reasons can contain provider account URLs)
$reason = ($reason -replace 'https?://\S+', '<url>' -replace '[\r\n]+', ' ').Trim()
if ($reason.Length -gt 120) { $reason = $reason.Substring(0, 120) + "..." }

$reviewerModel = ""
if ($runPr) {
  $rv = $comments | Where-Object { $_.body -like '## GitCore independent review*' -and $_.body -match "PR #$runPr\b" } | Select-Object -Last 1
  if ($rv -and $rv.body -match 'reviewer model `([^`]+)`') { $reviewerModel = $Matches[1] }
}

# stage columns: pass ... first non-pass (fail / clarify / budget) ... skip
$st = @()
$broken = $false
for ($i = 0; $i -lt 4; $i++) {
  if ($broken) { $st += 'skip' }
  elseif ($passes[$i]) { $st += 'pass' }
  else {
    $broken = $true
    if ($i -eq 0 -and $status -eq 'needs_clarification') { $st += 'clarify' }
    elseif ($status -eq 'budget_hit') { $st += 'budget' }
    else { $st += 'fail' }
  }
}
$isDraft = $sb -match 'PR #\d+ \(draft\)'   # failed run that still opened a draft PR with its partial work
if ($runPr -and $isDraft) { $s5 = 'draft' }
elseif ($runPr) { if ($ci -eq 'success') { $s5 = 'pass' } else { $s5 = 'fail' } }
elseif ($broken) { $s5 = 'skip' } else { $s5 = 'fail' }
$r1 = 'skip'; if ($verdicts.ContainsKey('1')) { $r1 = $verdicts['1'] }
$r2 = 'skip'; if ($verdicts.ContainsKey('2')) { $r2 = $verdicts['2'] }
$lastVerdict = ""
if ($verdicts.ContainsKey('2')) { $lastVerdict = $verdicts['2'] } elseif ($verdicts.ContainsKey('1')) { $lastVerdict = $verdicts['1'] }
$final = $status; if ($lastVerdict) { $final = "$status/$lastVerdict" }

# ------------------------------------------------------------------ hidden tests
$hp = ""; $ht = ""; $expected = ""; $correct = ""
$hRef = $Ref; if (-not $hRef -and $runPr) { $hRef = $runPr }
if ($PrNum -and $runPr -and $PrNum -ne $runPr) { Write-Host "warning: run $RunId opened PR #$runPr, not #$PrNum" }
if ($hRef) {
  $h = Invoke-Hidden $hRef
  $hp = $h.passed; $ht = $h.total
  if ($h.passed -eq $h.total -and $h.total -gt 0) { $expected = 'approve' } else { $expected = 'request_changes' }
  if ($lastVerdict) { $correct = ([string]($lastVerdict -eq $expected)).ToLower() }
} else {
  Write-Host "== no PR for run $RunId (status: $status), so no hidden tests to run"
}

Write-Host ""
Write-Host ("run {0} ({1}, issue #{2}): stages {3} | release {4} | review {5}/{6} | final {7} | attempts {8} redesigns {9} | hidden {10}/{11} | tokens {12}+{13}" -f `
  $RunId, $Item, $IssueNo, ($st -join ','), $s5, $r1, $r2, $final, $attempts, $redesigns, $hp, $ht, $tokB, $tokR)
if ($reason) { Write-Host "  stop reason: $reason" }
if ($NoRecord) { Write-Host "(-NoRecord: results.csv and runs.md not changed)"; exit 0 }

# ------------------------------------------------------------------ record
if (-not $BuilderModel) {
  $prev = @(Get-CsvRows | Where-Object { $_.builder_model }) | Select-Object -Last 1
  if ($prev) { $BuilderModel = $prev.builder_model }
  else { Write-Host "note: builder_model left empty; pass -BuilderModel <code> (the MODEL_BUILDER repo variable)" }
}
$noteParts = @()
if ($status -eq 'needs_clarification') { $noteParts += 'clarified' }
if ($isDraft) { $noteParts += "draft PR (CI $ci)" }
if ($reason) { $noteParts += $reason }
if ($Notes) { $noteParts += $Notes }
$prUrl = ""; if ($runPr) { $prUrl = "https://github.com/$Slug/pull/$runPr" }

$row = [ordered]@{
  run_id = $RunId; run_type = 'issue'; item = $Item; variant = $Variant
  builder_model = $BuilderModel; reviewer_model = $reviewerModel
  s1_spec = $st[0]; s2_design = $st[1]; s3_impl = $st[2]; s4_test = $st[3]; s5_release = $s5
  s6_review_r1 = $r1; s6_review_r2 = $r2; final_status = $final
  impl_attempts = $attempts; redesigns = $redesigns
  hidden_passed = $hp; hidden_total = $ht
  expected_verdict = $expected; reviewer_correct = $correct; defect_caught = ''
  tokens_builder = $tokB; tokens_reviewer = $tokR
  usd_total = Format-Num ($usdB + $usdR) '{0:0.0000}'
  duration_min = Format-Num ($end - $start).TotalMinutes '{0:0.0}'
  actions_run_url = $run.html_url; pr_url = $prUrl
  notes = ($noteParts -join '; ')
}
Save-CsvRow $row
$prCell = "-"; if ($runPr) { $prCell = "[#$runPr]($prUrl)" }
$mdRow = "| $($start.ToString('yyyy-MM-dd')) | $Item | $Variant | [$RunId]($($run.html_url)) | $prCell | $r1 | $r2 | $final |"
Save-MdRow '| Date | Item |' "actions/runs/$RunId)" $mdRow $Item $IssueNo

Write-Host ""
Write-Host "recorded run $RunId ($Item, issue #$IssueNo): $final; hidden $hp/$ht; tokens $tokB+$tokR; `$$($row.usd_total); $($row.duration_min) min"
Write-Host "  -> $CsvPath"
Write-Host "  -> $RunsMd"
