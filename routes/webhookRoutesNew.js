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
        logToFile('WEBHOOK DEBUG (Z-API) - Este já estava lá');

        const { telefone, nome } = req.body;

        // Validação ajustada: verifica se o telefone está presente e não está vazio
        if (!telefone || telefone.trim() === '') {
            logToFile('❌ Erro: Telefone ausente ou vazio na requisição. Ignorando.');
            return res.status(400).send('Erro: Telefone é obrigatório e não pode ser vazio.');
        }

        const telefoneLimpo = limparTelefone(telefone);
        logToFile(`📱 Telefone limpo: ${telefoneLimpo}`);

        // Verifica se o cliente já existe
        const { data: clienteExistente, error: selectErrorDetails } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (selectErrorDetails) {
            logToFile(`❌ Erro ao buscar cliente existente: ${selectErrorDetails.message}`);
            // Não retorne um erro 500 aqui, apenas logue e continue, ou trate de forma mais robusta
        }

        if (!clienteExistente) {
            logToFile('🆕 Criando novo cliente...');

            const novoCliente = {
                telefone: telefoneLimpo,
                nome: nome || 'Cliente',
                data_contato: new Date().toISOString(),
                // origem: 'whatsapp', // Mantenha esta linha comentada se a coluna 'origem' não existe no seu DB
                status: 'novo'
            };

            const { error: insertError } = await supabase
                .from('clientes')
                .insert([novoCliente]);

            if (insertError) {
                logToFile(`❌ Erro ao criar: ${insertError.message}`);
            } else {
                logToFile('✅ Cliente criado!');
            }
        } else {
            logToFile('✅ Cliente já existe');
        }

        res.status(200).send('OK');

    } catch (error) {
        logToFile(`❌ ERRO NO BLOCO CATCH: ${error.message}`);
        logToFile(`Stack do erro: ${error.stack}`);
        res.status(500).send('Erro interno do servidor.');
    }
});

module.exports = router;