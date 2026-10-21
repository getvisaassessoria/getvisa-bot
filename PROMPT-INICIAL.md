# 🚀 PROMPT INICIAL — GetVisa Assessoria

> **Documento mestre.** Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> **Última atualização:** 20/10/2026
> **Versão do documento:** 5

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

## 🆕 NOVIDADES v5 (Sessões 18-20/10/2026)

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

### 7. Cron Job de Lembretes (NOVO — 20/10)

O que faz: Roda todos os dias às 7h da manhã e envia lembretes para agendamentos de CASV, Entrevista e Treinamento.

Antecedência: Avisa 2 dias antes (D-2) e 1 dia antes (D-1).

Inteligência: O texto da mensagem adapta o checklist dependendo do tipo de compromisso (ex: para treinamento não pede passaporte, pede local silencioso).

Segurança: Respeita a flag silenciar_bot e contato_pessoal. Tem sistema anti-spam na memória para não enviar a mesma mensagem repetidas vezes no mesmo dia.

---

## ✅ FEATURES ATIVAS EM PRODUÇÃO

### 1. Bot WhatsApp (Z-API)
- Triagem inicial (1 cliente / 2 lead / 3 outros) com detecção de palavras-chave.
- Menus por serviço.
- Filtros: ignora grupo, fromMe, status, newsletter, broadcast.
- **Debounce de 3s:** agrupa mensagens picadas em uma única resposta.
- Follow-up automático de leads (3 tentativas: 24h, 48h, 72h).
- Despedida educada pra "contato pessoal" (Opção 3).
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
- Uppercase automático, autocomplete do Chrome bloqueado.

### 3. Portal do Cliente (`/meu-processo`)
- **Login:** CPF completo + Data de Nascimento.
- Timeline de 11 etapas (incluindo `treinamento_agendado`).
- Agendamentos (CASV + Entrevista).
- Botão WhatsApp pra especialista.

### 4. Painel Admin
- `/dashboard` — 4 cards.
- `/painel` — lista de clientes (com 2 datas: CASV + Entrevista, tag de Silenciado e botão de agendamento de treinamento).
- `/painel-reenvios` — tentativas.
- `/painel-solicitacoes` — alterações.
- `/upload-casv-pdf` — upload de agendamento (com trava de duplicidade e compatibilidade com novo layout).

### 5. Watchdog (monitor de saúde)
- Roda a cada 30 min. Alerta WhatsApp após 3 falhas. Registra em `watchdog_logs`.

### 6. Formulário de Passaporte (`/formulario-passaporte`)
- Modo único ou familiar (base do layout da Tela 0 do DS-160).
- Familiar com sufixo (`-01`, `-02`).
- **Alerta de CPF divergente.**

---

## 🗄️ TABELAS SUPABASE

### `clientes`
Cadastro único por `telefone` (UNIQUE).
- Campos: `id`, `nome`, `email`, `telefone`, `cpf`, `data_nascimento`, `status`, `tipo_contato`, `tipo_servico`, `consulado`
- Follow-up: `followup_1_em`, `followup_2_em`, `followup_3_em`, `followup_parar`
- **Novos:** `tipo_servico`, `cpf_ultimos4` (gerada), `telefone_vinculacao`, `cliente_titular_id`, `silenciar_bot` (boolean).

### `form_ds160`
1 form por cliente. `dados_formulario` (jsonb, ~174 chaves).
- `tentativas_reagendamento` (limite 3).
- **`cliente_id`** (FK correta) e **`id_cliente`** (legada).

### `form_ds160_reenvios`
Histórico de tentativas.

### `portal_acessos`
Sessões (token 24h).

### `etapas_processo`
Funil (11 etapas):
`formulario_enviado` → `analise_correcoes` → `abertura_processo` → `boleto_emitido` → `boleto_pago` → `agendamento_realizado` → `treinamento_agendado` → `treinamento_realizado` → `entrevista_realizada` → `visto_aprovado` → `passaporte_retornado`

**⚠️ NUNCA regride após `entrevista_realizada`.**
**⚠️ A tabela tem colunas duplicadas legadas (`id_cliente` NOT NULL e `cliente_id` FK). O código deve preencher ambas no upsert.**

### `agendamentos`
CASV + Entrevista + Treinamento.
- **⚠️ O campo `data_agendamento` deve ser lido no frontend com `timeZone: 'UTC'` para não voltar 1 dia.**

---

## 📋 REGRAS DE NEGÓCIO CRÍTICAS

### Debounce de Mensagens
- **Tempo de espera:** 3 segundos (`userTimeouts` Map).
- **Efeito:** Evita spam de respostas para clientes que digitam rápido.

### Inteligência de Triagem
- Palavras-chave: "fornecedor", "contato pessoal", "pessoal", "não sou cliente" assumem automaticamente a Opção 3.

### Silenciar bot
- **Usar `silenciar_bot = true`** (não `tipo_contato`).
- **Efeito:** bot não responde + não notifica.
- **Ativação:** Checkbox no painel ou Opção 3 do bot.
- **Blindagem:** `enviarNotificacaoStatus` checa a flag antes de disparar.

### Upload PDF agendamento
- **⚠️ NÃO sobrescreve cliente.**
- **⚠️ Trava de duplicidade:** Se subir o mesmo PDF 2x, o WhatsApp/E-mail **não** são reenviados.
- **⚠️ Layout Novo:** Extração de nomes via `split` por linha.

### Login do Portal
- **CPF completo + Data de Nascimento** (não usa mais telefone + 4 dígitos).

### Modelo Familiar DS-160
- **Titular:** `cliente_titular_id = null`, `telefone_vinculacao = null`.
- **Familiar:** `cliente_titular_id = <titular>` + sufixo no telefone se necessário.

### Limite de 3 alterações no DS-160
- **Margem GetVisa:** 5 dias (não 3).
- **Contador:** `tentativas_reagendamento` (Trava em 3).

---

## 🚨 REGRAS DE SEGURANÇA

1. **ESTAMOS EM PRODUÇÃO** — backup antes.
2. **Usar staging pra testar.**
3. Feature flag com rollback.
4. `node -c server.js` antes de commit.
5. **`git branch` + `git status` ANTES de commitar.**
6. `git push origin main` → produção; `git push origin staging` → staging.
7. Testes: `210000000XX`.
8. **SQL no SQL Editor**, nunca terminal.
9. PDF precisa `checkPageBreak()`.
10. **Nunca usar `git merge staging` sem `-m`** (abre o Vim). Usar: `git merge staging -m "merge: staging para main"`.

---

## 🐛 BUGS JÁ RESOLVIDOS (HISTÓRICO RECENTE)

| Bug | Fix | Data |
|-----|-----|------|
| Spam de mensagens (André) | Debounce de 3s no webhook (`userTimeouts`) | 19/10 |
| Menu confuso / opção 3 ignorada | Melhoria no texto e inteligência de palavras-chave | 19/10 |
| Chave API hardcoded quebrando o staging | Chave dinâmica no frontend (`staging123` vs `admin123`) | 19/10 |
| `id_cliente` NOT NULL bloqueava upsert no `etapas_processo` | Buscar UUID do cliente e preencher `id_cliente` e `cliente_id` no upsert | 18/10 |
| Portal não mostrava `treinamento_agendado` | Adicionado no `mapaStatusParaEtapa` e `ordemEtapas` | 18/10 |
| Opção 3 do bot quebrava o upsert | Salvar `status: 'formulario_enviado'` e `silenciar_bot: true` | 19/10 |
| Clientes silenciados recebiam notificação (Eliza) | Blindagem na `enviarNotificacaoStatus` | 19/10 |
| Maioria dos clientes reais estavam silenciados | Reset em massa para `false`, exceto contatos pessoais | 19/10 |
| Upload de novo PDF não achava o nome | Regex reescrito com split linha a linha | 19/10 |
| Datas no painel voltando 1 dia | `timeZone: 'UTC'` no `toLocaleDateString` | 19/10 |
| WhatsApp duplicado ao subir PDF 2x (Cintia) | Trava de duplicidade no `server.js` | 19/10 |

---

## 📌 PENDÊNCIAS PRIORIZADAS

### 🔴 Alta
1. **Reforçar Watchdog** — e-mail além do WhatsApp.
2. **Graceful shutdown no Railway.**
3. **Recuperação de forms abandonados.**
4. **CPF da Maruzza** — pedir e atualizar.

### 🟡 Média
5. **Ajustar extração de "Membros da Família"** (está pegando frases de instrução).
6. **Limpar duplicatas** na tabela `agendamentos` geradas por uploads antigos.
7. **Ordenar painel por `updated_at`** e adicionar filtros.
8. **Validação de telefone** (< 10 dígitos).
9. **Contador "Formulários Enviados"** (13 vs 16).
10. **Limpeza de arquivos `admin.html.old`** (consolidar num só).

### 🟢 Baixa
11. **Fase 4 — Auto-serviço.**
12. **Google Calendar.**
13. **Hook de pré-commit** (bloquear commit em `main`).

---

## 🎯 LIÇÕES APRENDIDAS

1. **Staging é essencial.**
2. **Protocolo:** backup → patch → `node -c` → teste local → commit staging → testar staging → merge main → teste prod.
3. **`git branch` + `git status` ANTES de commitar.**
4. **Testes: `210000000XX`.**
5. **`silenciar_bot`** é o jeito correto (não `tipo_contato`).
6. **Erros silenciosos do Supabase:** A lib não lança exceção pro catch. Sempre checar `{ data, error }`.
7. **Bugs de Timezone:** Sempre usar `{ timeZone: 'UTC' }` no frontend.
8. **PDF do Consulado:** O layout muda. Sempre extrair usando splits.
9. **Git e Vim:** Sempre usar `git merge staging -m "mensagem"`.
10. **Debounce no WhatsApp:** O Z-API manda uma requisição por mensagem. O debounce agrupa e evita spam.

---

**Bom trabalho!** 🚀