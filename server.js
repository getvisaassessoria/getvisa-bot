// server.js - VERSÃO REFATORADA, ORGANIZADA E SEM DUPLICATAS
console.log('--- 🚀 SERVER.JS INICIADO (VERSÃO REFATORADA) ---');

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
// 2. ESTADO GLOBAL E CONSTANTES
// ============================================================
const userState = new Map(); // { phone: { step, nome, email, tipo, ... } }

// Constantes de fluxo de triagem (onboarding simplificado)
const TRIAGEM_STEPS = {
    PERGUNTAR_TIPO: 'perguntar_tipo',
    AGUARDANDO_RESPOSTA: 'aguardando_resposta',
    AGUARDANDO_EMAIL_CLIENTE: 'aguardando_email_cliente',
    AGUARDANDO_NOME_LEAD: 'aguardando_nome_lead',
    AGUARDANDO_EMAIL_LEAD: 'aguardando_email_lead',
    COMPLETO: 'completo'
};

// Mapeamento de etapas do processo (usado em várias partes)
const ETAPAS = {
    formulario_enviado: { id: 'formulario_enviado', label: 'Formulário Enviado', next: 'analise_correcoes', color: '#3498db' },
    analise_correcoes: { id: 'analise_correcoes', label: 'Análise e Correções', next: 'abertura_processo', color: '#f39c12' },
    abertura_processo: { id: 'abertura_processo', label: 'Abertura do Processo', next: 'boleto_emitido', color: '#8e44ad' },
    boleto_emitido: { id: 'boleto_emitido', label: 'Boleto Emitido', next: 'boleto_pago', color: '#e67e22' },
    boleto_pago: { id: 'boleto_pago', label: 'Boleto Pago', next: 'agendamento_realizado', color: '#27ae60' },
    agendamento_realizado: { id: 'agendamento_realizado', label: 'Agendamento Realizado', next: 'treinamento_realizado', color: '#2980b9' },
    treinamento_realizado: { id: 'treinamento_realizado', label: 'Treinamento Concluído', next: 'entrevista_realizada', color: '#8e44ad' },
    entrevista_realizada: { id: 'entrevista_realizada', label: '🎤 Entrevista Realizada', next: null, color: '#2c3e50' },
    visto_aprovado: { id: 'visto_aprovado', label: '✅ Visto Aprovado', next: 'passaporte_retornado', color: '#16a34a' },
    passaporte_retornado: { id: 'passaporte_retornado', label: '📦 Passaporte disponível para retirada/entrega', next: null, color: '#2ecc71' },
    visto_recusado: { id: 'visto_recusado', label: '❌ Visto Recusado', next: null, color: '#ef4444' }
};

// Mapeamento de rádio para exibição (usado no PDF)
const RADIO_MAPPING = {
    'one': 'Sim', 'two': 'Não',
    'radio-28': { 'one': 'Turismo/negocio (B1/B2)', 'two': 'Estudos', 'Outros': 'Outros' },
    'radio-3': { 'one': 'Masculino', 'two': 'Feminino' },
    'select-4': { 'one': 'Casado(a)', 'two': 'Solteiro(a)', 'Uniao-estavel': 'Uniao estavel', 'Viuvo(a)': 'Viuvo(a)', 'Divorciado(a)': 'Divorciado(a)' },
    'radio-6': { 'one': 'Eu mesmo', 'two': 'Outra pessoa' },
    'radio-7': { 'one': 'Sim', 'two': 'Não' },
    'radio-8': { 'one': 'Sim', 'two': 'Não' },
    'radio-23': { 'one': 'Sim', 'two': 'Não' },
    'radio-29': { 'one': 'Sim', 'two': 'Não' },
    'radio-30': { 'one': 'Sim', 'two': 'Não' },
    'radio-33': { 'one': 'Sim', 'two': 'Não' },
    'radio-27': { 'Profissional': 'Profissional', 'Estudante': 'Estudante', 'Aposentado': 'Aposentado', 'Outra': 'Outra' },
    'radio-17': { 'one': 'Sim', 'two': 'Não' },
    'radio-18': { 'one': 'Sim', 'two': 'Não' },
    'radio-19': { 'one': 'Sim', 'two': 'Não' },
    'radio-20': { 'one': 'Sim', 'two': 'Não' },
    'radio-14': { 'one': 'Sim', 'two': 'Não' },
    'radio-15': { 'one': 'Sim', 'two': 'Não' },
    'radio-16': { 'one': 'Sim', 'two': 'Não' },
    'radio-26': { 'one': 'Sim', 'two': 'Não' },
    'radio-planos': { 'one': 'Sim', 'two': 'Não' },
    'radio-9': { 'one': 'Sim', 'two': 'Não, e diferente' },
    'radio-10': { 'one': 'Sim', 'two': 'Não' },
    'radio-11': { 'one': 'Sim', 'two': 'Não' },
    'radio-12': { 'one': 'Sim', 'two': 'Não' },
    'radio-outra-nac': { 'one': 'Sim', 'two': 'Não' },
    'radio-residente': { 'one': 'Sim', 'two': 'Não' },
    'spouse-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'ex-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'falecido-address-same': { 'one': 'Mesmo que o meu', 'two': 'Diferente' },
    'radio-visto-negado': { 'one': 'Sim', 'two': 'Não' },
    'radio-entrada-negada': { 'one': 'Sim', 'two': 'Não' },
    'radio-deportado': { 'one': 'Sim', 'two': 'Não' }
};
const DATE_FIELDS = [
    'text-5','text-21','text-35','text-66','text-67','text-69',
    'text-61','text-62','spouse-dob','data_casamento_div',
    'data_divorcio','data_falecimento','text-50','text-44',
    'text-45','military_date_from','military_date_to','antecedentes_data'
];
const SPAM_DOMAINS = ['tempmail','mailinator','10minutemail','guerrillamail','throwaway','fake','spam'];

const FEATURES = {
    SISTEMA_ETAPAS: {
        ativo: true,
        notificar_cliente: true,
        auto_avancar: true
    }
};

// ============================================================
// 3. CONFIGURAÇÃO DO SUPABASE
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
// 4. MIDDLEWARES E CONFIGURAÇÕES EXPRESS
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(auth.logAcesso);
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// Configuração do Multer para upload de PDF
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Apenas arquivos PDF são permitidos'));
    }
});
console.log('✅ Multer configurado com memoryStorage');

// Servir arquivos estáticos
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
app.use(express.static(publicPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// 5. FUNÇÕES AUXILIARES GERAIS
// ============================================================
function limparTelefone(telefone) {
    if (!telefone) return null;
    let limpo = telefone.toString().replace(/\D/g, '');
    if (limpo.startsWith('55')) limpo = limpo.substring(2);
    return limpo;
}

function formatarTelefone(telefone) {
    if (!telefone) return null;
    const numeros = telefone.toString().replace(/\D/g, '');
    if (numeros.length === 11) {
        return '(' + numeros.substring(0,2) + ') ' + numeros.substring(2,7) + '-' + numeros.substring(7,11);
    }
    if (numeros.length === 10) {
        return '(' + numeros.substring(0,2) + ') ' + numeros.substring(2,6) + '-' + numeros.substring(6,10);
    }
    return telefone;
}

function getRandomMessage(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function validarNome(nome) {
    if (!nome || nome.trim().length < 2 || nome.trim().length > 100) return false;
    const regex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
    if (!regex.test(nome.trim())) return false;
    if (/^\d+$/.test(nome.trim().replace(/\s/g,''))) return false;
    const invalidas = ['sim','nao','ok','yes','no','teste','oi','ola'];
    if (invalidas.includes(nome.trim().toLowerCase())) return false;
    return true;
}

function formatarNome(nome) {
    return nome.trim().toLowerCase().split(' ')
        .map(p => p.length <= 2 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1))
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
    if (!dateString) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return match[3] + '/' + match[2] + '/' + match[1];
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2,'0');
        const month = String(date.getMonth()+1).padStart(2,'0');
        return day + '/' + month + '/' + date.getFullYear();
    }
    return dateString;
}

function formatValue(fieldName, value) {
    if (value === undefined || value === null || value === '') return null;
    if (DATE_FIELDS.includes(fieldName)) {
        const f = formatDateToBrazilian(value);
        if (f) return f;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        return value.map(v => {
            if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][v]) return RADIO_MAPPING[fieldName][v];
            if (RADIO_MAPPING[v]) return RADIO_MAPPING[v];
            return v;
        }).join(', ');
    }
    if (RADIO_MAPPING[fieldName] && RADIO_MAPPING[fieldName][value]) return RADIO_MAPPING[fieldName][value];
    if (RADIO_MAPPING[value]) return RADIO_MAPPING[value];
    return value;
}

function isSpamData(dados) {
    const nome = dados.nome || dados.nome_cliente || dados.full_name || '';
    const telefone = dados.telefone || dados.whatsapp || dados.telefone_whatsapp || '';
    const email = dados.email || '';
    if (/^[a-z]{10,}$/i.test(nome)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(nome)) return true;
    if (nome.length > 0 && nome.length < 3) return true;
    if (telefone && /[a-zA-Z]/.test(telefone)) return true;
    const telLimpo = (telefone || '').toString().replace(/\D/g,'');
    if (telLimpo.length > 0 && telLimpo.length < 10) return true;
    if (telLimpo && /^(\d)\1+$/.test(telLimpo)) return true;
    for (const d of SPAM_DOMAINS) {
        if (email.toLowerCase().includes(d)) return true;
    }
    if (email && (!email.includes('@') || email.split('@').length !== 2)) return true;
    return false;
}

function obterNomeExibicao(nome) {
    const n = String(nome || '').trim();
    if (!n || n.toLowerCase() === 'cliente') return 'Cliente';
    return n.split(' ')[0];
}

// ============================================================
// 6. FUNÇÕES DE WHATSAPP (Z-API)
// ============================================================
async function enviarWhatsApp(telefone, mensagem, isNotificacao = false) {
    try {
        if (isNotificacao) {
            const pode = await clientePodeReceberNotificacoes(telefone);
            if (!pode) {
                console.log(`🔇 Notificação bloqueada para ${telefone}`);
                return false;
            }
        }
        const instance = process.env.ZAPI_INSTANCE;
        const token = process.env.ZAPI_TOKEN;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;
        if (!instance || !token) {
            console.error('❌ Z-API não configurada.');
            console.log('📨 Mensagem que seria enviada:', mensagem);
            return false;
        }
        const telefoneLimpo = telefone.toString().replace(/\D/g,'');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;
        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: telefoneFormatado, message: mensagem })
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
        if (!instance || !token) return false;
        const telefoneLimpo = telefone.toString().replace(/\D/g,'');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;
        const base64PDF = pdfBuffer.toString('base64');
        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-document`;
        const headers = { 'Content-Type': 'application/json' };
        if (clientToken) headers['Client-Token'] = clientToken;
        const response = await fetch(url, {
            method: 'POST',
            headers,
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

async function clientePodeReceberNotificacoes(telefone) {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('tipo_contato, silenciar_notificacoes')
            .eq('telefone', telefone)
            .maybeSingle();
        if (error || !data) return true;
        if (data.tipo_contato === 'contato_pessoal' || data.silenciar_notificacoes === true) {
            console.log(`🔇 Notificação bloqueada para ${telefone} (${data.tipo_contato})`);
            return false;
        }
        return true;
    } catch (error) {
        return true;
    }
}

// ============================================================
// 7. FUNÇÕES DE GERENCIAMENTO DE CLIENTES E ETAPAS
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
        'analise_correcoes': `📝 Olá ${nome}! Analisando o formulario, observamos que algumas perguntas merecem esclarecimentos.\n\n📌 Em breve entraremos em contato!`,
        'processo_aberto': `📌 Olá ${nome}! Seu processo foi aberto com sucesso!\n\n✅ Próximos passos:\n• Pagamento da taxa consular.\n`,
        'boleto_emitido': `💰 Olá ${nome}! O boleto/pix da taxa consular foi enviado.\n\n📌 Verifique seu e-mail/whatsapp para acessar o boleto/pix.\n`,
        'boleto_pago': `✅ Olá ${nome}! Confirmamos o pagamento da taxa consular!\n\n📌 Agora vamos prosseguir com o agendamento da sua entrevista.`,
        'agendado_casv': `📅 Olá ${nome}! Seu CASV (coleta biométrica) foi agendado!\n\n📍 Verifique seu e-mail/whatsapp com os detalhes do local e horário.\n\n📌 Não se esqueça de levar:\n• Passaporte original\n• Comprovante de agendamento\n• Documentos pessoais`,
        'agendado_entrevista': `🎤 Olá ${nome}! Sua entrevista no Consulado foi agendada!\n\n📍 Verifique seu e-mail/whatsapp com a data, horário e local.\n\n📌 Dicas importantes:\n• Chegue com 30 minutos de antecedência\n• Leve todos os documentos originais\n• Mantenha a calma e seja sincero(a)`,
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

async function atualizarEtapa(telefone, novaEtapa, dadosAdicionais = {}) {
    try {
        const updateData = {
            etapa_atual: novaEtapa,
            [`data_${novaEtapa}`]: new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...dadosAdicionais
        };
        const { data, error } = await supabase
            .from('etapas_processo')
            .upsert({ cliente_telefone: telefone, ...updateData }, { onConflict: 'cliente_telefone' })
            .select()
            .single();
        if (error) {
            console.error(`❌ Erro ao atualizar etapa ${novaEtapa}:`, error);
            return { success: false, error };
        }
        console.log(`✅ Etapa ${novaEtapa} atualizada para ${telefone}`);
        await enviarNotificacaoEtapa(telefone, novaEtapa, data);
        return { success: true, data };
    } catch (error) {
        console.error('❌ Erro ao atualizar etapa:', error);
        return { success: false, error };
    }
}

async function enviarNotificacaoEtapa(telefone, etapa, dadosCliente) {
    const mensagens = {
        'formulario_enviado': (nome) => `✅ Olá ${nome}! Recebemos seu formulário DS-160 com sucesso!\n\n📌 Nossa equipe já está analisando seus dados.\n\n⏳ Em até 24h entraremos em contato.`,
        'analise_correcoes': (nome) => `🔍 Olá ${nome}! Estamos analisando seus documentos.\n\n📌 Em breve entraremos em contato se houver correções.`,
        'abertura_processo': (nome) => `📌 Olá ${nome}! Seu processo foi aberto com sucesso!\n\n✅ Próximos passos:\n• Pagamento da taxa consular\n• Agendamento para procedimentos (CASV/Consulado). `,
        'boleto_emitido': (nome) => `💰 Olá ${nome}! O boleto da taxa consular foi emitido.\n\n📌 Verifique seu e-mail para acessar o boleto.\n`,
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
    const mensagem = mensagens[etapa]?.(nome) || `🔄 Seu processo foi atualizado para: ${ETAPAS[etapa]?.label || etapa}`;
    try {
        await enviarWhatsApp(telefone, mensagem);
        console.log(`📱 Notificação de etapa enviada para ${telefone}: ${etapa}`);
    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
    }
}

async function buscarClienteEmQualquerTabela(telefoneLimpo) {
    const tabelas = ['clientes', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
    for (const tabela of tabelas) {
        try {
            const { data, error } = await supabase
                .from(tabela)
                .select('*')
                .eq('telefone', telefoneLimpo)
                .maybeSingle();
            if (!error && data) return data;
        } catch (e) {}
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
                historico: [{ etapa: 'formulario_enviado', data: new Date().toISOString(), observacao: 'Formulário DS-160 recebido' }],
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

// ============================================================
// 8. FUNÇÕES DE DETECÇÃO DE INTENÇÃO E RESPOSTAS DO BOT
// ============================================================
function normalizarTexto(texto) {
    return String(texto || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[!?.,;:()[\]$|{}]/g,' ')
        .replace(/\s+/g,' ').trim();
}

function detectarIntencao(mensagem) {
    const texto = normalizarTexto(mensagem);
    if (!texto) return 'desconhecida';

    const saudacoes = ['oi','ola','bom dia','boa tarde','boa noite','opa','e ai','tudo bem','hello','hi'];
    if (saudacoes.some(item => texto === item || texto.startsWith(item + ' '))) return 'saudacao';

    if (['ds160','formulario ds160','quero preencher ds160','preciso do ds160',
         'formulario visto americano','preencher visto americano','quero o formulario','link do formulario'].some(item => texto.includes(item)))
        return 'solicitar_ds160';

    if (['status','andamento','situacao','etapa','fase','progresso',
         'como esta meu processo','como esta o meu processo','qual o andamento','qual a situacao'].some(item => texto.includes(item)))
        return 'andamento';

    if (['documento','documentos','documentacao','requisito','requisitos','papel','papeis'].some(item => texto.includes(item)))
        return 'documentos';

    if (['prazo','quanto tempo','quanto demora','demora','dias','semanas','agendamento','processamento'].some(item => texto.includes(item)))
        return 'prazo';

    if (['pagamento','pagar','preco','valor','valores','quanto custa','custo','investimento','taxa'].some(item => texto.includes(item)))
        return 'pagamento';

    if (['ajuda','atendente','especialista','falar com alguem','contato','humano'].some(item => texto.includes(item)))
        return 'ajuda';

    if (['negado','negativa','recusado','recusaram','deportado','visto negado'].some(item => texto.includes(item)))
        return 'visto_negado';

    if (texto.includes('visto americano') || texto.includes('visto eua') || texto.includes('visto estados unidos') ||
        texto.includes('visto usa') || texto.includes('b1') || texto.includes('b2')) return 'visto_americano';
    if (texto.includes('visto canadense') || texto.includes('visto canada')) return 'visto_canadense';
    if (texto.includes('visto australiano') || texto.includes('visto australia')) return 'visto_australiano';
    if (texto.includes('eta uk') || texto.includes('reino unido') || texto.includes('inglaterra')) return 'eta_uk';
    if (texto.includes('passaporte')) return 'passaporte';

    if (['quero fazer o visto','quero meu visto','iniciar processo','comecar processo',
         'quero contratar','quero iniciar','vou contratar','quero informação','quero saber','me ajuda'].some(item => texto.includes(item)))
        return 'iniciar_processo';

    if (['indicar','recomendar','amigo','conhecido','contato de amigo','posso indicar','quero indicar','indicacao','recomendacao'].some(item => texto.includes(item)))
        return 'indicar_amigo';

    if (['falar com especialista','falar com atendente','falar com humano','quero falar com alguem','preciso de ajuda especializada',
         'duvida nao contemplada','caso especifico','situacao diferente'].some(item => texto.includes(item)))
        return 'falar_especialista';

    if (['duvida','pergunta','esclarecimento','informacao adicional','nao entendi','pode me explicar','gostaria de saber'].some(item => texto.includes(item)))
        return 'duvida_geral';

    if (['otimo','excelente','muito bom','gostei','parabens','feedback','avaliacao'].some(item => texto.includes(item)))
        return 'feedback';

    return 'desconhecida';
}

function getMensagemFormularioParaBot(nomeCliente) {
    let primeiroNome = obterNomeExibicao(nomeCliente);
    return `🌟 *ÓTIMO, ${primeiroNome.toUpperCase()}!* 🌟\n\n` +
           `Para iniciarmos seu processo, preciso que você preencha nosso formulário com os dados do visto americano.\n\n` +
           `📋 *LINK DO FORMULÁRIO:*\n` +
           `🔗 [Clique aqui para preencher o formulário](https://app.getvisa.com.br/formulario-ds160)` +
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
    let primeiroNome = obterNomeExibicao(nomeCliente);
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
    const respostas = {
        saudacao: `👋 Olá, ${primeiroNome}!\n\nSou o assistente da GetVisa Assessoria. Estou aqui para ajudar com informações sobre vistos, documentos, prazos e andamento do processo.\n\nComo posso ajudar?`,
        solicitar_ds160: getMensagemFormularioParaBot(primeiroNome),
        andamento: `Certo, ${primeiroNome}! Para verificar o andamento do seu processo, por favor, me informe o número do seu protocolo ou CPF.`,
        documentos: `Para informações sobre documentos, ${primeiroNome}, preciso saber qual visto ou serviço você precisa. Por exemplo, "documentos para visto americano".`,
        prazo: `Os prazos variam bastante, ${primeiroNome}. Para qual visto ou serviço você gostaria de saber o prazo?`,
        pagamento: `Para informações sobre pagamentos, ${primeiroNome}, preciso saber qual serviço ou etapa do processo você se refere. Você pode me dar mais detalhes?`,
        ajuda: `Olá, ${primeiroNome}! Se precisar de ajuda ou quiser falar com um especialista, pode me chamar ou entrar em contato direto pelo WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812).`,
        visto_negado: `Se o seu visto foi negado, ${primeiroNome}, não se preocupe! Temos um serviço de recuperação. Acesse: <a href="https://getvisa.com.br/visto-americano-negado" target="_blank">getvisa.com.br/visto-americano-negado</a> para uma análise gratuita.`,
        visto_americano: `O Visto Americano (B1/B2) é para turismo e negócios, ${primeiroNome}. O processo envolve preenchimento do DS-160, agendamento de entrevista e coleta de biometria. Saiba mais em <a href="https://getvisa.com.br/visto-americano" target="_blank">getvisa.com.br/visto-americano</a>.`,
        visto_canadense: `Para o Visto Canadense, ${primeiroNome}, o processo geralmente é online e pode incluir biometria. Existem diferentes tipos de visto dependendo do seu objetivo. Mais detalhes em <a href="https://getvisa.com.br/visto-canadense" target="_blank">getvisa.com.br/visto-canadense</a>.`,
        visto_australiano: `O Visto Australiano, ${primeiroNome}, é solicitado online e pode exigir o envio de documentos. É importante verificar os requisitos específicos para o seu tipo de viagem. Informações em <a href="https://getvisa.com.br/visto-australiano" target="_blank">getvisa.com.br/visto-australiano</a>.`,
        eta_uk: `O eTA UK é uma autorização eletrônica de viagem para o Reino Unido, ${primeiroNome}. Você precisará de um passaporte válido e preencher o formulário online. Ele não é um visto, mas uma permissão para entrar. Informações em <a href="https://getvisa.com.br/eta-uk" target="_blank">getvisa.com.br/eta-uk</a>.`,
        passaporte: `O passaporte é o documento de viagem essencial, ${primeiroNome}. Para solicitá-lo ou renová-lo, você deve agendar um atendimento na Polícia Federal. Podemos te auxiliar com as informações necessárias. Visite <a href="https://getvisa.com.br/passaporte" target="_blank">getvisa.com.br/passaporte</a>.`,
        iniciar_processo: `Excelente, ${primeiroNome}! Para iniciar seu processo de visto, por favor, visite nosso site <a href="https://www.getvisa.com.br/iniciar-processo" target="_blank">www.getvisa.com.br/iniciar-processo</a> ou entre em contato com nossa equipe para um atendimento personalizado.`,
        indicar_amigo: `👥 *Olá ${primeiroNome}!*\n\nQue legal você indicar a GetVisa! 🌟\n\n📱 *Compartilhe:* wa.me/5521974601812\n🌐 *Site:* getvisa.com.br\n📋 *Formulário:* https://app.getvisa.com.br/formulario-ds160\n\n🎁 *Bônus para você:*\nIndique um amigo que feche o processo e ganhe 10% de desconto!`,
        falar_especialista: `👨‍💼 *Olá ${primeiroNome}!*\n\nEntendi que você tem uma situação específica.\n\n📱 *Fale com nossa equipe diretamente:*\n[Clique aqui](https://wa.me/5521974601812)\n\n📧 *Ou por e-mail:* contato@getvisa.com.br\n\n⏰ *Atendimento:* Seg-Sex, 9h às 18h\n📌 *Resposta:* até 2 horas`,
        duvida_geral: `🤔 *Olá ${primeiroNome}!*\n\nPosso ajudar com:\n\n1️⃣ *Documentos* - Quais levar\n2️⃣ *Prazo* - Quanto tempo demora\n3️⃣ *Status* - Andamento do seu processo\n4️⃣ *Valores* - Quanto custa\n\n💡 *Seja específico(a)*, ex: "documentos para visto"`,
        feedback: `⭐ *Olá ${primeiroNome}!*\n\nFicamos felizes com seu feedback! 🌟\n\n📱 *Compartilhe sua experiência:*\n[Clique aqui](https://wa.me/5521974601812)\n\n📧 *Ou por e-mail:* contato@getvisa.com.br\n\n⭐ *Avalie-nos:* Excelente | Bom | Regular`
    };
    return respostas[intencao] || `Olá, ${primeiroNome}!\n\nNão consegui identificar sua solicitação.\n\nVocê pode perguntar sobre documentos, prazo, pagamento ou andamento do processo.`;
}

// ============================================================
// 9. FUNÇÕES DE MENU E SUBMENU
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
    const respostas = {
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
    const resposta = respostas[opcao] && respostas[opcao][servico];
    return resposta || `📋 INFORMAÇÕES EM BREVE\n\nEstamos preparando o conteúdo específico para ${servico.replace('_',' ').toUpperCase()}.\n\nDigite 0 para voltar ao MENU principal`;
}

// ============================================================
// 10. FUNÇÕES DE PROCESSAMENTO DAS MENSAGENS (FLUXO PRINCIPAL)
// ============================================================

// 10.1. TRIAGEM INICIAL (GERENCIAMENTO DE ESTADOS)
async function gerenciarTriagem(phone, message, state) {
    console.log(`📌 Triagem - Estado atual: ${state.step}, telefone: ${phone}`);
    state.lastActivity = Date.now();

    switch (state.step) {
        case TRIAGEM_STEPS.PERGUNTAR_TIPO: {
            const msg = `👋 Olá! Seja bem-vindo(a) à **GetVisa Assessoria**! 🇺🇸

Somos especialistas em vistos americanos e viagens internacionais!

Para eu saber como posso te ajudar melhor, me diga:

1️⃣ - Cliente (já estou em processo de visto)
2️⃣ - Quero informações sobre Vistos, eTA, ESTA, Passaporte
3️⃣ - Outros assuntos (contato pessoal, fornecedor, etc)

Digite o número da opção (1, 2 ou 3)`;
            await enviarWhatsApp(phone, msg);
            state.step = TRIAGEM_STEPS.AGUARDANDO_RESPOSTA;
            userState.set(phone, state);
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_RESPOSTA: {
            const opcao = message.trim();
            if (!['1','2','3'].includes(opcao)) {
                await enviarWhatsApp(phone, `❌ Opção inválida! Por favor, digite:\n\n1️⃣ - Cliente\n2️⃣ - Quero informações sobre Vistos\n3️⃣ - Outros assuntos`);
                return;
            }
            if (opcao === '3') {
                // Contato pessoal: silenciar permanentemente
                await supabase.from('clientes').upsert({
                    telefone: phone,
                    tipo_contato: 'contato_pessoal',
                    status: 'contato_pessoal',
                    data_contato: new Date().toISOString(),
                    onboarding_completo: true
                }, { onConflict: 'telefone' });
                userState.delete(phone);
                console.log(`🔇 Contato pessoal ${phone} silenciado.`);
                return;
            }
            if (opcao === '1') {
                state.tipo = 'cliente';
                state.step = TRIAGEM_STEPS.AGUARDANDO_EMAIL_CLIENTE;
                userState.set(phone, state);
                await enviarWhatsApp(phone, `✅ Entendi! Você já está em processo de visto.\n\nPara verificar o andamento do seu processo, me informe:\n\n📧 **Qual é o seu e-mail cadastrado?**\n\nEx: maria@email.com`);
                return;
            }
            if (opcao === '2') {
                state.tipo = 'lead';
                state.step = TRIAGEM_STEPS.AGUARDANDO_NOME_LEAD;
                userState.set(phone, state);
                await enviarWhatsApp(phone, `📋 Ótimo! Vou te ajudar com todas as informações sobre vistos e viagens!\n\n📌 *Para começar, me diga seu nome completo:*\n\nEx: Maria Silva`);
                return;
            }
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_EMAIL_CLIENTE: {
            const email = message.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                await enviarWhatsApp(phone, `❌ E-mail inválido! Digite um e-mail válido.\n\n📧 Ex: maria@email.com`);
                return;
            }
            const { data: cliente, error } = await supabase
                .from('clientes')
                .select('*')
                .eq('email', email)
                .maybeSingle();
            if (error || !cliente) {
                await enviarWhatsApp(phone, `❌ Nenhum cliente encontrado com este e-mail.\n\n📌 Verifique se o e-mail está correto ou cadastre-se como lead digitando *2*.`);
                return;
            }
            // Cliente encontrado
            await supabase
                .from('clientes')
                .update({ telefone: phone, tipo_contato: 'cliente', updated_at: new Date().toISOString() })
                .eq('email', email);
            userState.delete(phone);
            await processarClienteExistente(phone, '', cliente);
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_NOME_LEAD: {
            const nome = message.trim();
            if (nome.length < 3) {
                await enviarWhatsApp(phone, `❌ Nome inválido! Digite seu nome completo.\n\n📝 Ex: Maria Silva`);
                return;
            }
            state.nome = nome;
            state.step = TRIAGEM_STEPS.AGUARDANDO_EMAIL_LEAD;
            userState.set(phone, state);
            await enviarWhatsApp(phone, `😊 Prazer, ${nome}! Agora me diga:\n\n📧 **Qual é o seu e-mail?**\n\nEx: maria@email.com`);
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_EMAIL_LEAD: {
            const email = message.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                await enviarWhatsApp(phone, `❌ E-mail inválido! Digite um e-mail válido.\n\n📧 Ex: maria@email.com`);
                return;
            }
            // Salvar lead
            await supabase
                .from('clientes')
                .upsert({
                    telefone: phone,
                    nome: state.nome,
                    email: email,
                    tipo_contato: 'lead',
                    status: 'lead',
                    data_contato: new Date().toISOString(),
                    onboarding_completo: true
                }, { onConflict: 'telefone' });
            userState.delete(phone);
            const menu = await getMenuPrincipal();
            await enviarWhatsApp(phone, menu);
            break;
        }

        default:
            console.warn(`⚠️ Estado de triagem desconhecido: ${state.step}, reiniciando.`);
            state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
            userState.set(phone, state);
            await gerenciarTriagem(phone, message, state);
    }
}

// 10.2. PROCESSAR CLIENTE EXISTENTE (com processo)
async function processarClienteExistente(phone, message, cliente) {
    const primeiroNome = obterNomeExibicao(cliente.nome);
    const msg = message.trim().toLowerCase();
    if (msg === 'menu' || msg === '0') {
        const menu = `📊 *Olá ${primeiroNome}!*\n\nSeu processo está em andamento.\n\nO que você gostaria de fazer?\n\n1️⃣ - Ver status do seu processo\n2️⃣ - Falar com um especialista\n\n0️⃣ - Voltar ao menu principal\n\nDigite o número da opção (1-2)`;
        await enviarWhatsApp(phone, menu);
        return;
    }
    if (msg === '1' || msg.includes('status') || msg.includes('andamento')) {
        await mostrarStatusProcesso(phone, cliente);
        return;
    }
    if (msg === '2' || msg.includes('especialista') || msg.includes('ajuda') || msg.includes('contato')) {
        await enviarWhatsApp(phone, `👨‍💼 *Olá ${primeiroNome}!*\n\n📱 Fale com nossa equipe: wa.me/5521974601812\n📧 contato@getvisa.com.br\n⏰ Seg-Sex, 9h-18h\n\n💡 *Dica:* Tenha seu protocolo DS-160 em mãos.\n\n0️⃣ - Voltar ao menu principal`);
        return;
    }
    await mostrarStatusProcesso(phone, cliente);
}

async function mostrarStatusProcesso(phone, cliente) {
    const primeiroNome = obterNomeExibicao(cliente.nome);
    let etapaAtual = cliente.etapa_atual || cliente.status || 'lead';
    const statusLabels = {
        'lead': '📋 Cadastro iniciado - aguardando formulário',
        'formulario_solicitado': '📋 Formulário DS-160 enviado para você',
        'formulario_enviado': '📋 Formulário recebido - em análise',
        'em_analise': '🔍 Em análise pela equipe',
        'analise_correcoes': '📝 Aguardando correções no formulário',
        'processo_aberto': '📌 Processo aberto - aguardando agendamento',
        'boleto_emitido': '💰 Boleto emitido - aguardando pagamento',
        'boleto_pago': '✅ Boleto pago - aguardando agendamento',
        'agendado_casv': '📅 CASV agendado',
        'agendado_entrevista': '🎤 Entrevista agendada',
        'treinamento_agendado': '🎯 Treinamento agendado',
        'treinamento_realizado': '✅ Treinamento concluído',
        'entrevista_realizada': '🎤 Entrevista realizada - aguardando decisão',
        'visto_aprovado': '🎉 Visto APROVADO!',
        'visto_recusado': '😔 Visto recusado - vamos analisar juntos',
        'passaporte_retornado': '📦 Passaporte disponível para retirada'
    };
    const label = statusLabels[etapaAtual] || etapaAtual;
    const dataAtualizacao = cliente.updated_at || cliente.data_atualizacao || new Date().toISOString();
    const dataFormatada = new Date(dataAtualizacao).toLocaleDateString('pt-BR');
    let mensagem = `📊 *Olá ${primeiroNome}!*\n\n📍 *Status do seu processo:* ${label}\n📅 *Última atualização:* ${dataFormatada}`;
    if (etapaAtual === 'agendado_casv' || etapaAtual === 'agendado_entrevista') {
        const { data: etapaData } = await supabase
            .from('etapas_processo')
            .select('dados_casv, dados_entrevista')
            .eq('cliente_telefone', phone)
            .maybeSingle();
        if (etapaData) {
            if (etapaData.dados_casv?.data) mensagem += `\n\n📅 *CASV:* ${etapaData.dados_casv.data} às ${etapaData.dados_casv.hora || '--:--'}`;
            if (etapaData.dados_entrevista?.data) mensagem += `\n🎤 *Entrevista:* ${etapaData.dados_entrevista.data} às ${etapaData.dados_entrevista.hora || '--:--'}`;
        }
    }
    mensagem += `\n\n💪 *Estamos acompanhando seu caso!*\n\n📌 *O que você gostaria de fazer?*\n1️⃣ - Ver status novamente\n2️⃣ - Informações sobre o processo\n3️⃣ - Falar com especialista\n\n0️⃣ - Menu principal\n\nDigite o número da opção (1-3) ou *0* para o menu principal.`;
    await enviarWhatsApp(phone, mensagem);
}

// 10.3. PROCESSAR LEAD (com cadastro)
async function processarLead(phone, message, cliente) {
    const primeiroNome = obterNomeExibicao(cliente.nome);
    const msg = message.trim().toLowerCase();
    
    // 🔥 VERIFICA SE ESTÁ EM SUBMENU (USANDO O userState)
    const state = userState.get(phone);
    if (state && state.nivel === 'submenu' && state.service) {
        await processarOpcaoNoSubmenu(phone, msg, state);
        return;
    }
    
    // Se digitar 0 ou menu, mostra menu principal
    if (msg === 'menu' || msg === '0') {
        const menu = await getMenuPrincipal();
        await enviarWhatsApp(phone, menu);
        return;
    }
    
    // Opção 1-7: Serviços do menu principal
    const servicoMap = {
        '1': 'visto_americano',
        '2': 'visto_canadense',
        '3': 'visto_australiano',
        '4': 'eta_uk',
        '5': 'eta_canadense',
        '6': 'passaporte',
        '7': 'ajuda_contato'
    };
    
    if (servicoMap[msg]) {
        const serviceKey = servicoMap[msg];
        if (serviceKey === 'ajuda_contato') {
            await enviarWhatsApp(phone, `📞 *Olá ${primeiroNome}!* Precisa de ajuda? 👇\n\n👨‍💼 *Fale com nossa equipe:* wa.me/5521974601812\n📧 contato@getvisa.com.br\n🌐 getvisa.com.br\n📋 https://app.getvisa.com.br/formulario-ds160\n\nDigite 0 para o MENU principal`);
            return;
        }
        
        // 🔥 SALVA O ESTADO DE SUBMENU
        let userStateData = userState.get(phone) || {};
        userStateData.nivel = 'submenu';
        userStateData.service = serviceKey;
        userStateData.nome = cliente.nome;
        userState.set(phone, userStateData);
        
        const submenu = getSubmenu(serviceKey);
        await enviarWhatsApp(phone, submenu);
        return;
    }
    
    // 🔥 SE NÃO FOR OPÇÃO VÁLIDA, DETECTA INTENÇÃO
    const intencao = detectarIntencao(message);
    if (intencao && intencao !== 'desconhecida') {
        const resposta = gerarRespostaBot(intencao, cliente.nome, null);
        await enviarWhatsApp(phone, resposta);
        return;
    }
    
    // Fallback: mostra menu principal
    const menu = await getMenuPrincipal();
    await enviarWhatsApp(phone, menu);
}

// 10.4. PROCESSAR OPÇÃO NO SUBMENU
async function processarOpcaoNoSubmenu(phone, message, state) {
    const service = state.service;
    const nomeCliente = state.nome ? ', ' + state.nome.split(' ')[0] : '';
    const opcoes = { '1':'preco','2':'prazo','3':'documentos','4':'processo','5':'especial','6':'avaliacao','7':'especialista' };
    if (opcoes[message]) {
        const op = message;
        switch(op) {
            case '1': {
                const resposta = getRespostaSubmenu(service, 'preco');
                await enviarWhatsApp(phone, resposta + '\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal');
                break;
            }
            case '2': {
                const resposta = getRespostaSubmenu(service, 'prazo');
                await enviarWhatsApp(phone, resposta + '\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal');
                break;
            }
            case '3': {
                const resposta = getRespostaSubmenu(service, 'documentos');
                await enviarWhatsApp(phone, resposta + '\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal');
                break;
            }
            case '4': {
                const resposta = getRespostaSubmenu(service, 'processo');
                await enviarWhatsApp(phone, resposta + '\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal');
                break;
            }
            case '5': {
                if (service === 'passaporte') {
                    const msg = '🏛️ **ONDE FAZER O PASSAPORTE**\n\nO passaporte é emitido pela Polícia Federal. O processo é digitalizado e exige agendamento prévio.\n\n🔗 **Site Oficial:** <a href="https://www.gov.br/pf/pt-br/assuntos/passaporte" target="_blank">https://www.gov.br/pf/pt-br/assuntos/passaporte</a>\n\n📋 **Etapas Principais:**\n1. Preencher o Formulário\n2. Pagar a Taxa (R$ 257,25)\n3. Agendar Atendimento\n4. Comparecer à Unidade\n5. Consultar Andamento\n6. Receber Passaporte\n\n💡 Agende com antecedência!\n\n📌 ' + nomeCliente + ' - Você está em: PASSAPORTE\nDigite outra opção (1-7) ou 0 para menu principal';
                    await enviarWhatsApp(phone, msg);
                } else {
                    const msg = '🔄 VISTO NEGADO - RECUPERAÇÃO\n\nTeve o visto negado? Não desanime!\n\n🔗 Análise gratuita: <a href="https://getvisa.com.br/visto-americano-negado/" target="_blank">https://getvisa.com.br/visto-americano-negado/</a>\n\n✅ Oferecemos:\n• Análise do motivo da negativa\n• Correção do formulário\n• Documentação reforçada\n• Preparação para entrevista\n\n💰 Investimento: R$ 380\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal';
                    await enviarWhatsApp(phone, msg);
                }
                break;
            }
            case '6': {
                const links = {
                    'visto_americano': 'https://getvisa.com.br/simulador-visto-americano/',
                    'visto_canadense': 'https://getvisa.com.br/simulador-visto-canadense/',
                    'visto_australiano': 'https://getvisa.com.br/simulador-visto-australiano/',
                    'eta_uk': 'https://getvisa.com.br/simulador-eta-uk/',
                    'eta_canadense': 'https://getvisa.com.br/simulador-eta-canadense/',
                    'passaporte': 'https://getvisa.com.br/formulario-passaporte/'
                };
                const link = links[service] || 'https://getvisa.com.br/simulador-visto-americano/';
                const msg = '📋 AVALIAÇÃO GRATUITA - ' + getServiceName(service).toUpperCase() + '\n\n🔗 Acesse: <a href="' + link + '" target="_blank">' + link + '</a>\n\n⏱️ Leva menos de 2 minutos!\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal';
                await enviarWhatsApp(phone, msg);
                break;
            }
            case '7': {
                const msg = '👨‍💼 FALAR COM ESPECIALISTA - ' + getServiceName(service).toUpperCase() + '\n\nNossa equipe está pronta e estou aqui para ajudar' + nomeCliente + '!\n\n📱 WhatsApp: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n📧 E-mail: contato@getvisa.com.br\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal';
                await enviarWhatsApp(phone, msg);
                break;
            }
        }
        return;
    }

    // Detectar intenção
    const intencao = detectarIntencao(message);
    if (intencao === 'solicitar_ds160' || intencao === 'iniciar_processo') {
        const msg = getMensagemFormularioComEspecialista(state.nome || 'Cliente');
        await enviarWhatsApp(phone, msg);
        await supabase.from('clientes').update({ status: 'formulario_solicitado', updated_at: new Date().toISOString() }).eq('telefone', phone);
        state.nivel = 'principal';
        state.service = null;
        userState.set(phone, state);
        return;
    }
    if (intencao && intencao !== 'desconhecida') {
        const resposta = gerarRespostaBot(intencao, state.nome, null);
        await enviarWhatsApp(phone, resposta);
        return;
    }

    // Fallback
    const erroMsg = '❌ Opção inválida' + nomeCliente + '!\n\nVocê está no menu: ' + getServiceName(service).toUpperCase() + '\n\nOpções disponíveis:\n' + getSubmenu(service) + '\n\n💡 Para escolher outro serviço, digite 0 primeiro.';
    await enviarWhatsApp(phone, erroMsg);
}

// 10.5. PROCESSAR MENSAGEM PRINCIPAL (PONTO DE ENTRADA)
async function processarMensagem(phone, message) {
    console.log(`📨 processarMensagem: ${phone} -> "${message}"`);
    const telefoneLimpo = limparTelefone(phone);
    if (!telefoneLimpo || telefoneLimpo.length < 10) {
        console.log(`⚠️ Telefone inválido: ${telefoneLimpo}`);
        return;
    }

    // Buscar cliente no banco
    let cliente = null;
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        if (!error && data) cliente = data;
    } catch (err) {}

    // Contato pessoal: não responde
    if (cliente && cliente.tipo_contato === 'contato_pessoal') {
        console.log(`🔇 Contato pessoal ${telefoneLimpo} - silêncio`);
        return;
    }

    // Cliente com processo
    if (cliente && (cliente.tipo_contato === 'cliente' || ['formulario_enviado','agendado_casv','cliente'].includes(cliente.status))) {
        await processarClienteExistente(telefoneLimpo, message, cliente);
        return;
    }

    // Lead existente
    if (cliente && cliente.tipo_contato === 'lead') {
        await processarLead(telefoneLimpo, message, cliente);
        return;
    }

    // Novo contato: iniciar triagem
    let state = userState.get(telefoneLimpo);
    if (!state) {
        state = { step: TRIAGEM_STEPS.PERGUNTAR_TIPO, tipo: null, nome: null, email: null, lastActivity: Date.now() };
        userState.set(telefoneLimpo, state);
    }
    await gerenciarTriagem(telefoneLimpo, message, state);
}

// ============================================================
// 11. FUNÇÕES DE GERAÇÃO DE PDF (DS-160)
// ============================================================
async function gerarPDF_DS160(dados) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fontSize(18).fillColor('#003366').text('Formulário DS-160 - GetVisa Assessoria', { align: 'center' });
        doc.moveDown();

        // MAPEAMENTO DE CAMPOS
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
            'Viagens Anteriores (datas)': Array.isArray(dados['us_travel_date[]']) ? dados['us_travel_date[]'].filter(Boolean).join(', ') : (dados['us_travel_date[]'] || ''),
            'Duração das Viagens (dias)': Array.isArray(dados['us_travel_duration[]']) ? dados['us_travel_duration[]'].filter(Boolean).join(', ') : (dados['us_travel_duration[]'] || ''),
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
            'E-mails Adicionais': Array.isArray(dados['emails_extra[]']) ? dados['emails_extra[]'].filter(Boolean).join(', ') : (dados['emails_extra[]'] || ''),
            'Redes Sociais': Array.isArray(dados['social_plataforma[]']) && Array.isArray(dados['social_identificador[]']) ? dados['social_plataforma[]'].map((p,i) => `${p}: ${dados['social_identificador[]'][i] || ''}`).filter(Boolean).join('; ') : (dados['social_plataforma[]'] || ''),
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
            'Detalhes dos Parentes Diretos': Array.isArray(dados['immediate_relative_name[]']) ? dados['immediate_relative_name[]'].map((n,i) => `${n} (${dados['immediate_relative_relationship[]']?.[i] || ''} - ${dados['immediate_relative_status[]']?.[i] || ''})`).filter(Boolean).join('; ') : (dados['immediate_relative_name[]'] || ''),
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
            'Outras Ocupações': Array.isArray(dados['other_employer_name[]']) ? dados['other_employer_name[]'].filter(Boolean).join('; ') : (dados['other_employer_name[]'] || ''),
            'Empregos Anteriores': Array.isArray(dados['prev_employer_name[]']) ? dados['prev_employer_name[]'].filter(Boolean).join('; ') : (dados['prev_employer_name[]'] || ''),
            'Cursos/Educação': Array.isArray(dados['edu_institution[]']) ? dados['edu_institution[]'].filter(Boolean).join('; ') : (dados['edu_institution[]'] || ''),
            'Idiomas (além do Português)': Array.isArray(dados['languages[]']) ? dados['languages[]'].filter(Boolean).join(', ') : (dados['languages[]'] || ''),
            'Países Visitados (últimos 5 anos)': Array.isArray(dados['traveled_countries[]']) ? dados['traveled_countries[]'].filter(Boolean).join(', ') : (dados['traveled_countries[]'] || ''),
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

        function writeSection(title, campos) {
            doc.moveDown(1);
            doc.fontSize(14).fillColor('#003366').text(title, { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#000000');
            let has = false;
            for (const [label, value] of Object.entries(campos)) {
                if (value && value !== '' && value !== 'Não informado') {
                    has = true;
                    doc.text(`• ${label}: ${value}`);
                }
            }
            if (!has) doc.text('(Nenhuma informação preenchida)');
        }

        const secoes = {
            'Dados Pessoais': ['Consulado/Embaixada','Nome Completo','Outros Sobrenomes','Gênero','Estado Civil','Data de Nascimento','Cidade de Nascimento','Estado/Província de Nascimento','País de Nascimento','Outra Nacionalidade','Residente Permanente de outro país','CPF','SSN (Seguro Social EUA)','Tax ID (ITIN)'],
            'Informacoes da Viagem': ['Propósito da Viagem','Data de Chegada nos EUA','Locais a Visitar','Responsável pelo Pagamento','Nome do Pagador','Endereço do Pagador','Cidade do Pagador','Estado do Pagador','CEP do Pagador','País do Pagador','Telefone do Pagador','Email do Pagador'],
            'Acompanhantes': ['Acompanhantes','Relação dos Acompanhantes','Nome do Grupo'],
            'Viagens Anteriores e Vistos': ['Já esteve nos EUA','Viagens Anteriores (datas)','Duração das Viagens (dias)','Possui Carteira de Habilitação dos EUA','Número da Habilitação','Estado da Habilitação','Já teve visto americano','Data da Última Emissão do Visto','Número do Visto','Mesmo tipo de visto','Mesmo país/cidade da última aplicação','Impressões digitais coletadas','Visto cancelado/revogado','Visto negado/entrada negada','Petição de imigração'],
            'Endereco e Contato': ['Endereço Residencial','Cidade','Estado/Província','CEP','País','Telefone Principal','Telefone Secundário','Telefone do Trabalho','Telefones Adicionais','E-mail Principal','E-mails Adicionais','Redes Sociais','Presença Adicional em Redes Sociais'],
            'Passaporte': ['Número do Passaporte','País/Autoridade Emissora','Cidade de Emissão','Estado de Emissão','Data de Emissão','Data de Validade','Passaporte Perdido/Roubado','Número do BO/Observações','Número do Passaporte Perdido','Data do Ocorrido','Local do Ocorrido'],
            'Contato nos EUA': ['Pessoa de Contato nos EUA','Organização nos EUA','Relação com o Contato','Endereço nos EUA','Telefone nos EUA','Email nos EUA'],
            'Informacoes Familiares': ['Nome do Pai','Data de Nascimento do Pai','Pai nos EUA','Situação do Pai nos EUA','Nome da Mãe','Data de Nascimento da Mãe','Mãe nos EUA','Situação da Mãe nos EUA','Detalhes dos Parentes Diretos','Outros Parentes nos EUA','Nome do Cônjuge/Ex-Cônjuge','Data de Nascimento do Cônjuge','Nacionalidade do Cônjuge','Cidade de Nascimento do Cônjuge','País de Nascimento do Cônjuge','Endereço do Cônjuge','Cidade do Cônjuge','Estado do Cônjuge','CEP do Cônjuge','País do Cônjuge'],
            'Trabalho e Educacao': ['Ocupação Principal','Empregador/Instituição','Endereço do Empregador','Cidade do Empregador','Estado do Empregador','CEP do Empregador','Telefone do Empregador','Data de Início no Emprego','Renda Mensal','Descrição das Funções','Outras Ocupações','Empregos Anteriores','Cursos/Educação','Idiomas (além do Português)','Países Visitados (últimos 5 anos)','Treinamento Especializado','Serviço Militar','Ramo Militar','Patente Militar','Especialidade Militar','Data de Início no Serviço Militar','Data de Saída do Serviço Militar'],
            'Seguranca': ['Preso ou Condenado','Deportado']
        };

        for (const [titulo, campos] of Object.entries(secoes)) {
            const filtered = {};
            for (const campo of campos) {
                if (todosCampos[campo]) filtered[campo] = todosCampos[campo];
            }
            writeSection(titulo, filtered);
            doc.moveDown(0.5);
        }
        doc.end();
    });
}

// ============================================================
// 12. ROTAS DA API
// ============================================================

// 12.1. ADMIN LOGIN (pública)
app.post('/api/admin/login', (req, res) => {
    const { apiKey } = req.body;
    const validKey = 'admin123';
    if (!apiKey) return res.status(400).json({ success: false, message: 'Chave não informada.' });
    if (apiKey === validKey) return res.json({ success: true, message: 'Login autorizado' });
    return res.status(401).json({ success: false, message: 'Chave inválida.' });
});

// 12.2. ROTAS PROTEGIDAS (admin)
app.get('/admin.html', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'admin.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.send('<h1>🔐 Admin Panel</h1><p>Arquivo admin.html não encontrado.</p>');
});

app.get('/painel.html', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'painel-clientes.html');
    if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(p);
    } else res.send('<h1>📊 Painel</h1><p>Arquivo painel-clientes.html não encontrado.</p>');
});

app.get('/painel', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'painel-clientes.html');
    if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(p);
    } else {
        const fallback = path.join(__dirname, 'public', 'painel-novo.html');
        if (fs.existsSync(fallback)) res.sendFile(fallback);
        else res.status(404).send('<h1>📊 Painel de Clientes</h1><p>Nenhum arquivo encontrado.</p>');
    }
});

app.get('/painel-antigo', auth.verificarAdmin, (req, res) => res.redirect('/painel'));
app.get('/dashboard-antigo', auth.verificarAdmin, (req, res) => res.redirect('/painel'));

app.get('/login', (req, res) => {
    const p = path.join(__dirname, 'public', 'login.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.send(`
        <h1>🔐 GetVisa - Login</h1>
        <form action="/api/admin/login" method="POST">
            <input type="password" name="apiKey" placeholder="Digite sua chave">
            <button type="submit">Entrar</button>
        </form>
        <p>Use a chave: <strong>admin123</strong></p>
    `);
});

app.get('/', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.redirect('/admin-login.html');
});

app.get('/dashboard', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'dashboard-novo.html');
    if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(p);
    } else {
        const f = path.join(__dirname, 'public', 'dashboard.html');
        if (fs.existsSync(f)) res.sendFile(f);
        else res.status(404).send('<h1>📊 Dashboard</h1><p>Arquivo não encontrado.</p>');
    }
});

app.get('/agendamentos', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'admin-login.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('<h1>📅 Agendamentos</h1><p>Arquivo admin-login.html não encontrado.</p>');
});

// 12.3. FORMULÁRIO DS-160
app.get('/formulario-ds160', (req, res) => {
    const p = path.join(__dirname, 'public', 'formulario-ds160.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('<h1>Formulário não encontrado</h1>');
});

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

app.post('/api/submit-ds160', async (req, res) => {
    console.log('🔔 Rota /api/submit-ds160 chamada!');
    try {
        const formData = req.body;
        const { full_name, email, telefone, consulado } = extractFormFields(formData);
        let nomeValido = full_name || formData.nome_completo || formData.fullName || '';
        let emailValido = email || formData['email-1'] || '';
        let telefoneValido = telefone || formData['text-77'] || '';
        if (!nomeValido || !emailValido || !telefoneValido) {
            return res.status(400).json({ success: false, message: 'Nome, email e telefone são obrigatórios.' });
        }
        const cleanPhone = limparTelefone(telefoneValido);
        if (!cleanPhone) return res.status(400).json({ success: false, message: 'Número de telefone inválido.' });

        // Salvar cliente
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
        console.log('✅ Cliente salvo:', clienteData);

        // Salvar formulário
        const { data: formExistente } = await supabase
            .from('form_ds160')
            .select('id, id_cliente')
            .eq('id_cliente', clienteData.id)
            .maybeSingle();
        if (formExistente) {
            await supabase.from('form_ds160').update({ dados_formulario: formData, status: 'rascunho', updated_at: new Date().toISOString() }).eq('id', formExistente.id);
        } else {
            await supabase.from('form_ds160').insert({ id_cliente: clienteData.id, dados_formulario: formData, status: 'rascunho', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }

        // Enviar confirmação para o cliente
        try {
            const primeiroNome = nomeValido.split(' ')[0];
            const mensagemWhats = `🎉 *Olá ${primeiroNome}!*\n\nRecebemos seu formulário DS-160 com sucesso! ✅\n\n📋 *Dados recebidos:*\n👤 Nome: ${nomeValido}\n📧 Email: ${emailValido}\n📱 Telefone: ${cleanPhone}\n🏛️ Consulado: ${consulado || 'Não informado'}\n\n⏳ *Próximos passos:*\n1️⃣ Nossa equipe fará a análise dos dados\n2️⃣ Você receberá a confirmação por e-mail\n3️⃣ Iniciaremos o agendamento da entrevista\n\n📱 Dúvidas? Fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)\n\n🌟 *GetVisa Assessoria - Seu visto americano com segurança!* 🇺🇸`;
            await enviarWhatsApp(cleanPhone, mensagemWhats);
        } catch (whatsError) { console.error('❌ Erro ao enviar notificação WhatsApp:', whatsError); }

        // Gerar PDF e enviar e-mails
        let pdfBuffer = null;
        try {
            const { data: formDataSaved, error: formError } = await supabase.from('form_ds160').select('*').eq('id_cliente', clienteData.id).maybeSingle();
            if (!formError && formDataSaved) {
                const dadosParaPDF = formDataSaved.dados_formulario || formDataSaved;
                pdfBuffer = await gerarPDF_DS160(dadosParaPDF);
            }
        } catch (pdfError) { console.error('❌ Erro ao gerar PDF:', pdfError); }

        // E-mail para equipe
        try {
            const emailEquipe = process.env.EMAIL_DESTINO_EQUIPE || 'contato@getvisa.com.br';
            const emailOptions = {
                from: 'GetVisa <contato@getvisa.com.br>',
                to: emailEquipe,
                subject: `🆕 Novo formulário DS-160 - ${nomeValido}`,
                html: `<h2>📋 Novo formulário DS-160 recebido!</h2><p><strong>👤 Nome:</strong> ${nomeValido}</p><p><strong>📱 Telefone:</strong> ${cleanPhone}</p><p><strong>📧 E-mail:</strong> ${emailValido}</p><p><strong>🏛️ Consulado:</strong> ${consulado || 'Não informado'}</p><p><strong>📅 Data:</strong> ${new Date().toLocaleString('pt-BR')}</p><hr><p>📌 <strong>PDF em anexo</strong> com todos os dados do formulário.</p><p>📱 Entre em contato com o cliente para dar início ao processo.</p><p>🗂️ Acesse o painel: https://app.getvisa.com.br/painel</p>`
            };
            if (pdfBuffer) {
                emailOptions.attachments = [{ filename: `DS160_${nomeValido.replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.pdf`, content: pdfBuffer.toString('base64') }];
            }
            await resend.emails.send(emailOptions);
        } catch (emailError) { console.error('❌ Erro ao enviar e-mail para equipe:', emailError); }

        // E-mail para cliente
        try {
            if (emailValido && emailValido.trim()) {
                const primeiroNome = nomeValido.split(' ')[0];
                const emailOptionsCliente = {
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: emailValido,
                    subject: `📋 Seu formulário DS-160 - ${nomeValido}`,
                    html: `<h2>✅ Olá ${primeiroNome}!</h2><p>Recebemos seu formulário DS-160 com sucesso!</p><p><strong>📅 Data de envio:</strong> ${new Date().toLocaleString('pt-BR')}</p><hr><p><strong>📌 Próximos passos:</strong></p><ol><li><strong>Revise o PDF em anexo</strong> – confira se todos os dados estão corretos.</li><li><strong>Aguardar contato da nossa equipe</strong> – em até 24h entraremos em contato.</li><li><strong>Iniciaremos o agendamento</strong> da entrevista no Consulado.</li></ol><hr><p>🔗 <strong>Acesse nosso site:</strong> <a href="https://getvisa.com.br">getvisa.com.br</a></p><p>📱 <strong>Fale conosco:</strong> <a href="https://wa.me/5521974601812">WhatsApp</a></p><p style="color:#666;font-size:12px;">Este e-mail foi enviado automaticamente. Por favor, não responda.</p>`
                };
                if (pdfBuffer) {
                    emailOptionsCliente.attachments = [{ filename: `DS160_${nomeValido.replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}.pdf`, content: pdfBuffer.toString('base64') }];
                }
                await resend.emails.send(emailOptionsCliente);
            }
        } catch (emailClienteError) { console.error('❌ Erro ao enviar e-mail para cliente:', emailClienteError); }

        // Aviso equipe via WhatsApp
        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, `📋 *NOVO FORMULÁRIO DS-160 RECEBIDO!*\n\n👤 Nome: ${nomeValido}\n📱 Telefone: ${cleanPhone}\n📧 Email: ${emailValido}\n🏛️ Consulado: ${consulado || 'Não informado'}\n\n📱 Entre em contato com o cliente para dar início ao processo.`);
        } catch (err) {}

        res.json({ success: true, message: 'Formulário recebido com sucesso!', data: { nome: nomeValido, email: emailValido, telefone: cleanPhone } });
    } catch (error) {
        console.error('❌ Erro ao processar formulário:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar formulário', error: error.message });
    }
});

// 12.4. ROTAS DE AGENDAMENTOS (upload PDF)
app.post('/api/agendamentos/upload-pdf', uploadMemory.single('pdfFile'), async (req, res) => {
    console.log('🔥 ROTA /api/agendamentos/upload-pdf CHAMADA!');
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ success: false, message: 'Apenas arquivos PDF são permitidos' });
        const telefone = req.body.telefone || '21985234917';
        if (!telefone || telefone.length < 10) return res.status(400).json({ success: false, message: 'Telefone inválido' });

        const agendamentoService = require('./services/agendamentoService');
        const resultado = await agendamentoService.extractAndSavePdfAgendamentos(req.file.buffer, telefone, { enviarWhatsApp: false });
        if (!resultado.success) return res.status(400).json(resultado);

        const { data: cliente, error: clienteError } = await supabase.from('clientes').select('nome, email, telefone').eq('telefone', telefone).maybeSingle();
        if (clienteError || !cliente) return res.status(404).json({ success: false, message: 'Cliente não encontrado' });

        let casv = resultado.dados?.casv || {};
        let entrevista = resultado.dados?.entrevista || {};

        // Tentar extrair dados do PDF se não vierem do serviço
        if ((!casv.data || casv.data === 'A definir') || (!entrevista.data || entrevista.data === 'A definir')) {
            try {
                const pdfText = req.file.buffer.toString('utf8');
                const dataPattern = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
                const datas = pdfText.match(dataPattern) || [];
                const horaPattern = /(\d{1,2}:\d{2})/g;
                const horas = pdfText.match(horaPattern) || [];
                const localPattern = /Consulado\s+Americano\s*[-–]\s*([^\n]+)/gi;
                const localMatch = localPattern.exec(pdfText);
                if (datas.length >= 2) {
                    if (!casv.data || casv.data === 'A definir') casv.data = datas[0];
                    if (!entrevista.data || entrevista.data === 'A definir') entrevista.data = datas[1];
                } else if (datas.length === 1) {
                    if (!casv.data || casv.data === 'A definir') casv.data = datas[0];
                }
                if (horas.length >= 2) {
                    if (!casv.hora || casv.hora === 'A definir') casv.hora = horas[0];
                    if (!entrevista.hora || entrevista.hora === 'A definir') entrevista.hora = horas[1];
                } else if (horas.length === 1) {
                    if (!casv.hora || casv.hora === 'A definir') casv.hora = horas[0];
                }
                if (localMatch) {
                    const local = localMatch[1].trim();
                    if (!casv.local || casv.local === 'A definir') casv.local = `Consulado Americano - ${local}`;
                    if (!entrevista.local || entrevista.local === 'A definir') entrevista.local = `Consulado Americano - ${local}`;
                }
                const protocolPattern = /(?:DS-160|DS160|Protocolo)[:\s]+([A-Z0-9]+)/gi;
                const protocolMatch = protocolPattern.exec(pdfText);
                if (protocolMatch) req.protocolo = protocolMatch[1].trim();
            } catch (textError) {}
        }

        // Salvar etapa
        await supabase.from('etapas_processo').upsert({
            cliente_telefone: telefone,
            etapa_atual: 'agendado_casv',
            data_agendado_casv: new Date().toISOString(),
            dados_casv: casv,
            dados_entrevista: entrevista,
            protocolo_ds160: req.protocolo || null,
            data_atualizacao: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'cliente_telefone' });

        // Enviar e-mail com PDF
        let emailEnviado = false;
        if (cliente.email) {
            try {
                const emailOptions = {
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: cliente.email,
                    subject: `📋 Confirmação de Agendamento - ${cliente.nome}`,
                    html: `<h2>✅ Olá ${cliente.nome}!</h2><p>Seus agendamentos foram confirmados!</p><h3>📍 CASV (Coleta Biométrica)</h3><p><strong>📅 Data:</strong> ${casv.data || 'A definir'}</p><p><strong>⏰ Horário:</strong> ${casv.hora || 'A definir'}</p><p><strong>📍 Local:</strong> ${casv.local || 'A definir'}</p><h3>📍 ENTREVISTA NO CONSULADO</h3><p><strong>📅 Data:</strong> ${entrevista.data || 'A definir'}</p><p><strong>⏰ Horário:</strong> ${entrevista.hora || 'A definir'}</p><p><strong>📍 Local:</strong> ${entrevista.local || 'A definir'}</p>${req.protocolo ? `<p><strong>📋 Protocolo DS-160:</strong> ${req.protocolo}</p>` : ''}<hr><p><strong>⚠️ IMPORTANTE:</strong></p><ul><li>Leve a <strong>CONFIRMATION IMPRESSA</strong></li><li>Leve seu <strong>PASSAPORTE(S)</strong></li><li>Chegue com 30 minutos de antecedência</li></ul><p>📎 Em anexo o PDF oficial do agendamento.</p><p>🌟 Boa sorte! Estamos com você!</p>`,
                    attachments: [{ filename: `Agendamento_${cliente.nome.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`, content: req.file.buffer.toString('base64') }]
                };
                await resend.emails.send(emailOptions);
                emailEnviado = true;
            } catch (e) {}
        }

        // Enviar WhatsApp com lista de membros e dados
        let whatsEnviado = false;
        try {
            const todosMembros = resultado.dados?.todosMembros || [];
            let mensagem = `✅ *AGENDAMENTOS CONFIRMADOS - GETVISA*\n\nOlá *${cliente.nome.split(' ')[0]}*! Seus agendamentos foram realizados com sucesso!`;
            if (todosMembros.length) {
                mensagem += `\n\n👨‍👩‍👧‍👦 *Membros da família:*\n`;
                todosMembros.forEach((m, i) => mensagem += `   ${i+1}️⃣ ${m}\n`);
            }
            if (req.protocolo) mensagem += `\n📋 *Protocolo DS-160:* ${req.protocolo}`;
            mensagem += `\n\n📍 *CASV (Coleta Biométrica):*\n📅 ${casv.data || 'A definir'}\n⏰ ${casv.hora || 'A definir'}\n📍 ${casv.local || 'A definir'}\n\n📍 *ENTREVISTA NO CONSULADO:*\n📅 ${entrevista.data || 'A definir'}\n⏰ ${entrevista.hora || 'A definir'}\n📍 ${entrevista.local || 'A definir'}\n\n⚠️ *IMPORTANTE:*\n• Leve a *CONFIRMATION IMPRESSA*\n• Leve seu *PASSAPORTE(S)*\n• Chegue com 30 minutos de antecedência\n\n📎 O PDF oficial foi enviado para seu e-mail.\n\n📱 Dúvidas? [Fale com nosso especialista](https://wa.me/5521974601812)\n\n🌟 *Boa sorte! Estamos com você!*`;
            await enviarWhatsApp(telefone, mensagem);
            whatsEnviado = true;
        } catch (e) {}

        // Atualizar status
        await supabase.from('clientes').update({ status: 'agendado_casv', updated_at: new Date().toISOString() }).eq('telefone', telefone);

        res.json({ success: true, message: 'PDF processado e enviado com sucesso!', data: { casv, entrevista, protocolo: req.protocolo || null, comunicacoes: { email: emailEnviado, whatsapp: whatsEnviado } } });
    } catch (error) {
        console.error('❌ Erro no upload do PDF:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar PDF', error: error.message });
    }
});

// 12.5. WEBHOOK Z-API
app.post('/api/webhook/zapi', async (req, res) => {
    res.status(200).send('OK');
    (async () => {
        try {
            const telefone = req.body.phone || req.body.from || '';
            const mensagem = req.body.text?.message || req.body.message || req.body.text || '';
            if (!telefone || !mensagem) return;
            const telefoneLimpo = limparTelefone(telefone);
            if (telefoneLimpo) await processarMensagem(telefoneLimpo, mensagem);
        } catch (err) { console.error('❌ Erro no webhook:', err); }
    })();
});

// 12.6. ROTAS DE VISTO NEGADO
app.post('/api/visto-negado', async (req, res) => {
    try {
        const dados = req.body;
        const { nome, email, telefone, quando_negado, motivo_negativa, mudanca_profissional, fortaleceu_vinculos, falha_ds160, problemas_imigracao, observacoes, score } = dados;
        let classificacao = {};
        if (score < 35) classificacao = { tipo: 'urgente', titulo: '⚠️ Seu caso requer atenção urgente!', mensagem: 'Seu perfil apresenta pontos críticos...' };
        else if (score < 65) classificacao = { tipo: 'moderado', titulo: '💡 Potencial Moderado de Sucesso!', mensagem: 'Seu perfil tem pontos positivos...' };
        else classificacao = { tipo: 'forte', titulo: '✅ Forte Potencial de Reversão!', mensagem: 'Parabéns! Seu perfil demonstra um forte potencial...' };

        const { data: avaliacao, error } = await supabase
            .from('form_visto_negado')
            .insert({ nome, email, telefone, quando_negado, motivo_negativa, mudanca_profissional, fortaleceu_vinculos, falha_ds160, problemas_imigracao, observacoes, score, classificacao_tipo: classificacao.tipo, classificacao_titulo: classificacao.titulo, classificacao_mensagem: classificacao.mensagem, created_at: new Date().toISOString() })
            .select()
            .single();
        if (error) return res.status(500).json({ success: false, error: error.message });

        const telefoneLimpo = telefone ? telefone.replace(/\D/g,'') : null;
        if (telefoneLimpo && telefoneLimpo.length >= 10) {
            const { data: existente } = await supabase.from('clientes').select('telefone').eq('telefone', telefoneLimpo).maybeSingle();
            if (existente) {
                await supabase.from('clientes').update({ nome: nome || existente.nome, email: email || existente.email, status: 'visto_negado', updated_at: new Date().toISOString() }).eq('telefone', telefoneLimpo);
            } else {
                await supabase.from('clientes').insert({ telefone: telefoneLimpo, nome: nome || 'Cliente', email: email || '', status: 'visto_negado', data_contato: new Date().toISOString(), onboarding_completo: true });
            }
        }

        // Notificações
        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, `🔔 *NOVA AVALIAÇÃO DE VISTO NEGADO!*\n\n👤 Nome: ${nome || 'Não informado'}\n📱 Telefone: ${telefone || 'Não informado'}\n📧 Email: ${email || 'Não informado'}\n📊 Score: ${score || 0}/100\n🏷️ Classificação: ${classificacao.titulo}\n\n🔗 Acesse o painel para mais detalhes.`);
        } catch (e) {}
        if (telefoneLimpo) {
            const primeiroNome = nome ? nome.split(' ')[0] : 'Cliente';
            let msgCliente = '';
            if (classificacao.tipo === 'urgente') msgCliente = `⚠️ *Olá ${primeiroNome}!* ⚠️\n\nRecebemos sua avaliação de visto negado.\n\n${classificacao.titulo}\n\n${classificacao.mensagem}\n\n📌 Nossa equipe já foi notificada e entrará em contato em até 24h.\n\n📱 Enquanto isso, fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)`;
            else if (classificacao.tipo === 'moderado') msgCliente = `💡 *Olá ${primeiroNome}!* 💡\n\nRecebemos sua avaliação de visto negado.\n\n${classificacao.titulo}\n\n${classificacao.mensagem}\n\n📌 Nossa equipe fará uma análise detalhada e entrará em contato em breve.\n\n📱 Fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)`;
            else msgCliente = `✅ *Olá ${primeiroNome}!* ✅\n\nRecebemos sua avaliação de visto negado.\n\n${classificacao.titulo}\n\n${classificacao.mensagem}\n\n📌 Nossa equipe fará uma análise completa e entrará em contato.\n\n📱 Continue acompanhando: [Fale com nosso especialista](https://wa.me/5521974601812)`;
            await enviarWhatsApp(telefoneLimpo, msgCliente);
        }
        res.json({ success: true, message: 'Avaliação recebida com sucesso!', data: avaliacao });
    } catch (error) {
        console.error('❌ Erro ao processar avaliação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/visto-negado', (req, res) => {
    const p = path.join(__dirname, 'public', 'visto-negado.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('<h1>Página não encontrada</h1>');
});

app.get('/obrigado-visto-negado', (req, res) => {
    const p = path.join(__dirname, 'public', 'obrigado-visto-negado.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('Página não encontrada');
});

app.get('/upload-casv-pdf', (req, res) => {
    const p = path.join(__dirname, 'public', 'upload-casv-pdf.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('<h1>📤 Página não encontrada</h1>');
});

// 12.7. ROTAS DE LISTAGEM (API)
app.get('/api/agendamentos', auth.verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase.from('agendamentos').select('*, clientes(nome, telefone)').order('data_agendamento', { ascending: true });
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, agendamentos: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/lembretes', auth.verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase.from('lembretes').select('*, clientes(nome, telefone)').order('data_disparo', { ascending: true });
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, lembretes: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 12.8. ROTAS DE ADMINISTRAÇÃO
app.post('/api/admin/regenerar-pdf', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const { telefone, email, enviar_whatsapp } = req.body;
        if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });
        const telefoneLimpo = limparTelefone(telefone);
        const { data: cliente, error } = await supabase.from('clientes_ativos').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (error || !cliente) return res.status(404).json({ error: 'Cliente não encontrado em clientes_ativos' });
        const { data: formulario, error: formError } = await supabase.from('formularios_ds160').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (formError || !formulario) return res.status(404).json({ error: 'Dados do formulário não encontrados.' });
        const pdfBuffer = await gerarPDF_DS160(formulario);
        if (email) {
            await resend.emails.send({ from: 'GetVisa <contato@getvisa.com.br>', to: [email], subject: 'PDF Regenerado - DS-160 ' + cliente.nome, html: '<strong>Olá!</strong><br><p>Segue o PDF regenerado.</p>', attachments: [{ filename: 'DS160_' + cliente.nome.replace(/[^a-z0-9]/gi,'_') + '.pdf', content: pdfBuffer.toString('base64') }] });
        }
        if (enviar_whatsapp) {
            await enviarPDFWhatsApp(telefoneLimpo, pdfBuffer, cliente.nome.split(' ')[0]);
        }
        res.json({ success: true, message: 'PDF regenerado com sucesso!' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/admin/buscar-formulario/:telefone', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const telefone = req.params.telefone;
        const telefoneLimpo = limparTelefone(telefone);
        const tabelas = ['formularios_ds160', 'clientes_ativos', 'clientes'];
        let dados = null, encontradoEm = null;
        for (const tabela of tabelas) {
            const { data, error } = await supabase.from(tabela).select('*').eq('telefone', telefoneLimpo).maybeSingle();
            if (!error && data) { dados = data; encontradoEm = tabela; break; }
        }
        if (!dados) return res.status(404).json({ error: 'Dados não encontrados' });
        res.json({ success: true, encontrado_em: encontradoEm, dados });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/clientes/finalizar', async (req, res) => {
    try {
        let telefone = req.body.telefone;
        let resultado = req.body.resultado || 'aprovado';
        let observacoes = req.body.observacoes || '';
        let servico = req.body.servico || 'Visto Americano';
        let email = req.body.email || '';
        if (!telefone) return res.status(400).json({ erro: 'Telefone é obrigatório' });
        const { data: cliente, error } = await supabase.from('clientes_ativos').select('*').eq('telefone', telefone).maybeSingle();
        if (error || !cliente) return res.status(404).json({ erro: 'Cliente não encontrado em clientes_ativos' });
        // Inserir em finalizados
        const { data: insertData, error: insertError } = await supabase.from('clientes_finalizados').insert({
            telefone: cliente.telefone, nome: cliente.nome, email: email || null, servico: servico,
            data_inicio: cliente.criado_em || new Date().toISOString(), data_finalizacao: new Date().toISOString(),
            observacoes: observacoes || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).select().single();
        if (insertError) {
            // Tentar update
            const { data: updateData, error: updateError } = await supabase.from('clientes_finalizados').update({
                servico, data_finalizacao: new Date().toISOString(), observacoes: observacoes || `Processo finalizado com ${resultado}`, updated_at: new Date().toISOString()
            }).eq('telefone', telefone).select().single();
            if (updateError) return res.status(500).json({ erro: updateError.message });
        }
        // Remover de outras tabelas
        await supabase.from('clientes_ativos').delete().eq('telefone', telefone);
        await supabase.from('clientes').delete().eq('telefone', telefone);
        await supabase.from('contatos_amigos').delete().eq('telefone', telefone);
        // Enviar mensagem
        const nomeCliente = cliente.nome.split(' ')[0] || 'Cliente';
        let msg = resultado === 'recusado' ? `😔 Olá ${nomeCliente}!\n\nInfelizmente seu visto foi recusado...` : `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\nSeu passaporte com o visto foi retornado!`;
        await enviarWhatsApp(telefone, msg);
        res.json({ success: true, message: `Cliente finalizado com ${resultado}` });
    } catch (error) { res.status(500).json({ erro: error.message }); }
});

app.post('/api/etapas/finalizar', async (req, res) => {
    try {
        let telefone = req.body.telefone;
        let etapaFinal = req.body.etapa_final || 'passaporte_retornado';
        let nota = req.body.nota || '';
        if (!telefone) return res.status(400).json({ sucesso: false, erro: 'Telefone é obrigatório' });
        const telefoneLimpo = limparTelefone(telefone);
        let { data: cliente, error } = await supabase.from('clientes_ativos').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (!cliente) {
            const f = formatarTelefone(telefoneLimpo);
            const { data: c } = await supabase.from('clientes_ativos').select('*').eq('telefone', f).maybeSingle();
            if (c) cliente = c;
        }
        if (!cliente) return res.status(404).json({ sucesso: false, erro: 'Cliente não encontrado em clientes_ativos' });
        const isAprovado = etapaFinal === 'passaporte_retornado';
        const resultado = isAprovado ? 'aprovado' : 'recusado';
        // Inserir em finalizados
        await supabase.from('clientes_finalizados').insert({
            telefone: cliente.telefone, nome: cliente.nome, email: cliente.email || null,
            servico: 'Visto Americano', data_inicio: cliente.criado_em || new Date().toISOString(),
            data_finalizacao: new Date().toISOString(), observacoes: nota || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        // Remover
        await supabase.from('clientes_ativos').delete().eq('telefone', cliente.telefone);
        await supabase.from('clientes').delete().eq('telefone', cliente.telefone);
        await supabase.from('contatos_amigos').delete().eq('telefone', cliente.telefone);
        // Notificar
        const nomeCliente = cliente.nome.split(' ')[0] || 'Cliente';
        let msg = resultado === 'recusado' ? `😔 Olá ${nomeCliente}!\n\nInfelizmente seu visto foi recusado...` : `🎉 PARABÉNS, ${nomeCliente}! 🎉\n\nSeu passaporte com o visto foi retornado!`;
        await enviarWhatsApp(cliente.telefone, msg);
        res.json({ sucesso: true, message: `Cliente finalizado com ${resultado}` });
    } catch (error) { res.status(500).json({ sucesso: false, erro: error.message }); }
});

app.get('/api/clientes/finalizados', async (req, res) => {
    try {
        const { data, error } = await supabase.from('clientes_finalizados').select('*').order('data_finalizacao', { ascending: false });
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, finalizados: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/clientes/finalizados/:telefone', async (req, res) => {
    try {
        const telefone = req.params.telefone;
        const telefoneLimpo = limparTelefone(telefone);
        let { data, error } = await supabase.from('clientes_finalizados').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (!data) {
            const f = formatarTelefone(telefoneLimpo);
            const { data: d } = await supabase.from('clientes_finalizados').select('*').eq('telefone', f).maybeSingle();
            data = d;
        }
        if (error || !data) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        res.json({ success: true, cliente: data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/clientes/reabrir', async (req, res) => {
    try {
        const telefone = req.body.telefone;
        const telefoneLimpo = limparTelefone(telefone);
        let { data: cliente, error } = await supabase.from('clientes_finalizados').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (!cliente) {
            const f = formatarTelefone(telefoneLimpo);
            const { data: d } = await supabase.from('clientes_finalizados').select('*').eq('telefone', f).maybeSingle();
            cliente = d;
        }
        if (error || !cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado em finalizados' });
        // Mover para ativos
        await supabase.from('clientes_ativos').insert({ telefone: cliente.telefone, nome: cliente.nome, email: cliente.email || null, criado_em: cliente.data_inicio || new Date().toISOString(), atualizado_em: new Date().toISOString(), status: 'reaberto' });
        await supabase.from('clientes_finalizados').delete().eq('telefone', cliente.telefone);
        await criarEtapaInicial(telefoneLimpo);
        await enviarWhatsApp(cliente.telefone, `🔄 Olá ${cliente.nome.split(' ')[0]}!\n\nSeu processo foi REABERTO pela nossa equipe.\n\n📋 Status: Em andamento\n📍 Etapa atual: Formulário recebido\n\nEm breve nossa equipe entrará em contato.`);
        res.json({ success: true, message: 'Processo reaberto com sucesso' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/clientes/buscar/:telefone', async (req, res) => {
    try {
        const telefone = req.params.telefone;
        const telefoneLimpo = limparTelefone(telefone);
        const { data, error } = await supabase.from('clientes').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        if (error || !data) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        res.json({ success: true, cliente: data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/clientes/ativos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('clientes_ativos').select('telefone, nome').order('criado_em', { ascending: false });
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, ativos: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/clientes/listar', async (req, res) => {
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, clientes: data || [] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/notificar-cliente', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const { telefone, mensagem } = req.body;
        if (!telefone) return res.status(400).json({ error: 'Telefone é obrigatório' });
        const telefoneLimpo = limparTelefone(telefone);
        let cliente = await supabase.from('clientes_ativos').select('*').eq('telefone', telefone).maybeSingle();
        if (!cliente.data) {
            cliente = await supabase.from('clientes_ativos').select('*').eq('telefone', telefoneLimpo).maybeSingle();
        }
        if (!cliente.data) return res.status(404).json({ error: 'Cliente não encontrado' });
        const nomeCliente = cliente.data.nome.split(' ')[0] || 'Cliente';
        const texto = mensagem || `🎉 Olá ${nomeCliente}!\n\nSeu processo foi iniciado com sucesso na GetVisa Assessoria!`;
        await enviarWhatsApp(telefone, texto);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/etapas/notificar-por-tipo', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const { telefone, tipo, mensagem } = req.body;
        if (!telefone || !tipo) return res.status(400).json({ error: 'Telefone e tipo são obrigatórios' });
        const telefoneLimpo = limparTelefone(telefone);
        const mensagensPadrao = { 'mover_ativo': '🎉 Seu processo foi iniciado na GetVisa!', 'mover_amigo': '🤝 Você foi adicionado como amigo.', 'reabrir': '🔄 Seu processo foi reaberto!', 'atualizacao': '📋 Seu processo foi atualizado.' };
        const msgFinal = mensagem || mensagensPadrao[tipo] || mensagensPadrao.atualizacao;
        await enviarWhatsApp(telefoneLimpo, msgFinal);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/etapas/estatisticas', async (req, res) => {
    try {
        const { data, error } = await supabase.from('etapas_processo').select('etapa_atual');
        if (error) throw error;
        const estatisticas = {};
        data.forEach(item => { if (!estatisticas[item.etapa_atual]) estatisticas[item.etapa_atual] = 0; estatisticas[item.etapa_atual]++; });
        const total = data.length;
        const resultado = Object.keys(estatisticas).map(etapa => ({ etapa, label: ETAPAS[etapa]?.label || etapa, quantidade: estatisticas[etapa], porcentagem: total > 0 ? ((estatisticas[etapa]/total)*100).toFixed(2) : 0 }));
        res.json({ total_clientes_ativos: total, distribuicao: resultado, ultima_atualizacao: new Date().toISOString() });
    } catch (error) { res.status(500).json({ erro: error.message }); }
});

app.post('/api/admin/atualizar-status', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const { telefone, status } = req.body;
        if (!telefone || !status) return res.status(400).json({ success: false, message: 'Telefone e status são obrigatórios' });
        const resultado = await atualizarStatusCliente(telefone, status);
        if (resultado.success) res.json({ success: true, message: `Status atualizado para "${status}"`, cliente: resultado.data });
        else res.status(500).json({ success: false, error: resultado.error });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/admin/atualizar-treinamento', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) return res.status(401).json({ error: 'Não autorizado' });
        const { telefone, treinamento_data, treinamento_hora, treinamento_local, treinamento_modalidade, treinamento_link } = req.body;
        if (!telefone) return res.status(400).json({ success: false, message: 'Telefone é obrigatório' });
        const treinamento = { data: treinamento_data, hora: treinamento_hora, local: treinamento_local, modalidade: treinamento_modalidade || 'presencial', link: treinamento_link || null };
        const resultado = await salvarTreinamento(telefone, treinamento);
        if (!resultado.success) return res.status(500).json({ success: false, error: resultado.error });
        const { data: cliente } = await supabase.from('clientes').select('nome').eq('telefone', telefone).maybeSingle();
        await enviarNotificacaoEtapa(telefone, 'treinamento_agendado', { nome: cliente?.nome || 'Cliente' });
        res.json({ success: true, message: 'Treinamento atualizado com sucesso!', data: resultado.data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 12.9. ROTAS DE SIMULADOR E OUTRAS
app.post('/api/submit-simulador', async (req, res) => {
    try {
        const dados = req.body;
        const { nome, telefone, email, situacao_profissional, renda, historico_viagens, proposito_viagem, score, classificacao } = dados;
        await supabase.from('avaliacoes').insert({ nome, telefone, email, situacao_profissional, renda, historico_viagens, proposito_viagem, score, classificacao, created_at: new Date().toISOString() });
        const cleanPhone = limparTelefone(telefone);
        if (cleanPhone) {
            await supabase.from('clientes').upsert({ telefone: cleanPhone, nome: nome || 'Cliente', email: email || '', status: 'avaliado', classificacao, score, updated_at: new Date().toISOString() }, { onConflict: 'telefone' });
            const mensagens = {
                'Perfil Forte': `🌟 *Ótimo perfil, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\n✅ Você está muito bem preparado! Já pode iniciar o processo do visto.\n\n📋 Vou te enviar o link do formulário DS-160 para começar agora mesmo.\n\n🔗 [Clique aqui para preencher o formulário](https://app.getvisa.com.br/formulario-ds160)\n\nVamos em frente! 🚀`,
                'Perfil Moderado': `📊 *Perfil moderado, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nSeu perfil é bom, mas uma análise com especialista pode aumentar suas chances.\n\n🧑‍💼 Quer agendar uma consultoria gratuita agora?\n\nResponda *SIM* e já te encaminho.`,
                'Perfil Regular': `📉 *Perfil regular, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nAlguns pontos precisam ser ajustados para melhorar suas chances.\n\n🧑‍💼 Recomendo agendar uma consultoria com um especialista.\n\nResponda *SIM* para falar com um especialista.`,
                'Requer Atenção': `⚠️ *Perfil requer atenção, ${nome.split(' ')[0]}!*\n\nSua avaliação foi *${classificacao}* com *${score}* pontos.\n\nÉ importante revisar seu perfil antes de iniciar o processo.\n\n🧑‍💼 Vou encaminhar seu caso para um especialista. Ele entrará em contato em breve.\n\n📱 Enquanto isso, fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)`
            };
            const msg = mensagens[classificacao] || `Olá ${nome.split(' ')[0]}! Sua avaliação foi *${classificacao}* com *${score}* pontos. Entre em contato para mais informações.`;
            await enviarWhatsApp(cleanPhone, msg);
        }
        await enviarWhatsApp(process.env.ADMIN_PHONE, `🔔 *Nova avaliação recebida!*\n\n👤 Nome: ${nome}\n📱 Telefone: ${telefone}\n📧 Email: ${email || 'Não informado'}\n📊 Classificação: ${classificacao}\n🎯 Score: ${score}/100`);
        res.json({ success: true, message: 'Avaliação recebida com sucesso!' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/simulador-visto-americano', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'simulador-visto-americano.html'));
});

// 12.10. HEALTH CHECKS
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString(), supabase: !!supabase }));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/api/status', (req, res) => res.json({ status: 'online', port: PORT, timestamp: new Date().toISOString(), supabase: !!supabase }));

// 12.11. ROTAS DE DEBUG (opcionais)
app.post('/api/test-receive', (req, res) => { console.log('📨 Teste receive:', req.body); res.json({ success: true }); });
app.post('/api/debug/criar-cliente', async (req, res) => { /* ... */ });
app.get('/api/debug/verificar-tabela', async (req, res) => { /* ... */ });
app.post('/api/debug/criar-tabela', async (req, res) => { /* ... */ });
app.post('/api/debug/testar-webhook', async (req, res) => { /* ... */ });
app.post('/api/test/webhook-manual', async (req, res) => { /* ... */ });
app.get('/api/test/zapi', async (req, res) => { /* ... */ });
app.get('/api/admin/verificar-cliente/:telefone', async (req, res) => { /* ... */ });

// 12.12. ROTA DE DASHBOARD DATA
app.get('/api/dashboard-data', async (req, res) => {
    try {
        const { data: clientes, error: clientesError } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
        if (clientesError) return res.status(500).json({ error: clientesError.message });
        const { data: etapas, error: etapasError } = await supabase.from('etapas_processo').select('cliente_id, etapa_atual, data_atualizacao');
        if (etapasError) return res.status(500).json({ error: etapasError.message });
        const etapasMap = {};
        if (etapas) etapas.forEach(e => { etapasMap[e.cliente_id] = { etapa_atual: e.etapa_atual, data_atualizacao: e.data_atualizacao }; });
        const clientesComEtapas = clientes.map(c => ({ ...c, etapa_atual: etapasMap[c.telefone]?.etapa_atual || 'Não definida', data_atualizacao: etapasMap[c.telefone]?.data_atualizacao || c.created_at }));
        const hoje = new Date().toISOString().split('T')[0];
        const novosHoje = clientes.filter(c => c.created_at?.startsWith(hoje)).length;
        const onboardingCompletos = clientes.filter(c => c.onboarding_completo === true).length;
        res.json({ totalClientes: clientes.length, novosHoje, onboardingCompletos, clientes: clientesComEtapas });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 12.13. AGENDAR TREINAMENTO
app.post('/api/agendar-treinamento', async (req, res) => {
    try {
        const { cliente_id, entrevista_id, tipo, data, horario } = req.body;
        if (!cliente_id || !data || !horario) return res.status(400).json({ success: false, message: 'Dados incompletos' });
        const { data: cliente, error: clienteError } = await supabase.from('clientes').select('id').eq('id', cliente_id).single();
        if (clienteError || !cliente) return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        const novoAgendamento = { cliente_id, atividade: 'Treinamento', data_agendamento: data, hora_agendamento: horario, local_agendamento: tipo, observacoes: `Treinamento para entrevista. Tipo: ${tipo}. Entrevista ID: ${entrevista_id || 'N/A'}`, concluido: false };
        const { data: agendamento, error } = await supabase.from('agendamentos').insert([novoAgendamento]).select().single();
        if (error) return res.status(500).json({ success: false, message: error.message });
        // Enviar confirmação
        try {
            const { data: clienteCompleto } = await supabase.from('clientes').select('nome, telefone').eq('id', cliente_id).single();
            if (clienteCompleto?.telefone) {
                const mensagem = `✅ *TREINAMENTO AGENDADO - GETVISA*\n\nOlá *${clienteCompleto.nome}*!\n\nSeu treinamento para a entrevista foi agendado com sucesso!\n\n📅 Data: ${new Date(data).toLocaleDateString('pt-BR')}\n⏰ Hora: ${horario}\n📍 Tipo: ${tipo}\n\n📌 Em breve nossa equipe entrará em contato para confirmar.\n\n🌟 Equipe GetVisa`;
                await enviarWhatsApp(clienteCompleto.telefone, mensagem);
            }
        } catch (e) {}
        res.json({ success: true, message: 'Treinamento agendado com sucesso!', data: agendamento });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 12.14. CARREGAR ROTAS ADICIONAIS
try {
    const ds160Routes = require('./routes/ds160Routes');
    app.use('/api', ds160Routes);
} catch (e) {}
try {
    const agendamentoRoutes = require('./routes/agendamentoRoutes');
    app.use('/api/admin/agendamentos', auth.verificarApiKey, agendamentoRoutes);
} catch (e) {}
try {
    const webhookRoutes = require('./routes/webhookRoutesNew');
    app.use('/api/webhook', webhookRoutes);
} catch (e) {
    app.post('/api/webhook', (req, res) => res.status(200).send('OK'));
}

// ============================================================
// 13. CRON JOB E LIMPEZA DE ESTADO
// ============================================================
cron.schedule('*/5 * * * *', () => { console.log('⏰ Cron job executado (lembretes)'); });

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) {
            userState.delete(phone);
        }
    }
}, 60 * 1000);

// ============================================================
// 14. INICIALIZAÇÃO
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
    console.log(`📱 Z-API configurada: ${process.env.ZAPI_TOKEN && (process.env.ZAPI_INSTANCE || process.env.ZAPI_CLIENT_TOKEN) ? '✅ Sim' : '❌ Não'}`);
    console.log(`🔑 ADMIN_API_KEY configurada: ${process.env.ADMIN_API_KEY ? '✅ Sim' : '❌ Não'}`);
    console.log('⏰ Cron job de lembretes agendado.');
});

module.exports = { userState, processarMensagem, limparTelefone, enviarWhatsApp, detectarIntencao, gerarRespostaBot, getSubmenu, getRespostaSubmenu, supabase, ETAPAS };