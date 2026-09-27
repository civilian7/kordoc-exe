/**
 * des-ecb.ts 를 Node 의 des-ede3-ecb(같은 키 ×3 = 단일 DES)와 견준다.
 *   node --import tsx scripts/des-ecb.test.mts      (upstream/ 의 tsx 를 쓴다 — Bun 에는 그 알고리즘이 없다)
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { desEcbDecryptPure, desEcbEncryptPure } from "./des-ecb.ts"

let fail = 0
const N = 300

for (let i = 0; i < N; i++) {
  const key = randomBytes(8)
  const data = randomBytes(8 * (1 + (i % 40)))
  const k3 = Buffer.concat([key, key, key])

  const enc = createCipheriv("des-ede3-ecb", k3, null)
  enc.setAutoPadding(false)
  const refCipher = Buffer.concat([enc.update(data), enc.final()])

  const dec = createDecipheriv("des-ede3-ecb", k3, null)
  dec.setAutoPadding(false)
  const refPlain = Buffer.concat([dec.update(data), dec.final()])

  if (!desEcbEncryptPure(data, key).equals(refCipher)) {
    fail++
  }
  if (!desEcbDecryptPure(data, key).equals(refPlain)) {
    fail++
  }
  if (!desEcbDecryptPure(refCipher, key).equals(data)) {
    fail++
  }
}

console.log(`DES-ECB 대조: ${N}건 × 3, 어긋남 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
