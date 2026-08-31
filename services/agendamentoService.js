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
// FUNÇÃO DE EXTRAÇÃO DO PDF
// ============================================================
// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF (VERSÃO MELHORADA)
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF...');
    console.log('📄 Texto do PDF (primeiros 1000 caracteres):', pdfText.substring(0, 1000));
    
    // ============================================================
    // 1. EXTRAIR PROTOCOLO DS-160
    // ============================================================
    let ds160 = null;
    const ds160Patterns = [
        /DS-160[:\s]*([A-Z0-9]{10,})/i,
        /N[úu]mero DS-160[:\s]*([A-Z0-9]{10,})/i,
        /DS160[:\s]*([A-Z0-9]{10,})/i,
        /Confirmation Number[:\s]*([A-Z0-9]{10,})/i,
        /N[úu]mero de Confirma[çc][ãa]o[:\s]*([A-Z0-9]{10,})/i
    ];
    
    for (const pattern of ds160Patterns) {
        const match = pdfText.match(pattern);
        if (match) {
            ds160 = match[1].trim();
            console.log(`✅ Protocolo DS-160 encontrado: ${ds160}`);
            break;
        }
    }

    // ============================================================
    // 2. EXTRAIR NOMES DOS SOLICITANTES
    // ============================================================
    const nomes = [];
    
    // Padrão 1: "Nome do Solicitante: NOME"
    const nomePattern1 = /Nome do Solicitante[:\s]+([A-ZÀ-Ú\s]+?)(?=\s+Classe do visto|\s+Data|\s+DS-160|$)/gi;
    let match1;
    while ((match1 = nomePattern1.exec(pdfText)) !== null) {
        const nome = match1[1].trim();
        if (nome && nome.length > 2) {
            nomes.push(nome);
            console.log(`✅ Nome encontrado (padrão 1): ${nome}`);
        }
    }
    
    // Padrão 2: Linhas com nomes em maiúsculas
    if (nomes.length === 0) {
        const linhas = pdfText.split('\n');
        for (const linha of linhas) {
            const linhaTrim = linha.trim();
            // Nome em maiúsculas com pelo menos 2 palavras
            if (linhaTrim === linhaTrim.toUpperCase() && 
                linhaTrim.length > 5 && 
                linhaTrim.split(' ').length >= 2) {
                // Verifica se não é um cabeçalho
                const headers = ['DATA', 'HORA', 'LOCAL', 'CASV', 'ENTREVISTA', 'CONSULADO', 'PROTOCOLO'];
                if (!headers.some(h => linhaTrim.includes(h))) {
                    nomes.push(linhaTrim);
                    console.log(`✅ Nome encontrado (padrão 2): ${linhaTrim}`);
                }
            }
        }
    }

    // Se não encontrou nomes, usa um nome genérico
    if (nomes.length === 0) {
        nomes.push('Cliente');
        console.log('⚠️ Nenhum nome encontrado, usando "Cliente"');
    }

    // ============================================================
    // 3. EXTRAIR DATAS E HORÁRIOS
    // ============================================================
    
    // Padrão para data no formato: "16 de Setembro de 2026"
    const dataPattern = /(\d{1,2})\s+de\s+([A-Za-zçã]+)\s+de\s+(\d{4})/gi;
    const datasEncontradas = [];
    let dataMatch;
    while ((dataMatch = dataPattern.exec(pdfText)) !== null) {
        const dia = dataMatch[1];
        const mes = dataMatch[2];
        const ano = dataMatch[3];
        const mesNumero = mesesMap[mes] || mesesMap[mes + ','];
        if (mesNumero) {
            const dataFormatada = `${String(parseInt(dia)).padStart(2, '0')}/${mesNumero}/${ano}`;
            datasEncontradas.push(dataFormatada);
            console.log(`📅 Data encontrada: ${dataFormatada}`);
        }
    }

    // Padrão para horário: "09:45"
    const horaPattern = /(\d{1,2}:\d{2})/g;
    const horasEncontradas = pdfText.match(horaPattern) || [];
    console.log(`⏰ Horários encontrados: ${horasEncontradas.join(', ')}`);

    // ============================================================
    // 4. EXTRAIR LOCAIS
    // ============================================================
    let localCASV = null;
    let localEntrevista = null;
    
    // Procura por locais específicos
    const localPatterns = [
        /CASV[:\s]+([^\n]+)/i,
        /Entrevista[:\s]+([^\n]+)/i,
        /Consulado[:\s]+([^\n]+)/i,
        /Local[:\s]+([^\n]+)/i
    ];
    
    // Primeiro tenta encontrar locais específicos
    const localMatchCASV = pdfText.match(/CASV[:\s]+([^\n]+)/i);
    if (localMatchCASV) {
        localCASV = localMatchCASV[1].trim();
        console.log(`📍 Local CASV: ${localCASV}`);
    }
    
    const localMatchEntrevista = pdfText.match(/Entrevista[:\s]+([^\n]+)/i);
    if (localMatchEntrevista) {
        localEntrevista = localMatchEntrevista[1].trim();
        console.log(`📍 Local Entrevista: ${localEntrevista}`);
    }

    // Se não encontrou locais específicos, tenta identificar pelo contexto
    if (!localCASV || !localEntrevista) {
        const linhas = pdfText.split('\n');
        let encontrouCASV = false;
        let encontrouEntrevista = false;
        
        for (const linha of linhas) {
            const linhaLower = linha.toLowerCase();
            if (linhaLower.includes('casv') && !encontrouCASV) {
                // Pega a próxima linha que não seja vazia
                const idx = linhas.indexOf(linha);
                for (let i = idx + 1; i < Math.min(idx + 3, linhas.length); i++) {
                    const proxLinha = linhas[i].trim();
                    if (proxLinha && !proxLinha.match(/^\d/)) {
                        if (!localCASV) {
                            localCASV = proxLinha;
                            console.log(`📍 Local CASV (contexto): ${localCASV}`);
                        }
                        encontrouCASV = true;
                        break;
                    }
                }
            }
            if (linhaLower.includes('entrevista') && !encontrouEntrevista) {
                const idx = linhas.indexOf(linha);
                for (let i = idx + 1; i < Math.min(idx + 3, linhas.length); i++) {
                    const proxLinha = linhas[i].trim();
                    if (proxLinha && !proxLinha.match(/^\d/)) {
                        if (!localEntrevista) {
                            localEntrevista = proxLinha;
                            console.log(`📍 Local Entrevista (contexto): ${localEntrevista}`);
                        }
                        encontrouEntrevista = true;
                        break;
                    }
                }
            }
        }
    }

    // ============================================================
    // 5. ORGANIZAR OS DADOS POR SOLICITANTE
    // ============================================================
    
    // Se temos 2 datas, a primeira é CASV e a segunda é Entrevista
    // Se temos 2 horários, o primeiro é CASV e o segundo é Entrevista
    let casvData = datasEncontradas[0] || null;
    let entrevistaData = datasEncontradas[1] || null;
    let casvHora = horasEncontradas[0] || null;
    let entrevistaHora = horasEncontradas[1] || null;
    
    // Se só tem uma data, tenta identificar pelo contexto
    if (datasEncontradas.length === 1) {
        const textoLower = pdfText.toLowerCase();
        // Verifica se a data está associada a CASV ou Entrevista
        const dataPos = pdfText.indexOf(datasEncontradas[0]);
        const contextoAntes = pdfText.substring(Math.max(0, dataPos - 50), dataPos);
        
        if (contextoAntes.toLowerCase().includes('casv')) {
            casvData = datasEncontradas[0];
            console.log(`📅 CASV Data: ${casvData}`);
        } else if (contextoAntes.toLowerCase().includes('entrevista')) {
            entrevistaData = datasEncontradas[0];
            console.log(`📅 Entrevista Data: ${entrevistaData}`);
        } else {
            // Por padrão, assume que é CASV
            casvData = datasEncontradas[0];
            console.log(`📅 CASV Data (default): ${casvData}`);
        }
    }

    // Se só tem um horário
    if (horasEncontradas.length === 1) {
        casvHora = horasEncontradas[0];
        console.log(`⏰ CASV Hora (default): ${casvHora}`);
    }

    // Se não tem local, usa o padrão
    if (!localCASV) localCASV = 'Consulado Americano - Rio de Janeiro';
    if (!localEntrevista) localEntrevista = 'Consulado Americano - Rio de Janeiro';

    console.log('📊 RESUMO DOS DADOS EXTRAÍDOS:');
    console.log(`  CASV: ${casvData || 'A definir'} ${casvHora || 'A definir'} - ${localCASV}`);
    console.log(`  Entrevista: ${entrevistaData || 'A definir'} ${entrevistaHora || 'A definir'} - ${localEntrevista}`);

    // ============================================================
    // 6. CRIAR OS AGENDAMENTOS
    // ============================================================
    for (const nome of nomes) {
        // CASV
        if (casvData && casvHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'CASV',
                dataCompromisso: casvData,
                horaCompromisso: casvHora,
                localCompromisso: localCASV,
                protocolo_ds160: ds160,
            });
            console.log(`✅ Agendamento CASV criado para ${nome}`);
        }
        
        // Entrevista
        if (entrevistaData && entrevistaHora) {
            agendamentos.push({
                nomeCliente: nome,
                atividade: 'ENTREVISTA',
                dataCompromisso: entrevistaData,
                horaCompromisso: entrevistaHora,
                localCompromisso: localEntrevista,
                protocolo_ds160: ds160,
            });
            console.log(`✅ Agendamento Entrevista criado para ${nome}`);
        }
    }

    console.log(`📋 Total de ${agendamentos.length} agendamentos extraídos.`);
    return agendamentos;
}

// ============================================================
// FUNÇÃO PARA GERAR MENSAGEM DE NOTIFICAÇÃO
// ============================================================
function gerarMensagemAgendamentos(agendamentos, nomeCliente) {
    const primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : 'Cliente';
    
    let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n`;
    mensagem += `Olá *${primeiroNome}*! Seus agendamentos foram realizados com sucesso!\n\n`;
    mensagem += `📋 *Protocolo DS-160:* ${agendamentos[0]?.protocolo_ds160 || 'N/A'}\n\n`;
    mensagem += `📅 *DATAS CONFIRMADAS:*\n`;
    
    agendamentos.forEach((agendamento, index) => {
        const data = new Date(agendamento.data_agendamento).toLocaleDateString('pt-BR');
        const hora = agendamento.hora_agendamento?.substring(0, 5) || '00:00';
        mensagem += `\n${index + 1}️⃣ *${agendamento.atividade}*\n`;
        mensagem += `   📍 ${agendamento.local_agendamento || 'Consulado'}\n`;
        mensagem += `   📅 ${data} às ${hora}\n`;
    });
    
    mensagem += `\n📌 *IMPORTANTE:*\n`;
    mensagem += `• Chegue com 30 minutos de antecedência\n`;
    mensagem += `• Leve seu passaporte e comprovante de agendamento\n`;
    mensagem += `• Mantenha seu celular carregado\n\n`;
    mensagem += `📱 Dúvidas? Fale com a gente: https://wa.me/5521974601812\n\n`;
    mensagem += `🌟 *Boa sorte! A GetVisa está com você!* ✈️`;
    
    return mensagem;
}

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF
// ============================================================
async function extractAndSavePdfAgendamentos(pdfBuffer, telefoneCliente, options = {}) {
    // 🔥 EXTRAI A OPÇÃO - SE NÃO FOR INFORMADA, DEFAULT É true (manter compatibilidade)
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

        // BUSCAR OU CRIAR CLIENTE COM UPSERT
        const nomeDoCliente = agendamentosExtraidos[0]?.nomeCliente || 'Cliente';
        
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
        const clienteNome = cliente.nome;
        console.log(`✅ Cliente encontrado/criado: ${cliente.nome} (${cliente.telefone})`);

        // SALVAR AGENDAMENTOS USANDO O CLIENTE_ID
        const agendamentosSalvos = [];
        const dadosParaRetorno = {
            casv: null,
            entrevista: null
        };
        
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

            // 🔥 ARMAZENA OS DADOS PARA RETORNO
            if (atividadeTexto.includes('CASV')) {
                dadosParaRetorno.casv = {
                    data: dataCompromisso,
                    hora: horaCompromisso,
                    local: localTexto
                };
            } else if (atividadeTexto.includes('ENTREVISTA')) {
                dadosParaRetorno.entrevista = {
                    data: dataCompromisso,
                    hora: horaCompromisso,
                    local: localTexto
                };
            }
        }

        // 🔥 SÓ ENVIA WHATSAPP SE A FLAG PERMITIR
        if (agendamentosSalvos.length > 0 && enviarWhatsApp) {
            try {
                const mensagem = gerarMensagemAgendamentos(agendamentosSalvos, clienteNome);
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

        return { 
            success: true, 
            agendamentosSalvos,
            dados: dadosParaRetorno
        };

    } catch (error) {
        console.error('❌ Erro ao processar PDF:', error);
        return { success: false, message: 'Erro interno ao processar PDF.', error: error.message };
    }
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