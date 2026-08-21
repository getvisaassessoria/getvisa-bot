// services/notificacao.service.js
const supabase = require('../config/supabase');
const { enviarWhatsApp } = require('../utils/zapi.utils');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || '');

/**
 * Envia um lembrete via WhatsApp
 * @param {string} telefone - Número do cliente
 * @param {string} mensagem - Conteúdo do lembrete
 * @returns {Promise<boolean>}
 */
async function enviarLembreteWhatsApp(telefone, mensagem) {
    try {
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`📱 Enviando lembrete WhatsApp para: ${telefoneLimpo}`);
        
        const enviado = await enviarWhatsApp(telefoneLimpo, mensagem);
        
        if (enviado) {
            console.log(`✅ Lembrete WhatsApp enviado para ${telefoneLimpo}`);
        } else {
            console.error(`❌ Falha ao enviar WhatsApp para ${telefoneLimpo}`);
        }
        
        return enviado;
    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        return false;
    }
}

/**
 * Envia um lembrete via E-mail
 * @param {string} email - E-mail do cliente
 * @param {string} assunto - Assunto do e-mail
 * @param {string} mensagem - Conteúdo do e-mail (HTML)
 * @returns {Promise<boolean>}
 */
async function enviarLembreteEmail(email, assunto, mensagem) {
    try {
        if (!email || !email.includes('@')) {
            console.warn(`⚠️ E-mail inválido: ${email}`);
            return false;
        }

        console.log(`📧 Enviando lembrete por e-mail para: ${email}`);
        
        const { data, error } = await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: [email],
            subject: assunto,
            html: mensagem
        });

        if (error) {
            console.error('❌ Erro ao enviar e-mail:', error);
            return false;
        }

        console.log(`✅ E-mail enviado para ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar e-mail:', error);
        return false;
    }
}

/**
 * Formata uma mensagem de lembrete
 * @param {Object} agendamento - Dados do agendamento
 * @param {Object} cliente - Dados do cliente
 * @param {string} tipo - Tipo de lembrete (24h, 1h, etc.)
 * @returns {Object} { whatsapp, email }
 */
function formatarMensagemLembrete(agendamento, cliente, tipo) {
    const nomeCliente = cliente?.nome?.split(' ')[0] || 'Cliente';
    const dataFormatada = new Date(agendamento.data_agendamento).toLocaleDateString('pt-BR');
    const horaFormatada = agendamento.hora_agendamento?.substring(0, 5) || 'horário a confirmar';
    
    const mensagens = {
        '24h': {
            whatsapp: `🔔 *GETVISA - Lembrete de 24h*\n\nOlá *${nomeCliente}*!\n\nSeu *${agendamento.atividade}* será AMANHÃ!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${agendamento.local_agendamento || 'A definir'}\n\n📋 Documentos necessários:\n• Passaporte válido\n• Confirmação DS-160\n• Comprovante de agendamento\n\nBoa sorte! 🍀`,
            email: `<h2>🔔 Lembrete de 24h - GetVisa</h2>
                    <p>Olá <strong>${nomeCliente}</strong>!</p>
                    <p>Seu <strong>${agendamento.atividade}</strong> será AMANHÃ!</p>
                    <ul>
                        <li><strong>Data:</strong> ${dataFormatada}</li>
                        <li><strong>Hora:</strong> ${horaFormatada}</li>
                        <li><strong>Local:</strong> ${agendamento.local_agendamento || 'A definir'}</li>
                    </ul>
                    <h3>📋 Documentos necessários:</h3>
                    <ul>
                        <li>Passaporte válido</li>
                        <li>Confirmação DS-160</li>
                        <li>Comprovante de agendamento</li>
                    </ul>
                    <p>Boa sorte! 🍀</p>
                    <p>— Equipe GetVisa</p>`
        },
        '1h': {
            whatsapp: `🔔 *GETVISA - Lembrete de 1h*\n\nOlá *${nomeCliente}*!\n\nSeu *${agendamento.atividade}* é em 1 hora!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${agendamento.local_agendamento || 'A definir'}\n\nChegue com 15 minutos de antecedência!\n\nBoa sorte! 🍀`,
            email: `<h2>🔔 Lembrete de 1h - GetVisa</h2>
                    <p>Olá <strong>${nomeCliente}</strong>!</p>
                    <p>Seu <strong>${agendamento.atividade}</strong> é em 1 hora!</p>
                    <ul>
                        <li><strong>Data:</strong> ${dataFormatada}</li>
                        <li><strong>Hora:</strong> ${horaFormatada}</li>
                        <li><strong>Local:</strong> ${agendamento.local_agendamento || 'A definir'}</li>
                    </ul>
                    <p>Chegue com 15 minutos de antecedência!</p>
                    <p>Boa sorte! 🍀</p>
                    <p>— Equipe GetVisa</p>`
        },
        'dia_anterior': {
            whatsapp: `🔔 *GETVISA - Lembrete Especial*\n\nOlá *${nomeCliente}*!\n\nAmanhã é o dia do seu *${agendamento.atividade}*!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${agendamento.local_agendamento || 'A definir'}\n\n✅ Confirme que recebeu esta mensagem!\n\n🌟 Estamos torcendo por você!`,
            email: `<h2>🔔 Lembrete Especial - GetVisa</h2>
                    <p>Olá <strong>${nomeCliente}</strong>!</p>
                    <p>Amanhã é o dia do seu <strong>${agendamento.atividade}</strong>!</p>
                    <ul>
                        <li><strong>Data:</strong> ${dataFormatada}</li>
                        <li><strong>Hora:</strong> ${horaFormatada}</li>
                        <li><strong>Local:</strong> ${agendamento.local_agendamento || 'A definir'}</li>
                    </ul>
                    <p>Confirme que recebeu este e-mail!</p>
                    <p>🌟 Estamos torcendo por você!</p>
                    <p>— Equipe GetVisa</p>`
        }
    };

    return mensagens[tipo] || mensagens['24h'];
}

/**
 * Processa e envia um lembrete específico
 * @param {Object} lembrete - Dados do lembrete do banco
 * @returns {Promise<boolean>}
 */
async function processarLembrete(lembrete) {
    try {
        console.log(`🔄 Processando lembrete ID: ${lembrete.id}`);
        
        // Buscar agendamento
        const { data: agendamento, error: agendamentoError } = await supabase
            .from('agendamentos')
            .select('*, clientes(*)')
            .eq('id', lembrete.id_agendamento)
            .single();

        if (agendamentoError || !agendamento) {
            console.error(`❌ Agendamento não encontrado para lembrete ${lembrete.id}`);
            return false;
        }

        const cliente = agendamento.clientes;
        
        // Enviar WhatsApp
        let whatsappEnviado = false;
        if (cliente?.telefone) {
            const mensagemWhatsApp = lembrete.mensagem || formatarMensagemLembrete(agendamento, cliente, '24h').whatsapp;
            whatsappEnviado = await enviarLembreteWhatsApp(cliente.telefone, mensagemWhatsApp);
        }

        // Enviar Email
        let emailEnviado = false;
        if (cliente?.email) {
            const mensagemEmail = lembrete.mensagem_html || formatarMensagemLembrete(agendamento, cliente, '24h').email;
            emailEnviado = await enviarLembreteEmail(
                cliente.email,
                `🔔 Lembrete GetVisa - ${agendamento.atividade}`,
                mensagemEmail
            );
        }

        // Atualizar status do lembrete
        const status = (whatsappEnviado || emailEnviado) ? 'enviado' : 'falha_envio';
        await supabase
            .from('lembretes')
            .update({
                status_envio: status,
                enviado_em: new Date().toISOString(),
                whatsapp_enviado: whatsappEnviado,
                email_enviado: emailEnviado
            })
            .eq('id', lembrete.id);

        console.log(`✅ Lembrete ${lembrete.id} processado. Status: ${status}`);
        return true;

    } catch (error) {
        console.error(`❌ Erro ao processar lembrete ${lembrete.id}:`, error);
        
        await supabase
            .from('lembretes')
            .update({ status_envio: 'falha_processamento' })
            .eq('id', lembrete.id);
        
        return false;
    }
}

module.exports = {
    enviarLembreteWhatsApp,
    enviarLembreteEmail,
    formatarMensagemLembrete,
    processarLembrete
};