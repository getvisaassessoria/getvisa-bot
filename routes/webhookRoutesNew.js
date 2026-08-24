// routes/webhookRoutesNew.js - VERSÃO CORRIGIDA PARA Z-API
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

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

// Fila de mensagens para processamento assíncrono
const messageQueue = [];

// Função para processar mensagens da fila
async function processMessageQueue() {
    if (messageQueue.length === 0) return;
    
    console.log(`🔄 Processando fila: ${messageQueue.length} mensagens`);
    
    while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        try {
            console.log(`📨 Processando mensagem de ${item.phone}: ${item.message}`);
            // Aqui você pode adicionar a lógica de processamento do bot
            // Por enquanto, apenas logamos
        } catch (error) {
            console.error(`❌ Erro ao processar mensagem:`, error);
        }
    }
}

// Processar fila a cada 5 segundos
setInterval(processMessageQueue, 5000);

// Rota principal do webhook
router.post('/zapi', async (req, res) => {
    try {
        console.log('------------------------------------');
        console.log('📨 Webhook Z-API recebido!');
        console.log('📨 Body:', JSON.stringify(req.body, null, 2));
        
        // Extrair dados do formato Z-API
        const phone = req.body.phone || req.body.telefone || req.body.from || '';
        const messageText = req.body.text?.message || req.body.message || req.body.text || '';
        
        console.log(`📱 Telefone extraído: ${phone}`);
        console.log(`💬 Mensagem extraída: ${messageText}`);
        
        if (!phone || phone.trim() === '') {
            console.error('❌ Telefone ausente');
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        }

        if (!messageText || messageText.trim() === '') {
            console.error('❌ Mensagem ausente');
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        
        // Buscar ou criar cliente
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
                console.log('✅ Cliente criado com sucesso!');
            } else {
                console.log('✅ Cliente já existe.');
            }
        } catch (dbError) {
            console.error('❌ Erro ao acessar banco de dados:', dbError);
            // Continua mesmo com erro no banco
        }

        // Adicionar à fila para processamento
        messageQueue.push({
            phone: telefoneLimpo,
            message: messageText,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📥 Mensagem adicionada à fila. Total: ${messageQueue.length}`);

        // Responder imediatamente para a Z-API
        res.status(200).send('OK');

    } catch (error) {
        console.error(`❌ ERRO NO WEBHOOK: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Rota para status da fila (debug)
router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

// Exportar o router e a fila
module.exports = router;
module.exports.messageQueue = messageQueue;