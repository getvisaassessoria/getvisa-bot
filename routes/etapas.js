// routes/forms.js
const express = require('express');
const router = express.Router();

// Exemplo de rota de teste para formulários
router.post('/webhook/form-ds160', (req, res) => {
    console.log('Webhook do Formulário DS-160 recebido:', req.body);
    // Aqui virá a lógica para processar os dados do formulário
    res.status(200).send('Formulário recebido com sucesso!');
});

module.exports = router;