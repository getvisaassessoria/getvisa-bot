// routes/agendamentoRoutes.js
const express = require('express');
const agendamentoController = require('../controllers/agendamentoController'); // Caminho corrigido
const router = express.Router();

// Rota para upload de PDF e processamento de agendamentos
router.post('/upload-pdf', agendamentoController.uploadPdf);

// Rota para salvar agendamentos manualmente
router.post('/manual', agendamentoController.saveManualAgendamentos);

// Rota para obter o relatório geral de agendamentos
router.get('/', agendamentoController.getAgendamentosReport);

// Rota para marcar um agendamento como concluído
router.put('/:id/concluir', agendamentoController.markAgendamentoConcluido);

// Rota para editar um agendamento
router.put('/:id', agendamentoController.editAgendamento);

// Rota para excluir um agendamento
router.delete('/:id', agendamentoController.deleteAgendamento);

module.exports = router;