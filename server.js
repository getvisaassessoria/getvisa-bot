// server.js - VERSÃO DEFINITIVA E SEGURA (COM ROTAS DUPLICADAS REMOVIDAS)
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
console.log('✅ URL do Supabase:', supabaseUrl || 'NÃO CONFIGURADO');
console.log('✅ Cliente Supabase:', supabase ? 'INICIALIZADO' : 'NÃO DISPONÍVEL');

// ============================================================
// 3. MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(auth.logAcesso);

app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// ============================================================
// 3.5 ROTA DE LOGIN ADMIN (PÚBLICA)
// ============================================================
app.post('/api/admin/login', (req, res) => {
    const { apiKey } = req.body;
    const validKey = process.env.ADMIN_API_KEY;

    console.log(`🔑 Tentativa de login admin - IP: ${req.ip}`);

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

// ============================================================
// 4. ROTAS PROTEGIDAS (DEVEM VIR ANTES DO STATIC)
// ============================================================

// 4.1 Admin protegido
app.get('/admin.html', auth.verificarAdmin, (req, res) => {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.send('<h1>🔐 Admin Panel</h1><p>Arquivo admin.html não encontrado.</p>');
    }
});

// 4.2 Painel protegido
app.get('/painel.html', auth.verificarAdmin, (req, res) => {
    const painelPath = path.join(__dirname, 'public', 'painel.html');
    if (fs.existsSync(painelPath)) {
        res.sendFile(painelPath);
    } else {
        res.send('<h1>📊 Painel</h1><p>Arquivo painel.html não encontrado.</p>');
    }
});

// 4.3 Página de login (pública)
app.get('/admin-login.html', (req, res) => {
    const loginPath = path.join(__dirname, 'public', 'admin-login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        res.send(`
            <h1>🔐 Admin Login</h1>
            <p>Arquivo admin-login.html não encontrado.</p>
            <p>Use a chave: <strong>admin123</strong></p>
        `);
    }
});

// ============================================================
// 5. SERVIR ARQUIVOS ESTÁTICOS (DEPOIS DAS ROTAS PROTEGIDAS)
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
// 6. FUNÇÃO PARA IMPORTAR MÓDULOS COM SEGURANÇA
// ============================================================
function safeRequire(modulePath, fallback) {
    try {
        const fullPath = path.join(__dirname, modulePath);
        if (fs.existsSync(fullPath)) {
            const module = require(fullPath);
            if (module && typeof module === 'function') {
                return module;
            }
            if (module && typeof module === 'object' && module.router) {
                return module.router;
            }
            return module;
        }
        console.warn(`⚠️ Módulo não encontrado: ${modulePath}`);
        return fallback || null;
    } catch (error) {
        console.error(`❌ Erro ao importar ${modulePath}:`, error.message);
        return fallback || null;
    }
}

// ============================================================
// 15. FUNÇÃO PRINCIPAL DE PROCESSAMENTO DE MENSAGENS (BOT)
// ============================================================

async function processarMensagem(cleanPhone, incomingMessageContent) {
    console.log('🔍 processarMensagem INICIADA para', cleanPhone);
    console.log('🔍 incomingMessageContent (raw):', incomingMessageContent);

    let messageText = String(incomingMessageContent || '').trim();
    console.log('🔍 messageText (após String):', messageText);

    try {
        let state = userState.get(cleanPhone);

        if (!state) {
            console.log('🔄 Criando novo estado para:', cleanPhone);
            state = {
                nivel: 'onboarding',
                onboardingStep: ONBOARDING_STEPS.SAUDACAO,
                onboardingCompleto: false,
                nome: null,
                email: null,
                service: null,
                lastActivity: Date.now()
            };
            userState.set(cleanPhone, state);
        } else {
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
        }

        console.log('🔍 state atual:', state);
        console.log('🔍 onboardingCompleto:', state.onboardingCompleto);

        if (state.onboardingCompleto === false) {
            console.log('🔄 INICIANDO ONBOARDING');
            await processarOnboarding(cleanPhone, messageText, state);
            return;
        }

        if (messageText.toLowerCase() === '0' || messageText.toLowerCase() === 'menu') {
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            const menu = await getMenuPrincipal();
            await sendReply(cleanPhone, menu);
            return;
        }

        try {
            if (state.nivel === 'submenu' && state.service) {
                await processarOpcaoNoSubmenu(cleanPhone, messageText, state);
            } else {
                await processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state);
            }
        } catch (err) {
            console.error('❌ Erro ao processar opção:', err);
            try {
                const menu = await getMenuPrincipal();
                await sendReply(cleanPhone, menu);
            } catch (e) {
                console.error('❌ Erro no fallback do menu:', e);
                await sendReply(cleanPhone, 'Digite 0 para o menu principal.');
            }
        }

    } catch (error) {
        console.error('❌ ERRO NO processarMensagem (catch principal):', error);
        console.error('❌ Stack:', error.stack);

        try {
            await sendReply(cleanPhone, '❌ Desculpe, ocorreu um erro. Digite 0 para tentar novamente.');
        } catch (e) {
            console.error('❌ Erro ao enviar mensagem de erro (fallback):', e);
        }
    }
}

// 🔥 EXPORTAR A FUNÇÃO PARA OUTROS ARQUIVOS
module.exports = { processarMensagem };

// ============================================================
// 7. ROTAS DA API
// ============================================================

// 7.1 ROTA DS-160 (PÚBLICA)
console.log('🔧 Carregando rotas DS-160...');
try {
    const ds160Routes = require('./routes/ds160Routes');
    app.use('/api', ds160Routes);
    console.log('✅ Rotas DS-160 montadas em /api');
} catch (error) {
    console.log('⚠️ Erro ao carregar ds160Routes:', error.message);
    app.post('/api/submit-ds160', (req, res) => {
        console.log('📥 Fallback: Formulário DS-160 recebido');
        res.json({ success: true, message: 'Formulário recebido (fallback)' });
    });
}

// 7.2 ROTA DE AGENDAMENTOS (PROTEGIDA)
console.log('🔧 Carregando rotas de Agendamentos...');

// Proteger rotas de agendamento
app.use('/api/agendamentos', auth.verificarApiKey);
app.use('/api/admin/agendamentos', auth.verificarApiKey);

try {
    const agendamentoRoutes = require('./routes/agendamentoRoutes');
    app.use('/api/agendamentos', agendamentoRoutes);
    app.use('/api/admin/agendamentos', agendamentoRoutes);
    console.log('✅ Rotas /api/agendamentos montadas (PROTEGIDAS).');
} catch (error) {
    console.log('⚠️ Erro ao carregar agendamentoRoutes:', error.message);
    app.get('/api/agendamentos', auth.verificarApiKey, (req, res) => {
        res.json({ success: true, message: 'Agendamentos API (fallback)' });
    });
}

// 7.3 ROTA WEBHOOK (PÚBLICA)
console.log('🔧 Carregando rotas Webhook...');
try {
    const webhookRoutes = require('./routes/webhookRoutesNew');
    app.use('/api/webhook', webhookRoutes);
    console.log('✅ webhookRoutesNew importado com sucesso.');
    app.use('/api/webhook', webhookRoutesNew);
    console.log('✅ Rota /api/webhook montada.');
} catch (error) {
    console.log('⚠️ Erro ao carregar webhookRoutesNew:', error.message);
    app.post('/api/webhook', (req, res) => {
        console.log('📨 Webhook fallback:', req.body);
        res.status(200).send('OK');
    });
}

// CONFIGURAÇÃO DO MULTER (DEVE VIR ANTES DA ROTA)
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

// ============================================================
// 8. ROTA DE UPLOAD DE PDF (SEM AUTENTICAÇÃO)
// ============================================================

app.post('/api/agendamentos/upload-pdf', uploadMemory.single('pdfFile'), async (req, res) => {
    console.log('🔥 ROTA /api/agendamentos/upload-pdf CHAMADA!');
    console.log('📥 req.file:', req.file);
    console.log('📥 req.body:', req.body);
    
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nenhum arquivo enviado. Use o campo "pdfFile".' 
            });
        }

        console.log(`📄 Recebendo PDF: ${req.file.originalname}, tamanho: ${req.file.size} bytes`);

        // 🔥 PEGAR O TELEFONE DO BODY
        const telefone = req.body.telefone || '21985234917';
        console.log(`📱 Telefone informado: ${telefone}`);

        // Importa o serviço
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

        // 🔥 PASSAR O TELEFONE CORRETAMENTE
        const resultado = await agendamentoService.extractAndSavePdfAgendamentos(
            req.file.buffer,
            telefone  // <-- TELEFONE CORRETO
        );

        if (!resultado.success) {
            return res.status(400).json(resultado);
        }

        res.json({
            success: true,
            message: `PDF processado com sucesso! ${resultado.agendamentosSalvos?.length || 0} agendamentos criados.`,
            data: resultado
        });

    } catch (error) {
        console.error('❌ Erro no upload do PDF:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar PDF', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

console.log('✅ ROTA /api/agendamentos/upload-pdf REGISTRADA COM SUCESSO!');

// ============================================================
// 9. ROTA PRINCIPAL DO FORMULÁRIO (PÚBLICA)
// ============================================================
app.get('/', (req, res) => {
    const formPath = path.join(__dirname, 'public', 'formulario-ds160.html');
    if (fs.existsSync(formPath)) {
        res.sendFile(formPath);
    } else {
        res.send(`
            <h1>📋 Formulário DS-160</h1>
            <p>Arquivo não encontrado. Copie <code>formulario-ds160.html</code> para a pasta <code>public/</code></p>
        `);
    }
});

app.get('/formulario-ds160', (req, res) => res.redirect('/'));
app.get('/formulario-ds160.html', (req, res) => res.redirect('/'));

// ============================================================
// 10. HEALTH CHECKS (PÚBLICOS)
// ============================================================
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
            upload_pdf: '/api/upload-pdf',
            health: '/health'
        }
    });
});

// ============================================================
// 11. INICIALIZAÇÃO
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
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log('='.repeat(50));
    console.log(`📱 Z-API: ${process.env.ZAPI_TOKEN ? '✅' : '❌'}`);
    console.log(`🗄️ Supabase: ${supabase ? '✅' : '❌'}`);
    console.log(`📧 Resend: ${process.env.RESEND_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 ADMIN_API_KEY: ${process.env.ADMIN_API_KEY ? '✅' : '❌'}`);
    console.log('='.repeat(50) + '\n');
});
// =============================================

// ============================================================
// 9. CONSTANTES DO BOT
// ============================================================

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

const SPAM_DOMAINS = ['tempmail', 'mailinator', '10minutemail', 'guerrillamail', 'throwaway', 'fake', 'spam'];

const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

// ============================================================
// 10. ESTADO DO USUÁRIO (PARA O BOT)
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
// 11. FUNÇÕES AUXILIARES GERAIS
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

function getFormData(data, campoNovo, campoAntigo, padrao) {
    return data[campoNovo] || data[campoAntigo] || padrao;
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

// ============================================================
// FUNÇÕES DE STATUS DO CLIENTE
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
        
        // Enviar notificação WhatsApp sobre a mudança de status
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
        'formulario_enviado': `📋 Olá ${nome}! Recebemos seu formulário DS-160 e já estamos analisando.\n\nEm breve entraremos em contato com os próximos passos.`,
        'em_analise': `🔍 Olá ${nome}! Estamos analisando seus documentos.\n\nEm breve iniciaremos o agendamento.`,
        'processo_aberto': `📌 Olá ${nome}! Seu processo foi aberto com sucesso!\n\nAgora vamos agendar sua coleta biométrica (CASV).`,
        'agendado_casv': `📅 Olá ${nome}! Seu CASV foi agendado!\n\nVerifique seu e-mail para mais detalhes.`,
        'agendado_entrevista': `🎤 Olá ${nome}! Sua entrevista foi agendada!\n\nVerifique seu e-mail para mais detalhes.`,
        'visto_aprovado': `🎉 PARABÉNS ${nome}! Seu visto foi aprovado!\n\nSeu passaporte será liberado em breve.`,
        'visto_recusado': `😔 Olá ${nome}! Infelizmente seu visto foi recusado.\n\nEntre em contato para entendermos os motivos.`
    };

    const mensagem = mensagens[status] || `🔄 Seu status foi atualizado para: ${status}`;
    
    try {
        await enviarWhatsApp(telefone, mensagem);
        console.log(`📱 Notificação de status enviada para ${telefone}`);
    } catch (error) {
        console.error('❌ Erro ao enviar notificação de status:', error);
    }
}

// ============================================================
// 12. FUNÇÕES DE CLASSIFICAÇÃO E RESPOSTAS DO BOT
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
    console.log('DEBUG detectarIntencao: Texto vazio, retornando desconhecida.');
    return 'desconhecida';
  }

  const saudacoes = [
    'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem', 'hello', 'hi'
  ];
  if (saudacoes.some((item) => texto === item || texto.startsWith(`${item} `))) {
    console.log('DEBUG detectarIntencao: Intenção detectada: saudacao');
    return 'saudacao';
  }

  if (
    ['ds160', 'formulario ds160', 'quero preencher ds160', 'preciso do ds160',
     'formulario visto americano', 'preencher visto americano', 'quero o formulario', 'link do formulario'].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: solicitar_ds160');
    return 'solicitar_ds160';
  }

  if (
    [
      'status', 'andamento', 'situacao', 'etapa', 'fase', 'progresso',
      'como esta meu processo', 'como esta o meu processo', 'qual o andamento', 'qual a situacao'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: andamento');
    return 'andamento';
  }

  if (
    [
      'documento', 'documentos', 'documentacao', 'requisito', 'requisitos',
      'papel', 'papeis'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: documentos');
    return 'documentos';
  }

  if (
    [
      'prazo', 'quanto tempo', 'quanto demora', 'demora', 'dias', 'semanas',
      'agendamento', 'processamento'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: prazo');
    return 'prazo';
  }

  if (
    [
      'pagamento', 'pagar', 'preco', 'valor', 'valores', 'quanto custa',
      'custo', 'investimento', 'taxa'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: pagamento');
    return 'pagamento';
  }

  if (
    [
      'ajuda', 'atendente', 'especialista', 'falar com alguem',
      'contato', 'humano'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: ajuda');
    return 'ajuda';
  }

  if (
    [
      'negado', 'negativa', 'recusado', 'recusaram', 'deportado', 'visto negado'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_negado');
    return 'visto_negado';
  }

  if (
    texto.includes('visto americano') ||
    texto.includes('visto eua') ||
    texto.includes('visto estados unidos') ||
    texto.includes('visto usa') ||
    texto.includes('b1') ||
    texto.includes('b2')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_americano');
    return 'visto_americano';
  }

  if (
    texto.includes('visto canadense') ||
    texto.includes('visto canada')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_canadense');
    return 'visto_canadense';
  }

  if (
    texto.includes('visto australiano') ||
    texto.includes('visto australia')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_australiano');
    return 'visto_australiano';
  }

  if (
    texto.includes('eta uk') ||
    texto.includes('reino unido') ||
    texto.includes('inglaterra')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: eta_uk');
    return 'eta_uk';
  }

  if (texto.includes('passaporte')) {
    console.log('DEBUG detectarIntencao: Intenção detectada: passaporte');
    return 'passaporte';
  }

  if (
    [
      'quero fazer o visto', 'quero meu visto', 'iniciar processo', 'comecar processo',
      'quero contratar', 'quero iniciar', 'vou contratar', 'quero informação', 'quero saber', 'me ajuda'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: iniciar_processo');
    return 'iniciar_processo';
  }

  console.log('DEBUG detectarIntencao: Nenhuma intenção específica detectada, retornando desconhecida.');
  return 'desconhecida';
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
           `🔗 <a href="https://getvisa.com.br/formulario-ds160" target="_blank" style="text-decoration: underline;">https://getvisa.com.br/formulario-ds160</a>\n\n` +
           `⏱️ *Tempo estimado:* 15-20 minutos\n` +
           `📱 *Pode preencher pelo celular ou computador*\n\n` +
           `✅ *Depois de preencher:*\n` +
           `• Nossa equipe fará a análise dos dados\n` +
           `• Você receberá a confirmação por e-mail\n` +
           `• Iniciaremos o agendamento da entrevista\n\n` +
           `💡 *Dica:* Tenha seu passaporte em mãos para preencher os dados corretamente.\n\n` +
           `📱 Dúvidas? Fale com a gente: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n` +
           `⚡ *Vamos realizar seu sonho de viajar para os EUA!* ✈️`;
}

function gerarRespostaBot(intencao, nome, etapaAtual) {
  console.log('--- DEBUG: INICIO gerarRespostaBot (VERSAO UNIFICADA) ---');
  console.log('Intencao recebida em gerarRespostaBot:', intencao);
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
      `Olá, ${primeiroNome}! Se precisar de ajuda ou quiser falar com um especialista, pode me chamar ou entrar em contato direto pelo WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>.`,

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
  };

  console.log('--- DEBUG: Objeto respostas gerado ---');

  return (
    respostas[intencao] ||
    `Olá, ${primeiroNome}!\n\n` +
      `Não consegui identificar sua solicitação.\n\n` +
      `Você pode perguntar sobre documentos, prazo, pagamento ou andamento do processo.`
  );
}

// ============================================================
// 13. FUNÇÕES DE MENU (BOT)
// ============================================================

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

// ============================================================
// 14. FUNÇÕES DE ONBOARDING (BOT)
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
                        status: 'novo',
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

            // 🔥 ADICIONE ESTE BLOCO: Atualizar status do cliente para "lead"
            try {
                const { data: clienteAtualizado, error: updateError } = await supabase
                    .from('clientes')
                    .update({ 
                        status: 'lead',
                        updated_at: new Date().toISOString()
                    })
                    .eq('telefone', telefoneLimpo)
                    .select()
                    .single();

                if (updateError) {
                    console.error('❌ Erro ao atualizar status do cliente:', updateError);
                } else {
                    console.log(`✅ Status atualizado para "lead" para ${telefoneLimpo}`);
                    // Enviar notificação de status
                    await enviarNotificacaoStatus(telefoneLimpo, 'lead', clienteAtualizado.nome);
                }
            } catch (statusError) {
                console.error('❌ Erro ao atualizar status:', statusError);
            }

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
                              '📱 WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n' +
                              '📧 E-mail: contato@getvisa.com.br\n\n' +
                              '📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\n' +
                              'Digite outra opção (1-7) ou 0 para menu principal';
                await sendReply(cleanPhone, msgEsp);
                break;
        }
        return;
    }

    const intencaoDetectada = detectarIntencao(messageText);
    console.log('DEBUG processarOpcaoNoSubmenu: Tentando detectar intenção geral:', intencaoDetectada);

    if (intencaoDetectada && intencaoDetectada !== 'desconhecida') {
        const respostaIntencao = gerarRespostaBot(intencaoDetectada, state.nome, null);
        if (respostaIntencao) {
            await sendReply(cleanPhone, respostaIntencao);
            return;
        }
    }

    const erroMsg = '❌ Opção inválida' + nomeCliente + '!\n\n' +
                   'Você está no menu: ' + getServiceName(service).toUpperCase() + '\n\n' +
                   'Opções disponíveis:\n' +
                   getSubmenu(service) + '\n\n' +
                   '💡 Para escolher outro serviço, digite 0 primeiro.';
    await sendReply(cleanPhone, erroMsg);
}

async function processarOpcaoNoMenuPrincipal(cleanPhone, messageText, state) {
    console.log('=== MENU PRINCIPAL ===');
    console.log('Mensagem recebida: "' + messageText + '"');

    try {
        const servicoMap = {
            '1': 'visto_americano',
            '2': 'visto_canadense',
            '3': 'visto_australiano',
            '4': 'eta_uk',
            '5': 'eta_canadense',
            '6': 'passaporte'
        };

        if (servicoMap[messageText]) {
            const serviceKey = servicoMap[messageText];
            console.log('Entrando no submenu de: ' + serviceKey);

            state.nivel = 'submenu';
            state.service = serviceKey;
            userState.set(cleanPhone, state);

            try {
                const submenuTexto = getSubmenu(serviceKey);
                await sendReply(cleanPhone, submenuTexto);
            } catch (err) {
                console.error('❌ Erro ao gerar submenu:', err);
                await sendReply(cleanPhone, '📋 Serviço selecionado! Digite 0 para voltar ao menu principal.');
            }
            return;
        }

        if (messageText === '7') {
            const ajudaMsg = '📞 AJUDA / CONTATO GETVISA\n\n' +
                            '👨‍💼 Moisés - Especialista em Vistos\n\n' +
                            '📱 WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n' +
                            '📧 E-mail: contato@getvisa.com.br\n\n' +
                            '🌐 Site: <a href="https://getvisa.com.br" target="_blank" style="text-decoration: underline;">https://getvisa.com.br</a>\n\n' +
                            '⏰ Horário: Seg-Sex, 9h às 18h\n\n' +
                            'Digite 0 para voltar ao MENU principal';
            await sendReply(cleanPhone, ajudaMsg);
            return;
        }

        let intent = null;
        try {
            intent = detectarIntencao(messageText);
            console.log('Intenção detectada:', intent);
        } catch (err) {
            console.error('❌ Erro ao detectar intenção:', err);
            intent = null;
        }

        if (intent === 'iniciar_processo' || intent === 'solicitar_ds160') {
            console.log('🚀 Cliente quer iniciar o processo ou o formulário DS-160!');

            let nomeCliente = 'Cliente';
            try {
                if (state && state.nome && typeof state.nome === 'string' && state.nome.trim().length > 0) {
                    nomeCliente = state.nome;
                }
            } catch (err) {
                console.error('❌ Erro ao pegar nome:', err);
                nomeCliente = 'Cliente';
            }

            try {
                const mensagemFormulario = getMensagemFormularioParaBot(nomeCliente);
                await sendReply(cleanPhone, mensagemFormulario);
            } catch (err) {
                console.error('❌ Erro ao gerar mensagem do formulário:', err);
                await sendReply(cleanPhone, '🌟 Vamos iniciar seu processo!\n\n📋 Preencha nosso formulário:\n🔗 <a href="https://getvisa.com.br/formulario-ds160" target="_blank" style="text-decoration: underline;">https://getvisa.com.br/formulario-ds160</a>\n\n📱 Dúvidas? <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>');
            }
            return;
        }

        if (intent === 'visto_americano') {
            state.nivel = 'submenu';
            state.service = 'visto_americano';
            userState.set(cleanPhone, state);
            try {
                const submenuTexto = getSubmenu('visto_americano');
                await sendReply(cleanPhone, submenuTexto);
            } catch (err) {
                console.error('❌ Erro ao gerar submenu americano:', err);
                await sendReply(cleanPhone, '🇺🇸 VISTO AMERICANO\n\nDigite 0 para voltar ao menu principal.');
            }
            return;
        }

        if (intent) {
            try {
                const resposta = gerarRespostaBot(intent, state.nome, state.etapaAtual);
                await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
            } catch (err) {
                console.error('❌ Erro ao processar intenção:', err);
                await sendReply(cleanPhone, '📋 Entendi sua pergunta! Digite 0 para o menu principal.');
            }
            return;
        }

        console.log('⚠️ Nenhuma intenção detectada para:', messageText);

        try {
            const menu = await getMenuPrincipal();
            await sendReply(cleanPhone, '❌ Desculpe, não entendi sua solicitação. Por favor, escolha uma opção ou digite 0 para o menu principal.\n\n' + menu);
        } catch (e) {
            console.error('❌ Erro no fallback do menu:', e);
            await sendReply(cleanPhone, '❌ Desculpe, não entendi sua solicitação. Digite 0 para o menu principal.');
        }
    } catch (error) {
        console.error('❌ ERRO NO processarOpcaoNoMenuPrincipal:', error);
        console.error('❌ Stack:', error.stack);
        await sendReply(cleanPhone, '❌ Desculpe, ocorreu um erro ao processar sua solicitação. Digite 0 para tentar novamente.');
    }
}



// ============================================================
// 16. FUNÇÃO DE ENVIO DE RESPOSTA (WHATSAPP)
// ============================================================

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
// 17. WEBHOOK PRINCIPAL (Z-API)
// ============================================================

// ============================================================
// WEBHOOK PRINCIPAL (Z-API) - PROCESSAMENTO DIRETO
// ============================================================
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

// ============================================================
// 18. FUNÇÕES DE GERAÇÃO DE PDF (DS-160)
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
            margin: 50
        });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            resolve(Buffer.concat(buffers));
        });
        doc.on('error', reject);

        doc.fontSize(20).text('Formulário DS-160 - GetVisa Assessoria', { align: 'center' });
        doc.moveDown();

        drawSectionTitle(doc, 'Dados Pessoais');
        doc.fontSize(10).text(`Nome Completo: ${dados['full_name'] || ''}`);
        doc.text(`Data de Nascimento: ${formatValue('text-5', dados['text-5']) || ''}`);
        doc.text(`Gênero: ${formatValue('radio-3', dados['radio-3']) || ''}`);
        doc.text(`Estado Civil: ${formatValue('select-4', dados['select-4']) || ''}`);
        doc.text(`Nacionalidade: ${dados['nacionalidade'] || ''}`);
        doc.text(`País de Nascimento: ${dados['pais_nascimento'] || ''}`);
        doc.text(`Cidade de Nascimento: ${dados['cidade_nascimento'] || ''}`);
        doc.text(`Possui outra nacionalidade? ${formatValue('radio-outra-nac', dados['radio-outra-nac']) || ''}`);
        doc.text(`É residente permanente de outro país? ${formatValue('radio-residente', dados['radio-residente']) || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Informações de Contato');
        doc.text(`Telefone: ${formatarTelefone(dados['telefone']) || ''}`);
        doc.text(`Email: ${dados['email'] || ''}`);
        doc.text(`Endereço: ${dados['endereco'] || ''}, ${dados['numero'] || ''}`);
        doc.text(`Bairro: ${dados['bairro'] || ''}`);
        doc.text(`Cidade: ${dados['cidade'] || ''}`);
        doc.text(`Estado: ${dados['estado'] || ''}`);
        doc.text(`CEP: ${dados['cep'] || ''}`);
        doc.text(`País: ${dados['pais'] || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Informações do Passaporte');
        doc.text(`Número do Passaporte: ${dados['passaporte_numero'] || ''}`);
        doc.text(`Data de Emissão: ${formatValue('text-21', dados['text-21']) || ''}`);
        doc.text(`Data de Expiração: ${formatValue('text-35', dados['text-35']) || ''}`);
        doc.text(`Local de Emissão: ${dados['passaporte_local_emissao'] || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Informações de Viagem');
        doc.text(`Tipo de Visto Solicitado: ${formatValue('radio-28', dados['radio-28']) || ''}`);
        doc.text(`Data de Chegada Pretendida: ${formatValue('text-66', dados['text-66']) || ''}`);
        doc.text(`Duração da Estadia: ${dados['text-67'] || ''} dias`);
        doc.text(`Endereço nos EUA: ${dados['text-69'] || ''}`);
        doc.text(`Quem paga a viagem? ${formatValue('radio-6', dados['radio-6']) || ''}`);
        doc.text(`Já viajou para os EUA? ${formatValue('radio-7', dados['radio-7']) || ''}`);
        if (dados['radio-7'] === 'one') {
            doc.text(`Viagens anteriores: ${groupTravels(dados).join('; ') || ''}`);
        }
        doc.text(`Já teve visto americano? ${formatValue('radio-8', dados['radio-8']) || ''}`);
        if (dados['radio-8'] === 'one') {
            doc.text(`Número do Visto Anterior: ${dados['text-61'] || ''}`);
            doc.text(`Data de Expiração do Visto Anterior: ${formatValue('text-62', dados['text-62']) || ''}`);
            doc.text(`Visto anterior é o mesmo tipo? ${formatValue('radio-9', dados['radio-9']) || ''}`);
            doc.text(`Visto anterior foi emitido no mesmo país? ${formatValue('radio-10', dados['radio-10']) || ''}`);
            doc.text(`Já teve as digitais coletadas? ${formatValue('radio-11', dados['radio-11']) || ''}`);
            doc.text(`Visto anterior foi cancelado ou revogado? ${formatValue('radio-12', dados['radio-12']) || ''}`);
        }
        doc.text(`Já teve visto negado? ${formatValue('radio-visto-negado', dados['radio-visto-negado']) || ''}`);
        doc.text(`Já teve entrada negada nos EUA? ${formatValue('radio-entrada-negada', dados['radio-entrada-negada']) || ''}`);
        doc.text(`Já foi deportado? ${formatValue('radio-deportado', dados['radio-deportado']) || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Informações Familiares');
        doc.text(`Nome Completo do Pai: ${dados['father_full_name'] || ''}`);
        doc.text(`Data de Nascimento do Pai: ${formatValue('text-50', dados['text-50']) || ''}`);
        doc.text(`Nome Completo da Mãe: ${dados['mother_full_name'] || ''}`);
        doc.text(`Data de Nascimento da Mãe: ${formatValue('text-44', dados['text-44']) || ''}`);
        doc.text(`Nome Completo do Cônjuge: ${dados['spouse_full_name'] || ''}`);
        doc.text(`Data de Nascimento do Cônjuge: ${formatValue('spouse-dob', dados['spouse-dob']) || ''}`);
        doc.text(`Nacionalidade do Cônjuge: ${dados['spouse_nationality'] || ''}`);
        doc.text(`País de Nascimento do Cônjuge: ${dados['spouse_country_birth'] || ''}`);
        doc.text(`Endereço do Cônjuge: ${formatValue('spouse-address-same', dados['spouse-address-same']) || ''}`);
        if (dados['spouse-address-same'] === 'two') {
            doc.text(`Endereço Detalhado do Cônjuge: ${dados['spouse_address_details'] || ''}`);
        }
        doc.text(`Data de Casamento: ${formatValue('data_casamento_div', dados['data_casamento_div']) || ''}`);
        doc.text(`Data de Divórcio: ${formatValue('data_divorcio', dados['data_divorcio']) || ''}`);
        doc.text(`Data de Falecimento: ${formatValue('data_falecimento', dados['data_falecimento']) || ''}`);
        doc.text(`Filhos: ${groupParallelArrays(dados, 'child_name[]', 'child_dob[]').join('; ') || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Informações de Emprego/Educação');
        doc.text(`Ocupação: ${formatValue('radio-27', dados['radio-27']) || ''}`);
        doc.text(`Nome do Empregador/Instituição: ${dados['empregador_nome'] || ''}`);
        doc.text(`Endereço do Empregador/Instituição: ${dados['empregador_endereco'] || ''}`);
        doc.text(`Telefone do Empregador/Instituição: ${dados['empregador_telefone'] || ''}`);
        doc.text(`Renda Mensal: ${dados['renda_mensal'] || ''}`);
        doc.text(`Descrição das Funções: ${dados['funcoes'] || ''}`);
        doc.text(`Educação: ${groupParallelArrays(dados, 'education_institution[]', 'education_course[]').join('; ') || ''}`);
        doc.moveDown();

        drawSectionTitle(doc, 'Segurança e Antecedentes');
        doc.text(`Possui doenças contagiosas? ${formatValue('radio-17', dados['radio-17']) || ''}`);
        doc.text(`Possui distúrbios mentais/físicos? ${formatValue('radio-18', dados['radio-18']) || ''}`);
        doc.text(`É viciado em drogas? ${formatValue('radio-19', dados['radio-19']) || ''}`);
        doc.text(`Já cometeu crimes? ${formatValue('radio-20', dados['radio-20']) || ''}`);
        doc.text(`Já esteve envolvido em terrorismo? ${formatValue('radio-14', dados['radio-14']) || ''}`);
        doc.text(`Já esteve envolvido em genocídio? ${formatValue('radio-15', dados['radio-15']) || ''}`);
        doc.text(`Já esteve envolvido em trabalho forçado? ${formatValue('radio-16', dados['radio-16']) || ''}`);
        doc.text(`Já violou leis de imigração? ${formatValue('radio-26', dados['radio-26']) || ''}`);
        doc.text(`Já serviu em forças armadas? ${formatValue('radio-23', dados['radio-23']) || ''}`);
        doc.text(`Já esteve envolvido em sequestro de crianças? ${formatValue('radio-29', dados['radio-29']) || ''}`);
        doc.text(`Já esteve envolvido em tráfico de pessoas? ${formatValue('radio-30', dados['radio-30']) || ''}`);
        doc.text(`Já esteve envolvido em lavagem de dinheiro? ${formatValue('radio-33', dados['radio-33']) || ''}`);
        doc.moveDown();

        doc.end();
    });
}

function getMensagemFormularioDS160ParaCliente(nomeCliente) {
    let primeiroNome = 'Cliente';
    try {
        if (nomeCliente && typeof nomeCliente === 'string' && nomeCliente.trim().length > 0) {
            primeiroNome = nomeCliente.trim().split(' ')[0];
        }
    } catch (err) {
        console.error('Erro ao processar nome:', err);
        primeiroNome = 'Cliente';
    }

    return `🎉 *PARABÉNS, ${primeiroNome.toUpperCase()}!* 🎉\n\n` +
           `Recebemos seu formulário DS-160 e ele já está em análise pela nossa equipe!\n\n` +
           `✅ *O que acontece agora:*\n` +
           `• Em breve você receberá um e-mail com o PDF do seu formulário preenchido para revisão.\n` +
           `• Nossa equipe entrará em contato para os próximos passos, incluindo o agendamento da entrevista.\n\n` +
           `🌟 *Sua jornada para os EUA continua!* ✈️\n\n` +
           `📱 Dúvidas? Fale com a gente: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>`;
}

// ============================================================
// 19. FUNÇÕES DE GERENCIAMENTO DE CLIENTES E ETAPAS
// ============================================================

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

async function gerarMensagemEtapa(clienteTelefone, etapaId) {
    const { data: etapaData, error } = await supabase
        .from('etapas_processo')
        .select('*')
        .eq('cliente_telefone', clienteTelefone)
        .maybeSingle();

    if (error || !etapaData) {
        console.error('Erro ao buscar etapa do cliente:', error);
        return 'Não foi possível encontrar informações sobre o andamento do seu processo.';
    }

    const etapaInfo = ETAPAS[etapaId || etapaData.etapa_atual];
    if (!etapaInfo) {
        return 'Etapa desconhecida. Por favor, entre em contato com nosso suporte.';
    }

    const nomeCliente = (await buscarClienteEmQualquerTabela(clienteTelefone))?.nome?.split(' ')[0] || 'Cliente';

    let mensagem = `Olá ${nomeCliente}!\n\n`;
    mensagem += `Seu processo na GetVisa Assessoria está na etapa:\n\n`;
    mensagem += `📍 *${etapaInfo.label.toUpperCase()}*\n\n`;

    switch (etapaInfo.id) {
        case 'formulario_enviado':
            mensagem += `Recebemos seu formulário e nossa equipe já está analisando os dados.`;
            break;
        case 'analise_correcoes':
            mensagem += `Estamos revisando seu formulário e documentos. Se houver necessidade de correções, entraremos em contato.`;
            break;
        case 'abertura_processo':
            mensagem += `Seu processo foi aberto e estamos preparando os próximos passos para o agendamento.`;
            break;
        case 'boleto_emitido':
            mensagem += `O boleto da taxa consular foi emitido. Por favor, verifique seu e-mail para efetuar o pagamento.`;
            break;
        case 'boleto_pago':
            mensagem += `Confirmamos o pagamento do seu boleto! Agora vamos prosseguir com o agendamento.`;
            break;
        case 'agendamento_realizado':
            mensagem += `Seu agendamento para o CASV e Consulado foi realizado! Verifique seu e-mail para os detalhes.`;
            break;
        case 'treinamento_realizado':
            mensagem += `Seu treinamento para a entrevista foi concluído. Você está pronto(a)!`;
            break;
        case 'entrevista_realizada':
            mensagem += `Sua entrevista foi realizada. Agora é aguardar a decisão consular!`;
            break;
        case 'visto_aprovado':
            mensagem += `Parabéns! Seu visto foi aprovado! Estamos aguardando o retorno do seu passaporte.`;
            break;
        case 'passaporte_retornado':
            mensagem += `Seu passaporte com o visto já está disponível para retirada/entrega! Entraremos em contato para combinar.`;
            break;
        case 'visto_recusado':
            mensagem += `Infelizmente, seu visto foi recusado. Nossa equipe entrará em contato para analisar as opções.`;
            break;
        default:
            mensagem += `Aguarde novas atualizações da nossa equipe.`;
            break;
    }

    mensagem += `\n\nEm caso de dúvidas, fale com a gente: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>`;
    return mensagem;
}

async function notificarClienteEtapa(clienteTelefone, etapaId, mensagemPersonalizada = null) {
    if (!FEATURES.SISTEMA_ETAPAS.ativo || !FEATURES.SISTEMA_ETAPAS.notificar_cliente) {
        console.log('Notificação de etapa desativada nas FEATURES.');
        return false;
    }

    const mensagem = mensagemPersonalizada || (await gerarMensagemEtapa(clienteTelefone, etapaId));
    return enviarWhatsApp(clienteTelefone, mensagem);
}

// ============================================================
// 20. ROTAS DE ADMINISTRAÇÃO
// ============================================================

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

app.post('/api/clientes/finalizar', async function(req, res) {
    try {
        var telefone = req.body.telefone;
        var resultado = req.body.resultado || 'aprovado';
        var observacoes = req.body.observacoes || '';
        var servico = req.body.servico || 'Visto Americano';
        var email = req.body.email || '';

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

        let finalizado;
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
                          `<a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n` +
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
                    observacao: `Cliente finalizado com ${resultado}`
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
                          `<a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n` +
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

app.get('/api/clientes/finalizados', async function(req, res) {
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

app.get('/api/clientes/finalizados/:telefone', async function(req, res) {
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

app.post('/api/clientes/reabrir', async function(req, res) {
    try {
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

        let ativo;
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
        } else {
            ativo = insertData;
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
                           `📱 Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>`;

            await enviarWhatsApp(cliente.telefone, mensagem);
            console.log(`✅ Mensagem de reabertura enviada`);
        } catch (err) {
            console.error('❌ Erro ao enviar mensagem:', err);
        }

        console.log(`✅ Processo reaberto com sucesso!`);

        res.json({
            success: true,
            message: 'Processo reaberto com sucesso',
            cliente: ativo
        });

    } catch (error) {
        console.error('❌ Erro ao reabrir processo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/clientes/buscar/:telefone', async function(req, res) {
    try {
        const telefone = req.params.telefone;
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');

        console.log(`🔍 Buscando cliente: ${telefoneLimpo}`);

        let { data, error } = await supabase
            .from('clientes_ativos')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();

        if (!data) {
            const telefoneFormatado = formatarTelefone(telefoneLimpo);
            const { data: dataFormatado } = await supabase
                .from('clientes_ativos')
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

app.post('/api/test-receive', function(req, res) {
    console.log('📨 ===== TESTE DE RECEBIMENTO =====');
    console.log('📨 Headers:', req.headers);
    console.log('📨 Body recebido:', JSON.stringify(req.body, null, 2));

    const logData = {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body,
        bodyKeys: Object.keys(req.body)
    };

    fs.appendFileSync('teste-recebimento.log', JSON.stringify(logData, null, 2) + '\n---\n');

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

        console.log('🔍 Verificando tabela clientes...');
        const { error: tableCheck } = await supabase
            .from('clientes')
            .select('id')
            .limit(1);

        if (tableCheck) {
            console.error('❌ Erro na tabela:', tableCheck);
            return res.json({
                sucesso: false,
                etapa: 'verificacao_tabela',
                erro: tableCheck,
                mensagem: 'Tabela clientes não existe ou está inacessível'
            });
        }

        console.log('🔄 Tentando UPSERT...');
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

        let upsertData;
        const { data: insertData, error: upsertError } = await supabase
            .from('clientes')
            .upsert(dados, { onConflict: 'telefone' })
            .select()
            .single();

        if (upsertError) {
            console.error('❌ UPSERT falhou:', upsertError);

            console.log('🔄 Tentando INSERT direto...');
            const { data: directInsertData, error: insertError } = await supabase
                .from('clientes')
                .insert(dados)
                .select()
                .single();

            if (insertError) {
                console.error('❌ INSERT falhou:', insertError);

                return res.json({
                    sucesso: false,
                    etapa: 'insert',
                    erro: insertError,
                    mensagem: 'Não foi possível criar o cliente',
                    detalhes: {
                        codigo: insertError.code,
                        mensagem: insertError.message,
                        detalhe: insertError.details
                    }
                });
            }

            return res.json({
                sucesso: true,
                etapa: 'insert',
                dados: directInsertData,
                mensagem: 'Cliente criado com INSERT'
            });
        } else {
            upsertData = insertData;
        }

        return res.json({
            sucesso: true,
            etapa: 'upsert',
            dados: upsertData,
            mensagem: 'Cliente criado com UPSERT'
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

        console.log('🔄 Tentando criar cliente...');
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

        console.log('🔄 Simulando processamento...');

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
                     `📱 Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n` +
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
                                   `📱 Dúvidas? Fale conosco pelo WhatsApp: <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>\n\n` +
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

app.get('/api/etapas/estatisticas', async function(req, res) {
    try {
        var result = await supabase.from('etapas_processo').select('etapa_atual');
        if (result.error) throw result.error;

        var estatisticas = {};
        var total = result.data.length;
        result.data.forEach(function(item) {
            if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0;
            estatisticas[item.etapa_atual]++;
        });

        var resultado = Object.keys(estatisticas).map(function(etapa) {
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

app.get('/api/clientes/ativos', async function(req, res) {
    try {
        var result = await supabase
            .from('clientes_ativos')
            .select('telefone, nome')
            .order('criado_em', { ascending: false });

        if (result.error) {
            console.error('Erro ao buscar ativos:', result.error);
            return res.status(500).json({ success: false, message: result.error.message });
        }

        res.json({
            success: true,
            ativos: result.data || []
        });

    } catch (error) {
        console.error('Erro ao buscar ativos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/clientes/listar', async function(req, res) {
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

// ============================================================
// 21. ROTA DE DASHBOARD (PAINEL)
// ============================================================

app.get('/api/dashboard-data', async (req, res) => {
    try {
        // Buscar clientes
        const { data: clientes, error: clientesError } = await supabase
            .from('clientes')
            .select('*')
            .order('created_at', { ascending: false });

        if (clientesError) {
            console.error('❌ Erro ao buscar clientes:', clientesError);
            return res.status(500).json({ error: clientesError.message });
        }

        // Buscar etapas dos clientes
        const { data: etapas, error: etapasError } = await supabase
            .from('etapas_processo')
            .select('cliente_telefone, etapa_atual, data_atualizacao');

        if (etapasError) {
            console.error('❌ Erro ao buscar etapas:', etapasError);
            return res.status(500).json({ error: etapasError.message });
        }

        // Mapear etapas por telefone
        const etapasMap = {};
        if (etapas) {
            etapas.forEach(etapa => {
                etapasMap[etapa.cliente_telefone] = {
                    etapa_atual: etapa.etapa_atual,
                    data_atualizacao: etapa.data_atualizacao
                };
            });
        }

        // Combinar dados
        const clientesComEtapas = clientes.map(cliente => ({
            ...cliente,
            etapa_atual: etapasMap[cliente.telefone]?.etapa_atual || 'Não definida',
            data_atualizacao: etapasMap[cliente.telefone]?.data_atualizacao || cliente.created_at
        }));

        // Estatísticas
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

// ============================================================
// 22. AGENDAR TREINAMENTO (via página)
// ============================================================

app.post('/api/agendar-treinamento', async (req, res) => {
    try {
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
            await lembretesService.generateRemindersForCompromisso(agendamento);
        } catch (e) {
            console.log('⚠️ Erro ao gerar lembretes para treinamento:', e.message);
        }

        try {
            const { enviarWhatsApp } = require('./utils/whatsappClient');
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
// 23. HEALTH CHECKS E CRON JOB
// ============================================================

app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/ping', (req, res) => { res.status(200).send('ok'); });

// ============================================================
// CRON JOB
// ============================================================
cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Executando cron job: processPendingReminders');
    try {
        // const lembretesService = require('./services/lembretes.service');
        // await lembretesService.processPendingReminders();
        console.log('✅ Cron job de lembretes concluído com sucesso.');
    } catch (err) {
        console.error('❌ Erro no cron job de lembretes:', err);
    }
});

// ============================================================
// 24. FUNÇÕES DE WHATSAPP (Z-API)
// ============================================================

// ============================================================
// FUNÇÕES DE WHATSAPP (Z-API)
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
// ROTA PARA ATUALIZAR STATUS DO CLIENTE (ADMIN)
// ============================================================
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

        // Buscar cliente
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

        // Atualizar status
        const resultado = await atualizarStatusCliente(telefone, status, { 
            observacao: observacao || null,
            data_status: new Date().toISOString()
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

// ============================================================
// PROCESSADOR DA FILA DE MENSAGENS
// ============================================================
// setInterval(async () => {
    //if (messageQueue.length === 0) return;
    
   // console.log(`🔄 Processando fila (${messageQueue.length} mensagens)...`);
    
    //while (messageQueue.length > 0) {
      //  const item = messageQueue.shift();
        //try {
          //  console.log(`📨 Processando mensagem de ${item.phone}: "${item.message}"`);
            //await processarMensagem(item.phone, item.message);
            //console.log(`✅ Mensagem processada para ${item.phone}`);
       // } catch (err) {
         //   console.error(`❌ Erro ao processar mensagem:`, err.message);
           // messageQueue.push(item);
           // break;
        //}
   // }
// }, 3000);

// ============================================================
// ROTA PARA RECEBER DADOS DO SIMULADOR
// ============================================================
app.post('/api/submit-simulador', async (req, res) => {
    try {
        const dados = req.body;
        console.log('📊 Nova avaliação recebida:', dados);

        const { nome, telefone, email, situacao_profissional, renda, historico_viagens, proposito_viagem, score, classificacao } = dados;

        // 1. Salvar no Supabase (tabela: avaliacoes)
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

        // 2. Atualizar cliente (se já existir)
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

        // 3. Enviar mensagem automática para o lead com base na classificação
        const mensagens = {
            'Perfil Forte': `🌟 *Ótimo perfil, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\n✅ Você está muito bem preparado! Já pode iniciar o processo do visto.\n\n📋 Vou te enviar o link do formulário DS-160 para começar agora mesmo.\n\n🔗 https://getvisa.com.br/formulario-ds160\n\nVamos em frente! 🚀`,
            'Perfil Moderado': `📊 *Perfil moderado, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nSeu perfil é bom, mas uma análise com especialista pode aumentar suas chances.\n\n🧑‍💼 Quer agendar uma consultoria gratuita agora?\n\nResponda *SIM* e já te encaminho.`,
            'Perfil Regular': `📉 *Perfil regular, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nAlguns pontos precisam ser ajustados para melhorar suas chances.\n\n🧑‍💼 Recomendo agendar uma consultoria com um especialista.\n\nResponda *SIM* para falar com um especialista.`,
            'Requer Atenção': `⚠️ *Perfil requer atenção, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nÉ importante revisar seu perfil antes de iniciar o processo.\n\n🧑‍💼 Vou encaminhar seu caso para um especialista. Ele entrará em contato em breve.\n\n📱 Enquanto isso, fale conosco: https://wa.me/5521974601812`
        };

        const msg = mensagens[classificacao] || `Olá ${nome.split(' ')[0]}! Sua avaliação foi *${classificacao}* com *${score}* pontos. Entre em contato para mais informações.`;
        
        if (cleanPhone) {
            await enviarWhatsApp(cleanPhone, msg);
            console.log('📱 Mensagem automática enviada para', cleanPhone);
        }

        // 4. Notificar você (especialista)
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

        // Enviar notificação para você (ex: e-mail ou WhatsApp)
        // Você pode usar o Resend para enviar e-mail ou enviar WhatsApp para seu número
        await enviarWhatsApp(process.env.ADMIN_PHONE, notificacao);
        console.log('📨 Notificação enviada para o especialista.');

        res.json({ success: true, message: 'Avaliação recebida com sucesso!' });

    } catch (error) {
        console.error('❌ Erro ao processar avaliação:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rota para o simulador (sem .html)
app.get('/simulador-visto-americano', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulador-visto-americano.html'));
});
// Redirecionar com barra também
app.get('/simulador-visto-americano/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulador-visto-americano.html'));
});


// ============================================================
// 25. INICIALIZAÇÃO DO SERVIDOR
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
    console.log(`📱 Z-API configurada: ${
        process.env.ZAPI_TOKEN &&
        (process.env.ZAPI_INSTANCE || process.env.ZAPI_CLIENT_TOKEN)
            ? '✅ Sim'
            : '❌ Não'
    }`);
    console.log(`🔑 ADMIN_API_KEY configurada: ${process.env.ADMIN_API_KEY ? '✅ Sim' : '❌ Não'}`);
    console.log(`📧 ADMIN_EMAIL configurado: ${process.env.ADMIN_EMAIL ? '✅ Sim' : '❌ Não'}`);
    console.log(`📞 ADMIN_PHONE configurado: ${process.env.ADMIN_PHONE ? '✅ Sim' : '❌ Não'}`);
    console.log('⏰ Cron job de lembretes agendado para rodar a cada 5 minutos.');
});