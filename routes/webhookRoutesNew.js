// routes/webhookRoutesNew.js - VERSÃO FINAL CORRIGIDA
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Define o caminho para o arquivo de log na mesma pasta do webhookRoutesNew.js
const logFilePath = path.join(__dirname, 'webhook_debug.log');

// Função auxiliar para escrever logs no arquivo
function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logFilePath, logEntry);
    } catch (error) {
        console.error(`❌ ERRO AO ESCREVER NO ARQUIVO DE LOG (${logFilePath}): ${error.message}`);
        console.error(`Conteúdo que tentou ser escrito: ${logEntry}`);
    }
}

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
        logToFile('------------------------------------');
        logToFile('📨 Requisição POST recebida no webhook Z-API!');
        logToFile(`Corpo da requisição (req.body): ${JSON.stringify(req.body, null, 2)}`);
        logToFile(`Headers da requisição (req.headers): ${JSON.stringify(req.headers, null, 2)}`);
    const { telefone, nome } = req.body;
if (!telefone || telefone.trim() === '') {
    logToFile('❌ Erro: Telefone ausente ou vazio na requisição. Retornando 400.');
    return res.status(400).send('Erro: Telefone é obrigatório e não pode ser vazio.');
}

const telefoneLimpo = limparTelefone(telefone);
logToFile(`📱 Telefone limpo: ${telefoneLimpo}`);

// --- INÍCIO DA DEPURACÃO SUPABASE ---
logToFile('🔍 Tentando buscar cliente existente no Supabase...');
const { data: clienteExistente, error: selectErrorDetails } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefone', telefoneLimpo)
    .maybeSingle();

if (selectErrorDetails) {
    logToFile(`❌ ERRO AO BUSCAR CLIENTE: ${selectErrorDetails.message}`);
    logToFile(`Detalhes do erro de busca: ${JSON.stringify(selectErrorDetails, null, 2)}`);
    // É crucial que este erro seja logado para entendermos o que está acontecendo
} else {
    logToFile(`✅ Busca de cliente concluída. Cliente existente: ${clienteExistente ? 'Sim' : 'Não'}`);
}

if (!clienteExistente) {
    logToFile('🆕 Cliente não encontrado. Preparando para criar novo cliente...');
    const novoCliente = {
        telefone: telefoneLimpo,
        nome: nome || 'Cliente',
        data_contato: new Date().toISOString(),
        status: 'novo'
    };
    logToFile(`Dados do novo cliente: ${JSON.stringify(novoCliente, null, 2)}`);

    logToFile('🚀 Tentando inserir novo cliente no Supabase...');
    const { error: insertError } = await supabase
        .from('clientes')
        .insert([novoCliente]);

    if (insertError) {
        logToFile(`❌ ERRO AO CRIAR CLIENTE: ${insertError.message}`);
        logToFile(`Detalhes do erro de inserção: ${JSON.stringify(insertError, null, 2)}`);
        // É crucial que este erro seja logado
    } else {
        logToFile('✅ Cliente criado com sucesso no Supabase!');
    }
} else {
    logToFile('✅ Cliente já existe no Supabase. Nenhuma ação de criação necessária.');
}
// --- FIM DA DEPURACÃO SUPABASE ---

res.status(200).send('OK');
} catch (error) {
    logToFile(`❌ ERRO NO BLOCO CATCH PRINCIPAL: ${error.message}`);
    logToFile(`Stack do erro: ${error.stack}`);
    res.status(500).send('Erro interno do servidor.');
}
});

module.exports = router;