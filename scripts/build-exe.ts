/**
 * upstream/(chrisryugj/kordoc) 의 CLI·MCP 서버를 Bun 단일 실행 파일(Windows x64)로 빌드한다.
 *
 *   git submodule update --init
 *   bun scripts/build-exe.ts          # → out/kordoc.exe, out/kordoc-mcp.exe, out/pdfjs/, out/templates/
 *
 * 배포는 out/ 폴더째 — exe 만 옮기면 내장 서식과 PDF cMap(한글 CID 폰트)이 빠진다.
 *
 * 원본 소스는 건드리지 않고 번들 로드 시점에 치환한다. 치환 대상 문자열이 소스에서 사라지면
 * 조용히 넘어가는 대신 빌드를 실패시킨다 — 빌드만 되고 실행 때 깨지는 것이 가장 나쁘다.
 *
 * 지원하지 않는 것: OCR(--ocr·--formula-ocr), PNG 래스터(render --format png·crop).
 * sharp·onnxruntime-node 의 네이티브 바이너리와 pdfium.wasm 을 exe 안에서 찾지 못한다
 * (onnxruntime 은 System32 의 구버전 onnxruntime.dll 을 대신 잡아 API 버전 불일치로 죽는다).
 *
 * 옵션: --full(선택 의존성까지 번들 시도) · --no-minify · --debug(정제 전 예외를 stderr 로)
 *       --update-lock(루트 bun.lock 을 무시하고 새로 풀어 갱신 — upstream 판올림 때)
 */
import { readFileSync, cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const UP = join(ROOT, "upstream")
const OUT = join(ROOT, "out")
const LOCK = join(ROOT, "bun.lock")
const argv = new Set(process.argv.slice(2))

if (!existsSync(join(UP, "package.json"))) {
  console.error("[build-exe] upstream/ 이 비어 있다 — git submodule update --init")
  process.exit(1)
}

// 의존성: 루트 bun.lock 으로 시험한 버전을 고정한다. upstream 은 npm 기준이라 잠금 파일을 두지 않는다.
const updateLock = argv.has("--update-lock") || !existsSync(LOCK)
if (!updateLock) {
  copyFileSync(LOCK, join(UP, "bun.lock"))
}
else {
  rmSync(join(UP, "bun.lock"), { force: true })
}

const install = Bun.spawnSync(["bun", "install", ...(updateLock ? [] : ["--frozen-lockfile"])], {
  cwd: UP,
  stdout: "inherit",
  stderr: "inherit",
})
if (install.exitCode !== 0) {
  console.error("[build-exe] bun install 실패 — upstream 을 올렸다면 --update-lock")
  process.exit(1)
}

if (updateLock) {
  copyFileSync(join(UP, "bun.lock"), LOCK)
}

const pkg = JSON.parse(readFileSync(join(UP, "package.json"), "utf-8"))

// puppeteer-core 는 순수 JS(시스템 Chrome/Edge 를 띄움)라 번들해도 render --format pdf 가 동작한다.
const external = argv.has("--full") ? [] : [
  "onnxruntime-node",
  "@huggingface/transformers",
  "@hyzyla/pdfium",
  "sharp",
]

interface Patch {
  name: string
  file: RegExp
  from: string | RegExp
  to: string
}

const PATCHES: Patch[] = [
  {
    // createRequire(import.meta.url) 로 부른 require 는 번들러가 추적하지 못해 exe 에서
    // "Cannot find package 'cfb'" 로 즉시 죽는다 → Bun 이 번들하는 bare require 로 돌린다.
    name: "createRequire → bare require",
    file: /[\\/]src[\\/].*\.ts$/,
    from: /^const require = createRequire\(import\.meta\.url\)\s*$/m,
    to: "",
  },
  {
    // exe 안에서는 require.resolve 가 실패하고 catch 가 삼켜 cMap 없이 진행 → 한글 CID PDF 글자 소실
    name: "pdfjs 자산 경로",
    file: /[\\/]src[\\/]pdf[\\/]parser\.ts$/,
    from: `dirname(_require.resolve("pdfjs-dist/package.json"))`,
    to: `join(dirname(process.execPath), "pdfjs")`,
  },
  {
    // import.meta.url 이 exe 안에서는 가상 경로(B:\~BUN\root)라 templates/ 를 못 찾는다
    name: "내장 서식 경로",
    file: /[\\/]src[\\/]form[\\/]templates\.ts$/,
    from: "const candidates = [",
    to: `const candidates = [\n    join(dirname(process.execPath), "templates"),`,
  },
  {
    // pdfjs 는 Node 에서 무조건 @napi-rs/canvas 를 require 하는데 exe 에는 네이티브 바인딩이 없어
    // 경고 4줄이 stdout 으로 새어 변환 결과를 오염시킨다. 텍스트 추출엔 쓰지 않는 블록이다.
    name: "pdfjs canvas 폴리필 끄기",
    file: /pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.mjs$/,
    from: "if (isNodeJS) {\n  let canvas;",
    to: "if (false) {\n  let canvas;",
  },
]

if (argv.has("--debug")) {
  PATCHES.push({
    name: "디버그: 정제 전 예외 출력",
    file: /[\\/]src[\\/]utils\.ts$/,
    from: `return "문서 처리 중 오류가 발생했습니다"`,
    to: `console.error("[debug]", err); return "문서 처리 중 오류가 발생했습니다"`,
  })
}

const hits = new Map<string, number>(PATCHES.map((p) => [p.name, 0]))

const patchPlugin: import("bun").BunPlugin = {
  name: "kordoc-exe-patch",
  setup(build) {
    build.onLoad({ filter: /([\\/]src[\\/].*\.ts|pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.mjs)$/ }, async (args) => {
      let src = await Bun.file(args.path).text()
      for (const p of PATCHES) {
        if (!p.file.test(args.path)) {
          continue
        }

        const next = src.replace(p.from, p.to)
        if (next !== src) {
          hits.set(p.name, hits.get(p.name)! + 1)
          src = next
        }
      }

      return { contents: src, loader: args.path.endsWith(".ts") ? "ts" : "js" }
    })
  },
}

rmSync(OUT, { recursive: true, force: true })

for (const entry of ["cli", "mcp"]) {
  const result = await Bun.build({
    entrypoints: [join(UP, `src/${entry}.ts`)],
    compile: {
      target: "bun-windows-x64",
      outfile: join(OUT, entry === "cli" ? "kordoc.exe" : "kordoc-mcp.exe"),
    },
    define: { __KORDOC_VERSION__: JSON.stringify(pkg.version) },
    external,
    minify: !argv.has("--no-minify"),
    plugins: [patchPlugin],
  })
  if (!result.success) {
    console.error(result.logs)
    process.exit(1)
  }
}

const missed = [...hits].filter(([, n]) => n === 0).map(([name]) => name)
if (missed.length > 0) {
  console.error(`[build-exe] 치환 대상을 찾지 못함 — upstream·pdfjs-dist 변경 확인 필요: ${missed.join(", ")}`)
  process.exit(1)
}

mkdirSync(join(OUT, "pdfjs"), { recursive: true })
cpSync(join(UP, "node_modules/pdfjs-dist/cmaps"), join(OUT, "pdfjs/cmaps"), { recursive: true })
cpSync(join(UP, "node_modules/pdfjs-dist/standard_fonts"), join(OUT, "pdfjs/standard_fonts"), { recursive: true })
cpSync(join(UP, "templates"), join(OUT, "templates"), { recursive: true })
// MIT·번들된 서드파티 고지 — exe 를 배포하려면 함께 가야 한다
cpSync(join(UP, "LICENSE"), join(OUT, "LICENSE"))
cpSync(join(UP, "NOTICE"), join(OUT, "NOTICE"))
cpSync(join(UP, "THIRD_PARTY"), join(OUT, "THIRD_PARTY"), { recursive: true })

console.log(`[build-exe] kordoc v${pkg.version} → ${OUT}`)
for (const [name, n] of hits) {
  console.log(`  ${name}: ${n}곳`)
}
