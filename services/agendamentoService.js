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
// FUNÇÃO DE EXTRAÇÃO SIMPLIFICADA - APENAS 3 DADOS
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF (versão simplificada)...');
    
    // ============================================================
    // 1. EXTRAIR NOMES - PRIORIDADE: "Nome do Solicitante"
    // ============================================================
    const nomes = [];
    
    // 🔥 Estratégia 1: "Nome do Solicitante" - MAIS CONFIÁVEL
    console.log('🔍 Buscando "Nome do Solicitante"...');
    const nomeRegex = /Nome do Solicitante\s+([A-Z\s]+?)(?=\s+Classe|$|\n)/gi;
    let match;
    while ((match = nomeRegex.exec(pdfText)) !== null) {
        let nome = match[1].trim();
        // Remove caracteres especiais
        nome = nome.replace(/[^A-Z\s]/g, '').trim();
        // Verifica se é um nome válido (2+ palavras, mais de 10 caracteres)
        if (nome && nome.length > 10 && nome.split(/\s+/).length >= 2) {
            // Verifica se não é um cabeçalho
            const headers = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 'PROTOCOLO', 
                           'INSTRUÇÕES', 'DEPARTAMENTO', 'DOCUMENTAÇÃO', 'VISITANTE', 'NEGÓCIOS', 
                           'TURISMO', 'TRATAMENTO', 'MÉDICO', 'TAXA', 'SOLICITAÇÃO', 'ENTREGA'];
            if (!headers.some(h => nome.toUpperCase().includes(h))) {
                nomes.push(nome);
                console.log(`✅ Nome encontrado: ${nome}`);
            }
        }
    }
    
    // 🔥 Estratégia 2: Fallback - linhas em maiúsculas (apenas se a estratégia 1 falhou)
    if (nomes.length === 0) {
        console.log('🔍 Fallback: buscando nomes em maiúsculas...');
        const linhas = pdfText.split('\n');
        let nomesTemp = [];
        for (const linha of linhas) {
            const trimmed = linha.trim();
            // Nome em maiúsculas com 3+ palavras, mais de 15 caracteres
            if (trimmed === trimmed.toUpperCase() && 
                trimmed.length > 15 && 
                trimmed.split(/\s+/).length >= 3) {
                // Verifica se NÃO é um cabeçalho (palavras proibidas)
                const palavrasProibidas = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 
                                          'PROTOCOLO', 'INSTRUÇÕES', 'DEPARTAMENTO', 'DOCUMENTAÇÃO', 
                                          'VISITANTE', 'NEGÓCIOS', 'TURISMO', 'TRATAMENTO', 'MÉDICO', 
                                          'TAXA', 'SOLICITAÇÃO', 'ENTREGA', 'PASSAPORTE', 'VISTO'];
                if (!palavrasProibidas.some(p => trimmed.includes(p))) {
                    nomesTemp.push(trimmed);
                }
            }
        }
        
        // Remove duplicatas e pega os primeiros (evita capturar coisas erradas)
        const nomesUnicosTemp = [...new Set(nomesTemp)];
        for (const n of nomesUnicosTemp.slice(0, 10)) {
            // Verifica se parece um nome (não tem números, não tem parênteses)
            if (!n.includes('(') && !n.includes(')') && !/\d/.test(n)) {
                nomes.push(n);
                console.log(`✅ Nome encontrado (fallback): ${n}`);
            }
        }
    }
    
    // Se ainda não encontrou, tenta extrair nomes específicos do PDF
    if (nomes.length === 0) {
        console.log('🔍 Tentando extrair nomes específicos...');
        // Busca padrões como "LUCIO MARTINS DOS SANTOS"
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
    
    // Remove duplicatas
    const nomesUnicos = [...new Set(nomes)];
    console.log(`📋 ${nomesUnicos.length} nomes encontrados:`);
    nomesUnicos.forEach((n, i) => console.log(`   ${i+1}. ${n}`));

    // ============================================================
    // 2. EXTRAIR DATAS - CASV E ENTREVISTA
    // ============================================================
    let casvData = null, casvHora = null;
    let entrevistaData = null, entrevistaHora = null;
    
    // 🔥 CASV - busca no texto
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
    
    // 🔥 ENTREVISTA - busca no texto
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
    
    // 🔥 FALLBACK: se não encontrou, tenta formato alternativo
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
        
        // Tenta horários
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
                localCompromisso: 'Consulado Americano - Rio de Janeiro'
            });
        }
        if (entrevistaData && entrevistaHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'ENTREVISTA',
                dataCompromisso: entrevistaData,
                horaCompromisso: entrevistaHora,
                localCompromisso: 'Consulado Americano - Rio de Janeiro'
            });
        }
    }

    console.log(`📋 Total: ${agendamentos.length} agendamentos`);
    return agendamentos;
}

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF (SIMPLIFICADA)
// ============================================================
async function extractAndSavePdfAgendamentos(pdfBuffer, telefoneCliente, options = {}) {
    const { enviarWhatsApp = true } = options;
    
    console.log('📄 Processando PDF...');
    console.log(`📱 Telefone: ${telefoneCliente}`);
    console.log(`📢 Enviar WhatsApp: ${enviarWhatsApp ? 'SIM' : 'NÃO'}`);
    
    try {
        if (typeof pdfParse !== 'function') {
            throw new Error('pdfParse não é uma função.');
        }

        const data = await pdfParse(pdfBuffer);
        const pdfText = data.text;

        // 🔥 EXTRAI OS AGENDAMENTOS
        const agendamentosExtraidos = extractAgendamentoDetailsFromText(pdfText);

        if (agendamentosExtraidos.length === 0) {
            console.log('⚠️ Nenhum agendamento encontrado.');
            return { success: false, message: 'Nenhum agendamento encontrado no PDF.' };
        }

        // 🔥 COLETA MEMBROS ÚNICOS
        const membrosSet = new Set();
        for (const ag of agendamentosExtraidos) {
            if (ag.nomeCliente) {
                membrosSet.add(ag.nomeCliente);
            }
        }
        const todosMembros = Array.from(membrosSet);
        console.log(`👨‍👩‍👧‍👦 Membros: ${todosMembros.length}`);

        // 🔥 PEGA O PRIMEIRO NOME PARA O CLIENTE
        const nomeDoCliente = agendamentosExtraidos[0]?.nomeCliente || 'Cliente';

        // 🔥 BUSCA OU CRIA CLIENTE
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
            console.error('❌ Erro ao criar cliente:', clienteError);
            return { success: false, message: 'Erro ao criar cliente.' };
        }

        const clienteId = cliente.id;

        // 🔥 SALVA AGENDAMENTOS
        const agendamentosSalvos = [];
        for (const ag of agendamentosExtraidos) {
            const [dia, mes, ano] = ag.dataCompromisso.split('/');
            const dataBanco = `${ano}-${mes}-${dia}`;

            // Verifica duplicata
            const { data: existente } = await supabase
                .from('agendamentos')
                .select('id')
                .eq('cliente_id', clienteId)
                .eq('data_agendamento', dataBanco)
                .eq('hora_agendamento', ag.horaCompromisso)
                .eq('atividade', ag.atividade)
                .maybeSingle();

            if (existente) {
                console.log(`⏭️ Duplicado: ${ag.atividade} - ${ag.dataCompromisso}`);
                continue;
            }

            const novoAgendamento = {
                cliente_id: clienteId,
                atividade: ag.atividade,
                data_agendamento: dataBanco,
                hora_agendamento: ag.horaCompromisso,
                local_agendamento: ag.localCompromisso || 'Consulado Americano - Rio de Janeiro',
                concluido: false,
                observacoes: `Membro: ${ag.nomeCliente}`
            };

            const { data: salvo, error: saveError } = await supabase
                .from('agendamentos')
                .insert([novoAgendamento])
                .select()
                .single();

            if (saveError) {
                console.error('❌ Erro ao salvar:', saveError);
                continue;
            }

            agendamentosSalvos.push(salvo);
            console.log(`✅ Salvo: ${ag.atividade} - ${ag.dataCompromisso}`);
        }

                // 🔥 PREPARA DADOS PARA RETORNO
                // 🔥 PREPARA DADOS PARA RETORNO
        const casv = agendamentosExtraidos.find(a => a.atividade === 'CASV');
        const entrevista = agendamentosExtraidos.find(a => a.atividade === 'ENTREVISTA');

        // 🔥 CRIA O OBJETO DE RETORNO (CORRIGIDO)
        const dadosRetorno = {
            casv: casv ? { 
                data: casv.dataCompromisso, 
                hora: casv.horaCompromisso,
                local: casv.localCompromisso 
            } : null,
            entrevista: entrevista ? { 
                data: entrevista.dataCompromisso, 
                hora: entrevista.horaCompromisso,
                local: entrevista.localCompromisso 
            } : null,
            todosMembros: todosMembros
        };

        console.log('📊 DADOS EXTRAÍDOS:');
        console.log(`   CASV: ${dadosRetorno.casv?.data || 'N/A'} ${dadosRetorno.casv?.hora || 'N/A'}`);
        console.log(`   ENTREVISTA: ${dadosRetorno.entrevista?.data || 'N/A'} ${dadosRetorno.entrevista?.hora || 'N/A'}`);
        console.log(`   MEMBROS: ${todosMembros.join(', ')}`);

        // 🔥 ENVIA WHATSAPP SE PERMITIDO
        if (agendamentosSalvos.length > 0 && enviarWhatsApp) {
            try {
                const mensagem = gerarMensagemAgendamentos(agendamentosSalvos, nomeDoCliente);
                await enviarWhatsApp(telefoneCliente, mensagem);
                console.log(`📱 WhatsApp enviado`);
            } catch (notifyError) {
                console.error('❌ Erro ao enviar WhatsApp:', notifyError);
            }
        } else if (agendamentosSalvos.length > 0 && !enviarWhatsApp) {
            console.log(`⏭️ WhatsApp desabilitado`);
        }

        // 🔥 RETORNO - USANDO A VARIÁVEL CORRETA
        return { 
            success: true, 
            agendamentosSalvos,
            dados: dadosExtraidos  // <-- AQUI: USAR dadosRetorno
        };
    } catch (error) {
        console.error('❌ Erro:', error);
        return { success: false, message: 'Erro interno.', error: error.message };
    }


    // ============================================================
    // 5. VERIFICA SE TEM DADOS SUFICIENTES
    // ============================================================
    if (!casvData && !entrevistaData) {
        console.log('❌ Nenhuma data de agendamento encontrada!');
        console.log('📄 Procure por: "Data do Agendamento no CASV" no texto');
        return agendamentos;
    }

    // ============================================================
    // 6. CRIA OS AGENDAMENTOS PARA CADA NOME
    // ============================================================
    for (const nome of nomesUnicos) {
        // CASV
        if (casvData && casvHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'CASV',
                dataCompromisso: casvData,
                horaCompromisso: casvHora,
                localCompromisso: casvLocal || 'Consulado Americano - Rio de Janeiro',
                protocolo_ds160: ds160,
            });
            console.log(`✅ CASV criado para: ${nome}`);
        }
        
        // Entrevista
        if (entrevistaData && entrevistaHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'ENTREVISTA',
                dataCompromisso: entrevistaData,
                horaCompromisso: entrevistaHora,
                localCompromisso: entrevistaLocal || 'Consulado Americano - Rio de Janeiro',
                protocolo_ds160: ds160,
            });
            console.log(`✅ ENTREVISTA criada para: ${nome}`);
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
    
    const casv = agendamentos.find(a => a.atividade === 'CASV');
    const entrevista = agendamentos.find(a => a.atividade === 'ENTREVISTA');
    
    const casvData = casv?.data_agendamento ? new Date(casv.data_agendamento).toLocaleDateString('pt-BR') : 'A definir';
    const casvHora = casv?.hora_agendamento?.substring(0, 5) || 'A definir';
    const entrevistaData = entrevista?.data_agendamento ? new Date(entrevista.data_agendamento).toLocaleDateString('pt-BR') : 'A definir';
    const entrevistaHora = entrevista?.hora_agendamento?.substring(0, 5) || 'A definir';
    
    return `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n` +
        `Olá *${primeiroNome}*! Seus agendamentos foram realizados!\n\n` +
        `📍 *CASV:*\n📅 ${casvData}\n⏰ ${casvHora}\n\n` +
        `📍 *ENTREVISTA:*\n📅 ${entrevistaData}\n⏰ ${entrevistaHora}\n\n` +
        `⚠️ Leve CONFIRMATION IMPRESSA e PASSAPORTE\n` +
        `📎 PDF enviado por e-mail\n\n` +
        `🌟 Boa sorte!`;
}


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