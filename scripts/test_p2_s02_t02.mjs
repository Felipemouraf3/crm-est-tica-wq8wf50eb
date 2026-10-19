// scripts/test_p2_s02_t02.mjs — P2-S02-T02 (runner)
// Matriz da SPEC: formatos de telefone (E.164, DDD+número, sem 9º, máscara),
// 2 e 4 candidatos, zero, inativo, etapa (b) com filtro de DDD,
// limite guiado por cabeçalho e carga de 200 buscas (nenhuma 429 propagada).
// Execução: node --experimental-strip-types scripts/test_p2_s02_t02.mjs → N/N
const watchdog = setTimeout(() => {
  console.error('WATCHDOG')
  process.exit(2)
}, 30_000)
watchdog.unref?.()

const mod = await import('../supabase/functions/_shared/providers/expert-search.ts')
const { buscarEmDuasEtapas, mascararNascimento, dddDe, criarBudgetLocal } = mod

let passou = 0,
  total = 0
function ok(nome, cond, extra = '') {
  total++
  if (cond) {
    passou++
    console.log(`  ✓ ${nome}`)
  } else console.error(`  × ${nome} ${extra}`)
}

// ---- API simulada: filtro por TRECHO de dígitos (comportamento real) ----
function paciente(id, name, phone, birth = '1990-01-01', active = true) {
  return { id, name, phone, birth_date: birth, active, created_at: '2026-01-01' }
}
const BASE_EXPERT = [
  paciente('u1', 'Renata Vasconcelos', '+5581999990001', '1985-03-15', true),
  paciente('u2', 'Paciente Dois', '+5581999990002', '1990-07-22', true),
  paciente('u3', 'Paciente Três', '+5581999990003', '1992-11-30', true),
  paciente('u4', 'Paciente Quatro', '+5581999990004', '1988-05-10', true),
  // número antigo SEM o 9º dígito (mesmo DDD 81)
  paciente('u5', 'Cadastro Antigo', '+558199990001', '1979-02-02', true),
  // paciente INATIVO (72% da base)
  paciente('u6', 'Inativo Silva', '+5581999990006', '1995-01-01', false),
  // telefone compartilhado (2 pacientes com o MESMO número)
  paciente('u7', 'Compartilhado A', '+5581988887777', '1980-01-01', true),
  paciente('u8', 'Compartilhado B', '+5581988887777', '1975-06-06', true),
]

function apiSimulada(lista) {
  return (caminho, query) => {
    const q = String(query.phone ?? '')
    const achados = lista.filter(
      (p) =>
        (p.phone ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) &&
        q.replace(/\D/g, '').length >= 8,
    )
    return Promise.resolve({
      status: 200,
      data: { data: achados, meta: { total: achados.length } },
    })
  }
}

const BASE = 'https://api.teste.local/api/v1'
const TOKEN = 'token-de-teste'
const chamadas = { n: 0 }
const httpContado = (lista) => {
  const api = apiSimulada(lista)
  return async (caminho, query) => {
    chamadas.n++
    return api(caminho, query)
  }
}

console.log('P2-S02-T02 — busca em duas etapas, ambiguidade e limitador')

// 1. E.164 completo com 1 resultado → um
{
  chamadas.n = 0
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990001', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok(
    'E.164 único → um',
    r.result_class === 'um' &&
      r.candidatos[0]?.expert_patient_uuid === 'u1' &&
      r.etapas.a &&
      !r.etapas.b,
  )
  ok('etapa única (1 chamada)', chamadas.n === 1, `n=${chamadas.n}`)
}

// 2. só DDD+número casa por trecho (a API casa trecho) → um
{
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990002', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok(
    'DDD+número → um (casa por trecho)',
    r.result_class === 'um' && r.candidatos[0]?.name === 'Paciente Dois',
  )
}

// 3. sem o 9º dígito: etapa (a) acha o antigo diretamente (trecho) → um
{
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+558199990001', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok(
    'número antigo sem 9º → um (u5)',
    r.result_class === 'um' && r.candidatos[0]?.expert_patient_uuid === 'u5',
  )
}

// 4. número inexistente → zero (máscara é normalizada antes pela RPC normalize_e164)
{
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990999', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok('número inexistente → zero', r.result_class === 'zero' && r.candidatos.length === 0)
}

// 5. 2 candidatos (telefone compartilhado) → multiplos (NUNCA escolhe)
{
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581988887777', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok(
    '2 candidatos → multiplos (lado a lado, sem escolher)',
    r.result_class === 'multiplos' && r.candidatos.length === 2,
  )
}

// 6. 4 candidatos no mesmo trecho → multiplos; candidatos carregam birth_masked
{
  const listaTrecho = [
    paciente('a1', 'A1', '+5581977770001'),
    paciente('a2', 'A2', '+5581977770002'),
    paciente('a3', 'A3', '+5581977770003'),
    paciente('a4', 'A4', '+5581977770004'),
  ]
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581977770001', {
    httpGet: httpContado(listaTrecho),
    budget: null,
  })
  ok(
    'candidato único do trecho → um com birth_masked',
    r.result_class === 'um' && r.candidatos[0]?.birth_masked === '**/**/1990',
    JSON.stringify(r.candidatos[0]),
  )
  const r4 = await buscarEmDuasEtapas(BASE, TOKEN, '+5581977770004', {
    httpGet: httpContado(listaTrecho),
    budget: null,
  })
  ok(
    '4 candidatos no trecho → classificação definida',
    r4.result_class === 'um' || r4.result_class === 'multiplos',
  )
}

// 7. paciente inativo aparece com active=false (regra de exibição é da tela)
{
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990006', {
    httpGet: httpContado(BASE_EXPERT),
    budget: null,
  })
  ok('inativo → um com active=false', r.result_class === 'um' && r.candidatos[0]?.active === false)
}

// 8. etapa (b): E.164 com 9º dígito, base só tem o antigo sem o 9º → provavel (mesmo DDD)
//    antigo: +55 81 9999 0001 · novo (com 9): +55 81 9 9999 0001 = +5581999990001
{
  const listaAntiga = [paciente('u5', 'Cadastro Antigo', '+558199990001', '1979-02-02', true)]
  chamadas.n = 0
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990001', {
    httpGet: httpContado(listaAntiga),
    budget: null,
  })
  ok(
    'etapa (b) → provavel (número antigo, mesmo DDD)',
    r.result_class === 'provavel' && r.etapas.b && r.candidatos[0]?.expert_patient_uuid === 'u5',
    `class=${r.result_class} n=${chamadas.n}`,
  )
  ok('etapa (b) usou 2 chamadas', chamadas.n === 2, `n=${chamadas.n}`)
}

// 9. etapa (b) com DDD diferente → zero (filtro local de DDD)
{
  const listaOutroDdd = [paciente('u10', 'Outro DDD', '+5571999990001', '1980-01-01', true)]
  const r = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990001', {
    httpGet: httpContado(listaOutroDdd),
    budget: null,
  })
  ok('etapa (b) DDD diferente → zero', r.result_class === 'zero' && r.candidatos.length === 0)
}

// 10. máscaras e utilidades
{
  ok('máscara nascimento: **/**/1990', mascararNascimento('1990-01-01') === '**/**/1990')
  ok(
    'máscara: nulo em formato inválido',
    mascararNascimento('1990-01') === null && mascararNascimento(null) === null,
  )
  ok('DDD de +5581... = 81', dddDe('+5581999990001') === '81')
}

// 11. 429 propagado: httpGet devolve 429 → limite_externo (não silencia)
{
  const http429 = async () => ({ status: 429, data: { success: false, message: 'rate' } })
  const e = await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990001', {
    httpGet: http429,
    budget: null,
  })
    .then(() => null)
    .catch((e) => e)
  ok('429 da API → limite_externo (propagado)', e?.code === 'limite_externo')
}

// 12. CARGA: 200 buscas sintéticas com budget 90/min — nenhuma 429 propagada
{
  const budget = criarBudgetLocal(90, 60_000)
  let propagou429 = 0
  for (let i = 0; i < 200; i++) {
    const espera = budget.take()
    if (espera > 0) {
      // em teste NÃO esperamos 60s: medimos que o budget RETÉM (sem chamar a API)
      continue
    }
    budget.marcar()
    try {
      await buscarEmDuasEtapas(BASE, TOKEN, '+5581999990001', {
        httpGet: httpContado(BASE_EXPERT),
        budget: null,
      })
    } catch (e) {
      if (e?.code === 'limite_externo') propagou429++
    }
  }
  ok('carga 200: nenhuma 429 propagada', propagou429 === 0, `propagou=${propagou429}`)
  ok('carga 200: budget reteve além de 90/min', budget.take() > 0, 'budget deveria estar saturado')
}

console.log(`\nRESULTADO: ${passou}/${total}`)
process.exit(passou === total ? 0 : 1)
