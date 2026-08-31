// services/agendamentoService.js
const supabase = require('../config/supabase');
const clientRepository = require('../repositories/clientRepository');
const lembretesService = require('./lembretes.service');
const pdfParse = require('pdf-parse');
const { enviarWhatsApp } = require('../utils/whatsappClient');

console.log('✅ pdfParse carregado com sucesso!');

// Mapeamento de meses
const mesesMap = {
    "Janeiro": "01", "Fevereiro": "02", "Março": "03", "Abril": "04", "Maio": "05", "Junho": "06",
    "Julho": "07", "Agosto": "08", "Setembro": "09", "Outubro": "10", "Novembro": "11", "Dezembro": "12",
    "Janeiro,": "01", "Fevereiro,": "02", "Março,": "03", "Abril,": "04", "Maio,": "05", "Junho,": "06",
    "Julho,": "07", "Agosto,": "08", "Setembro,": "09", "Outubro,": "10", "Novembro,": "11", "Dezembro,": "12"
};

function formatarDataPdf(dia, mes_nome, ano) {
    const mesNumero = mesesMap[mes_nome];
    if (!mesNumero) {
        console.warn(`Mês '${mes_nome}' não encontrado no mapeamento.`);
        return null;
    }
    return `${String(parseInt(dia)).padStart(2, '0')}/${mesNumero}/${ano}`;
}

function mapLocalToText(local) {
    const localUpper = local.toUpperCase();
    if (localUpper.includes('RIO DE JANEIRO')) return 'Consulado Americano - Rio de Janeiro';
    if (localUpper.includes('BRASILIA')) return 'Consulado Americano - Brasília';
    if (localUpper.includes('SAO PAULO') || localUpper.includes('SÃO PAULO')) return 'Consulado Americano - São Paulo';
    if (localUpper.includes('RECIFE')) return 'Consulado Americano - Recife';
    if (localUpper.includes('PORTO ALEGRE')) return 'Consulado Americano - Porto Alegre';
    return local.trim();
}

function mapAtividadeToText(atividade) {
    const atividadeUpper = atividade.toUpperCase();
    if (atividadeUpper.includes('CASV')) return 'CASV';
    if (atividadeUpper.includes('ENTREVISTA')) return 'Entrevista no Consulado Americano';
    if (atividadeUpper.includes('TREINAMENTO')) return 'Treinamento';
    if (atividadeUpper.includes('RETIRADA')) return 'Retirada do Passaporte';
    return atividade.trim();
}

// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF (VERSÃO ORIGINAL QUE FUNCIONAVA)
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF...');
    
    // Regex para extrair informações
    const regexInfo = {
        nome: /^([A-ZÀ-Ú\s]+?)(?=\s+Classe do visto|$)/,
        ds160: /Número DS-160\s+([A-Z0-9]+)/,
        casv: /Data do Agendamento no CASV:\s*(\d{1,2})\s+([A-Za-zçã]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([A-Za-z\s-]+?)(?:\s+Horário local|$)/,
        entrevista: /Data da entrevista no Consulado:\s*(\d{1,2})\s+([A-Za-zçã]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([A-Za-z\s-]+?)(?:\s+Horário local|$)/
    };
    
    // Extrair CASV e Entrevista globais
    let matchCasv = pdfText.match(regexInfo.casv);
    let matchEntrevista = pdfText.match(regexInfo.entrevista);
    
    let casvData = null, casvHora = null, casvLocal = null;
    let entrevistaData = null, entrevistaHora = null, entrevistaLocal = null;
    
    if (matchCasv) {
        const [, dia, mes_nome, ano, hora, local] = matchCasv;
        const dataFormatada = formatarDataPdf(dia, mes_nome, ano);
        if (dataFormatada) {
            casvData = dataFormatada;
            casvHora = hora;
            casvLocal = local.trim();
            console.log(`✅ CASV encontrado: ${casvData} ${casvHora} - ${casvLocal}`);
        }
    }
    
    if (matchEntrevista) {
        const [, dia, mes_nome, ano, hora, local] = matchEntrevista;
        const dataFormatada = formatarDataPdf(dia, mes_nome, ano);
        if (dataFormatada) {
            entrevistaData = dataFormatada;
            entrevistaHora = hora;
            entrevistaLocal = local.trim();
            console.log(`✅ Entrevista encontrada: ${entrevistaData} ${entrevistaHora} - ${entrevistaLocal}`);
        }
    }
    
    if (!casvData && !entrevistaData) {
        console.log('⚠️ Nenhuma data de agendamento encontrada no PDF.');
        return agendamentos;
    }
    
    // Extrair nomes dos solicitantes
    const blocos = pdfText.split(/Nome do Solicitante\s*/);
    const blocosSolicitantes = blocos.slice(1);
    
    console.log(`📋 ${blocosSolicitantes.length} blocos de solicitantes encontrados`);
    
    // Extrair DS-160
    const matchDs160 = pdfText.match(regexInfo.ds160);
    let ds160 = matchDs160 ? matchDs160[1].trim() : null;
    
    for (const bloco of blocosSolicitantes) {
        const linhasBloco = bloco.split('\n');
        let nome = null;
        
        if (linhasBloco.length > 0) {
            const primeiraLinha = linhasBloco[0].trim();
            const matchNome = primeiraLinha.match(/^([A-ZÀ-Ú\s]+?)(?=\s+Classe do visto|$)/);
            if (matchNome) {
                nome = matchNome[1].trim();
            }
        }
        
        if (!nome) {
            const matchNome = bloco.match(regexInfo.nome);
            if (matchNome) {
                nome = matchNome[1].trim();
            }
        }
        
        if (!nome) {
            console.warn(`⚠️ Nome não encontrado em um bloco. Pulando.`);
            continue;
        }
        
        console.log(`✅ Nome encontrado: ${nome}`);
        
        if (casvData && casvHora && casvLocal) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'CASV',
                dataCompromisso: casvData,
                horaCompromisso: casvHora,
                localCompromisso: casvLocal,
                protocolo_ds160: ds160,
            });
        }
        
        if (entrevistaData && entrevistaHora && entrevistaLocal) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'ENTREVISTA',
                dataCompromisso: entrevistaData,
                horaCompromisso: entrevistaHora,
                localCompromisso: entrevistaLocal,
                protocolo_ds160: ds160,
            });
        }
    }
    
    console.log(`📋 Total de ${agendamentos.length} agendamentos extraídos.`);
    return agendamentos;
}

// ============================================================
// FUNÇÃO PARA GERAR MENSAGEM DE NOTIFICAÇÃO (VERSÃO MELHORADA)
// ============================================================
function gerarMensagemAgendamentos(agendamentos, nomeCliente) {
    const primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : 'Cliente';
    
    // Separa CASV e ENTREVISTA
    const casv = agendamentos.find(a => a.atividade && a.atividade.toUpperCase().includes('CASV'));
    const entrevista = agendamentos.find(a => a.atividade && a.atividade.toUpperCase().includes('ENTREVISTA'));
    
    // Se não encontrou pela atividade, tenta pelo nome ou posição
    const casvFinal = casv || agendamentos[0];
    const entrevistaFinal = entrevista || agendamentos[1] || agendamentos[0];
    
    // Formata as datas
    const casvData = casvFinal?.data_agendamento ? new Date(casvFinal.data_agendamento).toLocaleDateString('pt-BR') : 'A definir';
    const casvHora = casvFinal?.hora_agendamento?.substring(0, 5) || 'A definir';
    const casvLocal = casvFinal?.local_agendamento || 'A definir';
    
    const entrevistaData = entrevistaFinal?.data_agendamento ? new Date(entrevistaFinal.data_agendamento).toLocaleDateString('pt-BR') : 'A definir';
    const entrevistaHora = entrevistaFinal?.hora_agendamento?.substring(0, 5) || 'A definir';
    const entrevistaLocal = entrevistaFinal?.local_agendamento || 'A definir';
    
    const protocolo = casvFinal?.protocolo_ds160 || entrevistaFinal?.protocolo_ds160 || 'N/A';
    
    let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n`;
    mensagem += `Olá *${primeiroNome}*! Seus agendamentos foram realizados com sucesso!\n\n`;
    mensagem += `📍 *CASV (Coleta Biométrica):*\n`;
    mensagem += `📅 ${casvData}\n`;
    mensagem += `⏰ ${casvHora}\n`;
    mensagem += `📍 ${casvLocal}\n\n`;
    mensagem += `📍 *ENTREVISTA NO CONSULADO:*\n`;
    mensagem += `📅 ${entrevistaData}\n`;
    mensagem += `⏰ ${entrevistaHora}\n`;
    mensagem += `📍 ${entrevistaLocal}\n\n`;
    mensagem += `⚠️ *IMPORTANTE:*\n`;
    mensagem += `• Leve a *CONFIRMATION IMPRESSA*\n`;
    mensagem += `• Leve seu *PASSAPORTE(S)*\n`;
    mensagem += `• Chegue com 30 minutos de antecedência\n\n`;
    mensagem += `📎 O PDF oficial foi enviado para seu e-mail.\n\n`;
    mensagem += `📱 Dúvidas? [Fale com nosso especialista](https://wa.me/5521974601812)\n\n`;
    mensagem += `🌟 *Boa sorte! Estamos com você!* ✈️`;
    
    console.log('📊 Mensagem gerada:');
    console.log(`   CASV: ${casvData} ${casvHora} - ${casvLocal}`);
    console.log(`   ENTREVISTA: ${entrevistaData} ${entrevistaHora} - ${entrevistaLocal}`);
    
    return mensagem;
}

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF
// ============================================================
// services/agendamentoService.js

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF (VERSÃO CORRIGIDA)
// ============================================================
// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF (COM LISTA DE MEMBROS)
// ============================================================
async function extractAndSavePdfAgendamentos(pdfBuffer, telefoneCliente, options = {}) {
    const { enviarWhatsApp = true } = options;
    
    console.log('📄 Processando PDF...');
    console.log(`📱 Telefone do cliente: ${telefoneCliente}`);
    console.log(`📢 Enviar WhatsApp: ${enviarWhatsApp ? 'SIM' : 'NÃO'}`);
    
    try {
        if (typeof pdfParse !== 'function') {
            throw new Error('pdfParse não é uma função.');
        }

        const data = await pdfParse(pdfBuffer);
        const pdfText = data.text;

        const agendamentosExtraidos = extractAgendamentoDetailsFromText(pdfText);

        if (agendamentosExtraidos.length === 0) {
            console.log('⚠️ Nenhum agendamento encontrado no PDF.');
            return { success: false, message: 'Nenhum agendamento encontrado no PDF.' };
        }

        // 🔥 COLETA TODOS OS MEMBROS ÚNICOS
        const membrosSet = new Set();
        const todosMembros = [];
        
        for (const ag of agendamentosExtraidos) {
            if (ag.nomeCliente && !membrosSet.has(ag.nomeCliente)) {
                membrosSet.add(ag.nomeCliente);
                todosMembros.push(ag.nomeCliente);
            }
        }
        
        console.log(`👨‍👩‍👧‍👦 Membros encontrados: ${todosMembros.length}`);
        todosMembros.forEach((m, i) => console.log(`   ${i+1}. ${m}`));

        // 🔥 EXTRAI OS DADOS DIRETOS DA EXTRAÇÃO
        const primeiroAgendamento = agendamentosExtraidos[0];
        const nomeDoCliente = primeiroAgendamento?.nomeCliente || 'Cliente';
        const protocolo = primeiroAgendamento?.protocolo_ds160 || null;
        
        // PEGA CASV E ENTREVISTA DIRETAMENTE DOS DADOS EXTRAÍDOS
        const casvData = agendamentosExtraidos.find(a => a.atividade === 'CASV');
        const entrevistaData = agendamentosExtraidos.find(a => a.atividade === 'ENTREVISTA');
        
        // DADOS PARA RETORNO DIRETO
        const dadosExtraidos = {
            casv: casvData ? {
                data: casvData.dataCompromisso,
                hora: casvData.horaCompromisso,
                local: casvData.localCompromisso
            } : null,
            entrevista: entrevistaData ? {
                data: entrevistaData.dataCompromisso,
                hora: entrevistaData.horaCompromisso,
                local: entrevistaData.localCompromisso
            } : null,
            protocolo: protocolo,
            nome: nomeDoCliente,
            todosMembros: todosMembros // 🔥 LISTA DE MEMBROS
        };
        
        console.log('📊 DADOS EXTRAÍDOS DIRETOS:');
        console.log(`   Membros: ${todosMembros.join(', ')}`);
        console.log(`   CASV: ${dadosExtraidos.casv?.data || 'N/A'} ${dadosExtraidos.casv?.hora || 'N/A'}`);
        console.log(`   ENTREVISTA: ${dadosExtraidos.entrevista?.data || 'N/A'} ${dadosExtraidos.entrevista?.hora || 'N/A'}`);

        // BUSCAR OU CRIAR CLIENTE COM UPSERT (USANDO O PRIMEIRO NOME)
        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .upsert({
                nome: nomeDoCliente,
                telefone: telefoneCliente,
                status: 'lead',
                data_contato: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'telefone'
            })
            .select()
            .single();

        if (clienteError) {
            console.error('❌ Erro ao buscar/criar cliente:', clienteError);
            return { success: false, message: 'Erro ao buscar/criar cliente.' };
        }

        const clienteId = cliente.id;
        console.log(`✅ Cliente encontrado/criado: ${cliente.nome} (${cliente.telefone})`);

        // SALVAR AGENDAMENTOS NO BANCO
        const agendamentosSalvos = [];
        
        for (const agendamentoData of agendamentosExtraidos) {
            const { nomeCliente, atividade, dataCompromisso, horaCompromisso, localCompromisso, protocolo_ds160 } = agendamentoData;

            if (!atividade || !dataCompromisso || !horaCompromisso || !localCompromisso) {
                console.warn('⚠️ Dados de agendamento incompletos, pulando.');
                continue;
            }

            const [dia, mes, ano] = dataCompromisso.split('/');
            const dataFormatadaParaBanco = `${ano}-${mes}-${dia}`;

            const localTexto = mapLocalToText(localCompromisso);
            const atividadeTexto = mapAtividadeToText(atividade);

            // Verificar duplicata
            const { data: existentes } = await supabase
                .from('agendamentos')
                .select('id')
                .eq('cliente_id', clienteId)
                .eq('data_agendamento', dataFormatadaParaBanco)
                .eq('hora_agendamento', horaCompromisso)
                .eq('atividade', atividadeTexto)
                .maybeSingle();

            if (existentes) {
                console.log(`⏭️ Agendamento duplicado ignorado: ${atividadeTexto} - ${dataFormatadaParaBanco}`);
                continue;
            }

            const novoAgendamento = {
                cliente_id: clienteId,
                atividade: atividadeTexto,
                data_agendamento: dataFormatadaParaBanco,
                hora_agendamento: horaCompromisso,
                local_agendamento: localTexto,
                protocolo_ds160: protocolo_ds160 || null,
                concluido: false,
                observacoes: `Membro: ${nomeCliente}`
            };

            console.log(`📝 Salvando agendamento: ${atividadeTexto} - ${dataFormatadaParaBanco} ${horaCompromisso}`);

            const { data: salvo, error: saveError } = await supabase
                .from('agendamentos')
                .insert([novoAgendamento])
                .select()
                .single();

            if (saveError) {
                console.error('❌ Erro ao salvar agendamento:', saveError);
                continue;
            }

            agendamentosSalvos.push(salvo);
            console.log(`✅ Agendamento salvo: ${salvo.id}`);
        }

        // SÓ ENVIA WHATSAPP SE A FLAG PERMITIR (USANDO DADOS DIRETOS)
        if (agendamentosSalvos.length > 0 && enviarWhatsApp) {
            try {
                // 🔥 USA OS DADOS DIRETOS COM A LISTA DE MEMBROS
                const mensagem = gerarMensagemDireta(dadosExtraidos, nomeDoCliente, todosMembros);
                const enviado = await enviarWhatsApp(telefoneCliente, mensagem);
                if (enviado) {
                    console.log(`📱 Notificação enviada para ${telefoneCliente}`);
                } else {
                    console.log(`⚠️ Falha ao enviar notificação para ${telefoneCliente}`);
                }
            } catch (notifyError) {
                console.error('❌ Erro ao enviar notificação:', notifyError);
            }
        } else if (agendamentosSalvos.length > 0 && !enviarWhatsApp) {
            console.log(`⏭️ Envio de WhatsApp DESABILITADO (flag enviarWhatsApp: false)`);
        }

        // RETORNA OS DADOS DIRETOS PARA A ROTA
        return { 
    success: true, 
    agendamentosSalvos,
    dados: {
        casv: dadosParaRetorno.casv,
        entrevista: dadosParaRetorno.entrevista,
        todosMembros: todosMembros,  // 🔥 LISTA DE MEMBROS
        protocolo: protocolo
    }
};

    } catch (error) {
        console.error('❌ Erro ao processar PDF:', error);
        return { success: false, message: 'Erro interno ao processar PDF.', error: error.message };
    }
}

// ============================================================
// FUNÇÃO PARA GERAR MENSAGEM DIRETA (USANDO DADOS EXTRAÍDOS)
// ============================================================
// ============================================================
// FUNÇÃO PARA GERAR MENSAGEM DIRETA (COM LISTA DE MEMBROS)
// ============================================================
function gerarMensagemDireta(dados, nomeCliente, todosMembros = []) {
    const primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : 'Cliente';
    
    const casv = dados?.casv || {};
    const entrevista = dados?.entrevista || {};
    const protocolo = dados?.protocolo || 'N/A';
    
    const casvData = casv?.data || 'A definir';
    const casvHora = casv?.hora || 'A definir';
    const casvLocal = casv?.local || 'A definir';
    
    const entrevistaData = entrevista?.data || 'A definir';
    const entrevistaHora = entrevista?.hora || 'A definir';
    const entrevistaLocal = entrevista?.local || 'A definir';
    
    let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n`;
    mensagem += `Olá *${primeiroNome}*! Seus agendamentos foram realizados com sucesso!\n\n`;
    
    // 🔥 LISTA DE MEMBROS DA FAMÍLIA
    if (todosMembros && todosMembros.length > 0) {
        mensagem += `👨‍👩‍👧‍👦 *Membros da família:*\n`;
        todosMembros.forEach((membro, index) => {
            mensagem += `   ${index + 1}️⃣ ${membro}\n`;
        });
        mensagem += `\n`;
    }
    
    mensagem += `📍 *CASV (Coleta Biométrica):*\n`;
    mensagem += `📅 ${casvData}\n`;
    mensagem += `⏰ ${casvHora}\n`;
    mensagem += `📍 ${casvLocal}\n\n`;
    
    mensagem += `📍 *ENTREVISTA NO CONSULADO:*\n`;
    mensagem += `📅 ${entrevistaData}\n`;
    mensagem += `⏰ ${entrevistaHora}\n`;
    mensagem += `📍 ${entrevistaLocal}\n\n`;
    
    mensagem += `⚠️ *IMPORTANTE:*\n`;
    mensagem += `• Leve a *CONFIRMATION IMPRESSA*\n`;
    mensagem += `• Leve seu *PASSAPORTE(S)*\n`;
    mensagem += `• Chegue com 30 minutos de antecedência\n\n`;
    mensagem += `📎 O PDF oficial foi enviado para seu e-mail.\n\n`;
    mensagem += `📱 Dúvidas? [Fale com nosso especialista](https://wa.me/5521974601812)\n\n`;
    mensagem += `🌟 *Boa sorte! Estamos com você!* ✈️`;
    
    console.log('📊 Mensagem DIRETA gerada com membros:');
    console.log(`   Membros: ${todosMembros.join(', ')}`);
    console.log(`   CASV: ${casvData} ${casvHora} - ${casvLocal}`);
    console.log(`   ENTREVISTA: ${entrevistaData} ${entrevistaHora} - ${entrevistaLocal}`);
    
    return mensagem;
}

// ============================================================
// FUNÇÕES ADICIONAIS
// ============================================================
async function getGeneralReport() {
    const { data, error } = await supabase
        .from('agendamentos')
        .select(`
            *,
            clientes ( nome, telefone )
        `)
        .order('data_agendamento', { ascending: true })
        .order('hora_agendamento', { ascending: true });

    if (error) {
        console.error('❌ Erro ao buscar relatório geral:', error);
        return [];
    }
    return data;
}

async function markAgendamentoAsConcluido(agendamentoId) {
    const { data, error } = await supabase
        .from('agendamentos')
        .update({ concluido: true })
        .eq('id', agendamentoId)
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao marcar agendamento como concluído:', error);
        return { success: false, message: 'Erro ao marcar agendamento como concluído.' };
    }
    return { success: true, message: 'Agendamento marcado como concluído.', agendamento: data };
}

async function updateAgendamentoDetails(agendamentoId, { dataCompromisso, horaCompromisso, localCompromisso }) {
    const updatePayload = {};
    if (dataCompromisso) {
        const [dia, mes, ano] = dataCompromisso.split('/');
        updatePayload.data_agendamento = `${ano}-${mes}-${dia}`;
    }
    if (horaCompromisso) updatePayload.hora_agendamento = horaCompromisso;
    if (localCompromisso) updatePayload.local_agendamento = mapLocalToText(localCompromisso);

    const { data, error } = await supabase
        .from('agendamentos')
        .update(updatePayload)
        .eq('id', agendamentoId)
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao editar agendamento:', error);
        return { success: false, message: 'Erro ao editar agendamento.' };
    }
    return { success: true, message: 'Agendamento editado com sucesso.', agendamento: data };
}

async function deleteAgendamento(agendamentoId) {
    const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', agendamentoId);

    if (error) {
        console.error('❌ Erro ao excluir agendamento:', error);
        return false;
    }
    return true;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    extractAndSavePdfAgendamentos,
    getGeneralReport,
    markAgendamentoAsConcluido,
    updateAgendamentoDetails,
    deleteAgendamento
};