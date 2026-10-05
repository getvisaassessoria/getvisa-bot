# 🚀 PROMPT INICIAL — GetVisa Assessoria

> **Documento mestre.** Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> **Última atualização:** 02/10/2026
> **Versão do documento:** 2.0

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
- Supabase: projeto `gcwfxkbjovqnqccrcrjx`
- Railway: projeto `getvisa-bot`
- Dashboard admin: `/dashboard?api_key=admin123`

**Números importantes:**
- WhatsApp Business (bot): `21974601812`
- WhatsApp equipe/admin: `5521974601812`

---

## ✅ FEATURES ATIVAS EM PRODUÇÃO

### 1. Bot WhatsApp (Z-API)
- Triagem inicial (1 cliente / 2 lead / 3 outros)
- Menus por serviço (Visto Americano, Canadense, etc)
- Filtros: ignora grupo, fromMe, status, newsletter, broadcast
- Follow-up automático de leads (3 tentativas: 24h, 48h, 72h)
- Despedida educada pra "contato pessoal" (opção 3)
- Detecção de intenção (saudação, status, documentos, prazo, pagamento, etc)

### 2. Formulário DS-160 (12 passos)
- URL: `/formulario-ds160`
- Bloqueio de reenvio (flag `BLOCK_DS160_RESUBMIT=true`)
- Verificação no passo 1 (endpoint `/api/check-ds160-status`)
- Telefone virtual pra família (sufixo `-01`)
- **Array de acompanhantes, viagens, empregos, educação (2+ itens)**
- **Uppercase automático** (exceto emails, handles e radios)
- **Autocomplete do Chrome bloqueado** (`autocomplete="new-password"`)

### 3. Portal do Cliente (`/meu-processo`)
- Login: telefone + 4 últimos dígitos CPF
- Timeline de 10 etapas do processo
- Agendamentos (CASV + Entrevista)
- Botão WhatsApp pra especialista
- Correção pontual de campo (Fase 3)

### 4. Painel Admin
- `/dashboard` — visão geral
- `/painel` — lista de clientes
- `/painel-reenvios` — tentativas de reenvio com análise automática
- `/painel-solicitacoes` — solicitações de alteração (Fase 3)
- `/upload-casv-pdf` — upload do PDF de agendamento (extrai CASV + Entrevista)

### 5. Watchdog (monitor de saúde)
- Roda a cada 30 min (health Supabase + status Z-API)
- Alerta WhatsApp após 3 falhas consecutivas
- Registra em tabela `watchdog_logs`

### 6. Formulário de Passaporte (`/formulario-passaporte`)
- Modo único ou familiar
- Familiar com sufixo automático (`-01`, `-02`, ...)
- Vínculo por `telefone + cpf_ultimos4`
- **Ver seção "Formulário de Passaporte" abaixo**

### 7. Upload de PDF de Agendamento (`/upload-casv-pdf`)
- Aceita PDF do consulado americano
- Extrai: nomes, CASV (data + hora + local), Entrevista (data + hora + local)
- Salva em `agendamentos` + atualiza `etapas_processo`
- Dispara WhatsApp + e-mail automático
- **⚠️ Regra crítica: NÃO sobrescreve cliente existente**

---

## 🗄️ TABELAS SUPABASE

### `clientes`
Cadastro único por `telefone` (UNIQUE).
- Campos principais: `id`, `nome`, `email`, `telefone`, `cpf`, `data_nascimento`, `status`, `tipo_contato`, `tipo_servico`, `consulado`
- Follow-up: `followup_1_em`, `followup_2_em`, `followup_3_em`, `followup_parar`
- **Novos (02/10/2026):**
  - `tipo_servico`: `passaporte` | `visto` | `seguro` | `outro`
  - `cpf_ultimos4`: coluna gerada (`right(regexp_replace(cpf,'\D','','g'), 4)`)
  - `telefone_vinculacao`: telefone do titular + sufixo (`21991828052-01`)
  - `cliente_titular_id`: FK self-referencing (pra família)

### `form_ds160`
1 form por cliente. Campo `dados_formulario` (jsonb).
- **174 chaves** quando preenchido 100%
- Arrays: `prev_employer_*[]`, `other_employer_*[]`, `edu_*[]`, `languages[]`, `traveled_countries[]`, `social_*[]`, `companion_*[]`, `immediate_relative_*[]`, etc.

### `form_ds160_reenvios`
Histórico de tentativas de reenvio (bloqueio ativo).

### `portal_acessos`
Sessões do portal cliente (token 24h).

### `etapas_processo`
Funil de progresso (10 etapas):
1. `formulario_enviado`
2. `analise_correcoes`
3. `abertura_processo`
4. `boleto_emitido`
5. `boleto_pago`
6. `agendamento_realizado`
7. `treinamento_realizado`
8. `entrevista_realizada`
9. `visto_aprovado`
10. `passaporte_retornado`

**⚠️ Regra:** etapa **NUNCA regride** após `entrevista_realizada`.

### `agendamentos`
CASV + Entrevista (relaciona com `clientes.id`).

### `solicitacoes_alteracao_campo`
Solicitações de alteração pontual (Fase 3).

### `watchdog_logs`
Registros do monitor de saúde.

### `form_passaporte` (NOVO)
Solicitações de passaporte.
- Vínculo: `cliente_id` (FK) + `telefone_vinculacao`
- Campos principais: `nome`, `email`, `cpf`, `cidade`, `status`
- Status: `novo` | `em_analise` | `enviado_pf` | `concluido` | `cancelado`
- `dados_json` (jsonb) — todo o resto do form

---

## 📋 REGRAS DE NEGÓCIO CRÍTICAS

### Alteração de DS-160 após envio
- **Janela segura:** 5+ dias antes do CASV → pode refazer
- **Bloqueio:** <5 dias antes → não há tempo hábil
- **Após CASV:** aguardar 48h + reagendar
- **Após entrevista:** **NUNCA regride etapa**
- **Alerta 6 meses** do DS-160 (aproximação dos 12 meses)

### Complexidade de alteração
- 🔴 **Alerta vermelho:** consulado, nome, DOB, passaporte
- 🟡 **Alerta amarelo:** SSN, Tax ID, propósito de viagem
- ⚪ **Normal:** endereço, telefone, renda, etc

### Feature flags importantes
- `BLOCK_DS160_RESUBMIT=true` (Railway) — controle do bloqueio de reenvio
- `BLOCK_PASSAPORTE_RESUBMIT` (opcional) — controle do bloqueio de reenvio de passaporte
- **Rollback:** deletar a variável (30s, sem redeploy)

### Upload de PDF de agendamento (REGRA CRÍTICA)
**⚠️ O upload NÃO deve sobrescrever o cliente existente.**
- Busca por `telefone` primeiro
- Se existe → usa sem modificar
- Se não existe → cria novo
- **NUNCA** usar `upsert` (isso destruía nome/status)

### Vinculação familiar (passaporte)
- Titular: `telefone` = `21991828052`, `cliente_titular_id` = null
- Familiar: `telefone` = `21991828052-01`, `cliente_titular_id` = titular
- Vínculo do cliente: `telefone + cpf_ultimos4` (desambigua família)
- **Não usar `unique_telefone`** (a constraint existe, mas o familiar tem sufixo)

---

## 🚨 REGRAS DE SEGURANÇA

1. **ESTAMOS EM PRODUÇÃO** — sempre backup antes
2. Mudanças arriscadas → usar feature flag com rollback
3. Sempre rodar `node -c server.js` (e nos arquivos alterados) antes de commit
4. Nunca deletar dados sem confirmar que não são de cliente real
5. `git push` aciona deploy automático no Railway
6. Para testes: **criar cliente fictício**, nunca usar real
7. **SQL roda no SQL Editor do Supabase, NUNCA no terminal** (o zsh não interpreta SQL)
8. **Antes de mexer em PDF**, garantir `checkPageBreak()` (ver seção "Gerador de PDF")

---

## 🐛 BUGS JÁ RESOLVIDOS (contexto histórico)

| Bug | Fix | Data |
|-----|-----|------|
| getFormData pegava último radio | Só captura `checked` | 14/09 |
| Upsert sobrescrevia antes do bloqueio | Reordenado | 14/09 |
| Datas apareciam 1 dia antes | `formatarDataSegura` (parse manual) | 17/09 |
| `etapas_processo` vazia (FK pra tabela morta) | Trigger + UNIQUE + migração | 16/09 |
| Emoji 📌 no PDF (PDFKit não suporta) | Removido do gerador | 20/09 |
| Arrays truncavam (string vs array) | Helper `pegarValor` | 20/09 |
| Watchdog Z-API 400 | Adicionar header `Client-Token` | 20/09 |
| `/baixar-pdf` usava `acesso.id_cliente` | Trocar por `cliente.id` | 20/09 |
| Follow-up #2 conflitava com menu 1/2/3 | Trocar por palavra "AJUDA" | 19/09 |
| **PDF truncava após ~50% das seções** | `checkPageBreak()` (PDFKit não pula página sozinho) | 02/10 |
| **Arrays (empregos/educação/idiomas) viram string** | `getFormData()` captura `name="xxx[]"` | 02/10 |
| **Case mismatch (`ONE` vs `one`)** | Helpers `isSim()`/`isNao()` | 02/10 |
| **Nomes das seções não batiam** | `secoes` alinhada com `todosCampos` | 02/10 |
| **Propósito em inglês no PDF** | Tradução inline | 02/10 |
| **Relação do Pagador faltando** | Adicionado no form + PDF | 02/10 |
| **Autocomplete do Chrome sujando `state`** | `autocomplete="new-password"` + sanitização | 02/10 |
| **Uppercase destruía valores de radios** | Lista `CAMPOS_NAO_UPPERCASE` | 02/10 |
| **RLS bloqueava upload CASV** | `config/supabase.js` usa `SERVICE_ROLE_KEY` | 02/10 |
| **Upload CASV sobrescrevia cliente** | Substituído `upsert` por `SELECT` + `INSERT` | 02/10 |

---

## 🗂️ ESTRUTURA DE ARQUIVOS CRÍTICOS

### `server.js`
Arquivo principal (≈5000 linhas). Contém:
- Configuração Express
- Bot WhatsApp (triagem, menus, follow-up)
- Rotas do DS-160 (`/api/submit-ds160`)
- Rotas do passaporte (`/api/submit-passaporte`)
- Rotas do portal (`/api/portal/login`, `/api/portal/meu-processo`)
- Rotas de admin (`/api/admin/*`)
- **Gerador de PDF** (`gerarPDF_DS160`) — **⚠️ Não mexer sem entender o `checkPageBreak`**
- Watchdog + cron jobs

### `config/supabase.js`
**⚠️ Usa `SUPABASE_SERVICE_ROLE_KEY`** (bypass RLS).
- Se cair pra `SUPABASE_ANON_KEY`, RLS bloqueia INSERT em `clientes`

### `services/agendamentoService.js`
Extrai dados do PDF de agendamento.
- **⚠️ Regra crítica:** busca cliente por telefone; se existe, usa sem modificar; se não, cria

### `middleware/auth.js`
- `verificarAdmin`: aceita sessão, cookie ou `?api_key=` na URL
- `logAcesso`: só loga, não bloqueia

### `public/formulario-ds160.html`
Frontend do form (12 passos).
- `getFormData()`: captura arrays (`name="xxx[]"`), uppercase (exceto radios/emails), sanitização de autocomplete

### `public/upload-casv-pdf.html`
Frontend do upload de PDF.

### `public/formulario-passaporte.html`
Frontend do form de passaporte.

---

## 🎯 GERADOR DE PDF (DS-160)

### Estrutura
1. `gerarPDF_DS160(dados)` — recebe o JSON do form
2. `todosCampos` — mapa de ~150 campos (label → valor)
3. `writeSection(title, campos)` — escreve cada seção
4. `secoes` — ordem das seções + quais campos aparecem em cada
5. `checkPageBreak(altura)` — **⚠️ ESSENCIAL** (PDFKit não pula página sozinho)

### Regras críticas
- **`todosCampos[campo]` só funciona se o nome bater EXATAMENTE com `secoes`**
- **Arrays** devem usar `tamanho()` + `pegarValor()` (não `Array.isArray()` direto)
- **Radios** usar `isSim()`/`isNao()` (aceita `one`, `ONE`, `One`, `yes`, `YES`)
- **Nunca remover `checkPageBreak`** — sem ele, PDF trunca em 2 páginas

---

## 📌 PENDÊNCIAS PRIORIZADAS

### 🔴 Alta prioridade
1. **Graceful shutdown no Railway** — evita processo morto no meio do submit (causou problema real em 18/09)
2. **Recuperação de formulários abandonados** — lead começa a preencher mas não termina

### 🟡 Média prioridade
3. Melhorias no portal (data conclusão na timeline)
4. Dashboard analítico (conversão por etapa, tempo médio)
5. Card no dashboard admin (contador de solicitações pendentes)
6. **Corrigir `RESEND_API_KEY` local** — está inválido em `.env` (funciona em produção)

### 🟢 Baixa prioridade
7. Fase 4 — Auto-serviço completo (upload assistido)
8. Integração Google Calendar
9. Bloquear bots varredores nos logs (phpinfo, credentials.json, etc)

---

## 📚 DOCUMENTAÇÃO DETALHADA

Se precisar de mais contexto sobre um tema específico, **peça pra colar o doc correspondente**:

- `docs/handoff-vol1-arquitetura.md` — arquitetura base, Fase 3 original
- `docs/handoff-vol2-fixes-16set.md` — fix etapas_processo, copy refinada
- `docs/continuacao-17set.md` — follow-up automático, fix timezone
- `docs/continuacao-19set.md` — Z-API chip trocado, Watchdog (pendência)
- `docs/continuacao-20set.md` — Watchdog completo, Fases 2 e 3
- `docs/continuacao-02out.md` — PDF completo, upload CASV, vinculação familiar

**NUNCA invente** o que não estiver nesses docs. Se não souber, peça.

---

## 🎯 PROMPT PRONTO PRA COLAR NO CHAT

Copia o texto abaixo e cola como 1ª mensagem:

---

Olá! Preciso continuar um trabalho no sistema GetVisa Assessoria (assessoria de vistos americanos).

**CONTEXTO:**
- Stack: Node.js + Express + Supabase + Railway + Z-API + Resend
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Produção: https://app.getvisa.com.br
- Local: ~/getvisa-bot-v2
- Supabase projeto: gcwfxkbjovqnqccrcrjx
- Estamos EM PRODUÇÃO (clientes reais usando)

**DOCUMENTAÇÃO COMPLETA:**
Anexei o arquivo PROMPT-INICIAL.md com o contexto. Se precisar de detalhe técnico, me peça pra colar um dos docs específicos (handoff-vol1, handoff-vol2, continuacao-17set, continuacao-19set, continuacao-20set, continuacao-02out).

**FEATURES ATIVAS:**
1. Bot WhatsApp (triagem + menus + filtros + follow-up)
2. Formulário DS-160 (12 passos) + bloqueio reenvio + PDF completo
3. Formulário de Passaporte (modo único/familiar)
4. Portal cliente /meu-processo (login + timeline + correção de campo)
5. Painel admin (clientes, reenvios, solicitações, upload CASV)
6. Watchdog (monitor Z-API + Supabase)

**REGRAS CRÍTICAS:**
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre rodar `node -c server.js` antes de commit
- Push aciona deploy automático no Railway
- Testes SEMPRE com cliente fictício, nunca com real
- SQL roda no Supabase SQL Editor, NUNCA no terminal
- PDF do DS-160 precisa de `checkPageBreak()` (senão trunca)
- Upload de CASV NÃO pode sobrescrever cliente (usar SELECT + INSERT, nunca upsert)

**PENDÊNCIAS PRIORITÁRIAS:**
1. Graceful shutdown Railway
2. Recuperação de formulários abandonados
3. Melhorias no portal
4. Dashboard analítico

**O QUE PRECISO AGORA:**
[Cole aqui o que você precisa — ex: "vamos implementar o graceful shutdown"]

**IMPORTANTE — Antes de agir:**
1. Confirme que entendeu o contexto
2. Se faltar informação técnica, me peça pra colar o doc específico
3. Sugira um plano antes de executar qualquer mudança
4. **Nunca invente** informação que não esteja nos docs. Se não souber, pergunte.

---

## 💡 DICA DE USO

**Opção A — Anexar arquivo:**
Clica no 📎 e anexa este arquivo `.md`

**Opção B — Colar texto:**
Copia a seção "PROMPT PRONTO PRA COLAR NO CHAT" e cola no chat

**Opção C — Referenciar via GitHub:**

# 📌 PENDÊNCIAS PRIORIZADAS

### 🟡 Média prioridade (NOVO)
...

### 🟢 Baixa prioridade (NOVO)
5. **Unificar modelo familiar no DS-160** — hoje usa telefone virtual (-01, -02) como solução paliativa. Ideal: aplicar o mesmo modelo do passaporte (titular + cliente_titular_id + telefone_vinculacao + modo familiar explícito).

6. **Testes com telefone:** usar SEMPRE `210000000XX` (faixa Anatel pra testes).
    NUNCA `219999900XX` (pode ser real). Erro em 02/10/2026 causou transtorno.

7. **Teste de `POST /api/submit-ds160`:** NUNCA usar telefone que dispare WhatsApp real.
    Usar `curl` com `phone` virtual OU desabilitar `enviarWhatsApp` temporariamente.

8. **Antes de qualquer teste:** confirmar que o número NÃO está em `clientes` e NÃO é conhecido.