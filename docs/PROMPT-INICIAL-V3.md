# 🚀 PROMPT INICIAL — GetVisa Assessoria

> **Documento mestre.** Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> **Última atualização:** 16/10/2026
> **Versão do documento:** 3.0

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

## 🆕 NOVIDADES v3.0 (Sessões 13-16/10/2026)

### Infra nova: STAGING
- **Supabase staging** criado (11 tabelas + 8 clientes fictícios)
- **Railway staging** criado (branch `staging`)
- **Branch `staging`** no git
- **Fluxo:** `main` = produção, `staging` = testes
- **Como usar:**
  - `git checkout staging`
  - `# edita server.js`
  - `git add server.js && git commit -m "..." && git push origin staging`
  - `# testa no staging (web-production-4f6be.up.railway.app)`
  - `# se OK:`
  - `git checkout main && git merge staging && git push origin main`

### Features novas em produção
1. **Limite de 3 alterações no DS-160** (contador `tentativas_reagendamento` + bloqueio a partir da 3ª)
2. **Flag `silenciar_bot`** (silencia bot sem perder `tipo_contato = cliente`)
3. **Rota `/api/formularios/ds160/count`** (badge do dashboard)
4. **Mensagem de avaliação Google** nas notificações de `visto_aprovado` e `passaporte_retornado`

### Bugs corrigidos
- ✅ `cliente_id` no `submit-ds160` (form da Julia órfão)
- ✅ PDF não era gerado (`supabase.from(...).eq is not a function`)
- ✅ `submit-passaporte` modo único (`telefone_vinculacao = null`)
- ✅ `submit-passaporte` `unique_telefone` (busca por `cpf_ultimos4`)

### Novas colunas no banco
- **`clientes.silenciar_bot`** (boolean, default false)
- **`form_ds160.tentativas_reagendamento`** (integer, default 0)
- **`clientes.cliente_titular_id`** + **`clientes.telefone_vinculacao`**

### Regras novas
- **Limite de 3 alterações** no DS-160 (regra do consulado, margem de segurança de 5 dias)
- **CPF divergente:** alerta a equipe (mas NÃO atualiza automaticamente)
- **Silenciar bot:** usar `silenciar_bot = true`, NÃO `tipo_contato = 'contato_pessoal'`

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

### 2. Formulário DS-160 (12 passos)
- URL: `/formulario-ds160`
- Bloqueio de reenvio (`BLOCK_DS160_RESUBMIT=true`)
- **Limite de 3 tentativas** de reenvio
- Verificação no passo 1 (`/api/check-ds160-status`)
- Telefone virtual pra família (`-01`)
- Arrays (acompanhantes, viagens, empregos, educação)
- Uppercase automático (exceto emails/handles/radios)
- Autocomplete do Chrome bloqueado

### 3. Portal do Cliente (`/meu-processo`)
- Login: telefone + 4 últimos dígitos CPF
- Timeline de 10 etapas
- Agendamentos (CASV + Entrevista)
- Botão WhatsApp pra especialista
- Correção pontual de campo (Fase 3)

### 4. Painel Admin
- `/dashboard` — 4 cards
- `/painel` — lista de clientes
- `/painel-reenvios` — tentativas
- `/painel-solicitacoes` — alterações (Fase 3)
- `/upload-casv-pdf` — upload de agendamento

### 5. Watchdog (monitor de saúde)
- Roda a cada 30 min
- Alerta WhatsApp após 3 falhas
- Registra em `watchdog_logs`

### 6. Formulário de Passaporte (`/formulario-passaporte`)
- Modo único ou familiar
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

---
## 🚨 REGRAS DE SEGURANÇA

1. **ESTAMOS EM PRODUÇÃO** — backup antes
2. **Usar staging pra testar**
3. Feature flag com rollback
4. `node -c server.js` antes de commit
5. Nunca deletar dados sem confirmar
6. `git push origin main` → produção; `git push origin staging` → staging
7. Testes: `210000000XX`
8. **SQL no SQL Editor**, nunca terminal
9. PDF precisa `checkPageBreak()`
10. `git status` antes de commitar (só `server.js`)

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

---

## 🗂️ ESTRUTURA DE ARQUIVOS

### `server.js`
Principal (≈5000 linhas). Express + bot + rotas + **gerador de PDF** + watchdog.

### `config/supabase.js`
Usa `SUPABASE_SERVICE_ROLE_KEY`.

### `services/agendamentoService.js`
Extrai dados do PDF.

### `middleware/auth.js`
`verificarAdmin`, `verificarApiKey`.

### `public/formulario-ds160.html`
Frontend DS-160.

### `public/formulario-passaporte.html`
Frontend passaporte.

### `public/painel-clientes.html`
Lista de clientes.

### `public/dashboard-novo.html`
Dashboard admin.

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
1. **Busca ampla de "Contato Pessoal"** — clientes escondidos
2. **Modelo familiar do DS-160**
3. **Investigar CPF divergente do Moisés** (`2312` vs `0749`)
4. **Bug `submit-ds160`** — clientes com `contato_pessoal` não atualizados
5. **Graceful shutdown**
6. **Recuperação de forms abandonados**

### 🟡 Média
7. **Ordenar painel por `updated_at`**
8. **Filtros na lista de clientes** (nome, telefone, data)
9. **Validação de telefone** (< 10 dígitos)
10. **Rota `baixar-pdf`** — `id_cliente` → `cliente_id`
11. **Contador "Formulários Enviados"** (13 vs 16)
12. **`RESEND_API_KEY` local**
13. **UI pra `silenciar_bot`**

### 🟢 Baixa
14. **Fase 4 — Auto-serviço**
15. **Google Calendar**
16. **Bloquear bots varredores**
17. **Reforçar Watchdog** (e-mail além do WhatsApp)
18. **zsh UTF-8**

### ⚠️ Revertida
19. **promo50**

---

## 🎯 LIÇÕES APRENDIDAS

1. **Staging é essencial.**
2. **Protocolo:** backup → patch → `node -c` → teste local → commit staging → testar staging → merge main → teste prod.
3. **`git status` antes de commitar.**
4. **Testes: `210000000XX`.**
5. **`silenciar_bot`** é o jeito correto (não `tipo_contato`).
6. **Bug `submit-ds160`:** clientes com `contato_pessoal` não são atualizados.
7. **Bug `submit-passaporte`:** buscar só por `telefone`.
8. **Bug PDF:** sempre `.select()` antes de `.eq()`.

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
Anexei o arquivo PROMPT-INICIAL.md (v3.0).

**FEATURES ATIVAS:**
1. Bot WhatsApp (triagem + menus + filtros + follow-up + silenciar_bot)
2. Formulário DS-160 (12 passos) + bloqueio reenvio + limite de 3 + PDF completo
3. Formulário de Passaporte (modo único/familiar + alerta CPF divergente)
4. Portal cliente /meu-processo
5. Painel admin (clientes, reenvios, solicitações, upload CASV)
6. Watchdog (monitor Z-API + Supabase)
7. Staging completo (Supabase + Railway + branch)

**REGRAS CRÍTICAS:**
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Usar staging pra testar mudanças
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre `node -c server.js` antes de commit
- `git push origin main` aciona produção; `git push origin staging` aciona staging
- Testes SEMPRE com cliente fictício (210000000XX)
- SQL roda no Supabase SQL Editor
- PDF do DS-160 precisa de `checkPageBreak()`
- Upload de CASV NÃO sobrescreve cliente
- **Silenciar bot:** usar `silenciar_bot = true` (NUNCA `tipo_contato = 'contato_pessoal'`)

**PENDÊNCIAS PRIORITÁRIAS:**
1. Busca ampla de "Contato Pessoal" (clientes escondidos)
2. Modelo familiar do DS-160
3. Bug do `submit-ds160` (clientes com `contato_pessoal` não atualizados)
4. Graceful shutdown Railway

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