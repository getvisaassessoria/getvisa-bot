cat > routes/webhookRoutesNew.js << 'EOF'
// routes/webhookRoutesNew.js - VERSÃO CORRIGIDA
const express = require('express');
const router = express.Router();

console.log('🚀 webhookRoutesNew CARREGADO');

// ============================================================
// ROTA: Webhook Z-API
// ============================================================
router.post('/zapi', async (req, res) => {
    try {
        console.log('📨 Webhook Z-API recebido!');
        console.log('📨 Body:', JSON.stringify(req.body, null, 2));
        
        // 🔥 IMPORTA DENTRO DA FUNÇÃO (EVITA DEPENDÊNCIA CIRCULAR)
        const { 
            processarMensagem,
            limparTelefone
        } = require('../server.js');
        
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
            console.log('⚠️ Dados incompletos, respondendo OK');
            return res.status(200).send('OK');
        }
        
        const telefoneLimpo = limparTelefone(phone);
        console.log(`📱 Telefone limpo: ${telefoneLimpo}`);
        
        if (!telefoneLimpo || telefoneLimpo.length < 10) {
            console.log(`⚠️ Telefone inválido: ${telefoneLimpo}`);
            return res.status(200).send('OK');
        }
        
        // 🔥 CHAMA A FUNÇÃO DO SERVER.JS
        await processarMensagem(telefoneLimpo, messageText.trim());
        console.log(`✅ Mensagem processada com sucesso para ${telefoneLimpo}`);
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        console.error('❌ Stack:', error.stack);
        res.status(200).send('OK');
    }
});

// ============================================================
// ROTA: Health Check
// ============================================================
router.get('/zapi', (req, res) => {
    let userStateSize = 0;
    try {
        const { userState } = require('../server.js');
        userStateSize = userState ? userState.size : 0;
    } catch (e) {}
    
    res.status(200).json({ 
        status: 'online', 
        message: 'Webhook ZAPI ativo',
        userStateSize: userStateSize,
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// ROTA: Status (Debug)
// ============================================================
router.get('/fila-status', (req, res) => {
    let userStateSize = 0;
    let users = [];
    try {
        const { userState } = require('../server.js');
        userStateSize = userState ? userState.size : 0;
        users = userState ? Array.from(userState.keys()) : [];
    } catch (e) {}
    
    res.json({
        status: 'online',
        userStateSize: userStateSize,
        users: users,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
EOF