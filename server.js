// server.js - VERSÃO FINAL (SEM DUPLICAÇÕES)
console.log('--- 🚀 SERVER.JS INICIADO (VERSÃO FINAL) ---');



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
const LINK_PORTAL = 'https://app.getvisa.com.br/meu-processo';

function rodapePortal() {
    return `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
           `📊 *Acompanhe seu processo online:*\n` +
           `🔗 ${LINK_PORTAL}\n\n` +
           `_Entre com seu telefone + os 4 últimos dígitos do CPF_`;
}

// ============================================================
// 2. ESTADO GLOBAL E CONSTANTES
// ============================================================
const userState = new Map(); // { phone: { step, nome, email, tipo, ... } }

const TRIAGEM_STEPS = {
    PERGUNTAR_TIPO: 'perguntar_tipo',
    AGUARDANDO_RESPOSTA: 'aguardando_resposta',
    AGUARDANDO_EMAIL_CLIENTE: 'aguardando_email_cliente',
    AGUARDANDO_NOME_LEAD: 'aguardando_nome_lead',
    AGUARDANDO_EMAIL_LEAD: 'aguardando_email_lead',
    COMPLETO: 'completo'
};

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
    SISTEMA_ETAPAS: { ativo: true, notificar_cliente: true, auto_avancar: true }
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

const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Apenas arquivos PDF são permitidos'));
    }
});
console.log('✅ Multer configurado com memoryStorage');

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
app.use(express.static(publicPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



// ============================================================
// PORTAL DO CLIENTE — Helpers
// ============================================================

// Rate limit (memória — reseta a cada redeploy, suficiente pro MVP)
const tentativasLogin = new Map();
const MAX_TENTATIVAS_LOGIN = 10;
const JANELA_RATE_LIMIT_MS = 15 * 60 * 1000; // 15 min

function rateLimitLogin(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket?.remoteAddress
            || 'desconhecido';
    
    const agora = Date.now();
    const registro = tentativasLogin.get(ip);
    
    if (registro && (agora - registro.primeira) > JANELA_RATE_LIMIT_MS) {
        tentativasLogin.delete(ip);
    }
    
    const atual = tentativasLogin.get(ip);
    if (atual && atual.tentativas >= MAX_TENTATIVAS_LOGIN) {
        const restante = Math.ceil((JANELA_RATE_LIMIT_MS - (agora - atual.primeira)) / 60000);
        console.log(`🚫 Rate limit login portal: ${ip}`);
        return res.status(429).json({
            success: false,
            message: `Muitas tentativas. Aguarde ${restante} minuto(s).`
        });
    }
    
    req._ipPortal = ip;
    next();
}

function registrarFalhaLogin(ip) {
    const agora = Date.now();
    const atual = tentativasLogin.get(ip);
    if (!atual) tentativasLogin.set(ip, { tentativas: 1, primeira: agora });
    else atual.tentativas++;
}

function limparTentativasLogin(ip) {
    tentativasLogin.delete(ip);
}

function gerarTokenPortal() {
    return require('crypto').randomBytes(32).toString('hex');
}



// ============================================================
// 5. FUNÇÕES AUXILIARES GERAIS
// ============================================================




function limparTelefone(telefone) {
    if (!telefone) return null;
    const str = telefone.toString().trim();

    // 🆕 Detecta sufixo virtual (ex: 21975524127-01 pra dependentes/família)
    const match = str.match(/^(\d{10,13})-(\d{1,3})$/);
    if (match) {
        let base = match[1];
        const sufixo = match[2];
        // Remove DDI 55 se presente
        if (base.startsWith('55') && base.length > 11) base = base.substring(2);
        return base + '-' + sufixo;
    }

    // Telefone normal (sem sufixo)
    let limpo = str.replace(/\D/g, '');
    if (limpo.startsWith('55')) limpo = limpo.substring(2);
    return limpo;
}

// 🆕 Extrai o número REAL (sem sufixo virtual) pra envio de WhatsApp
function telefoneReal(telefone) {
    const limpo = limparTelefone(telefone);
    if (!limpo) return null;
    return limpo.split('-')[0];
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

        // 🆕 Usa telefone REAL (remove sufixo virtual -01, -02, etc)
        const telReal = telefoneReal(telefone) || telefone;
        const telefoneLimpo = telReal.toString().replace(/\D/g,'');
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

        // 🆕 Usa telefone REAL (remove sufixo virtual -01, -02, etc)
        const telReal = telefoneReal(telefone) || telefone;
        const telefoneLimpo = telReal.toString().replace(/\D/g,'');
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

        console.log(`✅ PDF enviado por WhatsApp com sucesso para ${telefoneFormatado}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar PDF por WhatsApp:', error);
        return false;
    }
}

async function clientePodeReceberNotificacoes(telefone) {
    try {
        // 🆕 Usa telefone REAL (remove sufixo virtual)
        const telReal = telefoneReal(telefone) || telefone;
        const { data, error } = await supabase
            .from('clientes')
            .select('tipo_contato, silenciar_notificacoes')
            .eq('telefone', telReal)
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
        const updateData = { status: novoStatus, updated_at: new Date().toISOString(), ...dadosAdicionais };
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

        // 🆕 Sincroniza etapas_processo (portal do cliente lê daqui)
        const mapaStatusParaEtapa = {
            'lead': 'formulario_enviado',
            'formulario_solicitado': 'formulario_enviado',
            'formulario_enviado': 'formulario_enviado',
            'em_analise': 'analise_correcoes',
            'analise_correcoes': 'analise_correcoes',
            'processo_aberto': 'abertura_processo',
            'boleto_emitido': 'boleto_emitido',
            'boleto_pago': 'boleto_pago',
            'agendado_casv': 'agendamento_realizado',
            'agendamento_realizado': 'agendamento_realizado',
            'treinamento_realizado': 'treinamento_realizado',
            'agendado_entrevista': 'agendamento_realizado',
            'entrevista_realizada': 'entrevista_realizada',
            'visto_aprovado': 'visto_aprovado',
            'visto_recusado': 'visto_recusado',
            'passaporte_retornado': 'passaporte_retornado'
        };

        const etapaEquivalente = mapaStatusParaEtapa[novoStatus];
        if (etapaEquivalente) {
            try {
                await supabase
                    .from('etapas_processo')
                    .upsert({
                        cliente_telefone: telefone,
                        etapa_atual: etapaEquivalente,
                        data_atualizacao: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'cliente_telefone' });
                console.log(`✅ etapas_processo sincronizada: ${etapaEquivalente}`);
            } catch (syncError) {
                console.error('❌ Erro ao sincronizar etapas_processo:', syncError);
            }
        }

        await enviarNotificacaoStatus(telefone, novoStatus, data.nome);
        return { success: true, data };
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        return { success: false, error };
    }
}

async function enviarNotificacaoStatus(telefone, status, nome) {
    const mensagens = {
               'lead': `👋 Olá ${nome}!\n\nQue bom ter você por aqui! Seu cadastro foi iniciado com sucesso ✅\n\n📌 Em breve enviaremos o link do formulário DS-160 pra começarmos seu processo.\n\n💡 *Dica:* tenha seu passaporte em mãos quando o link chegar!`,

        'formulario_solicitado': `📋 Olá ${nome}!\n\nO link do formulário DS-160 foi enviado pra você 📲\n\n⚠️ *Preencha com atenção* e confira cada dado antes de enviar — essas informações vão direto pro consulado americano.\n\n✨ Quando você enviar, o sistema avisa nossa equipe automaticamente. Não precisa fazer mais nada!`,

        'formulario_enviado': `✅ Olá ${nome}!\n\nRecebemos seu formulário DS-160 com sucesso! 🎉\n\n🔍 Nossa equipe já iniciou a revisão dos dados pra garantir que esteja tudo certo antes de seguir pra próxima etapa.\n\n📌 Se identificarmos qualquer ponto que precise da sua ajuda, entraremos em contato por aqui.`,

        'em_analise': `🔍 Olá ${nome}!\n\nSua documentação está em revisão detalhada pela nossa equipe. Estamos conferindo cada informação com cuidado pra que seu processo siga sem imprevistos.\n\n📌 Assim que a análise terminar, você receberá uma nova atualização por aqui.\n\n✨ Obrigado pela paciência — estamos cuidando de cada detalhe!`,
        'analise_correcoes': `📝 Olá ${nome}! Analisando o formulario, surgiram algumas dúvidas.\n\n📌 Em breve entraremos em contato!`,
        'processo_aberto': `🎯 Olá ${nome}!\n\nFormulário aprovado! ✅ Agora vamos iniciar o processo junto ao consulado.\n\n📌 Próximo passo: você vai receber o boleto da *taxa consular (MRV)* para pagamento.\n\n✨ Qualquer dúvida, é só chamar!`,
        'boleto_emitido': `💰 Olá ${nome}!\n\nO boleto/pix da *taxa consular (MRV)* foi emitido e enviado pra você. 📧\n\n📌 Efetue o pagamento e nos avise, por favor, quando concluir.\n\n✨ Assim que confirmarmos, seguimos com o agendamento!`,
        'boleto_pago': `✅ Olá ${nome}! Confirmamos o pagamento da taxa consular!\n\n📌 Agora vamos prosseguir com o agendamento da sua entrevista.`,
        'agendado_casv': `✅ Olá ${nome}!\n\nSeu CASV (coleta biométrica) foi agendado! 📅\n\n📌 Verifique os detalhes completos no documento que enviamos.\n\n⚠️ *Leve:* passaporte original + confirmação do agendamento impressa + *CONFIRMATION IMPRESSA*. Chegue com 30 min de antecedência!`,
        'agendado_entrevista': `✅ Olá ${nome}!\n\nSua entrevista no consulado foi agendada! 🎤\n\n📌 Confira data, hora e endereço documento que enviamos.\n\n⚠️ *Leve:* passaporte + confirmação do agendamento impressa. Chegue com 30 min de antecedência!`,
        'treinamento_realizado': `✅ Olá ${nome}! Seu treinamento para a entrevista foi concluído!\n\n🎯 Você está preparado(a) para a entrevista!\n\n📌 Lembre-se:\n• Confiança é a chave\n• Responda com clareza\n• Seja objetivo(a)`,
        'entrevista_realizada': `🎤 Olá ${nome}! Sua entrevista foi realizada!\n\n⏳ Agora é aguardar a decisão consular.\n\n📌 O prazo médio é de 7 a 10 dias úteis.\n\n🌟 Fique tranquilo(a)! Em breve teremos novidades.`,
        'visto_aprovado': `🎉🎉 *PARABÉNS, ${nome}!* 🎉🎉\n\nSeu visto americano foi *APROVADO*! 🛂✨\n\n📌 Agora é só aguardar: seu passaporte com o visto será liberado em 7 a 10 dias úteis e avisaremos assim que estiver liberado.\n\n🌟 Foi uma honra fazer parte dessa conquista. Boa viagem! 🇺🇸`,
        'visto_recusado': `😔 Olá ${nome},\n\nConforme conversamos, seu visto não foi aprovado desta vez.\n\n📌 Com a estratégia certa, muitos conseguem reverter.\n\n💬 Se surgir qualquer dúvida ou quiser conversar mais sobre os próximos passos, estamos à disposição:\n👉 [Fale com um especialista](https://wa.me/5521974601812)\n\n💪 Estamos juntos nessa. Isso não muda o seu objetivo!`,
        'passaporte_retornado': `📦 Olá ${nome}!\n\nSeu passaporte com o visto já está disponível para retirada/entrega!\n\n✅ Processo concluído com sucesso!\n\n✈️ Agora é realizar seus sonhos!\n\n🌟 Agradecemos por confiar na GetVisa Assessoria!`
    };
        const mensagem = mensagens[status] || `🔄 Seu status foi atualizado para: ${status}`;
    const mensagemComLink = mensagem + rodapePortal();
    try {
        await enviarWhatsApp(telefone, mensagemComLink);
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
        'formulario_enviado': (nome) => `✅ Olá ${nome}!\n\nRecebemos seu formulário DS-160 com sucesso! 🎉\n\n🔍 Nossa equipe já iniciou a revisão dos dados pra garantir que esteja tudo certo antes de seguir pra próxima etapa.\n\n📌 Se identificarmos qualquer ponto que precise da sua ajuda, entraremos em contato por aqui.`,
        'analise_correcoes': (nome) => `🔍 Olá ${nome}! Estamos analisando seus documentos.\n\n📌 Em breve entraremos em contato se houver correções.`,
        'abertura_processo': (nome) => `🎯 Olá ${nome}!\n\nFormulário aprovado! ✅ Agora vamos iniciar o processo junto ao consulado.\n\n📌 Próximo passo: você vai receber o boleto da *taxa consular (MRV)* para pagamento.\n\n✨ Qualquer dúvida, é só chamar!`,
        'boleto_emitido': (nome) => `💰 Olá ${nome}!\n\nO boleto/pix da *taxa consular (MRV)* foi emitido e enviado pra você. 📧\n\n📌 Efetue o pagamento e nos avise, por favor, quando concluir.\n\n✨ Assim que confirmarmos, seguimos com o agendamento!`,
        'boleto_pago': (nome) => `✅ Olá ${nome}! Pagamento confirmado!\n\n📌 Agora vamos agendar sua coleta biométrica.`,
        'agendado_casv': (nome) => `✅ Olá ${nome}!\n\nSeu CASV (coleta biométrica) foi agendado! 📅\n\n⚠️ *Leve:* passaporte original + confirmação do agendamento + *CONFIRMATION IMPRESSA*. Chegue com 30 min de antecedência!`,
        'treinamento_agendado': (nome) => `🎯 Olá ${nome}! Seu treinamento foi agendado!\n\n📅 Data e horário enviados por e-mail.\n\n📌 Prepare-se! Estamos com você!`,
        'treinamento_realizado': (nome) => `✅ Olá ${nome}! Treinamento concluído!\n\n🎯 Você está preparado(a) para a entrevista!\n\n💪 Confie no seu potencial!`,
        'agendado_entrevista': (nome) => `✅ Olá ${nome}!\n\nSua entrevista no consulado foi agendada! 🎤\n\n📌 Confira data, hora e endereço no documento que enviamos.\n\n⚠️ *Leve:* passaporte + documento de confirmação impressa. Chegue com 30 min de antecedência!`,
        'entrevista_realizada': (nome) => `🎤 Olá ${nome}! Entrevista realizada!\n\n⏳ Agora é aguardar a decisão consular.\n\n📌 Prazo médio: 7 a 10 dias úteis.`,
        'visto_aprovado': (nome) => `🎉🎉 *PARABÉNS, ${nome}!* 🎉🎉\n\nSeu visto americano foi *APROVADO*! 🛂✨\n\n📌 Agora é só aguardar: seu passaporte com o visto será liberado em 7 a 10 dias úteis e avisaremos assim que estiver liberado.\n\n🌟 Foi uma honra fazer parte dessa conquista. Boa viagem! 🇺🇸`,
        'visto_recusado': (nome) => `😔 Olá ${nome},\n\nConforme conversamos, seu visto não foi aprovado desta vez.\n\n📌 Reforço: isso *não é o fim*. A recusa é mais comum do que parece, e com a estratégia certa muitos conseguem reverter.\n\n💬 Se surgir qualquer dúvida ou quiser conversar mais sobre os próximos passos, é só chamar:\n👉 [Fale com um especialista](https://wa.me/5521974601812)\n\n💪 Estamos juntos nessa. Isso não muda o seu objetivo!`,
        'passaporte_retornado': (nome) => `📦 Olá ${nome}!\n\nSeu passaporte com o visto está disponível!\n\n✅ Processo concluído com sucesso!\n\n🌟 Agradecemos por confiar na GetVisa!`,
        'finalizado': (nome) => `🏁 Olá ${nome}!\n\nSeu processo foi finalizado com sucesso!\n\n🌟 Agradecemos por confiar na GetVisa Assessoria!`
    };
        const nome = dadosCliente?.nome || 'Cliente';
    const mensagem = mensagens[etapa]?.(nome) || `🔄 Seu processo foi atualizado para: ${ETAPAS[etapa]?.label || etapa}`;
    const mensagemComLink = mensagem + rodapePortal();
    try {
        await enviarWhatsApp(telefone, mensagemComLink);
        console.log(`📱 Notificação de etapa enviada para ${telefone}: ${etapa}`);
    } catch (error) {
        console.error('❌ Erro ao enviar notificação:', error);
    }
}

async function buscarClienteEmQualquerTabela(telefoneLimpo) {
    const tabelas = ['clientes', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
    for (const tabela of tabelas) {
        try {
            const { data, error } = await supabase.from(tabela).select('*').eq('telefone', telefoneLimpo).maybeSingle();
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
           `• Você receberá a confirmação no celular\n` +
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
           `• Você receberá a confirmação no whatsapp\n` +
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
        andamento: `📊 Vou verificar o andamento do seu processo agora mesmo.`,
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
            visto_americano: '💰 INVESTIMENTO - VISTO AMERICANO\n\n💵 Taxa Consular: ~R$ 960,00\n💼 Assessoria GetVisa: R$ 350,00\n\n✅ INCLUI: Preenchimento DS-160, agendamento, preparação para entrevista e acompanhamento total.\n\nDigite 0 para voltar ao MENU principal',
            visto_canadense: '💰 INVESTIMENTO - VISTO CANADENSE\n\n💵 Taxa Consular: ~R$ 750,00\n💼 Assessoria GetVisa: R$ 400,00\n\n✅ INCLUI: Aplicação online, biometria, preparação de documentos e acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            visto_australiano: '💰 INVESTIMENTO - VISTO AUSTRALIANO\n\n💵 Taxa Consular: ~R$ 850,00\n💼 Assessoria GetVisa: R$ 450,00\n\n✅ INCLUI: Análise de perfil, aplicação online, documentação específica.\n\nDigite 0 para voltar ao MENU principal',
            eta_uk: '💰 INVESTIMENTO - eTA UK\n\n💵 Taxa: ~R$ 120,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Aplicação online, validação de dados, acompanhamento.\n\nDigite 0 para voltar ao MENU principal',
            eta_canadense: '💰 INVESTIMENTO - eTA CANADENSE\n\n💵 Taxa: ~R$ 50,00\n💼 Assessoria GetVisa: R$ 100,00\n\n✅ INCLUI: Aplicação online rápida, validação, entrega por e-mail.\n\nDigite 0 para voltar ao MENU principal',
            passaporte: '💰 INVESTIMENTO - PASSAPORTE\n\n💵 Taxa PF: ~R$ 257,00\n💼 Assessoria GetVisa: R$ 150,00\n\n✅ INCLUI: Agendamento, orientação documental, acompanhamento.\n\nDigite 0 para voltar ao MENU principal'
        },
        prazo: {
            visto_americano: '⏱️ PRAZO - VISTO AMERICANO\n\nAgendamento da entrevista: Depende do consulado escolhido\nRetorno do passaporte com visto: 7 a 10 dias úteis, após entrevista\n\nDigite 0 para voltar ao MENU principal',
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

async function gerenciarTriagem(phone, message, state) {
    console.log(`📌 Triagem - Estado atual: ${state.step}, telefone: ${phone}`);
    state.lastActivity = Date.now();

    const msgLower = message.trim().toLowerCase();

    // Comando 0: reinicia a triagem (exceto se já estiver no início)
    if (msgLower === '0' && state.step !== TRIAGEM_STEPS.PERGUNTAR_TIPO) {
        state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
        state.tipo = null;
        state.nome = null;
        state.email = null;
        userState.set(phone, state);
        await enviarWhatsApp(phone, `👋 Vamos recomeçar. Digite 1, 2 ou 3.`);
        return;
    }

    // Função para fallback (especialista) – usada apenas na escolha inicial
    async function encaminharParaEspecialista() {
        const mensagem = `🤔 *Sua demanda será analisada e em breve um especialista entrará em contato.*

📧 Caso prefira, envie um e-mail para contato@getvisa.com.br

Digite *0* para recomeçar.`;
        await enviarWhatsApp(phone, mensagem);
        state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
        state.tipo = null;
        state.nome = null;
        state.email = null;
        userState.set(phone, state);
    }

    // Função para resetar para a mensagem de boas-vindas (usada quando entrada inválida)
    async function resetarParaBoasVindas() {
        state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
        state.tipo = null;
        state.nome = null;
        state.email = null;
        userState.set(phone, state);
        const msg = `👋 Olá! Seja bem-vindo(a) à **GetVisa Assessoria**! 🇺🇸

Somos especialistas em vistos americanos e viagens internacionais!

Para eu saber como posso te ajudar melhor, me diga:

1️⃣ - Cliente (já estou em processo de visto)
2️⃣ - Quero informações sobre Vistos, eTA, ESTA, Passaporte
3️⃣ - Outros assuntos (contato pessoal, fornecedor, etc)

Digite o número da opção (1, 2 ou 3)`;
        await enviarWhatsApp(phone, msg);
    }

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
                await encaminharParaEspecialista();
                return;
            }
                        if (opcao === '3') {
                console.log(`🔇 Opção 3 detectada para ${phone}, salvando como contato_pessoal...`);

                // 🆕 Última mensagem do bot para este número
                try {
                    await enviarWhatsApp(phone,
                        `Tudo bem! 😊\n\ndeixe sua mensagem, em breve retornarei.\n\nObrigado pelo contato! 🙌`
                    );
                    console.log(`📤 Mensagem de despedida enviada para ${phone}`);
                } catch (e) {
                    console.error('❌ Erro ao enviar despedida:', e);
                }

                const { data, error } = await supabase.from('clientes').upsert({
                    telefone: phone,
                    nome: 'Contato Pessoal',
                    tipo_contato: 'contato_pessoal',
                    status: 'contato_pessoal',
                    data_contato: new Date().toISOString(),
                    onboarding_completo: true
                }, { onConflict: 'telefone' });
                if (error) {
                    console.error(`❌ Erro ao salvar contato pessoal:`, error);
                } else {
                    console.log(`✅ Contato pessoal salvo:`, data);
                }
                userState.delete(phone);
                console.log(`🔇 Contato pessoal ${phone} silenciado (próximas mensagens não serão respondidas).`);
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
            if (msgLower === '2') {
                state.tipo = 'lead';
                state.step = TRIAGEM_STEPS.AGUARDANDO_NOME_LEAD;
                userState.set(phone, state);
                await enviarWhatsApp(phone, `📋 Ótimo! Vou te ajudar com todas as informações sobre vistos e viagens!\n\n📌 *Para começar, me diga seu nome completo:*\n\nEx: Maria Silva`);
                return;
            }
            const email = message.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                await resetarParaBoasVindas();
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
            await supabase
                .from('clientes')
                .update({ telefone: phone, tipo_contato: 'cliente', updated_at: new Date().toISOString() })
                .eq('email', email);
            userState.delete(phone);
            await processarClienteExistente(phone, '', cliente);
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_NOME_LEAD: {
            if (msgLower === '0') {
                state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
                state.tipo = null;
                state.nome = null;
                state.email = null;
                userState.set(phone, state);
                await enviarWhatsApp(phone, `👋 Vamos recomeçar. Digite 1, 2 ou 3.`);
                return;
            }
            const nome = message.trim();
            if (nome.length < 3) {
                await resetarParaBoasVindas();
                return;
            }
            state.nome = nome;
            state.step = TRIAGEM_STEPS.AGUARDANDO_EMAIL_LEAD;
            userState.set(phone, state);
            await enviarWhatsApp(phone, `😊 Prazer, ${nome}! Agora me diga:\n\n📧 **Qual é o seu e-mail?**\n\nEx: maria@email.com`);
            break;
        }

        case TRIAGEM_STEPS.AGUARDANDO_EMAIL_LEAD: {
            if (msgLower === '0') {
                state.step = TRIAGEM_STEPS.PERGUNTAR_TIPO;
                state.tipo = null;
                state.nome = null;
                state.email = null;
                userState.set(phone, state);
                await enviarWhatsApp(phone, `👋 Vamos recomeçar. Digite 1, 2 ou 3.`);
                return;
            }
            const email = message.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                await resetarParaBoasVindas();
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
    
    // Adiciona detalhes de agendamento se houver
    if (etapaAtual === 'agendado_casv' || etapaAtual === 'agendado_entrevista') {
        const { data: etapaData } = await supabase
            .from('etapas_processo')
            .select('dados_casv, dados_entrevista')
            .eq('cliente_telefone', phone)
            .maybeSingle();
        if (etapaData) {
            if (etapaData.dados_casv?.data) {
                mensagem += `\n\n📅 *CASV:* ${etapaData.dados_casv.data} às ${etapaData.dados_casv.hora || '--:--'}`;
            }
            if (etapaData.dados_entrevista?.data) {
                mensagem += `\n🎤 *Entrevista:* ${etapaData.dados_entrevista.data} às ${etapaData.dados_entrevista.hora || '--:--'}`;
            }
        }
    }
    
    mensagem += `\n\n💪 *Estamos acompanhando seu caso!*\n\n` +
                `📌 *Sua pergunta foi respondida?* 😊\n\n` +
                `Se precisar de ajuda ou quiser falar com um especialista, pode me chamar ou entrar em contato direto pelo WhatsApp:\n` +
                `[Fale com nosso especialista](https://wa.me/5521974601812)\n\n` +
                `Digite *0* para voltar ao menu principal.`;
    
    await enviarWhatsApp(phone, mensagem);
}

async function processarLead(phone, message, cliente) {
    const nomeLead = obterNomeExibicao(cliente.nome);
    const msg = message.trim().toLowerCase();
        // 🆕 Detecta resposta ao follow-up #2
    const textoLimpo = message.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (textoLimpo === 'ajuda' || textoLimpo === 'quero ajuda' || textoLimpo === 'preciso de ajuda') {
        console.log(`🙋 Lead ${phone} pediu AJUDA via follow-up`);
        
        // Notifica equipe
        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, 
                `🙋 *LEAD PEDIU AJUDA*\n\n👤 ${nomeLead}\n📱 ${phone}\n\nEle respondeu ao follow-up pedindo ajuda pra preencher o DS-160.`
            );
        } catch (e) {}
        
        // Responde o lead
        await enviarWhatsApp(phone,
            `Perfeito, ${nomeLead.split(' ')[0]}! 🤝\n\n` +
            `Vou pedir pra um especialista te chamar em instantes pra te ajudar a preencher.\n\n` +
            `Enquanto isso, se quiser adiantar:\n` +
            `👉 https://app.getvisa.com.br/formulario-ds160\n\n` +
            `Fica tranquilo(a) que vamos te acompanhar! ✨`
        );
        
        // Marca que pediu ajuda
        try {
            await supabase.from('clientes')
                .update({ followup_parar: true, updated_at: new Date().toISOString() })
                .eq('telefone', phone);
        } catch (e) {}
        
        return;
    }
    
    // Verifica se está em submenu
    const state = userState.get(phone);
    if (state && state.nivel === 'submenu' && state.service) {
        await processarOpcaoNoSubmenu(phone, msg, state);
        return;
    }
    
    if (msg === 'menu' || msg === '0') {
        const menu = await getMenuPrincipal();
        await enviarWhatsApp(phone, menu);
        return;
    }
    
    // Mapeamento de serviços 1-7
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
            await enviarWhatsApp(phone, `📞 *Olá ${nomeLead}!* Precisa de ajuda? 👇\n\n👨‍💼 *Fale com nossa equipe:* wa.me/5521974601812\n📧 contato@getvisa.com.br\n🌐 getvisa.com.br\n📋 https://app.getvisa.com.br/formulario-ds160\n\nDigite 0 para o MENU principal`);
            return;
        }
        
        let userStateData = userState.get(phone) || {};
        userStateData.nivel = 'submenu';
        userStateData.service = serviceKey;
        userStateData.nome = cliente.nome;
        userState.set(phone, userStateData);
        
        const submenu = getSubmenu(serviceKey);
        await enviarWhatsApp(phone, submenu);
        return;
    }
    
    // 🔥 DETECÇÃO DE INTENÇÃO: ANDAMENTO
    const intencao = detectarIntencao(message);
    
    if (intencao === 'andamento') {
        // Já temos o cliente (pelo telefone), então mostra o status
        await mostrarStatusProcesso(phone, cliente);
        return;
    }
    
    if (intencao && intencao !== 'desconhecida') {
        const resposta = gerarRespostaBot(intencao, cliente.nome, null);
        await enviarWhatsApp(phone, resposta);
        return;
    }
    
    // FALLBACK (sem link do WhatsApp)
    const nomeCliente = obterNomeExibicao(cliente?.nome || 'Cliente');
    const msgFallback = `🤔 *Olá ${nomeCliente}!*

Não entendi muito bem o que você quis dizer com essa mensagem. 😅

Mas fique tranquilo(a)! Vamos analisar sua demanda e um especialista entrará em contato em breve. ⏳

📧 Caso prefira, envie um e-mail para contato@getvisa.com.br

*Digite 0 para ver o menu principal*`;

    await enviarWhatsApp(phone, msgFallback);
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
            await enviarWhatsApp(cleanPhone, getSubmenu(serviceKey));
            return;
        }

        if (messageText === '7') {
            let nomeAjuda = state?.nome || 'Cliente';
            try {
                const { data } = await supabase.from('clientes').select('nome').eq('telefone', cleanPhone).maybeSingle();
                if (data?.nome) nomeAjuda = data.nome;
            } catch (e) {}
            const primeiroNomeAjuda = obterNomeExibicao(nomeAjuda);
            await enviarWhatsApp(cleanPhone, `📞 *Olá ${primeiroNomeAjuda}!* Precisa de ajuda? 👇\n\n👨‍💼 *Fale com nossa equipe:* wa.me/5521974601812\n📧 contato@getvisa.com.br\n🌐 getvisa.com.br\n📋 https://app.getvisa.com.br/formulario-ds160\n\nDigite 0 para o MENU principal`);
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
        const primeiroNome = obterNomeExibicao(nomeCliente);
        let servicoCliente = 'visto_americano';
        if (clienteDB?.consulado) servicoCliente = 'visto_americano';
        else if (clienteDB?.status) servicoCliente = 'visto_americano';

        if (intent === 'iniciar_processo' || intent === 'solicitar_ds160') {
            const msg = (state?.nome && state?.email) 
                ? getMensagemFormularioComEspecialista(nomeCliente)
                : getMensagemFormularioParaBot(nomeCliente);
            await enviarWhatsApp(cleanPhone, msg);
            return;
        }

        if (intent === 'andamento') {
    // Já temos o telefone (cleanPhone), busca o cliente novamente para pegar dados atualizados
    const { data: clienteAtualizado, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefone', cleanPhone)
        .maybeSingle();
    
    if (error || !clienteAtualizado) {
        await enviarWhatsApp(cleanPhone, '❌ Ainda não encontrei seu cadastro. Digite 0 para o menu principal.');
        return;
    }
    
    await mostrarStatusProcesso(cleanPhone, clienteAtualizado);
    return;
}

        if (intent === 'documentos') {
            const resposta = getRespostaSubmenu(servicoCliente, 'documentos');
            await enviarWhatsApp(cleanPhone, `📋 *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'prazo') {
            const resposta = getRespostaSubmenu(servicoCliente, 'prazo');
            await enviarWhatsApp(cleanPhone, `⏱️ *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'pagamento') {
            const resposta = getRespostaSubmenu(servicoCliente, 'preco');
            await enviarWhatsApp(cleanPhone, `💰 *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'processo') {
            const resposta = getRespostaSubmenu(servicoCliente, 'processo');
            await enviarWhatsApp(cleanPhone, `🔄 *Olá ${primeiroNome}!*\n\n${resposta}`);
            return;
        }

        if (intent === 'indicar_amigo') {
            await enviarWhatsApp(cleanPhone, `👥 *Olá ${primeiroNome}!* Que legal! 🌟\n\n📱 Compartilhe: wa.me/5521974601812\n🌐 getvisa.com.br\n📋 https://app.getvisa.com.br/formulario-ds160\n\n🎁 *Bônus:* Indique um amigo que feche o processo e ganhe 10% de desconto!\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent === 'falar_especialista') {
            await enviarWhatsApp(cleanPhone, `👨‍💼 *Olá ${primeiroNome}!*\n\n📱 Fale com nossa equipe: wa.me/5521974601812\n📧 contato@getvisa.com.br\n⏰ Seg-Sex, 9h-18h\n💡 *Dica:* Tenha seu número de protocolo em mãos!\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent === 'duvida_geral') {
            await enviarWhatsApp(cleanPhone, `🤔 *Olá ${primeiroNome}!*\n\nPosso ajudar com:\n1️⃣ *Documentos* - Quais levar\n2️⃣ *Prazo* - Quanto tempo demora\n3️⃣ *Status* - Andamento do seu processo\n4️⃣ *Valores* - Quanto custa\n\n💡 *Seja específico(a)*, ex: "documentos para visto"\n📱 wa.me/5521974601812\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent === 'feedback') {
            await enviarWhatsApp(cleanPhone, `⭐ *Olá ${primeiroNome}!* Obrigado! 🌟\n\n📱 wa.me/5521974601812\n📧 contato@getvisa.com.br\n⭐ *Avalie:* Excelente | Bom | Regular\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent === 'visto_americano') {
            state.nivel = 'submenu';
            state.service = 'visto_americano';
            userState.set(cleanPhone, state);
            await enviarWhatsApp(cleanPhone, getSubmenu('visto_americano'));
            return;
        }

        if (intent === 'visto_negado') {
            await enviarWhatsApp(cleanPhone, `🔄 *Olá ${primeiroNome}!*\n\nTeve o visto negado? Não desanime!\n\n🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/\n\n✅ *Oferecemos:*\n• Análise do motivo da negativa\n• Correção do formulário\n• Documentação reforçada\n• Preparação para entrevista\n\n💰 Investimento: R$ 380\n\n📱 [Fale com especialista](wa.me/5521974601812)\n\nDigite 0 para o menu principal`);
            return;
        }

        if (intent && intent !== 'desconhecida' && intent !== 'andamento' && intent !== 'documentos' && intent !== 'prazo' && intent !== 'pagamento') {
            let nomeFallback = state?.nome || 'Cliente';
            try {
                const { data } = await supabase.from('clientes').select('nome').eq('telefone', cleanPhone).maybeSingle();
                if (data?.nome) nomeFallback = data.nome;
            } catch (e) {}
            const primeiroNomeFallback = obterNomeExibicao(nomeFallback);
            let resposta = gerarRespostaBot(intent, state?.nome, state?.etapaAtual);
            resposta = resposta.replace(/Cliente/g, primeiroNomeFallback);
            await enviarWhatsApp(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
            return;
        }

        console.log('⚠️ Nenhuma intenção detectada para:', messageText);
        let nomeFallback2 = state?.nome || 'Cliente';
        try {
            const { data } = await supabase.from('clientes').select('nome').eq('telefone', cleanPhone).maybeSingle();
            if (data?.nome) nomeFallback2 = data.nome;
        } catch (e) {}
        const primeiroNomeFinal = obterNomeExibicao(nomeFallback2);

        // FALLBACK FINAL (sem link do WhatsApp)
        const fallbackMsg = `🤔 *Olá ${primeiroNomeFinal}!*

Não entendi sua pergunta. 😅

Mas não se preocupe! Vamos analisar sua demanda e um especialista entrará em contato em breve.

📋 *Preencha o formulário DS-160:*
[Clique aqui](https://app.getvisa.com.br/formulario-ds160)

📧 *E-mail:* contato@getvisa.com.br

💡 *Dica:* Para respostas rápidas, use palavras-chave como "documentos", "prazo", "status" ou "valores".

Digite *0* para o menu principal.`;

        await enviarWhatsApp(cleanPhone, fallbackMsg);

    } catch (error) {
        console.error('❌ ERRO NO processarOpcaoNoMenuPrincipal:', error);
        console.error('❌ Stack:', error.stack);
        await enviarWhatsApp(cleanPhone, '❌ Desculpe, ocorreu um erro. Digite 0 para tentar novamente.');
    }
}

async function processarOpcaoNoSubmenu(phone, message, state) {
    const service = state.service;
    const nomeCliente = state.nome ? ', ' + state.nome.split(' ')[0] : '';

    console.log('=== SUBMENU ATIVO: ' + service + ' ===');
    console.log('Opção recebida: ' + message);

        // ⭐ VOLTAR AO MENU PRINCIPAL
    if (message === '0' || message === 'menu' || message === 'voltar') {
        console.log('🔙 Voltando ao menu principal');
        state.nivel = 'principal';
        state.service = null;
        userState.set(phone, state);
        const menu = await getMenuPrincipal();
        await enviarWhatsApp(phone, menu);
        return;
    }


    const opcoesSubmenu = {
        '1': 'preco',
        '2': 'prazo', 
        '3': 'documentos',
        '4': 'processo',
        '5': 'especial',
        '6': 'avaliacao',
        '7': 'especialista'
    };

    if (opcoesSubmenu[message]) {
        switch(message) {
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
                    const msg = '🏛️ **ONDE FAZER O PASSAPORTE**\n\nO passaporte é emitido pela Polícia Federal...\n\n📌 ' + nomeCliente + ' - Você está em: PASSAPORTE\nDigite outra opção (1-7) ou 0 para menu principal';
                    await enviarWhatsApp(phone, msg);
                } else {
                    const msg = '🔄 VISTO NEGADO - RECUPERAÇÃO\n\nTeve o visto negado? Não desanime!\n\n🔗 Análise gratuita: https://getvisa.com.br/visto-americano-negado/\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal';
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
                const msg = '📋 AVALIAÇÃO GRATUITA - ' + getServiceName(service).toUpperCase() + '\n\n🔗 Acesse: ' + link + '\n\n📌 ' + nomeCliente + ' - Você está em: ' + getServiceName(service).toUpperCase() + '\nDigite outra opção (1-7) ou 0 para menu principal';
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

    const intencao = detectarIntencao(message);
    console.log('Intenção detectada no submenu:', intencao);

    if (intencao === 'solicitar_ds160' || intencao === 'iniciar_processo') {
        console.log('🚀 Cliente quer o formulário DS-160 (saindo do submenu)');
        const nomeCliente2 = state.nome || 'Cliente';
        const mensagemFormulario = getMensagemFormularioComEspecialista(nomeCliente2);
        await enviarWhatsApp(phone, mensagemFormulario);
        
        try {
            await supabase
                .from('clientes')
                .update({ status: 'formulario_solicitado', updated_at: new Date().toISOString() })
                .eq('telefone', phone);
        } catch (err) {}
        
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

    // FALLBACK (sem link do WhatsApp)
    const primeiroNomeSub = state?.nome?.split(' ')[0] || 'Cliente';
    const mensagemFallback = `🤔 *Olá ${primeiroNomeSub}!*

Não entendi sua solicitação no menu de ${getServiceName(service).toUpperCase()}. 😅

Mas fique tranquilo(a)! Vamos analisar sua demanda e um especialista entrará em contato em breve.

📧 *E-mail:* contato@getvisa.com.br

💡 *Opções disponíveis neste menu:*
${getSubmenu(service)}

Digite *0* para voltar ao menu principal.`;

    await enviarWhatsApp(phone, mensagemFallback);
}

async function processarMensagem(phone, message) {
    console.log(`📨 processarMensagem: ${phone} -> "${message}"`);
    const telefoneLimpo = limparTelefone(phone);
    if (!telefoneLimpo || telefoneLimpo.length < 10) {
        console.log(`⚠️ Telefone inválido: ${telefoneLimpo}`);
        return;
    }

    // 🆕 Para follow-up automático quando o cliente responde
    try {
        await supabase.from('clientes')
            .update({ followup_parar: true })
            .eq('telefone', telefoneLimpo)
            .eq('followup_parar', false);
    } catch (e) {}

    let cliente = null;
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefone', telefoneLimpo)
            .maybeSingle();
        if (!error && data) cliente = data;
    } catch (err) {}

    if (cliente && cliente.tipo_contato === 'contato_pessoal') {
        console.log(`🔇 Contato pessoal ${telefoneLimpo} - silêncio`);
        return;
    }

    if (cliente && (cliente.tipo_contato === 'cliente' || ['formulario_enviado','agendado_casv','cliente'].includes(cliente.status))) {
        await processarClienteExistente(telefoneLimpo, message, cliente);
        return;
    }

    if (cliente && cliente.tipo_contato === 'lead') {
        await processarLead(telefoneLimpo, message, cliente);
        return;
    }

    let state = userState.get(telefoneLimpo);
    if (!state) {
        state = { step: TRIAGEM_STEPS.PERGUNTAR_TIPO, tipo: null, nome: null, email: null, lastActivity: Date.now() };
        userState.set(telefoneLimpo, state);
    }
    await gerenciarTriagem(telefoneLimpo, message, state);
}

// ============================================================
// HELPERS DE PDF (fora da função, reutilizáveis)
// ============================================================
function formatarDataBR(iso) {
    if (!iso) return '';
    const str = String(iso).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return str;
}

function pegarValor(campo, i) {
    if (campo === null || campo === undefined || campo === '') return null;
    if (Array.isArray(campo)) return campo[i] !== undefined && campo[i] !== '' ? campo[i] : null;
    return i === 0 ? campo : null;
}

function tamanho(campo) {
    if (campo === null || campo === undefined || campo === '') return 0;
    if (Array.isArray(campo)) return campo.length;
    return 1;
}

function juntarSimples(campo, separador = ', ') {
    if (campo === null || campo === undefined || campo === '') return '';
    if (Array.isArray(campo)) return campo.filter(Boolean).join(separador);
    return String(campo);
}

// ============================================================
// GERADOR DE PDF DO DS-160
// ============================================================
async function gerarPDF_DS160(dados) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.font('Helvetica-Bold').fontSize(18).fillColor('#003366').text('Formulário DS-160 - GetVisa Assessoria', { align: 'center' });
        doc.moveDown();

        // ============================================================
        // MONTA OS CAMPOS DO PDF
        // ============================================================
        const todosCampos = {
            // ---- Dados Pessoais ----
            'Consulado/Embaixada': dados.consulado || '',
            'Nome Completo': dados.full_name || dados.nome || '',
            'Outros Sobrenomes': dados.other_surnames || '',
            'Gênero': dados['radio-genero'] === 'MALE' ? 'Masculino'
                    : dados['radio-genero'] === 'FEMALE' ? 'Feminino'
                    : dados['radio-genero'] || '',
            'Estado Civil': dados.marital_status === 'MARRIED' ? 'Casado(a)'
                          : dados.marital_status === 'UNION' ? 'União Estável'
                          : dados.marital_status === 'SINGLE' ? 'Solteiro(a)'
                          : dados.marital_status === 'DIVORCED' ? 'Divorciado(a)'
                          : dados.marital_status === 'WIDOWED' ? 'Viúvo(a)'
                          : dados.marital_status === 'SEPARATED' ? 'Separado(a) Judicialmente'
                          : dados.marital_status === 'OTHER' ? 'Outro'
                          : dados.marital_status || '',
            'Data de Nascimento': formatarDataBR(dados.dob),
            'Cidade de Nascimento': dados.birth_city || '',
            'Estado/Província de Nascimento': dados.birth_state || '',
            'País de Nascimento': dados.birth_country || '',
            'Outra Nacionalidade': dados.other_nat_country || 'Não informado',
            'Residente Permanente de outro país': dados['radio-resident'] === 'one' ? `Sim - ${dados.resident_country || ''}` : 'Não',
            'CPF': dados.cpf || '',
            'SSN (Seguro Social EUA)': dados.ssn || 'Não informado',
            'Tax ID (ITIN)': dados.tax_id || 'Não informado',

            // ---- Informações da Viagem ----
            'Propósito da Viagem': dados.travel_purpose === 'BUSINESS_PLEASURE' ? 'Turismo/Negócios (B1/B2)'
                                 : dados.travel_purpose === 'STUDY' ? 'Estudos'
                                 : dados.travel_purpose === 'OTHER' ? 'Outros'
                                 : dados.travel_purpose || '',
            'Data de Chegada nos EUA': formatarDataBR(dados.arrival_date),
            'Locais a Visitar': dados.places_to_visit || '',
            'Responsável pelo Pagamento': dados['radio-payer'] === 'SELF' ? 'Próprio Solicitante'
                                       : dados['radio-payer'] === 'OTHER' ? 'Outra pessoa/empresa/organização'
                                       : dados['radio-payer'] || '',
            'Nome do Pagador': dados.payer_name || '',
            'Endereço do Pagador': dados.payer_address || '',
            'Cidade do Pagador': dados.payer_city || '',
            'Estado do Pagador': dados.payer_state || '',
            'CEP do Pagador': dados.payer_zip || '',
            'País do Pagador': dados.payer_country || '',
            'Telefone do Pagador': dados.payer_phone || '',
            'Email do Pagador': dados.payer_email || '',

            // ---- Acompanhantes ----
            'Acompanhantes': juntarSimples(dados['companion_name[]']),
            'Relação dos Acompanhantes': juntarSimples(dados['companion_relationship[]']),
            'Nome do Grupo': dados.group_name || '',

            // ---- Viagens Anteriores ----
            'Já esteve nos EUA': dados['radio-us-travel'] === 'one' ? 'Sim' : 'Não',
            'Viagens Anteriores (datas)': juntarSimples(dados['us_travel_date[]']),
            'Duração das Viagens (dias)': juntarSimples(dados['us_travel_duration[]']),
            'Possui Carteira de Habilitação dos EUA': dados['radio-us-driver'] === 'SIM' ? 'Sim' : 'Não',
            'Número da Habilitação': dados.us_driver_number || '',
            'Estado da Habilitação': dados.us_driver_state || '',
            'Já teve visto americano': dados['radio-visa-issued'] === 'one' ? 'Sim' : 'Não',
            'Data da Última Emissão do Visto': formatarDataBR(dados.visa_issued_date),
            'Número do Visto': dados.visa_number || '',
            'Mesmo tipo de visto': dados['radio-same-visa'] === 'YES' ? 'Sim' : 'Não',
            'Mesmo país/cidade da última aplicação': dados['radio-same-location'] === 'YES' ? 'Sim' : 'Não',
            'Impressões digitais coletadas': dados['radio-fingerprints'] === 'YES' ? 'Sim' : 'Não',
            'Visto cancelado/revogado': dados['radio-visa-cancelled'] === 'YES' ? `Sim - ${dados.visa_cancelled_expl || ''}` : 'Não',
            'Visto negado/entrada negada': dados['radio-visa-refused'] === 'one' ? `Sim - ${dados.visa_refused_explanation || ''}` : 'Não',
            'Petição de imigração': dados['radio-petition'] === 'one' ? `Sim - ${dados.petition_details || ''}` : 'Não',

            // ---- Endereço e Contato ----
            'Endereço Residencial': dados.address || '',
            'Cidade': dados.city || '',
            'Estado/Província': dados.state || '',
            'CEP': dados.zip || '',
            'País': dados.country || '',
            'Telefone Principal': dados.phone || dados.telefone || '',
            'Telefone Secundário': dados.phone_secondary || '',
            'Telefone do Trabalho': dados.phone_work || '',
            'Telefones Adicionais': dados.phone_extra || '',
            'E-mail Principal': dados.email || '',
            'E-mails Adicionais': juntarSimples(dados['emails_extra[]']),
            'Redes Sociais': (function() {
                const plats = dados['social_plataforma[]'];
                const ids = dados['social_identificador[]'];
                const total = tamanho(plats);
                if (total === 0) return '';
                const itens = [];
                for (let i = 0; i < total; i++) {
                    const p = pegarValor(plats, i);
                    const h = pegarValor(ids, i);
                    if (p) itens.push(`${p}: ${h || '(sem handle)'}`);
                }
                return itens.join('\n');
            })(),
            'Presença Adicional em Redes Sociais': dados.social_extra || '',

            // ---- Passaporte ----
            'Número do Passaporte': dados.passport_number || '',
            'País/Autoridade Emissora': dados.passport_country || '',
            'Cidade de Emissão': dados.passport_city || '',
            'Estado de Emissão': dados.passport_state || '',
            'Data de Emissão': formatarDataBR(dados.passport_issue),
            'Data de Validade': formatarDataBR(dados.passport_expiry),
            'Passaporte Perdido/Roubado': dados['radio-passport-lost'] === 'SIM' ? 'Sim' : 'Não',
            'Número do BO/Observações': dados.passport_lost_obs || '',
            'Número do Passaporte Perdido': dados.passport_lost_number || '',
            'Data do Ocorrido': formatarDataBR(dados.passport_lost_date),
            'Local do Ocorrido': dados.passport_lost_location || '',

            // ---- Contato nos EUA ----
            'Pessoa de Contato nos EUA': dados.us_contact_name || '',
            'Organização nos EUA': dados.us_contact_org || '',
            'Relação com o Contato': dados.us_contact_relationship || '',
            'Endereço nos EUA': dados.us_contact_address || '',
            'Telefone nos EUA': dados.us_contact_phone || '',
            'Email nos EUA': dados.us_contact_email || '',

            // ---- Informações Familiares ----
            'Nome do Pai': dados.father_name || '',
            'Data de Nascimento do Pai': formatarDataBR(dados.father_dob),
            'Pai nos EUA': dados.father_in_us === 'YES' ? 'Sim' : 'Não',
            'Situação do Pai nos EUA': dados.father_status || '',
            'Nome da Mãe': dados.mother_name || '',
            'Data de Nascimento da Mãe': formatarDataBR(dados.mother_dob),
            'Mãe nos EUA': dados.mother_in_us === 'YES' ? 'Sim' : 'Não',
            'Situação da Mãe nos EUA': dados.mother_status || '',
            'Detalhes dos Parentes Diretos': (function() {
                const nomes = dados['immediate_relative_name[]'];
                const total = tamanho(nomes);
                if (total === 0) return '';
                const itens = [];
                for (let i = 0; i < total; i++) {
                    const n = pegarValor(nomes, i);
                    if (!n) continue;
                    const rel = pegarValor(dados['immediate_relative_relationship[]'], i) || '';
                    const st = pegarValor(dados['immediate_relative_status[]'], i) || '';
                    itens.push(`${n} (${rel} - ${st})`);
                }
                return itens.join('\n');
            })(),
            'Outros Parentes nos EUA': dados['radio-other-relatives'] === 'one' ? `Sim - ${dados.other_relatives_desc || ''}` : 'Não',
            'Nome do Cônjuge/Ex-Cônjuge': dados.spouse_name || '',
            'Data de Nascimento do Cônjuge': formatarDataBR(dados.spouse_dob),
            'Nacionalidade do Cônjuge': dados.spouse_nationality || '',
            'Cidade de Nascimento do Cônjuge': dados.spouse_birth_city || '',
            'País de Nascimento do Cônjuge': dados.spouse_birth_country || '',
            'Endereço do Cônjuge': dados['radio-spouse-address'] === 'SAME' ? 'Mesmo endereço' : dados.spouse_address || '',
            'Cidade do Cônjuge': dados.spouse_address_city || '',
            'Estado do Cônjuge': dados.spouse_address_state || '',
            'CEP do Cônjuge': dados.spouse_address_zip || '',
            'País do Cônjuge': dados.spouse_address_country || '',

            // ---- Trabalho e Educação ----
            'Ocupação Principal': dados['radio-occupation'] === 'Aposentado' ? 'Aposentado(a)'
                                : dados['radio-occupation'] === 'Dona de Casa' ? 'Dona de Casa'
                                : dados['radio-occupation'] === 'Profissional' ? 'Profissional'
                                : dados['radio-occupation'] === 'Estudante' ? 'Estudante'
                                : dados['radio-occupation'] || '',
            'Empregador/Instituição': dados.employer_name || '',
            'Endereço do Empregador': dados.employer_address || '',
            'Cidade do Empregador': dados.employer_city || '',
            'Estado do Empregador': dados.employer_state || '',
            'CEP do Empregador': dados.employer_zip || '',
            'País do Empregador': dados.employer_country || '',
            'Telefone do Empregador': dados.employer_phone || '',
            'Data de Início no Emprego': formatarDataBR(dados.employer_start),
            'Renda Mensal': dados.employer_income || '',
            'Descrição das Funções': dados.employer_duties || '',

            'Outras Ocupações': (function() {
                const nomes = dados['other_employer_name[]'];
                const total = tamanho(nomes);
                if (total === 0) return '';
                const itens = [];
                for (let i = 0; i < total; i++) {
                    const nome = pegarValor(nomes, i);
                    if (!nome) continue;
                    const linhas = [
                        `${nome}`,
                        pegarValor(dados['other_employer_address[]'], i) ? `Endereço: ${pegarValor(dados['other_employer_address[]'], i)}` : null,
                        pegarValor(dados['other_employer_city[]'], i) ? `Cidade: ${pegarValor(dados['other_employer_city[]'], i)}` : null,
                        pegarValor(dados['other_employer_state[]'], i) ? `Estado: ${pegarValor(dados['other_employer_state[]'], i)}` : null,
                        pegarValor(dados['other_employer_zip[]'], i) ? `CEP: ${pegarValor(dados['other_employer_zip[]'], i)}` : null,
                        pegarValor(dados['other_employer_phone[]'], i) ? `Telefone: ${pegarValor(dados['other_employer_phone[]'], i)}` : null,
                        pegarValor(dados['other_employer_start[]'], i) ? `Data Início: ${formatarDataBR(pegarValor(dados['other_employer_start[]'], i))}` : null,
                        pegarValor(dados['other_employer_income[]'], i) ? `Renda: ${pegarValor(dados['other_employer_income[]'], i)}` : null,
                        pegarValor(dados['other_employer_duties[]'], i) ? `Funções: ${pegarValor(dados['other_employer_duties[]'], i)}` : null
                    ].filter(Boolean);
                    itens.push(linhas.join('\n'));
                }
                return itens.join('\n\n');
            })(),

            'Empregos Anteriores': (function() {
                const nomes = dados['prev_employer_name[]'];
                const total = tamanho(nomes);
                if (total === 0) return '';
                const itens = [];
                for (let i = 0; i < total; i++) {
                    const nome = pegarValor(nomes, i);
                    if (!nome) continue;
                    const linhas = [
                        `${nome}`,
                        pegarValor(dados['prev_employer_address[]'], i) ? `Endereço: ${pegarValor(dados['prev_employer_address[]'], i)}` : null,
                        pegarValor(dados['prev_employer_city[]'], i) ? `Cidade: ${pegarValor(dados['prev_employer_city[]'], i)}` : null,
                        pegarValor(dados['prev_employer_state[]'], i) ? `Estado: ${pegarValor(dados['prev_employer_state[]'], i)}` : null,
                        pegarValor(dados['prev_employer_zip[]'], i) ? `CEP: ${pegarValor(dados['prev_employer_zip[]'], i)}` : null,
                        pegarValor(dados['prev_employer_phone[]'], i) ? `Telefone: ${pegarValor(dados['prev_employer_phone[]'], i)}` : null,
                        pegarValor(dados['prev_employer_job[]'], i) ? `Cargo: ${pegarValor(dados['prev_employer_job[]'], i)}` : null,
                        pegarValor(dados['prev_employer_supervisor[]'], i) ? `Supervisor: ${pegarValor(dados['prev_employer_supervisor[]'], i)}` : null,
                        pegarValor(dados['prev_employer_start[]'], i) ? `Data Início: ${formatarDataBR(pegarValor(dados['prev_employer_start[]'], i))}` : null,
                        pegarValor(dados['prev_employer_end[]'], i) ? `Data Fim: ${formatarDataBR(pegarValor(dados['prev_employer_end[]'], i))}` : null,
                        pegarValor(dados['prev_employer_duties[]'], i) ? `Funções: ${pegarValor(dados['prev_employer_duties[]'], i)}` : null
                    ].filter(Boolean);
                    itens.push(linhas.join('\n'));
                }
                return itens.join('\n\n');
            })(),

            'Cursos/Educação': (function() {
                const nomes = dados['edu_institution[]'];
                const total = tamanho(nomes);
                if (total === 0) return '';
                const itens = [];
                for (let i = 0; i < total; i++) {
                    const nome = pegarValor(nomes, i);
                    if (!nome) continue;
                    const linhas = [
                        `${nome}`,
                        pegarValor(dados['edu_address[]'], i) ? `Endereço: ${pegarValor(dados['edu_address[]'], i)}` : null,
                        pegarValor(dados['edu_city[]'], i) ? `Cidade: ${pegarValor(dados['edu_city[]'], i)}` : null,
                        pegarValor(dados['edu_state[]'], i) ? `Estado: ${pegarValor(dados['edu_state[]'], i)}` : null,
                        pegarValor(dados['edu_course[]'], i) ? `Curso: ${pegarValor(dados['edu_course[]'], i)}` : null,
                        pegarValor(dados['edu_start[]'], i) ? `Data Início: ${formatarDataBR(pegarValor(dados['edu_start[]'], i))}` : null,
                        pegarValor(dados['edu_end[]'], i) ? `Data Conclusão: ${formatarDataBR(pegarValor(dados['edu_end[]'], i))}` : null
                    ].filter(Boolean);
                    itens.push(linhas.join('\n'));
                }
                return itens.join('\n\n');
            })(),

            'Idiomas (além do Português)': juntarSimples(dados['languages[]']),
            'Países Visitados (últimos 5 anos)': juntarSimples(dados['traveled_countries[]']),
            'Treinamento Especializado': dados['radio-specialized'] === 'YES' ? `Sim - ${dados.specialized_description || ''}` : 'Não',
            'Serviço Militar': dados['radio-military'] === 'YES' ? 'Sim' : 'Não',
            'Ramo Militar': dados.military_branch || '',
            'Patente Militar': dados.military_rank || '',
            'Especialidade Militar': dados.military_specialty || '',
            'Data de Início no Serviço Militar': formatarDataBR(dados.military_start),
            'Data de Saída do Serviço Militar': formatarDataBR(dados.military_end),

            // ---- Segurança ----
            'Preso ou Condenado': dados['radio-arrested'] === 'YES' ? `Sim - ${dados.arrested_explanation || ''}` : 'Não',
            'Deportado': dados['radio-deported'] === 'YES' ? `Sim - ${dados.deported_explanation || ''}` : 'Não'
        };

        // ============================================================
        // ESCREVE AS SEÇÕES (suporta multi-linha nativo do PDFKit)
        // ============================================================
        function writeSection(title, campos) {
            doc.moveDown(1);
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#003366').text(title, { underline: true });
            doc.moveDown(0.5);
            let has = false;
            for (const [label, value] of Object.entries(campos)) {
                if (value === undefined || value === null || value === '' || value === 'Não informado') continue;
                has = true;

                const valorStr = String(value);
                if (valorStr.indexOf('\n') !== -1) {
                    // Multi-linha: label em negrito, cada linha renderizada SEPARADAMENTE
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('#003366').text(`• ${label}:`);
                    const linhas = valorStr.split('\n');
                    for (let k = 0; k < linhas.length; k++) {
                        const linha = linhas[k];
                        if (linha.trim() === '') {
                            doc.moveDown(0.2);
                            continue;
                        }
                        doc.font('Helvetica').fontSize(10).fillColor('#000000').text('     ' + linha);
                    }
                    doc.moveDown(0.3);
                } else {
                    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(`• ${label}: ${valorStr}`);
                }
            }
            if (!has) doc.font('Helvetica').fontSize(10).fillColor('#000000').text('(Nenhuma informação preenchida)');
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
            'Trabalho e Educacao': ['Ocupação Principal','Empregador/Instituição','Endereço do Empregador','Cidade do Empregador','Estado do Empregador','CEP do Empregador','País do Empregador','Telefone do Empregador','Data de Início no Emprego','Renda Mensal','Descrição das Funções','Outras Ocupações','Empregos Anteriores','Cursos/Educação','Idiomas (além do Português)','Países Visitados (últimos 5 anos)','Treinamento Especializado','Serviço Militar','Ramo Militar','Patente Militar','Especialidade Militar','Data de Início no Serviço Militar','Data de Saída do Serviço Militar'],
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

        // ============================================================
        // APÊNDICE — HISTÓRICO DE ALTERAÇÕES (Fase 3)
        // ============================================================
        const historico = dados.__historico_alteracoes;
        if (Array.isArray(historico) && historico.length > 0) {
            doc.addPage();

            doc.font('Helvetica-Bold').fontSize(16).fillColor('#003366')
                .text('APÊNDICE — Histórico de Alterações', { align: 'center' });
            doc.moveDown(0.3);
            doc.font('Helvetica').fontSize(10).fillColor('#666')
                .text('Documento complementar ao DS-160. Lista as alterações aprovadas após o envio original.', { align: 'center' });
            doc.moveDown(1);

            historico.forEach((h, idx) => {
                doc.font('Helvetica-Bold').fontSize(12).fillColor('#003366')
                    .text(`Alteração #${idx + 1} — ${h.campo_label || h.campo}`);
                doc.moveDown(0.3);

                doc.font('Helvetica').fontSize(10).fillColor('#000000');
                doc.text(`• Campo: ${h.campo_label || h.campo}`);
                doc.text(`• Valor original: ${h.de ? formatarDataBR(h.de) : '(vazio)'}`);
                doc.text(`• Valor novo: ${formatarDataBR(h.para) || '(vazio)'}`);

                if (h.motivo) {
                    doc.text(`• Motivo informado pelo cliente: ${h.motivo}`);
                }

                if (h.observacao_especialista) {
                    doc.text(`• Observação do especialista: ${h.observacao_especialista}`);
                }

                if (h.aprovado_em) {
                    const data = new Date(h.aprovado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                    doc.text(`• Aprovado em: ${data}`);
                }

                doc.moveDown(0.8);

                // Linha separadora
                doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e9ecef').stroke();
                doc.moveDown(0.5);
            });
            
        }

        doc.end();
    });
}

// ============================================================
// 12. ROTAS DA API
// ============================================================
app.post('/api/admin/login', (req, res) => {
    const { apiKey } = req.body;
    const validKey = 'admin123';
    if (!apiKey) return res.status(400).json({ success: false, message: 'Chave não informada.' });
    if (apiKey === validKey) return res.json({ success: true, message: 'Login autorizado' });
    return res.status(401).json({ success: false, message: 'Chave inválida.' });
});

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

app.get('/painel-solicitacoes', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'painel-solicitacoes.html');
    if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(p);
    } else {
        res.status(404).send('<h1>✏️ Solicitações</h1><p>Arquivo painel-solicitacoes.html não encontrado.</p>');
    }
});


app.get('/painel-reenvios', auth.verificarAdmin, (req, res) => {
    const p = path.join(__dirname, 'public', 'painel-reenvios.html');
    if (fs.existsSync(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(p);
    } else {
        res.status(404).send('<h1>⚠️ Reenvios</h1><p>Arquivo painel-reenvios.html não encontrado.</p>');
    }
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

app.get('/meu-processo', (req, res) => {
    const p = path.join(__dirname, 'public', 'meu-processo.html');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send('<h1>Portal não encontrado</h1>');
});



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
    const cpf = data.cpf || '';
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
    return { full_name: nomeEncontrado, email, telefone, consulado, cpf };
}


// ============================================================
// DIFF: compara form_ds160 atual com o que o cliente tentou reenviar
// ============================================================
function calcularDiff(formAntigo, formNovo) {
    const camposPraComparar = {
        'full_name': 'Nome Completo',
        'email': 'E-mail',
        'phone': 'Telefone',
        'consulado': 'Consulado',
        'dob': 'Data de Nascimento',
        'birth_city': 'Cidade de Nascimento',
        'birth_state': 'Estado de Nascimento',
        'passport_number': 'Número do Passaporte',
        'passport_issue': 'Emissão do Passaporte',
        'passport_expiry': 'Validade do Passaporte',
        'address': 'Endereço',
        'city': 'Cidade',
        'state': 'Estado',
        'zip': 'CEP',
        'marital_status': 'Estado Civil',
        'radio-occupation': 'Ocupação',
        'employer_name': 'Empregador',
        'phone_secondary': 'Telefone Secundário',
        'us_contact_name': 'Contato nos EUA',
        'us_contact_address': 'Endereço do Contato nos EUA'
    };

    const mudancas = [];
    for (const [campo, label] of Object.entries(camposPraComparar)) {
        const valorAntigo = (formAntigo[campo] || '').toString().trim();
        const valorNovo = (formNovo[campo] || '').toString().trim();

        if (valorAntigo !== valorNovo && (valorAntigo || valorNovo)) {
            mudancas.push({
                campo: label,
                de: valorAntigo || '(vazio)',
                para: valorNovo || '(vazio)'
            });
        }
    }
    return mudancas;
}

// ============================================================
// ROTA: VERIFICAR STATUS DS-160 (leve, sem salvar nada)
// ============================================================
app.post('/api/check-ds160-status', async (req, res) => {
    try {
        const { telefone } = req.body;
        if (!telefone) {
            return res.status(400).json({ success: false, message: 'Telefone obrigatório' });
        }

        const cleanPhone = limparTelefone(telefone);
        if (!cleanPhone) {
            return res.status(400).json({ success: false, message: 'Telefone inválido' });
        }

        const { data: cliente } = await supabase
            .from('clientes')
            .select('id, nome')
            .eq('telefone', cleanPhone)
            .maybeSingle();

        if (!cliente) {
            return res.json({ success: true, cliente_existe: false, tem_formulario: false });
        }

        const { data: form } = await supabase
            .from('form_ds160')
            .select('id')
            .eq('id_cliente', cliente.id)
            .maybeSingle();

        return res.json({
            success: true,
            cliente_existe: true,
            tem_formulario: !!form,
            nome_cliente: cliente.nome || null
        });
    } catch (error) {
        console.error('❌ Erro em check-ds160-status:', error);
        return res.status(500).json({ success: false, message: 'Erro ao verificar status' });
    }
});

// ============================================================
// ROTA: LISTA DE REENVIOS PENDENTES (painel admin)
// ============================================================
app.get('/api/admin/reenvios-pendentes', auth.verificarAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('form_ds160_reenvios')
            .select('*')
            .eq('tratado', false)
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ success: false, error: error.message });

        // Enriquece com dados do cliente + diff
        const enriquecidos = await Promise.all(
            (data || []).map(async (reenvio) => {
                const { data: cliente } = await supabase
                    .from('clientes')
                    .select('id, nome, telefone, email, consulado')
                    .eq('id', reenvio.id_cliente)
                    .maybeSingle();

                const { data: formAtual } = await supabase
                    .from('form_ds160')
                    .select('dados_formulario')
                    .eq('id_cliente', reenvio.id_cliente)
                    .maybeSingle();

                                const diff = calcularDiff(
                    formAtual?.dados_formulario || {},
                    reenvio.dados_formulario || {}
                );

                // 🆕 FASE 2 — Análise automática da ação recomendada
                let analise = null;
                try {
                    analise = await calcularAcaoReenvio(reenvio.id_cliente);
                } catch (e) {
                    console.error('Erro ao calcular análise:', e);
                }

                return {
                    id: reenvio.id,
                    id_cliente: reenvio.id_cliente,
                    created_at: reenvio.created_at,
                    ip: reenvio.ip,
                    user_agent: reenvio.user_agent,
                    cliente: cliente || null,
                    diff: diff,
                    total_mudancas: diff.length,
                    analise: analise
                };
            })
        );

        res.json({ success: true, reenvios: enriquecidos, total: enriquecidos.length });
    } catch (error) {
        console.error('❌ Erro em reenvios-pendentes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ROTA: MARCAR REENVIO COMO TRATADO
// ============================================================
app.post('/api/admin/reenvios/:id/tratar', auth.verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { observacao } = req.body || {};

        const { error } = await supabase
            .from('form_ds160_reenvios')
            .update({
                tratado: true,
                tratado_em: new Date().toISOString(),
                tratado_por: 'admin',
                observacao_especialista: observacao || ''
            })
            .eq('id', id);

        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, message: 'Reenvio marcado como tratado.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ROTA: CONTADOR DE REENVIOS PENDENTES (badge do dashboard)
// ============================================================
app.get('/api/admin/reenvios/count', auth.verificarAdmin, async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('form_ds160_reenvios')
            .select('*', { count: 'exact', head: true })
            .eq('tratado', false);

        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, count: count || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// PORTAL DO CLIENTE — Endpoints
// ============================================================

// 1. LOGIN — telefone + 4 últimos dígitos do CPF
app.post('/api/portal/login', rateLimitLogin, async (req, res) => {
    try {
        const { telefone, cpfUltimos4 } = req.body || {};
        
        if (!telefone || !cpfUltimos4) {
            return res.status(400).json({ success: false, message: 'Telefone e CPF são obrigatórios' });
        }
        
        const cleanPhone = limparTelefone(telefone);
        if (!cleanPhone || cleanPhone.length < 10) {
            registrarFalhaLogin(req._ipPortal);
            return res.status(400).json({ success: false, message: 'Telefone inválido' });
        }
        
        const { data: cliente } = await supabase
            .from('clientes')
            .select('id, nome, telefone, cpf')
            .eq('telefone', cleanPhone)
            .maybeSingle();
        
        if (!cliente) {
            registrarFalhaLogin(req._ipPortal);
            console.log(`❌ Login portal falhou: telefone ${cleanPhone} não encontrado`);
            return res.status(401).json({ success: false, message: 'Dados não conferem. Verifique e tente novamente.' });
        }
        
        if (!cliente.cpf) {
            registrarFalhaLogin(req._ipPortal);
            return res.status(401).json({ 
                success: false, 
                message: 'Cadastro incompleto. Entre em contato com nossa equipe pelo WhatsApp.' 
            });
        }
        
        const cpfLimpo = cliente.cpf.replace(/\D/g, '');
        const ultimos4Banco = cpfLimpo.slice(-4);
        const ultimos4Digitado = String(cpfUltimos4).replace(/\D/g, '').slice(-4);
        
        if (ultimos4Banco !== ultimos4Digitado) {
            registrarFalhaLogin(req._ipPortal);
            console.log(`❌ Login portal falhou: CPF incorreto para ${cleanPhone}`);
            return res.status(401).json({ success: false, message: 'Dados não conferem. Verifique e tente novamente.' });
        }
        
        // Sucesso — gera token
        limparTentativasLogin(req._ipPortal);
        const token = gerarTokenPortal();
        const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        await supabase.from('portal_acessos').insert({
            id_cliente: cliente.id,
            telefone: cleanPhone,
            token,
            ip: req._ipPortal,
            user_agent: req.headers['user-agent'] || 'desconhecido',
            expira_em: expiraEm,
            ativo: true
        });
        
        console.log(`✅ Login portal: ${cliente.nome} (${cleanPhone})`);
        
        return res.json({
            success: true,
            token,
            nome: cliente.nome,
            expira_em: expiraEm
        });
    } catch (error) {
        console.error('❌ Erro no login portal:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// 2. MEU PROCESSO — dados do cliente (protegido por token)
app.get('/api/portal/meu-processo', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'Token não fornecido' });
        }
        
        const { data: acesso } = await supabase
            .from('portal_acessos')
            .select('id, id_cliente, telefone, expira_em, ativo')
            .eq('token', token)
            .eq('ativo', true)
            .maybeSingle();
        
        if (!acesso) {
            return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada' });
        }
        
        if (new Date(acesso.expira_em) < new Date()) {
            await supabase.from('portal_acessos').update({ ativo: false }).eq('id', acesso.id);
            return res.status(401).json({ success: false, message: 'Sessão expirada. Faça login novamente.' });
        }
        
        // Busca dados completos
        const { data: cliente } = await supabase
            .from('clientes')
            .select('id, nome, email, telefone, status, consulado, data_contato, updated_at')
            .eq('id', acesso.id_cliente)
            .maybeSingle();
        
        const { data: etapa } = await supabase
            .from('etapas_processo')
            .select('*')
            .eq('cliente_telefone', acesso.telefone)
            .maybeSingle();
        
        const { data: form } = await supabase
            .from('form_ds160')
            .select('status, created_at, updated_at')
            .eq('id_cliente', acesso.id_cliente)
            .maybeSingle();
        
        const { count: reenviosCount } = await supabase
            .from('form_ds160_reenvios')
            .select('*', { count: 'exact', head: true })
            .eq('id_cliente', acesso.id_cliente);
        
                // ============================================================
        // RESOLVE A ETAPA ATUAL — combina etapas_processo + clientes.status
        // (garante que funciona mesmo se só uma das tabelas foi atualizada)
        // ============================================================
        const ordemEtapas = [
            'formulario_enviado', 'analise_correcoes', 'abertura_processo',
            'boleto_emitido', 'boleto_pago', 'agendamento_realizado',
            'treinamento_realizado', 'entrevista_realizada', 'visto_aprovado',
            'passaporte_retornado'
        ];

        const mapaStatusParaEtapa = {
            'lead': 'formulario_enviado',
            'formulario_solicitado': 'formulario_enviado',
            'formulario_enviado': 'formulario_enviado',
            'em_analise': 'analise_correcoes',
            'analise_correcoes': 'analise_correcoes',
            'processo_aberto': 'abertura_processo',
            'boleto_emitido': 'boleto_emitido',
            'boleto_pago': 'boleto_pago',
            'agendado_casv': 'agendamento_realizado',
            'agendamento_realizado': 'agendamento_realizado',
            'treinamento_realizado': 'treinamento_realizado',
            'agendado_entrevista': 'agendamento_realizado',
            'entrevista_realizada': 'entrevista_realizada',
            'visto_aprovado': 'visto_aprovado',
            'visto_recusado': 'visto_recusado',
            'passaporte_retornado': 'passaporte_retornado'
        };

        const etapaDeEtapas = etapa?.etapa_atual || null;
        const etapaDeClientes = mapaStatusParaEtapa[cliente?.status] || null;

        // Pega a etapa MAIS AVANÇADA entre as duas fontes
        let etapaAtual = 'formulario_enviado';
        const idxEtapas = etapaDeEtapas ? ordemEtapas.indexOf(etapaDeEtapas) : -1;
        const idxClientes = etapaDeClientes ? ordemEtapas.indexOf(etapaDeClientes) : -1;

        if (idxEtapas >= idxClientes && idxEtapas >= 0) {
            etapaAtual = etapaDeEtapas;
        } else if (idxClientes >= 0) {
            etapaAtual = etapaDeClientes;
        }

        // Caso especial: visto recusado
        if (cliente?.status === 'visto_recusado' || etapaDeEtapas === 'visto_recusado') {
            etapaAtual = 'visto_recusado';
        }

        console.log(`🔍 Portal etapa: etapas_processo=${etapaDeEtapas}, clientes=${etapaDeClientes}, resolvido=${etapaAtual}`);

        // Monta timeline
        const timeline = [];
        
        const indiceAtual = ordemEtapas.indexOf(etapaAtual);
        for (const etapaId of ordemEtapas) {
            const info = ETAPAS[etapaId] || { label: etapaId };
            const indiceEtapa = ordemEtapas.indexOf(etapaId);
            const dataConclusao = etapa?.[`data_${etapaId}`] || null;
            
            timeline.push({
                id: etapaId,
                label: info.label,
                color: info.color || '#6c757d',
                status: indiceEtapa < indiceAtual ? 'concluida' 
                       : indiceEtapa === indiceAtual ? 'atual' 
                       : 'pendente',
                data_conclusao: dataConclusao
            });
        }
        
        // Verifica visto recusado (rota alternativa)
        if (etapaAtual === 'visto_recusado') {
            timeline.push({
                id: 'visto_recusado',
                label: '❌ Visto Recusado',
                color: '#ef4444',
                status: 'atual',
                data_conclusao: etapa?.data_visto_recusado || null
            });
        }
        
        return res.json({
            success: true,
            cliente: {
                nome: cliente?.nome || '',
                email: cliente?.email || '',
                telefone: cliente?.telefone || '',
                status: cliente?.status || '',
                consulado: cliente?.consulado || ''
            },
            etapa_atual: etapaAtual,
            etapa_label: ETAPAS[etapaAtual]?.label || etapaAtual,
            timeline,
            agendamentos: {
                casv: etapa?.dados_casv || null,
                entrevista: etapa?.dados_entrevista || null
            },
            formulario: {
                                enviado: !!form,
                status: form?.status || null,
                data_envio: form?.created_at || null,
                dados: form?.dados_formulario || null
            },
            reenvios: {
                total: reenviosCount || 0,
                ultimo: null
            }
        });
    } catch (error) {
        console.error('❌ Erro em /portal/meu-processo:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// ⚠️ TEMPORÁRIO — Baixa o PDF do DS-160 de um cliente já salvo
app.get('/api/admin/baixar-pdf/:telefone', auth.verificarAdmin, async (req, res) => {
    try {
        const telefone = limparTelefone(req.params.telefone);

        const { data: cliente } = await supabase
            .from('clientes')
            .select('id, nome, telefone')
            .eq('telefone', telefone)
            .maybeSingle();

        if (!cliente) return res.status(404).send('Cliente não encontrado');

        const { data: form } = await supabase
            .from('form_ds160')
            .select('status, created_at, updated_at, dados_formulario')
            .eq('id_cliente', cliente.id)
            .maybeSingle();

        if (!form) return res.status(404).send('Form não encontrado');

        const dados = form.dados_formulario;
        const nomeCliente = dados.full_name || cliente.nome || 'cliente';

        const pdfBuffer = await gerarPDF_DS160(dados);

        const nomeArquivo = `DS160_${nomeCliente.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('❌ Erro ao baixar PDF:', error);
        res.status(500).send('Erro ao gerar PDF: ' + error.message);
    }
});

// 3. LOGOUT — invalida token
app.post('/api/portal/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        if (token) {
            await supabase.from('portal_acessos').update({ ativo: false }).eq('token', token);
        }
        
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Erro interno' });
    }
});


// ============================================================
// FASE 2 — ANÁLISE AUTOMÁTICA DE REENVIO
// ============================================================
function diasUteisAte(dataAlvo) {
    if (!dataAlvo) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const alvo = new Date(dataAlvo); alvo.setHours(0, 0, 0, 0);
    if (isNaN(alvo.getTime())) return null;

    const diffMs = alvo - hoje;
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let uteis = 0;
    const cursor = new Date(hoje);
    for (let i = 0; i < Math.abs(diffDias); i++) {
        cursor.setDate(cursor.getDate() + (diffDias > 0 ? 1 : -1));
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) uteis += (diffDias > 0 ? 1 : -1);
    }
    return { corridos: diffDias, uteis };
}

function parseDataBR(str) {
    if (!str) return null;
    const s = String(str).trim();

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(iso[1], iso[2] - 1, iso[3]);

    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return new Date(br[3], br[2] - 1, br[1]);

    const meses = {
        'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3,
        'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8,
        'outubro': 9, 'novembro': 10, 'dezembro': 11
    };
    const m1 = s.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
    if (m1) {
        const mes = meses[m1[2].toLowerCase()];
        if (mes !== undefined) return new Date(m1[3], mes, m1[1]);
    }
    const m2 = s.match(/(\d{1,2})\s+([a-zç]+),?\s*(\d{4})/i);
    if (m2) {
        const mes = meses[m2[2].toLowerCase()];
        if (mes !== undefined) return new Date(m2[3], mes, m2[1]);
    }
    return null;
}

async function calcularAcaoReenvio(idCliente) {
    try {
        const { data: etapa } = await supabase
            .from('etapas_processo')
            .select('etapa_atual, dados_casv, dados_entrevista, data_formulario_enviado')
            .eq('cliente_id', idCliente)
            .maybeSingle();

        const { data: form } = await supabase
            .from('form_ds160')
            .select('created_at, updated_at')
            .eq('id_cliente', idCliente)
            .maybeSingle();

        const etapaAtual = etapa?.etapa_atual || null;
        const dataCasv = parseDataBR(etapa?.dados_casv?.data);
        const dataEntrevista = parseDataBR(etapa?.dados_entrevista?.data);
        const dataForm = form?.created_at ? new Date(form.created_at) : null;

        // 🆕 Alerta de expiração: começa aos 6 meses
        let alertaExpiracao = null;
        if (dataForm) {
            const mesesDesdeForm = (Date.now() - dataForm.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
            if (mesesDesdeForm >= 12) {
                alertaExpiracao = {
                    nivel: 'critico',
                    meses: Math.floor(mesesDesdeForm),
                    mensagem: `⚠️ CRÍTICO: DS-160 com ${Math.floor(mesesDesdeForm)} meses. Prazo de 12 meses EXPIRADO — refazer OBRIGATÓRIO.`
                };
            } else if (mesesDesdeForm >= 6) {
                alertaExpiracao = {
                    nivel: 'atencao',
                    meses: Math.floor(mesesDesdeForm),
                    mensagem: `⏰ ATENÇÃO: DS-160 com ${Math.floor(mesesDesdeForm)} meses. Faltam ${12 - Math.floor(mesesDesdeForm)} meses para expirar o prazo de reagendamento.`
                };
            }
        }

        // Etapa terminal → encerrado
        if (['visto_aprovado', 'visto_recusado', 'passaporte_retornado', 'entrevista_realizada'].includes(etapaAtual)) {
            return {
                acao: 'ENCERRADO',
                titulo: 'Processo consolidado',
                motivo: `Etapa atual: ${etapaAtual}. Não é possível fazer alterações após entrevista realizada.`,
                cor: 'cinza',
                contexto: { etapa_atual: etapaAtual, alerta_expiracao: alertaExpiracao }
            };
        }

        // CASV no futuro
        if (dataCasv) {
            const info = diasUteisAte(dataCasv);
            if (info && info.corridos > 0) {
                if (info.corridos >= 5) {
                    return {
                        acao: 'PERMITIR',
                        titulo: 'Permitir novo DS-160',
                        motivo: `Faltam ${info.corridos} dias (${info.uteis} úteis) para o CASV. Tempo suficiente para refazer o DS-160 e atualizar o AA number.`,
                        cor: 'verde',
                        contexto: {
                            data_casv: etapa.dados_casv?.data,
                            dias_ate_casv: info.corridos,
                            dias_uteis_ate_casv: info.uteis,
                            alerta_expiracao: alertaExpiracao
                        }
                    };
                } else {
                    return {
                        acao: 'BLOQUEAR',
                        titulo: 'Não permitir alteração',
                        motivo: `Faltam apenas ${info.corridos} dias (${info.uteis} úteis) para o CASV. Abaixo do limite mínimo de 5 dias — não há tempo hábil.`,
                        cor: 'vermelho',
                        contexto: {
                            data_casv: etapa.dados_casv?.data,
                            dias_ate_casv: info.corridos,
                            dias_uteis_ate_casv: info.uteis,
                            alerta_expiracao: alertaExpiracao
                        }
                    };
                }
            }
        }

        // CASV passou, entrevista futura
        if (dataCasv && dataEntrevista) {
            const infoEntrevista = diasUteisAte(dataEntrevista);
            if (infoEntrevista && infoEntrevista.corridos > 0) {
                return {
                    acao: 'AGUARDAR_48H',
                    titulo: 'Aguardar 48h após CASV',
                    motivo: `CASV já passou. Entrevista em ${infoEntrevista.corridos} dias. Alterações só após 48h do CASV.`,
                    cor: 'amarelo',
                    contexto: {
                        data_casv: etapa.dados_casv?.data,
                        data_entrevista: etapa.dados_entrevista?.data,
                        dias_ate_entrevista: infoEntrevista.corridos,
                        alerta_expiracao: alertaExpiracao
                    }
                };
            }
        }

        // Tudo passou → reagendar
        if (dataEntrevista && diasUteisAte(dataEntrevista)?.corridos <= 0) {
            return {
                acao: 'REAGENDAR',
                titulo: 'Reagendar CASV e Entrevista',
                motivo: `Entrevista já passou. Novo DS-160 + reagendamento obrigatório.`,
                cor: 'amarelo',
                contexto: {
                    data_entrevista: etapa.dados_entrevista?.data,
                    alerta_expiracao: alertaExpiracao
                }
            };
        }

        // Sem agendamento
        return {
            acao: 'PERMITIR',
            titulo: 'Permitir novo DS-160',
            motivo: `Sem agendamento ativo no momento. Cliente pode refazer o DS-160 livremente.`,
            cor: 'verde',
            contexto: { alerta_expiracao: alertaExpiracao }
        };

    } catch (error) {
        console.error('❌ Erro em calcularAcaoReenvio:', error);
        return {
            acao: 'ERRO',
            titulo: 'Erro na análise',
            motivo: 'Não foi possível calcular automaticamente.',
            cor: 'cinza',
            contexto: {}
        };
    }
}


// ============================================================
// FASE 3 — ALTERAÇÃO PONTUAL DE CAMPO DO DS-160
// ============================================================

// Campos editáveis (só os críticos)
const CAMPOS_EDITAVEIS = {
    // ─── CONSULADO ───
    'consulado':        { label: 'Consulado', tipo: 'text', sensivel: true, categoria: '🏛️ Consulado' },
    // ─── DADOS PESSOAIS ───
    'full_name':        { label: 'Nome Completo', tipo: 'text', sensivel: true, categoria: '🧑 Dados Pessoais' },
    'other_surnames':   { label: 'Outros Sobrenomes', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'dob':              { label: 'Data de Nascimento', tipo: 'date', sensivel: true, categoria: '🧑 Dados Pessoais' },
    'cpf':              { label: 'CPF', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'email':            { label: 'E-mail', tipo: 'email', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'phone':            { label: 'Telefone Principal', tipo: 'tel', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'marital_status':   { label: 'Estado Civil', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'birth_city':       { label: 'Cidade de Nascimento', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'birth_state':      { label: 'Estado de Nascimento', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'birth_country':    { label: 'País de Nascimento', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'other_nat_country':{ label: 'Outra Nacionalidade', tipo: 'text', sensivel: false, categoria: '🧑 Dados Pessoais' },
    'ssn':              { label: 'SSN (Seguro Social EUA)', tipo: 'text', sensivel: true, categoria: '🧑 Dados Pessoais' },
    'tax_id':           { label: 'Tax ID (ITIN)', tipo: 'text', sensivel: true, categoria: '🧑 Dados Pessoais' },

    // ─── ENDEREÇO E CONTATO ───
    'address':          { label: 'Endereço Residencial', tipo: 'text', sensivel: false, categoria: '📍 Endereço' },
    'city':             { label: 'Cidade', tipo: 'text', sensivel: false, categoria: '📍 Endereço' },
    'state':            { label: 'Estado/Província', tipo: 'text', sensivel: false, categoria: '📍 Endereço' },
    'zip':              { label: 'CEP', tipo: 'text', sensivel: false, categoria: '📍 Endereço' },
    'country':          { label: 'País', tipo: 'text', sensivel: false, categoria: '📍 Endereço' },
    'phone_secondary':  { label: 'Telefone Secundário', tipo: 'tel', sensivel: false, categoria: '📍 Endereço' },
    'phone_work':       { label: 'Telefone do Trabalho', tipo: 'tel', sensivel: false, categoria: '📍 Endereço' },

    // ─── PASSAPORTE ───
    'passport_number':  { label: 'Número do Passaporte', tipo: 'text', sensivel: true, categoria: '🛂 Passaporte' },
    'passport_issue':   { label: 'Data de Emissão', tipo: 'date', sensivel: false, categoria: '🛂 Passaporte' },
    'passport_expiry':  { label: 'Data de Validade', tipo: 'date', sensivel: false, categoria: '🛂 Passaporte' },
    'passport_city':    { label: 'Cidade de Emissão', tipo: 'text', sensivel: false, categoria: '🛂 Passaporte' },
    'passport_state':   { label: 'Estado de Emissão', tipo: 'text', sensivel: false, categoria: '🛂 Passaporte' },
    'passport_country': { label: 'País do Passaporte', tipo: 'text', sensivel: false, categoria: '🛂 Passaporte' },

    // ─── TRABALHO ───
    'radio-occupation': { label: 'Ocupação Principal', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_name':    { label: 'Empregador/Instituição', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_address': { label: 'Endereço do Empregador', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_city':    { label: 'Cidade do Empregador', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_state':   { label: 'Estado do Empregador', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_zip':     { label: 'CEP do Empregador', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_country': { label: 'País do Empregador', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_phone':   { label: 'Telefone do Empregador', tipo: 'tel', sensivel: false, categoria: '💼 Trabalho' },
    'employer_start':   { label: 'Data de Início no Emprego', tipo: 'date', sensivel: false, categoria: '💼 Trabalho' },
    'employer_income':  { label: 'Renda Mensal (R$)', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },
    'employer_duties':  { label: 'Descrição das Funções', tipo: 'text', sensivel: false, categoria: '💼 Trabalho' },

    // ─── VIAGEM ───
    'travel_purpose':   { label: 'Propósito da Viagem', tipo: 'text', sensivel: true, categoria: '✈️ Viagem' },
    'arrival_date':     { label: 'Data de Chegada nos EUA', tipo: 'date', sensivel: false, categoria: '✈️ Viagem' },
    'places_to_visit':  { label: 'Locais a Visitar', tipo: 'text', sensivel: false, categoria: '✈️ Viagem' },

    // ─── CONTATO NOS EUA ───
    'us_contact_name':         { label: 'Nome do Contato', tipo: 'text', sensivel: false, categoria: '🇺🇸 Contato EUA' },
    'us_contact_org':          { label: 'Organização', tipo: 'text', sensivel: false, categoria: '🇺🇸 Contato EUA' },
    'us_contact_relationship': { label: 'Relação com o Contato', tipo: 'text', sensivel: false, categoria: '🇺🇸 Contato EUA' },
    'us_contact_address':      { label: 'Endereço nos EUA', tipo: 'text', sensivel: false, categoria: '🇺🇸 Contato EUA' },
    'us_contact_phone':        { label: 'Telefone nos EUA', tipo: 'tel', sensivel: false, categoria: '🇺🇸 Contato EUA' },
    'us_contact_email':        { label: 'Email nos EUA', tipo: 'email', sensivel: false, categoria: '🇺🇸 Contato EUA' },

    // ─── FAMÍLIA ───
    'father_name':       { label: 'Nome do Pai', tipo: 'text', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'father_dob':        { label: 'Data de Nascimento do Pai', tipo: 'date', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'mother_name':       { label: 'Nome da Mãe', tipo: 'text', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'mother_dob':        { label: 'Data de Nascimento da Mãe', tipo: 'date', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'spouse_name':       { label: 'Nome do Cônjuge', tipo: 'text', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'spouse_dob':        { label: 'Data de Nascimento do Cônjuge', tipo: 'date', sensivel: false, categoria: '👨‍👩‍👧 Família' },
    'spouse_nationality':{ label: 'Nacionalidade do Cônjuge', tipo: 'text', sensivel: false, categoria: '👨‍👩‍👧 Família' }

};

// Campos que geram alerta de complexidade
function detectarComplexidade(campo) {
    if (campo === 'consulado') return 'consulado';
    if (campo === 'full_name') return 'nome';
    if (campo === 'other_surnames') return 'nome';
    if (campo === 'dob') return 'dob';
    if (campo === 'passport_number') return 'passaporte';
    if (campo === 'passport_expiry') return 'passaporte';
    if (campo === 'ssn') return 'documento';
    if (campo === 'tax_id') return 'documento';
    if (campo === 'travel_purpose') return 'viagem';
    return null;
}

function mensagemAlerta(complexidade) {
    const alertas = {
        'consulado': '⚠️ Mudança de consulado pode exigir reagendamento completo. Avaliar antes de aprovar.',
        'nome': '⚠️ Mudança de nome pode exigir retificação junto ao consulado. Avaliar com cuidado.',
        'dob': '⚠️ Mudança de data de nascimento é sensível. Confirmar com o cliente antes.',
        'passaporte': '⚠️ Mudança de passaporte pode exigir atualização no sistema do consulado (AIS).',
        'documento': '⚠️ Alteração de documento fiscal/social. Confirmar dados com o cliente.',
        'viagem': '⚠️ Mudança de propósito da viagem pode impactar o tipo de visto. Avaliar.'
    };
    return alertas[complexidade] || null;
}

// Mensagens de alerta
function mensagemAlerta(complexidade) {
    const alertas = {
        'consulado': '⚠️ Mudança de consulado pode exigir reagendamento completo. Avaliar antes de aprovar.',
        'nome': '⚠️ Mudança de nome pode exigir retificação junto ao consulado. Avaliar com cuidado.',
        'dob': '⚠️ Mudança de data de nascimento é sensível. Confirmar com o cliente antes.',
        'passaporte': '⚠️ Mudança de passaporte pode exigir atualização no sistema do consulado (AIS).'
    };
    return alertas[complexidade] || null;
}

// Notificação pra equipe
async function notificarSolicitacaoAlteracao(cliente, campo, valorAntigo, valorNovo, motivo, complexidade) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const labelCampo = CAMPOS_EDITAVEIS[campo]?.label || campo;
    const alerta = mensagemAlerta(complexidade);

    // Email
    try {
        const emailEquipe = process.env.EMAIL_DESTINO_EQUIPE || 'contato@getvisa.com.br';
        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: emailEquipe,
            subject: `✏️ Solicitação de alteração - ${cliente.nome} (${labelCampo})`,
            html: `
                <h2 style="color:#003366;">✏️ Cliente solicitou alteração de campo</h2>
                ${alerta ? `<p style="background:#fff3cd;padding:12px;border-left:4px solid #ffc107;">${alerta}</p>` : ''}
                <h3>Dados:</h3>
                <ul>
                    <li><strong>Cliente:</strong> ${cliente.nome}</li>
                    <li><strong>Telefone:</strong> ${cliente.telefone}</li>
                    <li><strong>Campo:</strong> ${labelCampo}</li>
                    <li><strong>De:</strong> ${valorAntigo || '(vazio)'}</li>
                    <li><strong>Para:</strong> ${valorNovo}</li>
                    <li><strong>Motivo:</strong> ${motivo || '(não informado)'}</li>
                    <li><strong>Data:</strong> ${dataHora}</li>
                </ul>
                <p>🗂️ <a href="https://app.getvisa.com.br/painel-solicitacoes?api_key=admin123">Analisar no painel</a></p>
            `
        });
    } catch (e) { console.error('Erro email solicitação:', e); }

    // WhatsApp equipe
    try {
        const zapEquipe = process.env.WHATSAPP_EQUIPE || process.env.ADMIN_PHONE || '5521974601812';
        const msg = `✏️ *SOLICITAÇÃO DE ALTERAÇÃO*\n\n` +
            `👤 ${cliente.nome}\n` +
            `📱 ${cliente.telefone}\n\n` +
            `*Campo:* ${labelCampo}\n` +
            `*De:* ${valorAntigo || '(vazio)'}\n` +
            `*Para:* ${valorNovo}\n` +
            `*Motivo:* ${motivo || '(não informado)'}\n\n` +
            `${alerta || ''}\n\n` +
            `Analisar: https://app.getvisa.com.br/painel-solicitacoes?api_key=admin123`;
        await enviarWhatsApp(zapEquipe, msg);
    } catch (e) { console.error('Erro WhatsApp solicitação:', e); }
}

// Endpoint 1 — Cliente solicita alteração
app.post('/api/portal/solicitar-alteracao-campo', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

        const { data: acesso } = await supabase
            .from('portal_acessos')
            .select('id, id_cliente, telefone, expira_em, ativo')
            .eq('token', token)
            .eq('ativo', true)
            .maybeSingle();

        if (!acesso) return res.status(401).json({ success: false, message: 'Sessão inválida' });
        if (new Date(acesso.expira_em) < new Date()) {
            await supabase.from('portal_acessos').update({ ativo: false }).eq('id', acesso.id);
            return res.status(401).json({ success: false, message: 'Sessão expirada' });
        }

        const { campo, valor_novo, motivo } = req.body || {};
        if (!campo || !valor_novo) {
            return res.status(400).json({ success: false, message: 'Campo e valor novo são obrigatórios' });
        }
        if (!CAMPOS_EDITAVEIS[campo]) {
            return res.status(400).json({ success: false, message: 'Campo não editável' });
        }

        // Verifica se já tem solicitação pendente pro mesmo campo
        const { data: pendenteExistente } = await supabase
            .from('solicitacoes_alteracao_campo')
            .select('id')
            .eq('id_cliente', acesso.id_cliente)
            .eq('campo', campo)
            .eq('status', 'pendente')
            .maybeSingle();

        if (pendenteExistente) {
            return res.status(400).json({
                success: false,
                message: 'Você já tem uma solicitação pendente para este campo. Aguarde a análise.'
            });
        }

        // Pega o valor antigo
        const { data: form } = await supabase
            .from('form_ds160')
            .select('dados_formulario')
            .eq('id_cliente', acesso.id_cliente)
            .maybeSingle();

        const valorAntigo = form?.dados_formulario?.[campo] || null;
        const complexidade = detectarComplexidade(campo);

        // Salva solicitação
        const { data: solicitacao, error } = await supabase
            .from('solicitacoes_alteracao_campo')
            .insert({
                id_cliente: acesso.id_cliente,
                campo,
                valor_antigo: String(valorAntigo || ''),
                valor_novo: String(valor_novo),
                motivo: motivo || '',
                alerta_complexidade: complexidade
            })
            .select()
            .single();

        if (error) {
            console.error('Erro ao salvar solicitação:', error);
            return res.status(500).json({ success: false, message: 'Erro ao salvar' });
        }

        // Busca dados do cliente pra notificação
        const { data: cliente } = await supabase
            .from('clientes')
            .select('id, nome, telefone, email')
            .eq('id', acesso.id_cliente)
            .maybeSingle();

        // Notifica equipe (sem bloquear resposta)
        notificarSolicitacaoAlteracao(cliente, campo, valorAntigo, valor_novo, motivo, complexidade).catch(console.error);

        return res.json({
            success: true,
            message: 'Solicitação enviada! Nossa equipe vai analisar em breve.',
            solicitacao: {
                id: solicitacao.id,
                campo,
                valor_antigo: valorAntigo,
                valor_novo,
                status: 'pendente'
            }
        });

    } catch (error) {
        console.error('Erro em /solicitar-alteracao-campo:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// Endpoint 2 — Cliente vê suas solicitações
app.get('/api/portal/minhas-solicitacoes', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });

        const { data: acesso } = await supabase
            .from('portal_acessos')
            .select('id_cliente, expira_em, ativo')
            .eq('token', token)
            .eq('ativo', true)
            .maybeSingle();

        if (!acesso) return res.status(401).json({ success: false, message: 'Sessão inválida' });

        const { data: solicitacoes } = await supabase
            .from('solicitacoes_alteracao_campo')
            .select('*')
            .eq('id_cliente', acesso.id_cliente)
            .order('created_at', { ascending: false });

        return res.json({
            success: true,
            solicitacoes: (solicitacoes || []).map(s => ({
                id: s.id,
                campo: s.campo,
                campo_label: CAMPOS_EDITAVEIS[s.campo]?.label || s.campo,
                valor_antigo: s.valor_antigo,
                valor_novo: s.valor_novo,
                motivo: s.motivo,
                status: s.status,
                observacao_especialista: s.observacao_especialista,
                created_at: s.created_at,
                tratado_em: s.tratado_em
            }))
        });
    } catch (error) {
        console.error('Erro em /minhas-solicitacoes:', error);
        return res.status(500).json({ success: false, message: 'Erro interno' });
    }
});


// ============================================================
// FASE 3 — ENDPOINTS ADMIN (solicitações de alteração)
// ============================================================

// Lista todas as solicitações (com dados do cliente)
app.get('/api/admin/solicitacoes-campo', auth.verificarAdmin, async (req, res) => {
    try {
        const statusFiltro = req.query.status || 'pendente';

        let query = supabase
            .from('solicitacoes_alteracao_campo')
            .select('*')
            .order('created_at', { ascending: false });

        if (statusFiltro !== 'todas') {
            query = query.eq('status', statusFiltro);
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ success: false, error: error.message });

        // Enriquece com dados do cliente
        const enriquecidos = await Promise.all(
            (data || []).map(async (s) => {
                const { data: cliente } = await supabase
                    .from('clientes')
                    .select('id, nome, telefone, email')
                    .eq('id', s.id_cliente)
                    .maybeSingle();

                return {
                    id: s.id,
                    campo: s.campo,
                    campo_label: CAMPOS_EDITAVEIS[s.campo]?.label || s.campo,
                    valor_antigo: s.valor_antigo,
                    valor_novo: s.valor_novo,
                    motivo: s.motivo,
                    status: s.status,
                    observacao_especialista: s.observacao_especialista,
                    alerta_complexidade: s.alerta_complexidade,
                    alerta_mensagem: mensagemAlerta(s.alerta_complexidade),
                    created_at: s.created_at,
                    tratado_em: s.tratado_em,
                    cliente: cliente || null
                };
            })
        );

        res.json({ success: true, solicitacoes: enriquecidos, total: enriquecidos.length });
    } catch (error) {
        console.error('Erro em /admin/solicitacoes-campo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Contador pro badge do dashboard
app.get('/api/admin/solicitacoes-campo/count', auth.verificarAdmin, async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('solicitacoes_alteracao_campo')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pendente');

        if (error) return res.status(500).json({ success: false, error: error.message });
        res.json({ success: true, count: count || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aprovar solicitação → aplica mudança no form
app.post('/api/admin/solicitacoes-campo/:id/aprovar', auth.verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { observacao } = req.body || {};

        // 1. Busca a solicitação
        const { data: sol } = await supabase
            .from('solicitacoes_alteracao_campo')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (!sol) return res.status(404).json({ success: false, message: 'Solicitação não encontrada' });
        if (sol.status !== 'pendente') {
            return res.status(400).json({ success: false, message: 'Solicitação já foi tratada' });
        }

        // 2. Busca o form atual
        const { data: formAtual } = await supabase
            .from('form_ds160')
            .select('id, dados_formulario')
            .eq('id_cliente', sol.id_cliente)
            .maybeSingle();

        if (!formAtual) return res.status(404).json({ success: false, message: 'Formulário não encontrado' });

        // 3. Aplica a alteração no JSONB
        const dadosNovos = { ...(formAtual.dados_formulario || {}) };
        const valorAntigoReal = dadosNovos[sol.campo];
        dadosNovos[sol.campo] = sol.valor_novo;

        // 4. Adiciona no histórico interno (apêndice)
        if (!dadosNovos.__historico_alteracoes) dadosNovos.__historico_alteracoes = [];
        dadosNovos.__historico_alteracoes.push({
            campo: sol.campo,
            campo_label: CAMPOS_EDITAVEIS[sol.campo]?.label || sol.campo,
            de: valorAntigoReal || '',
            para: sol.valor_novo,
            motivo: sol.motivo || '',
            aprovado_em: new Date().toISOString(),
            observacao_especialista: observacao || ''
        });

        // 5. Atualiza form_ds160
        const { error: updateError } = await supabase
            .from('form_ds160')
            .update({
                dados_formulario: dadosNovos,
                updated_at: new Date().toISOString()
            })
            .eq('id', formAtual.id);

        if (updateError) {
            console.error('Erro ao aplicar alteração:', updateError);
            return res.status(500).json({ success: false, message: 'Erro ao aplicar alteração' });
        }

        // 6. Atualiza status da solicitação
        await supabase
            .from('solicitacoes_alteracao_campo')
            .update({
                status: 'aprovada',
                observacao_especialista: observacao || '',
                tratado_em: new Date().toISOString(),
                tratado_por: 'admin',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        // 7. Notifica cliente (não bloqueia resposta)
        try {
            const { data: cliente } = await supabase
                .from('clientes')
                .select('nome, telefone, email')
                .eq('id', sol.id_cliente)
                .maybeSingle();

            const nome = cliente?.nome?.split(' ')[0] || 'Cliente';
            const labelCampo = CAMPOS_EDITAVEIS[sol.campo]?.label || sol.campo;

            // WhatsApp cliente
            try {
                const msgWhats = `✅ *Alteração aprovada!*\n\nOlá ${nome}!\n\nSua solicitação para alterar *${labelCampo}* foi aprovada.\n\n📌 De: ${valorAntigoReal || '(vazio)'}\n📌 Para: ${sol.valor_novo}\n\n✏️ Seu formulário foi atualizado automaticamente.\n\n📊 Acompanhe: https://app.getvisa.com.br/meu-processo`;
                await enviarWhatsApp(cliente.telefone, msgWhats);
            } catch (e) { console.error('Erro WhatsApp cliente aprovação:', e); }

            // Email cliente
            try {
                if (cliente?.email) {
                    await resend.emails.send({
                        from: 'GetVisa <contato@getvisa.com.br>',
                        to: cliente.email,
                        subject: `✅ Alteração aprovada - ${labelCampo}`,
                        html: `<h2 style="color:#16a34a;">✅ Alteração aprovada!</h2>
                               <p>Olá ${nome},</p>
                               <p>Sua solicitação de alteração foi <strong>aprovada</strong>.</p>
                               <table style="border-collapse:collapse;margin:15px 0;">
                                   <tr><td style="padding:5px 15px 5px 0;"><strong>Campo:</strong></td><td>${labelCampo}</td></tr>
                                   <tr><td style="padding:5px 15px 5px 0;"><strong>De:</strong></td><td>${valorAntigoReal || '(vazio)'}</td></tr>
                                   <tr><td style="padding:5px 15px 5px 0;"><strong>Para:</strong></td><td>${sol.valor_novo}</td></tr>
                                   ${observacao ? `<tr><td style="padding:5px 15px 5px 0;"><strong>Observação:</strong></td><td>${observacao}</td></tr>` : ''}
                               </table>
                               <p>Seu formulário foi atualizado automaticamente.</p>
                               <p>📊 <a href="https://app.getvisa.com.br/meu-processo">Acessar portal</a></p>`
                    });
                }
            } catch (e) { console.error('Erro email cliente aprovação:', e); }

            // Notifica equipe
            try {
                const emailEquipe = process.env.EMAIL_DESTINO_EQUIPE || 'contato@getvisa.com.br';
                await resend.emails.send({
                    from: 'GetVisa <contato@getvisa.com.br>',
                    to: emailEquipe,
                    subject: `✅ Alteração aplicada - ${cliente?.nome || 'Cliente'} (${labelCampo})`,
                    html: `<h3 style="color:#16a34a;">✅ Alteração aplicada com sucesso</h3>
                           <ul>
                               <li><strong>Cliente:</strong> ${cliente?.nome}</li>
                               <li><strong>Campo:</strong> ${labelCampo}</li>
                               <li><strong>De:</strong> ${valorAntigoReal || '(vazio)'}</li>
                               <li><strong>Para:</strong> ${sol.valor_novo}</li>
                               ${observacao ? `<li><strong>Observação:</strong> ${observacao}</li>` : ''}
                           </ul>
                           <p>Formulário DS-160 atualizado no sistema.</p>`
                });
            } catch (e) { console.error('Erro email equipe aprovação:', e); }
        } catch (notifError) {
            console.error('Erro geral notificação aprovação:', notifError);
        }

        console.log(`✅ Solicitação ${id} aprovada — campo ${sol.campo} atualizado`);
        res.json({ success: true, message: 'Alteração aplicada e cliente notificado' });

    } catch (error) {
        console.error('Erro em /aprovar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rejeitar solicitação
app.post('/api/admin/solicitacoes-campo/:id/rejeitar', auth.verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { observacao } = req.body || {};

        if (!observacao || !observacao.trim()) {
            return res.status(400).json({ success: false, message: 'Motivo da rejeição é obrigatório' });
        }

        const { data: sol } = await supabase
            .from('solicitacoes_alteracao_campo')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (!sol) return res.status(404).json({ success: false, message: 'Solicitação não encontrada' });
        if (sol.status !== 'pendente') {
            return res.status(400).json({ success: false, message: 'Solicitação já foi tratada' });
        }

        await supabase
            .from('solicitacoes_alteracao_campo')
            .update({
                status: 'rejeitada',
                observacao_especialista: observacao,
                tratado_em: new Date().toISOString(),
                tratado_por: 'admin',
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        // Notifica cliente
        try {
            const { data: cliente } = await supabase
                .from('clientes')
                .select('nome, telefone')
                .eq('id', sol.id_cliente)
                .maybeSingle();

            const nome = cliente?.nome?.split(' ')[0] || 'Cliente';
            const labelCampo = CAMPOS_EDITAVEIS[sol.campo]?.label || sol.campo;

            const msgWhats = `📋 *Sobre sua solicitação*\n\nOlá ${nome}!\n\nAnalisamos seu pedido de alteração em *${labelCampo}* e no momento não foi possível aprovar.\n\n📌 *Motivo:* ${observacao}\n\n💬 Se tiver dúvidas, fale com um especialista:\n👉 https://wa.me/5521974601812`;
            await enviarWhatsApp(cliente?.telefone, msgWhats);
        } catch (e) { console.error('Erro WhatsApp rejeição:', e); }

        console.log(`❌ Solicitação ${id} rejeitada`);
        res.json({ success: true, message: 'Solicitação rejeitada e cliente notificado' });

    } catch (error) {
        console.error('Erro em /rejeitar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================
// NOTIFICAÇÃO DE REENVIO DS-160 (feature nova)
// ============================================================
async function notificarReenvioDS160(clienteData, nomeValido, emailValido, cleanPhone, formData) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // 1. Email urgente pra equipe
    try {
        const emailEquipe = process.env.EMAIL_DESTINO_EQUIPE || 'contato@getvisa.com.br';
        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: emailEquipe,
            subject: `🚨 REENVIO DS-160 - ${nomeValido} (${cleanPhone})`,
            html: `
                <h2 style="color:#c00;">🚨 Cliente tentou reenviar o DS-160</h2>
                <p style="background:#fff3cd;padding:12px;border-left:4px solid #c00;">
                    <strong>⚠️ AÇÃO NECESSÁRIA:</strong> Entre em contato com o cliente imediatamente.
                    Alterações após envio do DS-160 precisam ser feitas por um especialista.
                </p>
                <h3>Dados do cliente:</h3>
                <ul>
                    <li><strong>Nome:</strong> ${nomeValido}</li>
                    <li><strong>Telefone:</strong> ${cleanPhone}</li>
                    <li><strong>Email:</strong> ${emailValido}</li>
                    <li><strong>ID cliente:</strong> ${clienteData.id}</li>
                </ul>
                <h3>Tentativa de reenvio:</h3>
                <ul>
                    <li><strong>Data/hora:</strong> ${dataHora}</li>
                </ul>
                <hr>
                <p>📌 Os dados completos da tentativa estão salvos na tabela <code>form_ds160_reenvios</code>.</p>
                <p>🗂️ <a href="https://app.getvisa.com.br/painel">Acessar painel</a></p>
            `
        });
        console.log('✅ Email de reenvio enviado para equipe');
    } catch (e) {
        console.error('❌ Erro ao enviar email de reenvio:', e);
    }

    // 2. WhatsApp pra equipe
    try {
        const zapEquipe = process.env.WHATSAPP_EQUIPE || process.env.ADMIN_PHONE || '5521974601812';
        const msg = `🚨 *REENVIO DS-160 DETECTADO*\n\n` +
            `👤 *Cliente:* ${nomeValido}\n` +
            `📱 *Telefone:* ${cleanPhone}\n` +
            `📧 *Email:* ${emailValido}\n` +
            `🕐 *Quando:* ${dataHora}\n\n` +
            `⚠️ *AÇÃO:* Entrar em contato — cliente tentou alterar formulário já enviado.\n\n` +
            `📌 Dados salvos em form_ds160_reenvios`;
        await enviarWhatsApp(zapEquipe, msg);
        console.log('✅ WhatsApp de reenvio enviado para equipe');
    } catch (e) {
        console.error('❌ Erro ao enviar WhatsApp de reenvio:', e);
    }
}

app.post('/api/submit-ds160', async (req, res) => {
    console.log('🔔 Rota /api/submit-ds160 chamada!');
    try {
        const formData = req.body;
        const { full_name, email, telefone, consulado, cpf } = extractFormFields(formData);
        let nomeValido = full_name || formData.nome_completo || formData.fullName || '';
        let emailValido = email || formData['email-1'] || '';
        let telefoneValido = telefone || formData['text-77'] || '';
        if (!nomeValido || !emailValido || !telefoneValido) {
            return res.status(400).json({ success: false, message: 'Nome, email e telefone são obrigatórios.' });
        }
                const cleanPhone = limparTelefone(telefoneValido);
        if (!cleanPhone) return res.status(400).json({ success: false, message: 'Número de telefone inválido.' });

        const BLOQUEAR_REENVIO = process.env.BLOCK_DS160_RESUBMIT === 'true';

        // ============================================================
        // 1. VERIFICA SE CLIENTE JÁ EXISTE (SEM upsert — só SELECT)
        // ============================================================
        const { data: clienteExistente } = await supabase
            .from('clientes')
            .select('id, telefone')
            .eq('telefone', cleanPhone)
            .maybeSingle();

        // ============================================================
        // 2. VERIFICA SE JÁ EXISTE FORMULÁRIO DS-160
        // ============================================================
        let formExistente = null;
        if (clienteExistente) {
            const { data } = await supabase
                .from('form_ds160')
                .select('id, id_cliente')
                .eq('id_cliente', clienteExistente.id)
                .maybeSingle();
            formExistente = data;
        }

        // ============================================================
        // 3. BLOQUEIO DE REENVIO (feature flag BLOCK_DS160_RESUBMIT)
        //    ⚠️ Roda ANTES do upsert — NÃO sobrescreve nome/email/consulado
        // ============================================================
        if (formExistente && BLOQUEAR_REENVIO) {
            console.log('🚨 REENVIO BLOQUEADO - cliente já possui form_ds160:', clienteExistente.id);

            // 3.1. Registra tentativa em form_ds160_reenvios (histórico)
            try {
                const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                        || req.socket?.remoteAddress
                        || 'desconhecido';
                const userAgent = req.headers['user-agent'] || 'desconhecido';

                const { error: reenvioError } = await supabase
                    .from('form_ds160_reenvios')
                    .insert({
                        id_cliente: clienteExistente.id,
                        dados_formulario: formData,
                        ip,
                        user_agent: userAgent
                    });

                if (reenvioError) {
                    console.error('❌ Erro ao registrar reenvio:', reenvioError);
                } else {
                    console.log('✅ Reenvio registrado em form_ds160_reenvios');
                }
            } catch (regError) {
                console.error('❌ Erro ao registrar tentativa de reenvio:', regError);
            }

            // 3.2. Atualiza APENAS data_contato (PRESERVA nome, email, consulado)
            try {
                await supabase.from('clientes')
                    .update({
                        data_contato: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', clienteExistente.id);
                console.log('✅ data_contato atualizada (nome/email/consulado preservados)');
            } catch (updError) {
                console.error('❌ Erro ao atualizar data_contato:', updError);
            }

            // 3.3. Notifica equipe (email + WhatsApp)
            try {
                await notificarReenvioDS160(
                    { id: clienteExistente.id },
                    nomeValido, emailValido, cleanPhone, formData
                );
            } catch (notifError) {
                console.error('❌ Erro ao notificar equipe sobre reenvio:', notifError);
            }

            // 3.4. Retorna — NÃO faz upsert, NÃO toca em form_ds160
            return res.status(200).json({
                success: true,
                requires_contact: true,
                message: 'Você já possui um formulário DS-160 enviado. Para fazer qualquer alteração, entre em contato com um especialista.',
                whatsapp: process.env.WHATSAPP_EQUIPE || '5521974601812'
            });
        }

        // ============================================================
        // 4. FLUXO NORMAL (primeira vez OU bloqueio desligado)
        //    Aqui SIM faz upsert em clientes
        // ============================================================
                const { data: clienteData, error: clienteError } = await supabase
            .from('clientes')
            .upsert({
                telefone: cleanPhone,
                nome: nomeValido,
                email: emailValido,
                consulado: consulado || '',
                cpf: cpf || null,
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

        // 4.1. Cria/atualiza form_ds160 (só se NÃO foi bloqueado)
        if (formExistente) {
            await supabase.from('form_ds160')
                .update({ dados_formulario: formData, status: 'rascunho', updated_at: new Date().toISOString() })
                .eq('id', formExistente.id);
        } else {
            await supabase.from('form_ds160')
                .insert({
                    id_cliente: clienteData.id,
                    dados_formulario: formData,
                    status: 'rascunho',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
        }

            try {
            const primeiroNome = nomeValido.split(' ')[0];
            const mensagemWhats = `🎉 *Olá ${primeiroNome}!*\n\nRecebemos seu formulário DS-160 com sucesso! ✅\n\n📋 *Dados recebidos:*\n👤 Nome: ${nomeValido}\n📧 Email: ${emailValido}\n📱 Telefone: ${cleanPhone}\n🏛️ Consulado: ${consulado || 'Não informado'}\n\n⏳ *Próximos passos:*\n1️⃣ Nossa equipe fará a análise dos dados\n2️⃣ Você receberá a confirmação no Whatsapp\n3️⃣ Iniciaremos o agendamento da entrevista\n\n📱 Dúvidas? Fale conosco: [Fale com nosso especialista](https://wa.me/5521974601812)` +
                rodapePortal() +
                `\n\n🌟 *GetVisa Assessoria - Seu visto americano com segurança!* 🇺🇸`;
            await enviarWhatsApp(cleanPhone, mensagemWhats);
        } catch (whatsError) { console.error('❌ Erro ao enviar notificação WhatsApp:', whatsError); }
        // GERA PDF DO FORMULÁRIO
        let pdfBuffer = null;
        try {
            const { data: formDataSaved, error: formError } = await supabase
                .from('form_ds160')
                .select('*')
                .eq('id_cliente', clienteData.id)
                .maybeSingle();
            if (!formError && formDataSaved) {
                const dadosParaPDF = formDataSaved.dados_formulario || formDataSaved;
                pdfBuffer = await gerarPDF_DS160(dadosParaPDF);
                console.log('✅ PDF gerado com sucesso:', clienteData.id);
            } else {
                console.log('⚠️ Form não encontrado:', formError);
            }
        } catch (pdfError) {
            console.error('❌ Erro ao gerar PDF:', pdfError);
        }


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

        try {
            await enviarWhatsApp(process.env.ADMIN_PHONE, `📋 *NOVO FORMULÁRIO DS-160 RECEBIDO!*\n\n👤 Nome: ${nomeValido}\n📱 Telefone: ${cleanPhone}\n📧 Email: ${emailValido}\n🏛️ Consulado: ${consulado || 'Não informado'}\n\n📱 Entre em contato com o cliente para dar início ao processo.`);
        } catch (err) {}

        res.json({ success: true, message: 'Formulário recebido com sucesso!', data: { nome: nomeValido, email: emailValido, telefone: cleanPhone } });
    } catch (error) {
        console.error('❌ Erro ao processar formulário:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar formulário', error: error.message });
    }
});

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

        // ============================================================
// PROTEÇÃO: nunca regride se entrevista já foi realizada
// (antes disso, regressão é permitida — ex: cliente faltou e vai reagendar)
// ============================================================
const ETAPAS_BLOQUEADAS = [
    'entrevista_realizada',
    'visto_aprovado',
    'visto_recusado',
    'passaporte_retornado'
];

const { data: etapaAtualData } = await supabase
    .from('etapas_processo')
    .select('etapa_atual')
    .eq('cliente_telefone', telefone)
    .maybeSingle();

const etapaAtualNome = etapaAtualData?.etapa_atual || 'formulario_enviado';
const estaBloqueada = ETAPAS_BLOQUEADAS.includes(etapaAtualNome);

const etapaParaGravar = estaBloqueada ? etapaAtualNome : 'agendado_casv';

if (estaBloqueada) {
    console.log(`🛡️ Etapa preservada: ${etapaAtualNome} (entrevista já realizada — não regride)`);
} else {
    console.log(`✅ Etapa avança/atualiza para agendado_casv (de: ${etapaAtualNome})`);
}

// Upsert com etapa protegida
await supabase.from('etapas_processo').upsert({
    cliente_telefone: telefone,
    etapa_atual: etapaParaGravar,
    data_agendado_casv: new Date().toISOString(),
    dados_casv: casv,
    dados_entrevista: entrevista,
    protocolo_ds160: req.protocolo || null,
    data_atualizacao: new Date().toISOString(),
    updated_at: new Date().toISOString()
}, { onConflict: 'cliente_telefone' });

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

        // Só atualiza status do cliente se não estiver bloqueado
if (!estaBloqueada) {
    await supabase.from('clientes')
        .update({ status: 'agendado_casv', updated_at: new Date().toISOString() })
        .eq('telefone', telefone);
    console.log(`✅ Status cliente atualizado para agendado_casv`);
} else {
    console.log(`🛡️ Status cliente preservado: ${etapaAtualNome}`);
}

        res.json({ success: true, message: 'PDF processado e enviado com sucesso!', data: { casv, entrevista, protocolo: req.protocolo || null, comunicacoes: { email: emailEnviado, whatsapp: whatsEnviado } } });
    } catch (error) {
        console.error('❌ Erro no upload do PDF:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar PDF', error: error.message });
    }
});

app.post('/api/webhook/zapi', async (req, res) => {
    res.status(200).send('OK');
    (async () => {
        try {
            const body = req.body || {};

            // ============================================================
            // 🚨 FILTROS DE SEGURANÇA — ignora tipos de mensagem que NÃO
            // devem ser processados pelo bot
            // ============================================================

            // 1. Grupos
            if (body.isGroup === true) {
                console.log('🔇 Mensagem de grupo ignorada');
                return;
            }

            // 2. Mensagens enviadas pelo próprio bot (evita loop)
            if (body.fromMe === true) {
                console.log('🔇 Mensagem do próprio bot ignorada');
                return;
            }

            // 3. Status/Stories do WhatsApp
            if (body.isStatusReply === true) {
                console.log('🔇 Resposta de status ignorada');
                return;
            }

            // 4. Newsletter/Canal
            if (body.isNewsletter === true) {
                console.log('🔇 Mensagem de newsletter/canal ignorada');
                return;
            }

            // 5. Broadcast (listas de transmissão)
            if (body.isBroadcast === true || body.broadcast === true) {
                console.log('🔇 Mensagem de broadcast ignorada');
                return;
            }

            // Extrai telefone e mensagem (formato varia por tipo de payload)
            const telefone = body.phone || body.from || '';
            const mensagem = body.text?.message || body.message || body.text || '';

            if (!telefone || !mensagem) return;

            // Ignora se o telefone tiver sufixo de grupo (defesa extra)
            if (typeof telefone === 'string' && telefone.includes('-group')) {
                console.log('🔇 Telefone com sufixo -group ignorado');
                return;
            }

            const telefoneLimpo = limparTelefone(telefone);
            if (telefoneLimpo) await processarMensagem(telefoneLimpo, mensagem);
        } catch (err) { console.error('❌ Erro no webhook:', err); }
    })();
});

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
        const { data: insertData, error: insertError } = await supabase.from('clientes_finalizados').insert({
            telefone: cliente.telefone, nome: cliente.nome, email: email || null, servico: servico,
            data_inicio: cliente.criado_em || new Date().toISOString(), data_finalizacao: new Date().toISOString(),
            observacoes: observacoes || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).select().single();
        if (insertError) {
            const { data: updateData, error: updateError } = await supabase.from('clientes_finalizados').update({
                servico, data_finalizacao: new Date().toISOString(), observacoes: observacoes || `Processo finalizado com ${resultado}`, updated_at: new Date().toISOString()
            }).eq('telefone', telefone).select().single();
            if (updateError) return res.status(500).json({ erro: updateError.message });
        }
        await supabase.from('clientes_ativos').delete().eq('telefone', telefone);
        await supabase.from('clientes').delete().eq('telefone', telefone);
        await supabase.from('contatos_amigos').delete().eq('telefone', telefone);
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
        await supabase.from('clientes_finalizados').insert({
            telefone: cliente.telefone, nome: cliente.nome, email: cliente.email || null,
            servico: 'Visto Americano', data_inicio: cliente.criado_em || new Date().toISOString(),
            data_finalizacao: new Date().toISOString(), observacoes: nota || `Processo finalizado com ${resultado}`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        await supabase.from('clientes_ativos').delete().eq('telefone', cliente.telefone);
        await supabase.from('clientes').delete().eq('telefone', cliente.telefone);
        await supabase.from('contatos_amigos').delete().eq('telefone', cliente.telefone);
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

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString(), supabase: !!supabase }));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/api/status', (req, res) => res.json({ status: 'online', port: PORT, timestamp: new Date().toISOString(), supabase: !!supabase }));

app.post('/api/test-receive', (req, res) => { console.log('📨 Teste receive:', req.body); res.json({ success: true }); });
app.post('/api/debug/criar-cliente', async (req, res) => { /* ... */ });
app.get('/api/debug/verificar-tabela', async (req, res) => { /* ... */ });
app.post('/api/debug/criar-tabela', async (req, res) => { /* ... */ });
app.post('/api/debug/testar-webhook', async (req, res) => { /* ... */ });
app.post('/api/test/webhook-manual', async (req, res) => { /* ... */ });
app.get('/api/test/zapi', async (req, res) => { /* ... */ });
app.get('/api/admin/verificar-cliente/:telefone', async (req, res) => { /* ... */ });

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

app.post('/api/agendar-treinamento', async (req, res) => {
    try {
        const { cliente_id, entrevista_id, tipo, data, horario } = req.body;
        if (!cliente_id || !data || !horario) return res.status(400).json({ success: false, message: 'Dados incompletos' });
        const { data: cliente, error: clienteError } = await supabase.from('clientes').select('id').eq('id', cliente_id).single();
        if (clienteError || !cliente) return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        const novoAgendamento = { cliente_id, atividade: 'Treinamento', data_agendamento: data, hora_agendamento: horario, local_agendamento: tipo, observacoes: `Treinamento para entrevista. Tipo: ${tipo}. Entrevista ID: ${entrevista_id || 'N/A'}`, concluido: false };
        const { data: agendamento, error } = await supabase.from('agendamentos').insert([novoAgendamento]).select().single();
        if (error) return res.status(500).json({ success: false, message: error.message });
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

// ============================================================
// ⚠️ DESATIVADO em 15/09/2026 — Código morto
// Motivo: as rotas /api/submit-ds160, /api/buscar/:telefone e /api/test
// já são cobertas (ou não são usadas) pelo server.js.
// O handler /submit-ds160 aqui duplicava o do server.js:1924, mas nunca
// era chamado (Express usa o primeiro registrado).
// Para reativar: descomentar as 2 linhas abaixo.
// ============================================================
// try {
//     const ds160Routes = require('./routes/ds160Routes');
//     app.use('/api', ds160Routes);
// } catch (e) {}
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
// FOLLOW-UP AUTOMÁTICO DE LEADS
// 3 tentativas: 24h, 48h, 72h após cadastro
// Para quando: cliente responde OU preenche DS-160
// ============================================================
async function processarFollowupLeads() {
    console.log('📬 Iniciando follow-up automático de leads...');
    
    try {
        // Busca candidatos: leads completos, sem form, sem flag parar
        const { data: leads, error } = await supabase
            .from('clientes')
            .select('id, nome, telefone, email, created_at, followup_1_em, followup_2_em, followup_3_em')
            .eq('tipo_contato', 'lead')
            .eq('followup_parar', false)
            .not('nome', 'is', null)
            .not('email', 'is', null)
            .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        
        if (error) {
            console.error('❌ Erro ao buscar leads:', error);
            return;
        }
        
        if (!leads || leads.length === 0) {
            console.log('✅ Nenhum lead pendente de follow-up.');
            return;
        }
        
        console.log(`📋 ${leads.length} leads para verificar`);
        
        const agora = Date.now();
        const HORA = 60 * 60 * 1000;
        
        for (const lead of leads) {
            try {
                // Verifica se já preencheu o form (se sim, para)
                const { data: form } = await supabase
                    .from('form_ds160')
                    .select('id')
                    .eq('id_cliente', lead.id)
                    .maybeSingle();
                
                if (form) {
                    await supabase.from('clientes')
                        .update({ followup_parar: true })
                        .eq('id', lead.id);
                    console.log(`✅ ${lead.nome} já preencheu DS-160 — follow-up cancelado`);
                    continue;
                }
                
                const criado = new Date(lead.created_at).getTime();
                const horasDesdeCadastro = (agora - criado) / HORA;
                const primeiroNome = (lead.nome || 'Cliente').split(' ')[0];
                
                let mensagem = null;
                let qualFollowup = null;
                
                // Follow-up #1 — 24h+
                if (horasDesdeCadastro >= 24 && !lead.followup_1_em) {
                    mensagem = `Oi ${primeiroNome}! Como vai? 😊\n\n` +
                        `Notei que você começou seu cadastro com a gente mas não recebi seu formulário DS-160 ainda.\n\n` +
                        `Tá tudo bem? Teve alguma dificuldade? Ficou com alguma pergunta pendente?\n\n` +
                        `Se quiser, posso te acompanhar no preenchimento — é rapidinho e garanto que sai tudo certinho ✨\n\n` +
                        `📋 Link: https://app.getvisa.com.br/formulario-ds160`;
                    qualFollowup = 1;
                }
                // Follow-up #2 — 48h+
                else if (horasDesdeCadastro >= 48 && !lead.followup_2_em) {
                    mensagem = `Oi ${primeiroNome}!\n\n` +
                        `Passando aqui pra saber se você ainda tem interesse no seu visto americano 🇺🇸\n\n` +
                        `Se quiser ajuda pra preencher, é só responder:\n` +
                        `👉 AJUDA\n\n` +
                        `Se preferir o link direto pra preencher sozinho(a):\n` +
                        `👉 https://app.getvisa.com.br/formulario-ds160\n\n` +
                        `Qualquer coisa, estamos por aqui! 😊`;
                    qualFollowup = 2;
                }
                // Follow-up #3 — 72h+ (último)
                else if (horasDesdeCadastro >= 72 && !lead.followup_3_em) {
                    mensagem = `Oi ${primeiroNome}, tudo bem?\n\n` +
                        `Esse é meu último contato sobre o formulário do seu visto. 😊\n\n` +
                        `Se ainda tiver interesse, é só responder por aqui — estamos prontos pra te ajudar!\n\n` +
                        `Caso contrário, sem problemas. Fica à vontade pra voltar quando quiser. 🙌`;
                    qualFollowup = 3;
                }
                
                                if (mensagem) {
                    await enviarWhatsApp(lead.telefone, mensagem, true);

                    // Monta objeto explícito (evita problema de computed property no Supabase JS)
                    const agora = new Date().toISOString();
                    const updateObj = { updated_at: agora };
                    
                    if (qualFollowup === 1) updateObj.followup_1_em = agora;
                    if (qualFollowup === 2) updateObj.followup_2_em = agora;
                    if (qualFollowup === 3) updateObj.followup_3_em = agora;

                    const { error: updateErr } = await supabase
                        .from('clientes')
                        .update(updateObj)
                        .eq('id', lead.id);

                    if (updateErr) {
                        console.error(`❌ Erro ao marcar followup_${qualFollowup} para ${lead.telefone}:`, updateErr);
                    } else {
                        console.log(`✅ Follow-up #${qualFollowup} enviado e registrado para ${lead.nome}`);
                    }
                }
            } catch (err) {
                console.error(`❌ Erro no follow-up de ${lead.telefone}:`, err);
            }
        }
        
        console.log('✅ Follow-up concluído.');
    } catch (error) {
        console.error('❌ Erro no cron de follow-up:', error);
    }
}

// ============================================================
// 13. CRON JOB E LIMPEZA DE ESTADO
// ============================================================
// Follow-up automático de leads — roda a cada 6h
cron.schedule('0 */6 * * *', () => {
    console.log('⏰ Cron follow-up de leads executado');
    processarFollowupLeads();
});
// Cron job para lembretes (placeholder – pode ser implementado depois)
cron.schedule('*/5 * * * *', () => {
    console.log('⏰ Cron job executado (lembretes)');
    // Aqui você pode adicionar a lógica real de lembretes, se desejar
});

// 🔥 Limpeza automática de estados inativos (timeout de 5 minutos)
// Remove estados de triagem/submenu quando o usuário fica inativo por mais de 5 minutos
setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutos em milissegundos
    let removidos = 0;

    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > timeout) {
            userState.delete(phone);
            removidos++;
        }
    }

    if (removidos > 0) {
        console.log(`🧹 Limpeza automática: ${removidos} estado(s) removido(s) por inatividade.`);
    }
}, 60 * 1000); // Verifica a cada minuto


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