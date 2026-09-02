cat > routes/webhookRoutesNew.js << 'EOF'
// routes/webhookRoutesNew.js - VERSÃO COM FUNÇÃO INTERNA
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO');

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

// ============================================================
// FUNÇÃO PARA PROCESSAR MENSAGEM (DIRETAMENTE AQUI)
// ============================================================
async function processarMensagem(phone, message) {
    console.log(`📨 Processando mensagem de ${phone}: ${message}`);
    
    try {
        // Importa o server.js para pegar as funções necessárias
        const server = require('../server.js');
        
        // Busca o estado do usuário
        let state = server.userState ? server.userState.get(phone) : null;
        
        if (!state) {
            state = {
                onboardingStep: 'saudacao',
                onboardingCompleto: false,
                nivel: 'principal',
                service: null,
                lastActivity: Date.now()
            };
            if (server.userState) {
                server.userState.set(phone, state);
            }
        }
        
        // Se o usuário está em onboarding
        if (!state.onboardingCompleto) {
            if (server.processarOnboarding) {
                await server.processarOnboarding(phone, message, state);
            } else {
                console.error('❌ processarOnboarding não encontrado');
            }
            return;
        }
        
        // Se é comando de menu (0)
        if (message === '0') {
            state.nivel = 'principal';
            state.service = null;
            state.onboardingCompleto = true;
            if (server.userState) {
                server.userState.set(phone, state);
            }
            if (server.sendReply) {
                const menu = await server.getMenuPrincipal();
                await server.sendReply(phone, menu);
            }
            return;
        }
        
        // Se está no submenu
        if (state.nivel === 'submenu' && state.service) {
            if (server.processarOpcaoNoSubmenu) {
                await server.processarOpcaoNoSubmenu(phone, message, state);
            }
            return;
        }
        
        // Menu principal
        if (server.processarOpcaoNoMenuPrincipal) {
            await server.processarOpcaoNoMenuPrincipal(phone, message, state);
        }
        
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        try {
            const server = require('../server.js');
            if (server.sendReply) {
                await server.sendReply(phone, '❌ Ocorreu um erro. Digite 0 para o menu principal.');
            }
        } catch (e) {
            console.error('❌ Erro ao enviar mensagem de erro:', e);
        }
    }
}

const messageQueue = [];

// PROCESSADOR DE FILA
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

// ROTA POST - Webhook ZAPI
router.post('/zapi', async (req, res) => {
    try {
        console.log('------------------------------------');
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
        
        // Salvar cliente no Supabase
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

// ROTA GET - Verificar status
router.get('/zapi', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Webhook ZAPI ativo',
        timestamp: new Date().toISOString(),
        fila: messageQueue.length
    });
});

// ROTA GET - Status da fila
router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

module.exports = router;
EOF