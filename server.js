const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

/**
 * Node.js 22 já possui fetch nativo.
 * Não é necessário instalar ou importar node-fetch.
 */

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT =
  Number.parseInt(
    String(process.env.PORT || '10000').trim(),
    10
  ) || 10000;

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ''
)
  .trim()
  .replace(/\/rest\/v1.*$/, '')
  .replace(/\/+$/, '');

const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ''
).trim();

const ZAPI_INSTANCE_ID = String(
  process.env.ZAPI_INSTANCE_ID ||
  process.env.ZAPI_CLIENT_ID ||
  ''
).trim();

const ZAPI_TOKEN = String(
  process.env.ZAPI_TOKEN || ''
).trim();

const ZAPI_CLIENT_TOKEN = String(
  process.env.ZAPI_CLIENT_TOKEN || ''
).trim();

const DASHBOARD_USER = String(
  process.env.DASHBOARD_USER || ''
).trim();

const DASHBOARD_PASSWORD = String(
  process.env.DASHBOARD_PASSWORD || ''
);

// ============================================================
// VALIDAÇÃO DO AMBIENTE
// ============================================================

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL é obrigatória');
}

if (!SUPABASE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY é obrigatória'
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log('✅ URL do Supabase:', SUPABASE_URL);
console.log('✅ Cliente Supabase inicializado');
console.log(
  '📱 Z-API configurada:',
  ZAPI_INSTANCE_ID && ZAPI_TOKEN ? '✅ Sim' : '❌ Não'
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

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contemAlgumTexto(texto, termos) {
  return termos.some((termo) =>
    texto.includes(termo)
  );
}

function extrairTelefone(body) {
  const telefoneBruto = String(
    body.phone ||
    body.from ||
    body.sender ||
    body.wa_id ||
    body.chatId ||
    ''
  ).trim();

  const numeros = telefoneBruto.replace(/\D/g, '');

  if (!numeros) {
    return {
      telefoneBruto: '',
      telefoneParaZapi: '',
      telefoneParaSupabase: ''
    };
  }

  const telefoneParaZapi = numeros.startsWith('55')
    ? numeros
    : `55${numeros}`;

  const telefoneParaSupabase =
    telefoneParaZapi.startsWith('55')
      ? telefoneParaZapi.slice(2)
      : telefoneParaZapi;

  return {
    telefoneBruto,
    telefoneParaZapi,
    telefoneParaSupabase
  };
}

function extrairMensagem(body) {
  let mensagem = '';

  if (typeof body.text === 'string') {
    mensagem = body.text;
  } else if (
    body.text &&
    typeof body.text === 'object'
  ) {
    mensagem =
      body.text.message ||
      body.text.body ||
      body.text.text ||
      '';
  }

  if (
    !mensagem &&
    typeof body.message === 'string'
  ) {
    mensagem = body.message;
  }

  if (
    !mensagem &&
    body.message &&
    typeof body.message === 'object'
  ) {
    mensagem =
      body.message.text ||
      body.message.body ||
      body.message.conversation ||
      body.message.content ||
      '';
  }

  if (!mensagem) {
    mensagem =
      body.content ||
      body.body ||
      body.conversation ||
      '';
  }

  return String(mensagem || '').trim();
}

function extrairNome(body) {
  const nome = String(
    body.senderName ||
    body.chatName ||
    ''
  ).trim();

  if (!nome) {
    return null;
  }

  const nomeNormalizado = normalizarTexto(nome);

  if (
    nomeNormalizado === 'cliente' ||
    nomeNormalizado === 'cliente whatsapp'
  ) {
    return null;
  }

  return nome.substring(0, 100);
}

function identificarIntencao(texto) {
  const mensagem = normalizarTexto(texto);

  if (!mensagem) {
    return 'desconhecida';
  }

  if (
    contemAlgumTexto(mensagem, [
      'atendente',
      'atendimento humano',
      'falar com uma pessoa',
      'falar com alguem',
      'consultor',
      'humano'
    ])
  ) {
    return 'atendimento_humano';
  }

  if (
    contemAlgumTexto(mensagem, [
      'obrigado',
      'obrigada',
      'agradeco',
      'valeu',
      'grato',
      'grata'
    ])
  ) {
    return 'agradecimento';
  }

  if (
    contemAlgumTexto(mensagem, [
      'tchau',
      'ate mais',
      'ate logo',
      'falamos depois'
    ])
  ) {
    return 'despedida';
  }

  if (
    contemAlgumTexto(mensagem, [
      'documento',
      'documentos',
      'documentacao',
      'o que preciso enviar',
      'lista de documentos'
    ])
  ) {
    return 'documentos';
  }

  if (
    contemAlgumTexto(mensagem, [
      'prazo',
      'quanto tempo',
      'quando fica pronto',
      'demora',
      'tempo do processo'
    ])
  ) {
    return 'prazo';
  }

  if (
    contemAlgumTexto(mensagem, [
      'pagamento',
      'pagar',
      'preco',
      'valor',
      'custo',
      'forma de pagamento',
      'pix'
    ])
  ) {
    return 'pagamento';
  }

  if (
    contemAlgumTexto(mensagem, [
      'andamento',
      'status do processo',
      'situacao do processo',
      'acompanhamento',
      'acompanhar processo',
      'como esta meu processo',
      'qual a etapa',
      'em que etapa',
      'meu processo'
    ])
  ) {
    return 'andamento';
  }

  if (
    /^(oi|ola|oie|bom dia|boa tarde|boa noite)$/.test(
      mensagem
    )
  ) {
    return 'saudacao';
  }

  return 'desconhecida';
}

function nomeAmigavelDaEtapa(etapaAtual) {
  const etapas = {
    boas_vindas: 'cadastro inicial',
    documentos: 'análise de documentos',
    analise_documentos: 'análise de documentos',
    pagamento: 'aguardando pagamento',
    protocolo: 'protocolo do processo',
    acompanhamento: 'acompanhamento',
    concluido: 'processo concluído',
    finalizado: 'processo finalizado'
  };

  const chave = normalizarTexto(
    etapaAtual || 'boas_vindas'
  ).replace(/\s+/g, '_');

  return (
    etapas[chave] ||
    String(etapaAtual || 'cadastro inicial')
      .replace(/_/g, ' ')
  );
}

function gerarRespostaPorIntencao(
  intencao,
  nome,
  etapaAtual
) {
  const nomeCliente = nome || 'Cliente';
  const etapa = nomeAmigavelDaEtapa(etapaAtual);

  const respostas = {
    saudacao:
      `Olá, ${nomeCliente}! 😊\n\n` +
      'Sou o assistente da GetVisa. Como posso ajudar?',

    andamento:
      `Olá, ${nomeCliente}!\n\n` +
      `Seu processo está atualmente na etapa: ${etapa}.\n\n` +
      'Nossa equipe continuará acompanhando seu atendimento. ' +
      'Caso haja alguma atualização, avisaremos por aqui.',

    documentos:
      `Olá, ${nomeCliente}!\n\n` +
      'Para orientar corretamente sobre os documentos, ' +
      'precisamos analisar o tipo do seu processo.\n\n' +
      'Nossa equipe poderá informar a lista necessária ' +
      'para o seu caso.',

    prazo:
      `Olá, ${nomeCliente}!\n\n` +
      'O prazo depende do tipo de solicitação, da análise ' +
      'dos documentos e dos órgãos envolvidos.\n\n' +
      'Nossa equipe poderá informar uma estimativa mais precisa.',

    pagamento:
      `Olá, ${nomeCliente}!\n\n` +
      'Para consultar valores e formas de pagamento, ' +
      'vou encaminhar sua solicitação para a equipe responsável.',

    atendimento_humano:
      `Claro, ${nomeCliente}!\n\n` +
      'Sua solicitação será encaminhada para um atendente ' +
      'da equipe GetVisa.',

    agradecimento:
      `Por nada, ${nomeCliente}! 😊\n\n` +
      'Estamos à disposição para ajudar.',

    despedida:
      `Até mais, ${nomeCliente}! 👋\n\n` +
      'A GetVisa agradece o contato.',

    desconhecida:
      `Olá, ${nomeCliente}!\n\n` +
      'Não consegui identificar sua solicitação.\n\n' +
      'Você pode perguntar sobre documentos, prazo, ' +
      'pagamento ou andamento do processo.'
  };

  return (
    respostas[intencao] ||
    respostas.desconhecida
  );
}

// ============================================================
// AUTENTICAÇÃO DO DASHBOARD
// ============================================================

function dashboardAuth(req, res, next) {
  const rotaProtegida =
    req.path === '/painel.html' ||
    req.path === '/api/dashboard-data';

  if (!rotaProtegida) {
    return next();
  }

  if (!DASHBOARD_USER || !DASHBOARD_PASSWORD) {
    console.error(
      '❌ DASHBOARD_USER ou DASHBOARD_PASSWORD não configurados'
    );

    return res.status(503).json({
      error: 'Autenticação do dashboard não configurada'
    });
  }

  const authorization =
    req.headers.authorization || '';

  if (!authorization.startsWith('Basic ')) {
    res.set(
      'WWW-Authenticate',
      'Basic realm="Dashboard"'
    );

    return res
      .status(401)
      .send('Autenticação necessária');
  }

  try {
    const credenciais = Buffer
      .from(
        authorization.slice(6),
        'base64'
      )
      .toString('utf8');

    const separador = credenciais.indexOf(':');

    const usuario =
      separador >= 0
        ? credenciais.slice(0, separador)
        : '';

    const senha =
      separador >= 0
        ? credenciais.slice(separador + 1)
        : '';

    if (
      usuario !== DASHBOARD_USER ||
      senha !== DASHBOARD_PASSWORD
    ) {
      res.set(
        'WWW-Authenticate',
        'Basic realm="Dashboard"'
      );

      return res
        .status(401)
        .send('Credenciais inválidas');
    }

    return next();
  } catch (erro) {
    res.set(
      'WWW-Authenticate',
      'Basic realm="Dashboard"'
    );

    return res
      .status(401)
      .send('Credenciais inválidas');
  }
}

app.use(dashboardAuth);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

// ============================================================
// SUPABASE — CLIENTE
// ============================================================

async function buscarOuCriarCliente({
  telefone,
  nome,
  agora
}) {
  const {
    data: clienteExistente,
    error: consultaError
  } = await supabase
    .from('clientes_novos')
    .select(
      'id, telefone, nome, email, status, onboarding_completo'
    )
    .eq('telefone', telefone)
    .maybeSingle();

  if (consultaError) {
    throw new Error(
      `Erro ao consultar cliente: ${consultaError.message}`
    );
  }

  if (clienteExistente) {
    const dadosAtualizacao = {
      data_contato: agora,
      status: clienteExistente.status || 'novo'
    };

    if (!clienteExistente.nome && nome) {
      dadosAtualizacao.nome = nome;
    }

    const {
      error: atualizacaoError
    } = await supabase
      .from('clientes_novos')
      .update(dadosAtualizacao)
      .eq('id', clienteExistente.id);

    if (atualizacaoError) {
      throw new Error(
        `Erro ao atualizar cliente: ${atualizacaoError.message}`
      );
    }

    console.log(
      '✅ Cliente existente atualizado'
    );

    return {
      ...clienteExistente,
      ...dadosAtualizacao
    };
  }

  const novoCliente = {
    telefone,
    data_contato: agora,
    status: 'novo',
    onboarding_completo: false
  };

  if (nome) {
    novoCliente.nome = nome;
  }

  const {
    data: clienteCriado,
    error: criacaoError
  } = await supabase
    .from('clientes_novos')
    .insert(novoCliente)
    .select(
      'id, telefone, nome, email, status, onboarding_completo'
    )
    .single();

  if (!criacaoError) {
    console.log(
      '✅ Novo cliente criado'
    );

    return clienteCriado;
  }

  if (criacaoError.code !== '23505') {
    throw new Error(
      `Erro ao criar cliente: ${criacaoError.message}`
    );
  }

  console.log(
    'ℹ️ Cliente criado simultaneamente; recuperando registro'
  );

  const {
    data: clienteConcorrente,
    error: concorrenciaError
  } = await supabase
    .from('clientes_novos')
    .select(
      'id, telefone, nome, email, status, onboarding_completo'
    )
    .eq('telefone', telefone)
    .maybeSingle();

  if (concorrenciaError) {
    throw new Error(
      `Erro ao recuperar cliente: ${concorrenciaError.message}`
    );
  }

  return clienteConcorrente;
}

async function buscarOuCriarEtapa({
  telefone,
  agora
}) {
  const {
    data: processoExistente,
    error: consultaError
  } = await supabase
    .from('etapas_processo')
    .select(
      'id, etapa_atual, data_inicio, data_atualizacao, historico'
    )
    .eq('cliente_telefone', telefone)
    .maybeSingle();

  if (consultaError) {
    throw new Error(
      `Erro ao consultar etapa: ${consultaError.message}`
    );
  }

  if (processoExistente) {
    const etapaAtual =
      processoExistente.etapa_atual ||
      'boas_vindas';

    const {
      error: atualizacaoError
    } = await supabase
      .from('etapas_processo')
      .update({
        data_atualizacao: agora
      })
      .eq('id', processoExistente.id);

    if (atualizacaoError) {
      throw new Error(
        `Erro ao atualizar etapa: ${atualizacaoError.message}`
      );
    }

    console.log(
      '✅ Etapa preservada:',
      etapaAtual
    );

    return etapaAtual;
  }

  const historicoInicial = [
    {
      etapa: 'boas_vindas',
      evento: 'processo_iniciado',
      data: agora
    }
  ];

  const {
    error: criacaoError
  } = await supabase
    .from('etapas_processo')
    .insert({
      cliente_telefone: telefone,
      etapa_atual: 'boas_vindas',
      data_inicio: agora,
      data_atualizacao: agora,
      historico: historicoInicial
    });

  if (!criacaoError) {
    console.log(
      '✅ Processo iniciado na etapa boas_vindas'
    );

    return 'boas_vindas';
  }

  if (criacaoError.code !== '23505') {
    throw new Error(
      `Erro ao criar etapa: ${criacaoError.message}`
    );
  }

  const {
    data: processoConcorrente,
    error: concorrenciaError
  } = await supabase
    .from('etapas_processo')
    .select('etapa_atual')
    .eq('cliente_telefone', telefone)
    .maybeSingle();

  if (concorrenciaError) {
    throw new Error(
      `Erro ao recuperar etapa: ${concorrenciaError.message}`
    );
  }

  const etapaRecuperada =
    processoConcorrente?.etapa_atual ||
    'boas_vindas';

  console.log(
    '✅ Processo recuperado:',
    etapaRecuperada
  );

  return etapaRecuperada;
}

// ============================================================
// ENVIO PELA Z-API
// ============================================================

async function enviarRespostaZapi({
  telefone,
  mensagem
}) {
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    throw new Error(
      'ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurado'
    );
  }

  const url =
    'https://api.z-api.io/instances/' +
    encodeURIComponent(ZAPI_INSTANCE_ID) +
    '/token/' +
    encodeURIComponent(ZAPI_TOKEN) +
    '/send-text';

  const headers = {
    'Content-Type': 'application/json'
  };

  if (ZAPI_CLIENT_TOKEN) {
    headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
  }

  const resposta = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone: telefone,
      message: mensagem
    }),
    signal: AbortSignal.timeout(15000)
  });

  const texto = await resposta.text();

  let dados;

  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = texto;
  }

  console.log(
    `📨 Z-API status para ${telefone}: ` +
    `${resposta.status}`
  );

  console.log('📨 Z-API resposta:', dados);

  if (!resposta.ok) {
    throw new Error(
      `Falha da Z-API: HTTP ${resposta.status}`
    );
  }

  console.log(
    '✅ Resposta enviada com sucesso'
  );

  return dados;
}

// ============================================================
// PROCESSAMENTO DO WEBHOOK
// ============================================================

function eventoDeGrupo(body) {
  return (
    body.isGroup === true ||
    body.isGroupMsg === true ||
    String(body.chatId || '').includes('@g.us') ||
    String(body.participantPhone || '').includes('@g.us')
  );
}

function eventoIgnorado(body) {
  if (eventoDeGrupo(body)) {
    console.log(
      '👥 Evento de grupo ignorado'
    );
    return true;
  }

  if (body.isStatusReply === true) {
    console.log(
      '📊 Evento de status ignorado'
    );
    return true;
  }

  if (body.waitingMessage === true) {
    console.log(
      '⏳ Evento waitingMessage ignorado'
    );
    return true;
  }

  if (body.fromMe === true) {
    console.log(
      '🤖 Mensagem enviada pelo próprio número ignorada'
    );
    return true;
  }

  if (body.fromApi === true) {
    console.log(
      '🤖 Evento originado pela API ignorado'
    );
    return true;
  }

  if (
    body.type &&
    body.type !== 'ReceivedCallback'
  ) {
    console.log(
      '⏭️ Evento ignorado por tipo:',
      body.type
    );
    return true;
  }

  return false;
}

async function processarWebhook(body) {
  if (eventoIgnorado(body)) {
    return;
  }

  const {
    telefoneBruto,
    telefoneParaZapi,
    telefoneParaSupabase
  } = extrairTelefone(body);

  if (
    !telefoneParaZapi ||
    telefoneParaSupabase.length < 10
  ) {
    console.log(
      '⏭️ Evento ignorado: telefone inválido'
    );
    return;
  }

  const mensagem = extrairMensagem(body);

  if (!mensagem) {
    console.log(
      '⏭️ Evento ignorado: mensagem vazia'
    );
    return;
  }

  const nomeRecebido = extrairNome(body);
  const intencao = identificarIntencao(mensagem);
  const agora = new Date().toISOString();

  console.log(
    '📝 Mensagem:',
    JSON.stringify(mensagem)
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
    '👤 Nome recebido:',
    nomeRecebido || '(não informado)'
  );

  console.log(
    '🎯 Intenção identificada:',
    intencao
  );

  console.log(
    '🔍 Iniciando consulta do cliente'
  );

  const cliente = await buscarOuCriarCliente({
    telefone: telefoneParaSupabase,
    nome: nomeRecebido,
    agora
  });

  const etapaAtual = await buscarOuCriarEtapa({
    telefone: telefoneParaSupabase,
    agora
  });

  const nomeParaResposta =
    cliente?.nome ||
    nomeRecebido ||
    'Cliente';

  const mensagemResposta =
    gerarRespostaPorIntencao(
      intencao,
      nomeParaResposta,
      etapaAtual
    );

  console.log(
    '💬 Resposta preparada:',
    JSON.stringify(mensagemResposta)
  );

  await enviarRespostaZapi({
    telefone: telefoneParaZapi,
    mensagem: mensagemResposta
  });
}

// ============================================================
// WEBHOOK Z-API
// ============================================================

app.post(
  '/api/webhook/zapi',
  (req, res) => {
    console.log(
      '*** WEBHOOK Z-API RECEBIDO ***'
    );

    console.log(
      '📨 Body:',
      JSON.stringify(req.body || {}, null, 2)
    );

    // A Z-API recebe uma resposta imediata.
    res.status(200).send('OK');

    // O processamento continua em segundo plano.
    processarWebhook(req.body || {})
      .catch((erro) => {
        console.error(
          '❌ Erro geral no processamento:',
          erro.message
        );
      });
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
        throw clientesError;
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
        throw etapasError;
      }

      const listaClientes = clientes || [];
      const listaEtapas = etapas || [];

      const etapasPorTelefone = new Map(
        listaEtapas.map((etapa) => [
          etapa.cliente_telefone,
          etapa
        ])
      );

      const clientesComEtapa =
        listaClientes.map((cliente) => {
          const etapa =
            etapasPorTelefone.get(cliente.telefone);

          return {
            ...cliente,
            etapa_atual:
              etapa?.etapa_atual ||
              'boas_vindas',
            etapa_amigavel:
              nomeAmigavelDaEtapa(
                etapa?.etapa_atual
              ),
            data_atualizacao:
              etapa?.data_atualizacao ||
              cliente.data_contato
          };
        });

      const hoje = new Date();

      const inicioDoDia = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate()
      );

      const novosHoje =
        listaClientes.filter((cliente) => {
          if (!cliente.data_contato) {
            return false;
          }

          return (
            new Date(cliente.data_contato) >=
            inicioDoDia
          );
        }).length;

      const porStatus =
        listaClientes.reduce(
          (resultado, cliente) => {
            const status =
              cliente.status || 'sem_status';

            resultado[status] =
              (resultado[status] || 0) + 1;

            return resultado;
          },
          {}
        );

      const porEtapa =
        listaClientes.reduce(
          (resultado, cliente) => {
            const etapa =
              etapasPorTelefone.get(
                cliente.telefone
              )?.etapa_atual ||
              'boas_vindas';

            resultado[etapa] =
              (resultado[etapa] || 0) + 1;

            return resultado;
          },
          {}
        );

      const datas = clientesComEtapa
        .map((cliente) =>
          cliente.data_atualizacao
        )
        .filter(Boolean)
        .map((data) =>
          new Date(data).getTime()
        )
        .filter((data) =>
          !Number.isNaN(data)
        );

      const ultimaAtualizacao =
        datas.length > 0
          ? new Date(
              Math.max(...datas)
            ).toISOString()
          : null;

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
        porEtapa,
        ultimaAtualizacao,
        clientes:
          clientesComEtapa.slice(0, 100)
      });
    } catch (erro) {
      console.error(
        '❌ Erro no dashboard:',
        erro.message
      );

      return res.status(500).json({
        error: 'Erro interno ao carregar dashboard'
      });
    }
  }
);

// ============================================================
// SAÚDE DA APLICAÇÃO
// ============================================================

app.get(
  '/health',
  (req, res) => {
    return res.status(200).send('OK');
  }
);

app.get(
  '/ping',
  (req, res) => {
    return res.status(200).send('ok');
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
      `🚀 Servidor rodando na porta ${PORT}`
    );

    console.log(
      '🔗 Rota do webhook: /api/webhook/zapi'
    );

    console.log(
      '📱 Z-API configurada:',
      ZAPI_INSTANCE_ID && ZAPI_TOKEN
        ? '✅ Sim'
        : '❌ Não'
    );
  }
);