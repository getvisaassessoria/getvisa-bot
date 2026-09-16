# 📋 Handoff — Sistema GetVisa Assessoria (Volume 2)

> Atualizado: 16/09/2026 | Resp: Moisés Barreto | Status: produção
> Volume 1: 15/09/2026 (arquitetura base + Fase 3)
> Este documento é SEQUENCIAL ao Volume 1 — leia os dois.

---

## 1. CONTEXTO — O QUE MUDOU DESDE O VOLUME 1

O Volume 1 documentou:
- Sistema em produção (bot WhatsApp + formulário DS-160 + painel admin)
- Feature de bloqueio de reenvio DS-160
- Portal do cliente /meu-processo (Fase 3 MVP)
- Infraestrutura: Node.js + Express + Supabase + Railway
- SSH GitHub configurado (id_ed25519_github)

O Volume 2 (este) documenta:
- Refinamento de copy das mensagens automáticas (9 etapas)
- Correção de bug no bot (opção 0 no submenu)
- CORREÇÃO ESTRUTURAL: tabela etapas_processo estava vazia há meses
- Sincronização automática admin ↔ portal

---

## 2. ARQUITETURA DO PROJETO (repetido para referência)

### Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco | Supabase (PostgreSQL) |
| Frontend | HTML/CSS/JS vanilla |
| Deploy | Railway (auto-deploy via git push) |
| WhatsApp | Z-API |
| Email | Resend |
| PDF | pdfkit + pdf-lib |
| Auth | Express-session + cookies (admin) + Bearer token (portal) |

### Infraestrutura

| Item | Valor |
|------|-------|
| Repositório | git@github.com:getvisaassessoria/getvisa-bot.git |
| Branch produção | main |
| URL produção | https://app.getvisa.com.br |
| Dashboard admin | /dashboard?api_key=admin123 |
| Portal cliente | /meu-processo |
| Painel reenvios | /painel-reenvios?api_key=admin123 |
| Railway | projeto getvisa-bot |
| Supabase | projeto gcwfxkbjovqnqccrcrjx |
| SSH local | ~/.ssh/id_ed25519_github |

### Variáveis de Ambiente (Railway + .env)

- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- ZAPI_INSTANCE, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
- ADMIN_API_KEY (admin123), ADMIN_PHONE
- EMAIL_DESTINO_EQUIPE
- BLOCK_DS160_RESUBMIT=true (feature flag do bloqueio de reenvio — rollback em 30s deletando a variável)

### Ferramentas Utilizadas

- VS Code — edição de código
- Terminal macOS (zsh) — comandos git, curl, node
- Git + GitHub (SSH) — versionamento
- Railway — deploy + env vars
- Supabase Dashboard — SQL Editor + Table Editor
- Chrome DevTools — debug frontend (Console + Network)
- cURL — testes de API em produção
- Comando "node -c server.js" — validação de sintaxe antes de commit

---

## 3. TABELAS SUPABASE — ESTRUTURA ATUAL

### Tabelas principais

| Tabela | Função |
|--------|--------|
| clientes | Cadastro único por telefone + cpf (coluna adicionada no Vol 1) |
| form_ds160 | Formulários DS-160 (1 por cliente) |
| form_ds160_reenvios | Histórico de tentativas de reenvio |
| portal_acessos | Sessões do portal cliente (token + validade) |
| etapas_processo | Funil de progresso (agora FUNCIONAL após fix do Vol 2) |
| agendamentos | CASV e entrevistas |
| clientes_finalizados, clientes_ativos | Arquivo morto + espelho |

### Schema etapas_processo (após fix do Vol 2)

- id (uuid, auto)
- id_cliente (uuid, FK clientes, preenchido por TRIGGER)
- id_processo (uuid, auto, FK REMOVIDA para tabela morta processos)
- cliente_id (uuid, sincronizado com id_cliente por TRIGGER)
- cliente_telefone (varchar, UNIQUE — adicionado no Vol 2)
- etapa_atual (enum etapa_processo_enum)
- data_inicio, data_atualizacao, created_at, updated_at
- historico (jsonb)
- data_* (timestamp pra cada etapa)
- dados_casv, dados_entrevista, dados_treinamento, dados_pagamento, dados_formulario (jsonb)

### Trigger criado no Vol 2

trigger_preencher_id_cliente (BEFORE INSERT OR UPDATE):
- Preenche id_cliente automaticamente a partir de cliente_telefone
- Sincroniza cliente_id com id_cliente

Isso resolveu um bug de meses: as funções criarEtapaInicial() e atualizarEtapa() falhavam silenciosamente porque não passavam id_processo nem id_cliente.

---

## 4. O QUE FOI FEITO EM 16/09/2026

### ✅ Bloco 1 — Correção de bug no bot

Bug: Quando o cliente estava num submenu (ex: Visto Americano) e digitava 0 (opção "voltar ao menu principal"), o bot respondia "não entendi sua solicitação".

Causa: processarOpcaoNoSubmenu() não tratava 0. Caía no detectarIntencao → desconhecida → fallback.

Fix: Adicionado bloco no início de processarOpcaoNoSubmenu():

    if (message === '0' || message === 'menu' || message === 'voltar') {
        state.nivel = 'principal';
        state.service = null;
        userState.set(phone, state);
        const menu = await getMenuPrincipal();
        await enviarWhatsApp(phone, menu);
        return;
    }

Testado: Simulação via curl + webhook → log "🔙 Voltando ao menu principal" ✅

### ✅ Bloco 2 — Refinamento de copy (9 etapas)

Todas as mensagens automáticas foram encurtadas (padrão 4 linhas) e reescritas com tom mais claro.

| Etapa | Antes | Depois |
|-------|-------|--------|
| lead | Vago | Acolhedor + dica do passaporte |
| formulario_solicitado | "nos avise quando terminar" | "sistema avisa automaticamente" |
| formulario_enviado | Genérico | Explica próxima etapa |
| em_analise | Duplicava com formulario_enviado | Diferencia claramente |
| abertura_processo | Longo (8 linhas) | 4 linhas, focadas no próximo passo |
| boleto_emitido | "boleto/pix foi enviado" | Ação clara (pagar) + próximo passo |
| agendado_casv | Lista longa | 4 linhas + direciona pro email |
| agendado_entrevista | Idem | Idem (simétrico ao CASV) |
| visto_aprovado | Funcional sem emoção | Caloroso + prazo 7-10 dias úteis |
| visto_recusado | Tratava como 1ª comunicação | Reforço por escrito ("conforme conversamos") |

Aplicado nas 2 funções: enviarNotificacaoStatus() (linha ~442) e enviarNotificacaoEtapa() (linha ~505).

### ✅ Bloco 3 — Correção estrutural etapas_processo

Bug: Tabela etapas_processo estava VAZIA. O portal do cliente sempre mostrava "Formulário Enviado" porque caía no fallback.

Causa raiz:
- criarEtapaInicial() não passava id_processo nem id_cliente
- Ambas as colunas eram NOT NULL
- Toda tentativa de inserção falhava silenciosamente
- Ninguém percebeu porque só o portal (recém-criado) consumia essa tabela

Fixes aplicados:

SQL 1 — Remover FK pra tabela morta:

    ALTER TABLE etapas_processo DROP CONSTRAINT IF EXISTS fk_etapas_processo_processo;
    ALTER TABLE etapas_processo ALTER COLUMN id_processo SET DEFAULT gen_random_uuid();

(tabela processos estava vazia — arquitetura nunca implementada)

SQL 2 — Trigger + UNIQUE:

    CREATE OR REPLACE FUNCTION preencher_id_cliente() ...
    CREATE TRIGGER trigger_preencher_id_cliente ...
    ALTER TABLE etapas_processo ADD CONSTRAINT etapas_processo_cliente_telefone_key UNIQUE (cliente_telefone);

SQL 3 — Migração dos clientes existentes:

Populou etapas_processo a partir de clientes.status, mapeando cada status à etapa equivalente.

Resultado: Eliza (21985234917) agora tem etapa_atual = 'analise_correcoes'. Portal mostra correto. ✅

### ✅ Bloco 4 — Sincronização automática admin ↔ portal

Patch 1 — atualizarStatusCliente() (linha ~418): agora sincroniza clientes.status e etapas_processo.etapa_atual na mesma operação, via mapa mapaStatusParaEtapa.

Patch 2 — /api/portal/meu-processo (linha ~2070): leitura robusta combinando as 2 fontes — pega a etapa MAIS AVANÇADA entre etapas_processo.etapa_atual e clientes.status. Garante que o portal funcione mesmo se só uma das tabelas foi atualizada.

---

## 5. ESTADO ATUAL DO SISTEMA

### ✅ Funcionando em produção

- Bot WhatsApp (triagem 1/2/3 + menus + intenções + opção 0)
- Formulário DS-160 (12 passos) + bloqueio de reenvio + verificação no passo 1
- Painel admin (clientes, agendamentos, reenvios com diff visual)
- Portal do cliente /meu-processo (login seguro + timeline correta)
- Notificações automáticas (email + WhatsApp) com link do portal
- Sincronização automática admin ↔ portal

### ⚠️ Pendências conhecidas

| # | Item | Prioridade |
|---|------|-----------|
| 1 | Teste de sincronização em produção (mudar status da Eliza no admin → verificar portal) | Alta |
| 2 | Refatorar criarEtapaInicial e atualizarEtapa (agora que o trigger resolve) | Média |
| 3 | Adicionar data_conclusao visível na timeline do portal | Média |
| 4 | Refinar copy: boleto_pago, treinamento_agendado, treinamento_realizado, entrevista_realizada, passaporte_retornado | Média |
| 5 | Fase 4 — Auto-serviço assistido | Estratégica |

---

## 6. PRÓXIMOS PASSOS RECOMENDADOS

### Curto prazo (esta semana)

1. Testar sincronização — mudar status da Eliza no painel → verificar portal atualiza
2. Refinar 5 mensagens restantes (padrão 4 linhas + tom claro)
3. Documentar mudanças no portal

### Médio prazo (2-3 semanas)

4. Fase 4 — Auto-serviço assistido (cliente pede alteração → fila → aprovação)
5. Melhorias no portal: data de conclusão de etapas, histórico de eventos (jsonb), botão WhatsApp mais destacado

### Longo prazo (2-3 meses)

6. Dashboard analítico (conversão por etapa, tempo médio)
7. Integração com Google Calendar
8. Multi-idioma (espanhol, inglês)

---

## 7. REGRAS DE NEGÓCIO (Consulado EUA)

| Estágio | Pode alterar DS-160? | Ação |
|---------|---------------------|------|
| Antes de submeter CEAC | Sim | Editar direto |
| Submetido, >3 dias úteis do CASV | Sim — Novo DS-160 | Atualizar AA no AIS |
| <3 dias úteis do CASV | Não — Bloqueado | Aguardar data passar |
| Após CASV/entrevista | Aguardar 48h | Novo DS-160 + reagendar |
| Após visto emitido | Encerrado | Novo processo |
| +12 meses desde o DS-160 | Refazer obrigatório | Novo formulário |

Regra crítica: o DS-160 NUNCA é editado após envio. Sempre cria um novo com novo AA number.

---

## 8. SEGURANÇA

- ESTAMOS EM PRODUÇÃO — backup antes de mexer
- Mudanças arriscadas → feature flag com rollback
- Sempre rodar "node -c server.js" antes de commit
- Nunca deletar dados sem confirmar que não são de cliente real
- Push aciona deploy automático no Railway
- Portal cliente: token 24h + rate limit 10 tentativas/15min + log de IP
- Admin: session + cookie + API key na URL

---

## 9. COMMITS DA SESSÃO 16/09/2026

    68ed97c fix: sincroniza etapas_processo com clientes.status
    524dbbe chore: refina copy da etapa visto_recusado
    5678192 chore: refina copy da etapa visto_aprovado
    7a7714d chore: refina copy da etapa agendado_entrevista
    36a36b1 chore: refina copy da etapa agendado_casv
    (outros commits de copy: boleto_emitido, abertura_processo, formulario_*)
    (fix: opção 0 no submenu)

### SQLs executados (permanentes no Supabase)

1. ALTER TABLE etapas_processo DROP CONSTRAINT fk_etapas_processo_processo
2. ALTER TABLE etapas_processo ALTER COLUMN id_processo SET DEFAULT gen_random_uuid()
3. CREATE FUNCTION preencher_id_cliente() + CREATE TRIGGER trigger_preencher_id_cliente
4. ALTER TABLE etapas_processo ADD CONSTRAINT etapas_processo_cliente_telefone_key UNIQUE (cliente_telefone)
5. Migração: INSERT de clientes em etapas_processo via SELECT + CASE

---

## 10. PROMPT PARA NOVA SESSÃO / OUTRO PROFISSIONAL

    # CONTEXTO DO PROJETO — GetVisa Assessoria (v2)

    Trabalho no sistema da GetVisa Assessoria (assessoria de vistos americanos).
    Preciso de ajuda com manutenção/evolução.

    ## STACK
    - Node.js + Express (backend)
    - Supabase/PostgreSQL (banco)
    - Railway (deploy automático via git push)
    - HTML/CSS/JS vanilla (frontend)
    - Z-API (WhatsApp), Resend (email)
    - Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
    - Produção: https://app.getvisa.com.br

    ## INFRAESTRUTURA
    - Local: macOS + VS Code + ~/.ssh/id_ed25519_github
    - Supabase: projeto gcwfxkbjovqnqccrcrjx
    - Railway: projeto getvisa-bot
    - Feature flag: BLOCK_DS160_RESUBMIT=true (Railway Variables)

    ## ARQUIVOS-CHAVE
    - server.js (principal, 2400+ linhas)
    - public/formulario-ds160.html
    - public/dashboard-novo.html
    - public/painel-reenvios.html
    - public/meu-processo.html (PORTAL DO CLIENTE)
    - middleware/auth.js

    ## TABELAS SUPABASE
    clientes, form_ds160, form_ds160_reenvios, portal_acessos,
    etapas_processo (agora FUNCIONAL), agendamentos

    ## O QUE JÁ FOI FEITO (Vol 1 + Vol 2)
    Vol 1 (15/09): bloqueio reenvio DS-160, painel admin de reenvios,
    portal cliente /meu-processo, divulgação do portal pelo bot
    Vol 2 (16/09): fix opção 0 no submenu, copy refinada em 9 etapas,
    FIX ESTRUTURAL etapas_processo (FK removida + trigger + migração),
    sincronização automática admin ↔ portal

    ## PENDÊNCIAS
    - Testar sincronização em produção
    - Refinar copy de 5 etapas restantes
    - Fase 4: auto-serviço assistido

    ## REGRAS DE SEGURANÇA (CRÍTICO)
    1. ESTAMOS EM PRODUÇÃO — backup antes de mexer
    2. Mudanças arriscadas → feature flag com rollback
    3. node -c server.js antes de commit
    4. Não deletar dados sem confirmar que não são reais
    5. Push → Railway faz deploy automático

    ## O QUE PRECISO AGORA
    [DESCREVA A NECESSIDADE]

    Antes de agir: confirme contexto, peça arquivo relevante, sugira plano.

---

## 11. CHECKLIST DE HANDOFF

- [ ] Acesso ao GitHub (colaborador do repo)
- [ ] Acesso ao Railway (variáveis de ambiente)
- [ ] Acesso ao Supabase (projeto gcwfxkbjovqnqccrcrjx)
- [ ] Chave SSH configurada (id_ed25519_github)
- [ ] .env completo em mãos (nunca commitar)
- [ ] Volume 1 lido e compreendido
- [ ] Este Volume 2 lido e compreendido
- [ ] Backup do banco antes de mexer em produção

---

## 12. CONTATOS

| Recurso | Onde |
|---------|------|
| WhatsApp Business | +55 21 97460-1812 |
| Email da equipe | contato@getvisa.com.br |
| Site | https://getvisa.com.br |
| Painel admin | https://app.getvisa.com.br/dashboard?api_key=admin123 |

---

Fim do documento Volume 2.
Próximo volume: incluir Fase 4 (auto-serviço) + melhorias no portal.