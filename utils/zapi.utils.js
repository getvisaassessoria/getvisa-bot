// utils/zapi.utils.js
const axios = require('axios');

/**
 * Envia uma mensagem de texto via WhatsApp usando a Z-API.
 * @param {string} to - O número de telefone do destinatário (ex: "5511987654321").
 * @param {string} message - O conteúdo da mensagem a ser enviada.
 * @returns {Promise<boolean>} True se a mensagem foi enviada com sucesso, False caso contrário.
 */
async function sendWhatsAppMessage(to, message) {
    try {
        // Conforme a documentação da Z-API, a URL para enviar texto é geralmente assim.
        // Certifique-se de que o `to` esteja no formato correto (ex: 55119XXXXYYYY)
        const url = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`;

        const payload = {
            phone: to,
            message: message
        };

        const headers = {
            'Client-Token': process.env.ZAPI_CLIENT_TOKEN, // Usado para autenticação da instância
            'Content-Type': 'application/json'
        };

        console.log(`Tentando enviar mensagem Z-API para ${to}...`);
        const response = await axios.post(url, payload, { headers });

        // A Z-API geralmente retorna um status de sucesso no corpo da resposta.
        // Você pode precisar ajustar esta verificação com base na resposta exata da Z-API.
        if (response.data && response.data.messageId) { // Exemplo: Z-API retorna um ID da mensagem em caso de sucesso
            console.log(`Mensagem Z-API enviada com sucesso para ${to}. ID da Mensagem: ${response.data.messageId}`);
            return true;
        } else {
            console.error(`Erro Z-API ao enviar mensagem para ${to}:`, response.data);
            return false;
        }
    } catch (error) {
        console.error(`Exceção ao chamar Z-API para ${to}:`, error.message);
        // Se for um erro de rede ou resposta HTTP diferente de 2xx
        if (error.response) {
            console.error('Detalhes do erro HTTP:', error.response.status, error.response.data);
        }
        return false;
    }
}

module.exports = { sendWhatsAppMessage };