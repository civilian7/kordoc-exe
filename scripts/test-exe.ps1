<#
.SYNOPSIS
  scripts/build-exe.ts 로 만든 kordoc.exe 를 upstream 원본 소스(node + tsx)와 같은 명령으로 돌려 비교한다.

.DESCRIPTION
  out/ 을 node_modules 가 없는 임시 폴더로 복사해 실행한다 — 배포 상황을 재기 위해서다.
  리포지토리 안에서 돌리면 external 모듈이 우연히 node_modules 에서 풀려 결함이 가려진다.
  HWPX 같은 산출 파일은 zip 시각값이 달라질 수 있어, exe 로 다시 파싱한 마크다운끼리 비교한다.
  샘플을 주지 않은 형식은 건너뛴다. 기본값은 upstream/tests/fixtures 의 문서다.

.EXAMPLE
  bun scripts/build-exe.ts
  & scripts/test-exe.ps1 -Hwpx a.hwpx -Hwp b.hwp -Pdf c.pdf,d.pdf -Docx e.docx -Xlsx f.xlsx

  ★PowerShell 세션 안에서 & 로 부를 것 — pwsh -File 로 부르면 -Pdf a,b 가 배열로 묶이지 않는다.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [string]   $Hwpx,
  [string]   $Hwp,
  [string[]] $Pdf = @(),
  [string]   $Docx,
  [string]   $Xlsx,
  [string]   $Xls,
  [string]   $Image,
  [switch]   $KeepWork
)

$ErrorActionPreference = 'Continue'
$env:NODE_NO_WARNINGS = 1
$ROOT = Split-Path $PSScriptRoot
$REPO = Join-Path $ROOT 'upstream'
if (-not $Hwpx) { $Hwpx = "$REPO\tests\fixtures\dummy.hwpx" }
if (-not $Xls) { $Xls = "$REPO\tests\fixtures\xls\roster.xls" }
if (-not $Image) { $Image = "$REPO\docs\video-demo.jpg" }
$PWD5 = "$REPO\tests\fixtures\password\HWP5-password-123456.hwpx"

if (-not (Test-Path "$ROOT\out\kordoc.exe")) {
  throw 'out\kordoc.exe 가 없습니다 — 먼저 bun scripts/build-exe.ts'
}

$T = Join-Path ([IO.Path]::GetTempPath()) "kordoc-exe-test-$PID"
$DIST = Join-Path $T 'dist'
$W = Join-Path $T 'work'
Copy-Item "$ROOT\out" $DIST -Recurse
foreach ($k in 'exe', 'node', 'in') {
  New-Item -ItemType Directory -Force (Join-Path $W $k) | Out-Null
}

$EXE = Join-Path $DIST 'kordoc.exe'

$MD = Join-Path $W 'in\report.md'
[IO.File]::WriteAllText($MD, @'
# 2026년 시스템 점검 결과 보고

## 1. 추진 배경

- 노후 장비 교체 필요성 대두
- 담당자 연락처: 010-1234-5678, 주민번호 900101-1234567

## 2. 점검 결과

| 구분 | 대상 | 결과 |
|---|---|---|
| 서버 | 12대 | 정상 |
| 네트워크 | 4식 | 교체 필요 |

붙임 점검표 1부. 끝.

(인)
'@, [Text.UTF8Encoding]::new($false))

$results = [Collections.Generic.List[object]]::new()

function Invoke-K([string]$Who, [string[]]$A, [string]$StdIn) {
  if ($Who -eq 'exe') {
    $cmd = $EXE
    $pre = @()
  }
  else {
    $cmd = 'node'
    $pre = @('--import', 'tsx', "$REPO\src\cli.ts")
  }

  Push-Location $REPO
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    if ($StdIn) {
      $out = $StdIn | & $cmd @pre @A 2>$null | Out-String
    }
    else {
      $out = & $cmd @pre @A 2>$null | Out-String
    }

    $code = $LASTEXITCODE
    $sw.Stop()
  }
  finally {
    Pop-Location
  }

  [pscustomobject]@{ Out = $out; Code = $code; Ms = $sw.ElapsedMilliseconds }
}

# {W} 는 대상별 작업 폴더로 치환 — exe 와 node 의 산출물을 섞지 않는다
function Test-K([string]$Name, [string[]]$A, [scriptblock]$Post, [string]$StdIn) {
  $r = @{}
  foreach ($who in 'exe', 'node') {
    $dir = Join-Path $W $who
    $args2 = $A | ForEach-Object { $_.Replace('{W}', $dir) }
    $x = Invoke-K $who $args2 $StdIn
    $cmp = if ($Post) { & $Post $dir $x } else { $x.Out }
    $r[$who] = [pscustomobject]@{ Cmp = [string]$cmp; Code = $x.Code; Ms = $x.Ms }
  }

  $e = $r['exe']
  $n = $r['node']
  $flat = $e.Cmp -replace '\s+', ' '
  $results.Add([pscustomobject]@{
      Test     = $Name
      Same     = ($e.Cmp -eq $n.Cmp) -and ($e.Code -eq $n.Code)
      ExeCode  = $e.Code
      NodeCode = $n.Code
      ExeLen   = $e.Cmp.Length
      NodeLen  = $n.Cmp.Length
      ExeMs    = $e.Ms
      NodeMs   = $n.Ms
      Head     = $flat.Substring(0, [Math]::Min(120, $flat.Length))
    })
}

function Reparse([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return "<없음: $(Split-Path $Path -Leaf)>"
  }

  & $EXE --silent -- $Path 2>$null | Out-String
}

function Get-Size([string]$Path) {
  (Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue).Length
}

# ── 1. 파싱 ──
# ★-LiteralPath — 공문서 파일명의 [별표 1] 같은 대괄호를 와일드카드로 읽으면 없는 파일로 판정된다
$docs = @($Hwpx, $Hwp) + $Pdf + @($Docx, $Xlsx, $Xls) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
foreach ($f in $docs) {
  Test-K "parse $(Split-Path $f -Leaf)" @('--silent', '--', $f)
}

Test-K 'parse --format json (hwpx)' @('--silent', '--format', 'json', '--', $Hwpx)
Test-K 'parse -d 여러 파일' @(@('--silent', '-d', '{W}\multi', '--') + $docs) {
  param($d)
  (Get-ChildItem "$d\multi" -Recurse -File | Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Length)" }) -join ','
}
if ($Docx) {
  Test-K 'parse --format chunks (docx)' @('--silent', '--format', 'chunks', '--', $Docx)
  Test-K 'parse -o (docx)' @('--silent', '-o', '{W}\docx.md', '--', $Docx) { param($d) Get-Content "$d\docx.md" -Raw }
}
if ($Hwp) {
  Test-K 'parse --no-images (hwp5)' @('--silent', '--no-images', '--', $Hwp)
}
if ($Pdf.Count -gt 0) {
  Test-K 'parse -p 1 (pdf)' @('--silent', '-p', '1', '--', $Pdf[0])
  Test-K 'parse --no-tables (pdf)' @('--silent', '--no-tables', '--', $Pdf[0])
  Test-K 'redact (pdf → md)' @('redact', $Pdf[0])
}
Test-K '암호 맞음' @('--silent', '--password', '123456', '--', $PWD5)
Test-K '암호 틀림' @('--silent', '--password', '000000', '--', $PWD5)

# ── 2. 생성·편집 ──
Test-K 'generate md → hwpx' @('generate', $MD, '-o', '{W}\gen.hwpx', '--preset', '보고서') { param($d) Reparse "$d\gen.hwpx" }
Test-K 'validate' @('validate', '{W}\gen.hwpx')
Test-K 'lint' @('lint', $MD)
# ★-o 를 빼면 입력 문서 옆에 .profile.json 을 쓴다 — 남의 폴더를 더럽히지 않게 반드시 지정
Test-K 'profile' @('profile', $Hwpx, '-o', '{W}\profile.json') { param($d) Get-Size "$d\profile.json" }
Test-K 'fill --template' @('fill', '--template', 'gian', '-f', '제목=시스템 점검,본문=점검 결과를 보고합니다,기안자=홍길동', '-o', '{W}\fill.hwpx') {
  param($d)
  Reparse "$d\fill.hwpx"
}
foreach ($k in 'exe', 'node') {
  $edited = (Reparse "$W\$k\gen.hwpx").Replace('노후 장비', '신규 장비')
  [IO.File]::WriteAllText("$W\$k\edited.md", $edited, [Text.UTF8Encoding]::new($false))
}
Test-K 'patch' @('patch', '{W}\gen.hwpx', '{W}\edited.md', '-o', '{W}\patched.hwpx') { param($d) Reparse "$d\patched.hwpx" }
Test-K 'seal' @('seal', '{W}\gen.hwpx', '--image', $Image, '--anchor', '(인)', '-o', '{W}\seal.hwpx') { param($d) Reparse "$d\seal.hwpx" }
Test-K 'redact (hwpx)' @('redact', '{W}\gen.hwpx', '-o', '{W}\redact.hwpx') { param($d) Reparse "$d\redact.hwpx" }

# ── 3. 렌더 ── PNG 래스터(render png·crop)는 exe 미지원이라 넣지 않는다
Test-K 'render svg' @('render', $Hwpx, '-o', '{W}\r.svg') { param($d) Get-Size "$d\r.svg" }
Test-K 'render svg (생성본 reflow)' @('render', '{W}\gen.hwpx', '-o', '{W}\rg.svg') { param($d) Get-Size "$d\rg.svg" }
Test-K 'render html' @('render', $Hwpx, '--format', 'html', '-o', '{W}\r.html') { param($d) Get-Size "$d\r.html" }
Test-K 'render pdf (Chrome/Edge 필요)' @('render', '{W}\gen.hwpx', '--format', 'pdf', '-o', '{W}\r.pdf') { param($d) Reparse "$d\r.pdf" }
Test-K 'tables' @('tables', $Hwpx)

# ── 4. 상주 실행 ──
$req = @(
  (@{ id = 1; file = $Hwpx; images = $false } | ConvertTo-Json -Compress),
  (@{ id = 2; file = 'C:\없는파일.hwpx' } | ConvertTo-Json -Compress),
  '{"cmd":"quit"}'
) -join "`n"
Test-K 'parse-worker' @('parse-worker') -StdIn $req -Post {
  param($d, $x)
  ($x.Out -split "`n" | Where-Object { $_ } | ForEach-Object { $_ -replace '"rss":\d+', '' -replace '"version":"[^"]*"', '' }) -join "`n"
}

$mcp = @(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}',
  '{"jsonrpc":"2.0","method":"notifications/initialized"}',
  (@{ jsonrpc = '2.0'; id = 2; method = 'tools/call'; params = @{ name = 'parse_document'; arguments = @{ file_path = $Hwpx } } } | ConvertTo-Json -Compress -Depth 5)
) -join "`n"
# 소스 실행은 버전이 0.0.0-dev 라 serverInfo 는 비교에서 뺀다
Test-K 'mcp parse_document' @('mcp') -StdIn $mcp -Post { param($d, $x) $x.Out -replace '"version":"[^"]*"', '' }

$results | Format-Table Test, Same, ExeCode, NodeCode, ExeLen, NodeLen, ExeMs, NodeMs -AutoSize
$fail = @($results | Where-Object { -not $_.Same })
$fail | Format-List Test, ExeCode, NodeCode, Head
"통과 $($results.Count - $fail.Count) / $($results.Count)"

if (-not $KeepWork) {
  Remove-Item $T -Recurse -Force
}
else {
  "작업 폴더: $T"
}

exit [int]($fail.Count -gt 0)
