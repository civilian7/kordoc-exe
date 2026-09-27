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
| PNG·JPEG 래스터 (`render --format png/jpeg`, `crop`, `tables --visual`) | `sharp` 필요 — 「PNG 래스터에는 sharp가 필요합니다」를 내고 exit 1. SVG·HTML 은 됨. `tables` 자체(분류 JSON)도 됨 |

`render --format pdf` 는 됩니다. `puppeteer-core` 를 번들하고, PC 에 설치된 **Chrome/Edge** 를 띄워 인쇄합니다.

## 사용법

아래 옵션은 `kordoc.exe --help`·`kordoc.exe <명령> --help` 출력(v4.15.6)을 정리한 것입니다.
★표시는 **이 exe 에서 동작하지 않는 것**입니다(위 「지원하지 않는 것」).

### 문서 → 마크다운 (기본 명령)

```powershell
kordoc 문서.hwpx                         # 표준 출력으로
kordoc 문서.hwp -o 문서.md               # 파일로(그림은 옆의 images\ 에)
kordoc *.pdf -d out                      # 여러 파일 → out\<이름>.md, 그림은 out\images\
kordoc 보고서.pdf -p 1-3 --no-header-footer
kordoc 신청서.hwpx --format json --image-refs -o 신청서.json
kordoc 비밀.hwpx --password 1234
```

입력: HWP(3·5)·HWPX·PDF·XLSX·XLS·DOCX. ★이미지(PNG·JPG·WebP)는 OCR 이라 이 exe 에서 안 됩니다.

| 옵션 | 뜻 |
|---|---|
| `-o, --output <path>` | 출력 파일(파일 하나일 때). 그림은 그 옆 `images\` 에 저장 |
| `-d, --out-dir <dir>` | 출력 폴더(여러 파일일 때). 본문의 그림 링크에 `images/` 가 붙는다 |
| `-p, --pages <range>` | 쪽 범위 `1-3`·`1,3,5`. 한컴 저장본은 실제 쪽, 조판 캐시가 없으면 섹션 근사 |
| `--format <type>` | `markdown`(기본) · `json` · `chunks`(RAG 용 구조 청크 JSON — 제목·개조식 위계 경로 + 표 독립 청크) |
| `--no-header-footer` | PDF 머리글·바닥글 자동 제거를 끈다(기본: 제거) |
| `--no-tables` | PDF 표 감지를 끈다 — 테두리 상자를 표로 잘못 읽어 순서가 뒤집히는 2단 시험지 등에 |
| `--dedupe-headers` | HWP5 레이아웃 표 쪽마다 되풀이되는 머리 제거(기본 끔 — 붙임별 재번호가 지워질 수 있음) |
| `--keep-empty-cols` | 표 오른쪽 끝 빈 열(서식 입력란) 보존(기본: 잘라냄) |
| `--keep-empty-paragraphs` | 빈 문단 보존(기본: 제거) |
| `--inline-images` | 그림을 base64 data URI 로 본문에 넣는다(BMP→PNG 압축). **HWP5 만** — 다른 형식은 파일 저장 유지 |
| `--image-refs` | `--format json` 에서 그림 바이트 대신 `images/<파일명>` 참조만(그림 수백 장 문서용, `-o`/`-d` 와 함께) |
| `--no-images` | 그림을 뽑지 않는다(자리 표시는 남김). PDF 는 PNG 인코딩을 건너뛰어 빨라진다 |
| `--password <pw>` | 열기 암호(HWPX·HWP3·HWP5). 한컴 DRM 문서는 해당 없음 |
| `--silent` | 진행 메시지 숨김(오류는 stderr 로 그대로) |
| ★`--ocr` · `--ocr-force` · `--formula-ocr` | 스캔 PDF 글자 OCR · 전 쪽 강제 OCR · 수식 OCR |

### 하위 명령

| 명령 | 하는 일 | exe |
|---|---|---|
| `generate`(`gen`) | 마크다운 → 공문서 HWPX | ✔ |
| `fill` | 서식 문서의 빈칸 채우기(내장 기안문 포함) | ✔ |
| `patch` | 고친 마크다운을 원본 HWPX/HWP 에 서식 그대로 반영 | ✔ |
| `seal` | 도장·서명 그림을 앵커 문구 위에 얹기 | ✔ |
| `redact` | 개인정보를 원본 서식 그대로 가리기 | ✔ |
| `validate` | HWPX 구조 검증(한컴독스 거부 요인 사전 점검) | ✔ |
| `lint` | 공문서 표기법 검수(행정업무운영 편람) | ✔ |
| `profile` | 참조 HWPX 의 표 서식을 JSON 으로 뽑기(`generate --profile` 용) | ✔ |
| `render` | HWPX·HWP 를 SVG·HTML·PDF 로 레이아웃 그대로 | ✔(★PNG·JPEG) |
| `tables` | 표 추출·분류(의미표/레이아웃/불확실) JSON | ✔(★`--visual`) |
| `crop` | 표·그림·문단·도형 영역을 잘라 PNG 로 | ★ |
| `watch` | 폴더 감시 — 새 문서 자동 변환 | ✔ |
| `mcp` | MCP 서버(Claude·Cursor·Windsurf) — `kordoc-mcp.exe` 와 같다 | ✔ |
| `parse-worker` · `render-worker` | 상주 워커(표준 입력 NDJSON → 한 줄 JSON / SVG) — 파일마다 기동하는 비용 제거 | ✔ |
| `setup` | AI 클라이언트 자동 등록 마법사(대화형) | 시험 안 함 |
| `check-ocr-models` · `check-formula-models` · `models` | OCR·수식 모델 상태 확인·내려받기·폐쇄망 반입 | ★(모델은 받아지나 exe 가 쓰지 못함) |

#### generate — 마크다운 → HWPX

```powershell
kordoc generate 보고서.md -o 보고서.hwpx --preset 보고서 --org 서울특별시 --toc
kordoc gen 메모.md -o 메모.hwpx --plain --image-dir .       # 공문서 서식 없이 범용 변환
Get-Content 글.md | kordoc gen - -o 글.hwpx                  # 표준 입력
```

| 옵션 | 뜻 |
|---|---|
| `-o <path>` | 출력(기본 `<입력>.hwpx`) |
| `--preset <name>` | `기안문`(기본)·`보고서`·`계획서`·`통지`·`회의록`·`개조식`(표지·목차·장 머리 자동)·`업무보고`(중앙부처 양식)·`보도자료` |
| `--plain` | 공문서 모드를 끈다 — 범용 마크다운 변환 |
| `--font <type>` · `--pt <n>` · `--line-spacing <%>` | 본문 글꼴 `myeongjo`(함초롬바탕)·`gothic`(맑은 고딕), 크기, 줄 간격 |
| `--fonts <spec>` | 요소별 글꼴 `body=나눔명조,heading=나눔고딕,ref=…,table=…` |
| `--sizes <spec>` | 개조식 요소별 크기 `dae=16,cham=13,table=12,coverTitle=30` |
| `--levels <spec>` | 항목 부호 단계별 모양 `0=HY견고딕/17/bold,1=한컴돋움/15/bold,…`(깊이 0~7) |
| `--bullet2 <char>` | 2단계 부호 `ㅇ`(기안문·공고문) 또는 `○`(보고서) |
| `--suppress-single` | 형제가 하나뿐인 항목의 부호 생략(편람 규정) |
| `--h2-marker <type>` | 장 제목 표기 `band`(보고서·계획서 기본)·`roman`(Ⅰ.)·`number`(1.)·`box`(□)·`none` |
| `--band-color` · `--band-text-color` | 띠 제목 번호 칸 채움색·글자색 `#RRGGBB` |
| `--toc`/`--no-toc` · `--cover`/`--no-cover` | 목차·표지 켜고 끄기 |
| `--page-numbers`/`--no-page-numbers` · `--end-mark`/`--no-end-mark` | 쪽 번호(`- 1 -`)·본문 끝 「끝.」 |
| `--no-body-title-box` | 본문 첫 쪽 제목 반복 상자 끄기 |
| `--org` · `--dept` · `--date` · `--cover-label` | 표지 기관명·부서명·날짜·취급 표시(`대외주의` 등) |
| `--doc-info <spec>` | 보고서 표지 문서정보표 `docNum=…,date=…,disclosure=…` |
| `--summary <text>` · `--report-info <text>` | 보고서 요약 상자 · 담당자 행 |
| `--approval <labels>` | 결재란 직위 `담당,팀장,과장` |
| `--doc-head` · `--doc-foot` | 기안문 두문(기관·수신·제목)·결문(발신명의·기안자·결재자·연락처 …) |
| `--notice-head` · `--press-head` · `--press-sub` | 공고문 두문·결문 · 보도자료 머리 · 부제 |
| `--profile <json>` | `kordoc profile` 로 뽑은 표 서식 재현 |
| `--paper <size>` · `--landscape` · `--columns <n>` | 용지(`A4`·`A3`·`B4`·`B5`·`Letter`·`210x297`) · 가로 · 다단(1~8) |
| `--header` · `--footer` | 머리말·꼬리말(인라인 마크다운 허용) |
| `--image-dir <dir>` | 그림 참조를 이 폴더에서 읽어 실제 그림으로 넣는다(아래 「알려진 문제」) |

#### fill — 서식 채우기

```powershell
kordoc fill 신청서.hwpx -f "성명=홍길동,전화=010-1234-5678" -o 결과.hwpx
kordoc fill 신청서.hwpx -j 값.json -o 결과.hwpx
kordoc fill --template gian -f "제목=예산 집행 계획,수신자=각 부서장" -o 기안.hwpx   # 내장 일반기안문
kordoc fill --list-templates                                   # 내장 서식과 칸 이름(제목·수신자·기안자 …)
kordoc fill 신청서.hwpx --dry-run                              # 채울 칸 목록만
```

| 옵션 | 뜻 |
|---|---|
| `-f, --fields <pairs>` · `-j, --json <path>` | 채울 값(`key=value` 쉼표 또는 JSON) · JSON 파일 |
| `-o <path>` | 출력 — 확장자가 형식을 정한다(`.md`·`.hwpx`) |
| `--format <type>` | `hwpx-preserve`(기본, 원본 서식 보존)·`hwpx`·`markdown` |
| `--formats <json>` | 칸별 값 서식 `{"날짜":"yy.mm.dd","주민등록번호":"rrn:masked"}` |
| `--template <name>` | 내장 서식 `gian`(일반기안문)·`gian-simple`(간이기안문) — exe 옆 `templates\` 에서 읽는다 |
| `--require-unique` | 한 키가 두 곳 이상에 맞으면 채우지 않고 거부 |
| `--mask` | 채운 값을 표준 출력에 드러내지 않는다 |
| `--dry-run` | 채우지 않고 칸 목록만 |

#### patch · seal · redact

```powershell
kordoc patch 원본.hwpx 고친.md -o 출력.hwpx      # 적용 못 한 편집이 있으면 exit 2
kordoc seal 신청서.hwpx --image 도장.png --anchor "(인)" -o 결과.hwpx
kordoc redact 명부.hwpx -o 명부.가림.hwpx
kordoc redact *.pdf -d out --rules rrn,phone,name --dry-run --json
```

| 명령 | 옵션 |
|---|---|
| `patch` | `-o`(기본 `<원본>.patched.hwpx`) · `--no-verify`(패치 뒤 다시 읽어 검증하는 단계 생략) |
| `seal` | `--image` · `--anchor`(기본 `(인)`) · `-n`(같은 앵커가 여럿일 때 0부터) · `--size-mm` · `--mode overlap/right/auto` · `--dx`·`--dy`(mm 미세 조정) · `-o`(기본 `<입력>.sealed.hwpx`) |
| `redact` | `--rules`(기본 `rrn,phone,email,card,account,brn,passport,driver`, 선택 `crn,ip,name,address`) · `--mask-char`(기본 `●`) · `-o`/`-d` · `--dry-run` · `--json`. HWPX/HWP 는 원본 서식 그대로 같은 길이로 가린 파일, 그 밖(PDF 등)은 가린 마크다운만. **자동 검출 보조 도구 — 결과는 사람이 확인** |

#### render · tables · validate · lint · profile · watch

```powershell
kordoc render 문서.hwpx -o 문서.svg                 # 전 쪽 세로로 쌓은 SVG
kordoc render 문서.hwpx --format pdf -o 문서.pdf    # Chrome/Edge 필요
kordoc render 문서.hwpx --format html --highlight "예산,집행"
kordoc tables 문서.hwpx --cells -o 표.json
kordoc validate 생성본.hwpx --json
kordoc lint 원고.md --munche
kordoc profile 참조.hwpx -o 서식.json
kordoc watch C:\받은문서 -d C:\변환
```

| 명령 | 옵션 |
|---|---|
| `render` | `--format svg`(기본)·`html`·`pdf`(★`png`·`jpeg`) · `-o`/`-d`(쪽별) · `--pages` · `--title` · `--browser <path>`(PDF 용 크로미움) · `--highlight <terms>` · `--no-reflow`(조판 캐시 없는 문서가 빈 쪽이 될 수 있음) · `--reflow-mode keep/charAll` · `--max-width` |
| `tables` | `-o`(기본 표준 출력) · `--cells`(칸 글자 격자 포함) · ★`--visual`·`-d`·`--crop-format`·`--padding` |
| `validate` | `--json` |
| `lint` | `--json` · `--munche`(개조식 문체 검수 병행). error 가 있으면 exit 1 |
| `profile` | `-o`(기본 `<입력>.profile.json`) |
| `watch` | `-d` · `-p` · `--format markdown/json` · `--webhook <url>`(결과 전송) |

### 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 1 | 실패(없는 파일·파싱 실패·암호 틀림·`lint` 의 error 등) — 까닭은 stderr 에 `[kordoc] 오류: …` |
| 2 | `patch` 에서 적용하지 못한 편집이 있음 |

### 알려진 문제 (upstream)

| 증상 | 피하는 법 | 이슈 |
|---|---|---|
| **암호 걸린 HWPX 를 `--password` 없이 넘기면 끝나지 않는다**(HWP5·HWP3 은 곧바로 실패) | 넘기기 전에 `META-INF/manifest.xml` 에 `encryption-data` 가 있는지 보고 거른다 | [#93](https://github.com/chrisryugj/kordoc/issues/93) |
| `-o` 로 내면 그림은 `images\` 에 저장되지만 본문 링크에 `images/` 가 없다(`-d` 는 정상) | `-d` 를 쓰거나, 링크 `image_` 앞에 `images/` 를 붙인다 | [#94](https://github.com/chrisryugj/kordoc/issues/94) |
| `generate --image-dir` 가 **이름이 ASCII 가 아닌 그림**(`재고-합계.png`)을 경고 없이 뺀다 | 그림을 영문 이름으로 복사하고 링크를 바꿔 넘긴다 | [#95](https://github.com/chrisryugj/kordoc/issues/95) |
| 같은 그림이 여러 번 나오면 나올 때마다 따로 저장한다 | 내용 해시로 합친다 | — |

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
