// routes/webhookRoutesNew.js - VERSÃO CORRIGIDA (SEM IMPORTAR SERVER.JS)
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

console.log('🚀 webhookRoutesNew CARREGADO (VERSÃO CORRIGIDA)');

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

// 🔥 FILA DE MENSAGENS - EXPORTADA
const messageQueue = [];

// 🔥 REMOVER O setInterval DAQUI - O SERVER.JS VAI PROCESSAR A FILA

router.post('/zapi', async (req, res) => {
    try {
        console.log('------------------------------------');
        console.log('📨 Webhook Z-API recebido!');
        console.log('📨 Body:', JSON.stringify(req.body, null, 2));
        
        const phone = req.body.phone || req.body.telefone || req.body.from || '';
        const messageText = req.body.text?.message || req.body.message || req.body.text || '';
        
        console.log(`📱 Telefone: ${phone}`);
        console.log(`💬 Mensagem: ${messageText}`);
        
        if (!phone || !messageText) {
            console.error('❌ Dados incompletos');
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

        // 🔥 ADICIONAR À FILA
        messageQueue.push({
            phone: telefoneLimpo,
            message: messageText,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📥 Mensagem adicionada à fila. Total: ${messageQueue.length}`);

        res.status(200).send('OK');

    } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/fila-status', (req, res) => {
    res.json({
        total: messageQueue.length,
        fila: messageQueue
    });
});

// 🔥 EXPORTAR A FILA JUNTO COM O ROUTER
module.exports = { router, messageQueue };