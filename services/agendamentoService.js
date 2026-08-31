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
// FUNÇÃO DE EXTRAÇÃO SIMPLIFICADA
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF...');
    
    // ============================================================
    // 1. EXTRAIR NOMES - PRIORIDADE: "Nome do Solicitante"
    // ============================================================
    const nomes = [];
    
    // Estratégia 1: "Nome do Solicitante"
    console.log('🔍 Buscando "Nome do Solicitante"...');
    const nomeRegex = /Nome do Solicitante\s+([A-Z\s]+?)(?=\s+Classe|$|\n)/gi;
    let match;
    while ((match = nomeRegex.exec(pdfText)) !== null) {
        let nome = match[1].trim();
        nome = nome.replace(/[^A-Z\s]/g, '').trim();
        if (nome && nome.length > 10 && nome.split(/\s+/).length >= 2) {
            const headers = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 'PROTOCOLO', 
                           'INSTRUÇÕES', 'DEPARTAMENTO', 'DOCUMENTAÇÃO', 'VISITANTE', 'NEGÓCIOS', 
                           'TURISMO', 'TRATAMENTO', 'MÉDICO', 'TAXA', 'SOLICITAÇÃO', 'ENTREGA'];
            if (!headers.some(h => nome.toUpperCase().includes(h))) {
                nomes.push(nome);
                console.log(`✅ Nome encontrado: ${nome}`);
            }
        }
    }
    
    // Estratégia 2: Fallback - linhas em maiúsculas
    if (nomes.length === 0) {
        console.log('🔍 Fallback: buscando nomes em maiúsculas...');
        const linhas = pdfText.split('\n');
        let nomesTemp = [];
        for (const linha of linhas) {
            const trimmed = linha.trim();
            if (trimmed === trimmed.toUpperCase() && 
                trimmed.length > 15 && 
                trimmed.split(/\s+/).length >= 3) {
                const palavrasProibidas = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 
                                          'PROTOCOLO', 'INSTRUÇÕES', 'DEPARTAMENTO', 'DOCUMENTAÇÃO', 
                                          'VISITANTE', 'NEGÓCIOS', 'TURISMO', 'TRATAMENTO', 'MÉDICO', 
                                          'TAXA', 'SOLICITAÇÃO', 'ENTREGA', 'PASSAPORTE', 'VISTO'];
                if (!palavrasProibidas.some(p => trimmed.includes(p))) {
                    nomesTemp.push(trimmed);
                }
            }
        }
        
        const nomesUnicosTemp = [...new Set(nomesTemp)];
        for (const n of nomesUnicosTemp.slice(0, 10)) {
            if (!n.includes('(') && !n.includes(')') && !/\d/.test(n)) {
                nomes.push(n);
                console.log(`✅ Nome encontrado (fallback): ${n}`);
            }
        }
    }
    
    // Estratégia 3: Nomes específicos
    if (nomes.length === 0) {
        console.log('🔍 Tentando extrair nomes específicos...');
        const nomeEspecifico = /([A-Z]{3,}\s+[A-Z]{3,}(?:\s+[A-Z]{3,})*)/g;
        while ((match = nomeEspecifico.exec(pdfText)) !== null) {
            const nome = match[1].trim();
            if (nome && nome.length > 15 && nome.split(/\s+/).length >= 3) {
                const palavrasProibidas = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 
                                          'PROTOCOLO', 'INSTRUÇÕES', 'DEPARTAMENTO'];
                if (!palavrasProibidas.some(p => nome.includes(p))) {
                    nomes.push(nome);
                    console.log(`✅ Nome encontrado (específico): ${nome}`);
                }
            }
        }
    }
    
    if (nomes.length === 0) {
        console.log('❌ Nenhum nome encontrado!');
        return agendamentos;
    }
    
    const nomesUnicos = [...new Set(nomes)];
    console.log(`📋 ${nomesUnicos.length} nomes encontrados:`);
    nomesUnicos.forEach((n, i) => console.log(`   ${i+1}. ${n}`));

    // ============================================================
    // 2. EXTRAIR DATAS - CASV E ENTREVISTA
    // ============================================================
    let casvData = null, casvHora = null, casvLocal = null;
    let entrevistaData = null, entrevistaHora = null, entrevistaLocal = null;
    
    // CASV
    const casvRegex = /Data do Agendamento no CASV:\s*(\d{1,2})\s+([A-Za-z]+),\s+(\d{4}),\s+(\d{2}:\d{2})/i;
    const casvMatch = pdfText.match(casvRegex);
    if (casvMatch) {
        const dia = casvMatch[1].padStart(2, '0');
        const mes = mesesMap[casvMatch[2]] || mesesMap[casvMatch[2] + ','];
        const ano = casvMatch[3];
        if (mes) {
            casvData = `${dia}/${mes}/${ano}`;
            casvHora = casvMatch[4];
            console.log(`✅ CASV: ${casvData} ${casvHora}`);
        }
    }
    
    // Entrevista
    const entrevistaRegex = /Data da entrevista no Consulado:\s*(\d{1,2})\s+([A-Za-z]+),\s+(\d{4}),\s+(\d{2}:\d{2})/i;
    const entrevistaMatch = pdfText.match(entrevistaRegex);
    if (entrevistaMatch) {
        const dia = entrevistaMatch[1].padStart(2, '0');
        const mes = mesesMap[entrevistaMatch[2]] || mesesMap[entrevistaMatch[2] + ','];
        const ano = entrevistaMatch[3];
        if (mes) {
            entrevistaData = `${dia}/${mes}/${ano}`;
            entrevistaHora = entrevistaMatch[4];
            console.log(`✅ ENTREVISTA: ${entrevistaData} ${entrevistaHora}`);
        }
    }
    
    // Local CASV
    const localCasvRegex = /Local do CASV:\s*([^\n]+)/i;
    const localCasvMatch = pdfText.match(localCasvRegex);
    if (localCasvMatch) {
        casvLocal = localCasvMatch[1].trim();
        console.log(`✅ Local CASV: ${casvLocal}`);
    }
    
    // Local Entrevista
    const localEntrevistaRegex = /Local da Entrevista:\s*([^\n]+)/i;
    const localEntrevistaMatch = pdfText.match(localEntrevistaRegex);
    if (localEntrevistaMatch) {
        entrevistaLocal = localEntrevistaMatch[1].trim();
        console.log(`✅ Local ENTREVISTA: ${entrevistaLocal}`);
    }
    
    // Fallback de local
    if (!casvLocal) casvLocal = 'Consulado Americano - Rio de Janeiro';
    if (!entrevistaLocal) entrevistaLocal = 'Consulado Americano - Rio de Janeiro';
    
    // Fallback de datas
    if (!casvData && !entrevistaData) {
        console.log('🔍 Tentando formato alternativo de datas...');
        const dataAltRegex = /(\d{1,2})\s+([A-Za-z]+),\s+(\d{4})/g;
        const datasAlt = [];
        while ((match = dataAltRegex.exec(pdfText)) !== null) {
            const dia = match[1].padStart(2, '0');
            const mes = mesesMap[match[2]] || mesesMap[match[2] + ','];
            const ano = match[3];
            if (mes && parseInt(ano) >= 2024) {
                datasAlt.push(`${dia}/${mes}/${ano}`);
            }
        }
        if (datasAlt.length >= 2) {
            casvData = datasAlt[0];
            entrevistaData = datasAlt[1];
            console.log(`✅ CASV (alt): ${casvData}`);
            console.log(`✅ ENTREVISTA (alt): ${entrevistaData}`);
        } else if (datasAlt.length === 1) {
            casvData = datasAlt[0];
            console.log(`✅ CASV (alt): ${casvData}`);
        }
        
        const horaAltRegex = /(\d{1,2}:\d{2})/g;
        const horasAlt = pdfText.match(horaAltRegex) || [];
        if (horasAlt.length >= 2) {
            casvHora = horasAlt[0];
            entrevistaHora = horasAlt[1];
        } else if (horasAlt.length === 1) {
            casvHora = horasAlt[0];
        }
    }

    if (!casvData && !entrevistaData) {
        console.log('❌ Nenhuma data encontrada!');
        return agendamentos;
    }

    // ============================================================
    // 3. CRIAR AGENDAMENTOS PARA CADA NOME
    // ============================================================
    for (const nome of nomesUnicos) {
        if (casvData && casvHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'CASV',
                dataCompromisso: casvData,
                horaCompromisso: casvHora,
                localCompromisso: casvLocal || 'Consulado Americano - Rio de Janeiro'
            });
        }
        if (entrevistaData && entrevistaHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'ENTREVISTA',
                dataCompromisso: entrevistaData,
                horaCompromisso: entrevistaHora,
                localCompromisso: entrevistaLocal || 'Consulado Americano - Rio de Janeiro'
            });
        }
    }

    console.log(`📋 Total: ${agendamentos.length} agendamentos`);
    return agendamentos;
}

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF
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

        // ============================================================
        // COLETA TODOS OS MEMBROS ÚNICOS
        // ============================================================
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

        // ============================================================
        // DADOS EXTRAÍDOS DIRETOS
        // ============================================================
        const primeiroAgendamento = agendamentosExtraidos[0];
        const nomeDoCliente = primeiroAgendamento?.nomeCliente || 'Cliente';
        
        const casvData = agendamentosExtraidos.find(a => a.atividade === 'CASV');
        const entrevistaData = agendamentosExtraidos.find(a => a.atividade === 'ENTREVISTA');
        
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
            nome: nomeDoCliente,
            todosMembros: todosMembros
        };
        
        console.log('📊 DADOS EXTRAÍDOS:');
        console.log(`   CASV: ${dadosExtraidos.casv?.data || 'N/A'} ${dadosExtraidos.casv?.hora || 'N/A'}`);
        console.log(`   ENTREVISTA: ${dadosExtraidos.entrevista?.data || 'N/A'} ${dadosExtraidos.entrevista?.hora || 'N/A'}`);
        console.log(`   MEMBROS: ${todosMembros.join(', ')}`);

        // ============================================================
        // BUSCAR OU CRIAR CLIENTE
        // ============================================================
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

        // ============================================================
        // SALVAR AGENDAMENTOS
        // ============================================================
        const agendamentosSalvos = [];
        
        for (const agendamentoData of agendamentosExtraidos) {
            const { nomeCliente, atividade, dataCompromisso, horaCompromisso, localCompromisso } = agendamentoData;

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

        // ============================================================
        // ENVIAR WHATSAPP
        // ============================================================
        if (agendamentosSalvos.length > 0 && enviarWhatsApp) {
            try {
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

        // ============================================================
        // RETORNO
        // ============================================================
        return { 
            success: true, 
            agendamentosSalvos,
            dados: {
                casv: dadosExtraidos.casv,
                entrevista: dadosExtraidos.entrevista,
                todosMembros: todosMembros
            }
        };

    } catch (error) {
        console.error('❌ Erro ao processar PDF:', error);
        return { success: false, message: 'Erro interno ao processar PDF.', error: error.message };
    }
}

// ============================================================
// FUNÇÃO PARA GERAR MENSAGEM DIRETA
// ============================================================
function gerarMensagemDireta(dados, nomeCliente, todosMembros = []) {
    const primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : 'Cliente';
    
    const casv = dados?.casv || {};
    const entrevista = dados?.entrevista || {};
    
    const casvData = casv?.data || 'A definir';
    const casvHora = casv?.hora || 'A definir';
    const casvLocal = casv?.local || 'A definir';
    
    const entrevistaData = entrevista?.data || 'A definir';
    const entrevistaHora = entrevista?.hora || 'A definir';
    const entrevistaLocal = entrevista?.local || 'A definir';
    
    let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n`;
    mensagem += `Olá *${primeiroNome}*! Seus agendamentos foram realizados com sucesso!\n\n`;
    
    if (todosMembros && todosMembros.length > 0) {
        mensagem += `👨‍👩‍👧‍👦 *Membros:*\n`;
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