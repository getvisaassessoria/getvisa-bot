// utils/userStateManager.js

const { ONBOARDING_STEPS } = require('../config/constants');

const userState = new Map();

// Limpa estados inativos a cada minuto
setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        // Remove estados que não tiveram atividade por mais de 30 minutos
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
            console.log(`🗑️ Estado do usuário ${phone} removido por inatividade.`);
        }
    }
}, 60 * 1000); // Executa a cada 1 minuto

// Função para recuperar ou inicializar o estado de um usuário
function getUserState(phone, clienteDB = null) {
    let state = userState.get(phone);

    // Função auxiliar para validar nome (pode ser movida para helpers.js se usada em mais lugares)
    function isNomeValido(nome) {
        if (!nome) return false;
        if (typeof nome !== 'string') return false;
        if (nome === 'Cliente') return false;
        if (nome.startsWith('Cliente_')) return false;
        if (nome.trim().length < 2) return false;
        const regexNome = /^[a-zA-ZÀ-ÿ\s'-]+$/;
        if (!regexNome.test(nome.trim())) return false;
        if (/^\d+$/.test(nome.replace(/\s/g, ''))) return false;
        return true;
    }

    const onboardingCompletoNoBanco = clienteDB &&
                                      clienteDB.onboarding_completo === true &&
                                      isNomeValido(clienteDB.nome) &&
                                      clienteDB.email &&
                                      clienteDB.email.trim() !== '';

    if (!state) {
        console.log('🔄 Criando novo estado para:', phone);
        state = {
            nivel: onboardingCompletoNoBanco ? 'principal' : 'onboarding',
            service: null,
            nome: clienteDB ? clienteDB.nome : null,
            email: clienteDB ? clienteDB.email : null,
            onboardingStep: onboardingCompletoNoBanco ? ONBOARDING_STEPS.COMPLETO : ONBOARDING_STEPS.SAUDACAO,
            onboardingCompleto: onboardingCompletoNoBanco,
            lastActivity: Date.now()
        };
        userState.set(phone, state);
    } else {
        // Atualiza o estado com dados do banco se o onboarding foi completado fora da sessão atual
        if (onboardingCompletoNoBanco && !state.onboardingCompleto) {
            state.nivel = 'principal';
            state.nome = clienteDB.nome;
            state.email = clienteDB.email;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.onboardingCompleto = true;
            userState.set(phone, state);
            console.log(`✅ Estado do usuário ${phone} atualizado com onboarding completo do banco.`);
        }
    }

    // Sempre atualiza a última atividade
    state.lastActivity = Date.now();
    userState.set(phone, state);

    return state;
}

module.exports = {
    userState,
    getUserState
};