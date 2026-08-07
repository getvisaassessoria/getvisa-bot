// services/onboardingService.js
const { ONBOARDING_STEPS, BOAS_VINDAS_MESSAGES } = require('../config/constants');
const { getRandomMessage, validarNome, formatarNome } = require('../utils/helpers');
const { sendReply } = require('../utils/whatsappClient');
const { userState } = require('../utils/userStateManager'); // Importa userState diretamente
const { cadastrarCliente } = require('./dbService'); // Importa a função de DB

async function processarOnboarding(cleanPhone, messageText, state) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: "' + messageText + '"');

    const telefoneLimpo = cleanPhone.toString().replace(/\D/g, '');
    console.log('📱 Telefone limpo para uso:', telefoneLimpo);

    // Comandos de escape
    const escapeCommands = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (escapeCommands.includes(messageText.toLowerCase().trim())) {
        await sendReply(cleanPhone, '👋 Antes de continuar, preciso saber seu nome para te atender melhor!\n\n' +
            '📝 **Qual é o seu nome completo?**\n\nEx: Maria Silva');
        return;
    }

    switch (state.onboardingStep) {
        // ============================================================
        // PASSO 1: SAUDAÇÃO - APRESENTAR A GETVISA
        // ============================================================
        case ONBOARDING_STEPS.SAUDACAO:
            console.log('📌 PASSO 1: SAUDAÇÃO');
            const saudacao = getRandomMessage(BOAS_VINDAS_MESSAGES.primeira_saudacao);
            const pedirNome = getRandomMessage(BOAS_VINDAS_MESSAGES.solicitar_nome);

            await sendReply(cleanPhone, saudacao + '\n\n' + pedirNome);

            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_NOME;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: AGUARDANDO_NOME');
            break;

        // ============================================================
        // PASSO 2: AGUARDANDO NOME - VALIDAR E SALVAR
        // ============================================================
        case ONBOARDING_STEPS.AGUARDANDO_NOME:
            console.log('📌 PASSO 2: AGUARDANDO NOME');
            console.log('📝 Nome recebido: "' + messageText + '"');

            const nomeValidado = validarNome(messageText);
            console.log('✅ Nome válido?', nomeValidado);

            if (!nomeValidado) {
                const msgInvalido = getRandomMessage(BOAS_VINDAS_MESSAGES.nome_invalido);
                await sendReply(cleanPhone, msgInvalido);
                return;
            }

            const nomeFormatado = formatarNome(messageText);
            console.log('📝 Nome formatado: "' + nomeFormatado + '"');

            // 🔥 SALVAR NOME COM UPSERT
            try {
                const { dados, error } = await cadastrarCliente(telefoneLimpo, nomeFormatado); // Usando dbService

                if (error) { // cadastrarCliente já loga o erro, aqui só tratamos o retorno
                    console.error('❌ Erro ao salvar nome via dbService:', error);
                    await sendReply(cleanPhone, '❌ Erro ao salvar seu nome. Tente novamente.');
                    return;
                }
                console.log('✅ Nome salvo no Supabase:', nomeFormatado);
            } catch (err) {
                console.error('❌ Erro ao salvar nome (exceção):', err);
                await sendReply(cleanPhone, '❌ Erro ao salvar. Tente novamente.');
                return;
            }

            // ATUALIZAR ESTADO
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_EMAIL;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: AGUARDANDO_EMAIL');

            // ENVIAR MENSAGEM PEDINDO E-MAIL
            const parte1 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1);
            const parte2 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2);
            const mensagemEmail = parte1 + nomeFormatado.split(' ')[0] + parte2;

            await sendReply(cleanPhone, mensagemEmail);
            console.log('📧 Mensagem de email enviada');
            break;

        // ============================================================
        // PASSO 3: AGUARDANDO E-MAIL - VALIDAR E FINALIZAR
        // ============================================================
        case ONBOARDING_STEPS.AGUARDANDO_EMAIL:
            console.log('📌 PASSO 3: AGUARDANDO EMAIL');
            console.log('📧 Email recebido: "' + messageText + '"');

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(messageText)) {
                console.log('❌ Email inválido');
                await sendReply(cleanPhone, '❌ E-mail inválido! Por favor, digite um e-mail válido.\n\n📧 Ex: maria@email.com');
                return;
            }

            const email = messageText.trim().toLowerCase();
            const nome = state.nome;
            console.log('📧 Email válido:', email);
            console.log('👤 Nome associado:', nome);

            // 🔥 SALVAR E-MAIL E COMPLETAR ONBOARDING - USAR UPSERT
            try {
                const { data, error } = await supabase // Usando supabase diretamente para o update específico
                    .from('clientes_novos')
                    .upsert({
                        telefone: telefoneLimpo,
                        nome: nome,
                        email: email,
                        data_contato: new Date().toISOString(),
                        status: 'novo',
                        onboarding_completo: true,
                        data_onboarding: new Date().toISOString(),
                       // updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'telefone'
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Erro ao salvar e-mail:', error);
                    await sendReply(cleanPhone, '❌ Erro ao salvar seu e-mail. Tente novamente.');
                    return;
                }
                console.log('✅ E-mail salvo no Supabase:', email);
                console.log('✅ Onboarding completo para:', nome);
            } catch (err) {
                console.error('❌ Erro ao salvar e-mail:', err);
                await sendReply(cleanPhone, '❌ Erro ao salvar. Tente novamente.');
                return;
            }

            // ATUALIZAR ESTADO - ONBOARDING COMPLETO
            state.email = email;
            state.onboardingCompleto = true;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: COMPLETO');

            // ENVIAR MENSAGEM DE CONFIRMAÇÃO COM MENU PRINCIPAL
            const primeiroNome = nome.split(' ')[0];
            const { getMenuPrincipal } = require('./menuService'); // Importa getMenuPrincipal
            const menuPrincipalTexto = await getMenuPrincipal();

            const mensagemFinal = `✅ Perfeito, ${primeiroNome}! Seus dados foram salvos com sucesso!\n\n` +
                                 menuPrincipalTexto;

            await sendReply(cleanPhone, mensagemFinal);
            console.log('📨 Mensagem de confirmação enviada');
            break;

        // ============================================================
        // PASSO 4: COMPLETO (FALLBACK)
        // ============================================================
        case ONBOARDING_STEPS.COMPLETO:
            console.log('⚠️ Onboarding já completo, enviando menu principal');
            const { getMenuPrincipal: getMenuPrincipalCompleto } = require('./menuService');
            const menuCompleto = await getMenuPrincipalCompleto();
            await sendReply(cleanPhone, menuCompleto);
            break;

        // ============================================================
        // DEFAULT: RESETAR ONBOARDING
        // ============================================================
        default:
            console.log('⚠️ Estado de onboarding desconhecido, reiniciando');
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            state.onboardingCompleto = false;
            state.nome = null;
            state.email = null;
            state.nivel = 'onboarding';
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, messageText, state);
    }
}

module.exports = {
    processarOnboarding
};