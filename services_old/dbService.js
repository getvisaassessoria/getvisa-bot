// services/dbService.js
const supabase = require('../config/supabase');
const { limparTelefone, formatarTelefone } = require('../utils/helpers'); // Importa helpers
const { ETAPAS } = require('../config/constants'); // Importa ETAPAS

async function cadastrarCliente(telefone, nome) {
    console.log('📝 Cadastrando cliente:', telefone);

    const telefoneLimpo = limparTelefone(telefone);
    console.log('📱 Telefone limpo:', telefoneLimpo);

    const dadosCliente = {
        telefone: telefoneLimpo,
        data_contato: new Date().toISOString(),
        status: 'novo',
        onboarding_completo: false,
       // updated_at: new Date().toISOString()
    };

    if (nome && nome !== 'Cliente' && !nome.startsWith('Cliente_')) {
        dadosCliente.nome = nome;
        console.log('  - Com nome:', nome);
    } else {
        console.log('  - Sem nome (aguardando onboarding)');
    }

    try {
        const { data, error } = await supabase
            .from('clientes')
            .upsert(dadosCliente, {
                onConflict: 'telefone'
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao salvar cliente (UPSERT):', error);
            // TENTAR INSERT DIRETO COMO FALLBACK
            const { data: insertData, error: insertError } = await supabase
                .from('clientes')
                .insert(dadosCliente)
                .select()
                .single();

            if (insertError) {
                console.error('❌ Erro ao inserir cliente (INSERT):', insertError);
                return null;
            }

            console.log('✅ Cliente inserido com sucesso (INSERT):', insertData);
            return { dados: insertData, tipo: 'novo', tabela: 'clientes' };
        }

        console.log('✅ Cliente cadastrado com sucesso (UPSERT):', data);
        return { dados: data, tipo: 'novo', tabela: 'clientes' };

    } catch (err) {
        console.error('❌ Erro exceção ao cadastrar cliente:', err);
        return null;
    }
}

async function buscarClienteEmQualquerTabela(telefone, tabelaEspecifica = null) {
    const telefoneLimpo = limparTelefone(telefone);
    console.log(`🔍 Buscando: ${telefoneLimpo}`);

    // ADICIONAR MAIS VARIAÇÕES DE TELEFONE
    const variacoes = [
        telefoneLimpo,
        telefoneLimpo.padStart(11, '55'), // Ex: 55219xxxx-xxxx
        telefoneLimpo.replace(/^55/, ''), // Ex: 219xxxx-xxxxtelefoneLimpo.replace(/^0+/, '')  // Remove zeros à esquerda
    ].filter(Boolean); // Remove valores nulos/vazios

    // Remove duplicatas
    const telefonesUnicos = [...new Set(variacoes)];

    const tables = tabelaEspecifica ? [tabelaEspecifica] : ['clientes', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];

    for (const table of tables) {
        for (const telefoneVariacao of telefonesUnicos) {
            if (!telefoneVariacao || telefoneVariacao.length < 10) continue; // Garante que o telefone tem um tamanho mínimo

            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .eq('telefone', telefoneVariacao)
                    .maybeSingle();

                if (!error && data) {
                    console.log(`✅ Encontrado em ${table}:`, data.nome || data.telefone);
                    return data;
                }
            } catch (err) {
                console.error(`Erro ao buscar em ${table} com ${telefoneVariacao}:`, err.message);
            }
        }
    }

    return null;
}

async function processarClienteFinalizado(cleanPhone, messageText, dadosCliente) {
    console.log('📌 Processando cliente FINALIZADO:', dadosCliente.nome);

    const nomeCliente = dadosCliente.nome ? dadosCliente.nome.split(' ')[0] : 'Cliente';
    const servico = dadosCliente.servico || 'processo';
    const dataFinal = dadosCliente.data_finalizacao ? new Date(dadosCliente.data_finalizacao).toLocaleDateString('pt-BR') : '';
    const observacoes = dadosCliente.observacoes || '';
    const resultado = dadosCliente.observacoes && dadosCliente.observacoes.includes('recusado') ? 'recusado' : 'aprovado';

    const comandos = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (comandos.includes(messageText.toLowerCase())) {
        let msg = `👋 Olá ${nomeCliente}!\n\n`;
        if (resultado === 'recusado') {
            msg += `📌 Seu processo foi finalizado com o resultado: **❌ Visto Recusado**\n\n`;
        } else {
            msg += `📌 Seu processo foi finalizado com o resultado: **✅ Visto Aprovado**\n\n`;
        }
        msg += `✅ Seu ${servico} foi **finalizado** em ${dataFinal}.\n\n`;
        if (observacoes) msg += `📝 ${observacoes}\n\n`;
        msg += `📱 Como podemos ajudar você hoje?\n\n`;
        msg += `💬 Fique à vontade para escrever sua dúvida.`;

        // Supondo que sendReply esteja disponível via whatsappClient
        const { sendReply } = require('../utils/whatsappClient');
        await sendReply(cleanPhone, msg);
        return;
    }

    let msg = `👋 Olá ${nomeCliente}!\n\n`;
    if (resultado === 'recusado') {
        msg += `📌 Seu processo foi finalizado com o resultado: **❌ Visto Recusado**\n\n`;
    } else {
        msg += `📌 Seu processo foi finalizado com o resultado: **✅ Visto Aprovado**\n\n`;
    }
    msg += `✅ Seu ${servico} foi **finalizado** em ${dataFinal}.\n\n`;
    if (observacoes) msg += `📝 ${observacoes}\n\n`;
    msg += `📱 Como podemos ajudar você hoje?\n\n`;
    msg += `💬 Fique à vontade para escrever sua dúvida.`;

    const { sendReply } = require('../utils/whatsappClient');
    await sendReply(cleanPhone, msg);
}

async function processarClienteAtivo(cleanPhone, messageText, dadosCliente) {
    console.log('📌 Processando cliente ATIVO:', dadosCliente.nome);

    let etapaMsg = '';
    let etapaAtual = '';
    try {
        const { data: etapa, error } = await supabase
            .from('etapas_processo')
            .select('etapa_atual')
            .eq('cliente_telefone', cleanPhone)
            .maybeSingle();

        if (!error && etapa) {
            etapaAtual = etapa.etapa_atual;
            const etapaInfo = ETAPAS[etapa.etapa_atual];
            etapaMsg = etapaInfo ? etapaInfo.label : etapa.etapa_atual;
            console.log(`📌 Etapa atual do cliente: ${etapaAtual} (${etapaMsg})`);
        } else {
            console.log('⚠️ Nenhuma etapa encontrada para o cliente');
        }
    } catch (err) {
        console.log('Erro ao buscar etapa:', err);
    }

    const nomeCliente = dadosCliente.nome ? dadosCliente.nome.split(' ')[0] : 'Cliente';

    const etapasAvancadasSemMensagemGenerica = [
        'analise_correcoes',
        'abertura_processo',
        'boleto_emitido',
        'boleto_pago',
        'agendamento_realizado',
        'treinamento_realizado',
        'entrevista_realizada',
        'visto_aprovado',
        'passaporte_retornado',
        'visto_recusado'
    ];

    if (etapasAvancadasSemMensagemGenerica.includes(etapaAtual)) {
        console.log(`🚫 Cliente ${nomeCliente} está na etapa "${etapaAtual}". Suprimindo mensagem genérica.`);
        return;
    }

    const comandos = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (comandos.includes(messageText.toLowerCase())) {
        console.log('📌 Comando de menu detectado');
        // A função processarMensagem será importada no webhookRoutes
        // Por enquanto, apenas retornamos para evitar o envio da mensagem genérica
        return;
    }

    let msg = `👋 Olá ${nomeCliente}!\n\n`;
    if (etapaMsg) msg += `📌 Última movimentação: **${etapaMsg}**\n\n`;
    msg += `📱 Tem alguma dúvida sobre seu processo?\n\n`;
    msg += `💬 Fique à vontade para perguntar.\n\n`;
    msg += `Digite 0 para acessar o menu principal.`;

    console.log(`📨 Enviando mensagem padrão para ${cleanPhone}`);
    const { sendReply } = require('../utils/whatsappClient');
    await sendReply(cleanPhone, msg);
}

module.exports = {
    cadastrarCliente,
    buscarClienteEmQualquerTabela,
    processarClienteFinalizado,
    processarClienteAtivo
};