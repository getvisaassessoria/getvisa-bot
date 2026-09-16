# 📋 Handoff — Sistema GetVisa Assessoria

> Atualizado: 15/09/2026 | Resp: Moisés Barreto | Status: produção

## 1. VISÃO GERAL
Plataforma de assessoria para vistos americanos:
- Bot WhatsApp (Z-API) para triagem
- Formulário DS-160 (12 passos)
- Painel admin (clientes, agendamentos, reenvios)
- Notificações (email Resend + WhatsApp)

**Stack:** Node.js + Express, Supabase/PostgreSQL, Railway (deploy), HTML/CSS/JS vanilla

## 2. INFRAESTRUTURA
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Produção: https://app.getvisa.com.br
- Dashboard admin: /dashboard?api_key=admin123
- Railway: projeto getvisa-bot
- Supabase: projeto gcwfxkbjovqnqccrcrjx
- SSH local: ~/.ssh/id_ed25519_github

## 3. VARIÁVEIS DE AMBIENTE (Railway + .env)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, ADMIN_API_KEY (admin123), ADMIN_PHONE, EMAIL_DESTINO_EQUIPE

**Feature flag (só Railway):** BLOCK_DS160_RESUBMIT=true
- Rollback: deletar variável (30s, sem redeploy)

## 4. ARQUIVOS-CHAVE
- server.js — principal (2300+ linhas)
- public/formulario-ds160.html — formulário cliente
- public/dashboard-novo.html — painel admin
- public/painel-reenvios.html — painel de reenvios
- public/painel-clientes.html — lista clientes
- middleware/auth.js — autenticação
- routes/ds160Routes.js — CÓDIGO MORTO (duplicado de server.js)

## 5. TABELAS SUPABASE
- clientes — cadastro único por telefone (chave UNIQUE)
- form_ds160 — 1 formulário por cliente
- form_ds160_reenvios — histórico de tentativas de reenvio
- etapas_processo — funil de progresso
- agendamentos — CASV e entrevista
- clientes_finalizados, clientes_ativos

### Schema form_ds160_reenvios
- id, id_cliente, dados_formulario (JSONB), ip, user_agent
- created_at, tratado, tratado_por, tratado_em, observacao_especialista

## 6. O QUE FOI FEITO (14-15/09/2026)

### Fix getFormData (radio)
Bug: form sempre enviava "Dona de Casa". Causa: querySelectorAll retornava todos os radios. Correção: só captura `checked`.

### SSH GitHub
Chave dedicada id_ed25519_github, cadastrada em getvisaassessoria.

### Feature: Bloqueio Reenvio DS-160
- Tabela form_ds160_reenvios + flag BLOCK_DS160_RESUBMIT
- Backend: se cliente já tem form → registra, notifica, retorna requires_contact
- Fix: upsert deve rodar ANTES do check (ordem invertida estava sobrescrevendo)
- UX: telefone movido pro passo 1 + endpoint /api/check-ds160-status
- Painel admin: /painel-reenvios com diff visual (vermelho → verde)
- Endpoints: /api/admin/reenvios-pendentes, /reenvios/:id/tratar, /reenvios/count

## 7. ESTADO ATUAL
**Funcionando:** bot, formulário, bloqueio reenvio, painel admin, notificações.

**Pendências:**
1. Limpar dados de teste (telefone 21988887777) — ALTA
2. Documentar feature em docs/ — MÉDIA
3. Remover handler duplicado (server.js + routes/ds160Routes.js) — MÉDIA
4. Remover server.backup-03-09.js — BAIXA
5. Fase 3: Portal do cliente /meu-processo — ESTRATÉGICA

## 8. PRÓXIMOS PASSOS
**Curto prazo:** limpeza + documentar + resolver duplicação
**Médio prazo:** portal do cliente (etapa atual, agendamentos, histórico, botão WhatsApp)
**Longo prazo:** auto-serviço assistido + dashboard analítico

## 9. REGRAS DE NEGÓCIO (Consulado EUA)
- DS-160 NUNCA é editado após envio — sempre cria NOVO com novo AA
- Antes CASV (>3 dias úteis): permite novo DS-160, atualizar AA no AIS
- <3 dias úteis do CASV: BLOQUEADO, aguardar data passar
- Após entrevista: aguardar 48h, reagendar
- +12 meses desde DS-160: refazer obrigatório

## 10. SEGURANÇA (CRÍTICO)
1. ESTAMOS EM PRODUÇÃO — backup antes de mexer
2. Mudanças arriscadas → feature flag com rollback
3. Sempre rodar `node -c server.js` antes de commit
4. Nunca deletar dados sem confirmar que não são de cliente real
5. Push aciona deploy automático no Railway

## 11. PROMPT PARA NOVA SESSÃO
"Trabalho no sistema GetVisa Assessoria. Stack: Node.js+Express, Supabase, Railway, frontend HTML/JS vanilla. Repo: getvisaassessoria/getvisa-bot (branch main). Produção: app.getvisa.com.br. Temos feature flag BLOCK_DS160_RESUBMIT=true no Railway (rollback = deletar). Arquivo principal: server.js. Já implementamos bloqueio de reenvio DS-160 com painel admin em /painel-reenvios. Pendência: [DESCREVA]. Por favor, antes de agir: confirme contexto, peça código relevante, sugira plano."

## 12. CONTATOS
- WhatsApp Business: +55 21 97460-1812
- Email equipe: contato@getvisa.com.br
- Site: https://getvisa.com.br

**Fim do documento.**