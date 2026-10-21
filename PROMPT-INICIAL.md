# 🚀 PROMPT INICIAL — GetVisa Assessoria

> **Documento mestre.** Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> **Última atualização:** 21/10/2026
> **Versão do documento:** 6.0 (Consolidado com Histórico Completo)

---

## 🎯 CONTEXTO GERAL

Sistema de assessoria para vistos americanos. **Em produção desde 14/09/2026** com clientes reais.

**Stack:**
- Backend: Node.js + Express
- Banco: Supabase (PostgreSQL)
- Deploy: Railway (auto-deploy via `git push`)
- WhatsApp: Z-API (instância `3F1D4E0F2AD0539F0C52B20DE66F3711`)
- Email: Resend (agora com envio de PDFs via `pdfkit`)
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

## 🆕 NOVIDADES v6.0 (Sessões 20-21/10/2026)

### 1. Correção de Build no Railway (Dockerfile)
- **Problema:** O Railway começou a falhar no build com erro `apt-get install libatomic1`. O Nixpacks não conseguia acessar o mirror.
- **Solução:** Criado um arquivo `Dockerfile` na raiz do projeto usando a imagem `node:24`. O Railway detecta o Dockerfile e ignora o Nixpacks, evitando o erro de instalação.

### 2. Cron Job de Lembretes Funcional
- **Implementação:** O cron (que era apenas um `console.log`) agora roda todos os dias às **07:00 da manhã**.
- **Antecedência:** Busca agendamentos para **D-1 (amanhã)** e **D-2 (depois de amanhã)**.
- **Inteligência:** O texto se adapta ao tipo de agendamento (Treinamento pede local silencioso, CASV pede passaporte).
- **Segurança:** Respeita `silenciar_bot`, `contato_pessoal` e tem anti-spam em memória (`lembretesEnviadosHoje`).

### 3. Filtros de Pesquisa no Painel
- **Painel de Clientes (`/painel`):** Adicionados filtros por **Nome** e **Data de Cadastro**.
- **Painel de Agendamentos (`/admin-login.html`):** Adicionados filtros por **Nome/Telefone**, **Data**, **Atividade** (CASV/Entrevista) e **Local** (dropdown com Rio, SP, Brasília, Recife, POA).
- **Detalhe:** O botão "Exportar CSV" agora exporta apenas o que está filtrado na tela.

### 4. PDF e E-mails no Formulário de Passaporte
- **Geração de PDF:** O sistema agora usa `pdfkit` para gerar um PDF completo com todas as seções do formulário.
- **Envio para a Equipe:** E-mail com layout azul (GetVisa) + PDF anexo.
- **Envio para o Cliente:** E-mail de confirmação de recebimento ("Recebemos seus dados!") + PDF anexo.

### 5. Extração de Família no Upload de PDF do Consulado
- **Problema:** O upload do PDF salvava o agendamento apenas para o titular (João).
- **Solução:** O `agendamentoService.js` agora lê todos os nomes da tabela do PDF, busca o ID de cada familiar no banco de dados (usando o primeiro nome via `.ilike` para driblar acentos) e insere o CASV/Entrevista para todos no dashboard.

---

## 🆕 NOVIDADES v5.0 (Sessões 18-19/10/2026)

### 1. Treinamento Agendado (`treinamento_agendado`)
- **Nova Etapa:** Adicionada ao fluxo entre `agendamento_realizado` e `treinamento_realizado`.
- **Painel:** Ao selecionar "Treinamento Agendado" no modal de status, abre campos para Data, Horário e Tipo (presencial/online), que chamam a rota `/api/agendar-treinamento`.
- **Portal:** Timeline atualizada para exibir corretamente o passo "🎯 Treinamento Agendado".
- **Correção Crítica:** O upsert na tabela `etapas_processo` falhava silenciosamente porque `id_cliente` era `NOT NULL`. Corrigido preenchendo `id_cliente` e `cliente_id`.

### 2. Silenciamento do Bot (UI, Blindagem e Sanitização)
- **Painel:** Novo checkbox "🔇 Silenciar bot para este cliente" no modal de atualizar status e tag visual "🔇 Silenciado" na listagem.
- **Bot (Opção 3):** Corrigido o bug onde a opção 3 tentava salvar o status `contato_pessoal` (inválido no ENUM). Agora salva `status: 'formulario_enviado'` e `silenciar_bot: true`.
- **Blindagem de Notificação:** A função `enviarNotificacaoStatus` agora consulta o banco antes de enviar e bloqueia se `silenciar_bot = true` ou `tipo_contato = 'contato_pessoal'`.
- **Sanitização:** Todos os clientes reais de produção tiveram o `silenciar_bot` resetado para `false` em massa (para voltarem a receber mensagens), exceto a Eliza e contatos pessoais.

### 3. Debounce no Webhook (Anti-Spam)
- **Problema:** Clientes que digitam mensagens picadas (ex: "Oi", "Estou", "Iniciando") recebiam uma resposta para cada frase (caso real do cliente André).
- **Solução:** Implementado `userTimeouts` (Map) no `server.js`. O bot agora espera **3 segundos** de silêncio antes de processar a mensagem. Se chegar outra no meio do caminho, o timer é reiniciado.
- **Resultado:** O bot responde apenas uma vez, com a última mensagem consolidada.

### 4. Inteligência de Triagem e Melhoria no Menu
- **UX:** O texto do menu foi limpo e encurtado para facilitar a leitura. Adicionada a seta `👉`.
- **Inteligência de Texto:** Se a pessoa digitar palavras como "fornecedor", "contato pessoal", "não sou cliente" ou "pessoal", o bot entende automaticamente como a Opção 3 (contato pessoal) e silencia, sem obrigar a pessoa a digitar o número "3".

### 5. Upload de PDF (Novo Layout do Consulado)
- **Extração de Nomes:** Regex reescrito para varrer o texto linha por linha (`split(/[\r\n]+/)`), pois o novo PDF quebra o texto de forma diferente.
- **Timezone Fix:** As datas no dashboard voltavam 1 dia (ex: 19 virava 18) por causa do fuso UTC. Corrigido adicionando `{ timeZone: 'UTC' }` no `toLocaleDateString` do frontend.
- **Trava de Duplicidade:** Proteção no `server.js` e no `agendamentoService.js`. Se o mesmo PDF for enviado duas vezes, o banco não duplica e **o WhatsApp/E-mail não são reenviados** (Mensagem: "🛡️ Agendamento já existia...").

### 6. Autenticação no Painel (Staging vs Produção)
- **Problema:** O painel mandava a chave `admin123` hardcoded, causando erro `401` no staging (que usa `staging123`).
- **Solução:** Chave dinâmica no frontend: `window.location.hostname.includes('web-production') ? 'staging123' : 'admin123'`.

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

### Features novas em produção (v3.1 — 17/10)
1. **Login do Portal por CPF + Data de Nascimento** (substituiu telefone + 4 dígitos)
2. **Modelo Familiar do DS-160 (Frontend + Backend)** — Tela 0 (Único/Familiar) + vinculação via `cliente_titular_id` + herança de campos comuns
3. **Dashboard mostra as duas datas** (CASV + Entrevista) na coluna "Data"
4. **Fix `submit-ds160`:**
   - Salva `data_nascimento` (do campo `dob` do form)
   - Clientes `contato_pessoal` viram `cliente` (mas mantêm `silenciar_bot = true`)
5. **Fix `middleware/auth.js`:** usa `process.env.ADMIN_API_KEY` (não mais hardcoded)
6. **Rodapé do portal:** "Entre com seu CPF e sua Data de Nascimento"

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

### Regras novas (v3.1)
- **Limite de 3 alterações** no DS-160 (regra do consulado, margem de segurança de 5 dias)
- **CPF divergente:** alerta a equipe (mas NÃO atualiza automaticamente)
- **Silenciar bot:** usar `silenciar_bot = true`, NÃO `tipo_contato = 'contato_pessoal'`
- **Login do portal:** CPF completo + Data de Nascimento (NÃO mais telefone + 4 dígitos)
- **Modelo familiar:** titular tem `cliente_titular_id = null`; dependente tem `cliente_titular_id = <titular>` + `telefone_vinculacao`

---

## ✅ FEATURES ATIVAS EM PRODUÇÃO

### 1. Bot WhatsApp (Z-API)
- Triagem inicial (1 cliente / 2 lead / 3 outros) com detecção de palavras-chave.
- Menus por serviço.
- Filtros: ignora grupo, fromMe, status, newsletter, broadcast.
- **Debounce de 3s:** agrupa mensagens picadas em uma única resposta.
- Follow-up automático de leads (3 tentativas: 24h, 48h, 72h).
- Despedida educada pra "contato pessoal" (Opção 3).
- Detecção de intenção.
- **Silenciamento via flag `silenciar_bot`** (blindado no backend e controlável pelo painel).

### 2. Formulário DS-160 (12 passos + Tela 0)
- URL: `/formulario-ds160`
- **Tela 0:** escolha entre "Único" ou "Familiar" (layout do passaporte).
- **Se familiar:** pede telefone do titular (com sufixo automático ou telefone próprio).
- **Herança de campos:** endereço, contato EUA, pagador, viagem (via `localStorage`).
- **Botão "Novo formulário familiar"** após o envio (vai direto pro Passo 1).
- Bloqueio de reenvio (`BLOCK_DS160_RESUBMIT=true`).
- **Limite de 3 tentativas** de reenvio.
- Verificação no passo 1 (`/api/check-ds160-status`).
- Arrays (acompanhantes, viagens, empregos, educação).
- Uppercase automático (exceto emails/handles/radios).
- Autocomplete do Chrome bloqueado.
- Geração de PDF completo enviado por e-mail.

### 3. Portal do Cliente (`/meu-processo`)
- **Login:** CPF completo + Data de Nascimento.
- Timeline de 11 etapas (incluindo `treinamento_agendado`).
- Agendamentos (CASV + Entrevista).
- Botão WhatsApp pra especialista.
- Correção pontual de campo (Fase 3).

### 4. Painel Admin
- `/dashboard` — 4 cards.
- `/painel` — lista de clientes (com 2 datas: CASV + Entrevista, tag de Silenciado e botão de agendamento de treinamento).
- `/admin-login.html` — Painel de Agendamentos com filtros de Data, Local e Atividade.
- `/painel-reenvios` — tentativas.
- `/painel-solicitacoes` — alterações (Fase 3).
- `/upload-casv-pdf` — upload de agendamento (com trava de duplicidade e compatibilidade com novo layout).

### 5. Watchdog (Monitor de Saúde)
- Roda a cada 30 min.
- Alerta WhatsApp após 3 falhas.
- Registra em `watchdog_logs`.

### 6. Formulário de Passaporte (`/formulario-passaporte`)
- Modo único ou familiar (base do layout da Tela 0 do DS-160).
- Familiar com sufixo (`-01`, `-02`).
- **Alerta de CPF divergente.**
- **Novo:** Gera PDF completo e envia para equipe e cliente.

### 7. Upload de PDF de Agendamento (`/upload-casv-pdf`)
- Extrai CASV + Entrevista.
- **⚠️ NÃO sobrescreve cliente existente.**
- Trava de duplicidade (não envia WhatsApp/e-mail duas vezes).
- Salva agendamentos para todos os familiares listados no PDF.

### 8. Cron Job de Lembretes
- **Horário:** Roda todos os dias às **07:00 da manhã** (horário de Brasília).
- **Antecedência:** Busca compromissos para **D-1 (amanhã)** e **D-2 (depois de amanhã)**.
- **Inteligência:** Adapta o checklist dependendo do tipo de agendamento (Treinamento pede local silencioso, CASV pede passaporte, etc).
- **Segurança:** Respeita a flag `silenciar_bot`, ignora `contato_pessoal` e tem anti-spam em memória (`lembretesEnviadosHoje`).

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
Funil (11 etapas):
1. `formulario_enviado` → 2. `analise_correcoes` → 3. `abertura_processo` → 4. `boleto_emitido` → 5. `boleto_pago` → 6. `agendamento_realizado` → 7. `treinamento_agendado` → 8. `treinamento_realizado` → 9. `entrevista_realizada` → 10. `visto_aprovado` → 11. `passaporte_retornado`

**⚠️ NUNCA regride após `entrevista_realizada`.**
**⚠️ A tabela tem colunas duplicadas legadas (`id_cliente` NOT NULL e `cliente_id` FK). O código deve preencher ambas no upsert.**

### `agendamentos`
CASV + Entrevista + Treinamento.
- **⚠️ O campo `data_agendamento` deve ser lido no frontend com `timeZone: 'UTC'` para não voltar 1 dia.**

### `solicitacoes_alteracao_campo`
Alterações pontuais (Fase 3).

### `watchdog_logs`
Monitor de saúde.

### `form_passaporte`
Status: `novo` | `em_analise` | `enviado_pf` | `concluido` | `cancelado`.

---

## 📋 REGRAS DE NEGÓCIO CRÍTICAS

### Login do Portal
- **CPF completo + Data de Nascimento**
- Backend: `/api/portal/login` aceita `{ cpf, dataNascimento }`
- Funciona pra titular, cônjuge, filho, criança (cada um com seu CPF + DOB)
- **NÃO usa mais** telefone + 4 dígitos

### Modelo Familiar DS-160
- **Tela 0:** escolha "Único" ou "Familiar"
- **Titular:** `telefone = <próprio>`, `cliente_titular_id = null`, `telefone_vinculacao = null`
- **Familiar (criança):** `telefone = <titular>-01`, `cliente_titular_id = <titular>`, `telefone_vinculacao = <titular>-01`
- **Familiar (adulto com telefone próprio):** `telefone = <próprio>`, `cliente_titular_id = <titular>`, `telefone_vinculacao = <próprio>`
- **Herança de campos:** endereço, contato EUA, pagador, viagem (via `localStorage` + `input-modo`)
- **Fluxo sequencial:** após o envio, botão "Novo formulário familiar" → direto pro Passo 1 (sem voltar pra Tela 0)

### Limite de 3 alterações no DS-160
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

### Silenciar bot
- **Usar `silenciar_bot = true`** (não `tipo_contato`)
- **Motivo:** silenciar sem perder classificação
- **Efeito:** bot não responde + não notifica
- **Ativação:** Pelo checkbox no painel ou Opção 3 do bot.
- **Blindagem:** A função `enviarNotificacaoStatus` checa a flag antes de disparar.

### Upload PDF agendamento
- **⚠️ NÃO sobrescreve cliente.**
- Busca por telefone, se existe usa, se não cria.
- **⚠️ Trava de duplicidade:** Se subir o mesmo PDF 2x, o WhatsApp/E-mail **não** são reenviados.
- Extração de nomes via `split` por linha e busca de familiares pelo primeiro nome.

### Vinculação familiar (Passaporte)
- Titular: `telefone` = `21991828052`
- Familiar: `telefone` = `21991828052-01`
- **⚠️ `submit-passaporte` busca só por `telefone`** (não `telefone + cpf_ultimos4`)

### CPF divergente
- **NÃO atualiza** automaticamente
- **Alerta equipe** via WhatsApp
- **Loga no console**

### `submit-ds160` — contato_pessoal
- Se cliente é `contato_pessoal` **E** preenche DS-160:
  - Pula o bloqueio de reenvio
  - Vira `cliente` no upsert
  - Mantém `silenciar_bot = true`
- **Lógica:** `if (formExistente && BLOQUEAR_REENVIO && !ehContatoPessoal)`

### `submit-ds160` — data_nascimento
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
12. **Nunca usar `git merge staging` sem `-m`** (abre o Vim). Usar: `git merge staging -m "merge: staging para main"`.
13. **Dockerfile:** O projeto agora usa Dockerfile. Se o Railway der erro de `apt-get`, verifique se o arquivo está na raiz.

---

## 🐛 BUGS JÁ RESOLVIDOS (HISTÓRICO COMPLETO)

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
| `data_nascimento` não salva no `submit-ds160` | Salvar `dobForm` no upsert | 17/10 |
| `middleware/auth.js` hardcoded `admin123` | `process.env.ADMIN_API_KEY` | 17/10 |
| `showStep(1)` impedia Tela 0 | `showStep(0)` no `DOMContentLoaded` | 17/10 |
| Tela 0 com HTML duplicado | Refatorado (layout passaporte) | 17/10 |
| `id_cliente` NOT NULL bloqueava upsert | Preencher `id_cliente` e `cliente_id` no upsert | 18/10 |
| Portal não mostrava `treinamento_agendado` | Adicionado no `mapaStatusParaEtapa` e `ordemEtapas` | 18/10 |
| Opção 3 do bot quebrava o upsert | Salvar `status: 'formulario_enviado'` e `silenciar_bot: true` | 19/10 |
| Clientes silenciados recebiam notificação | Blindagem na `enviarNotificacaoStatus` | 19/10 |
| Maioria dos clientes reais estavam silenciados | Reset em massa para `false`, exceto contatos pessoais | 19/10 |
| Upload de novo PDF não achava o nome | Regex reescrito com split linha a linha | 19/10 |
| Datas no painel voltando 1 dia | `timeZone: 'UTC'` no `toLocaleDateString` | 19/10 |
| WhatsApp duplicado ao subir PDF 2x | Trava de duplicidade no `server.js` | 19/10 |
| Spam de mensagens (André) | Debounce de 3s no webhook (`userTimeouts`) | 19/10 |
| Menu confuso / opção 3 ignorada | Melhoria no texto e inteligência de palavras-chave | 19/10 |
| Chave API hardcoded quebrando o staging | Chave dinâmica no frontend (`staging123` vs `admin123`) | 19/10 |
| Railway falhando build (apt-get libatomic1) | Criação do `Dockerfile` na raiz | 20/10 |
| Cliente não recebia e-mail de passaporte | Adicionado envio para o cliente + PDF via `pdfkit` | 20/10 |
| Lembrete do cron não achava as datas | Bug de fuso horário (JS UTC vs Brasil) | 20/10 |

---

## 🗂️ ESTRUTURA DE ARQUIVOS

### `server.js`
Principal (≈5000 linhas). Express + bot + rotas + **gerador de PDF** + watchdog + cron.

### `config/supabase.js`
Usa `SUPABASE_SERVICE_ROLE_KEY`.

### `services/agendamentoService.js`
Extrai dados do PDF do consulado.

### `middleware/auth.js`
`verificarAdmin`, `verificarApiKey`. **Usa `process.env.ADMIN_API_KEY`.**

### `public/formulario-ds160.html`
Frontend DS-160 (Tela 0 + 12 passos + herança de campos).

### `public/formulario-passaporte.html`
Frontend passaporte.

### `public/painel-clientes.html`
Lista de clientes (2 datas: CASV + Entrevista + Filtros).

### `public/admin-login.html`
Painel de Agendamentos (com filtros de data, local e atividade).

### `public/dashboard-novo.html`
Dashboard admin (4 cards).

### `Dockerfile`
Define a imagem `node:24` para evitar falhas de build no Railway.

---

## 🎯 GERADOR DE PDF (DS-160 E PASSAPORTE)

### Estrutura
1. `gerarPDF_DS160(dados)` / `pdfkit` para passaporte.
2. `todosCampos` (~150 campos).
3. `writeSection(title, campos)`.
4. `secoes` (ordem).
5. `checkPageBreak(altura)` — **⚠️ ESSENCIAL**

### Regras
- Nome deve bater EXATAMENTE.
- Arrays: `tamanho()` + `pegarValor()`.
- Radios: `isSim()`/`isNao()`.
- NUNCA remover `checkPageBreak`.

---

## 📌 PENDÊNCIAS PRIORIZADAS

### 🔴 Alta
1. **Ajustar extração de "Membros da Família"** no PDF (está pegando frases de instrução como "precisam trazer uma foto...").
2. **Reforçar Watchdog** — e-mail além do WhatsApp (quando Z-API desconectar).
3. **CPF divergente do Moisés** (`2312` vs `0749`) — investigar.
4. **Graceful shutdown no Railway**.
5. **Recuperação de forms abandonados**.
6. **CPF da Maruzza** — pedir e atualizar (hoje tá `000.000.000-00`).

### 🟡 Média
7. **Limpar duplicatas** na tabela `agendamentos` geradas por uploads antigos no painel.
8. **Ordenar painel por `updated_at`**.
9. **Validação de telefone** (< 10 dígitos).
10. **Contador "Formulários Enviados"** (13 vs 16).
11. **`RESEND_API_KEY` local** (está inválido no `.env` local, funciona no Railway).
12. **UI pra `silenciar_bot`** (já temos checkbox, mas pode ter uma tela dedicada).
13. **Herança de campos no formulário familiar** — testar em produção.
14. **Limpeza de arquivos `admin.html.old`** e `.backup`.

### 🟢 Baixa
15. **Fase 4 — Auto-serviço**.
16. **Google Calendar**.
17. **Bloquear bots varredores**.
18. **Hook de pré-commit** (bloquear commit em `main`).

### ⚠️ Revertida
19. **promo50**.

---

## 🎯 LIÇÕES APRENDIDAS

1. **Staging é essencial.**
2. **Protocolo:** backup → patch → `node -c` → teste local → commit staging → testar staging → merge main → teste prod.
3. **`git branch` + `git status` ANTES de commitar** (evita commitar em `main` ou dar push vazio).
4. **Testes: `210000000XX`.**
5. **`silenciar_bot`** é o jeito correto (não `tipo_contato`).
6. **Erros silenciosos do Supabase:** A lib do supabase-js não lança exceção pro catch. Sempre checar `{ data, error }` antes de logar sucesso.
7. **Bugs de Timezone:** Sempre usar `{ timeZone: 'UTC' }` ao formatar datas no frontend para evitar voltar 1 dia. E ao criar cron jobs no Node, sempre converter o horário para o fuso do Brasil (`agora.getTime() - (3 * 60 * 60 * 1000)`).
8. **PDF do Consulado:** O layout muda. Sempre extrair usando splits de linha a linha em vez de Regex complexos e rígidos.
9. **Git e Vim:** Sempre usar `git merge staging -m "mensagem"` para não travar no editor de texto.
10. **Debounce no WhatsApp:** O Z-API manda uma requisição por mensagem. O debounce agrupa as mensagens picadas e evita spam de respostas.
11. **Z-API pode desconectar silenciosamente** (17/10) — o Watchdog avisa, mas pode passar batido.
12. **Railway e Nixpacks:** Se o `apt-get` falhar, a solução definitiva é criar um `Dockerfile` na raiz com a imagem do Node.

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
Anexei o arquivo PROMPT-INICIAL.md (v6.0).

**FEATURES ATIVAS:**
1. Bot WhatsApp (triagem + menus + filtros + follow-up + silenciar_bot + debounce + inteligência de palavras)
2. Formulário DS-160 (Tela 0 + 12 passos) + bloqueio reenvio + limite de 3 + PDF completo + modelo familiar + herança de campos
3. Formulário de Passaporte (modo único/familiar + alerta CPF divergente + geração de PDF e envio por e-mail)
4. Portal cliente /meu-processo (login por CPF + DOB)
5. Painel admin (clientes, reenvios, solicitações, upload CASV com filtros e extração de família)
6. Watchdog (monitor Z-API + Supabase)
7. Cron Job de Lembretes (roda às 7h, D-1 e D-2)
8. Staging completo (Supabase + Railway + branch)

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
- **Login portal:** CPF + Data de Nascimento
- **Modelo familiar:** titular + `cliente_titular_id` + `telefone_vinculacao`
- **Git Merge:** Sempre usar `-m` para não abrir o Vim.
- **Docker:** O projeto usa Dockerfile na raiz.

**PENDÊNCIAS PRIORITÁRIAS:**
1. Ajustar extração de "Membros da Família" no PDF (está pegando frases de instrução).
2. Reforçar Watchdog (e-mail além do WhatsApp).
3. Graceful shutdown Railway.
4. Recuperação de formulários abandonados.

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
**Opção C — GitHub:** `https://github.com/getvisaassessoria/getvisa-bot/blob/main/docs/PROMPT-INICIAL.md`

---

**Bom trabalho!** 🚀