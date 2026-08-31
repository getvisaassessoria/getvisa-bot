// server.js - VERSÃO DEFINITIVA E SEGURA (COM DUPLICIDADES REMOVIDAS)
console.log('--- 🚀 SERVER.JS INICIADO (VERSÃO DEFINITIVA) ---');

// ============================================================
// 1. DEPENDÊNCIAS E CONFIGURAÇÕES INICIAIS
// ============================================================
const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const multer = require('multer');
const auth = require('./middleware/auth');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || '');
const PORT = process.env.PORT || 10000;

// ============================================================
// 2. CONFIGURAÇÃO DO SUPABASE
// ============================================================
let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
console.log(`✅ URL do Supabase: ${supabaseUrl || 'NÃO CONFIGURADO'}`);
console.log(`✅ Cliente Supabase: ${supabase ? 'INICIALIZADO' : 'NÃO DISPONÍVEL'}`);

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin123';

// ============================================================
// 3. MIDDLEWARES BÁSICOS
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// 4. CONFIGURAÇÃO DO MULTER (DEVE VIR ANTES DE QUALQUER ROTA QUE USE UPLOAD)
// ============================================================
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos'));
        }
    }
});

console.log('✅ Multer configurado com memoryStorage');

// ============================================================
// 5. ROTAS PÚBLICAS (NÃO PROTEGIDAS) - DEVEM VIR PRIMEIRO
// ============================================================

// 5.1 ROTA DE LOGIN ADMIN (PÚBLICA)
app.post('/api/admin/login', (req, res) => {
    const { apiKey } = req.body;
    const validKey = 'admin123';

    console.log(`🔑 Tentativa de login admin - IP: ${req.ip}`);
    console.log(`🔑 Chave recebida: "${apiKey}"`);
    console.log(`🔑 Chave esperada: "${validKey}"`);

    if (!apiKey) {
        return res.status(400).json({ 
            success: false, 
            message: 'Chave de acesso não informada.' 
        });
    }

    if (apiKey === validKey) {
        console.log('✅ Login admin autorizado.');
        return res.json({ 
            success: true, 
            message: 'Login autorizado' 
        });
    } else {
        console.warn('❌ Tentativa de login com chave inválida.');
        return res.status(401).json({ 
            success: false, 
            message: 'Chave de acesso inválida.' 
        });
    }
});

// 5.2 ROTA DE UPLOAD DE PDF (PÚBLICA - NÃO TEM AUTH)
// ⚠️ IMPORTANTE: Esta rota NÃO pode ter auth.verificarApiKey
app.post('/api/agendamentos/upload-pdf', uploadMemory.single('pdfFile'), async (req, res) => {
    console.log('🔥 ROTA /api/agendamentos/upload-pdf CHAMADA!');
    console.log('📥 req.file:', req.file ? 'Arquivo recebido' : 'Nenhum arquivo');
    console.log('📥 req.body:', req.body);
    
    try {
        // 1. VALIDAÇÃO DO ARQUIVO
        if (!req.file) {
            console.warn('⚠️ Nenhum arquivo enviado');
            return res.status(400).json({ 
                success: false, 
                message: 'Nenhum arquivo enviado. Use o campo "pdfFile".' 
            });
        }

        if (req.file.mimetype !== 'application/pdf') {
            console.warn(`⚠️ Tipo de arquivo inválido: ${req.file.mimetype}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Apenas arquivos PDF são permitidos' 
            });
        }

        console.log(`📄 Recebendo PDF: ${req.file.originalname}, tamanho: ${req.file.size} bytes`);

        // 2. VALIDAÇÃO DO TELEFONE
        const telefone = req.body.telefone || '21985234917';
        if (!telefone || telefone.length < 10) {
            console.warn(`⚠️ Telefone inválido: ${telefone}`);
            return res.status(400).json({ 
                success: false, 
                message: 'Telefone inválido ou não informado' 
            });
        }
        console.log(`📱 Telefone informado: ${telefone}`);

        // 3. IMPORTAR SERVIÇO DE EXTRAÇÃO
        let agendamentoService;
        try {
            agendamentoService = require('./services/agendamentoService');
            console.log('✅ agendamentoService importado com sucesso');
        } catch (importError) {
            console.error('❌ Erro ao importar agendamentoService:', importError.message);
            return res.status(500).json({ 
                success: false, 
                message: 'Serviço de agendamento não disponível',
                error: importError.message 
            });
        }

        if (typeof agendamentoService.extractAndSavePdfAgendamentos !== 'function') {
            console.error('❌ Função extractAndSavePdfAgendamentos não encontrada');
            return res.status(500).json({ 
                success: false, 
                message: 'Função de extração não disponível no serviço' 
            });
        }

        // 4. EXTRAIR DADOS DO PDF - COM FLAG PARA NÃO ENVIAR WHATSAPP
        console.log('🔄 Extraindo dados do PDF (sem enviar WhatsApp)...');
        const resultado = await agendamentoService.extractAndSavePdfAgendamentos(
            req.file.buffer,
            telefone,
            { enviarWhatsApp: false }
        );

        console.log('📊 Resultado da extração:', JSON.stringify(resultado, null, 2));

        if (!resultado.success) {
            console.error('❌ Extração falhou:', resultado);
            return res.status(400).json(resultado);
        }

        // 5. BUSCAR DADOS DO CLIENTE
        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .select('nome, email, telefone')
            .eq('telefone', telefone)
            .maybeSingle();

        if (clienteError) {
            console.error('❌ Erro ao buscar cliente:', clienteError);
            return res.status(500).json({ 
                success: false, 
                message: 'Erro ao buscar dados do cliente' 
            });
        }

        if (!cliente) {
            console.warn(`⚠️ Cliente não encontrado para telefone: ${telefone}`);
            return res.status(404).json({ 
                success: false, 
                message: 'Cliente não encontrado' 
            });
        }

        console.log(`✅ Cliente encontrado: ${cliente.nome} (${cliente.email})`);

        // 6. EXTRAIR DADOS CASV E ENTREVISTA
        const dadosExtraidos = resultado.dados || resultado.data || {};
        
        let casv = dadosExtraidos.casv || {};
        let entrevista = dadosExtraidos.entrevista || {};

        // Log final dos dados extraídos
        console.log('📊 DADOS EXTRAÍDOS FINAIS:');
        console.log(`📍 CASV - Data: ${casv.data || 'A definir'}, Hora: ${casv.hora || 'A definir'}, Local: ${casv.local || 'A definir'}`);
        console.log(`📍 ENTREVISTA - Data: ${entrevista.data || 'A definir'}, Hora: ${entrevista.hora || 'A definir'}, Local: ${entrevista.local || 'A definir'}`);

        // 7. SALVAR NA TABELA etapas_processo
        try {
            const { error: upsertError } = await supabase
                .from('etapas_processo')
                .upsert({
                    cliente_telefone: telefone,
                    etapa_atual: 'agendado_casv',
                    data_agendado_casv: new Date().toISOString(),
                    dados_casv: casv,
                    dados_entrevista: entrevista,
                    protocolo_ds160: req.protocolo || null,
                    data_atualizacao: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'cliente_telefone' });

            if (upsertError) {
                console.error('❌ Erro ao salvar etapa:', upsertError);
            } else {
                console.log('✅ Etapa agendado_casv salva com sucesso');
            }
        } catch (err) {
            console.error('❌ Erro ao salvar etapa:', err);
        }

        // 8. ENVIAR E-MAIL COM PDF E DATAS
        let emailEnviado = false;
        try {
            if (!cliente.email) {
                console.warn(`⚠️ Cliente sem email: ${telefone}`);
            } else {
                const emailOptions = {
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: cliente.email,
                    subject: `📋 Confirmação de Agendamento - ${cliente.nome}`,
                    html: `
                        <h2>✅ Olá ${cliente.nome}!</h2>
                        <p>Seus agendamentos foram confirmados!</p>
                        
                        <h3>📍 CASV (Coleta Biométrica)</h3>
                        <p><strong>📅 Data:</strong> ${casv.data || 'A definir'}</p>
                        <p><strong>⏰ Horário:</strong> ${casv.hora || 'A definir'}</p>
                        <p><strong>📍 Local:</strong> ${casv.local || 'A definir'}</p>
                        
                        <h3>📍 ENTREVISTA NO CONSULADO</h3>
                        <p><strong>📅 Data:</strong> ${entrevista.data || 'A definir'}</p>
                        <p><strong>⏰ Horário:</strong> ${entrevista.hora || 'A definir'}</p>
                        <p><strong>📍 Local:</strong> ${entrevista.local || 'A definir'}</p>
                        
                        ${req.protocolo ? `<p><strong>📋 Protocolo DS-160:</strong> ${req.protocolo}</p>` : ''}
                        
                        <hr>
                        <p><strong>⚠️ IMPORTANTE:</strong></p>
                        <ul>
                            <li>Leve a <strong>CONFIRMATION IMPRESSA</strong></li>
                            <li>Leve seu <strong>PASSAPORTE(S)</strong></li>
                            <li>Chegue com 30 minutos de antecedência</li>
                        </ul>
                        
                        <p>📎 Em anexo o PDF oficial do agendamento.</p>
                        <p>🌟 Boa sorte! Estamos com você!</p>
                    `,
                    attachments: [{
                        filename: `Agendamento_${cliente.nome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                        content: req.file.buffer.toString('base64')
                    }]
                };

                await resend.emails.send(emailOptions);
                emailEnviado = true;
                console.log(`📧 E-mail enviado para ${cliente.email} com PDF anexado`);
            }
        } catch (emailError) {
            console.error('❌ Erro ao enviar e-mail:', emailError);
        }

        // 9. ENVIAR WHATSAPP COM LISTA DE MEMBROS
        let whatsEnviado = false;
        try {
            const todosMembros = resultado.dados?.todosMembros || [];
            
            const casvData = casv.data && casv.data !== 'A definir' ? `📅 *${casv.data}*` : '📅 *A definir*';
            const casvHora = casv.hora && casv.hora !== 'A definir' ? `⏰ *${casv.hora}*` : '⏰ *A definir*';
            const casvLocal = casv.local && casv.local !== 'A definir' ? `📍 *${casv.local}*` : '📍 *A definir*';
            
            const entrevistaData = entrevista.data && entrevista.data !== 'A definir' ? `📅 *${entrevista.data}*` : '📅 *A definir*';
            const entrevistaHora = entrevista.hora && entrevista.hora !== 'A definir' ? `⏰ *${entrevista.hora}*` : '⏰ *A definir*';
            const entrevistaLocal = entrevista.local && entrevista.local !== 'A definir' ? `📍 *${entrevista.local}*` : '📍 *A definir*';

            let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*

Olá *${cliente.nome.split(' ')[0]}*! Seus agendamentos foram realizados com sucesso!`;

            if (todosMembros && todosMembros.length > 0) {
                mensagem += `\n\n👨‍👩‍👧‍👦 *Membros da família:*\n`;
                todosMembros.forEach((membro, index) => {
                    mensagem += `   ${index + 1}️⃣ ${membro}\n`;
                });
            }

            if (req.protocolo) {
                mensagem += `\n📋 *Protocolo DS-160:* ${req.protocolo}`;
            }

            mensagem += `

📍 *CASV (Coleta Biométrica):*
${casvData}
${casvHora}
${casvLocal}

📍 *ENTREVISTA NO CONSULADO:*
${entrevistaData}
${entrevistaHora}
${entrevistaLocal}

⚠️ *IMPORTANTE:*
• Leve a *CONFIRMATION IMPRESSA*
• Leve seu *PASSAPORTE(S)*
• Chegue com 30 minutos de antecedência

📎 O PDF oficial foi enviado para seu e-mail.

📱 Dúvidas? [Fale com nosso especialista](https://wa.me/5521974601812)

🌟 *Boa sorte! Estamos com você!*`;

            await enviarWhatsApp(telefone, mensagem);
            whatsEnviado = true;
            console.log(`📱 WhatsApp enviado para ${telefone} com ${todosMembros.length} membros`);
        } catch (whatsError) {
            console.error('❌ Erro ao enviar WhatsApp:', whatsError);
        }

        // 10. ATUALIZAR STATUS
        try {
            const { error: updateError } = await supabase
                .from('clientes')
                .update({
                    status: 'agendado_casv',
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', telefone);

            if (updateError) {
                console.error('❌ Erro ao atualizar status:', updateError);
            } else {
                console.log(`✅ Status atualizado para agendado_casv`);
            }
        } catch (err) {
            console.error('❌ Erro ao atualizar status:', err);
        }

        // 11. RESPOSTA
        res.json({
            success: true,
            message: `PDF processado e enviado com sucesso!`,
            data: {
                casv: casv,
                entrevista: entrevista,
                protocolo: req.protocolo || null,
                comunicacoes: {
                    email: emailEnviado,
                    whatsapp: whatsEnviado
                }
            }
        });

    } catch (error) {
        console.error('❌ Erro no upload do PDF:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar PDF', 
            error: error.message
        });
    }
});

// 5.3 ROTA DO WEBHOOK (PÚBLICA)
app.post('/api/webhook/zapi', async (req, res) => {
    console.log('📨 Webhook Z-API recebido!');
    
    // Responde imediatamente para a Z-API
    res.status(200).send('OK');

    // Processa a mensagem em background
    (async () => {
        try {
            const body = req.body;
            const telefone = body.phone || body.from || '';
            const mensagem = body.text?.message || body.message || body.text || '';
            
            console.log(`📱 Telefone: ${telefone}`);
            console.log(`💬 Mensagem: ${mensagem}`);
            
            if (!telefone || !mensagem) {
                console.log('⚠️ Dados incompletos, ignorando.');
                return;
            }

            const telefoneLimpo = limparTelefone(telefone);
            console.log(`📱 Telefone limpo: ${telefoneLimpo}`);

            // Processa diretamente
            await processarMensagem(telefoneLimpo, mensagem);

        } catch (erro) {
            console.error('❌ Erro no webhook:', erro);
        }
    })();
});

// 5.4 ROTA DO FORMULÁRIO DS-160 (PÚBLICA)
app.get('/formulario-ds160', (req, res) => {
    const formPath = path.join(__dirname, 'public', 'formulario-ds160.html');
    
    if (fs.existsSync(formPath)) {
        res.sendFile(formPath);
    } else {
        console.error('❌ formulario-ds160.html não encontrado!');
        res.status(404).send(`
            <h1>Formulário não encontrado</h1>
            <p>O arquivo formulario-ds160.html não foi encontrado.</p>
            <p>Por favor, entre em contato com o suporte.</p>
            <a href="/">Voltar para a página inicial</a>
        `);
    }
});

// 5.5 ROTA DO SIMULADOR (PÚBLICA)
app.get('/simulador-visto-americano', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulador-visto-americano.html'));
});
app.get('/simulador-visto-americano/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulador-visto-americano.html'));
});

// 5.6 ROTA DE SUBMISSÃO DS-160 (PÚBLICA)
app.post('/api/submit-ds160', async (req, res) => {
    console.log('🔔 Rota /api/submit-ds160 chamada!');
    console.log('📝 Dados recebidos:', JSON.stringify(req.body, null, 2));

    try {
        const formData = req.body;
        const { full_name, email, telefone, consulado } = extractFormFields(formData);

        console.log(`📋 Nome: "${full_name}"`);
        console.log(`📧 Email: "${email}"`);
        console.log(`📱 Telefone: "${telefone}"`);
        console.log(`🏛️ Consulado: "${consulado}"`);

        // VALIDAÇÃO
        let nomeValido = full_name || formData.nome_completo || formData.fullName || '';
        let emailValido = email || formData['email-1'] || '';
        let telefoneValido = telefone || formData['text-77'] || '';

        if (!nomeValido || !emailValido || !telefoneValido) {
            console.error('❌ Dados obrigatórios faltando');
            return res.status(400).json({
                success: false,
                message: 'Nome, email e telefone são obrigatórios.'
            });
        }

        const cleanPhone = limparTelefone(telefoneValido);
        if (!cleanPhone) {
            return res.status(400).json({ success: false, message: 'Número de telefone inválido.' });
        }

        // 1. SALVAR CLIENTE NO SUPABASE
        const { data: clienteData, error: clienteError } = await supabase
            .from('clientes')
            .upsert({
                telefone: cleanPhone,
                nome: nomeValido,
                email: emailValido,
                consulado: consulado || '',
                data_contato: new Date().toISOString(),
                status: 'formulario_enviado',
                onboarding_completo: true,
                updated_at: new Date().toISOString()
            }, { onConflict: 'telefone' })
            .select('id, telefone')
            .single();

        if (clienteError) {
            console.error('❌ Erro ao salvar cliente:', clienteError);
            return res.status(500).json({ success: false, message: 'Erro ao salvar cliente', error: clienteError.message });
        }

        console.log('✅ Cliente salvo no Supabase:', clienteData);

        // Correção de ocupação
        if (formData['radio-occupation'] === 'Dona de Casa' && !formData['employer_name']) {
            formData['radio-occupation'] = 'Aposentado';
            console.log('✅ Ocupação corrigida de "Dona de Casa" para "Aposentado"');
        }

        // 2. SALVAR FORMULÁRIO
        const { data: formExistente } = await supabase
            .from('form_ds160')
            .select('id, id_cliente')
            .eq('id_cliente', clienteData.id)
            .maybeSingle();

        if (formExistente) {
            await supabase
                .from('form_ds160')
                .update({
                    dados_formulario: formData,
                    status: 'rascunho',
                    updated_at: new Date().toISOString()
                })
                .eq('id', formExistente.id);
            console.log('✅ Formulário atualizado no Supabase');
        } else {
            await supabase
                .from('form_ds160')
                .insert({
                    id_cliente: clienteData.id,
                    dados_formulario: formData,
                    status: 'rascunho',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            console.log('✅ Formulário salvo no Supabase');
        }

        // 3. ENVIAR CONFIRMAÇÃO PARA O CLIENTE
        try {
            const primeiroNome = nomeValido.split(' ')[0];
            const mensagemWhats = `🎉 *Olá ${primeiroNome}!*\n\n` +
                `Recebemos seu formulário DS-160 com sucesso! ✅\n\n` +
                `📋 *Dados recebidos:*\n` +
                `👤 Nome: ${nomeValido}\n` +
                `📧 Email: ${emailValido}\n` +
                `📱 Telefone: ${cleanPhone}\n` +
                `🏛️ Consulado: ${consulado || 'Não informado'}\n\n` +
                `⏳ *Próximos passos:*\n` +
                `1️⃣ Nossa equipe fará a análise dos dados\n` +
                `2️⃣ Você receberá a confirmação por e-mail\n` +
                `3️⃣ Iniciaremos o agendamento da entrevista\n\n` +
                `📱 Dúvidas? Fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                `🌟 *GetVisa Assessoria - Seu visto americano com segurança!* 🇺🇸`;

            await enviarWhatsApp(cleanPhone, mensagemWhats);
            console.log('📱 Notificação WhatsApp enviada para:', cleanPhone);
        } catch (whatsError) {
            console.error('❌ Erro ao enviar notificação WhatsApp:', whatsError);
        }

        // 4. GERAR PDF E ENVIAR E-MAILS
        let pdfBuffer = null;
        try {
            console.log('📄 Gerando PDF...');
            const { data: formDataSaved, error: formError } = await supabase
                .from('form_ds160')
                .select('*')
                .eq('id_cliente', clienteData.id)
                .maybeSingle();

            if (formError) {
                console.error('❌ Erro ao buscar dados do formulário:', formError);
            } else if (formDataSaved) {
                const dadosParaPDF = formDataSaved.dados_formulario || formDataSaved;
                pdfBuffer = await gerarPDF_DS160(dadosParaPDF);
                console.log('📄 PDF gerado com sucesso, tamanho:', pdfBuffer.length, 'bytes');
            }
        } catch (pdfError) {
            console.error('❌ Erro ao gerar PDF:', pdfError);
        }

        // 5. ENVIAR E-MAIL PARA A EQUIPE
        try {
            console.log('📧 Tentando enviar e-mail para a equipe...');
            const emailEquipe = process.env.EMAIL_DESTINO_EQUIPE || 'contato@getvisa.com.br';
            
            const emailOptions = {
                from: 'GetVisa <contato@getvisa.com.br>',
                to: emailEquipe,
                subject: `🆕 Novo formulário DS-160 - ${nomeValido}`,
                html: `
                    <h2>📋 Novo formulário DS-160 recebido!</h2>
                    <p><strong>👤 Nome:</strong> ${nomeValido}</p>
                    <p><strong>📱 Telefone:</strong> ${cleanPhone}</p>
                    <p><strong>📧 E-mail:</strong> ${emailValido}</p>
                    <p><strong>🏛️ Consulado:</strong> ${consulado || 'Não informado'}</p>
                    <p><strong>📅 Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    <hr>
                    <p>📌 <strong>PDF em anexo</strong> com todos os dados do formulário.</p>
                    <p>📱 Entre em contato com o cliente para dar início ao processo.</p>
                    <p>🗂️ Acesse o painel: https://app.getvisa.com.br/painel</p>
                `
            };

            if (pdfBuffer) {
                emailOptions.attachments = [{
                    filename: `DS160_${nomeValido.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`,
                    content: pdfBuffer.toString('base64')
                }];
                console.log('📎 PDF anexado ao e-mail da equipe');
            }

            await resend.emails.send(emailOptions);
            console.log('📧 E-mail enviado para a equipe com sucesso');
        } catch (emailError) {
            console.error('❌ Erro ao enviar e-mail para a equipe:', emailError);
        }

        // 6. ENVIAR E-MAIL PARA O CLIENTE
        try {
            console.log('📧 Tentando enviar e-mail para o cliente...');
            if (!emailValido || emailValido.trim() === '') {
                console.log('⚠️ Cliente sem e-mail, pulando envio.');
            } else {
                const primeiroNome = nomeValido.split(' ')[0];
                const emailOptionsCliente = {
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: emailValido,
                    subject: `📋 Seu formulário DS-160 - ${nomeValido}`,
                    html: `
                        <h2>✅ Olá ${primeiroNome}!</h2>
                        <p>Recebemos seu formulário DS-160 com sucesso!</p>
                        <p><strong>📅 Data de envio:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                        <hr>
                        <p><strong>📌 Próximos passos:</strong></p>
                        <ol>
                            <li><strong>Revise o PDF em anexo</strong> – confira se todos os dados estão corretos.</li>
                            <li><strong>Aguardar contato da nossa equipe</strong> – em até 24h entraremos em contato.</li>
                            <li><strong>Iniciaremos o agendamento</strong> da entrevista no Consulado.</li>
                        </ol>
                        <hr>
                        <p>🔗 <strong>Acesse nosso site:</strong> <a href="https://getvisa.com.br">getvisa.com.br</a></p>
                        <p>📱 <strong>Fale conosco:</strong> <a href="https://wa.me/5521974601812">WhatsApp</a></p>
                        <p style="color: #666; font-size: 12px;">Este e-mail foi enviado automaticamente. Por favor, não responda.</p>
                    `
                };

                if (pdfBuffer) {
                    emailOptionsCliente.attachments = [{
                        filename: `DS160_${nomeValido.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`,
                        content: pdfBuffer.toString('base64')
                    }];
                    console.log('📎 PDF anexado ao e-mail do cliente');
                }

                await resend.emails.send(emailOptionsCliente);
                console.log('📧 E-mail enviado para o cliente com sucesso');
            }
        } catch (emailClienteError) {
            console.error('❌ Erro ao enviar e-mail para o cliente:', emailClienteError);
        }

        // 7. AVISAR A EQUIPE POR WHATSAPP
        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, 
                `📋 *NOVO FORMULÁRIO DS-160 RECEBIDO!*\n\n` +
                `👤 Nome: ${nomeValido}\n` +
                `📱 Telefone: ${cleanPhone}\n` +
                `📧 Email: ${emailValido}\n` +
                `🏛️ Consulado: ${consulado || 'Não informado'}\n\n` +
                `📱 Entre em contato com o cliente para dar início ao processo.`
            );
            console.log('📱 Aviso enviado para a equipe');
        } catch (err) {
            console.error('❌ Erro ao avisar equipe:', err);
        }

        res.json({
            success: true,
            message: 'Formulário recebido com sucesso!',
            data: {
                nome: nomeValido,
                email: emailValido,
                telefone: cleanPhone
            }
        });

    } catch (error) {
        console.error('❌ Erro ao processar formulário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar formulário',
            error: error.message
        });
    }
});

// 5.7 ROTA DE SUBMISSÃO DO SIMULADOR (PÚBLICA)
app.post('/api/submit-simulador', async (req, res) => {
    try {
        const dados = req.body;
        console.log('📊 Nova avaliação recebida:', dados);

        const { nome, telefone, email, situacao_profissional, renda, historico_viagens, proposito_viagem, score, classificacao } = dados;

        // 1. Salvar no Supabase
        const { data: avaliacao, error } = await supabase
            .from('avaliacoes')
            .insert({
                nome,
                telefone,
                email,
                situacao_profissional,
                renda,
                historico_viagens,
                proposito_viagem,
                score,
                classificacao,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao salvar avaliação:', error);
            return res.status(500).json({ error: error.message });
        }

        // 2. Atualizar cliente
        const cleanPhone = limparTelefone(telefone);
        if (cleanPhone) {
            await supabase
                .from('clientes')
                .upsert({
                    telefone: cleanPhone,
                    nome: nome || 'Cliente',
                    email: email || '',
                    status: 'avaliado',
                    classificacao: classificacao,
                    score: score,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'telefone' });
        }

        // 3. Enviar mensagem automática
        const mensagens = {
            'Perfil Forte': `🌟 *Ótimo perfil, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\n✅ Você está muito bem preparado! Já pode iniciar o processo do visto.\n\n📋 Vou te enviar o link do formulário DS-160 para começar agora mesmo.\n\n🔗 [Clique aqui para preencher o formulário](https://app.getvisa.com.br/formulario-ds160)\n\nVamos em frente! 🚀`,
            'Perfil Moderado': `📊 *Perfil moderado, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nSeu perfil é bom, mas uma análise com especialista pode aumentar suas chances.\n\n🧑‍💼 Quer agendar uma consultoria gratuita agora?\n\nResponda *SIM* e já te encaminho.`,
            'Perfil Regular': `📉 *Perfil regular, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nAlguns pontos precisam ser ajustados para melhorar suas chances.\n\n🧑‍💼 Recomendo agendar uma consultoria com um especialista.\n\nResponda *SIM* para falar com um especialista.`,
            'Requer Atenção': `⚠️ *Perfil requer atenção, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nÉ importante revisar seu perfil antes de iniciar o processo.\n\n🧑‍💼 Vou encaminhar seu caso para um especialista. Ele entrará em contato em breve.\n\n📱 Enquanto isso, fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)`
        };

        const msg = mensagens[classificacao] || `Olá ${nome.split(' ')[0]}! Sua avaliação foi *${classificacao}* com *${score}* pontos. Entre em contato para mais informações.`;
        
        if (cleanPhone) {
            await enviarWhatsApp(cleanPhone, msg);
            console.log('📱 Mensagem automática enviada para', cleanPhone);
        }

        // 4. Notificar especialista
        const notificacao = `🔔 *Nova avaliação recebida!*\n\n` +
            `👤 Nome: ${nome}\n` +
            `📱 Telefone: ${telefone}\n` +
            `📧 Email: ${email || 'Não informado'}\n` +
            `📊 Classificação: ${classificacao}\n` +
            `🎯 Score: ${score}/100\n` +
            `📈 Situação: ${situacao_profissional}\n` +
            `💵 Renda: ${renda}\n` +
            `✈️ Histórico: ${historico_viagens}\n` +
            `🎯 Propósito: ${proposito_viagem}\n\n` +
            `Acesse o painel para ver mais detalhes.`;

        await enviarWhatsApp(process.env.ADMIN_PHONE, notificacao);
        console.log('📨 Notificação enviada para o especialista.');

        res.json({ success: true, message: 'Avaliação recebida com sucesso!' });

    } catch (error) {
        console.error('❌ Erro ao processar avaliação:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5.8 HEALTH CHECKS (PÚBLICOS)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), supabase: !!supabase });
});
app.get('/ping', (req, res) => res.send('pong'));

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        port: PORT,
        timestamp: new Date().toISOString(),
        supabase: !!supabase,
        routes: {
            home: '/',
            formulario: '/formulario-ds160',
            submit: '/api/submit-ds160',
            webhook: '/api/webhook/zapi',
            agendamentos: '/api/agendamentos',
            upload_pdf: '/api/agendamentos/upload-pdf',
            health: '/health'
        }
    });
});

// ============================================================
// 6. MIDDLEWARES DE LOG (APÓS ROTAS PÚBLICAS)
// ============================================================
app.use(auth.logAcesso);

app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// ============================================================
// 7. ROTAS PROTEGIDAS (COM auth.verificarAdmin)
// ============================================================

// 7.1 ROTA PRINCIPAL - DASHBOARD (PROTEGIDA)
app.get('/', auth.verificarAdmin, (req, res) => {
    const dashboardPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        res.redirect('/admin-login.html');
    }
});

// 7.2 DASHBOARD CENTRAL (PROTEGIDO)
app.get('/dashboard', auth.verificarAdmin, (req, res) => {
    const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(dashboardPath);
    } else {
        res.redirect('/painel');
    }
});

// 7.3 ADMIN PANEL (PROTEGIDO)
app.get('/admin.html', auth.verificarAdmin, (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(adminPath);
    } else {
        res.status(404).send(`
            <h1>🔐 Admin Panel</h1>
            <p>Arquivo admin.html não encontrado.</p>
            <a href="/">⬅️ Voltar ao Dashboard</a>
        `);
    }
});

// 7.4 PAINEL PRINCIPAL - /painel (sem .html)
app.get('/painel', auth.verificarAdmin, (req, res) => {
    const painelPath = path.join(__dirname, 'public', 'painel-clientes.html');
    
    if (fs.existsSync(painelPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(painelPath);
    } else {
        // Fallback único
        const fallback = path.join(__dirname, 'public', 'painel-novo.html');
        if (fs.existsSync(fallback)) {
            res.sendFile(fallback);
        } else {
            res.status(404).send(`
                <h1>📊 Painel de Clientes</h1>
                <p>Arquivo não encontrado.</p>
                <p>Arquivos esperados:</p>
                <ul>
                    <li>painel-clientes.html</li>
                    <li>painel-novo.html</li>
                </ul>
                <a href="/">⬅️ Voltar ao Dashboard</a>
            `);
        }
    }
});

// 7.5 REDIRECIONAMENTO - /painel.html -> /painel
app.get('/painel.html', auth.verificarAdmin, (req, res) => {
    res.redirect('/painel');
});

// 7.6 REDIRECIONAMENTOS (PROTEGIDOS)
app.get('/painel-antigo', auth.verificarAdmin, (req, res) => {
    res.redirect('/painel');
});

app.get('/dashboard-antigo', auth.verificarAdmin, (req, res) => {
    res.redirect('/painel');
});

// 7.7 PAINEL DE AGENDAMENTOS (PROTEGIDO)
app.get('/agendamentos', auth.verificarAdmin, (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.send('<h1>📅 Agendamentos</h1><p>Arquivo não encontrado.</p>');
    }
});

// 7.8 UPLOAD DE PDF (PROTEGIDO - PÁGINA)
app.get('/upload-casv-pdf', auth.verificarAdmin, (req, res) => {
    const uploadPath = path.join(__dirname, 'public', 'upload-casv-pdf.html');
    if (fs.existsSync(uploadPath)) {
        res.sendFile(uploadPath);
    } else {
        res.status(404).send(`
            <h1>📤 Página não encontrada</h1>
            <p>Arquivo upload-casv-pdf.html não encontrado.</p>
            <a href="/dashboard">Voltar ao Dashboard</a>
        `);
    }
});

// ============================================================
// 8. ROTAS DE API (PROTEGIDAS COM auth.verificarApiKey)
// ============================================================

// 8.1 LISTAR AGENDAMENTOS
app.get('/api/agendamentos', auth.verificarApiKey, async (req, res) => {
    console.log('📨 GET /api/agendamentos chamada!');
    
    try {
        const { data, error } = await supabase
            .from('agendamentos')
            .select(`
                *,
                clientes (nome, telefone)
            `)
            .order('data_agendamento', { ascending: true });

        if (error) {
            console.error('❌ Erro ao buscar agendamentos:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        console.log(`✅ ${data?.length || 0} agendamentos encontrados`);
        res.json({ 
            success: true, 
            agendamentos: data || [] 
        });
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 8.2 LISTAR LEMBRETES
app.get('/api/lembretes', auth.verificarApiKey, async (req, res) => {
    console.log('📨 GET /api/lembretes chamada!');
    
    try {
        const { data, error } = await supabase
            .from('lembretes')
            .select(`
                *,
                clientes (nome, telefone)
            `)
            .order('data_disparo', { ascending: true });

        if (error) {
            console.error('❌ Erro ao buscar lembretes:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        console.log(`✅ ${data?.length || 0} lembretes encontrados`);
        res.json({ 
            success: true, 
            lembretes: data || [] 
        });
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 8.3 DADOS DO DASHBOARD
app.get('/api/dashboard-data', auth.verificarApiKey, async (req, res) => {
    try {
        const { data: clientes, error: clientesError } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (clientesError) {
            console.error('❌ Erro ao buscar clientes:', clientesError);
            return res.status(500).json({ error: clientesError.message });
        }

        const { data: etapas, error: etapasError } = await supabase
            .from('etapas_processo')
            .select('cliente_id, etapa_atual, data_atualizacao');

        if (etapasError) {
            console.error('❌ Erro ao buscar etapas:', etapasError);
            return res.status(500).json({ error: etapasError.message });
        }

        const etapasMap = {};
        if (etapas) {
            etapas.forEach(etapa => {
                etapasMap[etapa.cliente_id] = {
                    etapa_atual: etapa.etapa_atual,
                    data_atualizacao: etapa.data_atualizacao
                };
            });
        }

        const clientesComEtapas = clientes.map(cliente => ({
            ...cliente,
            etapa_atual: etapasMap[cliente.telefone]?.etapa_atual || 'Não definida',
            data_atualizacao: etapasMap[cliente.telefone]?.data_atualizacao || cliente.created_at
        }));

        const hoje = new Date().toISOString().split('T')[0];
        const novosHoje = clientes.filter(c => c.created_at?.startsWith(hoje)).length;
        const onboardingCompletos = clientes.filter(c => c.onboarding_completo === true).length;

        res.json({
            totalClientes: clientes.length,
            novosHoje: novosHoje,
            onboardingCompletos: onboardingCompletos,
            clientes: clientesComEtapas
        });

    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
        res.status(500).json({ error: error.message });
    }
});

// 8.4 LISTAR CLIENTES ATIVOS
app.get('/api/clientes/ativos', auth.verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes_ativos')
            .select('telefone, nome')
            .order('criado_em', { ascending: false });

        if (error) {
            console.error('Erro ao buscar ativos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }

        res.json({
            success: true,
            ativos: data || []
        });

    } catch (error) {
        console.error('Erro ao buscar ativos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 8.5 LISTAR CLIENTES FINALIZADOS
app.get('/api/clientes/finalizados', auth.verificarApiKey, async (req, res) => {
    try {
        console.log('📌 [GET] /api/clientes/finalizados');

        const { data, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .order('data_finalizacao', { ascending: false });

        if (error) {
            console.error('❌ Erro no Supabase:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        console.log(`✅ ${data?.length || 0} clientes finalizados encontrados`);

        res.json({
            success: true,
            finalizados: data || []
        });

    } catch (error) {
        console.error('❌ Erro ao buscar finalizados:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 8.6 BUSCAR CLIENTE POR TELEFONE
app.get('/api/clientes/buscar/:telefone', auth.verificarApiKey, async (req, res) => {
    try {
        const telefone = req.params.telefone;
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');

        console.log(`🔍 Buscando cliente: ${telefoneLimpo}`);

        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'Cliente não encontrado'
            });
        }

        res.json({
            success: true,
            cliente: data
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 8.7 ESTATÍSTICAS DE ETAPAS
app.get('/api/etapas/estatisticas', auth.verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase.from('etapas_processo').select('etapa_atual');
        if (error) throw error;

        const estatisticas = {};
        const total = data.length;
        data.forEach(function(item) {
            if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0;
            estatisticas[item.etapa_atual]++;
        });

        const resultado = Object.keys(estatisticas).map(function(etapa) {
            return {
                etapa: etapa,
                label: ETAPAS[etapa] && ETAPAS[etapa].label || etapa,
                quantidade: estatisticas[etapa],
                porcentagem: total > 0 ? ((estatisticas[etapa] / total) * 100).toFixed(2) : 0
            };
        });

        res.json({
            total_clientes_ativos: total,
            distribuicao: resultado,
            ultima_atualizacao: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ erro: 'Erro ao buscar estatisticas' });
    }
});

// ============================================================
// 9. ROTAS ADMINISTRATIVAS (COM ADMIN_API_KEY)
// ============================================================

// 9.1 REGENERAR PDF
app.post('/api/admin/regenerar-pdf', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, email, enviar_whatsapp } = req.body;

        if (!telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        }

        console.log(`📌 Regenerando PDF para telefone: ${telefone}`);

        const telefoneLimpo = limparTelefone(telefone);

        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (error) {
            console.error('❌ Erro ao buscar cliente:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado em clientes_ativos' });
        }

        const { data: formulario, error: formError } = await supabase
            .from('formularios_ds160')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (formError) {
            console.error('❌ Erro ao buscar formulário:', formError);
        }

        if (!formulario) {
            return res.status(404).json({
                error: 'Dados do formulário não encontrados.'
            });
        }

        const pdfBuffer = await gerarPDF_DS160(formulario);
        console.log(`📄 PDF regenerado para ${cliente.nome}, tamanho: ${pdfBuffer.length} bytes`);

        if (email) {
            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: [email],
                subject: 'PDF Regenerado - DS-160 ' + cliente.nome,
                html: '<strong>Olá!</strong><br><p>Segue o PDF regenerado com os dados completos do formulário DS-160.</p>',
                attachments: [{
                    filename: 'DS160_' + cliente.nome.replace(/[^a-z0-9]/gi, '_') + '.pdf',
                    content: pdfBuffer.toString('base64')
                }]
            });
            console.log('📧 PDF enviado por e-mail para:', email);
        }

        if (enviar_whatsapp) {
            try {
                const nomeCliente = cliente.nome.split(' ')[0];
                await enviarPDFWhatsApp(telefoneLimpo, pdfBuffer, nomeCliente);
                console.log('📱 PDF enviado por WhatsApp para:', telefoneLimpo);
            } catch (err) {
                console.error('❌ Erro ao enviar PDF por WhatsApp:', err);
            }
        }

        const pastaPDFs = path.join(__dirname, 'pdfs_regenerados');

        if (!fs.existsSync(pastaPDFs)) {
            fs.mkdirSync(pastaPDFs, { recursive: true });
        }

        const nomeArquivo = `DS160_${cliente.nome.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
        const caminhoArquivo = path.join(pastaPDFs, nomeArquivo);
        fs.writeFileSync(caminhoArquivo, pdfBuffer);

        console.log(`💾 PDF salvo em: ${caminhoArquivo}`);

        res.json({
            success: true,
            message: 'PDF regenerado com sucesso!',
            cliente: {
                nome: cliente.nome,
                telefone: cliente.telefone
            },
            pdf_gerado: true,
            email_enviado: !!email,
            whatsapp_enviado: !!enviar_whatsapp,
            arquivo_salvo: caminhoArquivo
        });

    } catch (error) {
        console.error('❌ Erro ao regenerar PDF:', error);
        res.status(500).json({
            error: 'Erro ao regenerar PDF',
            detalhe: error.message
        });
    }
});

// 9.2 BUSCAR FORMULÁRIO
app.get('/api/admin/buscar-formulario/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        const telefoneLimpo = limparTelefone(telefone);

        const tabelas = ['formularios_ds160', 'clientes_ativos', 'clientes'];
        let dados = null;
        let encontradoEm = null;

        for (const tabela of tabelas) {
            try {
                const { data, error } = await supabase
                    .from(tabela)
                    .select('*')
                    .eq('telefone', telefoneLimpo)
                    .maybeSingle();

                if (!error && data) {
                    dados = data;
                    encontradoEm = tabela;
                    break;
                }
            } catch (e) {
                console.log(`Tabela ${tabela} não encontrada ou erro:`, e.message);
            }
        }

        if (!dados) {
            return res.status(404).json({
                error: 'Dados do formulário não encontrados em nenhuma tabela'
            });
        }

        res.json({
            success: true,
            encontrado_em: encontradoEm,
            dados: dados
        });

    } catch (error) {
        console.error('❌ Erro ao buscar formulário:', error);
        res.status(500).json({ error: error.message });
    }
});

// 9.3 ATUALIZAR STATUS DO CLIENTE
app.post('/api/admin/atualizar-status', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, status, observacao } = req.body;

        if (!telefone || !status) {
            return res.status(400).json({ 
                success: false, 
                message: 'Telefone e status são obrigatórios' 
            });
        }

        const { data: cliente, error: buscaError } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (buscaError || !cliente) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cliente não encontrado' 
            });
        }

        const resultado = await atualizarStatusCliente(telefone, status, { 
            updated_at: new Date().toISOString()
        });

        if (resultado.success) {
            res.json({
                success: true,
                message: `Status atualizado para "${status}"`,
                cliente: resultado.data
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar status',
                error: resultado.error
            });
        }

    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 9.4 ATUALIZAR TREINAMENTO
app.post('/api/admin/atualizar-treinamento', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { 
            telefone, 
            treinamento_data, 
            treinamento_hora, 
            treinamento_local, 
            treinamento_modalidade, 
            treinamento_link 
        } = req.body;

        if (!telefone) {
            return res.status(400).json({ 
                success: false, 
                message: 'Telefone é obrigatório' 
            });
        }

        const { data: cliente } = await supabase
            .from('clientes')
            .select('nome')
            .eq('telefone', telefone)
            .maybeSingle();

        const treinamento = {
            data: treinamento_data,
            hora: treinamento_hora,
            local: treinamento_local,
            modalidade: treinamento_modalidade || 'presencial',
            link: treinamento_link || null
        };

        const resultado = await salvarTreinamento(telefone, treinamento);

        if (!resultado.success) {
            return res.status(500).json({ 
                success: false, 
                error: resultado.error 
            });
        }

        const nome = cliente?.nome || 'Cliente';
        await enviarNotificacaoEtapa(telefone, 'treinamento_agendado', { nome });

        res.json({
            success: true,
            message: 'Treinamento atualizado com sucesso!',
            data: resultado.data
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar treinamento:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 9.5 FINALIZAR CLIENTE
app.post('/api/clientes/finalizar', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.body.telefone;
        const resultado = req.body.resultado || 'aprovado';
        const observacoes = req.body.observacoes || '';
        const servico = req.body.servico || 'Visto Americano';
        const email = req.body.email || '';

        if (!telefone) {
            return res.status(400).json({ erro: 'Telefone é obrigatório' });
        }

        console.log(`📌 Finalizando cliente ${telefone}: ${resultado}`);

        const { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ erro: error.message });
        }

        if (!cliente) {
            return res.status(404).json({ erro: 'Cliente não encontrado em clientes_ativos' });
        }

        const { data: insertData, error: insertError } = await supabase
            .from('clientes_finalizados')
            .insert({
                telefone: cliente.telefone,
                nome: cliente.nome,
                email: email || null,
                servico: servico,
                data_inicio: cliente.criado_em || new Date().toISOString(),
                data_finalizacao: new Date().toISOString(),
                observacoes: observacoes || `Processo finalizado com ${resultado}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            const { data: updateData, error: updateError } = await supabase
                .from('clientes_finalizados')
                .update({
                    servico: servico,
                    data_finalizacao: new Date().toISOString(),
                    observacoes: observacoes || `Processo finalizado com ${resultado}`,
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', telefone)
                .select()
                .single();

            if (updateError) {
                return res.status(500).json({ erro: updateError.message });
            }
            finalizado = updateData;
        } else {
            finalizado = insertData;
        }

        await supabase
            .from('clientes_ativos')
            .delete()
            .eq('telefone', telefone);

        await supabase
            .from('clientes')
            .delete()
            .eq('telefone', telefone);

        await supabase
            .from('contatos_amigos')
            .delete()
            .eq('telefone', telefone);

        console.log(`✅ Cliente ${telefone} finalizado e movido para clientes_finalizados`);

        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_')
                ? cliente.nome.split(' ')[0]
                : 'Cliente';

            let mensagem = '';
            if (resultado === 'recusado') {
                mensagem = `😔 Olá ${nomeCliente}!\n\n` +
                          `Sabemos que essa notícia dói, ainda mais depois de tanta dedicação na preparação.\n\n` +
                          `É importante entender: a decisão final do visto acontece no momento da entrevista, e depende muito da avaliação pessoal do oficial consular naquele instante — algo que vai além da documentação e da preparação, por mais completa que tenha sido.\n\n` +
                          `🔍 Vamos analisar com você os detalhes da entrevista para entender o que pesou na decisão e ajustar a estratégia para a próxima tentativa.\n\n` +
                          `📱 Fale com a gente agora para uma análise gratuita:\n` +
                          `[Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                          `💪 Isso não muda o seu objetivo. Vamos trabalhar juntos para reverter esse cenário!`;
            } else {
                mensagem = `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\n` +
                          `Seu passaporte com o visto foi retornado!\n\n` +
                          `✅ Seu processo foi concluído com sucesso!\n\n` +
                          `🌟 Agradecemos por confiar na GetVisa Assessoria!\n\n` +
                          `✈️ Boa viagem! Vá realizar seus sonhos!`;
            }

            await enviarWhatsApp(telefone, mensagem);
            console.log(`✅ Mensagem de finalização enviada para ${telefone}`);
        } catch (err) {
            console.error(`❌ Erro ao enviar mensagem de finalização:`, err);
        }

        res.json({
            success: true,
            message: `Cliente finalizado com ${resultado}`,
            cliente: finalizado
        });

    } catch (error) {
        console.error('❌ Erro ao finalizar cliente:', error);
        res.status(500).json({
            erro: 'Erro ao finalizar cliente',
            detalhe: error.message
        });
    }
});

// 9.6 REABRIR CLIENTE
app.post('/api/clientes/reabrir', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.body.telefone;
        console.log(`📌 [POST] /api/clientes/reabrir`);
        console.log(`📌 Telefone: ${telefone}`);

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`🔄 Reabrindo: ${telefoneLimpo}`);

        let { data: cliente, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (!cliente) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log(`🔍 Tentando formato: ${telefoneFormatado}`);

            const { data: dataFormatado } = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            cliente = dataFormatado;
        }

        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        if (!cliente) {
            console.log(`❌ Cliente não encontrado em finalizados`);
            return res.status(404).json({
                success: false,
                error: 'Cliente não encontrado em finalizados'
            });
        }

        console.log(`✅ Cliente encontrado: ${cliente.nome}`);

        const { data: existente } = await supabase
            .from('clientes_ativos')
            .select('telefone')
            .eq('telefone', cliente.telefone)
            .maybeSingle();

        if (existente) {
            console.log(`⚠️ Cliente já existe em ativos, removendo...`);
            await supabase
                .from('clientes_ativos')
                .delete()
                .eq('telefone', cliente.telefone);
        }

        const { data: insertData, error: insertError } = await supabase
            .from('clientes_ativos')
            .insert({
                telefone: cliente.telefone,
                nome: cliente.nome,
                email: cliente.email || null,
                criado_em: cliente.data_inicio || new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                status: 'reaberto'
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Erro ao inserir em ativos:', insertError);
            return res.status(500).json({
                success: false,
                error: insertError.message
            });
        }

        console.log(`✅ Cliente inserido em clientes_ativos`);

        await supabase
            .from('clientes_finalizados')
            .delete()
            .eq('telefone', cliente.telefone);

        console.log(`🗑️ Cliente removido de clientes_finalizados`);

        try {
            await criarEtapaInicial(telefoneLimpo);
            console.log(`✅ Etapa inicial criada`);
        } catch (err) {
            console.error('❌ Erro ao criar etapa:', err);
        }

        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_')
                ? cliente.nome.split(' ')[0]
                : 'Cliente';

            const mensagem = `🔄 Olá ${nomeCliente}!\n\n` +
                           `Seu processo foi REABERTO pela nossa equipe.\n\n` +
                           `📋 Status: Em andamento\n` +
                           `📍 Etapa atual: Formulário recebido\n\n` +
                           `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                           `📱 Dúvidas? Fale conosco pelo WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812)`;

            await enviarWhatsApp(cliente.telefone, mensagem);
            console.log(`✅ Mensagem de reabertura enviada`);
        } catch (err) {
            console.error('❌ Erro ao enviar mensagem:', err);
        }

        console.log(`✅ Processo reaberto com sucesso!`);

        res.json({
            success: true,
            message: 'Processo reaberto com sucesso',
            cliente: insertData
        });

    } catch (error) {
        console.error('❌ Erro ao reabrir processo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 9.7 NOTIFICAR CLIENTE
app.post('/api/admin/notificar-cliente', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, mensagem } = req.body;

        if (!telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório' });
        }

        console.log(`📨 Enviando notificação para: ${telefone}`);

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');

        let cliente = null;
        const { data: clienteAtivo } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (clienteAtivo) {
            cliente = clienteAtivo;
        } else {
            const { data: clienteLimpo } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            cliente = clienteLimpo;
        }

        if (!cliente) {
            return res.status(404).json({
                error: 'Cliente não encontrado em clientes_ativos',
                telefone_buscado: telefone,
                telefone_limpo: telefoneLimpo
            });
        }

        const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_')
            ? cliente.nome.split(' ')[0]
            : 'Cliente';

        const texto = mensagem || `🎉 Olá ${nomeCliente}!\n\n` +
                     `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                     `📋 Status: Em andamento\n` +
                     `📍 Etapa atual: Formulário recebido\n\n` +
                     `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                     `📱 Dúvidas? Fale conosco pelo WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                     `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;

        const enviado = await enviarWhatsApp(telefone, texto);

        res.json({
            success: true,
            telefone: telefone,
            cliente: {
                nome: cliente.nome,
                criado_em: cliente.criado_em
            },
            notificacao_enviada: enviado,
            mensagem: texto
        });

    } catch (error) {
        console.error('❌ Erro ao notificar cliente:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 9.8 VERIFICAR CLIENTE
app.get('/api/admin/verificar-cliente/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        console.log(`🔍 Verificando cliente: ${telefone}`);

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');

        const tables = ['clientes', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
        const results = {};

        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .eq('telefone', telefone)
                .maybeSingle();

            if (!error && data) {
                results[table] = data;
            }

            if (!results[table]) {
                const { data: dataLimpo } = await supabase
                    .from(table)
                    .select('*')
                    .eq('telefone', telefoneLimpo)
                    .maybeSingle();

                if (dataLimpo) {
                    results[table] = dataLimpo;
                }
            }
        }

        let etapa = null;
        if (results['clientes_ativos']) {
            const { data } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', telefone)
                .maybeSingle();

            if (!data) {
                const { data: dataLimpo } = await supabase
                    .from('etapas_processo')
                    .select('*')
                    .eq('cliente_telefone', telefoneLimpo)
                    .maybeSingle();
                etapa = dataLimpo;
            } else {
                etapa = data;
            }
        }

        res.json({
            success: true,
            telefone_buscado: telefone,
            telefone_limpo: telefoneLimpo,
            encontrado_em: Object.keys(results).filter(k => results[k]),
            dados: results,
            etapa: etapa
        });

    } catch (error) {
        console.error('❌ Erro ao verificar cliente:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 9.9 TESTE Z-API
app.get('/api/test/zapi', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const testPhone = process.env.ADMIN_PHONE || '5521974601812';
        const testMessage = '🧪 Teste de conexão Z-API - ' + new Date().toLocaleString('pt-BR');

        console.log(`📨 Testando Z-API para: ${testPhone}`);
        const result = await enviarWhatsApp(testPhone, testMessage);

        res.json({
            success: result,
            message: result ? '✅ Mensagem enviada com sucesso!' : '❌ Falha ao enviar mensagem',
            phone: testPhone,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erro no teste Z-API:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 9.10 AGENDAR TREINAMENTO
app.post('/api/agendar-treinamento', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { cliente_id, entrevista_id, tipo, data, horario } = req.body;

        if (!cliente_id || !data || !horario) {
            return res.status(400).json({ success: false, message: 'Dados incompletos' });
        }

        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .select('id')
            .eq('id', cliente_id)
            .single();

        if (clienteError || !cliente) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        }

        const novoAgendamento = {
            cliente_id: cliente_id,
            atividade: 'Treinamento',
            data_agendamento: data,
            hora_agendamento: horario,
            local_agendamento: tipo,
            observacoes: `Treinamento para entrevista. Tipo: ${tipo}. Entrevista ID: ${entrevista_id || 'N/A'}`,
            concluido: false
        };

        const { data: agendamento, error } = await supabase
            .from('agendamentos')
            .insert([novoAgendamento])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar treinamento:', error);
            return res.status(500).json({ success: false, message: error.message });
        }

        try {
            const lembretesService = require('./services/lembretes.service');
            await lembretesService.generateRemindersForCompromisso(agendamento);
        } catch (e) {
            console.log('⚠️ Erro ao gerar lembretes para treinamento:', e.message);
        }

        try {
            const { data: clienteCompleto } = await supabase
                .from('clientes')
                .select('nome, telefone')
                .eq('id', cliente_id)
                .single();

            if (clienteCompleto?.telefone) {
                const mensagem = 
                    `✅ *TREINAMENTO AGENDADO - GETVISA*\n\n` +
                    `Olá *${clienteCompleto.nome}*!\n\n` +
                    `Seu treinamento para a entrevista foi agendado com sucesso!\n\n` +
                    `📅 Data: ${new Date(data).toLocaleDateString('pt-BR')}\n` +
                    `⏰ Hora: ${horario}\n` +
                    `📍 Tipo: ${tipo}\n\n` +
                    `📌 Em breve nossa equipe entrará em contato para confirmar.\n\n` +
                    `🌟 Equipe GetVisa`;
                
                await enviarWhatsApp(clienteCompleto.telefone, mensagem);
            }
        } catch (e) {
            console.log('⚠️ Erro ao enviar confirmação do treinamento:', e.message);
        }

        res.json({ success: true, message: 'Treinamento agendado com sucesso!', data: agendamento });

    } catch (error) {
        console.error('❌ Erro ao agendar treinamento:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 10. ARQUIVOS ESTÁTICOS (DEVE SER O ÚLTIMO ANTES DAS ROTAS DE FALLBACK)
// ============================================================
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
    console.log('✅ Pasta public configurada:', publicPath);
} else {
    console.warn('⚠️ Pasta public não encontrada. Criando...');
    fs.mkdirSync(publicPath, { recursive: true });
    app.use(express.static(publicPath));
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// 11. CONSTANTES E MAPEAMENTOS (DEFINIDOS UMA ÚNICA VEZ)
// ============================================================

// MAPEAMENTO DE ETAPAS
const ETAPAS = {
    formulario_enviado: {
        id: 'formulario_enviado',
        label: 'Formulário Enviado',
        next: 'analise_correcoes',
        color: '#3498db'
    },
    analise_correcoes: {
        id: 'analise_correcoes',
        label: 'Análise e Correções',
        next: 'abertura_processo',
        color: '#f39c12'
    },
    abertura_processo: {
        id: 'abertura_processo',
        label: 'Abertura do Processo',
        next: 'boleto_emitido',
        color: '#8e44ad'
    },
    boleto_emitido: {
        id: 'boleto_emitido',
        label: 'Boleto Emitido',
        next: 'boleto_pago',
        color: '#e67e22'
    },
    boleto_pago: {
        id: 'boleto_pago',
        label: 'Boleto Pago',
        next: 'agendamento_realizado',
        color: '#27ae60'
    },
    agendamento_realizado: {
        id: 'agendamento_realizado',
        label: 'Agendamento Realizado',
        next: 'treinamento_realizado',
        color: '#2980b9'
    },
    treinamento_realizado: {
        id: 'treinamento_realizado',
        label: 'Treinamento Concluído',
        next: 'entrevista_realizada',
        color: '#8e44ad'
    },
    entrevista_realizada: {
        id: 'entrevista_realizada',
        label: '🎤 Entrevista Realizada',
        next: null,
        color: '#2c3e50'
    },
    visto_aprovado: {
        id: 'visto_aprovado',
        label: '✅ Visto Aprovado',
        next: 'passaporte_retornado',
        color: '#16a34a'
    },
    passaporte_retornado: {
        id: 'passaporte_retornado',
        label: '📦 Passaporte disponível para retirada/entrega',
        next: null,
        color: '#2ecc71'
    },
    visto_recusado: {
        id: 'visto_recusado',
        label: '❌ Visto Recusado',
        next: null,
        color: '#ef4444'
    }
};

// ETAPA LABELS
const ETAPA_LABELS = {
    'formulario_enviado': '📋 Formulário Enviado',
    'analise_correcoes': '🔍 Análise e Correções',
    'abertura_processo': '📌 Processo Aberto',
    'boleto_emitido': '💰 Boleto Emitido',
    'boleto_pago': '✅ Boleto Pago',
    'agendado_casv': '📅 CASV Agendado',
    'treinamento_agendado': '🎯 Treinamento Agendado',
    'treinamento_realizado': '✅ Treinamento Realizado',
    'agendado_entrevista': '🎤 Entrevista Agendada',
    'entrevista_realizada': '🎤 Entrevista Realizada',
    'visto_aprovado': '🎉 Visto Aprovado',
    'passaporte_retornado': '📦 Passaporte Retornado',
    'visto_recusado': '😔 Visto Recusado',
    'finalizado': '🏁 Processo Finalizado'
};

// RADIO MAPPING
const RADIO_MAPPING = {
    'one': 'Sim',
    'two': 'Nao',
    'radio-28': { 'one': 'Turismo/negocio (B1/B2)', 'two': 'Estudos', 'Outros': 'Outros' },
    'radio-3': { 'one': 'Masculino', 'two': 'Feminino' },
    'select-4': { 'one': 'Casado(a)', 'two': 'Solteiro(a)', 'Uniao-estavel': 'Uniao estavel', 'Viuvo(a)': 'Viuvo(a)', 'Divorciado(a)': 'Divorciado(a)' },
    'radio-6': { 'one': 'Eu mesmo', 'two': 'Outra pessoa' },
    'radio-7': { 'one': 'Sim', 'two': 'Nao' },
    'radio-8': { 'one': 'Sim', 'two': 'Nao' },
    'radio-23': { 'one': 'Sim', 'two': 'Nao' },
    'radio-29': { 'one': 'Sim', 'two': 'Nao' },
    'radio-30': { 'one': 'Sim', 'two': 'Nao' },
    'radio-33': { 'one': 'Sim', 'two': 'Nao' },
    'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado', 'Outra': 'Outra' },
    'radio-17': { 'one': 'Sim', 'two': 'Nao' },
    'radio-18': { 'one': 'Sim', 'two': 'Nao' },
    'radio-19': { 'one': 'Sim', 'two': 'Nao' },
    'radio-20': { 'one': 'Sim', 'two': 'Nao' },
    'radio-14': { 'one': 'Sim', 'two': 'Nao' },
    'radio-15': { 'one': 'Sim', 'two': 'Nao' },
    'radio-16': { 'one': 'Sim', 'two': 'Nao' },
    'radio-26': { 'one': 'Sim', 'two': 'Nao' },
    'radio-planos': { 'one': 'Sim', 'two': 'Nao' },
    'radio-9': { 'one': 'Sim', 'two': 'Nao, e diferente' },
    'radio-10': { 'one': 'Sim', 'two': 'Nao' },
    'radio-11': { 'one': 'Sim', 'two': 'Nao' },
    'radio-12': { 'one': 'Sim', 'two': 'Nao' },
    'radio-outra-nac': { 'one': 'Sim', 'two': 'Nao' },
    'radio-residente': { 'one': 'Sim', 'two': 'Nao' },
    'spouse-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'ex-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'radio-visto-negado': { 'one': 'Sim', 'two': 'Nao' },
    'radio-entrada-negada': { 'one': 'Sim', 'two': 'Nao' },
    'radio-deportado': { 'one': 'Sim', 'two': 'Nao' }
};

const DATE_FIELDS = [
    'text-5', 'text-21', 'text-35', 'text-66', 'text-67', 'text-69',
    'text-61', 'text-62', 'spouse-dob', 'data_casamento_div',
    'data_divorcio', 'data_falecimento', 'text-50', 'text-44',
    'text-45', 'military_date_from', 'military_date_to', 'antecedentes_data'
];

const ONBOARDING_STEPS = {
    SAUDACAO: 'saudacao',
    AGUARDANDO_NOME: 'aguardando_nome',
    AGUARDANDO_EMAIL: 'aguardando_email',
    CONFIRMACAO: 'confirmacao',
    COMPLETO: 'completo'
};

const BOAS_VINDAS_MESSAGES = {
    primeira_saudacao: [
        '👋 Olá! Seja muito bem-vindo(a) à **GetVisa Assessoria**! 🇺🇸\n\nSomos especialistas em vistos americanos e estamos aqui para realizar seu sonho de viajar para os EUA! ✈️',
        '🌟 Bem-vindo(a) à **GetVisa**! Sua jornada para o visto americano começa aqui! 🇺🇸\n\nNossa equipe de especialistas vai te acompanhar em cada etapa do processo.',
        '🎉 Olá! É um prazer ter você aqui na **GetVisa**! ✈️\n\nEstamos prontos para ajudar você a conquistar seu visto americano com segurança e tranquilidade.'
    ],
    solicitar_nome: [
        'Para começarmos seu atendimento de forma personalizada, preciso saber:\n\n📝 **Qual é o seu nome completo?**\n\nEx: Maria Silva',
        'Vamos iniciar seu processo! Primeiro, me diga:\n\n📝 **Qual é é o seu nome completo?**\n\nEx: João Santos',
        'Que tal nos conhecermos melhor? Me diga seu nome completo para eu te chamar corretamente!\n\n📝 **Qual é o seu nome?**\n\nEx: Ana Oliveira'
    ],
    nome_invalido: [
        '🤔 Hmm, parece que não entendi bem seu nome. Poderia digitar novamente?\n\nEx: Maria Silva',
        '😅 Desculpe, não consegui identificar seu nome. Tente novamente no formato:\n\nEx: João Santos',
        '📝 Para um atendimento personalizado, preciso do seu nome completo.\n\nEx: Ana Oliveira'
    ],
    confirmacao_nome: {
        parte1: [
            '😊 Prazer, ',
            '🌟 Muito prazer, ',
            '✨ Tudo bem? ',
            '🎯 Ótimo, '
        ],
        parte2: [
            '! Agora me diga:\n\n📧 **Qual é o seu e-mail?**\n\nEx: maria@email.com',
            '! Para enviarmos as informações do seu processo, preciso do seu e-mail:\n\n📧 **Qual é o seu e-mail?**\n\nEx: joao@email.com',
            '! Vamos continuar! Me informe seu e-mail para contato:\n\n📧 **Qual é o seu e-mail?**\n\nEx: ana@email.com'
        ]
    }
};

const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

// ============================================================
// 12. ESTADO DO USUÁRIO
// ============================================================
const userState = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
        }
    }
}, 60 * 1000);

// ============================================================
// 13. FUNÇÕES AUXILIARES
// ============================================================

function limparTelefone(telefone) {
    if (!telefone) return null;
    const limpo = telefone.toString().replace(/\D/g, '');
    if (limpo.startsWith('55')) return limpo.substring(2);
    return limpo;
}

function formatarTelefone(telefone) {
    if (!telefone) return null;
    const numeros = telefone.toString().replace(/\D/g, '');
    if (numeros.length === 11) {
        return '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2, 7) + '-' + numeros.substring(7, 11);
    }
    if (numeros.length === 10) {
        return '(' + numeros.substring(0, 2) + ') ' + numeros.substring(2, 6) + '-' + numeros.substring(6, 10);
    }
    return telefone;
}

function getRandomMessage(messageArray) {
    return messageArray[Math.floor(Math.random() * messageArray.length)];
}

function validarNome(nome) {
    if (!nome || nome.trim().length === 0) return false;
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2 || nomeLimpo.length > 100) return false;
    const regexNome = /^[a-zA-ZÀ-ÿ\s'-]+$/;
    if (!regexNome.test(nomeLimpo)) return false;
    if (/^\d+$/.test(nomeLimpo.replace(/\s/g, ''))) return false;
    const palavrasInvalidas = ['sim', 'nao', 'ok', 'yes', 'no', 'teste', 'oi', 'ola'];
    if (palavrasInvalidas.includes(nomeLimpo.toLowerCase())) return false;
    return true;
}

function formatarNome(nome) {
    return nome
        .trim()
        .toLowerCase()
        .split(' ')
        .map(palavra => {
            if (palavra.length <= 2) return palavra.toLowerCase();
            return palavra.charAt(0).toUpperCase() + palavra.slice(1);
        })
        .join(' ');
}

function getServiceName(service) {
    const names = {
        'visto_americano': 'Visto Americano',
        'visto_canadense': 'Visto Canadense',
        'visto_australiano': 'Visto Australiano',
        'eta_uk': 'eTA UK',
        'eta_canadense': 'eTA Canadense',
        'passaporte': 'Passaporte'
    };
    return names[service] || 'Servico';
}

function formatDateToBrazilian(dateString) {
    if (!dateString || dateString === '') return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return match[3] + '/' + match[2] + '/' + match[1];
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return day + '/' + month + '/' + date.getFullYear();
    }
    return dateString;
}

function formatValue(fieldName, value) {
    if (value === undefined || value === null || value === '') return null;
    if (DATE_FIELDS.includes(fieldName)) {
        const formatted = formatDateToBrazilian(value);
        if (formatted) return formatted;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        const mapped = value.map(function(v) {
            if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][v]) return RADIO_MAPPING[fieldName][v];
            if (RADIO_MAPPING[v]) return RADIO_MAPPING[v];
            return v;
        });
        return mapped.join(', ');
    }
    if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][value]) return RADIO_MAPPING[fieldName][value];
    if (RADIO_MAPPING[value]) return RADIO_MAPPING[value];
    return value;
}

function groupParallelArrays(data, nameField, relField) {
    const names = data[nameField] || [];
    const rels = data[relField] || [];
    const maxLen = Math.max(names.length, rels.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
        let nome = names[i] || '';
        let rel = rels[i] || '';
        if (nome || rel) result.push(nome + (nome && rel ? ' - ' : '') + rel);
    }
    return result;
}

function groupTravels(data) {
    const datas = data['viagem_data[]'] || [];
    const duracao = data['viagem_duracao[]'] || [];
    const maxLen = Math.max(datas.length, duracao.length);
    const result = [];
    for (let i = 0; i < maxLen; i++) {
        let d = datas[i] || '';
        let dur = duracao[i] || '';
        if (d) d = formatDateToBrazilian(d);
        if (d || dur) result.push(d + (d && dur ? ' - ' : '') + dur + ' dias');
    }
    return result;
}

function drawSectionTitle(doc, title) {
    doc.moveDown(1);
    doc.fillColor('#003366').fontSize(14).font('Helvetica-Bold').text(title);
    doc.moveDown(0.3);
    doc.strokeColor('#003366').lineWidth(1.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.lineWidth(0.5);
    doc.moveDown(0.5);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
}

function isSpamData(dados) {
    const nome = dados.nome || dados.nome_cliente || dados.full_name || '';
    const telefone = dados.telefone || dados.whatsapp || dados.telefone_whatsapp || '';
    const email = dados.email || '';
    if (/^[a-z]{10,}$/i.test(nome)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(nome)) return true;
    if (nome.length > 0 && nome.length < 3) return true;
    if (telefone && /[a-zA-Z]/.test(telefone)) return true;
    const telefoneLimpo = (telefone || '').toString().replace(/\D/g, '');
    if (telefoneLimpo.length > 0 && telefoneLimpo.length < 10) return true;
    if (telefoneLimpo && /^(\d)\1+$/.test(telefoneLimpo)) return true;
    for (const dominio of SPAM_DOMAINS) {
        if (email.toLowerCase().includes(dominio)) return true;
    }
    if (email && (!email.includes('@') || email.split('@').length !== 2)) return true;
    return false;
}

function obterNomeExibicao(nome) {
    const nomeLimpo = String(nome || '').trim();
    if (!nomeLimpo || nomeLimpo.toLowerCase() === 'cliente') {
        return 'Cliente';
    }
    return nomeLimpo.split(' ')[0];
}

function obterNomeEtapa(etapa) {
    const nomes = {
        boas_vindas: 'Boas-vindas',
        formulario_enviado: 'Formulário Enviado',
        analise_correcoes: 'Análise e Correções',
        abertura_processo: 'Abertura do Processo',
        boleto_emitido: 'Boleto Emitido',
        boleto_pago: 'Boleto Pago',
        agendamento_realizado: 'Agendamento Realizado',
        treinamento_realizado: 'Treinamento Concluído',
        entrevista_realizada: 'Entrevista Realizada',
        visto_aprovado: 'Visto Aprovado',
        passaporte_retornado: 'Passaporte Retornado',
        visto_recusado: 'Visto Recusado',
        desconhecida: 'Desconhecida'
    };
    return nomes[etapa] || 'Etapa Desconhecida';
}

function extractFormFields(data) {
    const full_name = data.full_name || data.nome || data['text-84'] || data.fullName || data.name || '';
    const email = data.email || data['email-1'] || data.emailAddress || '';
    const telefone = data.telefone_whatsapp || data.telefone || data['text-77'] || data['phone-1'] || data.phone || '';
    const consulado = data.consulado_cidade || data.consulado || data['text-88'] || data.consulate || '';
    
    let nomeEncontrado = full_name;
    if (!nomeEncontrado) {
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && value.length > 3 && value.length < 100) {
                const words = value.trim().split(/\s+/);
                if (words.length >= 2 && words.every(w => w.length > 1)) {
                    nomeEncontrado = value;
                    break;
                }
            }
        }
    }
    
    return { full_name: nomeEncontrado, email, telefone, consulado };
}

// ============================================================
// 14. FUNÇÕES DE WHATSAPP
// ============================================================

async function enviarWhatsApp(telefone, mensagem) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;

        if (!instance || !token) {
            console.error('❌ Z-API não configurada. Faltam ZAPI_INSTANCE ou ZAPI_TOKEN.');
            console.log('📨 Mensagem que seria enviada:', mensagem);
            return false;
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;

        console.log(`📨 enviarWhatsApp INICIADA para ${telefoneFormatado}`);

        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;

        const headers = {
            'Content-Type': 'application/json'
        };

        if (clientToken) {
            headers['Client-Token'] = clientToken;
            console.log('🔐 Client-Token adicionado ao header');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: telefoneFormatado,
                message: mensagem
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro Z-API (${response.status}):`, errorText);
            return false;
        }

        const data = await response.json();
        console.log('✅ Mensagem enviada com sucesso:', data);
        return true;

    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        return false;
    }
}

async function enviarPDFWhatsApp(telefone, pdfBuffer, nomeCliente) {
    try {
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;

        if (!instance || !token) {
            console.error('❌ Z-API não configurada para envio de PDF.');
            return false;
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;

        const base64PDF = pdfBuffer.toString('base64');

        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-document`;

        const headers = {
            'Content-Type': 'application/json'
        };

        if (clientToken) {
            headers['Client-Token'] = clientToken;
            console.log('🔐 Client-Token adicionado ao header do PDF');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: telefoneFormatado,
                document: base64PDF,
                fileName: `DS160_${nomeCliente || 'cliente'}.pdf`,
                mimeType: 'application/pdf'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro Z-API PDF (${response.status}):`, errorText);
            return false;
        }

        console.log('✅ PDF enviado por WhatsApp com sucesso');
        return true;

    } catch (error) {
        console.error('❌ Erro ao enviar PDF por WhatsApp:', error);
        return false;
    }
}

// ============================================================
// 15. FUNÇÕES DE STATUS E ETAPAS
// ============================================================

async function atualizarStatusCliente(telefone, novoStatus, dadosAdicionais = {}) {
    try {
        const updateData = {
            status: novoStatus,
            updated_at: new Date().toISOString(),
            ...dadosAdicionais
        };

        const { data, error } = await supabase
            .from('clientes')
            .update(updateData)
            .eq('telefone', telefone)
            .select()
            .single();

        if (error) {
            console.error(`❌ Erro ao atualizar status para ${novoStatus}:`, error);
            return { success: false, error };
        }

        console.log(`✅ Status atualizado para "${novoStatus}" para ${telefone}`);
        
        await enviarNotificacaoStatus(telefone, novoStatus, data.nome);
        
        return { success: true, data };
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        return { success: false, error };
    }
}

async function enviarNotificacaoStatus(telefone, status, nome) {
    const mensagens = {
        'lead': `👋 Olá ${nome}! Seu cadastro foi iniciado. Em breve enviaremos o formulário DS-160.`,
        'formulario_solicitado': `📋 Olá ${nome}! O link do formulário DS-160 foi enviado para você. Preencha com atenção e nos avise quando terminar.`,
        'formulario_enviado': `✅ Olá ${nome}! Recebemos seu formulário DS-160 com sucesso!\n\n📌 Nossa equipe já está analisando seus dados.\n\n⏳ Em até 24h entraremos em contato com os próximos passos.`,
        'em_analise': `🔍 Olá ${nome}! Estamos analisando seus documentos e formulário com atenção.\n\n📌 Se houver necessidade de correções, entraremos em contato.\n\n⏳ Aguarde nosso retorno em breve!`,
        'analise_correcoes': `📝 Olá ${nome}! Identificamos alguns pontos que precisam de ajuste no seu formulário.\n\n📌 Em breve nossa equipe entrará em contato para orientar as correções necessárias.`,
        'processo_aberto': `📌 Olá ${nome}! Seu processo foi aberto com sucesso!\n\n✅ Próximos passos:\n• Agendamento da coleta biométrica (CASV)\n• Preparação para a entrevista\n\n📱 Em breve enviaremos mais detalhes.`,
        'boleto_emitido': `💰 Olá ${nome}! O boleto da taxa consular foi emitido.\n\n📌 Verifique seu e-mail para acessar o boleto.\n⏰ Prazo de pagamento: 7 dias úteis.`,
        'boleto_pago': `✅ Olá ${nome}! Confirmamos o pagamento da taxa consular!\n\n📌 Agora vamos prosseguir com o agendamento da sua entrevista.`,
        'agendado_casv': `📅 Olá ${nome}! Seu CASV (coleta biométrica) foi agendado!\n\n📍 Verifique seu e-mail com os detalhes do local e horário.\n\n📌 Não se esqueça de levar:\n• Passaporte original\n• Comprovante de agendamento\n• Documentos pessoais`,
        'agendado_entrevista': `🎤 Olá ${nome}! Sua entrevista no Consulado foi agendada!\n\n📍 Verifique seu e-mail com a data, horário e local.\n\n📌 Dicas importantes:\n• Chegue com 30 minutos de antecedência\n• Leve todos os documentos originais\n• Mantenha a calma e seja sincero(a)`,
        'treinamento_realizado': `✅ Olá ${nome}! Seu treinamento para a entrevista foi concluído!\n\n🎯 Você está preparado(a) para a entrevista!\n\n📌 Lembre-se:\n• Confiança é a chave\n• Responda com clareza\n• Seja objetivo(a)`,
        'entrevista_realizada': `🎤 Olá ${nome}! Sua entrevista foi realizada!\n\n⏳ Agora é aguardar a decisão consular.\n\n📌 O prazo médio é de 7 a 10 dias úteis.\n\n🌟 Fique tranquilo(a)! Em breve teremos novidades.`,
        'visto_aprovado': `🎉 PARABÉNS, ${nome}! 🎉\n\nSeu visto foi APROVADO!\n\n📌 Próximos passos:\n• Seu passaporte será liberado em 5 a 7 dias úteis\n• Você receberá notificação para retirada/entrega\n\n✈️ Agora é planejar sua viagem!\n\n🌟 A GetVisa Assessoria agradece pela confiança!`,
        'visto_recusado': `😔 Olá ${nome}!\n\nInfelizmente seu visto foi recusado.\n\n📌 Não desanime! Isso é mais comum do que parece.\n\n🔍 Vamos analisar com você os motivos e planejar uma nova tentativa.\n\n📱 Fale com a gente agora: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n💪 Isso não muda o seu objetivo! Vamos trabalhar juntos para reverter esse cenário!`,
        'passaporte_retornado': `📦 Olá ${nome}!\n\nSeu passaporte com o visto já está disponível para retirada/entrega!\n\n✅ Processo concluído com sucesso!\n\n✈️ Agora é realizar seus sonhos!\n\n🌟 Agradecemos por confiar na GetVisa Assessoria!`
    };

    const mensagem = mensagens[status] || `🔄 Seu status foi atualizado para: ${status}`;
    
    try {
        await enviarWhatsApp(telefone, mensagem);
        console.log(`📱 Notificação de status enviada para ${telefone}: ${status}`);
    } catch (error) {
        console.error('❌ Erro ao enviar notificação de status:', error);
    }
}

async function salvarTreinamento(telefone, treinamento) {
    const { data, error } = await supabase
        .from('etapas_processo')
        .upsert({
            cliente_telefone: telefone,
            etapa_atual: 'treinamento_agendado',
            data_treinamento_agendado: new Date().toISOString(),
            dados_treinamento: treinamento,
            data_atualizacao: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'cliente_telefone' })
        .select()
        .single();

    if (error) {
        console.error('❌ Erro ao salvar treinamento:', error);
        return { success: false, error };
    }

    return { success: true, data };
}

async function enviarNotificacaoEtapa(telefone, etapa, dadosCliente) {
    const mensagens = {
        'formulario_enviado': (nome) => `✅ Olá ${nome}! Recebemos seu formulário DS-160 com sucesso!\n\n📌 Nossa equipe já está analisando seus dados.\n\n⏳ Em até 24h entraremos em contato.`,
        'analise_correcoes': (nome) => `🔍 Olá ${nome}! Estamos analisando seus documentos.\n\n📌 Em breve entraremos em contato se houver correções.`,
        'abertura_processo': (nome) => `📌 Olá ${nome}! Seu processo foi aberto com sucesso!\n\n✅ Próximos passos:\n• Agendamento CASV\n• Preparação para entrevista`,
        'boleto_emitido': (nome) => `💰 Olá ${nome}! O boleto da taxa consular foi emitido.\n\n📌 Verifique seu e-mail para acessar o boleto.\n⏰ Prazo: 7 dias úteis.`,
        'boleto_pago': (nome) => `✅ Olá ${nome}! Pagamento confirmado!\n\n📌 Agora vamos agendar sua coleta biométrica.`,
        'agendado_casv': (nome) => `📅 Olá ${nome}! Seu CASV foi agendado!\n\n📍 Verifique seu e-mail com os detalhes.\n\n⚠️ Leve a CONFIRMATION IMPRESSA e PASSAPORTE.`,
        'treinamento_agendado': (nome) => `🎯 Olá ${nome}! Seu treinamento foi agendado!\n\n📅 Data e horário enviados por e-mail.\n\n📌 Prepare-se! Estamos com você!`,
        'treinamento_realizado': (nome) => `✅ Olá ${nome}! Treinamento concluído!\n\n🎯 Você está preparado(a) para a entrevista!\n\n💪 Confie no seu potencial!`,
        'agendado_entrevista': (nome) => `🎤 Olá ${nome}! Sua entrevista foi agendada!\n\n📍 Verifique seu e-mail com data, horário e local.\n\n📌 Dicas: chegue com 30 min de antecedência.`,
        'entrevista_realizada': (nome) => `🎤 Olá ${nome}! Entrevista realizada!\n\n⏳ Agora é aguardar a decisão consular.\n\n📌 Prazo médio: 7 a 10 dias úteis.`,
        'visto_aprovado': (nome) => `🎉 PARABÉNS, ${nome}! 🎉\n\nSeu visto foi APROVADO!\n\n📌 Passaporte será liberado em 5 a 7 dias úteis.\n\n✈️ Agora é planejar sua viagem!`,
        'visto_recusado': (nome) => `😔 Olá ${nome}!\n\nInfelizmente seu visto foi recusado.\n\n📌 Não desanime! Vamos analisar os motivos.\n\n📱 [Fale com especialista](https://wa.me/5521974601812)`,
        'passaporte_retornado': (nome) => `📦 Olá ${nome}!\n\nSeu passaporte com o visto está disponível!\n\n✅ Processo concluído com sucesso!\n\n🌟 Agradecemos por confiar na GetVisa!`,
        'finalizado': (nome) => `🏁 Olá ${nome}!\n\nSeu processo foi finalizado com sucesso!\n\n🌟 Agradecemos por confiar na GetVisa Assessoria!`
    };

    const nome = dadosCliente?.nome || 'Cliente';
    const mensagem = mensagens[etapa]?.(nome) || `🔄 Seu processo foi atualizado para: ${ETAPA_LABELS[etapa] || etapa}`;
    
    try {
        await enviarWhatsApp(telefone, mensagem);
        console.log(`📱 Notificação de etapa enviada para ${telefone}: ${etapa}`);
    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
    }
}

async function criarEtapaInicial(telefone) {
    try {
        const { data, error } = await supabase
            .from('etapas_processo')
            .insert({
                cliente_telefone: telefone,
                etapa_atual: 'formulario_enviado',
                data_atualizacao: new Date().toISOString(),
                historico: [{
                    etapa: 'formulario_enviado',
                    data: new Date().toISOString(),
                    observacao: 'Formulário DS-160 recebido'
                }],
                data_formulario_enviado: new Date().toISOString()
            })
            .select()
            .single();
        if (error) throw error;
        console.log('✅ Etapa inicial criada para:', telefone);
        return data;
    } catch (error) {
        if (error.code === '23505') {
            console.log('⚠️ Etapa inicial já existe para este cliente:', telefone);
            return null;
        }
        console.error('❌ Erro ao criar etapa inicial:', error);
        throw error;
    }
}

async function sendReply(phone, message) {
    try {
        console.log(`📨 sendReply INICIADA para ${phone}`);
        console.log(`📨 Mensagem: ${message}`);
        const resultado = await enviarWhatsApp(phone, message);
        console.log(`✅ Mensagem enviada: ${resultado}`);
        return resultado;
    } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${phone}:`, error);
        return false;
    }
}

// ============================================================
// 16. FUNÇÕES DE DETECÇÃO DE INTENÇÃO E RESPOSTAS
// ============================================================

function normalizarTexto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[!?.,;:()[\]$|{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectarIntencao(mensagem) {
    const texto = normalizarTexto(mensagem);

    if (!texto) {
        return 'desconhecida';
    }

    const saudacoes = ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem', 'hello', 'hi'];
    if (saudacoes.some((item) => texto === item || texto.startsWith(`${item} `))) {
        return 'saudacao';
    }

    if (['ds160', 'formulario ds160', 'quero preencher ds160', 'preciso do ds160',
         'formulario visto americano', 'preencher visto americano', 'quero o formulario', 'link do formulario'].some((item) => texto.includes(item))) {
        return 'solicitar_ds160';
    }

    if (['status', 'andamento', 'situacao', 'etapa', 'fase', 'progresso',
         'como esta meu processo', 'como esta o meu processo', 'qual o andamento', 'qual a situacao'].some((item) => texto.includes(item))) {
        return 'andamento';
    }

    if (['documento', 'documentos', 'documentacao', 'requisito', 'requisitos', 'papel', 'papeis'].some((item) => texto.includes(item))) {
        return 'documentos';
    }

    if (['prazo', 'quanto tempo', 'quanto demora', 'demora', 'dias', 'semanas', 'agendamento', 'processamento'].some((item) => texto.includes(item))) {
        return 'prazo';
    }

    if (['pagamento', 'pagar', 'preco', 'valor', 'valores', 'quanto custa', 'custo', 'investimento', 'taxa'].some((item) => texto.includes(item))) {
        return 'pagamento';
    }

    if (['ajuda', 'atendente', 'especialista', 'falar com alguem', 'contato', 'humano'].some((item) => texto.includes(item))) {
        return 'ajuda';
    }

    if (['negado', 'negativa', 'recusado', 'recusaram', 'deportado', 'visto negado'].some((item) => texto.includes(item))) {
        return 'visto_negado';
    }

    if (texto.includes('visto americano') || texto.includes('visto eua') ||
        texto.includes('visto estados unidos') || texto.includes('visto usa') ||
        texto.includes('b1') || texto.includes('b2')) {
        return 'visto_americano';
    }

    if (texto.includes('visto canadense') || texto.includes('visto canada')) {
        return 'visto_canadense';
    }

    if (texto.includes('visto australiano') || texto.includes('visto australia')) {
        return 'visto_australiano';
    }

    if (texto.includes('eta uk') || texto.includes('reino unido') || texto.includes('inglaterra')) {
        return 'eta_uk';
    }

    if (texto.includes('passaporte')) {
        return 'passaporte';
    }

    if (['quero fazer o visto', 'quero meu visto', 'iniciar processo', 'comecar processo',
         'quero contratar', 'quero iniciar', 'vou contratar', 'quero informação', 'quero saber', 'me ajuda'].some((item) => texto.includes(item))) {
        return 'iniciar_processo';
    }

    if (['indicar', 'recomendar', 'amigo', 'conhecido', 'contato de amigo',
         'posso indicar', 'quero indicar', 'indicacao', 'recomendacao'].some((item) => texto.includes(item))) {
        return 'indicar_amigo';
    }

    if (['falar com especialista', 'falar com atendente', 'falar com humano',
         'quero falar com alguem', 'preciso de ajuda especializada',
         'duvida nao contemplada', 'caso especifico', 'situacao diferente'].some((item) => texto.includes(item))) {
        return 'falar_especialista';
    }

    if (['duvida', 'pergunta', 'esclarecimento', 'informacao adicional',
         'nao entendi', 'pode me explicar', 'gostaria de saber'].some((item) => texto.includes(item))) {
        return 'duvida_geral';
    }

    if (['otimo', 'excelente', 'muito bom', 'gostei', 'parabens', 'feedback', 'avaliacao'].some((item) => texto.includes(item))) {
        return 'feedback';
    }

    return 'desconhecida';
}

function getMensagemFormularioParaBot(nomeCliente) {
    let primeiroNome = 'Cliente';
    try {
        if (nomeCliente && typeof nomeCliente === 'string' && nomeCliente.trim().length > 0) {
            primeiroNome = nomeCliente.trim().split(' ')[0];
        }
    } catch (err) {
        console.error('Erro ao processar nome:', err);
        primeiroNome = 'Cliente';
    }

    return `🌟 *ÓTIMO, ${primeiroNome.toUpperCase()}!* 🌟\n\n` +
           `Para iniciarmos seu processo, preciso que você preencha nosso formulário com os dados do visto americano.\n\n` +
           `📋 *LINK DO FORMULÁRIO:*\n` +
           `🔗 [Clique aqui para preencher o formulário](https://app.getvisa.com.br/formulario-ds160)\n\n` +
           `⏱️ *Tempo estimado:* 15-20 minutos\n` +
           `📱 *Pode preencher pelo celular ou computador*\n\n` +
           `✅ *Depois de preencher:*\n` +
           `• Nossa equipe fará a análise dos dados\n` +
           `• Você receberá a confirmação por e-mail\n` +
           `• Iniciaremos o agendamento da entrevista\n\n` +
           `💡 *Dica:* Tenha seu passaporte em mãos para preencher os dados corretamente.\n\n` +
           `📱 Dúvidas? Fale com a gente: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
           `⚡ *Vamos realizar seu sonho de viajar para os EUA!* ✈️`;
}

function getMensagemFormularioComEspecialista(nomeCliente) {
    let primeiroNome = 'Cliente';
    try {
        if (nomeCliente && typeof nomeCliente === 'string' && nomeCliente.trim().length > 0) {
            primeiroNome = nomeCliente.trim().split(' ')[0];
        }
    } catch (err) {
        primeiroNome = 'Cliente';
    }

    return `🎯 *Perfeito, ${primeiroNome}!* 🎯\n\n` +
           `Seu especialista já está aguardando o formulário para dar início ao seu processo.\n\n` +
           `📋 *Preencha agora mesmo o DS-160:*\n` +
           `🔗 [Clique aqui para preencher o formulário](https://app.getvisa.com.br/formulario-ds160)\n\n` +
           `⏱️ *Em até 20 minutos* você conclui.\n` +
           `📱 Pode preencher pelo celular ou computador.\n\n` +
           `✅ *Quando terminar:*\n` +
           `• Nossa equipe fará a análise dos dados em até 24h\n` +
           `• Você receberá a confirmação por e-mail\n` +
           `• Iniciaremos o agendamento da entrevista\n\n` +
           `💡 *Dica:* Tenha seu passaporte em mãos.\n\n` +
           `📱 Dúvidas? Chame a gente: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
           `⚡ *Vamos realizar seu sonho!* ✈️`;
}

function gerarRespostaBot(intencao, nome, etapaAtual) {
    const primeiroNome = obterNomeExibicao(nome);
    const etapa = obterNomeEtapa(etapaAtual);

    const respostas = {
        saudacao:
            `👋 Olá, ${primeiroNome}!\n\n` +
            `Sou o assistente da GetVisa Assessoria. Estou aqui para ajudar com informações sobre vistos, documentos, prazos e andamento do processo.\n\n` +
            `Como posso ajudar?`,

        solicitar_ds160: getMensagemFormularioParaBot(primeiroNome),

        andamento:
            `Certo, ${primeiroNome}! Para verificar o andamento do seu processo, por favor, me informe o número do seu protocolo ou CPF.`,

        documentos:
            `Para informações sobre documentos, ${primeiroNome}, preciso saber qual visto ou serviço você precisa. Por exemplo, "documentos para visto americano".`,

        prazo:
            `Os prazos variam bastante, ${primeiroNome}. Para qual visto ou serviço você gostaria de saber o prazo?`,

        pagamento:
            `Para informações sobre pagamentos, ${primeiroNome}, preciso saber qual serviço ou etapa do processo você se refere. Você pode me dar mais detalhes?`,

        ajuda:
            `Olá, ${primeiroNome}! Se precisar de ajuda ou quiser falar com um especialista, pode me chamar ou entrar em contato direto pelo WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812).`,

        visto_negado:
            `Se o seu visto foi negado, ${primeiroNome}, não se preocupe! Temos um serviço de recuperação. Acesse: <a href="https://getvisa.com.br/visto-americano-negado" target="_blank" style="text-decoration: underline;">getvisa.com.br/visto-americano-negado</a> para uma análise gratuita.`,

        visto_americano:
            `O Visto Americano (B1/B2) é para turismo e negócios, ${primeiroNome}. O processo envolve preenchimento do DS-160, agendamento de entrevista e coleta de biometria. Saiba mais em <a href="https://getvisa.com.br/visto-americano" target="_blank" style="text-decoration: underline;">getvisa.com.br/visto-americano</a>.`,

        visto_canadense:
            `Para o Visto Canadense, ${primeiroNome}, o processo geralmente é online e pode incluir biometria. Existem diferentes tipos de visto dependendo do seu objetivo. Mais detalhes em <a href="https://getvisa.com.br/visto-canadense" target="_blank" style="text-decoration: underline;">getvisa.com.br/visto-canadense</a>.`,

        visto_australiano:
            `O Visto Australiano, ${primeiroNome}, é solicitado online e pode exigir o envio de documentos. É importante verificar os requisitos específicos para o seu tipo de viagem. Informações em <a href="https://getvisa.com.br/visto-australiano" target="_blank" style="text-decoration: underline;">getvisa.com.br/visto-australiano</a>.`,

        eta_uk:
            `O eTA UK é uma autorização eletrônica de viagem para o Reino Unido, ${primeiroNome}. Você precisará de um passaporte válido e preencher o formulário online. Ele não é um visto, mas uma permissão para entrar. Informações em <a href="https://getvisa.com.br/eta-uk" target="_blank" style="text-decoration: underline;">getvisa.com.br/eta-uk</a>.`,

        passaporte:
            `O passaporte é o documento de viagem essencial, ${primeiroNome}. Para solicitá-lo ou renová-lo, você deve agendar um atendimento na Polícia Federal. Podemos te auxiliar com as informações necessárias. Visite <a href="https://getvisa.com.br/passaporte" target="_blank" style="text-decoration: underline;">getvisa.com.br/passaporte</a>.`,

        iniciar_processo:
            `Excelente, ${primeiroNome}! Para iniciar seu processo de visto, por favor, visite nosso site <a href="https://www.getvisa.com.br/iniciar-processo" target="_blank" style="text-decoration: underline;">www.getvisa.com.br/iniciar-processo</a> ou entre em contato com nossa equipe para um atendimento personalizado.`,
            
        indicar_amigo:
            `👥 *Olá ${primeiroNome}!*\n\nQue legal você indicar a GetVisa! 🌟\n\n📱 *Compartilhe:* wa.me/5521974601812\n🌐 *Site:* getvisa.com.br\n📋 *Formulário:* https://app.getvisa.com.br/formulario-ds160\n\n🎁 *Bônus para você:*\nIndique um amigo que feche o processo e ganhe 10% de desconto!`,

        falar_especialista:
            `👨‍💼 *Olá ${primeiroNome}!*\n\nEntendi que você tem uma situação específica.\n\n📱 *Fale com Moisés diretamente:*\n[Clique aqui](https://wa.me/5521974601812)\n\n📧 *Ou por e-mail:* contato@getvisa.com.br\n\n⏰ *Atendimento:* Seg-Sex, 9h às 18h\n📌 *Resposta:* até 2 horas`,

        duvida_geral:
            `🤔 *Olá ${primeiroNome}!*\n\nPosso ajudar com:\n\n1️⃣ *Documentos* - Quais levar\n2️⃣ *Prazo* - Quanto tempo demora\n3️⃣ *Status* - Andamento do seu processo\n4️⃣ *Valores* - Quanto custa\n\n💡 *Seja específico(a)*, ex: "documentos para visto"`,

        feedback:
            `⭐ *Olá ${primeiroNome}!*\n\nFicamos felizes com seu feedback! 🌟\n\n📱 *Compartilhe sua experiência:*\n[Clique aqui](https://wa.me/5521974601812)\n\n📧 *Ou por e-mail:* contato@getvisa.com.br\n\n⭐ *Avalie-nos:* Excelente | Bom | Regular`
    };

    return respostas[intencao] ||
        `Olá, ${primeiroNome}!\n\n` +
        `Não consegui identificar sua solicitação.\n\n` +
        `Você pode perguntar sobre documentos, prazo, pagamento ou andamento do processo.`;
}

function getSubmenu(service) {
    const names = {
        'visto_americano': '🇺🇸 VISTO AMERICANO',
        'visto_canadense': '🇨🇦 VISTO CANADENSE',
        'visto_australiano': '🇦🇺 VISTO AUSTRALIANO',
        'eta_uk': '🇬🇧 eTA UK',
        'eta_canadense': '🇨🇦 eTA CANADENSE',
        'passaporte': '🛂 PASSAPORTE'
    };

    const isPassaporte = service === 'passaporte';
    const opcao5 = isPassaporte ? '🏛️ ONDE FAZER' : '🔄 VISTO NEGADO';
    const nome = names[service] || 'SERVIÇO';

    return '📋 ' + nome + '\n\n' +
        '1️⃣ - 💰 PREÇO\n' +
        '2️⃣ - ⏱️ PRAZO\n' +
        '3️⃣ - 📄 DOCUMENTOS\n' +
        '4️⃣ - 🔄 PROCESSO\n' +
        '5️⃣ - ' + opcao5 + '\n' +
        '6️⃣ - 📊 AVALIAÇÃO GRATUITA\n' +
        '7️⃣ - 👨‍💼 FALAR COM ESPECIALISTA\n\n' +
        '0️⃣ - VOLTAR AO MENU PRINCIPAL\n\n' +
        'Digite o número da opção (1-7)';
}

function getRespostaSubmenu(servico, opcao) {
    var respostas = {
        preco: {
            visto_americano: '💰 INVESTIMENTO - VISTO AMERICANO\n\n💵 Taxa Consular: ~R$ 950,00\n💼 Assessoria GetVisa: R$ 350,00\n\n✅ INCLUI: Preenchimento DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '💰 INVESTIMENTO - VISTO CANADENSE\n\n💵 Taxa Consular: ~R$ 750,00\n💼 Assessoria GetVisa: R$ 400,00\n\n✅ INCLUI: Aplicação online, biometria, preparação de documentos e acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '💰 INVESTIMENTO - VISTO AUSTRALIANO\n\n💵 Taxa Consular: ~R$ 850,00\n💼 Assessoria GetVisa: R$ 450,00\n\n✅ INCLUI: Análise de perfil, aplicação online, documentação específica.\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '💰 INVESTIMENTO - eTA UK\n\n💵 Taxa: ~R$ 120,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Aplicação online, validação de dados, acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '💰 INVESTIMENTO - eTA CANADENSE\n\n💵 Taxa: ~R$ 50,00\n💼 Assessoria GetVisa: R$ 100,00\n\n✅ INCLUI: Aplicação online rápida, validação, entrega por e-mail.\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '💰 INVESTIMENTO - PASSAPORTE\n\n💵 Taxa PF: ~R$ 257,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Agendamento, orientação documental, acompanhamento.\n\nDigite 0 para voltar ao MENU principal'
        },
        prazo: {
            visto_americano: '⏱️ PRAZO - VISTO AMERICANO\n\nAgendamento: até 8 semanas\nAnálise consular: 7 a 10 dias úteis\nRetorno do passaporte: 5 a 7 dias úteis\n\nTotal estimado: 30 a 40 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '⏱️ PRAZO - VISTO CANADENSE\n\nProcessamento: 4 a 8 semanas\nRetorno: 2 a 3 dias úteis\n\nTotal estimado: 30 a 60 dias\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '⏱️ PRAZO - VISTO AUSTRALIANO\n\nProcessamento: 2 a 4 semanas\n\nTotal estimado: 15 a 30 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '⏱️ PRAZO - eTA UK\n\nProcessamento: até 72 horas\n\nTotal estimado: 1 a 3 dias\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '⏱️ PRAZO - eTA CANADENSE\n\nProcessamento: até 24 horas\n\nTotal estimado: 1 dia\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '⏱️ PRAZO - PASSAPORTE\n\nEmissão: 7 a 15 dias úteis\n\nTotal estimado: 10 a 20 dias\n\nDigite 0 para voltar ao MENU principal'
        },
        documentos: {
            visto_americano: '📄 DOCUMENTOS - VISTO AMERICANO\n\nOBRIGATÓRIOS:\n- Passaporte válido (mínimo 6 meses)\n- Foto 5x7 recente\n- Comprovante da taxa consular\n- DS-160 preenchido\n\nRECOMENDADOS:\n- Comprovante de renda\n- Extratos bancários\n- Comprovante de imóvel/veículo\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '📄 DOCUMENTOS - VISTO CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Foto digital\n- Comprovantes financeiros\n\nRECOMENDADOS:\n- Carta de intenção\n- Histórico de viagens\n- Vínculos com o Brasil\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '📄 DOCUMENTOS - VISTO AUSTRALIANO\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Comprovantes de recursos\n- Seguro saúde (recomendado)\n\nRECOMENDADOS:\n- Roteiro de viagem\n- Reservas de hospedagem\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '📄 DOCUMENTOS - eTA UK\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- E-mail válido\n- Dados de viagem\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '📄 DOCUMENTOS - eTA CANADENSE\n\nOBRIGATÓRIOS:\n- Passaporte válido\n- Cartão de crédito para taxa\n- E-mail válido\n\nPROCESSO:\n- Aplicação 100% online\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '📄 DOCUMENTOS - PASSAPORTE\n\nOBRIGATÓRIOS:\n- RG original\n- CPF\n- Título de eleitor (homens 18-70)\n- Certidão de nascimento/casamento\n- Comprovante de quitação militar (homens)\n\nDigite 0 para voltar ao MENU principal'
        },
        processo: {
            visto_americano: '🔄 PROCESSO - VISTO AMERICANO\n\n- Análise de perfil\n- Preenchimento do DS-160\n- Pagamento da taxa consular\n- Agendamento da entrevista\n- Coleta biométrica (CASV)\n- Entrevista no Consulado\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '🔄 PROCESSO - VISTO CANADENSE\n\n- Análise de perfil\n- Aplicação online GCKey\n- Pagamento das taxas\n- Agendamento da biometria\n- Coleta de dados biométricos\n- Entrevista (se solicitado)\n- Decisão e envio\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '🔄 PROCESSO - VISTO AUSTRALIANO\n\n- Análise de perfil\n- Aplicação online ImmiAccount\n- Pagamento das taxas\n- Envio de documentos\n- Acompanhamento\n- Decisão por e-mail\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '🔄 PROCESSO - eTA UK\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '🔄 PROCESSO - eTA CANADENSE\n\n- Coleta de dados\n- Aplicação online\n- Pagamento da taxa\n- Análise automatizada\n- Recebimento por e-mail\n- Vincular ao passaporte\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '🔄 PROCESSO - PASSAPORTE\n\n- Agendamento no site da PF\n- Separação dos documentos\n- Pagamento da GRU\n- Comparecimento ao posto\n- Coleta de dados biométricos\n- Aguardar emissão\n- Retirada do passaporte\n\nDigite 0 para voltar ao MENU principal'
        }
    };
    var resposta = respostas[opcao] && respostas[opcao][servico];
    if (!resposta) {
        resposta = '📋 INFORMAÇÕES EM BREVE\n\nEstamos preparando o conteúdo específico para ' + servico.replace('_', ' ').toUpperCase() + '.\n\nDigite 0 para voltar ao MENU principal';
    }
    return resposta;
}

// ============================================================
// 17. FUNÇÕES DE PROCESSAMENTO DE MENSAGEM DO BOT
// ============================================================

async function processarMensagem(telefoneLimpo, mensagem) {
    console.log('🔄 ===== PROCESSAR MENSAGEM INICIADO =====');
    console.log(`📱 Telefone: ${telefoneLimpo}`);
    console.log(`💬 Mensagem: "${mensagem}"`);

    try {
        let cliente = await buscarClienteEmQualquerTabela(telefoneLimpo, 'clientes');
        console.log(`🔍 Cliente encontrado: ${cliente ? 'Sim' : 'Não'}`);
        if (cliente) console.log(`👤 Nome: ${cliente.nome}`);

        let state = userState.get(telefoneLimpo);

        if (!state) {
            console.log('🆕 Criando novo estado para cliente');
            state = {
                onboardingStep: null,
                onboardingCompleto: false,
                nome: cliente?.nome || null,
                email: cliente?.email || null,
                nivel: 'onboarding',
                service: null,
                lastActivity: Date.now()
            };

            if (cliente?.nome && cliente?.email) {
                console.log('✅ Cliente já tem nome e email, pulando onboarding');
                state.onboardingCompleto = true;
                state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
                state.nivel = 'principal';
            } else if (cliente?.nome) {
                console.log('📝 Cliente tem nome, indo para email');
                state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_EMAIL;
                state.nome = cliente.nome;
                state.onboardingCompleto = false;
                state.nivel = 'onboarding';
                await sendReply(telefoneLimpo, `📝 Olá ${cliente.nome.split(' ')[0]}! Agora me diga seu e-mail:\n\n📧 **Qual é o seu e-mail?**`);
                return;
            } else {
                console.log('👤 Cliente sem nome, iniciando onboarding');
                state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
                state.nivel = 'onboarding';
                await processarOnboarding(telefoneLimpo, mensagem, state);
                return;
            }

            userState.set(telefoneLimpo, state);
        }

        console.log(`📊 Estado atual:`);
        console.log(`  - onboardingStep: ${state.onboardingStep}`);
        console.log(`  - onboardingCompleto: ${state.onboardingCompleto}`);
        console.log(`  - nivel: ${state.nivel}`);
        console.log(`  - service: ${state.service}`);

        // Caso especial: comando "menu" ou "0"
        if (mensagem.trim() === '0' || mensagem.toLowerCase().trim() === 'menu' || mensagem.toLowerCase().trim() === 'menu principal') {
            console.log('📋 Comando MENU detectado');
            state.nivel = 'principal';
            state.service = null;
            userState.set(telefoneLimpo, state);

            if (!state.onboardingCompleto) {
                await sendReply(telefoneLimpo, '👋 Antes de continuar, preciso saber seu nome!\n\n📝 **Qual é o seu nome completo?**');
                return;
            }

            const menu = await getMenuPrincipal();
            await sendReply(telefoneLimpo, menu);
            return;
        }

        // Se ainda estiver em onboarding
        if (state.onboardingStep !== ONBOARDING_STEPS.COMPLETO && state.nivel === 'onboarding') {
            console.log('🔄 Processando onboarding...');
            await processarOnboarding(telefoneLimpo, mensagem, state);
            return;
        }

        // Se estiver em um submenu
        if (state.nivel === 'submenu' && state.service) {
            console.log(`📋 Processando submenu para ${state.service}`);
            await processarOpcaoNoSubmenu(telefoneLimpo, mensagem, state);
            return;
        }

        // Menu principal
        if (state.nivel === 'principal') {
            console.log('📋 Processando menu principal');
            await processarOpcaoNoMenuPrincipal(telefoneLimpo, mensagem, state);
            return;
        }

        // Fallback
        console.log('⚠️ Estado desconhecido, voltando para o menu principal');
        state.nivel = 'principal';
        state.service = null;
        userState.set(telefoneLimpo, state);
        await sendReply(telefoneLimpo, await getMenuPrincipal());

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        console.error('❌ Stack:', error.stack);
        await sendReply(telefoneLimpo, '❌ Desculpe, ocorreu um erro. Digite 0 para o menu principal.');
    }
}

// ============================================================
// 18. FUNÇÕES DE ONBOARDING E MENU
// ============================================================

async function processarOnboarding(cleanPhone, messageText, state) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: "' + messageText + '"');

    const telefoneLimpo = cleanPhone.toString().replace(/\D/g, '');
    console.log('📱 Telefone limpo para uso:', telefoneLimpo);

    const escapeCommands = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (escapeCommands.includes(messageText.toLowerCase().trim())) {
        await sendReply(cleanPhone, '👋 Antes de continuar, preciso saber seu nome para te atender melhor!\n\n' +
            '📝 **Qual é o seu nome completo?**\n\nEx: Maria Silva');
        return;
    }

    switch (state.onboardingStep) {
        case ONBOARDING_STEPS.SAUDACAO:
            console.log('📌 PASSO 1: SAUDAÇÃO');
            const saudacao = getRandomMessage(BOAS_VINDAS_MESSAGES.primeira_saudacao);
            const pedirNome = getRandomMessage(BOAS_VINDAS_MESSAGES.solicitar_nome);

            await sendReply(cleanPhone, saudacao + '\n\n' + pedirNome);

            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_NOME;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: AGUARDANDO_NOME');
            break;

        case ONBOARDING_STEPS.AGUARDANDO_NOME:
            console.log('📌 PASSO 2: AGUARDANDO NOME');
            console.log('📝 Nome recebido: "' + messageText + '"');

            const nomeValidado = validarNome(messageText);
            console.log('✅ Nome válido?', nomeValidado);

            if (!nomeValidado) {
                const msgInvalido = getRandomMessage(BOAS_VINDAS_MESSAGES.nome_invalido);
                await sendReply(cleanPhone, msgInvalido);
                return;
            }

            const nomeFormatado = formatarNome(messageText);
            console.log('📝 Nome formatado: "' + nomeFormatado + '"');

            try {
                console.log('DEBUG SUPABASE: Tentando upsert para telefone:', telefoneLimpo, 'nome:', nomeFormatado);
                const { data, error } = await supabase
                    .from('clientes')
                    .upsert({
                        telefone: telefoneLimpo,
                        nome: nomeFormatado,
                        data_contato: new Date().toISOString(),
                        status: 'novo',
                        onboarding_completo: false,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'telefone'
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('❌ ERRO SUPABASE: Erro ao salvar nome:', error);
                    await sendReply(cleanPhone, '❌ Erro ao salvar seu nome no banco de dados. Tente novamente.');
                    return;
                }
                console.log('✅ SUPABASE: Nome salvo no Supabase:', nomeFormatado, 'Dados retornados:', data);
            } catch (err) {
                console.error('❌ ERRO CRÍTICO SUPABASE: Erro inesperado ao salvar nome:', err);
                await sendReply(cleanPhone, '❌ Erro crítico ao salvar. Tente novamente.');
                return;
            }

            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_EMAIL;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: AGUARDANDO_EMAIL');

            const parte1 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1);
            const parte2 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2);
            const mensagemEmail = parte1 + nomeFormatado.split(' ')[0] + parte2;

            await sendReply(cleanPhone, mensagemEmail);
            console.log('📧 Mensagem de email enviada');
            break;

        case ONBOARDING_STEPS.AGUARDANDO_EMAIL:
            console.log('📌 PASSO 3: AGUARDANDO EMAIL');
            console.log('📧 Email recebido: "' + messageText + '"');

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(messageText)) {
                console.log('❌ Email inválido');
                await sendReply(cleanPhone, '❌ E-mail inválido! Por favor, digite um e-mail válido.\n\n📧 Ex: maria@email.com');
                return;
            }

            const email = messageText.trim().toLowerCase();
            const nome = state.nome;
            console.log('📧 Email válido:', email);
            console.log('👤 Nome associado:', nome);

            try {
                const { data, error } = await supabase
                    .from('clientes')
                    .upsert({
                        telefone: telefoneLimpo,
                        nome: nome,
                        email: email,
                        data_contato: new Date().toISOString(),
                        status: 'lead',
                        onboarding_completo: true,
                        data_onboarding: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'telefone'
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Erro ao salvar e-mail:', error);
                    await sendReply(cleanPhone, '❌ Erro ao salvar seu e-mail. Tente novamente.');
                    return;
                }
                console.log('✅ E-mail salvo no Supabase:', email);
                console.log('✅ Onboarding completo para:', nome);
            } catch (err) {
                console.error('❌ Erro ao salvar e-mail:', err);
                await sendReply(cleanPhone, '❌ Erro ao salvar. Tente novamente.');
                return;
            }

            state.email = email;
            state.onboardingCompleto = true;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: COMPLETO');

            const primeiroNome = nome.split(' ')[0];
            const mensagemFinal = `✅ Perfeito, ${primeiroNome}! Seus dados foram salvos com sucesso!\n\n` +
                                 `Agora escolha o serviço desejado:\n\n` +
                                 `🌟 **GETVISA - ASSESSORIA EM VISTOS**\n\n` +
                                 `1️⃣ - 🇺🇸 VISTO AMERICANO\n` +
                                 `2️⃣ - 🇨🇦 VISTO CANADENSE\n` +
                                 `3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n` +
                                 `4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n` +
                                 `5️⃣ - 🇨🇦 eTA CANADENSE\n` +
                                 `6️⃣ - 🛂 PASSAPORTE\n` +
                                 `7️⃣ - 📞 AJUDA / CONTATO\n\n` +
                                 `Digite o número da opção (1-7)`;

            await sendReply(cleanPhone, mensagemFinal);
            console.log('📨 Mensagem de confirmação enviada');
            break;

        case ONBOARDING_STEPS.COMPLETO:
            console.log('⚠️ Onboarding já completo, enviando menu principal');
            const menuCompleto = await getMenuPrincipal();
            await sendReply(cleanPhone, menuCompleto);
            break;

        default:
            console.log('⚠️ Estado de onboarding desconhecido, reiniciando');
            state.onboardingStep = ONBOARDING_STEPS.SAUDACAO;
            state.onboardingCompleto = false;
            state.nome = null;
            state.email = null;
            state.nivel = 'onboarding';
            userState.set(cleanPhone, state);
            await processarOnboarding(cleanPhone, messageText, state);
    }
}

async function getMenuPrincipal() {
    return '🌟 GETVISA - ASSESSORIA EM VISTOS\n\n' +
           'Escolha o serviço desejado:\n\n' +
           '1️⃣ - 🇺🇸 VISTO AMERICANO\n' +
           '2️⃣ - 🇨🇦 VISTO CANADENSE\n' +
           '3️⃣ - 🇦🇺 VISTO AUSTRALIANO\n' +
           '4️⃣ - 🇬🇧 eTA UK (REINO UNIDO)\n' +
           '5️⃣ - 🇨🇦 eTA CANADENSE\n' +
           '6️⃣ - 🛂 PASSAPORTE\n' +
           '7️⃣ - 📞 AJUDA / CONTATO\n\n' +
           'Digite o número da opção (1-7) ou 0 para ver este MENU novamente';
}

async function processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state) {
    console.log('=== MENU PRINCIPAL ===');
    console.log('Mensagem recebida: "' + messageText + '"');

    const servicoMap = {
        '1': 'visto_americano', '2': 'visto_canadense', '3': 'visto_australiano',
        '4': 'eta_uk', '5': 'eta_canadense', '6': 'passaporte'
    };

    try {
        if (servicoMap[messageText]) {
            const serviceKey = servicoMap[messageText];
            state.nivel = 'submenu';
            state.service = serviceKey;
            userState.set(cleanPhone, state);
            try {
                await sendReply(cleanPhone, getSubmenu(serviceKey));
            } catch (err) {
                await sendReply(cleanPhone, '📋 Serviço selecionado! Digite 0 para voltar ao menu principal.');
            }
            return;
        }

        if (messageText === '7') {
            let nome = state?.nome || 'Cliente';
            try {
                const { data } = await supabase.from('clientes').select('nome').eq('telefone', cleanPhone).maybeSingle();
                if (data?.nome) nome = data.nome;
            } catch (e) {}
            await sendReply(cleanPhone, `📞 *Olá ${nome.split(' ')[0]}!* Precisa de ajuda? 👇\n\n👨‍💼 *Fale com Moisés:* wa.me/5521974601812\n📧 contato@getvisa.com.br\n🌐 getvisa.com.br\n📋 https://app.getvisa.com.br/formulario-ds160\n\nDigite 0 para o MENU principal`);
            return;
        }

        let intent = null;
        try { intent = detectarIntencao(messageText); } catch (e) {}
        console.log('Intenção detectada:', intent);

        let clienteDB = null;
        try {
            const { data } = await supabase
                .from('clientes')
                .select('status, etapa_atual, nome, consulado')
                .eq('telefone', cleanPhone)
                .maybeSingle();
            if (data) clienteDB = data;
        } catch (e) {}

        const nomeCliente = clienteDB?.nome || state?.nome || 'Cliente';
        const primeiroNome = nomeCliente.split(' ')[0];

        let servicoCliente = 'visto_americano';
        let servicoLabel = 'Visto Americano';
        
        if (clienteDB?.consulado) {
            servicoCliente = 'visto_americano';
            servicoLabel = `Visto Americano (${clienteDB.consulado})`;
        } else if (clienteDB?.status) {
            servicoCliente = 'visto_americano';
            servicoLabel = 'Visto Americano';
        }

        // Tratamento das intenções
        if (intent === 'iniciar_processo' || intent === 'solicitar_ds160') {
            const msg = (state?.nome && state?.email) 
                ? getMensagemFormularioComEspecialista(nomeCliente)
                : getMensagemFormularioParaBot(nomeCliente);
            await sendReply(cleanPhone, msg);
            return;
        }

        if (intent === 'andamento') {
            if (!clienteDB) {
                await sendReply(cleanPhone, '❌ Ainda não encontrei seu cadastro. Digite 0 para o menu principal.');
                return;
            }
            
            const statusLabels = {
                'lead': '📋 Cadastro iniciado - aguardando formulário',
                'formulario_enviado': '📋 Formulário recebido - em análise',
                'em_analise': '🔍 Em análise pela equipe',
                'processo_aberto': '📌 Processo aberto - aguardando agendamento',
                'agendado_casv': '📅 CASV agendado',
                'agendado_entrevista': '🎤 Entrevista agendada',
                'treinamento_realizado': '✅ Treinamento concluído',
                'entrevista_realizada': '🎤 Entrevista realizada - aguardando decisão',
                'visto_aprovado': '🎉 Visto APROVADO!',
                'visto_recusado': '😔 Visto recusado - vamos analisar juntos',
                'passaporte_retornado': '📦 Passaporte disponível para retirada'
            };
            
            const statusAtual = clienteDB.etapa_atual || clienteDB.status || 'lead';
            const label = statusLabels[statusAtual] || statusAtual;
            const dataAtualizacao = clienteDB.ultima_atualizacao ? new Date(clienteDB.ultima_atualizacao).toLocaleDateString('pt-BR') : 'Não disponível';
            
            const mensagem = `📊 *Olá ${primeiroNome}!*\n\n📍 *Status:* ${label}\n📅 *Atualização:* ${dataAtualizacao}\n${clienteDB.consulado ? `🏛️ *Consulado:* ${clienteDB.consulado}\n` : ''}\n💪 *Estamos com você!*\n\n📱 [Fale com especialista](https://wa.me/5521974601812)\n\nDigite 0 para o menu principal`;
            
            await sendReply(cleanPhone, mensagem);
            return;
        }

        if (intent === 'documentos') {
            const resposta = getRespostaSubmenu(servicoCliente, 'documentos');
            await sendReply(cleanPhone, `📋 *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'prazo') {
            const resposta = getRespostaSubmenu(servicoCliente, 'prazo');
            await sendReply(cleanPhone, `⏱️ *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'pagamento') {
            const resposta = getRespostaSubmenu(servicoCliente, 'preco');
            await sendReply(cleanPhone, `💰 *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'visto_americano') {
            state.nivel = 'submenu';
            state.service = 'visto_americano';
            userState.set(cleanPhone, state);
            await sendReply(cleanPhone, getSubmenu('visto_americano'));
            return;
        }

        if (intent === 'visto_negado') {
            await sendReply(cleanPhone, `🔄 *Olá ${primeiroNome}!*\n\nTeve o visto negado? Não desanime!\n\n🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/\n\n✅ *Oferecemos:*\n• Análise do motivo da negativa\n• Correção do formulário\n• Documentação reforçada\n• Preparação para entrevista\n\n💰 Investimento: R$ 380\n\n📱 [Fale com especialista](wa.me/5521974601812)\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent && intent !== 'desconhecida' && intent !== 'andamento' && intent !== 'documentos' && intent !== 'prazo' && intent !== 'pagamento') {
            let nome = state?.nome || 'Cliente';
            try {
                const { data } = await supabase.from('clientes').select('nome').eq('telefone', cleanPhone).maybeSingle();
                if (data?.nome) nome = data.nome;
            } catch (e) {}
            let resposta = gerarRespostaBot(intent, state?.nome, state?.etapaAtual);
            resposta = resposta.replace(/Cliente/g, nome.split(' ')[0]);
            await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
            return;
        }

        // Nenhuma intenção detectada - contato direto com especialista
        console.log('⚠️ Nenhuma intenção detectada para:', messageText);
        
        let nomeFallback = state?.nome || 'Cliente';
        try {
            const { data } = await supabase
                .from('clientes')
                .select('nome')
                .eq('telefone', cleanPhone)
                .maybeSingle();
            if (data?.nome) nomeFallback = data.nome;
        } catch (e) {}
        
        const primeiroNomeFallback = nomeFallback.split(' ')[0];
        
        const fallbackMsg = `🤔 *Olá ${primeiroNomeFallback}!*

Não entendi sua pergunta. 😅

Mas não se preocupe! Nosso especialista pode ajudar com qualquer dúvida.

📱 *FALE DIRETAMENTE COM MOISÉS:*
[Clique aqui](https://wa.me/5521974601812)

📧 *Ou por e-mail:* contato@getvisa.com.br

💡 *Dica:* Para respostas rápidas, use:
• "documentos" - Lista de documentos
• "prazo" - Prazos do processo  
• "status" - Andamento do seu caso
• "valores" - Investimento

Digite 0 para o menu principal`;

        await sendReply(cleanPhone, fallbackMsg);

    } catch (error) {
        console.error('❌ ERRO NO processarOpcaoNoMenuPrincipal:', error);
        console.error('❌ Stack:', error.stack);
        await sendReply(cleanPhone, '❌ Desculpe, ocorreu um erro. Digite 0 para tentar novamente.');
    }
}

async function processarOpcaoNoSubmenu(cleanPhone, messageText, state) {
    const service = state.service;
    const nomeCliente = state.nome ? ', ' + state.nome.split(' ')[0] : '';

    console.log('=== SUBMENU ATIVO: ' + service + ' ===');
    console.log('Opção recebida: ' + messageText);

    const opcoesSubmenu = {
        '1': 'preco',
        '2': 'prazo', 
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial',
        '6': 'avaliacao',
        '7': 'especialista'
    };

    if (opcoesSubmenu[messageText]) {
        console.log('Processando opção ' + messageText + ' do submenu de ' + service);

        switch(messageText) {
            case '1':
                const respostaPreco = getRespostaSubmenu(service, 'preco');
                await sendReply(cleanPhone, respostaPreco + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;

            case '2':
                const respostaPrazo = getRespostaSubmenu(service, 'prazo');
                await sendReply(cleanPhone, respostaPrazo + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;

            case '3':
                const respostaDocs = getRespostaSubmenu(service, 'documentos');
                await sendReply(cleanPhone, respostaDocs + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;

            case '4':
                const respostaProcesso = getRespostaSubmenu(service, 'processo');
                await sendReply(cleanPhone, respostaProcesso + '\n\n' +
                    '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                    'Digite outra opção (1-7) ou 0 para menu principal');
                break;

            case '5':
                if (service === 'passaporte') {
                    const msg = '🏛️ **ONDE FAZER O PASSAPORTE**\n\n' +
                               'O passaporte é emitido pela Polícia Federal. O processo é digitalizado e exige agendamento prévio.\n\n' +
                               '🔗 **Site Oficial:** <a href="https://www.gov.br/pf/pt-br/assuntos/passaporte" target="_blank" style="text-decoration: underline;">https://www.gov.br/pf/pt-br/assuntos/passaporte</a>\n\n' +
                               '📋 **Etapas Principais:**\n' +
                               '1. **Preencher o Formulário:** Acesse o site da PF e preencha com atenção.\n' +
                               '2. **Pagar a Taxa:** Gerada automaticamente. O valor comum é de *R$ 257,25*.\n' +
                               '3. **Agendar Atendimento:** Escolha o posto da PF.\n' +
                               '4. **Comparecer à Unidade:** Leve documentos originais.\n' +
                               '5. **Consultar Andamento:** Acompanhe pelo site.\n' +
                               '6. **Receber Passaporte:** Compareça ao posto com documento de identificação.\n\n' +
                               '💡 **Dica:** Agende com antecedência! Passaportes não retirados em 90 dias são cancelados.\n\n' +
                               '📌 ' + nomeCliente + ' - Você está em: PASSAPORTE\n' +
                               'Digite outra opção (1-7) ou 0 para menu principal';
                    await sendReply(cleanPhone, msg);
                } else {
                    const msg = '🔄 VISTO NEGADO - RECUPERAÇÃO\n\n' +
                               'Teve o visto negado? Não desanime!\n\n' +
                               '🔗 Análise gratuita: <a href="https://getvisa.com.br/visto-americano-negado/" target="_blank" style="text-decoration: underline;">https://getvisa.com.br/visto-americano-negado/</a>\n\n' +
                               '✅ Oferecemos:\n' +
                               '• Análise do motivo da negativa\n' +
                               '• Correção do formulário\n' +
                               '• Documentação reforçada\n' +
                               '• Preparação para entrevista\n\n' +
                               '💰 Investimento: R$ 380\n\n' +
                               '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                               'Digite outra opção (1-7) ou 0 para menu principal';
                    await sendReply(cleanPhone, msg);
                }
                break;

            case '6':
                const links = {
                    'visto_americano': 'https://getvisa.com.br/simulador-visto-americano/',
                    'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense/',
                    'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano/',
                    'eta_uk': 'https://getvisa.com.br/simulador-eta-uk/',
                    'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense/',
                    'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
                };
                const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano/';

                const msg = '📋 AVALIAÇÃO GRATUITA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                           '🔗 Acesse: <a href="' + link + '" target="_blank" style="text-decoration: underline;">' + link + '</a>\n\n' +
                           '⏱️ Leva menos de 2 minutos!\n\n' +
                           '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                           'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msg);
                break;

            case '7':
                const msgEsp = '👨‍💼 FALAR COM ESPECIALISTA - ' + getServiceName(service).toUpperCase() + '\n\n' +
                              'Meu nome é Moisés e estou aqui para ajudar' + nomeCliente + '!\n\n' +
                              '📱 WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n' +
                              '📧 E-mail: contato@getvisa.com.br\n\n' +
                              '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                              'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msgEsp);
                break;
        }
        return;
    }

    const intencao = detectarIntencao(messageText);
    console.log('Intenção detectada no submenu:', intencao);

    if (intencao === 'solicitar_ds160' || intencao === 'iniciar_processo') {
        console.log('🚀 Cliente quer o formulário DS-160 (saindo do submenu)');
        const nomeCliente2 = state.nome || 'Cliente';
        const mensagemFormulario = getMensagemFormularioComEspecialista(nomeCliente2);
        await sendReply(cleanPhone, mensagemFormulario);
        
        try {
            await supabase
                .from('clientes')
                .update({ 
                    status: 'formulario_solicitado',
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', cleanPhone);
            console.log('📋 Status atualizado para "formulario_solicitado"');
        } catch (err) {
            console.error('Erro ao atualizar status:', err);
        }
        
        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, 
                `📋 *Cliente solicitou o formulário DS-160!*\n\n` +
                `👤 Nome: ${state.nome || 'Não informado'}\n` +
                `📱 Telefone: ${cleanPhone}\n\n` +
                `Acesse o painel para mais detalhes.`
            );
            console.log('📨 Notificação enviada para o especialista.');
        } catch (err) {
            console.error('Erro ao notificar especialista:', err);
        }
        
        state.nivel = 'principal';
        state.service = null;
        userState.set(cleanPhone, state);
        return;
    }

    if (intencao && intencao !== 'desconhecida') {
        const respostaIntencao = gerarRespostaBot(intencao, state.nome, null);
        await sendReply(cleanPhone, respostaIntencao);
        return;
    }

    const erroMsg = '❌ Opção inválida' + nomeCliente + '!\n\n' +
                   'Você está no menu: ' + getServiceName(service).toUpperCase() + '\n\n' +
                   'Opções disponíveis:\n' +
                   getSubmenu(service) + '\n\n' +
                   '💡 Para escolher outro serviço, digite 0 primeiro.';
    await sendReply(cleanPhone, erroMsg);
}

async function buscarClienteEmQualquerTabela(telefoneLimpo, tabelaInicial = 'clientes') {
    const tabelas = [tabelaInicial, 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
    for (const tabela of tabelas) {
        try {
            const { data, error } = await supabase
                .from(tabela)
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            if (!error && data) {
                return data;
            }
        } catch (e) {
            console.log(`Tabela ${tabela} não encontrada ou erro:`, e.message);
        }
    }
    return null;
}

// ============================================================
// 19. FUNÇÃO DE GERAÇÃO DE PDF (DS-160)
// ============================================================

function validateDS160(formData) {
    const errors = {};
    if (!formData['full_name'] || formData['full_name'].trim() === '') {
        errors['full_name'] = 'Nome completo é obrigatório.';
    }
    if (!formData['email'] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData['email'])) {
        errors['email'] = 'E-mail inválido.';
    }
    if (!formData['telefone'] || formData['telefone'].trim() === '') {
        errors['telefone'] = 'Telefone é obrigatório.';
    }
    return { isValid: Object.keys(errors).length === 0, errors };
}

async function gerarPDF_DS160(dados) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);

        doc.fontSize(18).fillColor('#003366').text('Formulário DS-160 - GetVisa Assessoria', { align: 'center' });
        doc.moveDown();

        // MAPEAMENTO COMPLETO DE TODOS OS CAMPOS
        const todosCampos = {
            'Consulado/Embaixada': dados.consulado || '',
            'Nome Completo': dados.full_name || dados['text-84'] || dados.nome || '',
            'Outros Sobrenomes': dados.other_surnames || '',
            'Gênero': dados['radio-genero'] === 'MALE' ? 'Masculino' : dados['radio-genero'] === 'FEMALE' ? 'Feminino' : dados['radio-genero'] || '',
            'Estado Civil': dados.marital_status === 'MARRIED' ? 'Casado(a)' : dados.marital_status === 'UNION' ? 'União Estável' : dados.marital_status === 'SINGLE' ? 'Solteiro(a)' : dados.marital_status === 'DIVORCED' ? 'Divorciado(a)' : dados.marital_status === 'WIDOWED' ? 'Viúvo(a)' : dados.marital_status === 'SEPARATED' ? 'Separado(a) Judicialmente' : dados.marital_status === 'OTHER' ? 'Outro' : dados.marital_status || '',
            'Data de Nascimento': dados.dob || dados['text-5'] || '',
            'Cidade de Nascimento': dados.birth_city || dados.cidade_nascimento || '',
            'Estado/Província de Nascimento': dados.birth_state || '',
            'País de Nascimento': dados.birth_country || dados.nacionalidade || '',
            'Outra Nacionalidade': dados.other_nat_country || 'Não informado',
            'Residente Permanente de outro país': dados['radio-resident'] === 'one' ? `Sim - ${dados.resident_country || ''}` : 'Não',
            'CPF': dados.cpf || '',
            'SSN (Seguro Social EUA)': dados.ssn || 'Não informado',
            'Tax ID (ITIN)': dados.tax_id || 'Não informado',
            'Propósito da Viagem': dados.travel_purpose === 'BUSINESS_PLEASURE' ? 'Turismo/Negócios (B1/B2)' : dados.travel_purpose === 'STUDY' ? 'Estudos' : dados.travel_purpose === 'OTHER' ? 'Outros' : dados.travel_purpose || '',
            'Data de Chegada nos EUA': dados.arrival_date || '',
            'Locais a Visitar': dados.places_to_visit || '',
            'Responsável pelo Pagamento': dados['radio-payer'] === 'SELF' ? 'Próprio Solicitante' : dados['radio-payer'] === 'OTHER' ? 'Outra pessoa/empresa/organização' : dados['radio-payer'] || '',
            'Nome do Pagador': dados.payer_name || '',
            'Endereço do Pagador': dados.payer_address || '',
            'Cidade do Pagador': dados.payer_city || '',
            'Estado do Pagador': dados.payer_state || '',
            'CEP do Pagador': dados.payer_zip || '',
            'País do Pagador': dados.payer_country || '',
            'Telefone do Pagador': dados.payer_phone || '',
            'Email do Pagador': dados.payer_email || '',
            'Acompanhantes': Array.isArray(dados['companion_name[]']) ? dados['companion_name[]'].filter(Boolean).join(', ') : dados['companion_name[]'] || '',
            'Relação dos Acompanhantes': Array.isArray(dados['companion_relationship[]']) ? dados['companion_relationship[]'].filter(Boolean).join(', ') : dados['companion_relationship[]'] || '',
            'Nome do Grupo': dados.group_name || '',
            'Já esteve nos EUA': dados['radio-us-travel'] === 'one' ? 'Sim' : 'Não',
            'Viagens Anteriores (datas)': dados['us_travel_date[]'] ? dados['us_travel_date[]'].filter(Boolean).join(', ') : '',
            'Duração das Viagens (dias)': dados['us_travel_duration[]'] ? dados['us_travel_duration[]'].filter(Boolean).join(', ') : '',
            'Possui Carteira de Habilitação dos EUA': dados['radio-us-driver'] === 'SIM' ? 'Sim' : 'Não',
            'Número da Habilitação': dados.us_driver_number || '',
            'Estado da Habilitação': dados.us_driver_state || '',
            'Já teve visto americano': dados['radio-visa-issued'] === 'one' ? 'Sim' : 'Não',
            'Data da Última Emissão do Visto': dados.visa_issued_date || '',
            'Número do Visto': dados.visa_number || '',
            'Mesmo tipo de visto': dados['radio-same-visa'] === 'YES' ? 'Sim' : 'Não',
            'Mesmo país/cidade da última aplicação': dados['radio-same-location'] === 'YES' ? 'Sim' : 'Não',
            'Impressões digitais coletadas': dados['radio-fingerprints'] === 'YES' ? 'Sim' : 'Não',
            'Visto cancelado/revogado': dados['radio-visa-cancelled'] === 'YES' ? `Sim - ${dados.visa_cancelled_expl || ''}` : 'Não',
            'Visto negado/entrada negada': dados['radio-visa-refused'] === 'one' ? `Sim - ${dados.visa_refused_explanation || ''}` : 'Não',
            'Petição de imigração': dados['radio-petition'] === 'one' ? `Sim - ${dados.petition_details || ''}` : 'Não',
            'Endereço Residencial': dados.address || dados.endereco || '',
            'Cidade': dados.city || dados.cidade || '',
            'Estado/Província': dados.state || dados.estado || '',
            'CEP': dados.zip || dados.cep || '',
            'País': dados.country || dados.pais || '',
            'Telefone Principal': dados.phone || dados.telefone || '',
            'Telefone Secundário': dados.phone_secondary || '',
            'Telefone do Trabalho': dados.phone_work || '',
            'Telefones Adicionais': dados.phone_extra || '',
            'E-mail Principal': dados.email || '',
            'E-mails Adicionais': dados['emails_extra[]'] ? dados['emails_extra[]'].filter(Boolean).join(', ') : '',
            'Redes Sociais': dados['social_plataforma[]'] && dados['social_identificador[]'] ? dados['social_plataforma[]'].map((p, i) => `${p}: ${dados['social_identificador[]'][i] || ''}`).filter(Boolean).join('; ') : '',
            'Presença Adicional em Redes Sociais': dados.social_extra || '',
            'Número do Passaporte': dados.passport_number || dados['passaporte_numero'] || '',
            'País/Autoridade Emissora': dados.passport_country || '',
            'Cidade de Emissão': dados.passport_city || '',
            'Estado de Emissão': dados.passport_state || '',
            'Data de Emissão': dados.passport_issue || dados['text-21'] || '',
            'Data de Validade': dados.passport_expiry || dados['text-35'] || '',
            'Passaporte Perdido/Roubado': dados['radio-passport-lost'] === 'SIM' ? 'Sim' : 'Não',
            'Número do BO/Observações': dados.passport_lost_obs || '',
            'Número do Passaporte Perdido': dados.passport_lost_number || '',
            'Data do Ocorrido': dados.passport_lost_date || '',
            'Local do Ocorrido': dados.passport_lost_location || '',
            'Pessoa de Contato nos EUA': dados.us_contact_name || '',
            'Organização nos EUA': dados.us_contact_org || '',
            'Relação com o Contato': dados.us_contact_relationship || '',
            'Endereço nos EUA': dados.us_contact_address || '',
            'Telefone nos EUA': dados.us_contact_phone || '',
            'Email nos EUA': dados.us_contact_email || '',
            'Nome do Pai': dados.father_name || '',
            'Data de Nascimento do Pai': dados.father_dob || '',
            'Pai nos EUA': dados.father_in_us === 'YES' ? 'Sim' : 'Não',
            'Situação do Pai nos EUA': dados.father_status || '',
            'Nome da Mãe': dados.mother_name || '',
            'Data de Nascimento da Mãe': dados.mother_dob || '',
            'Mãe nos EUA': dados.mother_in_us === 'YES' ? 'Sim' : 'Não',
            'Situação da Mãe nos EUA': dados.mother_status || '',
            'Parentes Diretos nos EUA': dados['radio-immediate-relatives'] === 'one' ? 'Sim' : 'Não',
            'Detalhes dos Parentes Diretos': dados['immediate_relative_name[]'] ? dados['immediate_relative_name[]'].map((n, i) => `${n} (${dados['immediate_relative_relationship[]']?.[i] || ''} - ${dados['immediate_relative_status[]']?.[i] || ''})`).filter(Boolean).join('; ') : '',
            'Outros Parentes nos EUA': dados['radio-other-relatives'] === 'one' ? `Sim - ${dados.other_relatives_desc || ''}` : 'Não',
            'Nome do Cônjuge/Ex-Cônjuge': dados.spouse_name || '',
            'Data de Nascimento do Cônjuge': dados.spouse_dob || '',
            'Nacionalidade do Cônjuge': dados.spouse_nationality || '',
            'Cidade de Nascimento do Cônjuge': dados.spouse_birth_city || '',
            'País de Nascimento do Cônjuge': dados.spouse_birth_country || '',
            'Endereço do Cônjuge': dados['radio-spouse-address'] === 'SAME' ? 'Mesmo endereço' : dados.spouse_address || '',
            'Cidade do Cônjuge': dados.spouse_address_city || '',
            'Estado do Cônjuge': dados.spouse_address_state || '',
            'CEP do Cônjuge': dados.spouse_address_zip || '',
            'País do Cônjuge': dados.spouse_address_country || '',
            'Ocupação Principal': dados['radio-occupation'] === 'Aposentado' ? 'Aposentado(a)' : dados['radio-occupation'] === 'Dona de Casa' ? 'Dona de Casa' : dados['radio-occupation'] === 'Profissional' ? 'Profissional' : dados['radio-occupation'] === 'Estudante' ? 'Estudante' : dados['radio-occupation'] || '',
            'Empregador/Instituição': dados.employer_name || '',
            'Endereço do Empregador': dados.employer_address || '',
            'Cidade do Empregador': dados.employer_city || '',
            'Estado do Empregador': dados.employer_state || '',
            'CEP do Empregador': dados.employer_zip || '',
            'Telefone do Empregador': dados.employer_phone || '',
            'Data de Início no Emprego': dados.employer_start || '',
            'Renda Mensal': dados.employer_income || '',
            'Descrição das Funções': dados.employer_duties || '',
            'Outras Ocupações': dados['other_employer_name[]'] ? dados['other_employer_name[]'].filter(Boolean).join('; ') : '',
            'Empregos Anteriores': dados['prev_employer_name[]'] ? dados['prev_employer_name[]'].filter(Boolean).join('; ') : '',
            'Cursos/Educação': dados['edu_institution[]'] ? dados['edu_institution[]'].filter(Boolean).join('; ') : '',
            'Idiomas (além do Português)': dados['languages[]'] ? dados['languages[]'].filter(Boolean).join(', ') : '',
            'Países Visitados (últimos 5 anos)': dados['traveled_countries[]'] ? dados['traveled_countries[]'].filter(Boolean).join(', ') : '',
            'Treinamento Especializado': dados['radio-specialized'] === 'YES' ? `Sim - ${dados.specialized_description || ''}` : 'Não',
            'Serviço Militar': dados['radio-military'] === 'YES' ? 'Sim' : 'Não',
            'Ramo Militar': dados.military_branch || '',
            'Patente Militar': dados.military_rank || '',
            'Especialidade Militar': dados.military_specialty || '',
            'Data de Início no Serviço Militar': dados.military_start || '',
            'Data de Saída do Serviço Militar': dados.military_end || '',
            'Preso ou Condenado': dados['radio-arrested'] === 'YES' ? `Sim - ${dados.arrested_explanation || ''}` : 'Não',
            'Deportado': dados['radio-deported'] === 'YES' ? `Sim - ${dados.deported_explanation || ''}` : 'Não'
        };

        function writeSection(title, campos, doc) {
            doc.moveDown(1);
            doc.fontSize(14).fillColor('#003366').text(title, { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#000000');
            
            let temCampos = false;
            for (const [label, value] of Object.entries(campos)) {
                if (value && value !== '' && value !== 'Não informado') {
                    temCampos = true;
                    doc.text(`• ${label}: ${value}`);
                }
            }
            if (!temCampos) {
                doc.text('(Nenhuma informação preenchida)');
            }
        }

        const secoes = {
            'Dados Pessoais': ['Consulado/Embaixada', 'Nome Completo', 'Outros Sobrenomes', 'Gênero', 'Estado Civil', 'Data de Nascimento', 'Cidade de Nascimento', 'Estado/Província de Nascimento', 'País de Nascimento', 'Outra Nacionalidade', 'Residente Permanente de outro país', 'CPF', 'SSN (Seguro Social EUA)', 'Tax ID (ITIN)'],
            'Informacoes da Viagem': ['Propósito da Viagem', 'Data de Chegada nos EUA', 'Locais a Visitar', 'Responsável pelo Pagamento', 'Nome do Pagador', 'Endereço do Pagador', 'Cidade do Pagador', 'Estado do Pagador', 'CEP do Pagador', 'País do Pagador', 'Telefone do Pagador', 'Email do Pagador'],
            'Acompanhantes': ['Acompanhantes', 'Relação dos Acompanhantes', 'Nome do Grupo'],
            'Viagens Anteriores e Vistos': ['Já esteve nos EUA', 'Viagens Anteriores (datas)', 'Duração das Viagens (dias)', 'Possui Carteira de Habilitação dos EUA', 'Número da Habilitação', 'Estado da Habilitação', 'Já teve visto americano', 'Data da Última Emissão do Visto', 'Número do Visto', 'Mesmo tipo de visto', 'Mesmo país/cidade da última aplicação', 'Impressões digitais coletadas', 'Visto cancelado/revogado', 'Visto negado/entrada negada', 'Petição de imigração'],
            'Endereco e Contato': ['Endereço Residencial', 'Cidade', 'Estado/Província', 'CEP', 'País', 'Telefone Principal', 'Telefone Secundário', 'Telefone do Trabalho', 'Telefones Adicionais', 'E-mail Principal', 'E-mails Adicionais', 'Redes Sociais', 'Presença Adicional em Redes Sociais'],
            'Passaporte': ['Número do Passaporte', 'País/Autoridade Emissora', 'Cidade de Emissão', 'Estado de Emissão', 'Data de Emissão', 'Data de Validade', 'Passaporte Perdido/Roubado', 'Número do BO/Observações', 'Número do Passaporte Perdido', 'Data do Ocorrido', 'Local do Ocorrido'],
            'Contato nos EUA': ['Pessoa de Contato nos EUA', 'Organização nos EUA', 'Relação com o Contato', 'Endereço nos EUA', 'Telefone nos EUA', 'Email nos EUA'],
            'Informacoes Familiares': ['Nome do Pai', 'Data de Nascimento do Pai', 'Pai nos EUA', 'Situação do Pai nos EUA', 'Nome da Mãe', 'Data de Nascimento da Mãe', 'Mãe nos EUA', 'Situação da Mãe nos EUA', 'Parentes Diretos nos EUA', 'Detalhes dos Parentes Diretos', 'Outros Parentes nos EUA', 'Nome do Cônjuge/Ex-Cônjuge', 'Data de Nascimento do Cônjuge', 'Nacionalidade do Cônjuge', 'Cidade de Nascimento do Cônjuge', 'País de Nascimento do Cônjuge', 'Endereço do Cônjuge', 'Cidade do Cônjuge', 'Estado do Cônjuge', 'CEP do Cônjuge', 'País do Cônjuge'],
            'Trabalho e Educacao': ['Ocupação Principal', 'Empregador/Instituição', 'Endereço do Empregador', 'Cidade do Empregador', 'Estado do Empregador', 'CEP do Empregador', 'Telefone do Empregador', 'Data de Início no Emprego', 'Renda Mensal', 'Descrição das Funções', 'Outras Ocupações', 'Empregos Anteriores', 'Cursos/Educação', 'Idiomas (além do Português)', 'Países Visitados (últimos 5 anos)', 'Treinamento Especializado', 'Serviço Militar', 'Ramo Militar', 'Patente Militar', 'Especialidade Militar', 'Data de Início no Serviço Militar', 'Data de Saída do Serviço Militar'],
            'Seguranca': ['Preso ou Condenado', 'Deportado']
        };

        for (const [titulo, campos] of Object.entries(secoes)) {
            const filteredCampos = {};
            for (const campo of campos) {
                if (todosCampos[campo]) {
                    filteredCampos[campo] = todosCampos[campo];
                }
            }
            writeSection(titulo, filteredCampos, doc);
            doc.moveDown(0.5);
        }

        doc.end();
    });
}

// ============================================================
// 20. ROTAS DE DEPURAÇÃO (DEBUG)
// ============================================================

app.post('/api/test-receive', function(req, res) {
    console.log('📨 ===== TESTE DE RECEBIMENTO =====');
    console.log('📨 Headers:', req.headers);
    console.log('📨 Body recebido:', JSON.stringify(req.body, null, 2));

    res.json({
        success: true,
        received: true,
        keys: Object.keys(req.body),
        count: Object.keys(req.body).length,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/debug/criar-cliente', async (req, res) => {
    console.log('🔍 ===== DEBUG: CRIAR CLIENTE =====');

    try {
        const { telefone, nome } = req.body;

        if (!telefone) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Telefone é obrigatório'
            });
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log('📱 Telefone:', telefoneLimpo);
        console.log('👤 Nome:', nome || '(vazio)');

        const dados = {
            telefone: telefoneLimpo,
            data_contato: new Date().toISOString(),
            status: 'novo',
            onboarding_completo: false,
            updated_at: new Date().toISOString()
        };

        if (nome && nome !== 'Cliente' && !nome.startsWith('Cliente_')) {
            dados.nome = nome;
        }

        const { data, error } = await supabase
            .from('clientes')
            .upsert(dados, { onConflict: 'telefone' })
            .select()
            .single();

        if (error) {
            console.error('❌ UPSERT falhou:', error);
            return res.json({
                sucesso: false,
                erro: error,
                mensagem: 'Não foi possível criar o cliente'
            });
        }

        return res.json({
            sucesso: true,
            dados: data,
            mensagem: 'Cliente criado com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro crítico:', error);
        return res.status(500).json({
            sucesso: false,
            erro: error.message,
            stack: error.stack
        });
    }
});

app.get('/api/debug/verificar-tabela', async (req, res) => {
    console.log('🔍 ===== VERIFICANDO TABELA clientes =====');

    try {
        const { error: tableError } = await supabase
            .from('clientes')
            .select('id')
            .limit(1);

        if (tableError) {
            return res.json({
                existe: false,
                erro: tableError,
                mensagem: 'Tabela clientes não existe'
            });
        }

        const { data: sample, error: sampleError } = await supabase
            .from('clientes')
            .select('*')
            .limit(1);

        if (sampleError) {
            return res.json({
                existe: true,
                erro: sampleError,
                mensagem: 'Erro ao ler estrutura'
            });
        }

        const colunas = sample && sample.length > 0 ? Object.keys(sample[0]) : [];

        return res.json({
            existe: true,
            colunas: colunas,
            tem_dados: sample && sample.length > 0,
            amostra: sample && sample.length > 0 ? sample[0] : null,
            mensagem: 'Tabela clientes existe e está acessível'
        });

    } catch (error) {
        return res.status(500).json({
            erro: error.message,
            stack: error.stack
        });
    }
});

app.post('/api/test/webhook-manual', async function(req, res) {
    console.log('TESTE MANUAL');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    var phone = req.body.phone;
    var message = req.body.message || 'Teste';

    if (!phone) {
        return res.status(400).json({ error: 'Phone e obrigatorio' });
    }

    try {
        var cleanPhone = phone.toString().replace(/\D/g, '');
        console.log('Telefone limpo: ' + cleanPhone);
        console.log('Mensagem: "' + message + '"');

        var resultado = await sendReply(cleanPhone, 'TESTE MANUAL\n\nSe voce esta vendo esta mensagem, o sistema esta funcionando!\n\nDigite 0 para o menu principal');

        res.json({
            success: resultado,
            phone: cleanPhone,
            message_sent: resultado,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Erro no teste manual:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/debug/testar-webhook', async (req, res) => {
    console.log('🔍 ===== TESTE MANUAL DO WEBHOOK =====');

    try {
        const { telefone, mensagem } = req.body;

        if (!telefone) {
            return res.status(400).json({ erro: 'Telefone é obrigatório' });
        }

        const cleanPhone = telefone.toString().replace(/\D/g, '').replace(/^55/, '');
        const msg = mensagem || 'oi, quero meu visto';

        console.log('📱 Telefone:', cleanPhone);
        console.log('💬 Mensagem:', msg);

        const telefoneLimpo = cleanPhone;

        const { data: cliente, error } = await supabase
            .from('clientes')
            .upsert({
                telefone: telefoneLimpo,
                data_contato: new Date().toISOString(),
                status: 'novo',
                onboarding_completo: false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'telefone' })
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar:', error);
            return res.json({
                sucesso: false,
                etapa: 'criar_cliente',
                erro: error,
                mensagem: 'Falha ao criar cliente'
            });
        }

        console.log('✅ Cliente criado:', cliente);

        const saudacao = '👋 Olá! Seja muito bem-vindo(a) à **GetVisa Assessoria**! 🇺🇸\n\nSomos especialistas em vistos americanos e estamos aqui para realizar seu sonho de viajar para os EUA! ✈️\n\nPara começarmos seu atendimento de forma personalizada, preciso saber:\n\n📝 **Qual é o seu nome completo?**\n\nEx: Maria Silva';

        console.log('📨 Enviando WhatsApp de teste...');
        const enviado = await enviarWhatsApp(cleanPhone, saudacao);

        return res.json({
            sucesso: true,
            cliente_criado: cliente,
            mensagem_enviada: enviado,
            mensagem: saudacao,
            observacao: 'Verifique se recebeu a mensagem no WhatsApp'
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        return res.status(500).json({
            sucesso: false,
            erro: error.message,
            stack: error.stack
        });
    }
});

// ============================================================
// 21. ROTAS DE ADMIN (BANCO DE DADOS)
// ============================================================

app.get('/api/test/banco', async function(req, res) {
    try {
        console.log('🔍 TESTANDO CONEXÃO COM O BANCO...');

        const { count, error } = await supabase
            .from('clientes_finalizados')
            .select('*', { count: 'exact', head: true });

        console.log('📊 Total de registros em clientes_finalizados:', count);
        console.log('📊 Erro:', error);

        const { data, error: error2 } = await supabase
            .from('clientes_finalizados')
            .select('*');

        console.log('📊 Dados:', data);
        console.log('📊 Erro2:', error2);

        console.log('📊 SUPABASE_URL:', process.env.SUPABASE_URL);

        res.json({
            success: true,
            total_registros: count,
            dados: data,
            erro: error,
            supabase_url: process.env.SUPABASE_URL,
            supabase_key: process.env.SUPABASE_ANON_KEY ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA'
        });

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/etapas/finalizar', async function(req, res) {
    console.log('📌 ===== ROTA /api/etapas/finalizar CHAMADA =====');
    console.log('📌 Body recebido:', JSON.stringify(req.body, null, 2));

    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        var telefone = req.body.telefone;
        var etapaFinal = req.body.etapa_final || 'passaporte_retornado';
        var nota = req.body.nota || '';

        console.log('📌 Telefone:', telefone);
        console.log('📌 Etapa Final:', etapaFinal);
        console.log('📌 Nota:', nota);

        if (!telefone) {
            console.log('❌ Telefone não fornecido');
            return res.status(400).json({
                sucesso: false,
                erro: 'Telefone é obrigatório',
                body_recebido: req.body
            });
        }

        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (telefoneLimpo.startsWith('55')) telefoneLimpo = telefoneLimpo.substring(2);
        console.log('📌 Telefone limpo:', telefoneLimpo);

        console.log('🔍 Buscando cliente em clientes_ativos...');
        let { data: cliente, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (error) {
            console.error('❌ Erro ao buscar cliente:', error);
            return res.status(500).json({ sucesso: false, erro: error.message });
        }

        if (!cliente) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log('🔍 Tentando com telefone formatado:', telefoneFormatado);
            const { data: clienteFormatado } = await supabase
                .from('clientes_ativos')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();

            if (clienteFormatado) {
                cliente = clienteFormatado;
            }
        }

        if (!cliente) {
            console.log('❌ Cliente não encontrado em clientes_ativos');
            return res.status(404).json({
                sucesso: false,
                erro: 'Cliente não encontrado em clientes_ativos',
                telefone_buscado: telefoneLimpo
            });
        }

        console.log('✅ Cliente encontrado:', cliente.nome);

        const isAprovado = etapaFinal === 'passaporte_retornado';
        const resultado = isAprovado ? 'aprovado' : 'recusado';
        const servico = 'Visto Americano';

        const dadosFinalizacao = {
            telefone: cliente.telefone,
            nome: cliente.nome,
            email: cliente.email || null,
            servico: servico,
            data_inicio: cliente.criado_em || new Date().toISOString(),
            data_finalizacao: new Date().toISOString(),
            observacoes: nota || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('📌 Dados para finalizar:', JSON.stringify(dadosFinalizacao, null, 2));

        let finalizado;
        const { data: insertData, error: insertError } = await supabase
            .from('clientes_finalizados')
            .insert(dadosFinalizacao)
            .select()
            .single();

        if (insertError) {
            console.error('❌ Erro ao inserir em clientes_finalizados:', insertError);

            const { data: updateData, error: updateError } = await supabase
                .from('clientes_finalizados')
                .update({
                    servico: servico,
                    data_finalizacao: new Date().toISOString(),
                    observacoes: nota || `Processo finalizado com ${resultado}`,
                    updated_at: new Date().toISOString()
                })
                .eq('telefone', cliente.telefone)
                .select()
                .single();

            if (updateError) {
                console.error('❌ Erro ao atualizar clientes_finalizados:', updateError);
                return res.status(500).json({
                    sucesso: false,
                    erro: 'Erro ao salvar em clientes_finalizados',
                    detalhe: insertError.message
                });
            }
            finalizado = updateData;
            console.log('✅ Cliente atualizado em clientes_finalizados');
        } else {
            finalizado = insertData;
            console.log('✅ Cliente inserido em clientes_finalizados');
        }

        console.log('🗑️ Removendo de outras tabelas...');

        await supabase
            .from('clientes_ativos')
            .delete()
            .eq('telefone', cliente.telefone);

        await supabase
            .from('clientes')
            .delete()
            .eq('telefone', cliente.telefone);

        await supabase
            .from('contatos_amigos')
            .delete()
            .eq('telefone', cliente.telefone);

        console.log('✅ Cliente removido das outras tabelas');

        try {
            const { data: etapaData } = await supabase
                .from('etapas_processo')
                .select('*')
                .eq('cliente_telefone', cliente.telefone)
                .maybeSingle();

            if (etapaData) {
                const historicoAtualizado = (etapaData.historico || []).concat([{
                    etapa: etapaFinal,
                    data: new Date().toISOString(),
                    nota: nota || 'Processo finalizado',
                    observacoes_finalizacao: `Cliente finalizado com ${resultado}`
                }]);

                await supabase
                    .from('etapas_processo')
                    .update({
                        etapa_atual: etapaFinal,
                        data_atualizacao: new Date().toISOString(),
                        historico: historicoAtualizado,
                        [`data_${etapaFinal}`]: new Date().toISOString()
                    })
                    .eq('cliente_telefone', cliente.telefone);

                console.log('✅ Etapa atualizada no processo');
            }
        } catch (err) {
            console.error('❌ Erro ao atualizar etapa:', err);
        }

        try {
            const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_')
                ? cliente.nome.split(' ')[0]
                : 'Cliente';

            let mensagem = '';
            if (!isAprovado) {
                mensagem = `😔 Olá ${nomeCliente}!\n\n` +
                          `Sabemos que essa notícia dói, ainda mais depois de tanta dedicação na preparação.\n\n` +
                          `É importante entender: a decisão final do visto acontece no momento da entrevista, e depende muito da avaliação pessoal do oficial consular naquele instante — algo que vai além da documentação e da preparação, por mais completa que tenha sido.\n\n` +
                          `🔍 Vamos analisar com você os detalhes da entrevista para entender o que pesou na decisão e ajustar a estratégia para a próxima tentativa.\n\n` +
                          `📱 Fale com a gente agora para uma análise gratuita:\n` +
                          `[Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                          `💪 Isso não muda o seu objetivo. Vamos trabalhar juntos para reverter esse cenário!`;
            } else {
                mensagem = `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\n` +
                          `Seu passaporte com o visto foi retornado!\n\n` +
                          `✅ Seu processo foi concluído com sucesso!\n\n` +
                          `🌟 Agradecemos por confiar na GetVisa Assessoria!\n\n` +
                          `✈️ Boa viagem! Vá realizar seus sonhos!`;
            }

            const enviado = await enviarWhatsApp(cliente.telefone, mensagem);
            console.log(`✅ Mensagem de finalização enviada: ${enviado}`);
        } catch (err) {
            console.error('❌ Erro ao enviar mensagem de finalização:', err);
        }

        console.log('✅ ===== PROCESSO FINALIZADO COM SUCESSO =====');

        res.json({
            sucesso: true,
            message: `Cliente finalizado com ${resultado}`,
            etapa: etapaFinal,
            cliente: finalizado
        });

    } catch (error) {
        console.error('❌ ERRO AO FINALIZAR CLIENTE:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao finalizar cliente',
            detalhe: error.message
        });
    }
});

app.get('/api/clientes/finalizados/:telefone', auth.verificarApiKey, async function(req, res) {
    try {
        const telefone = req.params.telefone;
        console.log(`📌 [GET] /api/clientes/finalizados/${telefone}`);

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        console.log(`🔍 Buscando: ${telefoneLimpo}`);

        let { data, error } = await supabase
            .from('clientes_finalizados')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (!data) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            console.log(`🔍 Tentando formato: ${telefoneFormatado}`);

            const { data: dataFormatado } = await supabase
                .from('clientes_finalizados')
                .select('*')
                .eq('telefone', telefoneFormatado)
                .maybeSingle();
            data = dataFormatado;
        }

        if (error) {
            console.error('❌ Erro:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        if (!data) {
            console.log(`❌ Cliente não encontrado`);
            return res.status(404).json({
                success: false,
                error: 'Cliente não encontrado em finalizados'
            });
        }

        console.log(`✅ Cliente encontrado: ${data.nome}`);

        res.json({
            success: true,
            cliente: data
        });

    } catch (error) {
        console.error('❌ Erro ao buscar cliente finalizado:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/painel/mover-com-notificacao', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, destino, enviar_notificacao } = req.body;

        if (!telefone || !destino) {
            return res.status(400).json({ error: 'Telefone e destino são obrigatórios' });
        }

        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado em clientes' });
        }

        let resultado = {};

        if (destino === 'ativo') {
            const { data: insertData, error: insertError } = await supabase
                .from('clientes_ativos')
                .insert({
                    telefone: cliente.telefone,
                    nome: cliente.nome,
                    criado_em: cliente.data_contato,
                    atualizado_em: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                return res.status(500).json({ error: insertError.message });
            }

            resultado = insertData;

            try {
                await criarEtapaInicial(cliente.telefone);
            } catch (err) {
                console.error('Erro ao criar etapa:', err);
            }

            if (enviar_notificacao !== false) {
                try {
                    const nomeCliente = cliente.nome && !cliente.nome.startsWith('Cliente_')
                        ? cliente.nome.split(' ')[0]
                        : 'Cliente';

                    const mensagem = `🎉 Olá ${nomeCliente}!\n\n` +
                                   `Seu processo foi iniciado com sucesso na GetVisa Assessoria!\n\n` +
                                   `📋 Status: Em andamento\n` +
                                   `📍 Etapa atual: Formulário recebido\n\n` +
                                   `Em breve nossa equipe entrará em contato com os próximos passos.\n\n` +
                                   `📱 Dúvidas? Fale conosco pelo WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                                   `🌟 Estamos aqui para ajudar você a realizar seu sonho de viajar!`;

                    await enviarWhatsApp(cliente.telefone, mensagem);
                    resultado.notificacao_enviada = true;
                } catch (err) {
                    console.error('Erro ao enviar notificação:', err);
                    resultado.notificacao_enviada = false;
                }
            }

            await supabase.from('clientes').delete().eq('telefone', telefone);

            res.json({
                success: true,
                message: 'Cliente movido para ATIVO com sucesso',
                cliente: resultado,
                notificacao: resultado.notificacao_enviada ? 'Enviada' : 'Não enviada'
            });

        } else {
            res.status(400).json({ error: 'Destino inválido. Use "ativo"' });
        }

    } catch (error) {
        console.error('❌ Erro ao mover cliente:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/etapas/notificar-por-tipo', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const { telefone, tipo, mensagem } = req.body;

        if (!telefone || !tipo) {
            return res.status(400).json({ error: 'Telefone e tipo são obrigatórios' });
        }

        const telefoneLimpo = limparTelefone(telefone);

        const mensagensPadrao = {
            'mover_ativo': '🎉 Seu processo foi iniciado na GetVisa! Acompanhe as atualizações.',
            'mover_amigo': '🤝 Você foi adicionado como amigo. Continue acompanhando!',
            'reabrir': '🔄 Seu processo foi reaberto! Acompanhe as atualizações.',
            'atualizacao': '📋 Seu processo foi atualizado. Acesse o painel para mais informações.'
        };

        const mensagemFinal = mensagem || mensagensPadrao[tipo] || mensagensPadrao.atualizacao;

        let nomeCliente = 'Cliente';
        try {
            const { data } = await supabase
                .from('clientes_ativos')
                .select('nome')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();

            if (data && data.nome && !data.nome.startsWith('Cliente_')) {
                nomeCliente = data.nome.split(' ')[0];
            }
        } catch (err) {
            console.log('Erro ao buscar nome:', err);
        }

        const mensagemPersonalizada = mensagemFinal.replace(/Cliente/g, nomeCliente);

        console.log('📨 Enviando mensagem personalizada:', mensagemPersonalizada);

        const enviado = await enviarWhatsApp(telefoneLimpo, mensagemPersonalizada);

        if (enviado) {
            console.log('✅ Notificação enviada com sucesso');
            res.json({
                success: true,
                message: 'Notificação enviada com sucesso',
                telefone: telefoneLimpo,
                tipo: tipo
            });
        } else {
            console.error('❌ Falha ao enviar notificação');
            res.status(500).json({
                success: false,
                error: 'Falha ao enviar mensagem WhatsApp'
            });
        }

    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/clientes/listar', auth.verificarApiKey, async function(req, res) {
    try {
        var result = await supabase
            .from('clientes')
            .select('*')
            .order('nome', { ascending: true });

        if (result.error) throw result.error;

        res.json({
            success: true,
            clientes: result.data || []
        });

    } catch (error) {
        console.error('Erro ao listar clientes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/debug/criar-tabela', async (req, res) => {
    console.log('🔍 ===== CRIANDO TABELAS =====');

    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                nome VARCHAR(100),
                email VARCHAR(100),
                data_contato TIMESTAMP DEFAULT NOW(),
                status VARCHAR(20) DEFAULT 'novo',
                onboarding_completo BOOLEAN DEFAULT FALSE,
                data_onboarding TIMESTAMP,
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone);
            CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes(status);

            CREATE TABLE IF NOT EXISTS clientes_ativos (
                id SERIAL PRIMARY KEY,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                nome VARCHAR(100),
                email VARCHAR(100),
                criado_em TIMESTAMP DEFAULT NOW(),
                atualizado_em TIMESTAMP DEFAULT NOW(),
                status VARCHAR(50) DEFAULT 'em_processo'
            );

            CREATE TABLE IF NOT EXISTS clientes_finalizados (
                id SERIAL PRIMARY KEY,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                nome VARCHAR(100),
                email VARCHAR(100),
                servico VARCHAR(100),
                data_inicio TIMESTAMP,
                data_finalizacao TIMESTAMP DEFAULT NOW(),
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS contatos_amigos (
                id SERIAL PRIMARY KEY,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                nome VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS etapas_processo (
                id SERIAL PRIMARY KEY,
                cliente_telefone VARCHAR(20) UNIQUE NOT NULL,
                etapa_atual VARCHAR(50) NOT NULL,
                data_atualizacao TIMESTAMP DEFAULT NOW(),
                historico JSONB DEFAULT '[]',
                data_formulario_enviado TIMESTAMP,
                data_analise_correcoes TIMESTAMP,
                data_abertura_processo TIMESTAMP,
                data_boleto_emitido TIMESTAMP,
                data_boleto_pago TIMESTAMP,
                data_agendamento_realizado TIMESTAMP,
                data_treinamento_realizado TIMESTAMP,
                data_entrevista_realizada TIMESTAMP,
                data_visto_aprovado TIMESTAMP,
                data_passaporte_retornado TIMESTAMP,
                data_visto_recusado TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS formularios_ds160 (
                id SERIAL PRIMARY KEY,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                full_name TEXT,
                email TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                data JSONB
            );
        `;

        return res.json({
            sucesso: true,
            mensagem: 'Tabelas criadas/verificadas com sucesso (ou SQL fornecido para criação manual).',
            sql_para_executar_manualmente: sql,
            observacao: 'Por segurança, o Supabase geralmente não permite DDL via API. Execute o SQL acima no editor SQL do Supabase se as tabelas não existirem.'
        });

    } catch (error) {
        return res.status(500).json({
            sucesso: false,
            erro: error.message
        });
    }
});

// ============================================================
// 22. CRON JOB
// ============================================================

cron.cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Executando cron job: processPendingReminders');
    try {
        const lembretesService = require('./services/lembretes.service');
        await lembretesService.processPendingReminders();
        console.log('✅ Cron job de lembretes concluído com sucesso.');
    } catch (err) {
        console.error('❌ Erro no cron job de lembretes:', err);
    }
});

// ============================================================
// 23. INICIALIZAÇÃO DO SERVIDOR
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
    console.log('='.repeat(50));
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🔗 Formulário: http://localhost:${PORT}/`);
    console.log(`🔗 Submit: http://localhost:${PORT}/api/submit-ds160`);
    console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
    console.log(`🔗 Agendamentos: http://localhost:${PORT}/api/agendamentos`);
    console.log(`🔗 Upload PDF: http://localhost:${PORT}/api/agendamentos/upload-pdf`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log('='.repeat(50));
    console.log(`📱 Z-API: ${process.env.ZAPI_TOKEN ? '✅' : '❌'}`);
    console.log(`🗄️ Supabase: ${supabase ? '✅' : '❌'}`);
    console.log(`📧 Resend: ${process.env.RESEND_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 ADMIN_API_KEY: ${process.env.ADMIN_API_KEY ? '✅' : '❌'}`);
    console.log('='.repeat(50) + '\n');
});

// ============================================================
// FIM DO ARQUIVO - NÃO ADICIONAR MAIS NADA ABAIXO
// ============================================================