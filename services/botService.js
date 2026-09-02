// services/botService.js - VERSÃO COMPLETA COM SUBMENU

const { createClient } = require('@supabase/supabase-js');

// ============================================================
// CONFIGURAÇÃO INICIAL
// ============================================================
console.log('🤖 botService CARREGADO (VERSÃO COMPLETA COM SUBMENU)');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ============================================================
// ESTADO COMPARTILHADO
// ============================================================
const userState = new Map();

// ============================================================
// CONSTANTES DO BOT
// ============================================================
const ONBOARDING_STEPS = {
    SAUDACAO: 'saudacao',
    AGUARDANDO_NOME: 'aguardando_nome',
    AGUARDANDO_EMAIL: 'aguardando_email',
    CONFIRMACAO: 'confirmacao',
    COMPLETO: 'completo'
};

const ETAPAS = {
    formulario_enviado: { id: 'formulario_enviado', label: 'Formulário Enviado', next: 'analise_correcoes', color: '#3498db' },
    analise_correcoes: { id: 'analise_correcoes', label: 'Análise e Correções', next: 'abertura_processo', color: '#f39c12' },
    abertura_processo: { id: 'abertura_processo', label: 'Abertura do Processo', next: 'boleto_emitido', color: '#8e44ad' },
    boleto_emitido: { id: 'boleto_emitido', label: 'Boleto Emitido', next: 'boleto_pago', color: '#e67e22' },
    boleto_pago: { id: 'boleto_pago', label: 'Boleto Pago', next: 'agendamento_realizado', color: '#27ae60' },
    agendamento_realizado: { id: 'agendamento_realizado', label: 'Agendamento Realizado', next: 'treinamento_realizado', color: '#2980b9' },
    treinamento_realizado: { id: 'treinamento_realizado', label: 'Treinamento Concluído', next: 'entrevista_realizada', color: '#8e44ad' },
    entrevista_realizada: { id: 'entrevista_realizada', label: '🎤 Entrevista Realizada', next: null, color: '#2c3e50' },
    visto_aprovado: { id: 'visto_aprovado', label: '✅ Visto Aprovado', next: 'passaporte_retornado', color: '#16a34a' },
    passaporte_retornado: { id: 'passaporte_retornado', label: '📦 Passaporte disponível para retirada/entrega', next: null, color: '#2ecc71' },
    visto_recusado: { id: 'visto_recusado', label: '❌ Visto Recusado', next: null, color: '#ef4444' }
};

// ============================================================
// FUNÇÃO: LIMPAR TELEFONE
// ============================================================
function limparTelefone(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
}

// ============================================================
// FUNÇÃO: ENVIAR WHATSAPP
// ============================================================
async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;
        
        if (!instance || !token) {
            console.error('❌ Z-API não configurada');
            console.log('📨 Mensagem que seria enviada:', mensagem);
            return false;
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;

        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;

        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) {
            headers['Client-Token'] = clientToken;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: telefoneFormatado,
                message: mensagem
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro Z-API (${response.status}):`, errorText);
            return false;
        }

        console.log('✅ Mensagem enviada com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        return false;
    }
}

// ============================================================
// FUNÇÃO: DETECTAR INTENÇÃO
// ============================================================
function detectarIntencao(mensagem) {
    const texto = (mensagem || '').toLowerCase().trim();
    
    if (!texto) return 'desconhecida';
    
    const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem', 'hello', 'hi'];
    if (saudacoes.some(item => texto === item || texto.startsWith(item + ' '))) {
        return 'saudacao';
    }
    
    if (texto.includes('ds160') || texto.includes('formulario') || texto.includes('formulário')) {
        return 'solicitar_ds160';
    }
    
    if (['status', 'andamento', 'situacao', 'etapa', 'fase', 'progresso'].some(item => texto.includes(item))) {
        return 'andamento';
    }
    
    if (['documento', 'documentos', 'documentacao', 'requisito'].some(item => texto.includes(item))) {
        return 'documentos';
    }
    
    if (['prazo', 'quanto tempo', 'demora', 'dias', 'semanas'].some(item => texto.includes(item))) {
        return 'prazo';
    }
    
    if (['pagamento', 'pagar', 'preco', 'valor', 'custo', 'investimento', 'taxa'].some(item => texto.includes(item))) {
        return 'pagamento';
    }
    
    if (['ajuda', 'atendente', 'especialista', 'falar com alguem', 'contato'].some(item => texto.includes(item))) {
        return 'ajuda';
    }
    
    if (['visto americano', 'visto eua', 'visto usa', 'b1', 'b2'].some(item => texto.includes(item))) {
        return 'visto_americano';
    }
    
    if (['visto canadense', 'visto canada'].some(item => texto.includes(item))) {
        return 'visto_canadense';
    }
    
    if (['visto australiano', 'visto australia'].some(item => texto.includes(item))) {
        return 'visto_australiano';
    }
    
    if (['eta uk', 'reino unido', 'inglaterra'].some(item => texto.includes(item))) {
        return 'eta_uk';
    }
    
    if (['passaporte'].some(item => texto.includes(item))) {
        return 'passaporte';
    }
    
    if (['negado', 'negativa', 'recusado', 'recusaram', 'deportado', 'visto negado'].some(item => texto.includes(item))) {
        return 'visto_negado';
    }
    
    if (['indicar', 'recomendar', 'amigo', 'conhecido', 'indicacao'].some(item => texto.includes(item))) {
        return 'indicar_amigo';
    }
    
    return 'desconhecida';
}

// ============================================================
// FUNÇÃO: GERAR RESPOSTA DO BOT
// ============================================================
function gerarRespostaBot(intencao, nome) {
    const primeiroNome = (nome || 'Cliente').split(' ')[0];
    
    const respostas = {
        saudacao: `👋 Olá, ${primeiroNome}! Sou o assistente da GetVisa. Como posso ajudar?`,
        solicitar_ds160: `📋 Para iniciar seu processo, preencha o formulário: https://app.getvisa.com.br/formulario-ds160`,
        andamento: `🔍 Para verificar o andamento, me informe seu protocolo ou CPF.`,
        documentos: `📄 Para qual serviço você precisa de documentos?`,
        prazo: `⏱️ Para qual serviço você quer saber o prazo?`,
        pagamento: `💰 Qual serviço você quer saber sobre pagamento?`,
        ajuda: `📱 Fale com nosso especialista: wa.me/5521974601812`,
        visto_negado: `🔄 Visto negado? Acesse: https://getvisa.com.br/visto-americano-negado/`,
        indicar_amigo: `👥 Que legal! Compartilhe: wa.me/5521974601812\n🌐 getvisa.com.br`,
        desconhecida: `🤔 Não entendi. Digite "menu" para ver as opções.`
    };
    
    return respostas[intencao] || respostas.desconhecida;
}

// ============================================================
// FUNÇÃO: GET SUBMENU
// ============================================================
function getSubmenu(service) {
    const names = {
        'visto_americano': '🇺🇸 VISTO AMERICANO',
        'visto_canadense': '🇨🇦 VISTO CANADENSE',
        'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
        'eta_uk': '🇬🇧 eTA UK',
        'eta_canadense': '🇨🇦 eTA CANADENSE',
        'passaporte': '🛂 PASSAPORTE'
    };

    const isPassaporte = service === 'passaporte';
    const opcao5 = isPassaporte ? '🏛️ ONDE FAZER' : '🔄 VISTO NEGADO';
    const nome = names[service] || 'SERVIÇO';

    return `📋 ${nome}

1️⃣ - 💰 PREÇO
2️⃣ - ⏱️ PRAZO
3️⃣ - 📄 DOCUMENTOS
4️⃣ - 🔄 PROCESSO
5️⃣ - ${opcao5}
6️⃣ - 📊 AVALIAÇÃO GRATUITA
7️⃣ - 👨‍💼 FALAR COM ESPECIALISTA

0️⃣ - VOLTAR AO MENU PRINCIPAL

Digite o número da opção (1-7)`;
}

// ============================================================
// FUNÇÃO: GET RESPOSTA SUBMENU
// ============================================================
function getRespostaSubmenu(service, opcao) {
    const respostas = {
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
    
    const resposta = respostas[opcao] && respostas[opcao][service];
    if (!resposta) {
        return '📋 INFORMAÇÕES EM BREVE\n\nEstamos preparando o conteúdo específico para este serviço.\n\nDigite 0 para voltar ao MENU principal';
    }
    return resposta;
}

// ============================================================
// FUNÇÃO: PROCESSAR OPÇÃO NO SUBMENU
// ============================================================
async function processarOpcaoNoSubmenu(phone, message, state) {
    const service = state.service;
    const nomeCliente = state.nome ? `, ${state.nome.split(' ')[0]}` : '';
    
    console.log(`📌 Submenu ${service} - opção: ${message}`);
    
    // Opções do submenu
    const opcoes = {
        '1': 'preco',
        '2': 'prazo',
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial',
        '6': 'avaliacao',
        '7': 'especialista'
    };
    
    // Se digitar 0, volta ao menu principal
    if (message === '0' || message.toLowerCase() === 'menu') {
        state.nivel = 'principal';
        state.service = null;
        userState.set(phone, state);
        const menu = `🌟 **GETVISA - ASSESSORIA EM VISTOS**

1️⃣ - 🇺🇸 VISTO AMERICANO
2️⃣ - 🇨🇦 VISTO CANADENSE
3️⃣ - 🇦🇺 VISTO AUSTRALIANO
4️⃣ - 🇬🇧 eTA UK
5️⃣ - 🇨🇦 eTA CANADENSE
6️⃣ - 🛂 PASSAPORTE
7️⃣ - 📞 AJUDA / CONTATO

Digite o número da opção (1-7)`;
        await enviarWhatsApp(phone, menu);
        return;
    }
    
    // Se for opção válida (1-7)
    if (opcoes[message]) {
        const opcao = opcoes[message];
        const nomeServico = service.replace('_', ' ').toUpperCase();
        
        switch(message) {
            case '1':
                const respostaPreco = getRespostaSubmenu(service, 'preco');
                await enviarWhatsApp(phone, `${respostaPreco}\n\n📌 Você está em: ${nomeServico}\nDigite outra opção (1-7) ou 0 para menu principal`);
                break;
            case '2':
                const respostaPrazo = getRespostaSubmenu(service, 'prazo');
                await enviarWhatsApp(phone, `${respostaPrazo}\n\n📌 Você está em: ${nomeServico}\nDigite outra opção (1-7) ou 0 para menu principal`);
                break;
            case '3':
                const respostaDocs = getRespostaSubmenu(service, 'documentos');
                await enviarWhatsApp(phone, `${respostaDocs}\n\n📌 Você está em: ${nomeServico}\nDigite outra opção (1-7) ou 0 para menu principal`);
                break;
            case '4':
                const respostaProcesso = getRespostaSubmenu(service, 'processo');
                await enviarWhatsApp(phone, `${respostaProcesso}\n\n📌 Você está em: ${nomeServico}\nDigite outra opção (1-7) ou 0 para menu principal`);
                break;
            case '5':
                if (service === 'passaporte') {
                    const msg = '🏛️ ONDE FAZER O PASSAPORTE\n\nO passaporte é emitido pela Polícia Federal.\n\n🔗 Site oficial: https://www.gov.br/pf/pt-br/assuntos/passaporte\n\n📋 Etapas:\n1. Preencher o formulário\n2. Pagar a taxa (R$ 257,25)\n3. Agendar atendimento\n4. Comparecer à unidade\n5. Aguardar emissão (7-15 dias)\n6. Retirar o passaporte\n\nDigite 0 para voltar ao menu.';
                    await enviarWhatsApp(phone, msg);
                } else {
                    const msg = '🔄 VISTO NEGADO - RECUPERAÇÃO\n\nTeve o visto negado? Não desanime!\n\n🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/\n\n✅ Oferecemos:\n• Análise do motivo da negativa\n• Correção do formulário\n• Documentação reforçada\n• Preparação para entrevista\n\n💰 Investimento: R$ 380\n\nDigite 0 para voltar ao menu.';
                    await enviarWhatsApp(phone, msg);
                }
                break;
            case '6':
                const links = {
                    'visto_americano': 'https://getvisa.com.br/simulador-visto-americano/',
                    'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense/',
                    'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano/',
                    'eta_uk': 'https://getvisa.com.br/simulador-eta-uk/',
                    'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense/',
                    'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
                };
                const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano/';
                await enviarWhatsApp(phone, `📋 AVALIAÇÃO GRATUITA\n\n🔗 Acesse: ${link}\n\n⏱️ Leva menos de 2 minutos!\n\nDigite 0 para voltar ao menu.`);
                break;
            case '7':
                await enviarWhatsApp(phone, `👨‍💼 FALAR COM ESPECIALISTA\n\n📱 WhatsApp: wa.me/5521974601812\n📧 E-mail: contato@getvisa.com.br\n\nDigite 0 para voltar ao menu.`);
                break;
        }
        return;
    }
    
    // Fallback
    await enviarWhatsApp(phone, `❌ Opção inválida!\n\nDigite 0 para voltar ao menu principal.`);
}

// ============================================================
// FUNÇÃO: PROCESSAR ONBOARDING
// ============================================================
async function processarOnboarding(phone, message, state) {
    console.log('📌 Processando onboarding...');
    
    if (!state.onboardingStep || state.onboardingStep === 'saudacao') {
        const mensagem = `👋 Olá! Seja bem-vindo(a) à GetVisa Assessoria! 🇺🇸

Somos especialistas em vistos americanos!

Para começarmos, preciso saber:

📝 **Qual é o seu nome completo?**

Ex: Maria Silva

Digite "menu" a qualquer momento para ir ao menu principal.`;
        await enviarWhatsApp(phone, mensagem);
        state.onboardingStep = 'aguardando_nome';
        userState.set(phone, state);
        return;
    }
    
    if (state.onboardingStep === 'aguardando_nome') {
        if (message && message.length > 2) {
            state.nome = message;
            state.onboardingStep = 'aguardando_email';
            userState.set(phone, state);
            const mensagem = `😊 Prazer, ${state.nome}! Agora me diga:

📧 **Qual é o seu e-mail?**

Ex: maria@email.com`;
            await enviarWhatsApp(phone, mensagem);
            return;
        } else {
            await enviarWhatsApp(phone, '❌ Digite um nome válido (mínimo 3 caracteres).');
            return;
        }
    }
    
    if (state.onboardingStep === 'aguardando_email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(message)) {
            state.email = message;
            state.onboardingCompleto = true;
            state.nivel = 'principal';
            userState.set(phone, state);
            
            // Salva no Supabase
            try {
                await supabase
                    .from('clientes')
                    .upsert({
                        telefone: phone,
                        nome: state.nome,
                        email: state.email,
                        data_contato: new Date().toISOString(),
                        status: 'lead',
                        onboarding_completo: true,
                        data_onboarding: new Date().toISOString()
                    }, { onConflict: 'telefone' });
                console.log('✅ Cliente salvo no Supabase');
            } catch (err) {
                console.error('❌ Erro ao salvar:', err);
            }
            
            const mensagem = `✅ Perfeito, ${state.nome}! Seus dados foram salvos!

🌟 **GETVISA - ASSESSORIA EM VISTOS**

1️⃣ - 🇺🇸 VISTO AMERICANO
2️⃣ - 🇨🇦 VISTO CANADENSE
3️⃣ - 🇦🇺 VISTO AUSTRALIANO
4️⃣ - 🇬🇧 eTA UK
5️⃣ - 🇨🇦 eTA CANADENSE
6️⃣ - 🛂 PASSAPORTE
7️⃣ - 📞 AJUDA / CONTATO

Digite o número da opção (1-7) ou "menu" para ver novamente.`;
            await enviarWhatsApp(phone, mensagem);
            return;
        } else {
            await enviarWhatsApp(phone, '❌ E-mail inválido! Digite um e-mail válido.');
            return;
        }
    }
}

// ============================================================
// FUNÇÃO: PROCESSAR OPÇÃO NO MENU PRINCIPAL (VERSÃO COMPLETA)
// ============================================================
async function processarOpcaoNoMenuPrincipal(phone, message, state) {
    console.log('📌 Menu principal - opção:', message);
    
    const servicoMap = {
        '1': 'visto_americano',
        '2': 'visto_canadense',
        '3': 'visto_australiano',
        '4': 'eta_uk',
        '5': 'eta_canadense',
        '6': 'passaporte'
    };
    
    // ============================================================
    // 1. SERVIÇOS NUMÉRICOS (1-6)
    // ============================================================
    if (servicoMap[message]) {
        const serviceKey = servicoMap[message];
        state.nivel = 'submenu';
        state.service = serviceKey;
        userState.set(phone, state);
        await enviarWhatsApp(phone, getSubmenu(serviceKey));
        return;
    }
    
    // ============================================================
    // 2. OPÇÃO 7 - AJUDA / CONTATO
    // ============================================================
    if (message === '7') {
        const nome = state.nome || 'Cliente';
        await enviarWhatsApp(phone, `📞 *Olá ${nome.split(' ')[0]}!* Precisa de ajuda? 👇

👨‍💼 *Fale com Moisés:* wa.me/5521974601812
📧 contato@getvisa.com.br
🌐 getvisa.com.br
📋 https://app.getvisa.com.br/formulario-ds160

Digite 0 para o MENU principal`);
        return;
    }
    
    // ============================================================
    // 3. DETECTAR INTENÇÃO
    // ============================================================
    const intent = detectarIntencao(message);
    console.log('Intenção detectada:', intent);
    
    // ============================================================
    // 4. BUSCAR CLIENTE NO SUPABASE
    // ============================================================
    let clienteDB = null;
    try {
        const { data } = await supabase
            .from('clientes')
            .select('status, etapa_atual, nome, consulado')
            .eq('telefone', phone)
            .maybeSingle();
        if (data) clienteDB = data;
    } catch (e) {}
    
    const nomeCliente = clienteDB?.nome || state?.nome || 'Cliente';
    const primeiroNome = nomeCliente.split(' ')[0];
    
    // ============================================================
    // 5. TRATAMENTO DAS INTENÇÕES
    // ============================================================
    
    // 5.1 INICIAR PROCESSO / SOLICITAR DS-160
    if (intent === 'iniciar_processo' || intent === 'solicitar_ds160') {
        await enviarWhatsApp(phone, `📋 Para iniciar seu processo, preencha o formulário: https://app.getvisa.com.br/formulario-ds160`);
        return;
    }
    
    // 5.2 ANDAMENTO DO PROCESSO
    if (intent === 'andamento') {
        if (!clienteDB) {
            await enviarWhatsApp(phone, '❌ Ainda não encontrei seu cadastro. Digite 0 para o menu principal.');
            return;
        }
        
        const statusLabels = {
            'lead': '📋 Cadastro iniciado - aguardando formulário',
            'formulario_enviado': '📋 Formulário recebido - em análise',
            'em_analise': '🔍 Em análise pela equipe',
            'processo_aberto': '📌 Processo aberto - aguardando agendamento',
            'agendado_casv': '📅 CASV agendado',
            'agendado_entrevista': '🎤 Entrevista agendada',
            'treinamento_realizado': '✅ Treinamento concluído',
            'entrevista_realizada': '🎤 Entrevista realizada - aguardando decisão',
            'visto_aprovado': '🎉 Visto APROVADO!',
            'visto_recusado': '😔 Visto recusado - vamos analisar juntos',
            'passaporte_retornado': '📦 Passaporte disponível para retirada'
        };
        
        const statusAtual = clienteDB.etapa_atual || clienteDB.status || 'lead';
        const label = statusLabels[statusAtual] || statusAtual;
        
        await enviarWhatsApp(phone, `📊 *Olá ${primeiroNome}!*

📍 *Status:* ${label}
${clienteDB.consulado ? `🏛️ *Consulado:* ${clienteDB.consulado}\n` : ''}
💪 *Estamos com você!*

📱 [Fale com especialista](wa.me/5521974601812)

Digite 0 para o menu principal`);
        return;
    }
    
    // 5.3 DOCUMENTOS
    if (intent === 'documentos') {
        const resposta = getRespostaSubmenu('visto_americano', 'documentos');
        await enviarWhatsApp(phone, `📋 *Olá ${primeiroNome}!*\n\n${resposta}`);
        return;
    }
    
    // 5.4 PRAZO
    if (intent === 'prazo') {
        const resposta = getRespostaSubmenu('visto_americano', 'prazo');
        await enviarWhatsApp(phone, `⏱️ *Olá ${primeiroNome}!*\n\n${resposta}`);
        return;
    }
    
    // 5.5 PAGAMENTO
    if (intent === 'pagamento') {
        const resposta = getRespostaSubmenu('visto_americano', 'preco');
        await enviarWhatsApp(phone, `💰 *Olá ${primeiroNome}!*\n\n${resposta}`);
        return;
    }
    
    // 5.6 PROCESSO
    if (intent === 'processo') {
        const resposta = getRespostaSubmenu('visto_americano', 'processo');
        await enviarWhatsApp(phone, `🔄 *Olá ${primeiroNome}!*\n\n${resposta}`);
        return;
    }
    
    // 5.7 INDICAR AMIGO
    if (intent === 'indicar_amigo') {
        await enviarWhatsApp(phone, `👥 *Olá ${primeiroNome}!* Que legal! 🌟

📱 Compartilhe: wa.me/5521974601812
🌐 getvisa.com.br
📋 https://app.getvisa.com.br/formulario-ds160

🎁 *Bônus:* Indique um amigo que feche o processo e ganhe 10% de desconto!

Digite 0 para o menu principal`);
        return;
    }
    
    // 5.8 FALAR COM ESPECIALISTA
    if (intent === 'falar_especialista' || intent === 'ajuda') {
        await enviarWhatsApp(phone, `👨‍💼 *Olá ${primeiroNome}!*

📱 Fale com Moisés: wa.me/5521974601812
📧 contato@getvisa.com.br
⏰ Seg-Sex, 9h-18h

Digite 0 para o menu principal`);
        return;
    }
    
    // 5.9 VISTO NEGADO
    if (intent === 'visto_negado') {
        await enviarWhatsApp(phone, `🔄 *Olá ${primeiroNome}!*

Teve o visto negado? Não desanime!

🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/

✅ *Oferecemos:*
• Análise do motivo da negativa
• Correção do formulário
• Documentação reforçada
• Preparação para entrevista

💰 Investimento: R$ 380

📱 [Fale com especialista](wa.me/5521974601812)

Digite 0 para o menu principal`);
        return;
    }
    
    // ============================================================
    // 6. FALLBACK
    // ============================================================
    await enviarWhatsApp(phone, `🤔 *Olá ${primeiroNome}!*

Não entendi sua pergunta. 😅

📱 *Fale com Moisés:* wa.me/5521974601812

💡 *Dica:* Use:
• "documentos" - Lista de documentos
• "prazo" - Prazos do processo
• "status" - Andamento do seu caso
• "valores" - Investimento

Digite 0 para o menu principal`);
}

// ============================================================
// FUNÇÃO: PROCESSAR MENSAGEM (PRINCIPAL)
// ============================================================
async function processarMensagem(phone, message) {
    console.log(`📨 processarMensagem: ${phone} -> "${message}"`);
    
    const telefoneLimpo = limparTelefone(phone);
    if (!telefoneLimpo || telefoneLimpo.length < 10) {
        console.log(`⚠️ Telefone inválido: ${telefoneLimpo}`);
        return;
    }
    
    // Busca ou cria estado
    let state = userState.get(telefoneLimpo);
    if (!state) {
        state = {
            onboardingStep: 'saudacao',
            onboardingCompleto: false,
            nome: null,
            email: null,
            nivel: 'onboarding',
            service: null,
            lastActivity: Date.now()
        };
        userState.set(telefoneLimpo, state);
    }
    
    state.lastActivity = Date.now();
    userState.set(telefoneLimpo, state);
    
    const msg = message.trim();
    const msgLower = msg.toLowerCase();
    
    // Comando: menu ou 0
    if (msgLower === 'menu' || msg === '0') {
        if (state.onboardingCompleto) {
            state.nivel = 'principal';
            state.service = null;
            userState.set(telefoneLimpo, state);
            const menu = `🌟 **GETVISA - ASSESSORIA EM VISTOS**

1️⃣ - 🇺🇸 VISTO AMERICANO
2️⃣ - 🇨🇦 VISTO CANADENSE
3️⃣ - 🇦🇺 VISTO AUSTRALIANO
4️⃣ - 🇬🇧 eTA UK
5️⃣ - 🇨🇦 eTA CANADENSE
6️⃣ - 🛂 PASSAPORTE
7️⃣ - 📞 AJUDA / CONTATO

Digite o número da opção (1-7)`;
            await enviarWhatsApp(telefoneLimpo, menu);
        } else {
            state.onboardingStep = 'saudacao';
            userState.set(telefoneLimpo, state);
            await processarOnboarding(telefoneLimpo, '', state);
        }
        return;
    }
    
    // Se não completou onboarding
    if (!state.onboardingCompleto) {
        await processarOnboarding(telefoneLimpo, msg, state);
        return;
    }
    
    // Se está em um submenu
    if (state.nivel === 'submenu' && state.service) {
        await processarOpcaoNoSubmenu(telefoneLimpo, msg, state);
        return;
    }
    
    // Menu principal
    await processarOpcaoNoMenuPrincipal(telefoneLimpo, msg, state);
}

// ============================================================
// EXPORTAÇÕES (COMMONJS)
// ============================================================
module.exports = {
    userState,
    limparTelefone,
    enviarWhatsApp,
    processarMensagem,
    detectarIntencao,
    gerarRespostaBot,
    processarOnboarding,
    processarOpcaoNoMenuPrincipal,
    processarOpcaoNoSubmenu,
    getSubmenu,
    getRespostaSubmenu,
    supabase,
    ONBOARDING_STEPS,
    ETAPAS
};