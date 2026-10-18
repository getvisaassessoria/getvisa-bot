# 🚀 PROMPT INICIAL — GetVisa Assessoria

> **Documento mestre.** Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> **Última atualização:** 18/10/2026
> **Versão do documento:** 3.1

---

## 🎯 CONTEXTO GERAL

Sistema de assessoria para vistos americanos. **Em produção desde 14/09/2026** com clientes reais.

**Stack:**
- Backend: Node.js + Express
- Banco: Supabase (PostgreSQL)
- Deploy: Railway (auto-deploy via `git push`)
- WhatsApp: Z-API (instância `3F1D4E0F2AD0539F0C52B20DE66F3711`)
- Email: Resend
- Frontend: HTML/CSS/JS vanilla (sem framework)

**Acessos:**
- Repo: `git@github.com:getvisaassessoria/getvisa-bot.git` (branch `main`)
- Produção: `https://app.getvisa.com.br`
- Local: `~/getvisa-bot-v2`
- Supabase produção: projeto `gcwfxkbjovqnqccrcrjx`
- Supabase staging: projeto `iwyptcrwdkukvtnbsvan`
- Railway produção: projeto `getvisa-bot` (branch `main`)
- Railway staging: projeto `getvisa staging` (branch `staging`)
- Staging URL: `https://web-production-4f6be.up.railway.app`
- Dashboard admin: `/dashboard?api_key=admin123`

**Números importantes:**
- WhatsApp Business (bot): `21974601812`
- WhatsApp equipe/admin: `5521974601812`

---

## 🆕 NOVIDADES v3.1 (Sessões 13-17/10/2026)

### Infra nova: STAGING
- **Supabase staging** criado (11 tabelas + 8 clientes fictícios)
- **Railway staging** criado (branch `staging`)
- **Branch `staging`** no git
- **Fluxo:** `main` = produção, `staging` = testes
- **Como usar:**
  - `git checkout staging`
  - `# edita server.js ou formulario-ds160.html`
  - `git add <arquivo> && git commit -m "..." && git push origin staging`
  - `# testa no staging (web-production-4f6be.up.railway.app)`
  - `# se OK:`
  - `git checkout main && git merge staging && git push origin main`

### Features novas em produção (v3.0)
1. **Limite de 3 alterações no DS-160** (contador `tentativas_reagendamento` + bloqueio a partir da 3ª)
2. **Flag `silenciar_bot`** (silencia bot sem perder `tipo_contato = cliente`)
3. **Rota `/api/formularios/ds160/count`** (badge do dashboard)
4. **Mensagem de avaliação Google** nas notificações de `visto_aprovado` e `passaporte_retornado`

### Features novas em produção (v3.1 — 17/10)
5. **Login do Portal por CPF + Data de Nascimento** (substituiu telefone + 4 dígitos)
6. **Modelo Familiar do DS-160 (Frontend + Backend)** — Tela 0 (Único/Familiar) + vinculação via `cliente_titular_id` + herança de campos comuns
7. **Dashboard mostra as duas datas** (CASV + Entrevista) na coluna "Data"
8. **Fix `submit-ds160`:**
   - Salva `data_nascimento` (do campo `dob` do form)
   - Clientes `contato_pessoal` viram `cliente` (mas mantêm `silenciar_bot = true`)
9. **Fix `middleware/auth.js`:** usa `process.env.ADMIN_API_KEY` (não mais hardcoded)
10. **Rodapé do portal:** "Entre com seu CPF e sua Data de Nascimento"

### Bugs corrigidos (v3.0)
- ✅ `cliente_id` no `submit-ds160` (form da Julia órfão)
- ✅ PDF não era gerado (`supabase.from(...).eq is not a function`)
- ✅ `submit-passaporte` modo único (`telefone_vinculacao = null`)
- ✅ `submit-passaporte` `unique_telefone` (busca por `cpf_ultimos4`)

### Bugs corrigidos (v3.1)
- ✅ `data_nascimento` não era salva no `submit-ds160` (form preenchia `dob`, mas não ia pro cliente)
- ✅ `middleware/auth.js` hardcoded `admin123` (quebrava o staging que usa `staging123`)
- ✅ `showStep(1)` no `DOMContentLoaded` (impedia a Tela 0 de aparecer)
- ✅ Tela 0 do DS-160 (layout confuso → refatorado pra ficar igual ao passaporte)

### Novas colunas no banco
- **`clientes.silenciar_bot`** (boolean, default false)
- **`form_ds160.tentativas_reagendamento`** (integer, default 0)
- **`clientes.cliente_titular_id`** + **`clientes.telefone_vinculacao`**

### Regras novas
- **Limite de 3 alterações** no DS-160 (regra do consulado, margem de segurança de 5 dias)
- **CPF divergente:** alerta a equipe (mas NÃO atualiza automaticamente)
- **Silenciar bot:** usar `silenciar_bot = true`, NÃO `tipo_contato = 'contato_pessoal'`
- **Login do portal:** CPF completo + Data de Nascimento (NÃO mais telefone + 4 dígitos)
- **Modelo familiar:** titular tem `cliente_titular_id = null`; dependente tem `cliente_titular_id = <titular>` + `telefone_vinculacao`

---

## ✅ FEATURES ATIVAS EM PRODUÇÃO

### 1. Bot WhatsApp (Z-API)
- Triagem inicial (1 cliente / 2 lead / 3 outros)
- Menus por serviço
- Filtros: ignora grupo, fromMe, status, newsletter, broadcast
- Follow-up automático de leads (3 tentativas: 24h, 48h, 72h)
- Despedida educada pra "contato pessoal"
- Detecção de intenção
- **Silenciamento via flag `silenciar_bot`**

### 2. Formulário DS-160 (12 passos + Tela 0)
- URL: `/formulario-ds160`
- **Tela 0:** escolha entre "Único" ou "Familiar" (layout do passaporte)
- **Se familiar:** pede telefone do titular (com sufixo automático ou telefone próprio)
- **Herança de campos:** endereço, contato EUA, pagador, viagem (via `localStorage`)
- **Botão "Novo formulário familiar"** após o envio (vai direto pro Passo 1, sem voltar pra Tela 0)
- Bloqueio de reenvio (`BLOCK_DS160_RESUBMIT=true`)
- **Limite de 3 tentativas** de reenvio
- Verificação no passo 1 (`/api/check-ds160-status`)
- Arrays (acompanhantes, viagens, empregos, educação)
- Uppercase automático (exceto emails/handles/radios)
- Autocomplete do Chrome bloqueado

### 3. Portal do Cliente (`/meu-processo`)
- **Login: CPF completo + Data de Nascimento** (mudou na v3.1)
- Timeline de 10 etapas
- Agendamentos (CASV + Entrevista)
- Botão WhatsApp pra especialista
- Correção pontual de campo (Fase 3)

### 4. Painel Admin
- `/dashboard` — 4 cards
- `/painel` — lista de clientes (com **2 datas: CASV + Entrevista**)
- `/painel-reenvios` — tentativas
- `/painel-solicitacoes` — alterações (Fase 3)
- `/upload-casv-pdf` — upload de agendamento

### 5. Watchdog (monitor de saúde)
- Roda a cada 30 min
- Alerta WhatsApp após 3 falhas
- Registra em `watchdog_logs`

### 6. Formulário de Passaporte (`/formulario-passaporte`)
- Modo único ou familiar (base do layout da Tela 0 do DS-160)
- Familiar com sufixo (`-01`, `-02`)
- **Alerta de CPF divergente**

### 7. Upload de PDF de Agendamento (`/upload-casv-pdf`)
- Extrai CASV + Entrevista
- **⚠️ NÃO sobrescreve cliente existente**

---

## 🗄️ TABELAS SUPABASE

### `clientes`
Cadastro único por `telefone` (UNIQUE).
- Campos: `id`, `nome`, `email`, `telefone`, `cpf`, `data_nascimento`, `status`, `tipo_contato`, `tipo_servico`, `consulado`
- Follow-up: `followup_1_em`, `followup_2_em`, `followup_3_em`, `followup_parar`
- **Novos (02/10):** `tipo_servico`, `cpf_ultimos4` (gerada), `telefone_vinculacao`, `cliente_titular_id`
- **Novos (16/10):** `silenciar_bot` (boolean)

### `form_ds160`
1 form por cliente. `dados_formulario` (jsonb, ~174 chaves).
- **Novos (13/10):** `tentativas_reagendamento` (limite 3)
- **`cliente_id`** (FK correta) e **`id_cliente`** (legada) — usar `cliente_id`

### `form_ds160_reenvios`
Histórico de tentativas.

### `portal_acessos`
Sessões (token 24h).

### `etapas_processo`
Funil (10 etapas):
1. `formulario_enviado` → 2. `analise_correcoes` → 3. `abertura_processo` → 4. `boleto_emitido` → 5. `boleto_pago` → 6. `agendamento_realizado` → 7. `treinamento_realizado` → 8. `entrevista_realizada` → 9. `visto_aprovado` → 10. `passaporte_retornado`

**⚠️ NUNCA regride após `entrevista_realizada`.**

### `agendamentos`
CASV + Entrevista.

### `solicitacoes_alteracao_campo`
Alterações pontuais (Fase 3).

### `watchdog_logs`
Monitor de saúde.

### `form_passaporte`
Status: `novo` | `em_analise` | `enviado_pf` | `concluido` | `cancelado`.

---

## 📋 REGRAS DE NEGÓCIO CRÍTICAS

### Login do Portal (NOVO — 17/10)
- **CPF completo + Data de Nascimento**
- Backend: `/api/portal/login` aceita `{ cpf, dataNascimento }`
- Funciona pra titular, cônjuge, filho, criança (cada um com seu CPF + DOB)
- **NÃO usa mais** telefone + 4 dígitos

### Modelo Familiar DS-160 (NOVO — 17/10)
- **Tela 0:** escolha "Único" ou "Familiar"
- **Titular:** `telefone = <próprio>`, `cliente_titular_id = null`, `telefone_vinculacao = null`
- **Familiar (criança):** `telefone = <titular>-01`, `cliente_titular_id = <titular>`, `telefone_vinculacao = <titular>-01`
- **Familiar (adulto com telefone próprio):** `telefone = <próprio>`, `cliente_titular_id = <titular>`, `telefone_vinculacao = <próprio>`
- **Herança de campos:** endereço, contato EUA, pagador, viagem (via `localStorage` + `input-modo`)
- **Fluxo sequencial:** após o envio, botão "Novo formulário familiar" → direto pro Passo 1 (sem voltar pra Tela 0)

### Limite de 3 alterações no DS-160 (13/10)
- **Regra:** máximo 3 alterações
- **Margem GetVisa:** 5 dias (não 3)
- **Contador:** `tentativas_reagendamento`
- **Trava em 3**
- **A partir da 3ª:** `limite_atingido: true`

### Alteração de DS-160
- **Janela:** 5+ dias antes do CASV
- **Bloqueio:** <5 dias
- **Após CASV:** 48h
- **Após entrevista:** NUNCA regride
- **Alerta 6 meses**

### Complexidade
- 🔴 Vermelho: consulado, nome, DOB, passaporte
- 🟡 Amarelo: SSN, Tax ID, propósito
- ⚪ Normal: endereço, telefone, renda

### Feature flags
- `BLOCK_DS160_RESUBMIT=true` (produção)
- `BLOCK_PASSAPORTE_RESUBMIT` (opcional)
- `DISABLE_WHATSAPP` (NÃO EXISTE em prod)
- `ADMIN_API_KEY` (env, usado pelo middleware/auth.js)
- **Rollback:** deletar (30s)

### Silenciar bot (16/10)
- **Usar `silenciar_bot = true`** (não `tipo_contato`)
- **Motivo:** silenciar sem perder classificação
- **Efeito:** bot não responde + não notifica
- **Ativação:** via SQL (sem UI)

### Upload PDF agendamento
**⚠️ NÃO sobrescreve cliente.** Busca por telefone, se existe usa, se não cria.

### Vinculação familiar
- Titular: `telefone` = `21991828052`
- Familiar: `telefone` = `21991828052-01`
- **⚠️ `submit-passaporte` busca só por `telefone`** (não `telefone + cpf_ultimos4`)

### CPF divergente (16/10)
- **NÃO atualiza** automaticamente
- **Alerta equipe** via WhatsApp
- **Loga no console**

### `submit-ds160` — contato_pessoal (NOVO — 17/10)
- Se cliente é `contato_pessoal` **E** preenche DS-160:
  - Pula o bloqueio de reenvio
  - Vira `cliente` no upsert
  - Mantém `silenciar_bot = true`
- **Lógica:** `if (formExistente && BLOQUEAR_REENVIO && !ehContatoPessoal)`

### `submit-ds160` — data_nascimento (NOVO — 17/10)
- Extrai `dob` do form (`formData.dob`)
- Salva no cliente (`data_nascimento: dobForm`)
- **Motivo:** sem isso, o login por CPF + DOB falha

---

## 🚨 REGRAS DE SEGURANÇA

1. **ESTAMOS EM PRODUÇÃO** — backup antes
2. **Usar staging pra testar**
3. Feature flag com rollback
4. `node -c server.js` antes de commit
5. Nunca deletar dados sem confirmar
6. **`git branch` ANTES de commitar** (confirmar que tá em `staging`)
7. **`git status` antes de commitar** (só commitar o que precisa)
8. `git push origin main` → produção; `git push origin staging` → staging
9. Testes: `210000000XX`
10. **SQL no SQL Editor**, nunca terminal
11. PDF precisa `checkPageBreak()`

---

## 🐛 BUGS JÁ RESOLVIDOS

| Bug | Fix | Data |
|-----|-----|------|
| getFormData pegava último radio | Só captura `checked` | 14/09 |
| Upsert sobrescrevia antes do bloqueio | Reordenado | 14/09 |
| Datas 1 dia antes | `formatarDataSegura` | 17/09 |
| `etapas_processo` vazia | Trigger + UNIQUE | 16/09 |
| Emoji 📌 no PDF | Removido | 20/09 |
| Arrays truncavam | `pegarValor` | 20/09 |
| Watchdog Z-API 400 | `Client-Token` | 20/09 |
| `/baixar-pdf` usava `acesso.id_cliente` | `cliente.id` | 20/09 |
| Follow-up #2 conflitava com menu | "AJUDA" | 19/09 |
| PDF truncava | `checkPageBreak()` | 02/10 |
| Arrays viravam string | `getFormData()` | 02/10 |
| Case mismatch (`ONE` vs `one`) | `isSim()`/`isNao()` | 02/10 |
| Nomes das seções | `secoes` alinhada | 02/10 |
| Propósito em inglês | Tradução inline | 02/10 |
| Relação do Pagador | Adicionado | 02/10 |
| Autocomplete Chrome | `autocomplete="new-password"` | 02/10 |
| Uppercase destruía radios | `CAMPOS_NAO_UPPERCASE` | 02/10 |
| RLS bloqueava upload | `SERVICE_ROLE_KEY` | 02/10 |
| Upload CASV sobrescrevia | `SELECT` + `INSERT` | 02/10 |
| `cliente_id` no `submit-ds160` | SELECT + INSERT | 13/10 |
| PDF não gerado | `.select('*')` antes de `.eq()` | 14/10 |
| `submit-passaporte` modo único | `else { telefoneVinculacao = telefoneRealVal; }` | 16/10 |
| `submit-passaporte` `unique_telefone` | Buscar só por `telefone` | 16/10 |
| **`data_nascimento` não salva no `submit-ds160`** | Salvar `dobForm` no upsert | 17/10 |
| **`middleware/auth.js` hardcoded `admin123`** | `process.env.ADMIN_API_KEY` | 17/10 |
| **`showStep(1)` impedia Tela 0** | `showStep(0)` no `DOMContentLoaded` | 17/10 |
| **Tela 0 com HTML duplicado** | Refatorado (layout passaporte) | 17/10 |

---

## 🗂️ ESTRUTURA DE ARQUIVOS

### `server.js`
Principal (≈5000 linhas). Express + bot + rotas + **gerador de PDF** + watchdog.

### `config/supabase.js`
Usa `SUPABASE_SERVICE_ROLE_KEY`.

### `services/agendamentoService.js`
Extrai dados do PDF.

### `middleware/auth.js`
`verificarAdmin`, `verificarApiKey`. **Usa `process.env.ADMIN_API_KEY`.**

### `public/formulario-ds160.html`
Frontend DS-160 (Tela 0 + 12 passos + herança de campos).

### `public/formulario-passaporte.html`
Frontend passaporte.

### `public/painel-clientes.html`
Lista de clientes (2 datas: CASV + Entrevista).

### `public/dashboard-novo.html`
Dashboard admin (4 cards).

---

## 🎯 GERADOR DE PDF

### Estrutura
1. `gerarPDF_DS160(dados)`
2. `todosCampos` (~150 campos)
3. `writeSection(title, campos)`
4. `secoes` (ordem)
5. `checkPageBreak(altura)` — **⚠️ ESSENCIAL**

### Regras
- Nome deve bater EXATAMENTE
- Arrays: `tamanho()` + `pegarValor()`
- Radios: `isSim()`/`isNao()`
- NUNCA remover `checkPageBreak`

---

## 📌 PENDÊNCIAS PRIORIZADAS

### 🔴 Alta
1. **Reforçar Watchdog** — e-mail além do WhatsApp (quando Z-API desconectar)
2. **CPF divergente do Moisés** (`2312` vs `0749`) — investigar
3. **Graceful shutdown no Railway**
4. **Recuperação de forms abandonados**
5. **CPF da Maruzza** — pedir e atualizar (hoje tá `000.000.000-00`)

### 🟡 Média
6. **Ordenar painel por `updated_at`**
7. **Filtros na lista de clientes** (nome, telefone, data)
8. **Validação de telefone** (< 10 dígitos)
9. **Rota `baixar-pdf`** — `id_cliente` → `cliente_id`
10. **Contador "Formulários Enviados"** (13 vs 16)
11. **`RESEND_API_KEY` local**
12. **UI pra `silenciar_bot`**
13. **Herança de campos no formulário familiar** — testar em produção

### 🟢 Baixa
14. **Fase 4 — Auto-serviço**
15. **Google Calendar**
16. **Bloquear bots varredores**
17. **zsh UTF-8** (cosmético)
18. **Hook de pré-commit** (bloquear commit em `main`)

### ⚠️ Revertida
19. **promo50**

---

## 🎯 LIÇÕES APRENDIDAS

1. **Staging é essencial.**
2. **Protocolo:** backup → patch → `node -c` → teste local → commit staging → testar staging → merge main → teste prod.
3. **`git branch` + `git status` ANTES de commitar** (evita commitar em `main`).
4. **Testes: `210000000XX`.**
5. **`silenciar_bot`** é o jeito correto (não `tipo_contato`).
6. **Bug `submit-ds160`:** clientes com `contato_pessoal` não são atualizados (fix 17/10).
7. **Bug `submit-passaporte`:** buscar só por `telefone`.
8. **Bug PDF:** sempre `.select()` antes de `.eq()`.
9. **Bug `data_nascimento`:** o `submit-ds160` precisa salvar `dob` do form (fix 17/10).
10. **Bug `middleware/auth.js`:** nunca hardcoded (fix 17/10).
11. **Bug Tela 0:** `showStep(0)` no `DOMContentLoaded` (não `showStep(1)`).
12. **Z-API pode desconectar silenciosamente** (17/10) — o Watchdog avisa, mas pode passar batido.

---

## 🎯 PROMPT PRONTO PRA COLAR NO CHAT

---

Olá! Preciso continuar um trabalho no sistema GetVisa Assessoria (assessoria de vistos americanos).

**CONTEXTO:**
- Stack: Node.js + Express + Supabase + Railway + Z-API + Resend
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git
- Produção: https://app.getvisa.com.br (branch `main`)
- Staging: https://web-production-4f6be.up.railway.app (branch `staging`)
- Local: ~/getvisa-bot-v2
- Supabase produção: gcwfxkbjovqnqccrcrjx
- Supabase staging: iwyptcrwdkukvtnbsvan
- Estamos EM PRODUÇÃO (clientes reais usando)

**DOCUMENTAÇÃO COMPLETA:**
Anexei o arquivo PROMPT-INICIAL.md (v3.1).

**FEATURES ATIVAS:**
1. Bot WhatsApp (triagem + menus + filtros + follow-up + silenciar_bot)
2. Formulário DS-160 (Tela 0 + 12 passos) + bloqueio reenvio + limite de 3 + PDF completo + modelo familiar + herança de campos
3. Formulário de Passaporte (modo único/familiar + alerta CPF divergente)
4. Portal cliente /meu-processo (login por CPF + DOB)
5. Painel admin (clientes, reenvios, solicitações, upload CASV)
6. Watchdog (monitor Z-API + Supabase)
7. Staging completo (Supabase + Railway + branch)

**REGRAS CRÍTICAS:**
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Usar staging pra testar mudanças
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre `node -c server.js` antes de commit
- **`git branch` + `git status` ANTES de commitar** (evita commitar em `main`)
- `git push origin main` aciona produção; `git push origin staging` aciona staging
- Testes SEMPRE com cliente fictício (210000000XX)
- SQL roda no Supabase SQL Editor
- PDF do DS-160 precisa de `checkPageBreak()`
- Upload de CASV NÃO sobrescreve cliente
- **Silenciar bot:** usar `silenciar_bot = true` (NUNCA `tipo_contato = 'contato_pessoal'`)
- **Login portal:** CPF + Data de Nascimento (não mais telefone + 4 dígitos)
- **Modelo familiar:** titular + `cliente_titular_id` + `telefone_vinculacao`

**PENDÊNCIAS PRIORITÁRIAS:**
1. Reforçar Watchdog (e-mail além do WhatsApp)
2. CPF divergente do Moisés
3. Graceful shutdown Railway
4. Recuperação de formulários abandonados
5. CPF da Maruzza (pedir e atualizar)

**O QUE PRECISO AGORA:**
[Cole aqui o que você precisa]

**IMPORTANTE — Antes de agir:**
1. Confirme que entendeu o contexto
2. Se faltar informação técnica, me peça pra colar o doc específico
3. Sugira um plano antes de executar qualquer mudança
4. **Nunca invente** informação que não esteja nos docs

---

## 💡 DICA DE USO

**Opção A — Anexar arquivo:** anexa este `.md`
**Opção B — Colar texto:** copia a seção "PROMPT PRONTO PRA COLAR"
**Opção C — GitHub:** `https://github.com/getvisaassessoria/getvisa-bot/blob/main/docs/PROMPT-INICIAL-V3.md`

---

**Bom trabalho!** 🚀