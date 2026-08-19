// routes/whatsapp.js
const express = require('express');
const router = express.Router();

// Exemplo de rota de teste para o WhatsApp
router.post('/webhook/whatsapp', (req, res) => {
    console.log('Webhook do WhatsApp recebido:', req.body);
    // Aqui virá a lógica para processar mensagens do WhatsApp
    res.status(200).send('OK');
});

// Outras rotas relacionadas ao WhatsApp podem ser adicionadas aqui

module.exports = router; // Exporta o router para ser usado no server.js