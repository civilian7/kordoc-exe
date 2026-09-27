# kordoc-exe

[kordoc](https://github.com/chrisryugj/kordoc)(HWP·HWPX·PDF·DOCX·XLSX → Markdown CLI/MCP 서버)을
[Bun](https://bun.sh) 으로 **Node.js 설치 없이 실행되는 Windows 실행 파일**로 빌드하는 스크립트 모음입니다.

원본 소스는 이 저장소에 없습니다. `upstream/` 에 **git submodule** 로 원본을 참조하고, 빌드할 때만
필요한 부분을 번들 단계에서 치환합니다. 원본 저장소는 수정하지 않습니다.

| | |
|---|---|
| 참조하는 원본 | `chrisryugj/kordoc` @ `bf53887` (v4.15.6 + 손상 PDF 무한 루프 수정) |
| 대상 | Windows x64 |
| 산출물 | `kordoc.exe`(CLI) · `kordoc-mcp.exe`(MCP 서버), 각 약 113MB |

## 빌드

```powershell
git clone --recurse-submodules https://github.com/civilian7/kordoc-exe
cd kordoc-exe
bun scripts/build-exe.ts
```

`out/` 에 다음이 생깁니다. **배포할 때는 폴더째 옮깁니다** — exe 만 옮기면 내장 서식과
PDF cMap(한글 CID 폰트용)이 빠집니다.

```
out/
  kordoc.exe
  kordoc-mcp.exe
  pdfjs/        cmaps · standard_fonts
  templates/    내장 기안문 서식 (fill --template)
  LICENSE  NOTICE  THIRD_PARTY/
```

의존성은 루트의 `bun.lock` 으로 고정합니다(아래 시험을 통과한 버전). 스크립트가
`upstream/` 안에서 `bun install --frozen-lockfile` 을 먼저 돌립니다.

| 옵션 | |
|---|---|
| `--update-lock` | 잠금을 무시하고 새로 풀어 `bun.lock` 을 갱신 (upstream 을 올릴 때) |
| `--no-minify` | 축소하지 않음 |
| `--debug` | kordoc 이 사용자용 문구로 가리는 원본 예외를 stderr 로 출력 |
| `--full` | 선택 의존성(OCR)까지 번들 시도 — 아래 제약 때문에 동작하지 않음, 조사용 |

## 원본을 그대로 컴파일하면 안 되는 이유

`bun build src/cli.ts --compile` 은 통과하지만 실행하면 곧바로 죽습니다. 빌드 스크립트가
번들 로드 시점에 다음 네 곳을 치환합니다.

| 증상 | 원인 | 처리 |
|---|---|---|
| `Cannot find package 'cfb'` 로 즉시 종료 | `createRequire(import.meta.url)("cfb")` 를 번들러가 추적하지 못함 | 번들되는 일반 `require` 로 |
| 한글 CID 폰트 PDF 의 글자가 **조용히** 빠짐 | exe 안에서 `require.resolve("pdfjs-dist/…")` 실패를 `catch` 가 삼킴 | exe 옆 `pdfjs/` 에서 읽음 |
| `fill --template` 이 서식을 못 찾음 | `import.meta.url` 이 가상 경로(`B:\~BUN\root`) | exe 옆 `templates/` 를 후보에 추가 |
| PDF 변환 결과 앞에 경고 4줄이 섞임 | pdfjs 가 `@napi-rs/canvas` 를 찾다 실패해 **stdout** 으로 경고 | 텍스트 추출엔 불필요한 그 블록을 끔 |

치환 대상 문자열이 upstream 에서 사라지면 빌드가 **실패**합니다(조용히 넘어가지 않습니다).
upstream 을 올린 뒤 빌드가 여기서 멈추면 해당 치환을 새 소스에 맞게 고치면 됩니다.

## 지원하지 않는 것

| 기능 | 이유 |
|---|---|
| OCR (`--ocr`, `--formula-ocr`, 이미지 입력) | `onnxruntime-node`·`sharp` 네이티브 바이너리와 `pdfium.wasm` 을 exe 안에서 찾지 못함. `onnxruntime` 은 System32 의 구버전 `onnxruntime.dll` 을 대신 잡아 API 버전 불일치 |
| PNG 래스터 (`render --format png`, `crop`) | `sharp` 필요 — 안내문을 내고 종료. SVG·HTML 은 됨 |

`render --format pdf` 는 됩니다. `puppeteer-core` 를 번들하고, PC 에 설치된 **Chrome/Edge** 를 띄워 인쇄합니다.

## 시험

exe 를 node_modules 가 없는 임시 폴더로 옮겨, 같은 명령을 **exe** 와 **upstream 원본 소스(node + tsx)** 로
돌려 결과를 비교합니다. 바이너리 산출물(HWPX)은 다시 파싱한 마크다운끼리 비교합니다.

```powershell
# PowerShell 세션 안에서 & 로 호출 (pwsh -File 로는 -Pdf a,b 가 배열로 묶이지 않음)
& .\scripts\test-exe.ps1                                   # upstream/tests/fixtures 만으로 (21항목)
& .\scripts\test-exe.ps1 -Hwpx a.hwpx -Hwp b.hwp -Pdf c.pdf,d.pdf -Docx e.docx -Xlsx f.xlsx
```

v4.14.4 실측: 실제 문서를 넣어 **32/32 일치** — 파싱 7형식(HWPX·HWP5·PDF 2·DOCX·XLSX·XLS)과
`--format json/chunks`·`-p`·`-o`·`-d`·암호, `generate`·`validate`·`lint`·`profile`·`fill`·`patch`·
`seal`·`redact`·`render svg/html/pdf`·`tables`·`parse-worker`·`mcp`. exe 는 기동이 빨라 파일당 약 1.5~2배 빠릅니다.

v4.15.6 실측(2026-09-28): fixtures **21/21 일치**. 치환 네 곳 모두 새 소스에 그대로 걸렸다.
rhwp `samples/` 975건(HWP 536·HWPX 439) 파싱: 성공 972건, 실패 3건은 모두 암호 문서 —
그중 **암호 걸린 HWPX 는 끝나지 않는다**(upstream 결함, 호출하는 쪽에서 미리 걸러야 한다).

## 릴리스

GitHub 릴리스 `v<판>` 에 `kordoc-<판>-windows-x64.zip` 을 붙인다 — `out/` 에서 `kordoc-mcp.exe` 를
뺀 것을 **폴더 구조 그대로** 담는다(루트에 `kordoc.exe`·`pdfjs/`·`templates/`). LumiMD 가 이 이름으로
내려받는다(`LumiMD.Plugins` 의 `KORDOC_VER`).

## upstream 올리기

```powershell
git -C upstream fetch
git -C upstream checkout <새 태그 또는 커밋>
bun scripts/build-exe.ts --update-lock
& .\scripts\test-exe.ps1 …
git add upstream bun.lock
```

## 라이선스

이 저장소의 스크립트는 MIT 입니다. kordoc 은 chrisryugj 의 MIT 라이선스 저작물이며, 빌드 산출물에는
원본의 `LICENSE`·`NOTICE`·`THIRD_PARTY/` 가 함께 들어갑니다 — exe 를 배포할 때 이 파일들을 빼지 마세요.
