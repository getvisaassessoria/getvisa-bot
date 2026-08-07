// utils/intentDetector.js
const { BOAS_VINDAS_MESSAGES } = require('../config/constants'); // Importe apenas o necessário

function detectIntent(message) {
    const cleanMessage = message.toLowerCase().trim();

    const INTENT_MAP = {
        'visto_americano': [
            'visto americano', 'visto eua', 'visto estados unidos', 
            'us visa', 'b1', 'b2', 'entrevista eua', 'visto eua',
            'quero visto americano', 'fazer visto americano',
            'visto para eua', 'visto usa'
        ],
        'visto_canadense': [
            'visto canadense', 'visto canada', 'visto para canada',
            'quero visto canadense', 'fazer visto canadense'
        ],
        'visto_australiano': [
            'visto australiano', 'visto australia', 'visto para australia',
            'quero visto australiano', 'fazer visto australiano'
        ],
        'eta_uk': [
            'eta uk', 'reino unido', 'inglaterra', 'uk visa',
            'visto reino unido', 'visto inglaterra'
        ],
        'passaporte': [
            'passaporte', 'pf', 'policia federal', 'renovar passaporte',
            'passaporte novo', 'fazer passaporte', 'quero passaporte'
        ],
        'preco': [
            'preco', 'valor', 'quanto custa', 'taxa', 'investimento',
            'custo', 'valores', 'preco'
        ],
        'prazo': [
            'prazo', 'tempo', 'dias', 'semanas', 'demora',
            'quanto tempo', 'agendamento', 'processamento'
        ],
        'documentos': [
            'documentos', 'documentacao', 'requisitos', 'necessario',
            'obrigatorio', 'papeis'
        ],
        'visto_negado': [
            'negado', 'negativa', 'recusado', 'visto recusado',
            'deportado', 'visto negado'
        ],
        'iniciar_processo': [
            'quero fazer o visto', 'quero visto', 'iniciar processo',
            'comecar', 'quero comecar', 'vou fazer', 'quero informação',
            'quero saber', 'me ajuda', 'ajuda', 'help', 'informacoes',
            'quero contratar', 'contratar', 'assinar', 'vou contratar',
            'quero iniciar', 'iniciar', 'quero começar', 'começar agora',
            'vamos começar', 'bora começar', 'quero o visto', 'fazer visto',
            'meu visto', 'quero meu visto'
        ]
    };

    const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'hey', 'hi', 'hello', 'tudo bem', 'olá'];
    if (saudacoes.some(s => cleanMessage.includes(s))) {
        console.log('👋 Saudação detectada, ignorando intenção');
        return null;
    }

    for (const [intent, keywords] of Object.entries(INTENT_MAP)) {
        for (const keyword of keywords) {
            if (cleanMessage.includes(keyword)) {
                console.log(`🎯 Intenção detectada: ${intent} (palavra: "${keyword}")`);
                return intent;
            }
        }
    }

    console.log('⚠️ Nenhuma intenção detectada para:', cleanMessage);
    return null;
}

function getRespostaIntencao(intent, service) {
    const respostas = {
        'visto_americano': 'VISTO AMERICANO\n\nProcesso completo:\n- Preenchimento DS-160\n- Agendamento da entrevista\n- Preparacao para entrevista\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 950 + Assessoria R$ 350\n\nDigite 0 para voltar ao MENU principal',
        'visto_canadense': 'VISTO CANADENSE\n\nProcesso completo:\n- Aplicacao online GCKey\n- Biometria\n- Preparacao de documentos\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 750 + Assessoria R$ 400\n\nDigite 0 para voltar ao MENU principal',
        'visto_australiano': 'VISTO AUSTRALIANO\n\nProcesso completo:\n- Analise de perfil\n- Aplicacao online ImmiAccount\n- Envio de documentos\n- Acompanhamento total\n\nInvestimento: Taxa ~R$ 850 + Assessoria R$ 450\n\nDigite 0 para voltar ao MENU principal',
        'eta_uk': 'eTA UK (REINO UNIDO)\n\nProcesso completo:\n- Aplicacao 100% online\n- Validacao de dados\n- Acompanhamento\n\nInvestimento: Taxa ~R$ 120 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'passaporte': 'PASSAPORTE\n\nProcesso completo:\n- Agendamento na PF\n- Orientacao documental\n- Acompanhamento total\n\nInvestimento: Taxa PF ~R$ 257 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'preco': 'INVESTIMENTO DOS SERVICOS\n\nVisto Americano: Taxa ~R$ 950 + Assessoria R$ 350\nVisto Canadense: Taxa ~R$ 750 + Assessoria R$ 400\nVisto Australiano: Taxa ~R$ 850 + Assessoria R$ 450\neTA UK: ~R$ 120 + Assessoria R$ 150\neTA Canadense: ~R$ 50 + Assessoria R$ 100\nPassaporte: Taxa ~R$ 257 + Assessoria R$ 150\n\nDigite 0 para voltar ao MENU principal',
        'prazo': 'PRAZOS DOS SERVICOS\n\nVisto Americano: 30-40 dias\nVisto Canadense: 30-60 dias\nVisto Australiano: 15-30 dias\neTA UK: 1-3 dias\neTA Canadense: 1 dia\nPassaporte: 10-20 dias\n\nDigite 0 para voltar ao MENU principal',
        'documentos': 'DOCUMENTOS NECESSARIOS\n\nGerais:\n- Passaporte valido (minimo 6 meses)\n- Foto 5x7 recente\n- Comprovante de renda\n- Extratos bancarios\n\nEspecificos:\n- EUA: DS-160 preenchido\n- Canada: Carta de intencao\n- Passaporte: RG, CPF, Titulo de Eleitor\n\nDigite 0 para voltar ao MENU principal',
        'visto_negado': 'VISTO NEGADO - RECUPERACAO\n\nFaca uma analise gratuita do seu caso:\nhttps://getvisa.com.br/visto-americano-negado/\n\nO que fazemos:\n- Analise do motivo da negativa\n- Correcao do formulario\n- Documentacao reforcada\n- Preparacao para entrevista\n\nAssessoria especializada: R$ 380\n\nDigite 0 para voltar ao MENU principal',
        'iniciar_processo': 'Otimo! Vamos iniciar seu processo!\n\nEscolha o servico:\n\n1 - Visto Americano\n2 - Visto Canadense\n3 - Visto Australiano\n4 - eTA UK\n5 - eTA Canadense\n6 - Passaporte\n\nDigite o numero ou me pergunte algo!'
    };
    return respostas[intent] || 'Desculpe, nao entendi sua pergunta. Pode reformular?';
}

function getRespostaSubmenu(servico, opcao) {
    var respostas = {
        preco: {
            visto_americano: '💰 INVESTIMENTO - VISTO AMERICANO\n\n💵 Taxa Consular: ~R$ 950,00\n💼 Assessoria GetVisa: R$ 350,00\n\n✅ INCLUI: Preenchimento DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '💰 INVESTIMENTO - VISTO CANADENSE\n\n💵 Taxa Consular: ~R$ 750,00\n💼 Assessoria GetVisa: R$ 400,00\n\n✅ INCLUI: Aplicação online, biometria, preparação de documentos e acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '💰 INVESTIMENTO - VISTO AUSTRALIANO\n\n💵 Taxa Consular: ~R$ 850,00\n💼 Assessoria GetVisa: R$ 450,00\n\n✅ INCLUI: Análise de perfil, aplicação online, documentação específica.\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '💰 INVESTIMENTO - eTA UK\n\n💵 Taxa: ~R$ 120,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Aplicação online, validação de dados, acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '💰 INVESTIMENTO - eTA CANADENSE\n\n💵 Taxa: ~R$ 50,00\n💼 Assessoria GetVisa: R$ 100,00\n\n✅ INCLUI: Aplicação online rápida, validação, entrega por e-mail.\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '💰 INVESTIMENTO - PASSAPORTE\n\n💵 Taxa PF: ~R$ 257,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Agendamento, orientação documental, acompanhamento.\n\nDigite 0 para voltar ao MENU principal'
        },
        prazo: {
            visto_americano: '⏱️ PRAZO - VISTO AMERICANO\n\nAgendamento: até 8 semanas\nAnálise consular: 7 a 10 dias úteis\nRetorno do passaporte: 5 a 7 dias úteis\n\nTotal estimado: 30 a 40 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '⏱️ PRAZO - VISTO CANADENSE\n\nProcessamento: 4 a 8 semanas\nRetorno: 2 a 3 dias úteis\n\nTotal estimado: 30 a 60 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '⏱️ PRAZO - VISTO AUSTRALIANO\n\nProcessamento: 2 a 4 semanas\n\nTotal estimado: 15 a 30 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '⏱️ PRAZO - eTA UK\n\nProcessamento: até 72 horas\n\nTotal estimado: 1 a 3 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '⏱️ PRAZO - eTA CANADENSE\n\nProcessamento: até 24 horas\n\nTotal estimado: 1 dia\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '⏱️ PRAZO - PASSAPORTE\n\nEmissão: 7 a 15 dias úteis\n\nTotal estimado: 10 a 20 dias\n\nDigite 0 para voltar ao MENU principal'
        },
        documentos: {
            visto_americano: '📄 DOCUMENTOS - VISTO AMERICANO\n\nOBRIGATÓRIOS:\n- Passaporte válido (mínimo 6 meses)\n- Foto 5x7 recente\n- Comprovante da taxa consular\n- DS-160 preenchido\n\nRECOMENDADOS:\n- Comprovante de renda\n- Extratos bancários\n- Comprovante de imóvel/veículo\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '📄 DOCUMENTOS - VISTO CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Foto digital\n- Comprovantes financeiros\n\nRECOMENDADOS:\n- Carta de intenção\n- Histórico de viagens\n- Vínculos com o Brasil\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '📄 DOCUMENTOS - VISTO AUSTRALIANO\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Comprovantes de recursos\n- Seguro saúde (recomendado)\n\nRECOMENDADOS:\n- Roteiro de viagem\n- Reservas de hospedagem\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '📄 DOCUMENTOS - eTA UK\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- E-mail válido\n- Dados de viagem\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '📄 DOCUMENTOS - eTA CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Cartão de crédito para taxa\n- E-mail válido\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '📄 DOCUMENTOS - PASSAPORTE\n\nOBRIGATÓRIOS:\n- RG original\n- CPF\n- Título de eleitor (homens 18-70)\n- Certidão de nascimento/casamento\n- Comprovante de quitação militar (homens)\n\nDigite 0 para voltar ao MENU principal'
        },
        processo: {
            visto_americano: '🔄 PROCESSO - VISTO AMERICANO\n\n- Análise de perfil\n- Preenchimento do DS-160\n- Pagamento da taxa consular\n- Agendamento da entrevista\n- Coleta biométrica (CASV)\n- Entrevista no Consulado\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '🔄 PROCESSO - VISTO CANADENSE\n\n- Análise de perfil\n- Aplicação online GCKey\n- Pagamento das taxas\n- Agendamento da biometria\n- Coleta de dados biométricos\n- Entrevista (se solicitado)\n- Decisão e envio\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '🔄 PROCESSO - VISTO AUSTRALIANO\n\n- Análise de perfil\n- Aplicação online ImmiAccount\n- Pagamento das taxas\n- Envio de documentos\n- Acompanhamento\n- Decisão por e-mail\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '🔄 PROCESSO - eTA UK\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '🔄 PROCESSO - eTA CANADENSE\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '🔄 PROCESSO - PASSAPORTE\n\n- Agendamento no site da PF\n- Separação dos documentos\n- Pagamento da GRU\n- Comparecimento ao posto\n- Coleta de dados biométricos\n- Aguardar emissão\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal'
        }
    };
    var resposta = respostas[opcao] && respostas[opcao][servico];
    if (!resposta) {
        resposta = '📋 INFORMAÇÕES EM BREVE\n\nEstamos preparando o conteúdo específico para ' + servico.replace('_', ' ').toUpperCase() + '.\n\nDigite 0 para voltar ao MENU principal';
    }
    return resposta;
}

module.exports = {
    detectIntent,
    getRespostaIntencao,
    getRespostaSubmenu
};