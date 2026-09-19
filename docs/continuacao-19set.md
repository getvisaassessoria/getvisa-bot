# Continuidade — Sistema GetVisa (19/09/2026)

> Volume 3. Sequencial ao continuacao-17set.md

## Contexto
Sistema em produção. Bot WhatsApp + formulário DS-160 + portal cliente + painel admin.
Stack: Node.js + Express + Supabase + Railway + Z-API + Resend.

## PROBLEMA RESOLVIDO HOJE

### Bot parou de responder (Z-API "quebrada")

**Sintomas:**
- Bot não respondia clientes
- Railway: servidor online, /health retornava 200
- Log: webhook recebia teste interno mas NÃO recebia mensagens reais
- Painel Z-API: status verde "Conectado", assinatura PAGA

**Causa:**
- Trocamos o chip de telefone do WhatsApp Business
- Z-API mantém sessão vinculada ao dispositivo
- Trocou chip → sessão invalidou → instância fica "zumbi"
- (status verde mas sem sessão real ativa)

**Solução:**
- Reconectar via QR Code no painel Z-API
- WhatsApp do celular → Dispositivos Conectados → Conectar Dispositivo
- Escanear QR Code

**Lição aprendida:**
- NUNCA trocar chip sem avisar Z-API
- Ao trocar chip: pausar bot, reconectar, validar número, retomar
- Verificação periódica do painel Z-API (semanal) é essencial

## PENDÊNCIA NOVA (roadmap)

### Watchdog do bot (sugestão)
Implementar monitor de saúde que rode a cada 30min:
1. Enviar mensagem controle para número da equipe
2. Verificar se último webhook real foi há mais de 2h (horário comercial)
3. Alertar via WhatsApp/Email se detectar falha
4. Registrar em tabela health_checks

**Prioridade:** Média
**Esforço:** ~1h
**Impacto:** Detectar falhas em 30min em vez de dias

## HISTÓRICO DE FALHAS Z-API (para referência)
- 17/09: Assinatura expirou (não pagamos) → bot parou
- 19/09: Chip trocado sem avisar → sessão invalidou → bot parou
- Padrão: Z-API é ponto frágil. Watchdog resolve.

## PENDÊNCIAS ANTERIORES (do continuacao-17set.md)
1. Fix do follow-up #2 — RESOLVIDO
2. Volume 3 handoff — ESTE ARQUIVO
3. Coluna aguardando_resposta_followup — pendente
4. Recuperação de formulários abandonados — pendente
5. Dashboard analítico — pendente

## PRÓXIMOS PASSOS SUGERIDOS
1. Watchdog (nova)
2. Coluna aguardando_resposta_followup
3. Recuperar leads perdidos dos últimos dias (WhatsApp Business)
4. Melhorias no portal (data conclusão na timeline)

## PROMPT PARA NOVO CHAT

Copia e cola como 1a mensagem:

---

Olá! Preciso continuar um trabalho no sistema GetVisa Assessoria.

CONTEXTO:
- Stack: Node.js + Express + Supabase + Railway + Z-API + Resend
- Repo: git@github.com:getvisaassessoria/getvisa-bot.git (branch main)
- Produção: https://app.getvisa.com.br
- Local: ~/getvisa-bot-v2
- Supabase projeto: gcwfxkbjovqnqccrcrjx

DOCUMENTAÇÃO ANTERIOR:
- docs/handoff-vol1-arquitetura.md (arquitetura base)
- docs/handoff-vol2-fixes-16set.md (fase 3 + ajustes)
- docs/continuacao-17set.md (follow-up + timezone)
- docs/continuacao-19set.md (este arquivo)

FEATURES ATIVAS:
1. Bot WhatsApp com triagem + menus + follow-up automático (3 tentativas)
2. Formulário DS-160 (12 passos) + bloqueio de reenvio + verificação no passo 1
3. Portal do cliente /meu-processo (login telefone + 4 dígitos CPF)
4. Painel admin /painel-reenvios com diff visual
5. Telefone virtual para familiares (sufixo -01)
6. Filtro de grupo/fromMe no webhook

REGRAS IMPORTANTES:
- ESTAMOS EM PRODUÇÃO — sempre backup antes
- Feature flag BLOCK_DS160_RESUBMIT=true no Railway
- Sempre rodar node -c server.js antes de commit
- Push aciona deploy automático
- Z-API é ponto frágil (ver continuacao-19set.md)

PENDÊNCIAS:
1. Watchdog (monitor de saúde Z-API)
2. Coluna aguardando_resposta_followup
3. Recuperar leads perdidos
4. Melhorias no portal

O QUE PRECISO AGORA:
[Cole aqui o que precisa]

Antes de agir: confirme contexto, peça trecho relevante, sugira plano antes de executar.
