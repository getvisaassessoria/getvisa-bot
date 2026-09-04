// routes/webhookRoutesNew.js - VERSÃO DEFINITIVA
const express = require('express');
const router = express.Router();

console.log('🚀 webhookRoutesNew CARREGADO');

router.post('/zapi', async (req, res) => {
    try {
        console.log('📨 Webhook Z-API recebido!');
        
        const { processarMensagem, limparTelefone } = require('../server.js');
        
        let phone = req.body.phone || req.body.from || '';
        let messageText = req.body.text?.message || req.body.message || req.body.text || '';
        
        if (req.body.data?.phone) phone = req.body.data.phone;
        if (req.body.data?.text?.message) messageText = req.body.data.text.message;
        
        console.log(`📱 Telefone: ${phone}`);
        console.log(`💬 Mensagem: ${messageText}`);
        
        if (!phone || !messageText) {
            return res.status(200).send('OK');
        }
        
        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        
        if (!telefoneLimpo || telefoneLimpo.length < 10) {
            return res.status(200).send('OK');
        }
        
        await processarMensagem(telefoneLimpo, messageText.trim());
        console.log(`✅ Mensagem processada para ${telefoneLimpo}`);
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ ERRO:', error.message);
        res.status(200).send('OK');
    }
});

router.get('/zapi', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        timestamp: new Date().toISOString()
    });
});

module.exports = router;