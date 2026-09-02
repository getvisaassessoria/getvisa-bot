// routes/webhookRoutesNew.js - VERSÃO COMPLETA COM GET
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO (COM setInterval e GET)');

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

// 🔥 PROCESSADOR DE FILA
setInterval(async () => {
    if (messageQueue.length === 0) return;
    
    try {
        // Importação dinâmica para evitar erro de inicialização
        const server = require('../server.js');
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
                await processarMensagem(item.phone, item.message);
                console.log('✅ processarMensagem finalizada para', item.phone);
            } catch (error) {
                console.error(`❌ Erro ao processar mensagem:`, error);
            }
        }
    } catch (error) {
        console.error('❌ Erro no processador de fila:', error);
    }
}, 3000);

// ============================================================
// ROTA POST - Webhook ZAPI (recebe mensagens)
// ============================================================
router.post('/zapi', async (req, res) => {
    try {
        console.log('------------------------------------');
        console.log('📨 Webhook Z-API recebido!');
        
        const phone = req.body.phone || req.body.telefone || req.body.from || '';
        const messageText = req.body.text?.message || req.body.message || req.body.text || '';
        
        console.log(`📱 Telefone: ${phone}`);
        console.log(`💬 Mensagem: ${messageText}`);
        
        if (!phone || !messageText) {
            console.log('⚠️ Dados incompletos');
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        
        // Salvar ou atualizar cliente no Supabase
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

        // Adicionar à fila de processamento
        messageQueue.push({
            phone: telefoneLimpo,
            message: messageText,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📥 Mensagem adicionada à fila. Total: ${messageQueue.length}`);

        // Responde OK para o ZAPI
        res.status(200).send('OK');

    } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// ============================================================
// ROTA GET - Verificar se o webhook está ativo
// ============================================================
router.get('/zapi', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Webhook ZAPI ativo',
        timestamp: new Date().toISOString(),
        fila: messageQueue.length
    });
});

// ============================================================
// ROTA GET - Status da fila de mensagens
// ============================================================
router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

// ============================================================
// EXPORTAR O ROUTER
// ============================================================
module.exports = router;