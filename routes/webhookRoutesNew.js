// routes/webhookRoutesNew.js - VERSÃO QUE USA O SERVER.JS
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO (USANDO SERVER.JS)');

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

// CARREGA A FUNÇÃO DO SERVER.JS
let processarMensagemOriginal = null;

try {
    // Importa o server.js
    const server = require('../server.js');
    
    // Tenta pegar a função processarMensagem
    if (server && typeof server.processarMensagem === 'function') {
        processarMensagemOriginal = server.processarMensagem;
        console.log('✅ processarMensagem carregada do server.js');
    } else {
        console.log('⚠️ processarMensagem não encontrada no server.js');
    }
} catch (error) {
    console.error('❌ Erro ao carregar server.js:', error.message);
}

// FUNÇÃO FALLBACK (se não conseguir carregar do server.js)
async function fallbackProcessarMensagem(phone, message) {
    console.log(`📨 [FALLBACK] ${phone}: ${message}`);
    
    // Função simples de resposta
    async function enviarWhatsAppSimples(telefone, mensagem) {
        try {
            const instance = process.env.ZAPI_INSTANCE;
            const token = process.env.ZAPI_TOKEN;
            
            if (!instance || !token) return false;
            
            const telefoneLimpo = telefone.toString().replace(/\D/g, '');
            const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;
            
            const response = await fetch(
                `https://api.z-api.io/instances/${instance}/token/${token}/send-text`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: telefoneFormatado,
                        message: mensagem
                    })
                }
            );
            
            return response.ok;
        } catch (error) {
            console.error('❌ Erro:', error);
            return false;
        }
    }
    
    const mensagem = `👋 Olá! Seja bem-vindo(a) à GetVisa Assessoria! 🇺🇸

Para atendimento completo, por favor, entre em contato com nosso especialista:

📱 wa.me/5521974601812

Ou acesse nosso site: getvisa.com.br`;
    
    await enviarWhatsAppSimples(phone, mensagem);
}

// FUNÇÃO PRINCIPAL - USA A ORIGINAL OU FALLBACK
async function processarMensagem(phone, message, body) {
    if (typeof processarMensagemOriginal === 'function') {
        console.log(`📨 Usando processarMensagem do server.js para ${phone}`);
        return processarMensagemOriginal(phone, message, body || {});
    } else {
        console.log(`📨 Usando fallback para ${phone}`);
        return fallbackProcessarMensagem(phone, message);
    }
}

// PROCESSADOR DE FILA
setInterval(async () => {
    if (messageQueue.length === 0) return;
    
    console.log(`🔄 Processando fila: ${messageQueue.length} mensagens`);
    
    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        try {
            console.log(`📨 Processando mensagem de ${item.phone}: ${item.message}`);
            await processarMensagem(item.phone, item.message, {});
            console.log('✅ Mensagem processada para', item.phone);
        } catch (error) {
            console.error(`❌ Erro ao processar mensagem:`, error.message);
        }
    }
}, 3000);

// ROTA POST
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

// ROTA GET
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
