// routes/webhookRoutesNew.js - VERSÃO COM botService
const express = require('express');
const router = express.Router();

// 🔥 IMPORTA DO botService (NÃO CRIA NOVO ESTADO)
const { 
    processarMensagem,
    limparTelefone,
    enviarWhatsApp,
    userState
} = require('../services/botService');

console.log('🚀 webhookRoutesNew CARREGADO (USANDO botService)');

// ============================================================
// ROTA: Webhook Z-API
// ============================================================
router.post('/zapi', async (req, res) => {
    try {
        console.log('📨 Webhook Z-API recebido!');
        console.log('📨 Headers:', req.headers);
        console.log('📨 Body:', JSON.stringify(req.body, null, 2));
        
        // 🔥 SUPORTE A MÚLTIPLOS FORMATOS
        let phone = req.body.phone || req.body.telefone || req.body.from || '';
        let messageText = req.body.text?.message || req.body.message || req.body.text || '';
        
        // Suporte ao formato Z-API v2
        if (req.body.data?.phone) {
            phone = req.body.data.phone;
        }
        if (req.body.data?.text?.message) {
            messageText = req.body.data.text.message;
        }
        
        console.log(`📱 Telefone: ${phone}`);
        console.log(`💬 Mensagem: ${messageText}`);
        
        if (!phone || !messageText) {
            console.log('⚠️ Dados incompletos, respondendo OK para não bloquear o webhook');
            return res.status(200).send('OK');
        }
        
        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        
        if (!telefoneLimpo || telefoneLimpo.length < 10) {
            console.log(`⚠️ Telefone inválido: ${telefoneLimpo}`);
            return res.status(200).send('OK');
        }
        
        // 🔥 PROCESSAR A MENSAGEM (USANDO O botService)
        await processarMensagem(telefoneLimpo, messageText.trim());
        console.log(`✅ Mensagem processada com sucesso para ${telefoneLimpo}`);
        
        // Responde OK para a Z-API
        res.status(200).send('OK');
        
    } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        console.error('❌ Stack:', error.stack);
        // SEMPRE responde 200 para a Z-API não reenviar
        res.status(200).send('OK');
    }
});

// ============================================================
// ROTA: Health Check
// ============================================================
router.get('/zapi', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Webhook ZAPI ativo (com botService)',
        userStateSize: userState.size,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// ROTA: Status da Fila (Debug)
// ============================================================
router.get('/fila-status', (req, res) => {
    res.json({
        status: 'online',
        userStateSize: userState.size,
        users: Array.from(userState.keys()),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;