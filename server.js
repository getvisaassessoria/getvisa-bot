const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');

const app = express();

const resend = new Resend(
  process.env.RESEND_API_KEY || ''
);

const PORT = process.env.PORT || 10000;

// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================

let supabaseUrl = process.env.SUPABASE_URL || '';

supabaseUrl = supabaseUrl
  .replace(/\/rest\/v1.*$/, '')
  .replace(/\/+$/, '');

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias'
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

console.log('✅ URL do Supabase:', supabaseUrl);
console.log(
  '✅ Cliente Supabase inicializado com SERVICE_ROLE_KEY'
);

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(cors());

app.use(
  express.json({
    limit: '50mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '50mb'
  })
);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

// ============================================================
// WEBHOOK Z-API
// ============================================================

app.post(
  '/api/webhook/zapi',
  (req, res) => {
    console.log('*** WEBHOOK Z-API RECEBIDO ***');

    const body = req.body || {};

    console.log(
      '📨 Body:',
      JSON.stringify(body, null, 2)
    );

    /*
     * Responde imediatamente à Z-API.
     * O processamento continua em segundo plano.
     */
    res.status(200).send('OK');

    (async () => {
      try {
        // ========================================================
        // 1. IGNORAR EVENTOS INVÁLIDOS
        // ========================================================

        if (
          body.isGroup === true ||
          body.isGroupMsg === true ||
          String(body.chatId || '').includes('@g.us') ||
          String(body.participantPhone || '').includes('@g.us')
        ) {
          console.log('👥 Evento de grupo ignorado');
          return;
        }

        if (body.isStatusReply === true) {
          console.log('📊 Evento de status ignorado');
          return;
        }

        if (body.waitingMessage === true) {
          console.log('⏳ Evento waitingMessage ignorado');
          return;
        }

        if (body.fromMe === true) {
          console.log(
            '🤖 Mensagem enviada pelo próprio número ignorada'
          );
          return;
        }

        if (body.fromApi === true) {
          console.log(
            '🤖 Evento originado pela API ignorado'
          );
          return;
        }

        /*
         * Quando o tipo vier informado, aceitar somente mensagens
         * recebidas. Eventos sem "type" continuam sendo processados.
         */
        if (
          body.type &&
          body.type !== 'ReceivedCallback'
        ) {
          console.log(
            '⏭️ Evento ignorado por tipo:',
            body.type
          );
          return;
        }

        // ========================================================
        // 2. EXTRAIR E NORMALIZAR O TELEFONE
        // ========================================================

        const telefoneBruto = String(
          body.phone ||
          body.from ||
          body.sender ||
          body.wa_id ||
          body.chatId ||
          ''
        ).trim();

        const telefoneNumeros =
          telefoneBruto.replace(/\D/g, '');

        if (!telefoneNumeros) {
          console.log(
            '⏭️ Evento ignorado: telefone ausente'
          );
          return;
        }

        /*
         * A Z-API recebe o telefone com o código do Brasil.
         * O Supabase grava o telefone sem o código 55.
         */
        let telefoneParaZapi = telefoneNumeros;

        if (!telefoneParaZapi.startsWith('55')) {
          telefoneParaZapi = '55' + telefoneParaZapi;
        }

        const telefoneParaSupabase =
          telefoneParaZapi.startsWith('55')
            ? telefoneParaZapi.substring(2)
            : telefoneParaZapi;

        if (telefoneParaSupabase.length < 10) {
          console.log(
            '⏭️ Evento ignorado: telefone inválido:',
            telefoneParaSupabase
          );
          return;
        }

        // ========================================================
        // 3. EXTRAIR A MENSAGEM
        // ========================================================

        let mensagemRecebida = '';

        if (typeof body.text === 'string') {
          mensagemRecebida = body.text;
        } else if (
          body.text &&
          typeof body.text === 'object'
        ) {
          mensagemRecebida =
            body.text.message ||
            body.text.body ||
            body.text.text ||
            '';
        }

        if (
          !mensagemRecebida &&
          typeof body.message === 'string'
        ) {
          mensagemRecebida = body.message;
        }

        if (
          !mensagemRecebida &&
          body.message &&
          typeof body.message === 'object'
        ) {
          mensagemRecebida =
            body.message.text ||
            body.message.body ||
            body.message.conversation ||
            body.message.content ||
            '';
        }

        if (!mensagemRecebida) {
          mensagemRecebida =
            body.content ||
            body.body ||
            body.conversation ||
            '';
        }

        mensagemRecebida = String(
          mensagemRecebida || ''
        ).trim();

        console.log(
          '📝 Mensagem bruta:',
          JSON.stringify(mensagemRecebida)
        );

        console.log(
          '📱 Telefone bruto:',
          JSON.stringify(telefoneBruto)
        );

        console.log(
          '📱 Telefone para Z-API:',
          telefoneParaZapi
        );

        console.log(
          '📱 Telefone para Supabase:',
          telefoneParaSupabase
        );

        console.log(
          '💬 Mensagem:',
          JSON.stringify(mensagemRecebida)
        );

        /*
         * Eventos sem texto não criam ou atualizam registros.
         */
        if (!mensagemRecebida) {
          console.log(
            '⏭️ Evento ignorado: mensagem vazia ou sem texto'
          );
          return;
        }

        // ========================================================
        // 4. IDENTIFICAR O NOME
        // ========================================================

        const nomeRecebido = String(
          body.senderName ||
          body.chatName ||
          ''
        ).trim();

        const nomeValido =
          nomeRecebido &&
          nomeRecebido.toLowerCase() !== 'cliente' &&
          nomeRecebido.toLowerCase() !== 'cliente whatsapp';

        const nomeParaSalvar = nomeValido
          ? nomeRecebido.substring(0, 100)
          : null;

        console.log(
          '👤 Nome recebido:',
          nomeParaSalvar || '(não informado)'
        );

        console.log(
          '🔍 ===== INICIANDO VERIFICAÇÃO ====='
        );

        console.log(
          '📱 Telefone:',
          telefoneParaSupabase
        );

        const agora = new Date().toISOString();

        // ========================================================
        // 5. BUSCAR CLIENTE EXISTENTE
        // ========================================================

        const {
          data: existente,
          error: selectError
        } = await supabase
          .from('clientes_novos')
          .select(
            'id, telefone, nome, email, status, onboarding_completo'
          )
          .eq('telefone', telefoneParaSupabase)
          .maybeSingle();

        if (selectError) {
          console.error(
            '❌ Erro ao consultar cliente:',
            selectError
          );
          return;
        }

        // ========================================================
        // 6. ATUALIZAR OU CRIAR CLIENTE
        // ========================================================

        if (existente) {
          console.log(
            '✅ Cliente já existe. Atualizando...'
          );

          const dadosAtualizacao = {
            data_contato: agora,
            status: existente.status || 'novo'
          };

          /*
           * Não substitui nome já salvo.
           */
          if (
            !existente.nome &&
            nomeParaSalvar
          ) {
            dadosAtualizacao.nome = nomeParaSalvar;
          }

          const {
            error: updateError
          } = await supabase
            .from('clientes_novos')
            .update(dadosAtualizacao)
            .eq('id', existente.id);

          if (updateError) {
            console.error(
              '❌ Erro ao atualizar cliente:',
              updateError
            );
            return;
          }

          console.log(
            '✅ Cliente atualizado com sucesso'
          );
        } else {
          console.log(
            '🆕 Nenhum cliente encontrado. Criando novo cliente...'
          );

          const dadosNovoCliente = {
            telefone: telefoneParaSupabase,
            data_contato: agora,
            status: 'novo',
            onboarding_completo: false
          };

          if (nomeParaSalvar) {
            dadosNovoCliente.nome = nomeParaSalvar;
          }

          const {
            error: insertError
          } = await supabase
            .from('clientes_novos')
            .insert(dadosNovoCliente);

          if (insertError) {
            /*
             * Outra requisição pode ter criado o mesmo telefone
             * simultaneamente.
             */
            if (insertError.code === '23505') {
              console.log(
                'ℹ️ Cliente criado simultaneamente. ' +
                'Atualizando registro existente...'
              );

              const dadosConflito = {
                data_contato: agora
              };

              if (nomeParaSalvar) {
                dadosConflito.nome = nomeParaSalvar;
              }

              const {
                error: conflitoError
              } = await supabase
                .from('clientes_novos')
                .update(dadosConflito)
                .eq('telefone', telefoneParaSupabase);

              if (conflitoError) {
                console.error(
                  '❌ Erro ao atualizar após conflito:',
                  conflitoError
                );
                return;
              }

              console.log(
                '✅ Registro existente atualizado após conflito'
              );
            } else {
              console.error(
                '❌ Erro ao inserir cliente:',
                insertError
              );
              return;
            }
          } else {
            console.log(
              '✅ Cliente inserido com sucesso'
            );
          }
        }

        // ========================================================
        // 7. CRIAR OU RECUPERAR ETAPA DO PROCESSO
        // ========================================================

        let etapaAtual = 'boas_vindas';

        const {
          data: processoExistente,
          error: processoSelectError
        } = await supabase
          .from('etapas_processo')
          .select(
            'id, etapa_atual, data_inicio, data_atualizacao, historico'
          )
          .eq(
            'cliente_telefone',
            telefoneParaSupabase
          )
          .maybeSingle();

        if (processoSelectError) {
          console.error(
            '❌ Erro ao consultar etapa do processo:',
            processoSelectError
          );
          return;
        }

        if (processoExistente) {
          etapaAtual =
            processoExistente.etapa_atual ||
            'boas_vindas';

          const {
            error: processoUpdateError
          } = await supabase
            .from('etapas_processo')
            .update({
              data_atualizacao: agora
            })
            .eq('id', processoExistente.id);

          if (processoUpdateError) {
            console.error(
              '❌ Erro ao atualizar etapa do processo:',
              processoUpdateError
            );
            return;
          }

          console.log(
            '✅ Etapa existente preservada:',
            etapaAtual
          );
        } else {
          const historicoInicial = [
            {
              etapa: 'boas_vindas',
              evento: 'processo_iniciado',
              data: agora
            }
          ];

          const {
            error: processoInsertError
          } = await supabase
            .from('etapas_processo')
            .insert({
              cliente_telefone: telefoneParaSupabase,
              etapa_atual: 'boas_vindas',
              data_inicio: agora,
              data_atualizacao: agora,
              historico: historicoInicial
            });

          if (processoInsertError) {
            /*
             * A constraint UNIQUE protege contra duas mensagens
             * simultâneas do mesmo telefone.
             */
            if (
              processoInsertError.code === '23505'
            ) {
              console.log(
                'ℹ️ Processo criado simultaneamente. ' +
                'Recuperando registro existente...'
              );

              const {
                data: processoConcorrente,
                error: concorrenciaError
              } = await supabase
                .from('etapas_processo')
                .select('etapa_atual')
                .eq(
                  'cliente_telefone',
                  telefoneParaSupabase
                )
                .maybeSingle();

              if (concorrenciaError) {
                console.error(
                  '❌ Erro ao recuperar processo após concorrência:',
                  concorrenciaError
                );
                return;
              }

              etapaAtual =
                processoConcorrente?.etapa_atual ||
                'boas_vindas';

              console.log(
                '✅ Processo recuperado:',
                etapaAtual
              );
            } else {
              console.error(
                '❌ Erro ao criar etapa do processo:',
                processoInsertError
              );
              return;
            }
          } else {
            console.log(
              '✅ Processo iniciado em: boas_vindas'
            );
          }
        }

        // ========================================================
        // 8. CONFIGURAÇÃO DA Z-API
        // ========================================================

        const ZAPI_TOKEN = String(
          process.env.ZAPI_TOKEN || ''
        ).trim();

        /*
         * O .env existente usa ZAPI_INSTANCE_ID.
         */
        const ZAPI_INSTANCE_ID = String(
          process.env.ZAPI_INSTANCE_ID ||
          process.env.ZAPI_CLIENT_ID ||
          ''
        ).trim();

        const ZAPI_CLIENT_TOKEN = String(
          process.env.ZAPI_CLIENT_TOKEN || ''
        ).trim();

        console.log(
          '📨 ===== ENVIO Z-API ====='
        );

        console.log(
          '📨 Telefone:',
          telefoneParaZapi
        );

        console.log(
          '📨 Instância configurada:',
          ZAPI_INSTANCE_ID
            ? 'SIM'
            : 'NÃO'
        );

        console.log(
          '📨 Token configurado:',
          Boolean(ZAPI_TOKEN)
        );

        console.log(
          '📨 Client-Token configurado:',
          Boolean(ZAPI_CLIENT_TOKEN)
        );

        if (
          !ZAPI_TOKEN ||
          !ZAPI_INSTANCE_ID
        ) {
          console.error(
            '❌ ZAPI_TOKEN ou ZAPI_INSTANCE_ID ausentes'
          );
          return;
        }

        // ========================================================
        // 9. ENVIAR RESPOSTA PELO WHATSAPP
        // ========================================================

        const urlZapi =
          'https://api.z-api.io/instances/' +
          encodeURIComponent(ZAPI_INSTANCE_ID) +
          '/token/' +
          encodeURIComponent(ZAPI_TOKEN) +
          '/send-text';

        const nomeParaResposta =
          nomeParaSalvar ||
          existente?.nome ||
          'Cliente';

        const mensagemResposta =
          `Olá ${nomeParaResposta}! Recebi sua mensagem: ` +
          `"${mensagemRecebida}".\n\n` +
          `Sua etapa atual é: ${etapaAtual}.`;

        const headers = {
          'Content-Type': 'application/json'
        };

        if (ZAPI_CLIENT_TOKEN) {
          headers['Client-Token'] =
            ZAPI_CLIENT_TOKEN;
        }

        const responseZapi = await fetch(
          urlZapi,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              phone: telefoneParaZapi,
              message: mensagemResposta
            })
          }
        );

        const respostaTexto =
          await responseZapi.text();

        let dataZapi;

        try {
          dataZapi = respostaTexto
            ? JSON.parse(respostaTexto)
            : {};
        } catch {
          dataZapi = respostaTexto;
        }

        console.log(
          `📨 Z-API status para ${telefoneParaZapi}: ` +
          `${responseZapi.status}`
        );

        console.log(
          '📨 Z-API resposta:',
          dataZapi
        );

        if (!responseZapi.ok) {
          console.error(
            '❌ Falha ao enviar resposta via Z-API'
          );
          return;
        }

        console.log(
          '✅ Resposta enviada com sucesso'
        );
      } catch (erro) {
        /*
         * O status HTTP já foi enviado à Z-API no início da rota.
         */
        console.error(
          '❌ Erro geral no processamento do webhook:',
          erro
        );
      }
    })();
  }
);

// ============================================================
// ENDPOINTS DE SAÚDE
// ============================================================

app.get(
  '/health',
  (req, res) => {
    res.status(200).send('OK');
  }
);

app.get(
  '/ping',
  (req, res) => {
    res.status(200).send('ok');
  }
);

// ============================================================
// INICIALIZAÇÃO
// ============================================================

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `\n🚀 Servidor rodando na porta ${PORT}`
    );

    console.log(
      `🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`
    );

    console.log(
      `📱 Z-API configurada: ${
        process.env.ZAPI_TOKEN &&
        (
          process.env.ZAPI_INSTANCE_ID ||
          process.env.ZAPI_CLIENT_ID
        )
          ? '✅ Sim'
          : '❌ Não'
      }`
    );
  }
);