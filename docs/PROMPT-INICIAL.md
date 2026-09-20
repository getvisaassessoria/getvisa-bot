# 🚀 PROMPT INICIAL — GetVisa Assessoria

> Documento mestre. Cola este arquivo inteiro (ou anexa) ao começar novo chat.
> Última atualização: 20/09/2026

---

## 🎯 CONTEXTO GERAL

Sistema de assessoria para vistos americanos. Em produção desde 14/09/2026.

**Stack:**
- Backend: Node.js + Express
- Banco: Supabase (PostgreSQL)
- Deploy: Railway (auto-deploy via git push)
- WhatsApp: Z-API (instância 3F1D4E0F2AD0539F0C52B20DE66F3711)
- Email: Resend
- Frontend: HTML/CSS/JS vanilla (sem framework)

**Acessos:**
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Produção: https://app.getvisa.com.br
- Local: ~/getvisa-bot-v2
- Supabase: gcwfxkbjovqnqccrcrjx
- Railway: projeto getvisa-bot
- Dashboard admin: /dashboard?api_key=admin123

**Números importantes:**
- WhatsApp Business (bot): 21974601812
- WhatsApp equipe/admin: 5521974601812

---

## ✅ FEATURES ATIVAS EM PRODUÇÃO

1. **Bot WhatsApp** (Z-API)
   - Triagem inicial (1 cliente / 2 lead / 3 outros)
   - Menus por serviço (Visto Americano, Canadense, etc)
   - Filtros: ignora grupo, fromMe, status, newsletter, broadcast
   - Follow-up automático de leads (3 tentativas: 24h, 48h, 72h)
   - Despedida educada pra "contato pessoal" (opção 3)

2. **Formulário DS-160** (12 passos)
   - URL: /formulario-ds160
   - Bloqueio de reenvio (flag BLOCK_DS160_RESUBMIT=true)
   - Verificação no passo 1 (endpoint /api/check-ds160-status)
   - Telefone virtual pra família (sufixo -01)

3. **Portal do Cliente** (/meu-processo)
   - Login: telefone + 4 últimos dígitos CPF
   - Timeline de 10 etapas do processo
   - Agendamentos (CASV + Entrevista)
   - Botão WhatsApp pra especialista
   - Correção pontual de campo (Fase 3)

4. **Painel Admin**
   - /dashboard — visão geral
   - /painel — lista de clientes
   - /painel-reenvios — tentativas de reenvio com análise automática
   - /painel-solicitacoes — solicitações de alteração (Fase 3)

5. **Watchdog** (monitor de saúde)
   - Roda a cada 30 min (health Supabase + status Z-API)
   - Alerta WhatsApp após 3 falhas consecutivas
   - Registra em tabela watchdog_logs

---

## 🗄️ TABELAS SUPABASE

- `clientes` — cadastro (telefone único, cpf)
- `form_ds160` — 1 form por cliente
- `form_ds160_reenvios` — tentativas de reenvio (histórico)
- `portal_acessos` — sessões do portal cliente
- `etapas_processo` — funil de progresso (10 etapas)
- `agendamentos` — CASV + entrevistas
- `solicitacoes_alteracao_campo` — Fase 3
- `watchdog_logs` — registros do monitor de saúde

---

## 📋 REGRAS DE NEGÓCIO CRÍTICAS

### Alteração de DS-160 após envio
- **Janela segura:** 5+ dias antes do CASV → pode refazer
- **Bloqueio:** <5 dias antes → não há tempo hábil
- **Após CASV:** aguardar 48h + reagendar
- **Após entrevista:** NUNCA regride etapa
- **Alerta 6 meses** do DS-160 (aproximação dos 12 meses)

### Complexidade de alteração
- 🔴 **Alerta vermelho:** consulado, nome, DOB, passaporte
- 🟡 **Alerta amarelo:** SSN, Tax ID, propósito de viagem
- ⚪ **Normal:** endereço, telefone, renda, etc

### Feature flag importante
- `BLOCK_DS160_RESUBMIT=true` (Railway) — controle do bloqueio de reenvio
- **Rollback:** deletar a variável (30s, sem redeploy)

---

## 🚨 REGRAS DE SEGURANÇA

1. **ESTAMOS EM PRODUÇÃO** — sempre backup antes
2. Mudanças arriscadas → usar feature flag com rollback
3. Sempre rodar `node -c server.js` antes de commit
4. Nunca deletar dados sem confirmar que não são de cliente real
5. Push aciona deploy automático no Railway
6. Para testes: **criar cliente fictício**, nunca usar real

---

## 📌 PENDÊNCIAS PRIORIZADAS

### 🔴 Alta prioridade
1. **Graceful shutdown no Railway** — evita processo morto no meio do submit (causou problema real em 18/09)
2. **Recuperação de formulários abandonados** — lead começa a preencher mas não termina

### 🟡 Média prioridade
3. Melhorias no portal (data conclusão na timeline)
4. Dashboard analítico (conversão por etapa, tempo médio)
5. Card no dashboard admin (contador de solicitações pendentes)

### 🟢 Baixa prioridade
6. Fase 4 — Auto-serviço completo (upload assistido)
7. Integração Google Calendar
8. Bloquear bots varredores nos logs (phpinfo, credentials.json, etc)

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

---

## 📚 DOCUMENTAÇÃO DETALHADA (se precisar)

Se precisar de mais contexto sobre um tema específico, **peça pra colar o doc correspondente**:

- `docs/handoff-vol1-arquitetura.md` — arquitetura base, Fase 3 original
- `docs/handoff-vol2-fixes-16set.md` — fix etapas_processo, copy refinada
- `docs/continuacao-17set.md` — follow-up automático, fix timezone
- `docs/continuacao-19set.md` — Z-API chip trocado, Watchdog (pendência)
- `docs/continuacao-20set.md` — Watchdog completo, Fases 2 e 3

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
Anexei o arquivo PROMPT-INICIAL.md com o contexto. Se precisar de detalhe técnico, me peça pra colar um dos docs específicos (handoff-vol1, handoff-vol2, continuacao-17set, continuacao-19set, continuacao-20set).

**FEATURES ATIVAS:**
1. Bot WhatsApp (triagem + menus + filtros)
2. Formulário DS-160 (12 passos) + bloqueio reenvio
3. Portal cliente /meu-processo (login + timeline + correção de campo)
4. Painel admin (clientes, reenvios, solicitações de alteração)
5. Follow-up automático de leads (3 tentativas)
6. Telefone virtual (familiares)
7. Watchdog (monitor Z-API + Supabase)

**REGRAS CRÍTICAS:**
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre rodar `node -c server.js` antes de commit
- Push aciona deploy automático no Railway
- Testes SEMPRE com cliente fictício, nunca com real

**PENDÊNCIAS PRIORITÁRIAS:**
1. Graceful shutdown Railway
2. Recuperação de formulários abandonados
3. Melhorias no portal
4. Dashboard analítico

**O QUE PRECISO AGORA:**
[Cole aqui o que você precisa — ex: "vamos implementar o graceful shutdown"]

**IMPORTANTE — Antes de agir:**
1. Confirme que entendeu o contexto
2. Se faltar informação técnica, me peça pra colar o doc específico (handoff-vol1, handoff-vol2, continuacao-17set, continuacao-19set, continuacao-20set)
3. Sugira um plano antes de executar qualquer mudança
4. **Nunca invente** informação que não esteja nos docs. Se não souber, pergunte.

---

---

## 💡 DICA DE USO

**Opção A — Anexar arquivo:**
Na interface do chat, clica no 📎 e anexa este arquivo .md

**Opção B — Colar texto:**
Copia a seção "PROMPT PRONTO PRA COLAR NO CHAT" e cola no chat

**Opção C — Referenciar via GitHub:**
Se preferir, cola o link direto do arquivo no GitHub:
https://github.com/getvisaassessoria/getvisa-bot/blob/main/docs/PROMPT-INICIAL.md

---

**Fim do documento mestre.**
