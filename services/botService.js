// services/botService.js - VERSÃO CORRIGIDA (CommonJS)

const { createClient } = require('@supabase/supabase-js');

// ============================================================
// CONFIGURAÇÃO INICIAL
// ============================================================
console.log('🤖 botService CARREGADO (VERSÃO CORRIGIDA)');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ============================================================
// ESTADO COMPARTILHADO
// ============================================================
const userState = new Map();

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
        desconhecida: `🤔 Não entendi. Digite "menu" para ver as opções.`
    };
    
    return respostas[intencao] || respostas.desconhecida;
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
        return;
    }
    
    if (state.onboardingStep === 'aguardando_nome') {
        if (message && message.length > 2) {
            state.nome = message;
            state.onboardingStep = 'aguardando_email';
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
            lastActivity: Date.now()
        };
        userState.set(telefoneLimpo, state);
    }
    
    state.lastActivity = Date.now();
    
    const msg = message.trim().toLowerCase();
    
    // Comando: menu ou 0
    if (msg === 'menu' || msg === '0') {
        if (state.onboardingCompleto) {
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
            await processarOnboarding(telefoneLimpo, '', state);
        }
        return;
    }
    
    // Se não completou onboarding
    if (!state.onboardingCompleto) {
        await processarOnboarding(telefoneLimpo, message, state);
        return;
    }
    
    // Menu principal - opções numéricas
    const opcoes = {
        '1': '🇺🇸 VISTO AMERICANO\n\n💰 Preço: R$ 350,00\n📋 Inclui: Preenchimento DS-160, agendamento, preparação para entrevista.\n\nDigite "menu" para voltar.',
        '2': '🇨🇦 VISTO CANADENSE\n\n💰 Preço: R$ 400,00\n📋 Inclui: Aplicação online, biometria, preparação de documentos.\n\nDigite "menu" para voltar.',
        '3': '🇦🇺 VISTO AUSTRALIANO\n\n💰 Preço: R$ 450,00\n📋 Inclui: Análise de perfil, aplicação online, documentação.\n\nDigite "menu" para voltar.',
        '4': '🇬🇧 eTA UK\n\n💰 Preço: R$ 150,00\n📋 Inclui: Aplicação online, validação, acompanhamento.\n\nDigite "menu" para voltar.',
        '5': '🇨🇦 eTA CANADENSE\n\n💰 Preço: R$ 100,00\n📋 Inclui: Aplicação online rápida, validação.\n\nDigite "menu" para voltar.',
        '6': '🛂 PASSAPORTE\n\n💰 Preço: R$ 150,00\n📋 Inclui: Agendamento, orientação, acompanhamento.\n\nDigite "menu" para voltar.',
        '7': '📞 AJUDA / CONTATO\n\n📱 WhatsApp: wa.me/5521974601812\n📧 E-mail: contato@getvisa.com.br\n🌐 Site: getvisa.com.br\n\nDigite "menu" para voltar.'
    };
    
    if (opcoes[message.trim()]) {
        await enviarWhatsApp(telefoneLimpo, opcoes[message.trim()]);
        return;
    }
    
    // Detecta intenção
    const intencao = detectarIntencao(message);
    if (intencao !== 'desconhecida') {
        const resposta = gerarRespostaBot(intencao, state.nome);
        await enviarWhatsApp(telefoneLimpo, resposta);
        return;
    }
    
    // Fallback
    await enviarWhatsApp(telefoneLimpo, `🤔 Não entendi. Digite "menu" para ver as opções disponíveis.`);
}

// ============================================================
// EXPORTAÇÕES (COMMONJS - CORRETO)
// ============================================================
module.exports = {
    userState,           // Linha 12
    limparTelefone,      // Linha 13
    enviarWhatsApp,      // Linha 14
    processarMensagem,   // Linha 15
    detectarIntencao,    // Linha 16
    gerarRespostaBot,    // Linha 17
    processarOnboarding, // Linha 18 (adicional)
    supabase             // Linha 19 (adicional)
};