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
// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF (VERSÃO SIMPLIFICADA E ROBUSTA)
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF (versão simplificada)...');
    console.log('📄 Tamanho do texto:', pdfText.length);
    
    // ============================================================
    // 1. LOG PARA DEBUG - MOSTRA PARTE DO TEXTO
    // ============================================================
    console.log('📄 PRIMEIROS 300 CARACTERES DO PDF:');
    console.log('=' .repeat(50));
    console.log(pdfText.substring(0, 300));
    console.log('=' .repeat(50));
    
    // ============================================================
    // 2. EXTRAIR DS-160
    // ============================================================
    let ds160 = null;
    const ds160Match = pdfText.match(/N[uú]mero DS-160\s+([A-Z0-9]{10,})/i);
    if (ds160Match) {
        ds160 = ds160Match[1].trim();
        console.log(`✅ DS-160 encontrado: ${ds160}`);
    }

    // ============================================================
    // 3. EXTRAIR NOMES - MÚLTIPLAS ESTRATÉGIAS
    // ============================================================
    const nomes = [];
    
    // Estratégia 1: "Nome do Solicitante" (com acentos)
    const nomeRegex1 = /Nome do Solicitante\s+([A-ZÀ-Ú\s]+?)(?=\s+Classe|$)/gi;
    let match;
    while ((match = nomeRegex1.exec(pdfText)) !== null) {
        const nome = match[1].trim();
        if (nome && nome.length > 5) {
            nomes.push(nome);
            console.log(`✅ Nome encontrado (Regex1): ${nome}`);
        }
    }
    
    // Estratégia 2: "Nome do Solicitante" com quebra de linha
    if (nomes.length === 0) {
        const nomeRegex2 = /Nome do Solicitante[\s\n]+([A-ZÀ-Ú\s]+?)(?=\s+Classe|$)/gi;
        while ((match = nomeRegex2.exec(pdfText)) !== null) {
            const nome = match[1].trim();
            if (nome && nome.length > 5) {
                nomes.push(nome);
                console.log(`✅ Nome encontrado (Regex2): ${nome}`);
            }
        }
    }
    
    // Estratégia 3: Linhas em maiúsculas (fallback)
    if (nomes.length === 0) {
        console.log('🔍 Tentando encontrar nomes em maiúsculas...');
        const linhas = pdfText.split('\n');
        for (const linha of linhas) {
            const trimmed = linha.trim();
            // Nome em maiúsculas com 2+ palavras e mais de 10 caracteres
            if (trimmed === trimmed.toUpperCase() && 
                trimmed.length > 10 && 
                trimmed.split(/\s+/).length >= 2 &&
                !trimmed.includes('DATA') &&
                !trimmed.includes('HORA') &&
                !trimmed.includes('LOCAL') &&
                !trimmed.includes('DS-160') &&
                !trimmed.includes('PASSAPORTE') &&
                !trimmed.includes('NÚMERO') &&
                !trimmed.includes('INSTRUÇÕES') &&
                !trimmed.includes('SOLICITANTE')) {
                nomes.push(trimmed);
                console.log(`✅ Nome encontrado (maiúsculas): ${trimmed}`);
            }
        }
    }
    
    // Estratégia 4: Buscar qualquer nome com 2+ palavras em maiúsculas no texto
    if (nomes.length === 0) {
        const nomeRegex3 = /([A-Z]{3,}\s+[A-Z]{3,}(?:\s+[A-Z]{3,})*)/g;
        while ((match = nomeRegex3.exec(pdfText)) !== null) {
            const nome = match[1].trim();
            if (nome && nome.length > 10 && nome.split(/\s+/).length >= 2) {
                // Verifica se não é um cabeçalho
                const headers = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 'PROTOCOLO', 'DS-160'];
                if (!headers.some(h => nome.includes(h))) {
                    nomes.push(nome);
                    console.log(`✅ Nome encontrado (Regex3): ${nome}`);
                }
            }
        }
    }
    
    // Se não encontrou nenhum nome
    if (nomes.length === 0) {
        console.log('⚠️ NENHUM NOME ENCONTRADO!');
        console.log('📄 Últimos 300 caracteres do PDF:');
        console.log(pdfText.substring(pdfText.length - 300));
        return agendamentos;
    }
    
    // Remove duplicatas
    const nomesUnicos = [...new Set(nomes)];
    console.log(`📋 ${nomesUnicos.length} nomes únicos encontrados:`, nomesUnicos);

    // ============================================================
    // 4. EXTRAIR DATAS E HORÁRIOS DO CASV
    // ============================================================
    let casvData = null, casvHora = null, casvLocal = null;
    let entrevistaData = null, entrevistaHora = null, entrevistaLocal = null;
    
    // CASV
    const casvPattern = /Data do Agendamento no CASV:\s*(\d{1,2})\s+([A-Za-zçã]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([^\n]+)/i;
    const casvMatch = pdfText.match(casvPattern);
    if (casvMatch) {
        const [, dia, mes, ano, hora, local] = casvMatch;
        const mesNumero = mesesMap[mes] || mesesMap[mes + ','];
        if (mesNumero) {
            casvData = `${String(parseInt(dia)).padStart(2, '0')}/${mesNumero}/${ano}`;
            casvHora = hora;
            casvLocal = local.trim();
            console.log(`✅ CASV: ${casvData} ${casvHora} - ${casvLocal}`);
        }
    }
    
    // Entrevista
    const entrevistaPattern = /Data da entrevista no Consulado:\s*(\d{1,2})\s+([A-Za-zçã]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([^\n]+)/i;
    const entrevistaMatch = pdfText.match(entrevistaPattern);
    if (entrevistaMatch) {
        const [, dia, mes, ano, hora, local] = entrevistaMatch;
        const mesNumero = mesesMap[mes] || mesesMap[mes + ','];
        if (mesNumero) {
            entrevistaData = `${String(parseInt(dia)).padStart(2, '0')}/${mesNumero}/${ano}`;
            entrevistaHora = hora;
            entrevistaLocal = local.trim();
            console.log(`✅ ENTREVISTA: ${entrevistaData} ${entrevistaHora} - ${entrevistaLocal}`);
        }
    }

    // ============================================================
    // 5. SE NÃO ENCONTROU DATAS, TENTA PADRÕES ALTERNATIVOS
    // ============================================================
    if (!casvData && !entrevistaData) {
        console.log('🔍 Tentando encontrar datas em formato alternativo...');
        
        // Tenta encontrar datas no formato "16/09/2026"
        const dataAltPattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
        const datasAlt = [];
        let dataMatch;
        while ((dataMatch = dataAltPattern.exec(pdfText)) !== null) {
            const dia = dataMatch[1];
            const mes = dataMatch[2];
            const ano = dataMatch[3];
            // Verifica se é uma data válida (ano 2024-2030)
            if (parseInt(ano) >= 2024 && parseInt(ano) <= 2030) {
                datasAlt.push(`${dia}/${mes}/${ano}`);
            }
        }
        
        if (datasAlt.length >= 2) {
            casvData = datasAlt[0];
            entrevistaData = datasAlt[1];
            console.log(`✅ CASV (alternativo): ${casvData}`);
            console.log(`✅ ENTREVISTA (alternativo): ${entrevistaData}`);
        } else if (datasAlt.length === 1) {
            casvData = datasAlt[0];
            console.log(`✅ CASV (alternativo): ${casvData}`);
        }
        
        // Tenta encontrar horários
        const horaAltPattern = /(\d{1,2}:\d{2})/g;
        const horasAlt = pdfText.match(horaAltPattern) || [];
        if (horasAlt.length >= 2) {
            casvHora = horasAlt[0];
            entrevistaHora = horasAlt[1];
            console.log(`✅ Horários encontrados: ${casvHora}, ${entrevistaHora}`);
        } else if (horasAlt.length === 1) {
            casvHora = horasAlt[0];
            console.log(`✅ Horário CASV: ${casvHora}`);
        }
        
        // Local padrão
        if (!casvLocal) casvLocal = 'Consulado Americano - Rio de Janeiro';
        if (!entrevistaLocal) entrevistaLocal = 'Consulado Americano - Rio de Janeiro';
    }

    // ============================================================
    // 6. VERIFICA SE TEM DADOS SUFICIENTES
    // ============================================================
    if (!casvData && !entrevistaData) {
        console.log('⚠️ Nenhuma data de agendamento encontrada!');
        console.log('📄 Procure por: "Data do Agendamento no CASV" no texto');
        return agendamentos;
    }

    // ============================================================
    // 7. CRIA OS AGENDAMENTOS PARA CADA NOME
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