// server.js
console.log('--- DEBUG: server.js carregado no topo (VERSAO FINAL) ---'); // ESTA LINHA DEVE ESTAR AQUI
const express = require('express'); // APENAS UMA VEZ, LOGO ABAIXO DO CONSOLE.LOG
const { Resend } = require('resend');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');

const app = express(); // AQUI É ONDE A INSTÂNCIA DO EXPRESS É CRIADA

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
console.log('--- server.js carregado: ' + __filename + ' ---')
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
// CLASSIFICAÇÃO E RESPOSTAS DO BOT
// ============================================================

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:()[$$|{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectarIntencao(mensagem) {
  const texto = normalizarTexto(mensagem);

  if (!texto) return 'desconhecida';

  const saudacoes = [
    'oi',
    'ola',
    'bom dia',
    'boa tarde',
    'boa noite',
    'opa',
    'e ai',
    'tudo bem',
    'hello',
    'hi'
  ];

  if (
    saudacoes.some(
      (item) => texto === item || texto.startsWith(`${item} `)
    )
  ) {
    return 'saudacao';
  }

  if (
    [
      'status',
      'andamento',
      'situacao',
      'situação',
      'etapa',
      'fase',
      'progresso',
      'como esta meu processo',
      'como está meu processo',
      'qual o andamento',
      'qual a situacao',
      'qual a situação'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'andamento';
  }

  if (
    [
      'documento',
      'documentos',
      'documentacao',
      'documentação',
      'requisito',
      'requisitos',
      'papel',
      'papeis',
      'papéis'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'documentos';
  }

  if (
    [
      'prazo',
      'quanto tempo',
      'quanto demora',
      'demora',
      'dias',
      'semanas',
      'agendamento',
      'processamento'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'prazo';
  }

  if (
    [
      'pagamento',
      'pagar',
      'preco',
      'preço',
      'valor',
      'valores',
      'quanto custa',
      'custo',
      'investimento',
      'taxa'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'pagamento';
  }

  if (
    [
      'ajuda',
      'atendente',
      'especialista',
      'falar com alguem',
      'falar com alguém',
      'contato',
      'humano'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'ajuda';
  }

  if (
    [
      'negado',
      'negativa',
      'recusado',
      'recusaram',
      'deportado'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'visto_negado';
  }

  if (
    texto.includes('visto americano') ||
    texto.includes('visto eua') ||
    texto.includes('visto estados unidos') ||
    texto.includes('visto usa') ||
    texto.includes('b1') ||
    texto.includes('b2')
  ) {
    return 'visto_americano';
  }

  if (
    texto.includes('visto canadense') ||
    texto.includes('visto canada')
  ) {
    return 'visto_canadense';
  }

  if (
    texto.includes('visto australiano') ||
    texto.includes('visto australia')
  ) {
    return 'visto_australiano';
  }

  if (
    texto.includes('eta uk') ||
    texto.includes('reino unido') ||
    texto.includes('inglaterra')
  ) {
    return 'eta_uk';
  }

  if (texto.includes('passaporte')) {
    return 'passaporte';
  }

  if (
    [
      'quero fazer o visto',
      'quero meu visto',
      'iniciar processo',
      'comecar processo',
      'começar processo',
      'quero contratar',
      'quero iniciar',
      'vou contratar'
    ].some((item) => texto.includes(normalizarTexto(item)))
  ) {
    return 'iniciar_processo';
  }

  return 'desconhecida';
}

function obterNomeExibicao(nome) {
  const nomeLimpo = String(nome || '').trim();

  if (!nomeLimpo || nomeLimpo.toLowerCase() === 'cliente') {
    return 'Cliente';
  }

  return nomeLimpo.split(' ')[0];
}

function obterNomeEtapa(etapa) {
  const nomes = {
    boas_vindas: 'Boas-vindas',
    formulario_enviado: 'Formulário Enviado',
    analise_correcoes: 'Análise e Correções',
    abertura_processo: 'Abertura do Processo',
    boleto_emitido: 'Boleto Emitido',
    boleto_pago: 'Boleto Pago',
    agendamento_realizado: 'Agendamento Realizado',
    treinamento_realizado: 'Treinamento Concluído',
    entrevista_realizada: 'Entrevista Realizada',
    visto_aprovado: 'Visto Aprovado',
    passaporte_retornado: 'Passaporte disponível para retirada ou entrega',
    visto_recusado: 'Visto Recusado'
  };

  return nomes[etapa] || etapa || 'Em andamento';
}

function gerarRespostaBot(intencao, nome, etapaAtual) {
  console.log('--- DEBUG: INICIO gerarRespostaBot (VERSAO ATUALIZADA E UNICA) ---');
  console.log('Intencao recebida em gerarRespostaBot:', intencao);
  const primeiroNome = obterNomeExibicao(nome);
  const etapa = obterNomeEtapa(etapaAtual);

  const respostas = {
    saudacao:
      `👋 Olá, ${primeiroNome}!\n\n` +
      `Sou o assistente da GetVisa Assessoria. Estou aqui para ajudar com informações sobre vistos, documentos, prazos e andamento do processo.\n\n` +
      `Como posso ajudar? (ESTA É A VERSAO NOVA E BRILHANTE!)`,
    andamento:
      `Certo, ${primeiroNome}! Para verificar o andamento do seu processo, por favor, me informe o número do seu protocolo ou CPF.`,
    // ADICIONE ESTA NOVA RESPOSTA AQUI:
    documentos:
      `Para te ajudar com os documentos, ${primeiroNome}, preciso saber qual visto você está buscando (ex: americano, canadense, etc.).`,
    // ... mantenha as outras respostas como estão
  };
  console.log('--- DEBUG: Objeto respostas gerado ---');
  console.log(respostas);
  return (
    respostas[intencao] ||
    `Olá, ${primeiroNome}!\n\n` +
      `Não consegui identificar sua solicitação.\n\n` +
      `Você pode perguntar sobre documentos, prazo, pagamento ou andamento do processo.`
  );
}

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

        // --- INÍCIO DAS LINHAS CORRIGIDAS E COM DEBUG ---
        const intencao = detectarIntencao(mensagemRecebida);

        console.log('--- DEBUG: ANTES DE CHAMAR gerarRespostaBot ---');
        console.log('Intencao detectada (antes de gerarRespostaBot):', intencao);
        console.log('Nome para resposta (antes de gerarRespostaBot):', nomeParaResposta);

        console.log('🎯 Intenção detectada:', intencao); // Mantenha esta linha original
        console.log('📋 Etapa preservada:', etapaAtual); // Mantenha esta linha original

        const mensagemResposta = gerarRespostaBot(
          intencao,
          nomeParaResposta,
          etapaAtual
        );
        // --- FIM DAS LINHAS CORRIGIDAS E COM DEBUG ---

        console.log(
          '💬 Resposta preparada:',
          JSON.stringify(mensagemResposta)
        );

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
// DASHBOARD
// ============================================================

app.get(
  '/api/dashboard-data',
  async (req, res) => {
    try {
      const {
        data: clientes,
        error: clientesError
      } = await supabase
        .from('clientes_novos')
        .select(
          'id, telefone, nome, email, status, onboarding_completo, data_contato'
        )
        .order('data_contato', {
          ascending: false
        });

      if (clientesError) {
        console.error(
          '❌ Erro ao buscar clientes:',
          clientesError
        );

        return res.status(500).json({
          error: 'Erro ao carregar clientes'
        });
      }

      const {
        data: etapas,
        error: etapasError
      } = await supabase
        .from('etapas_processo')
        .select(
          'cliente_telefone, etapa_atual, data_atualizacao'
        )
        .order('data_atualizacao', {
          ascending: false
        });

      if (etapasError) {
        console.error(
          '❌ Erro ao buscar etapas:',
          etapasError
        );

        return res.status(500).json({
          error: 'Erro ao carregar etapas'
        });
      }

      const listaClientes = clientes || [];
      const listaEtapas = etapas || [];

      const etapasPorTelefone = new Map(
        listaEtapas.map((etapa) => [
          etapa.cliente_telefone,
          etapa
        ])
      );

      const clientesComEtapa = listaClientes.map(
        (cliente) => {
          const etapa = etapasPorTelefone.get(
            cliente.telefone
          );

          return {
            ...cliente,
            etapa_atual:
              etapa?.etapa_atual || 'boas_vindas',
            data_atualizacao:
              etapa?.data_atualizacao ||
              cliente.data_contato
          };
        }
      );

      const hoje = new Date();

      const inicioDoDia = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate()
      );

      const novosHoje = listaClientes.filter(
        (cliente) => {
          if (!cliente.data_contato) {
            return false;
          }

          return new Date(cliente.data_contato) >=
            inicioDoDia;
        }
      ).length;

      const porStatus = listaClientes.reduce(
        (resultado, cliente) => {
          const status = cliente.status || 'sem_status';

          resultado[status] =
            (resultado[status] || 0) + 1;

          return resultado;
        },
        {}
      );

      return res.json({
        status: 'online',
        totalClientes: listaClientes.length,
        novosHoje,
        onboardingCompletos:
          listaClientes.filter(
            (cliente) =>
              cliente.onboarding_completo === true
          ).length,
        porStatus,
        clientes: clientesComEtapa.slice(0, 100)
      });
    } catch (erro) {
      console.error(
        '❌ Erro inesperado no dashboard:',
        erro
      );

      return res.status(500).json({
        error: 'Erro interno ao carregar dashboard'
      });
    }
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