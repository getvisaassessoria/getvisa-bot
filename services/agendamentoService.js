// services/agendamentoService.js
const { findClientByName } = require('../repositories/clientRepository'); // Caminho corrigido
const {
    createAgendamento,
    updateAgendamento,
    deleteAgendamento,
    getAgendamentos
} = require('../repositories/agendamentoRepository'); // Caminho corrigido
const { extractTextFromPdf, parsePdfText } = require('../utils/pdfParser'); // Caminho corrigido

// Mapeamento de atividades para o ENUM do Supabase
function mapAtividadeToEnum(atividade) {
    const mapping = {
        'CASV': 'CASV',
        'ENTREVISTA': 'ENTREVISTA',
        'OUTRO': 'OUTRO'
    };
    return mapping[atividade.toUpperCase()] || 'OUTRO';
}

// Mapeamento de locais para o ENUM do Supabase
function mapLocalToEnum(local) {
    const mapping = {
        'BRASILIA': 'BRASILIA',
        'RECIFE': 'RECIFE',
        'RIO_DE_JANEIRO': 'RIO_DE_JANEIRO',
        'SAO_PAULO': 'SAO_PAULO',
        'PORTO_ALEGRE': 'PORTO_ALEGRE',
        'OUTRO': 'OUTRO'
    };
    return mapping[local.toUpperCase()] || 'OUTRO';
}

// Locais permitidos para o parser de PDF (para autocompletar)
const locaisPermitidos = ['BRASILIA', 'RECIFE', 'RIO_DE_JANEIRO', 'SAO_PAULO', 'PORTO_ALEGRE'];


/**
 * Salva agendamentos no banco de dados.
 * @param {string} clientePrincipal - Nome do cliente principal.
 * @param {string[]} acompanhantes - Array de nomes dos acompanhantes.
 * @param {string} localPadrao - Local padrão para os agendamentos.
 * @param {Array<{tipo: string, data: string, hora: string}>} etapas - Array de objetos com tipo, data e hora.
 * @returns {Promise<object>} Objeto de resultado com sucesso e mensagem.
 */
async function saveAgendamentos(clientePrincipal, acompanhantes, localPadrao, etapas) {
    if (!clientePrincipal || !localPadrao || etapas.length === 0) {
        return { success: false, message: "Cliente Principal, Local Padrão e pelo menos uma etapa são obrigatórios." };
    }

    const nomesAcomp = acompanhantes.filter(nome => nome.trim() !== '');
    const clienteFinalDisplay = nomesAcomp.length > 0
        ? `${clientePrincipal} (+ ${nomesAcomp.join(', ')})`
        : clientePrincipal;

    // Buscar o cliente_id do cliente principal
    const clienteId = await findClientByName(clientePrincipal);

    if (!clienteId) {
        console.warn(`⚠️ Cliente '${clientePrincipal}' não encontrado na tabela 'clientes'. Agendamentos serão salvos sem vínculo direto.`);
        // Decisão: Se não encontrar o cliente_id, podemos retornar um erro ou salvar sem vínculo.
        // Por enquanto, vamos retornar um erro, pois cliente_id é NOT NULL na tabela agendamentos.
        return { success: false, message: `Cliente '${clientePrincipal}' não encontrado. Não é possível salvar agendamentos sem um cliente válido.` };
    }

    const agendamentosSalvos = [];
    for (const etapa of etapas) {
        try {
            // Garante que a data está no formato DD/MM/AAAA antes de converter
            const dataParts = etapa.data.split('/');
            if (dataParts.length !== 3) {
                console.error(`❌ Formato de data inválido para agendamento: ${etapa.data}. Esperado DD/MM/AAAA.`);
                continue;
            }
            const dataBanco = new Date(`${dataParts[2]}-${dataParts[1]}-${dataParts[0]}`); // Converte para YYYY-MM-DD para o construtor Date
            if (isNaN(dataBanco.getTime())) {
                console.error(`❌ Data inválida para agendamento: ${etapa.data}`);
                continue; // Pula este agendamento se a data for inválida
            }

            const agendamentoData = {
                cliente_id: clienteId,
                nome_cliente_display: clienteFinalDisplay,
                atividade: mapAtividadeToEnum(etapa.tipo),
                data_compromisso: dataBanco.toISOString().split('T')[0], // Formato YYYY-MM-DD
                hora_compromisso: etapa.hora, // Formato HH:MM
                local_compromisso: mapLocalToEnum(localPadrao),
                concluido: false,
                observacoes: null // Pode ser adicionado posteriormente
            };
            const novoAgendamento = await createAgendamento(agendamentoData);
            if (novoAgendamento) {
                agendamentosSalvos.push(novoAgendamento);
            }
        } catch (e) {
            console.error(`❌ Erro ao processar etapa ${etapa.tipo}:`, e.message);
        }
    }

    if (agendamentosSalvos.length === 0) {
        return { success: false, message: "Nenhum agendamento foi salvo devido a erros ou dados inválidos." };
    }

    return {
        success: true,
        message: `Foram salvos ${agendamentosSalvos.length} compromissos com sucesso!`,
        agendamentos: agendamentosSalvos
    };
}

/**
 * Processa um buffer de PDF para extrair e salvar agendamentos.
 * @param {Buffer} pdfBuffer - O buffer do arquivo PDF.
 * @returns {Promise<object>} Objeto de resultado com sucesso e mensagem.
 */
async function processAndSavePdfAgendamentos(pdfBuffer) {
    try {
        const textoCompleto = await extractTextFromPdf(pdfBuffer);
        const { clientePrincipal, acompanhantes, etapas, localPadrao } = parsePdfText(textoCompleto, locaisPermitidos);

        if (!clientePrincipal || etapas.length === 0) {
            return { success: false, message: "Não foi possível extrair cliente principal ou etapas do PDF." };
        }
        if (!localPadrao) {
            console.warn("⚠️ Local padrão não foi extraído do PDF. Usando 'OUTRO' como fallback.");
            // Pode-se definir um local padrão ou pedir ao usuário para informar
            // Por enquanto, o mapLocalToEnum já trata isso.
        }

        return await saveAgendamentos(clientePrincipal, acompanhantes, localPadrao, etapas);

    } catch (error) {
        console.error('❌ Erro no processAndSavePdfAgendamentos:', error.message);
        return { success: false, message: `Erro ao processar e salvar agendamentos do PDF: ${error.message}` };
    }
}


// Funções para o relatório geral (ver_agenda)
async function getGeneralReport() {
    return getAgendamentos(); // Retorna todos os agendamentos
}

async function markAgendamentoAsConcluido(id) {
    return updateAgendamento(id, { concluido: true });
}

async function updateAgendamentoDetails(id, newData, newHora, newLocal) {
    // Garante que a data está no formato DD/MM/AAAA antes de converter
    const dataParts = newData.split('/');
    if (dataParts.length !== 3) {
        return { success: false, message: "Formato de data inválido. Esperado DD/MM/AAAA." };
    }
    const dataBanco = new Date(`${dataParts[2]}-${dataParts[1]}-${dataParts[0]}`);
    if (isNaN(dataBanco.getTime())) {
        return { success: false, message: "Data inválida." };
    }
    const updated = await updateAgendamento(id, {
        data_compromisso: dataBanco.toISOString().split('T')[0],
        hora_compromisso: newHora,
        local_compromisso: mapLocalToEnum(newLocal)
    });
    return { success: !!updated, message: updated ? "Agendamento atualizado com sucesso." : "Erro ao atualizar agendamento." };
}

module.exports = {
    saveAgendamentos,
    processAndSavePdfAgendamentos, // Nova função para processar PDF
    getGeneralReport,
    markAgendamentoAsConcluido,
    updateAgendamentoDetails,
    deleteAgendamento // Re-exporta do repository
};