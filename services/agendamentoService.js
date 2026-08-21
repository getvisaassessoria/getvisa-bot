// services/agendamentoService.js
const supabase = require('../config/supabase');
const clientRepository = require('../repositories/clientRepository');
const lembretesService = require('./lembretes.service');
const agendamentoService = require('../services/agendamentoService');
// ✅ Importação correta do pdf-parse
const pdfParse = require('pdf-parse');
console.log('✅ pdfParse carregado com sucesso!');

// Mapeamento de meses
const mesesMap = {
    "Janeiro": "01", "Fevereiro": "02", "Março": "03", "Abril": "04", "Maio": "05", "Junho": "06",
    "Julho": "07", "Agosto": "08", "Setembro": "09", "Outubro": "10", "Novembro": "11", "Dezembro": "12",
    "Janeiro,": "01", "Fevereiro,": "02", "Março,": "03", "Abril,": "04", "Maio,": "05", "Junho,": "06",
    "Julho,": "07", "Agosto,": "08", "Setembro,": "09", "Outubro,": "10", "Novembro,": "11", "Dezembro,": "12"
};

// Função auxiliar para formatar a data do PDF
function formatarDataPdf(dia, mes_nome, ano) {
    const mesNumero = mesesMap[mes_nome];
    if (!mesNumero) {
        console.warn(`Mês '${mes_nome}' não encontrado no mapeamento.`);
        return null;
    }
    return `${String(parseInt(dia)).padStart(2, '0')}/${mesNumero}/${ano}`;
}

// Função auxiliar para encontrar ou criar cliente
async function findOrCreateClient(nomeCliente, telefoneCliente) {
    let cliente = await clientRepository.findClientByTelefone(telefoneCliente);
    if (!cliente) {
        cliente = await clientRepository.createClient(nomeCliente, telefoneCliente);
    }
    return cliente;
}

// Função auxiliar para criar agendamento
async function createAgendamento(agendamentoData) {
    const { data, error } = await supabase
        .from('agendamentos')
        .insert([agendamentoData])
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao criar agendamento no Supabase:', error);
        return null;
    }
    return data;
}

// Mapear local para texto
function mapLocalToText(local) {
    const localUpper = local.toUpperCase();
    if (localUpper.includes('RIO DE JANEIRO')) return 'Consulado Americano - Rio de Janeiro';
    if (localUpper.includes('BRASILIA')) return 'Consulado Americano - Brasília';
    if (localUpper.includes('SAO PAULO') || localUpper.includes('SÃO PAULO')) return 'Consulado Americano - São Paulo';
    if (localUpper.includes('RECIFE')) return 'Consulado Americano - Recife';
    if (localUpper.includes('PORTO ALEGRE')) return 'Consulado Americano - Porto Alegre';
    return local.trim();
}

// Mapear atividade para texto
function mapAtividadeToText(atividade) {
    const atividadeUpper = atividade.toUpperCase();
    if (atividadeUpper.includes('CASV')) return 'CASV';
    if (atividadeUpper.includes('ENTREVISTA')) return 'Entrevista no Consulado Americano';
    if (atividadeUpper.includes('TREINAMENTO')) return 'Treinamento';
    if (atividadeUpper.includes('RETIRADA')) return 'Retirada do Passaporte';
    return atividade.trim();
}

// ============================================================
// FUNÇÃO DE EXTRAÇÃO DO PDF (CORRIGIDA COM FALLBACK)
// ============================================================
function extractAgendamentoDetailsFromText(pdfText) {
    const agendamentos = [];
    
    console.log('🔍 Extraindo dados do PDF...');
    
    // 🔥 CORREÇÃO: Usar split que captura tanto com espaço quanto sem
    // "Nome do Solicitante" pode vir como "Nome do Solicitante " ou "Nome do Solicitante"
    const blocos = pdfText.split(/Nome do Solicitante\s*/);
    const blocosSolicitantes = blocos.slice(1);
    
    console.log(`📋 Método 1: ${blocosSolicitantes.length} blocos encontrados`);
    
    // Regex para extrair informações
    const regexInfo = {
        // 🔥 CORREÇÃO: Nome pode estar colado ou com espaço
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
    
    // 🔥 MÉTODO 1: Processar blocos (agora com nomes colados)
    for (const bloco of blocosSolicitantes) {
        // 🔥 CORREÇÃO: Extrair nome do início do bloco
        const linhasBloco = bloco.split('\n');
        let nome = null;
        
        // A primeira linha do bloco deve conter o nome
        if (linhasBloco.length > 0) {
            const primeiraLinha = linhasBloco[0].trim();
            // O nome termina quando encontra "Classe do visto" ou "Número"
            const matchNome = primeiraLinha.match(/^([A-ZÀ-Ú\s]+?)(?=\s+Classe do visto|$)/);
            if (matchNome) {
                nome = matchNome[1].trim();
                console.log(`✅ Nome encontrado: ${nome}`);
            }
        }
        
        // Se não encontrou nome na primeira linha, tenta regex
        if (!nome) {
            const matchNome = bloco.match(regexInfo.nome);
            if (matchNome) {
                nome = matchNome[1].trim();
                console.log(`✅ Nome encontrado (regex): ${nome}`);
            }
        }
        
        const matchDs160 = bloco.match(regexInfo.ds160);
        let ds160 = null;
        if (matchDs160) {
            ds160 = matchDs160[1].trim();
            console.log(`✅ DS-160 encontrado: ${ds160}`);
        }
        
        if (!nome) {
            console.warn(`⚠️ Nome não encontrado em um bloco. Pulando.`);
            continue;
        }
        
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
    
    // 🔥 Se ainda não encontrou nada, usa fallback com nomes das linhas
    if (agendamentos.length === 0) {
        console.log('⚠️ Método 1 falhou. Tentando método 2 (extrair nomes das linhas)...');
        
        // Extrair nomes diretamente das linhas que começam com "Nome do Solicitante"
        const linhas = pdfText.split('\n');
        const nomes = [];
        const ds160s = [];
        
        for (const linha of linhas) {
            if (linha.includes('Nome do Solicitante')) {
                // Extrair nome (remover "Nome do Solicitante" do início)
                let nome = linha.replace(/Nome do Solicitante\s*/, '').trim();
                // Pegar apenas o nome (até encontrar "Classe" ou "Número")
                const matchNome = nome.match(/^([A-ZÀ-Ú\s]+?)(?=\s+Classe|$)/);
                if (matchNome) {
                    nomes.push(matchNome[1].trim());
                } else {
                    nomes.push(nome.split(' ').slice(0, 3).join(' '));
                }
            }
            
            if (linha.includes('Número DS-160')) {
                const match = linha.match(/Número DS-160\s+([A-Z0-9]+)/);
                if (match) {
                    ds160s.push(match[1].trim());
                }
            }
        }
        
        console.log(`📋 Método 2 encontrou ${nomes.length} nomes e ${ds160s.length} DS-160`);
        
        if (nomes.length > 0) {
            for (let i = 0; i < nomes.length; i++) {
                const nome = nomes[i] || `Solicitante ${i + 1}`;
                const ds160 = ds160s[i] || null;
                
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
        } else {
            // Último recurso
            console.log('⚠️ Método 2 falhou. Criando solicitante genérico...');
            if (casvData && casvHora && casvLocal) {
                agendamentos.push({
                    nomeCliente: 'Solicitante do PDF',
                    atividade: 'CASV',
                    dataCompromisso: casvData,
                    horaCompromisso: casvHora,
                    localCompromisso: casvLocal,
                    protocolo_ds160: null,
                });
            }
            if (entrevistaData && entrevistaHora && entrevistaLocal) {
                agendamentos.push({
                    nomeCliente: 'Solicitante do PDF',
                    atividade: 'ENTREVISTA',
                    dataCompromisso: entrevistaData,
                    horaCompromisso: entrevistaHora,
                    localCompromisso: entrevistaLocal,
                    protocolo_ds160: null,
                });
            }
        }
    }
    
    console.log(`📋 Total de ${agendamentos.length} agendamentos extraídos.`);
    return agendamentos;
}
// ============================================================
// FUNÇÃO PARA VERIFICAR DUPLICATAS
// ============================================================
async function verificarDuplicata(clienteId, data, hora, atividade) {
    const { data: existentes, error } = await supabase
        .from('agendamentos')
        .select('id, cliente_id, data_agendamento, hora_agendamento, atividade')
        .eq('cliente_id', clienteId)
        .eq('data_agendamento', data)
        .eq('hora_agendamento', hora)
        .eq('atividade', atividade);

    if (error) {
        console.error('❌ Erro ao verificar duplicata:', error);
        return false;
    }

    if (existentes && existentes.length > 0) {
        console.log(`⚠️ Duplicata encontrada: ${existentes.length} registro(s) existente(s)`);
        return true;
    }

    return false;
}

// ============================================================
// FUNÇÃO PARA SALVAR AGENDAMENTOS
// ============================================================
// services/agendamentoService.js

// services/agendamentoService.js

// services/agendamentoService.js

async function saveAgendamentos(agendamentos) {
    const agendamentosSalvos = [];
    
    // Se não houver agendamentos, retorna
    if (!agendamentos || agendamentos.length === 0) {
        return { success: true, agendamentosSalvos: [] };
    }

    // --- PASSO 1: Determinar o representante do grupo ---
    // Usamos o primeiro agendamento para extrair nome e telefone do responsável
    const primeiro = agendamentos[0];
    const nomeResponsavel = primeiro.nomeCliente || 'Responsável';
    const telefoneResponsavel = primeiro.telefoneCliente || '99999999999';

    // --- PASSO 2: Buscar ou criar o cliente representante ---
    const cliente = await findOrCreateClient(nomeResponsavel, telefoneResponsavel);
    if (!cliente) {
        console.error(`❌ Não foi possível criar/obter cliente para o responsável: ${nomeResponsavel}`);
        return { success: false, message: 'Erro ao criar cliente representante' };
    }

    const clienteId = cliente.id;
    const clienteTelefone = cliente.telefone || telefoneResponsavel;

    // --- PASSO 3: Processar cada agendamento, vinculando ao mesmo cliente_id ---
    for (const agendamentoData of agendamentos) {
        const { nomeCliente, atividade, dataCompromisso, horaCompromisso, localCompromisso, protocolo_ds160, pdf_consulado_url } = agendamentoData;

        if (!atividade || !dataCompromisso || !horaCompromisso || !localCompromisso) {
            console.warn('⚠️ Dados de agendamento incompletos, pulando:', agendamentoData);
            continue;
        }

        const [dia, mes, ano] = dataCompromisso.split('/');
        const dataFormatadaParaBanco = `${ano}-${mes}-${dia}`;

        const localTexto = mapLocalToText(localCompromisso);
        const atividadeTexto = mapAtividadeToText(atividade);

        // Verificar duplicata (considerando o mesmo cliente)
        const isDuplicado = await verificarDuplicata(
            clienteId,
            dataFormatadaParaBanco,
            horaCompromisso,
            atividadeTexto
        );

        if (isDuplicado) {
            console.log(`⏭️ Agendamento duplicado ignorado: ${nomeCliente} - ${atividadeTexto} - ${dataFormatadaParaBanco}`);
            continue;
        }

        const novoAgendamento = {
            cliente_id: clienteId,  // Todos usam o mesmo cliente_id
            atividade: atividadeTexto,
            data_agendamento: dataFormatadaParaBanco,
            hora_agendamento: horaCompromisso,
            local_agendamento: localTexto,
            protocolo_ds160: protocolo_ds160 || null,
            pdf_consulado_url: pdf_consulado_url || null,
            concluido: false,
            observacoes: `Membro: ${nomeCliente}`  // Guardamos o nome original para referência
        };

        console.log(`📝 Salvando agendamento: ${nomeCliente} - ${atividadeTexto} - ${dataFormatadaParaBanco} ${horaCompromisso}`);

        const salvo = await createAgendamento(novoAgendamento);
        if (salvo) {
            agendamentosSalvos.push(salvo);
            try {
                await lembretesService.generateRemindersForCompromisso(salvo);
                console.log(`✅ Lembretes gerados para agendamento ${salvo.id}`);
            } catch (error) {
                console.error(`⚠️ Erro ao gerar lembretes:`, error.message);
            }
        }
    }

    // --- PASSO 4: Enviar mensagem consolidada para o responsável ---
    try {
        const { enviarWhatsApp } = require('../utils/whatsappClient');

        // Montar a mensagem com todos os membros
        const membros = agendamentos.map(a => a.nomeCliente).filter((v, i, a) => a.indexOf(v) === i); // Nomes únicos

        let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\n`;
        mensagem += `Olá *${nomeResponsavel}*!\n\n`;
        mensagem += `Os agendamentos para o grupo familiar foram registrados com sucesso.\n\n`;
        mensagem += `📋 *Membros:* ${membros.join(', ')}\n\n`;

        // Agrupar por atividade (CASV e Entrevista)
        const casv = agendamentos.find(a => a.atividade === 'CASV');
        const entrevista = agendamentos.find(a => a.atividade === 'ENTREVISTA');

        if (casv) {
            mensagem += `📅 *CASV:* ${casv.dataCompromisso} às ${casv.horaCompromisso}\n`;
            mensagem += `📍 Local: ${casv.localCompromisso}\n\n`;
        }

        if (entrevista) {
            mensagem += `📅 *Entrevista:* ${entrevista.dataCompromisso} às ${entrevista.horaCompromisso}\n`;
            mensagem += `📍 Local: ${entrevista.localCompromisso}\n\n`;

            // Se houver entrevista, oferecer treinamento
            const dataEntrevista = new Date(entrevista.dataCompromisso.split('/').reverse().join('-'));
            const dataTreinamento = new Date(dataEntrevista);
            dataTreinamento.setDate(dataEntrevista.getDate() - 10);
            const dataTreinamentoStr = dataTreinamento.toISOString().split('T')[0];

            mensagem += `📌 *Agende o treinamento para a entrevista:*\n`;
            mensagem += `🔗 <a href="http://localhost:10000/agendar-treinamento?cliente_id=${clienteId}&data_sugerida=${dataTreinamentoStr}" target="_blank">Clique aqui para agendar</a>\n\n`;
            mensagem += `📅 Sugerimos ${dataTreinamento.toLocaleDateString('pt-BR')} (10 dias antes da entrevista)\n\n`;
        } else {
            // Sem entrevista: apenas CASV
            mensagem += `📌 *ATENÇÃO:* Compareça ao CASV portando seu passaporte e a CONFIRMATION impressa.\n\n`;
        }

        mensagem += `🌟 Equipe GetVisa`;

        await enviarWhatsApp(clienteTelefone, mensagem);
        console.log(`✅ Mensagem consolidada enviada para ${nomeResponsavel} (${clienteTelefone})`);

    } catch (error) {
        console.error(`⚠️ Erro ao enviar mensagem consolidada:`, error.message);
    }

    return { success: true, agendamentosSalvos };
}

// ============================================================
// FUNÇÃO PRINCIPAL: EXTRAIR E SALVAR PDF
// ============================================================
async function extractAndSavePdfAgendamentos(pdfBuffer) {
    try {
        if (typeof pdfParse !== 'function') {
            throw new Error('pdfParse não é uma função. Verifique a instalação da biblioteca.');
        }

        console.log('📄 Processando PDF...');
        const data = await pdfParse(pdfBuffer);
        const pdfText = data.text;

        console.log('📄 INÍCIO DO TEXTO DO PDF:');
        console.log('='.repeat(60));
        console.log(pdfText.substring(0, 500));
        console.log('='.repeat(60));
        console.log(`📄 Total de caracteres: ${pdfText.length}`);

        // 🔥 DEBUG: Mostrar linhas com "Nome do Solicitante"
        console.log('🔍 BUSCANDO "Nome do Solicitante" no PDF:');
        const linhas = pdfText.split('\n');
        let encontrou = false;
        linhas.forEach((linha, index) => {
            if (linha.includes('Nome do Solicitante')) {
                console.log(`📌 Linha ${index}: ${linha.trim()}`);
                encontrou = true;
            }
        });
        
        if (!encontrou) {
            console.log('⚠️ Nenhuma linha com "Nome do Solicitante" encontrada.');
        }

        const agendamentosExtraidos = extractAgendamentoDetailsFromText(pdfText);

        if (agendamentosExtraidos.length === 0) {
            console.log('⚠️ Nenhum agendamento encontrado no PDF.');
            return { success: false, message: 'Nenhum agendamento encontrado no PDF.' };
        }

        console.log(`📋 Encontrados ${agendamentosExtraidos.length} agendamentos no PDF.`);
        const resultadosSalvamento = await saveAgendamentos(agendamentosExtraidos);
        return resultadosSalvamento;

    } catch (error) {
        console.error('❌ Erro ao extrair ou salvar agendamentos do PDF:', error);
        return { success: false, message: 'Erro interno ao processar PDF.', error: error.message };
    }
}

// ============================================================
// FUNÇÕES ADICIONAIS
// ============================================================

async function getGeneralReport() {
    console.log('📊 Gerando relatório geral...');
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
    console.log(`✅ Marcando agendamento ${agendamentoId} como concluído...`);
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
    return { success: true, message: 'Agendamento marcado como concluído com sucesso.', agendamento: data };
}

async function updateAgendamentoDetails(agendamentoId, { dataCompromisso, horaCompromisso, localCompromisso }) {
    console.log(`✏️ Editando agendamento ${agendamentoId}...`);
    let dataFormatadaParaBanco = null;
    if (dataCompromisso) {
        const [dia, mes, ano] = dataCompromisso.split('/');
        dataFormatadaParaBanco = `${ano}-${mes}-${dia}`;
    }

    const updatePayload = {};
    if (dataFormatadaParaBanco) updatePayload.data_agendamento = dataFormatadaParaBanco;
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
    console.log(`🗑️ Excluindo agendamento ${agendamentoId}...`);
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
// 📤 UPLOAD DE PDF PARA EXTRAIR AGENDAMENTOS
// ============================================================


    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos'));
        }
    }



// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    extractAndSavePdfAgendamentos,
    saveAgendamentos,
    getGeneralReport,
    markAgendamentoAsConcluido,
    updateAgendamentoDetails,
    deleteAgendamento
};