// routes/ds160Routes.js
const express = require('express');
const router = express.Router();

const { isSpamData, limparTelefone } = require('../utils/helpers');
const { gerarPDF_DS160 } = require('../services/pdfService');
const { enviarPDFWhatsApp } = require('../utils/whatsappClient');
const { resend } = require('../utils/resendClient'); // Importa a instância da Resend
const supabase = require('../config/supabase'); // Importa a instância do Supabase
const { cadastrarCliente } = require('../services/dbService'); // Para garantir que o cliente exista

// Rota para receber dados do formulário DS-160
router.post('/submit-ds160', async (req, res) => {
    console.log('🔔 Requisição POST recebida para /api/submit-ds160');
    const formData = req.body;
    // console.log('Dados recebidos:', JSON.stringify(formData, null, 2)); // Descomente para debug completo

    const {
        full_name,
        email,
        telefone_whatsapp,
        consulado_cidade
    } = formData;

    // Validação básica
    if (!full_name || !email || !telefone_whatsapp || !consulado_cidade) {
        console.error('❌ Dados mínimos do formulário DS-160 ausentes.');
        return res.status(400).json({
            success: false,
            message: 'Dados mínimos (nome, email, telefone, consulado) são obrigatórios.'
        });
    }

    // Limpar telefone
    const cleanPhone = limparTelefone(telefone_whatsapp);
    if (!cleanPhone) {
        console.error('❌ Telefone inválido no formulário DS-160.');
        return res.status(400).json({
            success: false,
            message: 'Número de telefone WhatsApp inválido.'
        });
    }

    // Verificar spam
    if (isSpamData(formData)) {
        console.warn('⚠️ Dados de spam detectados no formulário DS-160. Ignorando.');
        return res.status(400).json({
            success: false,
            message: 'Dados inválidos ou suspeitos detectados.'
        });
    }

    try {
        // 1. Gerar o PDF
        const pdfBuffer = await gerarPDF_DS160(formData);
        console.log('✅ PDF do DS-160 gerado com sucesso.');

        // 2. Salvar os dados no Supabase
        // Primeiro, garantir que o cliente exista na tabela clientes_novos ou ativos
        const clienteExistente = await cadastrarCliente(cleanPhone, full_name);
        if (!clienteExistente) {
            console.error('❌ Falha ao cadastrar/atualizar cliente no Supabase.');
            // Continuar mesmo com erro no cadastro do cliente, para não perder o formulário
        }

        // Salvar os dados completos do formulário DS-160
        const { data: savedForm, error: saveError } = await supabase
            .from('formularios_ds160') // Certifique-se de que esta tabela existe no seu Supabase
            .upsert({
                telefone: cleanPhone,
                nome_completo: full_name,
                email: email,
                consulado: consulado_cidade,
                data_envio: new Date().toISOString(),
                dados_completos: formData // Salva todos os dados do formulário
            }, { onConflict: 'telefone' })
            .select()
            .single();

        if (saveError) {
            console.error('❌ Erro ao salvar formulário DS-160 no Supabase:', saveError);
            // Continuar o processo mesmo com erro no salvamento do formulário
        } else {
            console.log('✅ Dados do formulário DS-160 salvos no Supabase.');
        }

        // 3. Enviar e-mail de confirmação para o cliente
        try {
            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: [email],
                subject: '✅ Formulário DS-160 Recebido - GetVisa Assessoria',
                html: `
                    <strong>Olá ${full_name}!</strong>
                    <p>Recebemos seu formulário DS-160 com sucesso!</p>
                    <p>Nossa equipe fará a análise dos dados e em breve entraremos em contato com os próximos passos.</p>
                    <p>Agradecemos a sua confiança na GetVisa Assessoria.</p>
                    <p>Atenciosamente,</p>
                    <p>Equipe GetVisa</p>
                `,
                attachments: [{
                    filename: `DS160_${full_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                    content: pdfBuffer.toString('base64')
                }]
            });
            console.log('📧 E-mail de confirmação enviado para o cliente.');
        } catch (emailError) {
            console.error('❌ Erro ao enviar e-mail de confirmação:', emailError);
        }

        // 4. Enviar PDF por WhatsApp para o cliente
        try {
            const primeiroNome = full_name.split(' ')[0];
            await enviarPDFWhatsApp(cleanPhone, pdfBuffer, primeiroNome, 'ds160');
            console.log('📱 PDF do DS-160 enviado por WhatsApp.');
        } catch (whatsappError) {
            console.error('❌ Erro ao enviar PDF por WhatsApp:', whatsappError);
        }

        // 5. Notificar a equipe interna (opcional, mas recomendado)
        try {
            const adminPhone = limparTelefone(process.env.ADMIN_PHONE); // Certifique-se de ter ADMIN_PHONE no .env
            if (adminPhone) {
                await enviarWhatsApp(adminPhone,
                    `🔔 NOVO FORMULÁRIO DS-160 RECEBIDO!\n\n` +
                    `Nome: ${full_name}\n` +
                    `Email: ${email}\n` +
                    `Telefone: ${telefone_whatsapp}\n` +
                    `Consulado: ${consulado_cidade}\n\n` +
                    `Verificar no painel ou Supabase.`
                );
                console.log('🔔 Notificação interna enviada para o admin.');
            }
        } catch (adminNotifyError) {
            console.error('❌ Erro ao notificar admin:', adminNotifyError);
        }


        res.status(200).json({
            success: true,
            message: 'Formulário DS-160 recebido e processado com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro geral ao processar formulário DS-160:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao processar o formulário.',
            error: error.message
        });
    }
});

module.exports = router;