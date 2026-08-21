// controllers/agendamentoController.js
const agendamentoService = require('../services/agendamentoService');
const { Buffer } = require('buffer'); // Para lidar com Base64

/**
 * Rota para upload de PDF e processamento de agendamentos.
 * Espera um JSON com { pdfBase64: "..." }
 */
async function uploadPdf(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo PDF enviado.' });
        }
    const pdfBuffer = req.file.buffer; // O conteúdo binário do PDF

    // CHAMA A NOVA FUNÇÃO QUE EXTRAI E SALVA
    const resultados = await agendamentoService.extractAndSavePdfAgendamentos(pdfBuffer);

    if (resultados.success) {
        // Retorna os agendamentos que foram salvos no banco de dados
        return res.status(200).json({ success: true, message: 'PDF processado e agendamentos salvos com sucesso!', agendamentosSalvos: resultados.agendamentosSalvos });
    } else {
        // Retorna a mensagem de erro do serviço
        return res.status(400).json({ success: false, message: resultados.message, error: resultados.error });
    }

} catch (error) {
    console.error('Erro no controller ao fazer upload e processar PDF:', error);
    return res.status(500).json({ success: false, message: 'Erro interno do servidor ao processar PDF.', error: error.message });
}
}



/**
 * Rota para salvar agendamentos manualmente.
 * Espera um JSON com um ARRAY de agendamentos.
 */
async function saveManualAgendamentos(req, res) {
    // Verifica se req.body é um array e se tem pelo menos um elemento
    if (!Array.isArray(req.body) || req.body.length === 0) {
        return res.status(400).json({ success: false, message: 'Requisição inválida: Esperado um array de agendamentos.' });
    }

    // Pega o primeiro agendamento do array para validação inicial
    const primeiroAgendamento = req.body[0];

    const { nomeCliente, telefoneCliente, dataCompromisso, horaCompromisso, localCompromisso, atividadeCompromisso } = primeiroAgendamento;

    if (!nomeCliente || !telefoneCliente || !dataCompromisso || !horaCompromisso || !localCompromisso || !atividadeCompromisso) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para salvar agendamentos manualmente.' });
    }

    try {
        const resultado = await agendamentoService.saveAgendamentos(req.body);

        if (resultado.success) {
            return res.status(200).json(resultado);
        } else {
            return res.status(400).json(resultado);
        }
    } catch (error) {
        console.error('❌ Erro no controlador saveManualAgendamentos:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
}

/**
 * Rota para obter o relatório geral de agendamentos.
 */
async function getAgendamentosReport(req, res) {
    try {
        const agendamentos = await agendamentoService.getGeneralReport();
        return res.status(200).json({ success: true, agendamentos });
    } catch (error) {
        console.error('❌ Erro no controlador getAgendamentosReport:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao obter relatório.' });
    }
}

/**
 * Rota para marcar um agendamento como concluído.
 */
async function markAgendamentoConcluido(req, res) {
    const { id } = req.params;

    try {
        const sucesso = await agendamentoService.markAgendamentoAsConcluido(id);
        if (sucesso) {
            return res.status(200).json({ success: true, message: 'Agendamento marcado como concluído.' });
        } else {
            return res.status(404).json({ success: false, message: 'Agendamento não encontrado ou erro ao concluir.' });
        }
    } catch (error) {
        console.error('❌ Erro no controlador markAgendamentoConcluido:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
}

/**
 * Rota para editar um agendamento.
 */
async function editAgendamento(req, res) {
    const { id } = req.params;
    const { data, hora, local } = req.body;

    if (!data || !hora || !local) {
        return res.status(400).json({ success: false, message: 'Data, hora e local são obrigatórios para edição.' });
    }

    try {
        const resultado = await agendamentoService.updateAgendamentoDetails(id, data, hora, local);
        if (resultado.success) {
            return res.status(200).json(resultado);
        } else {
            return res.status(400).json(resultado);
        }
    } catch (error) {
        console.error('❌ Erro no controlador editAgendamento:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
}

/**
 * Rota para excluir um agendamento.
 */
async function deleteAgendamento(req, res) {
    const { id } = req.params;

    try {
        const sucesso = await agendamentoService.deleteAgendamento(id);
        if (sucesso) {
            return res.status(200).json({ success: true, message: 'Agendamento excluído com sucesso.' });
        } else {
            return res.status(404).json({ success: false, message: 'Agendamento não encontrado ou erro ao excluir.' });
        }
    } catch (error) {
        console.error('❌ Erro no controlador deleteAgendamento:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
}

module.exports = {
    uploadPdf,
    saveManualAgendamentos,
    getAgendamentosReport,
    markAgendamentoConcluido,
    editAgendamento,
    deleteAgendamento
};