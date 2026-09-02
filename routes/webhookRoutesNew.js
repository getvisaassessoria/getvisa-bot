// routes/webhookRoutesNew.js - VERSÃO COMPLETA
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO (VERSÃO COMPLETA)');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

function limparTelefone(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
}

const messageQueue = [];

async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;
        
        if (!instance || !token) {
            console.error('❌ Z-API não configurada');
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

const userState = new Map();

async function processarMensagem(phone, message) {
    console.log(`📨 Processando mensagem de ${phone}: ${message}`);
    
    const msgLimpa = message.trim();
    const msgNumero = parseInt(msgLimpa);
    const isNumero = !isNaN(msgNumero) && msgNumero >= 0 && msgNumero <= 9;
    
    try {
        let state = userState.get(phone);
        
        if (!state) {
            state = {
                onboardingStep: 'saudacao',
                onboardingCompleto: false,
                nome: null,
                email: null,
                nivel: 'onboarding',
                lastActivity: Date.now()
            };
            userState.set(phone, state);
        }
        
        // ONBOARDING
        if (!state.onboardingCompleto && state.onboardingStep === 'saudacao') {
            const mensagem = `👋 Olá! Seja bem-vindo(a) à GetVisa Assessoria! 🇺🇸

Somos especialistas em vistos americanos e estamos aqui para realizar seu sonho de viajar para os EUA! ✈️

Para começarmos, preciso saber:

📝 **Qual é o seu nome completo?**

Ex: Maria Silva

Digite 0 a qualquer momento para ver o menu principal.`;
            await enviarWhatsApp(phone, mensagem);
            state.onboardingStep = 'aguardando_nome';
            userState.set(phone, state);
            return;
        }
        
        if (!state.onboardingCompleto && state.onboardingStep === 'aguardando_nome') {
            if (isNumero && msgNumero === 0) {
                state.onboardingCompleto = true;
                state.nivel = 'principal';
                userState.set(phone, state);
                const mensagem = `🌟 **GETVISA - ASSESSORIA EM VISTOS**\n\n1️⃣ - 🇺🇸 VISTO AMERICANO\n2️⃣ - 🇨🇦 VISTO CANADENSE\n3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n5️⃣ - 🇨🇦 eTA CANADENSE\n6️⃣ - 🛂 PASSAPORTE\n7️⃣ - 📞 AJUDA / CONTATO\n\nDigite o número da opção (1-7)`;
                await enviarWhatsApp(phone, mensagem);
                return;
            }
            
            if (msgLimpa && msgLimpa.length > 2 && !isNumero) {
                state.nome = msgLimpa;
                state.onboardingStep = 'aguardando_email';
                userState.set(phone, state);
                const mensagem = `😊 Prazer, ${state.nome}! Agora me diga:\n\n📧 **Qual é o seu e-mail?**\n\nEx: maria@email.com`;
                await enviarWhatsApp(phone, mensagem);
                return;
            } else {
                const mensagem = `❌ Por favor, digite um nome válido.\n\n📝 Ex: Maria Silva`;
                await enviarWhatsApp(phone, mensagem);
                return;
            }
        }
        
        if (!state.onboardingCompleto && state.onboardingStep === 'aguardando_email') {
            if (isNumero && msgNumero === 0) {
                state.onboardingCompleto = true;
                state.nivel = 'principal';
                userState.set(phone, state);
                const mensagem = `🌟 **GETVISA - ASSESSORIA EM VISTOS**\n\n1️⃣ - 🇺🇸 VISTO AMERICANO\n2️⃣ - 🇨🇦 VISTO CANADENSE\n3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n5️⃣ - 🇨🇦 eTA CANADENSE\n6️⃣ - 🛂 PASSAPORTE\n7️⃣ - 📞 AJUDA / CONTATO\n\nDigite o número da opção (1-7)`;
                await enviarWhatsApp(phone, mensagem);
                return;
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(msgLimpa)) {
                state.email = msgLimpa;
                state.onboardingCompleto = true;
                state.nivel = 'principal';
                userState.set(phone, state);
                const mensagem = `✅ Perfeito, ${state.nome}! Seus dados foram salvos com sucesso!\n\nAgora escolha o serviço desejado:\n\n🌟 **GETVISA - ASSESSORIA EM VISTOS**\n\n1️⃣ - 🇺🇸 VISTO AMERICANO\n2️⃣ - 🇨🇦 VISTO CANADENSE\n3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n5️⃣ - 🇨🇦 eTA CANADENSE\n6️⃣ - 🛂 PASSAPORTE\n7️⃣ - 📞 AJUDA / CONTATO\n\nDigite o número da opção (1-7)`;
                await enviarWhatsApp(phone, mensagem);
                return;
            } else {
                const mensagem = `❌ E-mail inválido! Digite um e-mail válido.\n\n📧 Ex: maria@email.com`;
                await enviarWhatsApp(phone, mensagem);
                return;
            }
        }
        
        // MENU PRINCIPAL
        if (state.onboardingCompleto) {
            if (isNumero && msgNumero === 0) {
                const mensagem = `🌟 **GETVISA - ASSESSORIA EM VISTOS**\n\n1️⃣ - 🇺🇸 VISTO AMERICANO\n2️⃣ - 🇨🇦 VISTO CANADENSE\n3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n5️⃣ - 🇨🇦 eTA CANADENSE\n6️⃣ - 🛂 PASSAPORTE\n7️⃣ - 📞 AJUDA / CONTATO\n\nDigite o número da opção (1-7)`;
                await enviarWhatsApp(phone, mensagem);
                return;
            }
            
            const opcoes = {
                '1': '🇺🇸 VISTO AMERICANO\n\n💰 Preço: R$ 350,00\n📋 Inclui: Preenchimento DS-160, agendamento, preparação para entrevista.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '2': '🇨🇦 VISTO CANADENSE\n\n💰 Preço: R$ 400,00\n📋 Inclui: Aplicação online, biometria, preparação de documentos.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '3': '🇦🇺 VISTO AUSTRALIANO\n\n💰 Preço: R$ 450,00\n📋 Inclui: Análise de perfil, aplicação online, documentação.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '4': '🇬🇧 eTA UK\n\n💰 Preço: R$ 150,00\n📋 Inclui: Aplicação online, validação, acompanhamento.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '5': '🇨🇦 eTA CANADENSE\n\n💰 Preço: R$ 100,00\n📋 Inclui: Aplicação online rápida, validação.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '6': '🛂 PASSAPORTE\n\n💰 Preço: R$ 150,00\n📋 Inclui: Agendamento, orientação, acompanhamento.\n📱 Pagamento: PIX ou cartão de crédito.\n\nDigite 0 para voltar ao menu.',
                '7': '📞 AJUDA / CONTATO\n\n📱 WhatsApp: wa.me/5521974601812\n📧 E-mail: contato@getvisa.com.br\n🌐 Site: getvisa.com.br\n\nDigite 0 para voltar ao menu.'
            };
            
            if (opcoes[msgLimpa]) {
                await enviarWhatsApp(phone, opcoes[msgLimpa]);
                return;
            }
            
            // INTENÇÕES POR PALAVRAS-CHAVE
            const msgLower = msgLimpa.toLowerCase();
            
            if (msgLower.includes('visto americano') || msgLower.includes('eua') || msgLower.includes('usa')) {
                await enviarWhatsApp(phone, opcoes['1']);
                return;
            }
            if (msgLower.includes('visto canadense') || msgLower.includes('canada')) {
                await enviarWhatsApp(phone, opcoes['2']);
                return;
            }
            if (msgLower.includes('visto australiano') || msgLower.includes('australia')) {
                await enviarWhatsApp(phone, opcoes['3']);
                return;
            }
            if (msgLower.includes('eta uk') || msgLower.includes('reino unido') || msgLower.includes('inglaterra')) {
                await enviarWhatsApp(phone, opcoes['4']);
                return;
            }
            if (msgLower.includes('eta canadense')) {
                await enviarWhatsApp(phone, opcoes['5']);
                return;
            }
            if (msgLower.includes('passaporte')) {
                await enviarWhatsApp(phone, opcoes['6']);
                return;
            }
            if (msgLower.includes('ajuda') || msgLower.includes('contato') || msgLower.includes('especialista')) {
                await enviarWhatsApp(phone, opcoes['7']);
                return;
            }
            
            const mensagem = `🤔 Não entendi. Digite 0 para o menu principal.

Opções disponíveis:
1️⃣ - VISTO AMERICANO
2️⃣ - VISTO CANADENSE
3️⃣ - VISTO AUSTRALIANO
4️⃣ - eTA UK
5️⃣ - eTA CANADENSE
6️⃣ - PASSAPORTE
7️⃣ - AJUDA / CONTATO`;
            await enviarWhatsApp(phone, mensagem);
        }
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        await enviarWhatsApp(phone, '❌ Ocorreu um erro. Digite 0 para o menu principal.');
    }
}

setInterval(async () => {
    if (messageQueue.length === 0) return;
    console.log(`🔄 Processando fila: ${messageQueue.length} mensagens`);
    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        try {
            console.log(`📨 Processando mensagem de ${item.phone}: ${item.message}`);
            await processarMensagem(item.phone, item.message);
            console.log('✅ Mensagem processada para', item.phone);
        } catch (error) {
            console.error(`❌ Erro ao processar mensagem:`, error.message);
        }
    }
}, 3000);

router.post('/zapi', async (req, res) => {
    try {
        console.log('📨 Webhook Z-API recebido!');
        const phone = req.body.phone || req.body.telefone || req.body.from || '';
        const messageText = req.body.text?.message || req.body.message || req.body.text || '';
        console.log(`📱 Telefone: ${phone}`);
        console.log(`💬 Mensagem: ${messageText}`);
        if (!phone || !messageText) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }
        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        try {
            const { data: clienteExistente } = await supabase
                .from('clientes')
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            if (!clienteExistente) {
                console.log('🆕 Criando novo cliente...');
                await supabase
                    .from('clientes')
                    .insert([{
                        telefone: telefoneLimpo,
                        nome: 'Cliente',
                        data_contato: new Date().toISOString(),
                        status: 'novo',
                        onboarding_completo: false
                    }]);
                console.log('✅ Cliente criado!');
            } else {
                console.log('✅ Cliente já existe.');
            }
        } catch (dbError) {
            console.error('❌ Erro no banco:', dbError);
        }
        messageQueue.push({
            phone: telefoneLimpo,
            message: messageText,
            timestamp: new Date().toISOString()
        });
        console.log(`📥 Mensagem adicionada à fila. Total: ${messageQueue.length}`);
        res.status(200).send('OK');
    } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/zapi', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Webhook ZAPI ativo',
        timestamp: new Date().toISOString(),
        fila: messageQueue.length
    });
});

router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

module.exports = router;
