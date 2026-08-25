// routes/webhookRoutesNew.js - VERSÃO COM IMPORTAÇÃO DINÂMICA
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO (NOVA VERSÃO)');

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

setInterval(async () => {
    if (messageQueue.length === 0) return;
    
    // Importação dinâmica para evitar erro de inicialização
    const server = require('../server.js');
    console.log('🔍 server carregado:', typeof server);
    console.log('🔍 server.processarMensagem:', typeof server.processarMensagem);
    
    const processarMensagem = server.processarMensagem;
    
    if (typeof processarMensagem !== 'function') {
        console.error('❌ processarMensagem ainda não disponível');
        return;
    }

    console.log(`🔄 Processando fila: ${messageQueue.length} mensagens`);
    
    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        try {
            console.log(`📨 Processando mensagem de ${item.phone}: ${item.message}`);
            console.log('📌 Vou chamar processarMensagem agora...');
            await processarMensagem(item.phone, item.message);
            console.log('✅ processarMensagem finalizada para', item.phone);
        } catch (error) {
            console.error(`❌ Erro ao processar mensagem:`, error);
        }
    }
}, 3000);

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

router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

module.exports = router;