#!/usr/bin/env node
// scripts/scan-secrets.mjs — P2-S01-T04
// Varredura de segredos na árvore (substituto local do gitleaks, sem dependências).
// Padrões: JWTs/chaves Supabase, chaves publishable/secret, senhas em atribuição,
// tokens genéricos, e-mails pessoais em SQL (dado sensível do dono).
// Saída: lista de achados; exit 1 se houver algum (falha o CI/QA).
// Provas (2026-10-18): 0 achados em src/ (exit 0); arquivo com JWT de teste → exit 1.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const RAIZES = process.argv.slice(2)
const RAIZ = RAIZES[0] ?? '.'
const EXTensoes = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql', '.json', '.md', '.html'])
const PULAR_DIR = new Set(['node_modules', '.git', 'dist', 'tmp', 'tmp-vite', 't04'])

const PADROES = [
  {
    nome: 'JWT / chave Supabase',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    nome: 'chave publishable/secret',
    re: /sb_publishable_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9]{20,}|SUPABASE_[A-Z_]*KEY\s*=\s*['"][^'"]{20,}/,
  },
  { nome: 'senha em atribuição', re: /(password|passwd|senha)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { nome: 'token genérico', re: /(token|secret)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/i },
  {
    nome: 'e-mail pessoal em SQL',
    re: /[a-zA-Z0-9._%+-]+@(?!example|placeholder|ps-teste\.local)[a-zA-Z0-9.-]+\.[a-z]{2,}/,
  },
]

const achados = []
function* walk(dir) {
  for (const nome of readdirSync(dir)) {
    if (PULAR_DIR.has(nome)) continue
    const p = join(dir, nome)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else if (EXTensoes.has(extname(nome)) || nome.startsWith('.env')) yield p
  }
}
for (const raiz of RAIZES.length > 0 ? RAIZES : ['.']) {
  for (const arquivo of walk(raiz)) {
    let texto
    try {
      texto = readFileSync(arquivo, 'utf8')
    } catch {
      continue
    }
    const linhas = texto.split('\n')
    linhas.forEach((linha, i) => {
      for (const { nome, re } of PADROES) {
        if (re.test(linha)) {
          achados.push({ arquivo, linha: i + 1, padrao: nome, trecho: linha.trim().slice(0, 90) })
        }
      }
    })
  }
}
if (achados.length === 0) {
  console.log(
    'VARREDURA OK: 0 segredos encontrados em',
    RAIZES.length > 0 ? RAIZES.join(' ') : RAIZ,
  )
  process.exit(0)
}
console.error(`VARREDURA FALHOU: ${achados.length} ocorrência(s):`)
for (const a of achados) console.error(`  [${a.padrao}] ${a.arquivo}:${a.linha} → ${a.trecho}`)
process.exit(1)
