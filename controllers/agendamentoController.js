// controllers/agendamentoController.js
const agendamentoService = require('../services/agendamentoService'); // Caminho corrigido
const { Buffer } = require('buffer'); // Para lidar com Base64

/**
 * Rota para upload de PDF e processamento de agendamentos.
 * Espera um JSON com { pdfBase64: "..." }
 */
async function uploadPdf(req, res) {
    const { pdfBase64 } = req.body;

    if (!pdfBase64) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo PDF em Base64 foi fornecido.' });
    }

    try {
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const resultado = await agendamentoService.processAndSavePdfAgendamentos(pdfBuffer);

        if (resultado.success) {
            return res.status(200).json(resultado);
        } else {
            return res.status(400).json(resultado);
        }
    } catch (error) {
        console.error('❌ Erro no controlador uploadPdf:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao processar PDF.', error: error.message });
    }
}

/**
 * Rota para salvar agendamentos manualmente.
 * Espera um JSON com { clientePrincipal, acompanhantes, localPadrao, etapas }
 */
async function saveManualAgendamentos(req, res) {
    const { clientePrincipal, acompanhantes, localPadrao, etapas } = req.body;

    if (!clientePrincipal || !localPadrao || !etapas || etapas.length === 0) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para salvar agendamentos manualmente.' });
    }

    try {
        const resultado = await agendamentoService.saveAgendamentos(clientePrincipal, acompanhantes || [], localPadrao, etapas);
        if (resultado.success) {
            return res.status(201).json(resultado);
        } else {
            return res.status(400).json(resultado);
        }
    } catch (error) {
        console.error('❌ Erro no controlador saveManualAgendamentos:', error);
        return res.status(500).json({ success: false, message: 'Erro interno do servidor ao salvar agendamentos manualmente.', error: error.message });
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