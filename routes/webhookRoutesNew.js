// routes/webhookRoutesNew.js - VERSÃO FINAL CORRIGIDA (com console.log)
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
// const fs = require('fs'); // REMOVER
// const path = require('path'); // REMOVER

// REMOVER A FUNÇÃO logToFile INTEIRA
// const logFilePath = path.join(__dirname, 'webhook_debug.log');
// function logToFile(message) { ... }

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

function limparTelefone(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
}

router.post('/zapi', async (req, res) => {
    try {
        console.log('------------------------------------'); // MUDAR AQUI
        console.log('📨 Requisição POST recebida no webhook Z-API!'); // MUDAR AQUI
        console.log(`Corpo da requisição (req.body): ${JSON.stringify(req.body, null, 2)}`); // MUDAR AQUI
        console.log(`Headers da requisição (req.headers): ${JSON.stringify(req.headers, null, 2)}`); // MUDAR AQUI
    const { telefone, nome } = req.body;

    if (!telefone || telefone.trim() === '') {
        console.error('❌ Erro: Telefone ausente ou vazio na requisição. Retornando 400.'); // MUDAR AQUI
        return res.status(400).send('Erro: Telefone é obrigatório e não pode ser vazio.');
    }

    const telefoneLimpo = limparTelefone(telefone);
    console.log(`📱 Telefone limpo: ${telefoneLimpo}`); // MUDAR AQUI

    console.log('🔍 Tentando buscar cliente existente no Supabase...'); // MUDAR AQUI
    const { data: clienteExistente, error: selectErrorDetails } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefone', telefoneLimpo)
        .maybeSingle();

    if (selectErrorDetails) {
        console.error(`❌ ERRO AO BUSCAR CLIENTE: ${selectErrorDetails.message}`); // MUDAR AQUI
        console.error(`Detalhes do erro de busca: ${JSON.stringify(selectErrorDetails, null, 2)}`); // MUDAR AQUI
    } else {
        console.log(`✅ Busca de cliente concluída. Cliente existente: ${clienteExistente ? 'Sim' : 'Não'}`); // MUDAR AQUI
    }

    if (!clienteExistente) {
        console.log('🆕 Cliente não encontrado. Preparando para criar novo cliente...'); // MUDAR AQUI
        const novoCliente = {
            telefone: telefoneLimpo,
            nome: nome || 'Cliente',
            data_contato: new Date().toISOString(),
            status: 'novo'
        };
        console.log(`Dados do novo cliente: ${JSON.stringify(novoCliente, null, 2)}`); // MUDAR AQUI

        console.log('🚀 Tentando inserir novo cliente no Supabase...'); // MUDAR AQUI
        const { error: insertError } = await supabase
            .from('clientes')
            .insert([novoCliente]);

        if (insertError) {
            console.error(`❌ ERRO AO CRIAR CLIENTE: ${insertError.message}`); // MUDAR AQUI
            console.error(`Detalhes do erro de inserção: ${JSON.stringify(insertError, null, 2)}`); // MUDAR AQUI
        } else {
            console.log('✅ Cliente criado com sucesso no Supabase!'); // MUDAR AQUI
        }
    } else {
        console.log('✅ Cliente já existe no Supabase. Nenhuma ação de criação necessária.'); // MUDAR AQUI
    }

    res.status(200).send('OK');

} catch (error) {
    console.error(`❌ ERRO NO BLOCO CATCH PRINCIPAL: ${error.message}`); // MUDAR AQUI
    console.error(`Stack do erro: ${error.stack}`); // MUDAR AQUI
    res.status(500).send('Erro interno do servidor.');
}
});

module.exports = router;