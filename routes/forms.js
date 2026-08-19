const express = require('express');
const router = express.Router();
// NÃO PRECISA MAIS DE: const { Resend } = require('resend');
// NÃO PRECISA MAIS DE: require('dotenv').config();

// Importa a instância 'resend' do novo módulo compartilhado
const resend = require('../utils/resendClient'); // <-- Este caminho está correto!

// Rota para receber dados do formulário de contato
router.post('/contact-form', async (req, res) => {
    const { name, email, message } = req.body;
    console.log('Requisição POST recebida para /api/contact-form');
    console.log('Dados recebidos:', { name, email, message });

    // ============================================================
    // Lógica para enviar e-mail usando Resend
    // ============================================================
    try {
        // Enviar e-mail para a equipe
        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>', // Remetente verificado - CORRIGIDO AQUI!
            to: [process.env.EMAIL_DESTINO_EQUIPE], // E-mail da sua equipe (do .env)
            subject: `Novo Contato do Site: ${name}`,
            html: `
                <p>Você recebeu uma nova mensagem do formulário de contato do site:</p>
                <p><strong>Nome:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Mensagem:</strong> ${message}</p>
                <p>Data/Hora: ${new Date().toLocaleString('pt-BR')}</p>
            `, // CORRIGIDO AQUI!
        });
        console.log('📧 E-mail de contato enviado para a equipe.');

        // Opcional: Enviar e-mail de confirmação para o cliente
        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>', // Remetente verificado - CORRIGIDO AQUI!
            to: [email], // E-mail do cliente
            subject: 'Sua mensagem foi recebida pela GetVisa Assessoria',
            html: `
                <p>Olá ${name},</p>
                <p>Recebemos sua mensagem e agradecemos o contato!</p>
                <p>Nossa equipe entrará em contato com você em breve.</p>
                <p>Atenciosamente,</p>
                <p>Equipe GetVisa Assessoria</p>
            `, // CORRIGIDO AQUI!
        });
        console.log('📧 E-mail de confirmação enviado para o cliente.');

    } catch (error) {
        console.error('❌ Erro ao enviar e-mail com Resend:', error);
        // Se houver erro no envio do e-mail, ainda podemos retornar sucesso para o frontend
        // ou decidir retornar um erro, dependendo da criticidade.
        // Por enquanto, vamos logar o erro e continuar.
    }
    // ============================================================

    // Resposta para o frontend
    res.status(200).json({
        success: true,
        message: 'Formulário de contato recebido com sucesso! Em breve entraremos em contato.',
        data: { name, email, message }
    });
});

module.exports = router;