// utils/whatsappClient.js
require('dotenv').config(); // Garante que as variáveis de ambiente estejam carregadas
const { limparTelefone } = require('./helpers'); // Precisamos da função de limpeza de telefone

async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = String(process.env.ZAPI_INSTANCE || '').trim();
        const token = String(process.env.ZAPI_TOKEN || '').trim();
        const securityToken = String(
            process.env.ZAPI_CLIENT_TOKEN || ''
        ).trim();

        if (!instance || !token) {
            console.error('❌ Z-API não configurada corretamente.', {
                instanciaConfigurada: Boolean(instance),
                tokenConfigurado: Boolean(token)
            });
            return false;
        }

        const cleanPhone = String(telefone || '').replace(/\D/g, '');

        if (cleanPhone.length < 10) {
            console.error('❌ Telefone inválido para WhatsApp:', telefone);
            return false;
        }

        const url =
            'https://api.z-api.io/instances/' +
            encodeURIComponent(instance) +
            '/token/' +
            encodeURIComponent(token) +
            '/send-text';

        const headers = {
            'Content-Type': 'application/json'
        };

        if (securityToken) {
            headers['Client-Token'] = securityToken;
        }

        console.log('📨 ===== ENVIO Z-API =====');
        console.log('📨 Telefone:', cleanPhone);
        console.log('📨 Instância configurada:', instance);
        console.log('📨 Token configurado:', Boolean(token));
        console.log('📨 Client-Token configurado:', Boolean(securityToken));

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                phone: cleanPhone,
                message: mensagem
            })
        });

        const result = await response.text();

        console.log(
            '📨 Z-API status para ' + cleanPhone + ': ' + response.status
        );
        console.log('📨 Z-API resposta:', result);

        return response.status >= 200 && response.status < 300;
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error.message);
        return false;
    }
}

async function sendReply(phone, message) {
    return enviarWhatsApp(phone, message);
}

async function enviarPDFWhatsApp(telefone, pdfBuffer, nomeCliente, tipo = 'ds160') {
    try {
        const instance = String(process.env.ZAPI_INSTANCE || '').trim();
        const token = String(process.env.ZAPI_TOKEN || '').trim();
        const securityToken = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

        if (!instance || !token) {
            console.error('❌ Z-API não configurada para envio de PDF');
            return false;
        }

        const cleanPhone = String(telefone || '').replace(/\D/g, '');

        if (cleanPhone.length < 10) {
            console.error('❌ Telefone inválido para PDF:', telefone);
            return false;
        }

        // Primeiro, enviar a mensagem com o link
        const mensagemLink = `📄 *Olá ${nomeCliente}!*\n\n` +
                            `Seu formulário DS-160 foi recebido com sucesso!\n\n` +
                            `📎 Segue em anexo o PDF com as informações que você preencheu.\n\n` +
                            `✅ *Próximos passos:*\n` +
                            `• Nossa equipe fará a análise dos dados\n` +
                            `• Você receberá atualizações por aqui\n` +
                            `• Iniciaremos o agendamento da entrevista\n\n` +
                            `📱 Dúvidas? Fale conosco: https://wa.me/5521974601812\n\n` +
                            `🌟 *Bem-vindo(a) à GetVisa!*`;

        // Enviar a mensagem
        const enviado = await enviarWhatsApp(cleanPhone, mensagemLink);

        if (!enviado) {
            console.error('❌ Falha ao enviar mensagem de confirmação');
            return false;
        }

        // Esperar um pouco e enviar o PDF
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Enviar o PDF via Z-API
        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-document`;

        const headers = {
            'Content-Type': 'application/json'
        };

        if (securityToken) {
            headers['Client-Token'] = securityToken;
        }

        const nomeArquivo = `DS160_${nomeCliente.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

        const body = {
            phone: cleanPhone,
            document: pdfBuffer.toString('base64'),
            fileName: nomeArquivo,
            caption: `📄 Formulário DS-160 - ${nomeCliente}`
        };

        console.log(`📨 Enviando PDF para: ${cleanPhone}`);
        console.log(`📄 Arquivo: ${nomeArquivo}`);

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        const result = await response.text();
        console.log(`📨 Z-API PDF status: ${response.status}`);
        console.log(`📨 Z-API PDF resposta: ${result}`);

        return response.status >= 200 && response.status < 300;

    } catch (error) {
        console.error('❌ Erro ao enviar PDF por WhatsApp:', error.message);
        return false;
    }
}

module.exports = {
    enviarWhatsApp,
    sendReply,
    enviarPDFWhatsApp
};