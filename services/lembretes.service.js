// services/lembretes.service.js
const supabase = require('../config/supabase');
const clientRepository = require('../repositories/clientRepository');
const { enviarWhatsApp } = require('../utils/whatsappClient');

// ============================================================
// FUNÇÕES DE FORMATAÇÃO DE MENSAGEM (EMBUTIDAS)
// ============================================================

function formatarMensagemLembrete(compromisso, cliente, tipo) {
    const nomeCliente = cliente?.nome?.split(' ')[0] || 'Cliente';
    const dataFormatada = new Date(compromisso.data_agendamento).toLocaleDateString('pt-BR');
    const horaFormatada = compromisso.hora_agendamento?.substring(0, 5) || 'horário a confirmar';
    
    const mensagens = {
        '48h': `🔔 *GETVISA - Lembrete de 48h*\n\nOlá *${nomeCliente}*!\n\nSeu *${compromisso.atividade}* será em 2 dias!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${compromisso.local_agendamento || 'A definir'}\n\n📋 Comece a separar seus documentos.\n\nBoa sorte! 🍀`,
        '24h': `🔔 *GETVISA - Lembrete de 24h*\n\nOlá *${nomeCliente}*!\n\nSeu *${compromisso.atividade}* será AMANHÃ!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${compromisso.local_agendamento || 'A definir'}\n\n📋 Documentos necessários:\n• Passaporte válido\n• Confirmação DS-160\n• Comprovante de agendamento\n\nBoa sorte! 🍀`,
        '1h': `🔔 *GETVISA - Lembrete de 1h*\n\nOlá *${nomeCliente}*!\n\nSeu *${compromisso.atividade}* é em 1 hora!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${compromisso.local_agendamento || 'A definir'}\n\nChegue com 15 minutos de antecedência!\n\nBoa sorte! 🍀`,
        'dia_anterior': `🔔 *GETVISA - Lembrete Especial*\n\nOlá *${nomeCliente}*!\n\nAmanhã é o dia do seu *${compromisso.atividade}*!\n\n📅 Data: ${dataFormatada}\n⏰ Hora: ${horaFormatada}\n📍 Local: ${compromisso.local_agendamento || 'A definir'}\n\n✅ Confirme que recebeu esta mensagem!\n\n🌟 Estamos torcendo por você!`
    
    };

    return mensagens[tipo] || mensagens['24h'];
}

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

/**
 * Gera e salva os lembretes para um dado compromisso
 */
async function generateRemindersForCompromisso(compromisso) {
    const dataCompromisso = compromisso.data || compromisso.data_agendamento;
    const horaCompromisso = compromisso.hora || compromisso.hora_agendamento;
    
    if (!compromisso || !compromisso.id || !compromisso.cliente_id || !dataCompromisso) {
        console.error('❌ Dados de compromisso incompletos para gerar lembretes.');
        return;
    }

    const cliente = await clientRepository.getClientById(compromisso.cliente_id);
    if (!cliente) {
        console.error(`❌ Cliente ${compromisso.cliente_id} não encontrado`);
        return;
    }

    const compromissoDate = new Date(dataCompromisso);
    const tiposDeAviso = [
        { tipo: '48h', diasOffset: 2, horasOffset: 0, label: '48 horas antes' },
        { tipo: '24h', diasOffset: 1, horasOffset: 0, label: '24 horas antes' },
        { tipo: '1h', diasOffset: 0, horasOffset: 1, label: '1 hora antes' }
    ];

    console.log(`⏰ Gerando lembretes para ${cliente.nome} - ID: ${compromisso.id}`);

    for (const aviso of tiposDeAviso) {
        const dataDisparo = new Date(compromissoDate);
        dataDisparo.setDate(compromissoDate.getDate() - aviso.diasOffset);
        dataDisparo.setHours(compromissoDate.getHours() - aviso.horasOffset, 0, 0, 0);

        if (dataDisparo < new Date()) {
            console.log(`⏭️ Pulando lembrete "${aviso.label}" (data no passado)`);
            continue;
        }

        const mensagem = formatarMensagemLembrete(compromisso, cliente, aviso.tipo);

        const lembreteData = {
            cliente_id: compromisso.cliente_id,
            id_agendamento: compromisso.id,
            tipo_aviso: 'whatsapp',  // ✅ FIXO
            data_disparo: dataDisparo.toISOString(),
            mensagem: mensagem,
            status_envio: 'pendente',
            created_at: new Date().toISOString()
        };

        const { data: novoLembrete, error } = await supabase
            .from('lembretes')
            .insert([lembreteData])
            .select()
            .single();

        if (error) {
            console.error(`❌ Falha ao criar lembrete "${aviso.label}":`, error);
        } else {
            console.log(`✅ Lembrete "${aviso.label}" criado. Disparo: ${dataDisparo.toLocaleString()}`);
        }
    }
}

/**
 * Processa todos os lembretes pendentes
 */
async function processPendingReminders() {
    console.log('🔄 Processando lembretes pendentes...');
    
    const now = new Date().toISOString();
    const { data: lembretes, error } = await supabase
        .from('lembretes')
        .select('*')
        .eq('status_envio', 'pendente')
        .lte('data_disparo', now);

    if (error) {
        console.error('❌ Erro ao buscar lembretes:', error);
        return;
    }

    if (lembretes.length === 0) {
        console.log('📭 Nenhum lembrete pendente.');
        return;
    }

    console.log(`📨 Encontrados ${lembretes.length} lembretes pendentes.`);

    for (const lembrete of lembretes) {
        const cliente = await clientRepository.getClientById(lembrete.cliente_id);
        if (!cliente) {
            console.warn(`⚠️ Cliente ${lembrete.cliente_id} não encontrado`);
            await supabase
                .from('lembretes')
                .update({ status_envio: 'falha' })
                .eq('id', lembrete.id);
            continue;
        }

        const telefone = cliente.telefone?.replace(/\D/g, '');
        if (!telefone) {
            console.warn(`⚠️ Telefone não encontrado para ${cliente.nome}`);
            await supabase
                .from('lembretes')
                .update({ status_envio: 'falha_sem_telefone' })
                .eq('id', lembrete.id);
            continue;
        }

        try {
            const enviado = await enviarWhatsApp(telefone, lembrete.mensagem);
            const status = enviado ? 'enviado' : 'falha_envio';
            await supabase
                .from('lembretes')
                .update({ 
                    status_envio: status, 
                    enviado_em: new Date().toISOString() 
                })
                .eq('id', lembrete.id);
            
            if (enviado) {
                console.log(`✅ Lembrete ${lembrete.id} enviado para ${telefone}`);
            } else {
                console.error(`❌ Falha ao enviar lembrete ${lembrete.id}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao enviar lembrete ${lembrete.id}:`, error);
            await supabase
                .from('lembretes')
                .update({ status_envio: 'falha_processamento' })
                .eq('id', lembrete.id);
        }
    }
    
    console.log('✅ Processamento de lembretes concluído.');
}

/**
 * Lista todos os lembretes de um agendamento
 */
async function listarLembretesPorAgendamento(agendamentoId) {
    const { data, error } = await supabase
        .from('lembretes')
        .select('*')
        .eq('id_agendamento', agendamentoId)
        .order('data_disparo', { ascending: true });

    if (error) {
        console.error('❌ Erro ao listar lembretes:', error);
        return [];
    }
    return data;
}

/**
 * Reenviar um lembrete manualmente
 */
async function reenviarLembrete(lembreteId) {
    const { data: lembrete, error } = await supabase
        .from('lembretes')
        .select('*')
        .eq('id', lembreteId)
        .single();

    if (error || !lembrete) {
        console.error('❌ Lembrete não encontrado');
        return { success: false, message: 'Lembrete não encontrado' };
    }

    await supabase
        .from('lembretes')
        .update({ status_envio: 'pendente', enviado_em: null })
        .eq('id', lembreteId);

    const cliente = await clientRepository.getClientById(lembrete.cliente_id);
    if (!cliente) {
        return { success: false, message: 'Cliente não encontrado' };
    }

    const telefone = cliente.telefone?.replace(/\D/g, '');
    if (!telefone) {
        return { success: false, message: 'Telefone não encontrado' };
    }

    try {
        const enviado = await enviarWhatsApp(telefone, lembrete.mensagem);
        const status = enviado ? 'enviado' : 'falha_envio';
        await supabase
            .from('lembretes')
            .update({ status_envio: status, enviado_em: new Date().toISOString() })
            .eq('id', lembreteId);
        
        return { 
            success: enviado, 
            message: enviado ? 'Lembrete reenviado com sucesso' : 'Falha ao reenviar'
        };
    } catch (error) {
        console.error(`❌ Erro ao reenviar lembrete ${lembreteId}:`, error);
        return { success: false, message: error.message };
    }
}

module.exports = {
    generateRemindersForCompromisso,
    processPendingReminders,
    listarLembretesPorAgendamento,
    reenviarLembrete
};