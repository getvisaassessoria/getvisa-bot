// utils/resendClient.js
const { Resend } = require('resend');
require('dotenv').config(); // Garante que as variáveis de ambiente estejam carregadas

// DEBUG: Valor de RESEND_API_KEY em resendClient.js: ******JkdJ
// console.log('DEBUG: Valor de RESEND_API_KEY em resendClient.js:', process.env.RESEND_API_KEY ? '******' + process.env.RESEND_API_KEY.slice(-4) : 'UNDEFINED/EMPTY');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = resend; // Exporta a instância da Resend