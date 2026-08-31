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
// FUNÇÃO DE EXTRAÇÃO DO PDF (VERSÃO MELHORADA)
// ============================================================
// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF - FORMATO OFICIAL DOS EUA
// ============================================================
// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF - FORMATO OFICIAL DOS EUA (COM DEBUG)
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF - Formato Oficial dos EUA...');
    
    // ============================================================
    // 1. LOG DO TEXTO PARA DEBUG
    // ============================================================
    console.log('📄 TEXTO DO PDF (primeiros 500 caracteres):');
    console.log('=' .repeat(50));
    console.log(pdfText.substring(0, 500));
    console.log('=' .repeat(50));
    
    // Procura por "Nome do Solicitante" no texto
    const nomeIndex = pdfText.indexOf('Nome do Solicitante');
    console.log(`🔍 Posição de "Nome do Solicitante": ${nomeIndex}`);
    
    if (nomeIndex === -1) {
        console.log('⚠️ "Nome do Solicitante" não encontrado no texto!');
        console.log('🔍 Tentando encontrar padrões alternativos...');
        
        // Tenta encontrar nomes em maiúsculas
        const linhas = pdfText.split('\n');
        let nomesEncontrados = [];
        
        for (const linha of linhas) {
            const trimmed = linha.trim();
            // Procura por linhas com apenas letras maiúsculas e espaços
            if (trimmed === trimmed.toUpperCase() && 
                trimmed.length > 10 && 
                trimmed.split(' ').length >= 2 &&
                !trimmed.includes('DATA') &&
                !trimmed.includes('HORA') &&
                !trimmed.includes('LOCAL') &&
                !trimmed.includes('DS-160') &&
                !trimmed.includes('PASSAPORTE') &&
                !trimmed.includes('NÚMERO')) {
                nomesEncontrados.push(trimmed);
                console.log(`✅ Nome encontrado (maiúsculas): "${trimmed}"`);
            }
        }
        
        if (nomesEncontrados.length === 0) {
            console.log('❌ Nenhum nome encontrado no PDF!');
            return agendamentos;
        }
        
        // Usa os nomes encontrados
        const nomes = nomesEncontrados;
        console.log(`📋 ${nomes.length} nomes encontrados:`, nomes);
        
        // ============================================================
        // 2. EXTRAIR DS-160
        // ============================================================
        const ds160Pattern = /Número DS-160\s+([A-Z0-9]{10,})/g;
        const ds160s = [];
        let match;
        while ((match = ds160Pattern.exec(pdfText)) !== null) {
            ds160s.push(match[1].trim());
        }
        console.log(`📋 DS-160 encontrados: ${ds160s.join(', ')}`);
        
        // ============================================================
        // 3. EXTRAIR DATAS E HORÁRIOS
        // ============================================================
        // CASV
        const casvPattern = /Data do Agendamento no CASV:\s*(\d{1,2})\s+([A-Za-zçã]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([^\n]+)/i;
        const casvMatch = pdfText.match(casvPattern);
        let casvData = null, casvHora = null, casvLocal = null;
        
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
        let entrevistaData = null, entrevistaHora = null, entrevistaLocal = null;
        
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
        // 4. EXTRAIR LOCAIS COMPLETOS
        // ============================================================
        const localCasvPattern = /Local do CASV:\s*([^\n]+)/i;
        const localCasvMatch = pdfText.match(localCasvPattern);
        let localCasvCompleto = null;
        if (localCasvMatch) {
            localCasvCompleto = localCasvMatch[1].trim();
            console.log(`📍 Local CASV completo: ${localCasvCompleto}`);
        }
        
        const localConsuladoPattern = /Local do Consulado:\s*([^\n]+)/i;
        const localConsuladoMatch = pdfText.match(localConsuladoPattern);
        let localConsuladoCompleto = null;
        if (localConsuladoMatch) {
            localConsuladoCompleto = localConsuladoMatch[1].trim();
            console.log(`📍 Local Consulado completo: ${localConsuladoCompleto}`);
        }
        
        // ============================================================
        // 5. CRIAR AGENDAMENTOS PARA CADA SOLICITANTE
        // ============================================================
        if (casvData || entrevistaData) {
            for (let i = 0; i < nomes.length; i++) {
                const nome = nomes[i];
                const ds160 = ds160s[i] || ds160s[0] || null;
                
                if (casvData && casvHora) {
                    agendamentos.push({
                        nomeCliente: nome,
                        atividade: 'CASV',
                        dataCompromisso: casvData,
                        horaCompromisso: casvHora,
                        localCompromisso: localCasvCompleto || casvLocal || 'Consulado Americano',
                        protocolo_ds160: ds160,
                    });
                    console.log(`✅ CASV criado para ${nome}: ${casvData} ${casvHora}`);
                }
                
                if (entrevistaData && entrevistaHora) {
                    agendamentos.push({
                        nomeCliente: nome,
                        atividade: 'ENTREVISTA',
                        dataCompromisso: entrevistaData,
                        horaCompromisso: entrevistaHora,
                        localCompromisso: localConsuladoCompleto || entrevistaLocal || 'Consulado Americano',
                        protocolo_ds160: ds160,
                    });
                    console.log(`✅ ENTREVISTA criado para ${nome}: ${entrevistaData} ${entrevistaHora}`);
                }
            }
        } else {
            console.log('⚠️ Nenhuma data de agendamento encontrada!');
        }
        
        console.log(`📋 Total de ${agendamentos.length} agendamentos extraídos.`);
        return agendamentos;
    }
    
    // ============================================================
    // SE ENCONTROU "Nome do Solicitante" (fluxo original)
    // ============================================================
    const nomePattern = /Nome do Solicitante\s+([A-ZÀ-Ú\s]+?)(?=\s+Classe do visto|$)/g;
    const nomes = [];
    let matchNome;
    while ((matchNome = nomePattern.exec(pdfText)) !== null) {
        const nome = matchNome[1].trim();
        if (nome && nome.length > 3) {
            nomes.push(nome);
            console.log(`✅ Nome encontrado: ${nome}`);
        }
    }
    
    if (nomes.length === 0) {
        console.log('⚠️ Nenhum nome encontrado com o padrão "Nome do Solicitante"');
        return agendamentos;
    }
    
    console.log(`📋 ${nomes.length} solicitantes encontrados`);
    
    // ... continua com o resto da extração (mesmo código de cima)
    // Extrair DS-160, datas, locais e criar agendamentos...
    
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