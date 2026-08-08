const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 10000;

let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

console.log('✅ URL do Supabase:', supabaseUrl);
console.log('✅ Cliente Supabase inicializado');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/webhook/zapi', (req, res) => {
  console.log('*** WEBHOOK Z-API RECEBIDO ***');

  const body = req.body || {};

  console.log('📨 Body:', JSON.stringify(body, null, 2));

  /*
   * Responde imediatamente à Z-API.
   * O processamento continua em segundo plano.
   */
  res.status(200).send('OK');

  (async () => {
    try {
      // ============================================================
      // 1. IGNORAR EVENTOS QUE NÃO SÃO MENSAGENS VÁLIDAS
      // ============================================================

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
        console.log('🤖 Mensagem enviada pelo próprio número ignorada');
        return;
      }

      if (body.fromApi === true) {
        console.log('🤖 Evento originado pela API ignorado');
        return;
      }

      /*
       * Quando o tipo vier informado, aceitamos apenas eventos de
       * mensagem recebida. Se a Z-API enviar um evento sem "type",
       * ele continua sendo analisado normalmente.
       */
      if (
        body.type &&
        body.type !== 'ReceivedCallback'
      ) {
        console.log('⏭️ Evento ignorado por tipo:', body.type);
        return;
      }

      // ============================================================
      // 2. EXTRAIR E NORMALIZAR O TELEFONE
      // ============================================================

      const telefoneBruto = String(
        body.phone ||
        body.from ||
        body.sender ||
        body.wa_id ||
        body.chatId ||
        ''
      ).trim();

      let telefoneNumeros = telefoneBruto.replace(/\D/g, '');

      if (!telefoneNumeros) {
        console.log('⏭️ Evento ignorado: telefone ausente');
        return;
      }

      /*
       * O telefone enviado para a Z-API precisa ter o código 55.
       * O telefone gravado no Supabase permanece sem o código 55.
       */
      let telefoneParaZapi = telefoneNumeros;

      if (!telefoneParaZapi.startsWith('55')) {
        telefoneParaZapi = '55' + telefoneParaZapi;
      }

      const telefoneParaSupabase = telefoneParaZapi.startsWith('55')
        ? telefoneParaZapi.substring(2)
        : telefoneParaZapi;

      if (telefoneParaSupabase.length < 10) {
        console.log(
          '⏭️ Evento ignorado: telefone inválido:',
          telefoneParaSupabase
        );
        return;
      }

      // ============================================================
      // 3. EXTRAIR A MENSAGEM
      // ============================================================

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
       * Bloqueio principal para o evento vazio identificado nos testes.
       * Não consulta, não cria, não atualiza e não responde.
       */
      if (!mensagemRecebida) {
        console.log(
          '⏭️ Evento ignorado: mensagem vazia ou sem texto'
        );
        return;
      }

      // ============================================================
      // 4. IDENTIFICAR O NOME
      // ============================================================

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

      console.log('🔍 ===== INICIANDO VERIFICAÇÃO =====');
      console.log(
        '📱 Telefone:',
        telefoneParaSupabase
      );

      const agora = new Date().toISOString();

      // ============================================================
      // 5. BUSCAR CLIENTE EXISTENTE
      // ============================================================

      const {
        data: existente,
        error: selectError
      } = await supabase
        .from('clientes_novos')
        .select('id, telefone, nome, email, status, onboarding_completo')
        .eq('telefone', telefoneParaSupabase)
        .maybeSingle();

      if (selectError) {
        console.error(
          '❌ Erro ao consultar cliente:',
          selectError
        );
        return;
      }

      // ============================================================
      // 6. ATUALIZAR CLIENTE EXISTENTE
      // ============================================================

      if (existente) {
        console.log('✅ Cliente já existe. Atualizando...');

        /*
         * Mantemos o nome já salvo.
         * Também não alteramos onboarding_completo para false,
         * pois isso poderia apagar uma etapa já concluída.
         */
        const dadosAtualizacao = {
          data_contato: agora,
          status: existente.status || 'novo'
        };

        /*
         * Se o registro ainda não tiver nome, aproveitamos o nome
         * recebido pela Z-API.
         */
        if (!existente.nome && nomeParaSalvar) {
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

        console.log('✅ Cliente atualizado com sucesso');
      }

      // ============================================================
      // 7. CRIAR NOVO CLIENTE
      // ============================================================

      else {
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
           * Se duas mensagens chegarem simultaneamente, a restrição
           * UNIQUE(telefone) pode bloquear o INSERT. Nesse caso,
           * atualizamos o registro que foi criado pela outra requisição.
           */
          if (insertError.code === '23505') {
            console.log(
              'ℹ️ Cliente criado simultaneamente. Atualizando registro existente...'
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
          console.log('✅ Cliente inserido com sucesso');
        }
      }

      // ============================================================
      // 8. CONFIGURAÇÃO DA Z-API
      // ============================================================

      const ZAPI_TOKEN = String(
        process.env.ZAPI_TOKEN || ''
      ).trim();

      const ZAPI_CLIENT_ID = String(
        process.env.ZAPI_CLIENT_ID || ''
      ).trim();

      const ZAPI_CLIENT_TOKEN = String(
        process.env.ZAPI_CLIENT_TOKEN || ''
      ).trim();

      console.log('📨 ===== ENVIO Z-API =====');
      console.log(
        '📨 Telefone:',
        telefoneParaZapi
      );
      console.log(
        '📨 Instância configurada:',
        ZAPI_CLIENT_ID || '(ausente)'
      );
      console.log(
        '📨 Token configurado:',
        Boolean(ZAPI_TOKEN)
      );
      console.log(
        '📨 Client-Token configurado:',
        Boolean(ZAPI_CLIENT_TOKEN)
      );

      if (!ZAPI_TOKEN || !ZAPI_CLIENT_ID) {
        console.error(
          '❌ ZAPI_TOKEN ou ZAPI_CLIENT_ID ausentes'
        );
        return;
      }

      // ============================================================
      // 9. ENVIAR RESPOSTA PELO WHATSAPP
      // ============================================================

      const urlZapi =
        'https://api.z-api.io/instances/' +
        encodeURIComponent(ZAPI_CLIENT_ID) +
        '/token/' +
        encodeURIComponent(ZAPI_TOKEN) +
        '/send-text';

      const nomeParaResposta =
        nomeParaSalvar ||
        existente?.nome ||
        'Cliente';

      const mensagemResposta =
        `Olá ${nomeParaResposta}! Recebi sua mensagem: ` +
        `"${mensagemRecebida}". Seu contato foi salvo!`;

      const headers = {
        'Content-Type': 'application/json'
      };

      if (ZAPI_CLIENT_TOKEN) {
        headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
      }

      const responseZapi = await fetch(urlZapi, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: telefoneParaZapi,
          message: mensagemResposta
        })
      });

      const respostaTexto = await responseZapi.text();

      let dataZapi;

      try {
        dataZapi = respostaTexto
          ? JSON.parse(respostaTexto)
          : {};
      } catch {
        dataZapi = respostaTexto;
      }

      console.log(
        `📨 Z-API status para ${telefoneParaZapi}: ${responseZapi.status}`
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

      console.log('✅ Resposta enviada com sucesso');
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
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('ok'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
  console.log(`📱 Z-API Configurado: ${process.env.ZAPI_TOKEN ? '✅ Sim' : '❌ Não'}`);
});