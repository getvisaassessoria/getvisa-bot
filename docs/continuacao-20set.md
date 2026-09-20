# Continuidade — Sistema GetVisa (20/09/2026)

> Volume 4. Sequencial ao continuacao-19set.md

## Contexto
Sistema em produção. Bot WhatsApp + formulário DS-160 + portal cliente + painel admin.
Stack: Node.js + Express + Supabase + Railway + Z-API + Resend.

## O QUE FOI ENTREGUE EM 20/09

### 1. Fix critico — Rota /baixar-pdf usava variavel errada
- Bug: `acesso.id_cliente` copiado de endpoint errado
- Erro: "acesso is not defined" ao gerar PDF
- Fix: troca pra `cliente.id`
- Impacto: PDF com apendice nao gerava

### 2. Ajuste no apendice do PDF
- Remove bloco "Importante" (podia confundir cliente)
- Datas do apendice agora em BR (DD/MM/YYYY) via formatarDataBR

### 3. Watchdog — Monitor de saude do sistema
**Objetivo:** detectar bot parado em ate 1h30 (3 ciclos) em vez de descobrir por cliente reclamando.

**Componentes:**
- Tabela `watchdog_logs` (Supabase)
- Funcao `watchdogHealth` — verifica Supabase a cada 30 min
- Funcao `watchdogZapi` — verifica status Z-API a cada 30 min
- Cron `*/30 * * * *` — roda checks leves
- Alerta WhatsApp no numero `WATCHDOG_PHONE` apos 3 falhas consecutivas
- Env var necessaria: `WATCHDOG_PHONE` no Railway

**O que foi tentado e removido:**
- Ping completo (envia msg real espera retorno) — nao funciona porque Z-API nao notifica mensagens `fromMe: true` (evita loop)
- Cron das 9h + rota `/api/admin/test-watchdog-ping` + deteccao no webhook
- Removido apos teste em 20/09

**Fix importante:**
- Endpoint `/status` da Z-API exige header `Client-Token`
- Sem ele retorna 400
- Fix aplicado em `watchdogZapi`

**Validacao:**
- health | ok | {} | 22:30:01
- zapi | ok | {"connected": true} | 22:30:00

### 4. Resumo do que ja estava entregue (19/09)

**Fase 2 — Analise automatica de reenvio:**
- Helper `calcularAcaoReenvio()` calcula acao recomendada
- Regras: 5 dias minimo antes CASV, alerta 6 meses expiracao DS-160
- Retorna: PERMITIR / BLOQUEAR / AGUARDAR_48H / REAGENDAR / ENCERRADO
- Card colorido no painel `/painel-reenvios`

**Fase 3 — Auto-servico assistido:**
- Cliente pode corrigir campo especifico pelo portal
- 54 campos editaveis em 8 categorias (Dados Pessoais, Endereco, Passaporte, Trabalho, Viagem, Contato EUA, Familia, Consulado)
- Tabela `solicitacoes_alteracao_campo`
- Painel `/painel-solicitacoes` para aprovar/rejeitar
- Ao aprovar: aplica mudanca no form + gera apendice no PDF + notifica cliente
- Detecta complexidade (consulado, nome, dob, passaporte, documento, viagem)
- Historico visivel no portal do cliente

## BUGS ENCONTRADOS E CORRIGIDOS

1. `acesso.id_cliente` em rota publica (copiado do escopo errado)
2. Emoji 📌 no gerador de PDF (PDFKit nao suporta) — removido
3. Truncamento de arrays quando campo era string vs array — helper `pegarValor`
4. Datas ISO no PDF (formulario mostrava ISO em vez de BR) — `formatarDataBR`
5. Z-API `/status` exige `Client-Token` — fix no watchdog
6. Watchdog ping completo nao funciona (fromMe nao notifica) — removido

## PENDENCIAS

### Alta prioridade
1. Graceful shutdown no Railway (evita processo morto no meio do submit — causou problema da Marcela em 18/09)
2. Recuperacao de formularios abandonados (lead comeca a preencher mas nao termina)

### Media prioridade
3. Melhorias no portal: data de conclusao na timeline
4. Dashboard analitico (conversao por etapa, tempo medio)
5. Card no dashboard principal: contador de solicitacoes de alteracao pendentes

### Baixa prioridade
6. Fase 4: auto-servico completo (upload assistido)
7. Integracao Google Calendar
8. Bloquear bots varredores nos logs

## REGRAS DE NEGOCIO (atualizadas)

### Alteracao de DS-160 apos envio
- Janela de 5 dias uteis antes do CASV: pode refazer
- Antes disso: bloqueio automatico (sugere reagendamento)
- Apos entrevista realizada: NUNCA regride etapa
- Apos 12 meses do DS-160: refazer obrigatorio
- Alerta a partir de 6 meses do DS-160

### Complexidade de alteracao
- Consulado / Nome / DOB / Passaporte: alerta vermelho (avaliar antes)
- SSN / Tax ID: alerta amarelo
- Proposito de viagem: alerta (pode impactar tipo de visto)

## SEGURANCA
- ESTAMOS EM PRODUCAO — sempre backup antes
- Feature flag `BLOCK_DS160_RESUBMIT=true` no Railway (rollback = deletar)
- Watchdog monitora Z-API + Supabase (alerta em ate 1h30)
- Sempre rodar `node -c server.js` antes de commit
- Push aciona deploy automatico

## COMMITS DA SESSAO 20/09

- Fix /baixar-pdf: cliente.id em vez de acesso.id_cliente
- Chore: remove bloco "Importante" do apendice + datas em BR
- Feat: watchdog (monitor de saude Z-API + Supabase)
- Fix: watchdog Z-API exige header Client-Token
- Chore: simplifica watchdog (remove ping completo)
- Chore: limpa remanescente do ping completo no webhook

## ESTADO ATUAL DO SISTEMA

**Funcionando:**
- Bot WhatsApp (triagem + menus + opcao 0 + filtros de grupo)
- Formulario DS-160 (12 passos) + bloqueio reenvio
- Portal do cliente /meu-processo (login + timeline + correcao de campo)
- Painel admin /painel (clientes) + /painel-reenvios + /painel-solicitacoes
- Follow-up automatico de leads (3 tentativas: 24h, 48h, 72h)
- Telefone virtual (familia/dependentes)
- Watchdog (health + zapi a cada 30 min)
- Notificacoes email + WhatsApp

**Tabelas Supabase:**
- clientes, form_ds160, form_ds160_reenvios, portal_acessos
- etapas_processo, agendamentos, solicitacoes_alteracao_campo, watchdog_logs

## PROMPT PARA NOVO CHAT

Copia e cola como 1a mensagem:

---

Ola! Preciso continuar um trabalho no sistema GetVisa Assessoria.

CONTEXTO:
- Stack: Node.js + Express + Supabase + Railway + Z-API + Resend
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Producao: https://app.getvisa.com.br
- Local: ~/getvisa-bot-v2
- Supabase projeto: gcwfxkbjovqnqccrcrjx

DOCUMENTACAO ANTERIOR:
- docs/handoff-vol1-arquitetura.md
- docs/handoff-vol2-fixes-16set.md
- docs/continuacao-17set.md
- docs/continuacao-19set.md
- docs/continuacao-20set.md (este)

FEATURES ATIVAS:
1. Bot WhatsApp com triagem + menus + filtros grupo/fromMe
2. Formulario DS-160 (12 passos) + bloqueio reenvio
3. Portal do cliente /meu-processo (login telefone + 4 digitos CPF)
4. Painel admin (clientes, reenvios com analise automatica, solicitacoes de alteracao)
5. Follow-up automatico de leads (3 tentativas)
6. Telefone virtual para familiares (sufixo -01)
7. Watchdog (health + Z-API status a cada 30 min)
8. Fase 3: auto-servico assistido (corrigir 1 campo especifico do DS-160)

PENDENCIAS PRIORITARIAS:
1. Graceful shutdown Railway (evita processo morto no submit)
2. Recuperacao de formularios abandonados
3. Melhorias no portal (data conclusao timeline)
4. Dashboard analitico

REGRAS DE SEGURANCA:
- ESTAMOS EM PRODUCAO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre rodar node -c server.js antes de commit
- Push aciona deploy automatico

O QUE PRECISO AGORA:
[Cole aqui o que precisa]

Antes de agir: confirme contexto, peca trecho relevante, sugira plano antes de executar.
