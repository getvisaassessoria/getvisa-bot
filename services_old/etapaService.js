// services/etapaService.js
const supabase = require('../config/supabase');
const { ETAPAS, FEATURES } = require('../config/constants');
const { limparTelefone, formatarTelefone } = require('../utils/helpers');
const { enviarWhatsApp } = require('../utils/whatsappClient'); // Importa a função de envio de WhatsApp

async function criarEtapaInicial(telefone) {
    try {
        const telefoneLimpo = limparTelefone(telefone);
        console.log('📱 Criando etapa para telefone limpo:', telefoneLimpo);

        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome, criado_em')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (error) {
            console.error('❌ Erro ao buscar cliente em clientes_ativos:', error);
            return null;
        }

        if (!cliente) {
            console.log('⚠️ Cliente não encontrado em clientes_ativos para criar etapa:', telefoneLimpo);
            return null;
        }

        console.log('✅ Cliente encontrado para criar etapa:', cliente);

        const { data: etapaExistente } = await supabase
            .from('etapas_processo')
            .select('id')
            .eq('cliente_telefone', telefoneLimpo)
            .maybeSingle();

        if (etapaExistente) {
            console.log('ℹ️ Etapa já existe para:', telefoneLimpo);
            return etapaExistente;
        }

        const novaEtapa = {
            cliente_telefone: telefoneLimpo,
            etapa_atual: 'formulario_enviado',
            data_inicio: new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            historico: [{
                etapa: 'formulario_enviado',
                data: new Date().toISOString(),
                nota: 'Inicio do processo',
                observacao: `Cliente movido para clientes_ativos - ${cliente.nome || 'Sem nome'}`
            }]
        };

        const { data, error: insertError } = await supabase
            .from('etapas_processo')
            .insert(novaEtapa)
            .select()
            .single();

        if (insertError) {
            console.error('❌ Erro ao criar etapa inicial:', insertError);
            return null;
        }

        console.log('✅ Etapa inicial criada para:', telefoneLimpo);
        return data;

    } catch (error) {
        console.error('❌ Erro ao criar etapa inicial:', error);
        return null;
    }
}

function gerarMensagemEtapa(etapaId, nome) {
    const primeiroNome = nome && typeof nome === 'string'
        ? nome.trim().split(' ')[0]
        : 'Cliente';

    const mensagens = {
        formulario_enviado:
            `🎉 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Formulário Enviado\n\n` +
            `Recebemos seu formulário e seu processo foi iniciado com sucesso.\n\n` +
            `Nossa equipe dará continuidade à análise das informações.`,

        analise_correcoes:
            `🔎 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Análise e Correções\n\n` +
            `Seu processo está em análise.\n\n` +
            `Caso seja necessário algum ajuste, nossa equipe entrará em contato.`,

        abertura_processo:
            `📂 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Abertura do Processo\n\n` +
            `Seu processo foi aberto com sucesso!\n\n` +
            `Seguiremos agora com os próximos procedimentos.`,

        boleto_emitido:
            `💳 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Boleto Emitido\n\n` +
            `O boleto para pagamento da taxa consular foi emitido.\n\n` +
            `Após o pagamento, nos informe para realizarmos o agendamento.\n\n` +
            `Verifique as orientações da nossa equipe para pagamento.`,

        boleto_pago:
            `✅ Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Boleto Pago\n\n` +
            `Em até 24h o consulado disponibilizará o agendamento.\n\n` +
            `Favor fazer o pagamento restante (50%) da assessoria.`,

        agendamento_realizado:
            `📅 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Agendamento CASV e Consulado\n\n` +
            `Seu agendamento foi realizado com sucesso!\n\n` +
            `Vamos agendar nossa reunião para treinamento da entrevista.\n\n` +
            `Nossa equipe enviará as orientações necessárias para essa fase.`,

        treinamento_realizado:
            `🎯 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Treinamento Concluído\n\n` +
            `Seu treinamento foi concluído!\n\n` +
            `Você está preparado(a) para a entrevista!`,

        entrevista_realizada:
            `🎤 Olá ${primeiroNome}!\n\n` +
            `📋 Etapa atual: Entrevista Realizada\n\n` +
            `Registramos a realização da sua entrevista.\n\n` +
            `Agora aguardaremos a definição do resultado consular.`,

        visto_aprovado:
            `🎉 Parabéns, ${primeiroNome}!\n\n` +
            `Seu visto foi aprovado! ✅\n\n` +
            `📋 Próximo passo: aguardaremos a devolução do seu passaporte.\n\n` +
            `Assim que ele estiver disponível para retirada ou entrega, avisaremos você por aqui. ✈️`,

        passaporte_retornado:
            `📦 Olá ${primeiroNome}!\n\n` +
            `Excelente notícia: seu passaporte já está disponível! ✅\n\n` +
            `Nossa equipe entrará em contato para combinar a retirada ou a entrega.\n\n` +
            `A GetVisa agradece a sua confiança e deseja uma ótima viagem! ✈️`,

        visto_recusado:
            `😔 Olá ${primeiroNome}.\n\n` +
            `Recebemos a atualização de que o visto não foi aprovado nesta solicitação.\n\n` +
            `Sabemos que esse momento pode ser difícil. Nossa equipe analisará os detalhes para orientar você sobre os próximos passos e uma possível nova estratégia.\n\n` +
            `Conte com a GetVisa.`
    };

    return mensagens[etapaId] || null;
}

async function notificarClienteEtapa(telefone, novaEtapa) {
    console.log('📨 ===== INICIANDO NOTIFICAÇÃO DE ETAPA =====');
    console.log('📨 Telefone recebido:', telefone);
    console.log('📨 Nova etapa:', novaEtapa);

    try {
        const telefoneOriginal = String(telefone || '').trim();
        const telefoneLimpo = limparTelefone(telefoneOriginal);
        const telefoneFormatado = formatarTelefone(telefoneLimpo);

        if (!telefoneLimpo) {
            console.error('❌ Telefone inválido para notificação:', telefone);
            return {
                sucesso: false,
                motivo: 'telefone_invalido',
                telefone: telefoneOriginal,
                etapa: novaEtapa
            };
        }

        console.log('📱 Telefone original:', telefoneOriginal);
        console.log('📱 Telefone limpo:', telefoneLimpo);
        console.log('📱 Telefone formatado:', telefoneFormatado);

        const telefonesParaBuscar = [
            telefoneLimpo,
            telefoneFormatado,
            telefoneOriginal
        ].filter((valor, indice, array) => valor && array.indexOf(valor) === indice);

        let cliente = null;

        for (const telefoneBusca of telefonesParaBuscar) {
            console.log('🔍 Buscando cliente ativo para notificação:', telefoneBusca);

            const { data, error } = await supabase
                .from('clientes_ativos')
                .select('nome, telefone')
                .eq('telefone', telefoneBusca)
                .maybeSingle();

            if (error) {
                console.error('❌ Erro ao buscar cliente ativo:', error);
                continue;
            }

            if (data) {
                cliente = data;
                console.log('✅ Cliente encontrado para notificação:', cliente);
                break;
            }
        }

        if (!cliente) {
            console.warn('⚠️ Cliente não encontrado em clientes_ativos para notificação:', telefoneOriginal);
            return {
                sucesso: false,
                motivo: 'cliente_nao_encontrado',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        const nomeCliente = cliente.nome && typeof cliente.nome === 'string' && cliente.nome.trim() && !cliente.nome.startsWith('Cliente_')
            ? cliente.nome.trim()
            : 'Cliente';

        console.log('👤 Nome usado na mensagem:', nomeCliente);

        const mensagem = gerarMensagemEtapa(novaEtapa, nomeCliente);

        if (!mensagem) {
            console.warn('⚠️ Nenhuma mensagem configurada para a etapa:', novaEtapa);
            return {
                sucesso: false,
                motivo: 'mensagem_nao_configurada',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        console.log('✅ Mensagem gerada com sucesso.');
        console.log('📨 Enviando WhatsApp para:', telefoneLimpo);

        const enviado = await enviarWhatsApp(telefoneLimpo, mensagem);

        if (!enviado) {
            console.error('❌ Z-API não confirmou o envio da notificação.');
            return {
                sucesso: false,
                motivo: 'falha_no_envio_whatsapp',
                telefone: telefoneLimpo,
                etapa: novaEtapa
            };
        }

        console.log('✅ Notificação enviada com sucesso para ' + telefoneLimpo + ' | Etapa: ' + novaEtapa);

        return {
            sucesso: true,
            telefone: telefoneLimpo,
            etapa: novaEtapa,
            cliente: nomeCliente
        };

    } catch (error) {
        console.error('❌ ERRO CRÍTICO EM notificarClienteEtapa:', error);
        console.error('❌ Stack:', error.stack);

        return {
            sucesso: false,
            motivo: 'erro_interno',
            telefone: telefone,
            etapa: novaEtapa,
            erro: error.message
        };
    }
}

async function processarAvanco(res, etapaAtual, nota, observacao, telefone) {
    try {
        console.log('📌 processarAvanco iniciado para:', telefone);

        const etapaId = etapaAtual.etapa_atual;
        const etapaInfo = ETAPAS[etapaId];

        if (!etapaInfo) {
            console.error('❌ Etapa não encontrada:', etapaId);
            return res.status(400).json({
                sucesso: false,
                erro: 'Etapa não encontrada: ' + etapaId
            });
        }

        const proximaEtapa = etapaInfo.next;

        console.log('📌 Etapa atual:', etapaId);
        console.log('📌 Próxima etapa:', proximaEtapa);

        if (!proximaEtapa) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Cliente já está na última etapa'
            });
        }

        if (!ETAPAS[proximaEtapa]) {
            console.error('❌ Próxima etapa inválida:', proximaEtapa);
            return res.status(400).json({
                sucesso: false,
                erro: 'Próxima etapa não encontrada: ' + proximaEtapa
            });
        }

        const agora = new Date().toISOString();
        const campoData = 'data_' + proximaEtapa;

        const historicoAtualizado = [
            ...(etapaAtual.historico || []),
            {
                etapa: proximaEtapa,
                data: agora,
                nota: nota || 'Avanço manual pelo painel',
                observacao: observacao || 'Cliente avançado pelo painel administrativo'
            }
        ];

        const dadosAtualizacao = {
            etapa_atual: proximaEtapa,
            data_atualizacao: agora,
            historico: historicoAtualizado,
            [campoData]: agora
        };

        console.log('📌 Campo de data:', campoData);
        console.log('📌 Atualizando para:', proximaEtapa);

        const { data: dadosAtualizados, error: erroAtualizacao } = await supabase
            .from('etapas_processo')
            .update(dadosAtualizacao)
            .eq('cliente_telefone', telefone)
            .select()
            .single();

        if (erroAtualizacao) {
            console.error('❌ Erro ao atualizar etapa:', erroAtualizacao);
            throw erroAtualizacao;
        }

        console.log('✅ Etapa atualizada com sucesso:', proximaEtapa);

        let resultadoNotificacao = {
            sucesso: false,
            motivo: 'notificacao_desativada'
        };

        if (FEATURES.SISTEMA_ETAPAS.notificar_cliente === true) {
            try {
                resultadoNotificacao = await notificarClienteEtapa(
                    telefone,
                    proximaEtapa
                );
            } catch (erroNotificacao) {
                console.error('❌ Erro inesperado ao notificar cliente:', erroNotificacao);
                resultadoNotificacao = {
                    sucesso: false,
                    motivo: 'erro_interno_notificacao',
                    erro: erroNotificacao.message
                };
            }
        }

        console.log('📨 Resultado da notificação:', resultadoNotificacao);
        console.log('✅ Cliente ' + telefone + ' avançou de ' + etapaId + ' para ' + proximaEtapa);

        return {
            sucesso: true,
            etapa_anterior: etapaId,
            etapa_atual: proximaEtapa,
            notificacao: resultadoNotificacao,
            dados: dadosAtualizados
        };

    } catch (error) {
        console.error('❌ ERRO em processarAvanco:', error);
        console.error('❌ Stack:', error.stack);

        throw new Error('Erro ao processar avanço: ' + error.message);
    }
}

module.exports = {
    criarEtapaInicial,
    gerarMensagemEtapa,
    notificarClienteEtapa,
    processarAvanco
};