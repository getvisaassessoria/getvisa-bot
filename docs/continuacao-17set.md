# Continuidade — Sistema GetVisa (17/09/2026)

## Contexto rápido
Sistema em produção. Bot WhatsApp + formulário DS-160 + portal cliente + painel admin.
Stack: Node.js + Express + Supabase + Railway + Z-API + Resend.
Repo: getvisaassessoria/getvisa-bot (branch main) → deploy auto no Railway.
Produção: https://app.getvisa.com.br
Local: ~/getvisa-bot-v2
Supabase projeto: gcwfxkbjovqnqccrcrjx

## O QUE FOI ENTREGUE EM 17/09

### 1. Fix URGENTE — Bug de timezone em datas
Problema: datas de input type=date apareciam 1 dia antes (06/10/1966 → 05/10/1966)
Causa: new Date('1966-10-06').toLocaleDateString() interpreta como UTC meia-noite
Fix: função formatarDataSegura() faz parse manual YYYY-MM-DD
Onde: public/formulario-ds160.html (17 ocorrências) + public/meu-processo.html
Status: commitado e em produção OK

### 2. Feature — Telefone virtual para familiares
Problema: crianças/dependentes não podiam compartilhar telefone do responsável
Fix: sufixo virtual (ex: 21975524127-01) permite múltiplos clientes no mesmo número real
Onde: server.js — funções telefoneReal(), limparTelefone(), enviarWhatsApp(), enviarPDFWhatsApp(), clientePodeReceberNotificacoes()
Comportamento: mensagens WhatsApp caem no número real (responsável)
Status: em produção OK
Caso de uso: Cintia + Nicolas (mãe + filho) — ambos cadastrados e agendados

### 3. Fix — Filtro de grupo no webhook
Problema: bot podia responder mensagens em grupos
Fix: filtros isGroup, fromMe, isStatusReply, isNewsletter, isBroadcast no webhook
Onde: server.js linha ~2616 (/api/webhook/zapi)
Status: em produção OK (visto funcionando nos logs)

### 4. Feature — Follow-up automático de leads
Objetivo: recuperar leads que travaram (não preencheram o DS-160)
Funcionamento:
  - Cron roda a cada 6h
  - Envia 3 follow-ups: #1 (24h), #2 (48h), #3 (72h)
  - Para automaticamente quando: cliente responde OU preenche DS-160
Colunas SQL: followup_1_em, followup_2_em, followup_3_em, followup_parar em clientes
Função: processarFollowupLeads() em server.js linha ~3177
Cron: server.js linha ~3285 (0 */6 * * *)
Marcação de resposta: em processarMensagem() linha ~1531
Status: testado e funcionando OK

## BUG IDENTIFICADO (PENDENTE)

### Bug — Follow-up #2 conflita com menu principal
Problema: Follow-up #2 oferece opções 1/2/3, mas o "1" é interpretado pelo bot como "Visto Americano"
Comportamento atual: lead responde "1" → bot envia submenu de Visto Americano (ERRADO)
Comportamento esperado: interpretar "1" como "Quero ajuda pra preencher"
Fix planejado (opção C):
  1. AGORA: mudar copy do follow-up #2 — usar palavras em vez de números:
     "Se quiser ajuda pra preencher, responda: AJUDA
      Se preferir preencher sozinho(a), responda: LINK"
  2. DEPOIS: adicionar coluna aguardando_resposta_followup INT em clientes + lógica contextual persistente (sobrevive a restart do Railway)

Onde está o follow-up #2: server.js — dentro de processarFollowupLeads(), buscar por "qualFollowup = 2"

## PRÓXIMOS PASSOS (por prioridade)

### Alta prioridade
1. Fix da copy do follow-up #2 (evitar conflito com menu)
2. Volume 3 do handoff (documentar o dia)

### Média prioridade
3. Coluna aguardando_resposta_followup (contexto persistente)
4. Recuperação de formulários abandonados (lead começou a preencher mas não terminou)
5. Melhorias no portal (data de conclusão na timeline)

### Baixa prioridade
6. Dashboard analítico (conversão por etapa)
7. Graceful shutdown no Railway (evitar processo morto no meio do submit)
8. Bloquear bots varredores no log (/phpinfo.php, /credentials.json)

## CLIENTES COM CASOS ESPECIAIS

### Cintia + Nicolas (familiar)
Cintia: telefone 21975524127, CPF 026.648.887-06, protocolo AA00F7YNC9
Nicolas (filho): telefone 21975524127-01 (virtual), CPF 111.111.111-11
Agendamento: CASV 19/10/2026 09:45 + Entrevista 20/10/2026 08:45
Status: ambos em agendado_casv

### Marcela de Miranda
Telefone: 21982069730
Status: apenas LEAD — nunca submeteu DS-160
Ação tomada: mensagem enviada oferecendo ajuda

## REGRAS DE NEGÓCIO CRÍTICAS
- DS-160 NUNCA é editado após envio — sempre cria novo com novo AA
- Alterações até 3 dias antes do CASV: pode refazer
- Depois do CASV: aguardar 48h e reagendar
- Após entrevista realizada: NUNCA regride etapa (patch ETAPAS_BLOQUEADAS)

## SEGURANÇA
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway (rollback = deletar)
- Sempre rodar node -c server.js antes de commit
- Push → deploy automático no Railway

## PROMPT PARA NOVO CHAT

Copia o texto abaixo e cola como 1a mensagem em chat novo:

---

Olá! Preciso continuar um trabalho no sistema GetVisa Assessoria (assessoria de vistos americanos).

CONTEXTO:
- Stack: Node.js + Express + Supabase + Railway + Z-API + Resend
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Produção: https://app.getvisa.com.br
- Local: ~/getvisa-bot-v2
- Supabase projeto: gcwfxkbjovqnqccrcrjx

O QUE JÁ FOI FEITO (17/09):
1. Fix urgente de timezone em datas (formulário + portal)
2. Feature de telefone virtual para familiares (sufixo -01)
3. Filtro de grupo no webhook
4. Feature de follow-up automático de leads (3 tentativas: 24h/48h/72h)
   - Colunas: followup_1_em, followup_2_em, followup_3_em, followup_parar
   - Função: processarFollowupLeads() em server.js
   - Cron: 0 */6 * * *

BUG PENDENTE (estávamos resolvendo):
Follow-up #2 conflita com menu principal:
- Follow-up #2 oferece opções "1/2/3"
- Bot interpreta "1" como "Visto Americano" (menu principal)
- Fix planejado (opção C):
  1. AGORA: mudar copy do follow-up #2 — usar palavras em vez de números
  2. DEPOIS: adicionar coluna aguardando_resposta_followup INT + lógica contextual

PRÓXIMOS PASSOS:
1. Corrigir copy do follow-up #2
2. Testar com lead fictício
3. Criar Volume 3 do handoff
4. Depois: coluna aguardando_resposta_followup

REGRAS IMPORTANTES:
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre rodar node -c server.js antes de commit
- Push aciona deploy automático
- Clientes com caso especial: Cintia (21975524127) + Nicolas (21975524127-01)

O QUE PRECISO AGORA:
[Cole aqui o que precisa — ex: "vamos corrigir a copy do follow-up #2"]

Antes de agir: confirme o contexto, peça o trecho relevante se precisar, sugira o plano antes de executar.
