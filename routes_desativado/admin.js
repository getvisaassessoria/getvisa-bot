const express = require('express');
const router = express.Router();

// Rota de exemplo para o painel buscar dados
router.get('/dashboard-data', (req, res) => {
    console.log('Requisição recebida para /api/dashboard-data'); // Para ver no console do servidor
    res.json({
        message: 'Dados Detalhados do Painel Administrativo!',
        status: 'online',
        usersOnline: 25, // Aumentei o número de usuários
        newRegistrationsToday: 5, // Novo dado
        pendingTasks: 12, // Novo dado
        recentActivities: [ // Novo dado: uma lista de atividades
            { id: 1, description: 'Novo usuário registrado: João Silva', timestamp: new Date(Date.now() - 3600000).toLocaleString('pt-BR') },
            { id: 2, description: 'Tarefa "Revisar documentos" concluída', timestamp: new Date(Date.now() - 7200000).toLocaleString('pt-BR') }
        ],
        lastUpdate: new Date().toLocaleString('pt-BR')
    });
});

module.exports = router;