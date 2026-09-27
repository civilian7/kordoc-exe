/**
 * 순수 JS 단일 DES(ECB) — HWP3 암호 문서 복호화용.
 *
 * upstream 은 `createDecipheriv("des-ede3-ecb", key×3)` 로 단일 DES 를 흉내 내는데(같은 키 셋이면
 * EDE = 단일 DES), **Bun 의 node:crypto 에는 그 알고리즘이 없어** exe 에서는 맞는 암호로도
 * 「문서 처리 중 오류」가 났다(`ERR_CRYPTO_UNKNOWN_CIPHER: des-ede3-ecb`, 2026-09-28 실측).
 * build-exe.ts 가 번들 때 upstream 의 그 함수를 이것으로 바꿔 끼운다.
 *
 * 표준 DES(FIPS 46-3) 그대로다. 대조: scripts/des-ecb.test.mts 가 Node 의 des-ede3-ecb 와
 * 무작위 키·데이터로 견준다.
 */

const PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4]
const PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32]
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
const IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7]
const FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25]
const E = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1]
const P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25]
const S = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
]

function toBits(bytes: Uint8Array, offset: number, count: number): number[] {
  const bits = new Array<number>(count * 8)
  for (let i = 0; i < count * 8; i++) {
    bits[i] = (bytes[offset + (i >> 3)] >> (7 - (i & 7))) & 1
  }
  return bits
}

function permute(src: number[], table: number[]): number[] {
  const out = new Array<number>(table.length)
  for (let i = 0; i < table.length; i++) {
    out[i] = src[table[i] - 1]
  }
  return out
}

function rotl(src: number[], n: number): number[] {
  return src.slice(n).concat(src.slice(0, n))
}

/** 키(8바이트)로 라운드 키 16개를 만든다. */
function subkeys(key: Uint8Array): number[][] {
  const k = permute(toBits(key, 0, 8), PC1)
  let c = k.slice(0, 28)
  let d = k.slice(28)
  const keys: number[][] = []
  for (let r = 0; r < 16; r++) {
    c = rotl(c, SHIFTS[r])
    d = rotl(d, SHIFTS[r])
    keys.push(permute(c.concat(d), PC2))
  }
  return keys
}

function feistel(r: number[], k: number[]): number[] {
  const e = permute(r, E)
  const out = new Array<number>(32)
  for (let s = 0; s < 8; s++) {
    const b = s * 6
    const x0 = e[b] ^ k[b]
    const x1 = e[b + 1] ^ k[b + 1]
    const x2 = e[b + 2] ^ k[b + 2]
    const x3 = e[b + 3] ^ k[b + 3]
    const x4 = e[b + 4] ^ k[b + 4]
    const x5 = e[b + 5] ^ k[b + 5]
    const v = S[s][((x0 << 1) | x5) * 16 + ((x1 << 3) | (x2 << 2) | (x3 << 1) | x4)]
    out[s * 4] = (v >> 3) & 1
    out[s * 4 + 1] = (v >> 2) & 1
    out[s * 4 + 2] = (v >> 1) & 1
    out[s * 4 + 3] = v & 1
  }
  return permute(out, P)
}

function block(bytes: Uint8Array, offset: number, keys: number[][], out: Uint8Array): void {
  const ip = permute(toBits(bytes, offset, 8), IP)
  let l = ip.slice(0, 32)
  let r = ip.slice(32)
  for (let i = 0; i < 16; i++) {
    const f = feistel(r, keys[i])
    const nr = new Array<number>(32)
    for (let j = 0; j < 32; j++) {
      nr[j] = l[j] ^ f[j]
    }
    l = r
    r = nr
  }
  const fp = permute(r.concat(l), FP)
  for (let i = 0; i < 8; i++) {
    let v = 0
    for (let j = 0; j < 8; j++) {
      v = (v << 1) | fp[i * 8 + j]
    }
    out[offset + i] = v
  }
}

function run(data: Uint8Array, key: Uint8Array, decrypt: boolean): Buffer {
  if (data.length % 8 !== 0) {
    throw new Error("DES-ECB: 데이터 길이가 8의 배수가 아닙니다")
  }
  let keys = subkeys(key.subarray(0, 8))
  if (decrypt) {
    keys = keys.slice().reverse()
  }
  const out = Buffer.alloc(data.length)
  for (let off = 0; off < data.length; off += 8) {
    block(data, off, keys, out)
  }
  return out
}

/** 단일 DES-ECB 복호화(패딩 없음). */
export function desEcbDecryptPure(data: Uint8Array, key: Uint8Array): Buffer {
  return run(data, key, true)
}

/** 단일 DES-ECB 암호화(패딩 없음) — 대조 시험용. */
export function desEcbEncryptPure(data: Uint8Array, key: Uint8Array): Buffer {
  return run(data, key, false)
}
