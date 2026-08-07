// services/menuService.js
const { getServiceName } = require('../utils/helpers'); // Importa getServiceName
const { BOAS_VINDAS_MESSAGES } = require('../config/constants'); // Importa BOAS_VINDAS_MESSAGES

async function getMenuPrincipal() {
    return '🌟 GETVISA - ASSESSORIA EM VISTOS\n\n' +
           'Escolha o serviço desejado:\n\n' +
           '1️⃣ - 🇺🇸 VISTO AMERICANO\n' +
           '2️⃣ - 🇨🇦 VISTO CANADENSE\n' +
           '3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n' +
           '4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n' +
           '5️⃣ - 🇨🇦 eTA CANADENSE\n' +
           '6️⃣ - 🛂 PASSAPORTE\n' +
           '7️⃣ - 📞 AJUDA / CONTATO\n\n' +
           'Digite o número da opção (1-7) ou 0 para ver este MENU novamente';
}

function getSubmenu(service) {
    const names = {
        'visto_americano': '🇺🇸 VISTO AMERICANO',
        'visto_canadense': '🇨🇦 VISTO CANADENSE',
        'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
        'eta_uk': '🇬🇧 eTA UK',
        'eta_canadense': '🇨🇦 eTA CANADENSE',
        'passaporte': '🛂 PASSAPORTE'
    };

    const isPassaporte = service === 'passaporte';
    const opcao5 = isPassaporte ? '🏛️ ONDE FAZER' : '🔄 VISTO NEGADO';
    const nome = names[service] || 'SERVIÇO';

    return '📋 ' + nome + '\n\n' + 
        '1️⃣ - 💰 PREÇO\n' + 
        '2️⃣ - ⏱️ PRAZO\n' + 
        '3️⃣ - 📄 DOCUMENTOS\n' + 
        '4️⃣ - 🔄 PROCESSO\n' + 
        '5️⃣ - ' + opcao5 + '\n' +
        '6️⃣ - 📊 AVALIAÇÃO GRATUITA\n' + 
        '7️⃣ - 👨‍💼 FALAR COM ESPECIALISTA\n\n' + 
        '0️⃣ - VOLTAR AO MENU PRINCIPAL\n\n' +
        'Digite o número da opção (1-7)';
}

function getMensagemFormulario(nomeCliente) {
    let primeiroNome = 'Cliente';

    try {
        if (nomeCliente && typeof nomeCliente === 'string' && nomeCliente.trim().length > 0) {
            primeiroNome = nomeCliente.trim().split(' ')[0];
        }
    } catch (err) {
        console.error('Erro ao processar nome:', err);
        primeiroNome = 'Cliente';
    }

    return `🌟 *ÓTIMO, ${primeiroNome.toUpperCase()}!* 🌟\n\n` +
           `Para iniciarmos seu processo, preciso que você preencha nosso formulário com os dados do visto americano.\n\n` +
           `📋 *LINK DO FORMULÁRIO:*\n` +
           `🔗 https://getvisa.com.br/formulario-ds160\n\n` +
           `⏱️ *Tempo estimado:* 15-20 minutos\n` +
           `📱 *Pode preencher pelo celular ou computador*\n\n` +
           `✅ *Depois de preencher:*\n` +
           `• Nossa equipe fará a análise dos dados\n` +
           `• Você receberá a confirmação por e-mail\n` +
           `• Iniciaremos o agendamento da entrevista\n\n` +
           `💡 *Dica:* Tenha seu passaporte em mãos para preencher os dados corretamente.\n\n` +
           `📱 Dúvidas? Fale com a gente: https://wa.me/5521974601812\n\n` +
           `⚡ *Vamos realizar seu sonho de viajar para os EUA!* ✈️`;
}

module.exports = {
    getMenuPrincipal,
    getSubmenu,
    getMensagemFormulario
};