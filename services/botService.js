// services/botService.js - VERSÃO ENXUTA

console.log('🤖 botService CARREGADO (VERSÃO ENXUTA)');

// 🔥 IMPORTA DO SERVER.JS
const server = require('../server.js');

module.exports = {
    userState: server.userState,
    limparTelefone: server.limparTelefone,
    enviarWhatsApp: server.enviarWhatsApp,
    processarMensagem: server.processarMensagem,
    detectarIntencao: server.detectarIntencao,
    gerarRespostaBot: server.gerarRespostaBot,
    processarOnboarding: server.processarOnboarding,
    processarOpcaoNoMenuPrincipal: server.processarOpcaoNoMenuPrincipal,
    processarOpcaoNoSubmenu: server.processarOpcaoNoSubmenu,
    getSubmenu: server.getSubmenu,
    getRespostaSubmenu: server.getRespostaSubmenu,
    supabase: server.supabase,
    ONBOARDING_STEPS: server.ONBOARDING_STEPS,
    ETAPAS: server.ETAPAS
};