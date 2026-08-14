// server.js
console.log('--- DEBUG: server.js carregado no topo (VERSAO UNIFICADA) ---');

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
const fs = require('fs'); // Necessário para salvar PDFs localmente

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY || '');
const PORT = process.env.PORT || 10000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY; // Chave para rotas administrativas

// ============================================================
// 2. CONFIGURAÇÃO DO SUPABASE
// ============================================================
let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Usando SERVICE_ROLE_KEY para operações de servidor

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ URL do Supabase:', supabaseUrl);
console.log('✅ Cliente Supabase inicializado com SERVICE_ROLE_KEY');

// ============================================================
// 3. MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 4. CONSTANTES
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
// 5. ESTADO DO USUÁRIO (PARA O BOT)
// ============================================================
const userState = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of userState.entries()) {
        if (data.lastActivity && (now - data.lastActivity) > 30 * 60 * 1000) { // 30 minutos
            userState.delete(phone);
        }
    }
}, 60 * 1000); // Executa a cada minuto

// ============================================================
// 6. FUNÇÕES AUXILIARES GERAIS
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
// 7. FUNÇÕES DE ENVIO DE MENSAGENS (WHATSAPP E EMAIL)
// ============================================================

// Função global para enviar mensagens via Z-API
async function enviarWhatsApp(telefone, mensagem) {
    const ZAPI_INSTANCE_ID = String(process.env.ZAPI_INSTANCE_ID || '').trim();
    const ZAPI_TOKEN = String(process.env.ZAPI_TOKEN || '').trim();
    const ZAPI_CLIENT_TOKEN = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

    if (!ZAPI_TOKEN || !ZAPI_INSTANCE_ID) {
        console.error('❌ ZAPI_TOKEN ou ZAPI_INSTANCE_ID ausentes. Não é possível enviar WhatsApp.');
        return false;
    }

    const urlZapi = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
    const headers = { 'Content-Type': 'application/json' };
    if (ZAPI_CLIENT_TOKEN) {
        headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    }

    try {
        const responseZapi = await fetch(urlZapi, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                phone: telefone,
                message: mensagem
            })
        });

        const respostaTexto = await responseZapi.text();
        let dataZapi;
        try {
            dataZapi = respostaTexto ? JSON.parse(respostaTexto) : {};
        } catch {
            dataZapi = respostaTexto;
        }

        console.log(`📨 Z-API status para ${telefone}: ${responseZapi.status}`);
        console.log('📨 Z-API resposta:', dataZapi);

        if (!responseZapi.ok) {
            console.error('❌ Falha ao enviar resposta via Z-API:', dataZapi);
            return false;
        }
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem WhatsApp:', error);
        return false;
    }
}

// Função para enviar PDF via WhatsApp
async function enviarPDFWhatsApp(telefone, pdfBuffer, nomeCliente) {
    const ZAPI_INSTANCE_ID = String(process.env.ZAPI_INSTANCE_ID || '').trim();
    const ZAPI_TOKEN = String(process.env.ZAPI_TOKEN || '').trim();
    const ZAPI_CLIENT_TOKEN = String(process.env.ZAPI_CLIENT_TOKEN || '').trim();

    if (!ZAPI_TOKEN || !ZAPI_INSTANCE_ID) {
        console.error('❌ ZAPI_TOKEN ou ZAPI_INSTANCE_ID ausentes. Não é possível enviar PDF por WhatsApp.');
        return false;
    }

    const urlZapi = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-document/base64`;
    const headers = { 'Content-Type': 'application/json' };
    if (ZAPI_CLIENT_TOKEN) {
        headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    }

    try {
        const responseZapi = await fetch(urlZapi, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                phone: telefone,
                document: pdfBuffer.toString('base64'),
                filename: `DS160_${nomeCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                caption: `🎉 Olá ${nomeCliente}! Seu formulário DS-160 está pronto! Segue o PDF para sua revisão. Em breve nossa equipe entrará em contato com os próximos passos.`
            })
        });

        const respostaTexto = await responseZapi.text();
        let dataZapi;
        try {
            dataZapi = respostaTexto ? JSON.parse(respostaTexto) : {};
        } catch {
            dataZapi = respostaTexto;
        }

        console.log(`📨 Z-API PDF status para ${telefone}: ${responseZapi.status}`);
        console.log('📨 Z-API PDF resposta:', dataZapi);

        if (!responseZapi.ok) {
            console.error('❌ Falha ao enviar PDF via Z-API:', dataZapi);
            return false;
        }
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar PDF WhatsApp:', error);
        return false;
    }
}

// Função global para enviar respostas do bot (usada pelo webhook)
async function sendReply(cleanPhone, message) {
    return enviarWhatsApp(cleanPhone, message);
}

// ============================================================
// 8. FUNÇÕES DE CLASSIFICAÇÃO E RESPOSTAS DO BOT
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

  // --- SAUDACOES ---
  const saudacoes = [
    'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'tudo bem', 'hello', 'hi'
  ];
  if (saudacoes.some((item) => texto === item || texto.startsWith(`${item} `))) {
    console.log('DEBUG detectarIntencao: Intenção detectada: saudacao');
    return 'saudacao';
  }

  // --- SOLICITAR FORMULARIO DS-160 ---
  if (
    ['ds160', 'formulario ds160', 'quero preencher ds160', 'preciso do ds160',
     'formulario visto americano', 'preencher visto americano', 'quero o formulario', 'link do formulario'].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: solicitar_ds160');
    return 'solicitar_ds160';
  }

  // --- ANDAMENTO ---
  if (
    [
      'status', 'andamento', 'situacao', 'etapa', 'fase', 'progresso',
      'como esta meu processo', 'como esta o meu processo', 'qual o andamento', 'qual a situacao'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: andamento');
    return 'andamento';
  }

  // --- DOCUMENTOS ---
  if (
    [
      'documento', 'documentos', 'documentacao', 'requisito', 'requisitos',
      'papel', 'papeis'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: documentos');
    return 'documentos';
  }

  // --- PRAZO ---
  if (
    [
      'prazo', 'quanto tempo', 'quanto demora', 'demora', 'dias', 'semanas',
      'agendamento', 'processamento'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: prazo');
    return 'prazo';
  }

  // --- PAGAMENTO ---
  if (
    [
      'pagamento', 'pagar', 'preco', 'valor', 'valores', 'quanto custa',
      'custo', 'investimento', 'taxa'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: pagamento');
    return 'pagamento';
  }

  // --- AJUDA ---
  if (
    [
      'ajuda', 'atendente', 'especialista', 'falar com alguem',
      'contato', 'humano'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: ajuda');
    return 'ajuda';
  }

  // --- VISTO NEGADO ---
  if (
    [
      'negado', 'negativa', 'recusado', 'recusaram', 'deportado', 'visto negado'
    ].some((item) => texto.includes(item))
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_negado');
    return 'visto_negado';
  }

  // --- VISTO AMERICANO ---
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

  // --- VISTO CANADENSE ---
  if (
    texto.includes('visto canadense') ||
    texto.includes('visto canada')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_canadense');
    return 'visto_canadense';
  }

  // --- VISTO AUSTRALIANO ---
  if (
    texto.includes('visto australiano') ||
    texto.includes('visto australia')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: visto_australiano');
    return 'visto_australiano';
  }

  // --- ETA UK ---
  if (
    texto.includes('eta uk') ||
    texto.includes('reino unido') ||
    texto.includes('inglaterra')
  ) {
    console.log('DEBUG detectarIntencao: Intenção detectada: eta_uk');
    return 'eta_uk';
  }

  // --- PASSAPORTE ---
  if (texto.includes('passaporte')) {
    console.log('DEBUG detectarIntencao: Intenção detectada: passaporte');
    return 'passaporte';
  }

  // --- INICIAR PROCESSO ---
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

// Helper para a mensagem do formulário DS-160 para o BOT
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
  console.log(respostas);

  return (
    respostas[intencao] ||
    `Olá, ${primeiroNome}!\n\n` +
      `Não consegui identificar sua solicitação.\n\n` +
      `Você pode perguntar sobre documentos, prazo, pagamento ou andamento do processo.`
  );
}

// ============================================================
// 9. FUNÇÕES DE MENU (BOT)
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
// 10. FUNÇÕES DE ONBOARDING (BOT)
// ============================================================

async function processarOnboarding(cleanPhone, messageText, state) {
    console.log('=== PROCESSANDO ONBOARDING ===');
    console.log('Passo atual: ' + state.onboardingStep);
    console.log('Mensagem: "' + messageText + '"');

    const telefoneLimpo = cleanPhone.toString().replace(/\D/g, '');
    console.log('📱 Telefone limpo para uso:', telefoneLimpo);

    // Comandos de escape
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

                        // SALVAR NOME COM UPSERT
            try {
                console.log('DEBUG SUPABASE: Tentando upsert para telefone:', telefoneLimpo, 'nome:', nomeFormatado);
                const { data, error } = await supabase
                    .from('clientes_novos')
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
                    .from('clientes_novos')
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
        '5': 'especial', // Pode ser 'onde_fazer' para passaporte ou 'visto_negado' para outros
        '6': 'avaliacao',
        '7': 'especialista'
    };

    // Tenta processar como opção numérica do submenu
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
                    const msg = '🏛️ ONDE FAZER O PASSAPORTE\n\n' +
                               '📍 Polícia Federal (agendamento obrigatório)\n' +
                               '🌐 Site: <a href="https://www.gov.br/pf/pt-br/assuntos/passaporte" target="_blank" style="text-decoration: underline;">https://www.gov.br/pf/pt-br/assuntos/passaporte</a>\n\n' +
                               '📋 Passo a passo:\n' +
                               '1. Acesse o site da PF\n' +
                               '2. Preencha o formulário online\n' +
                               '3. Pague a taxa GRU (~R$ 257)\n' +
                               '4. Agende o atendimento\n' +
                               '5. Compareça ao posto com os documentos\n\n' +
                               '💡 Dica: Agende com antecedência!\n\n' +
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
        return; // Retorna após processar a opção numérica
    }

    // Se não for uma opção numérica do submenu, tenta detectar uma intenção geral
    const intencaoDetectada = detectarIntencao(messageText);
    console.log('DEBUG processarOpcaoNoSubmenu: Tentando detectar intenção geral:', intencaoDetectada);

    if (intencaoDetectada && intencaoDetectada !== 'desconhecida') {
        const respostaIntencao = gerarRespostaBot(intencaoDetectada, state.nome, null); // Passa null para etapaAtual
        if (respostaIntencao) {
            await sendReply(cleanPhone, respostaIntencao);
            return;
        }
    }

    // Se não for opção numérica nem intenção geral, então é inválida
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
    console.log('Estado recebido:', JSON.stringify(state, null, 2));

    try {
        // MAPEAMENTO DE SERVIÇOS
        const servicoMap = {
            '1': 'visto_americano',
            '2': 'visto_canadense',
            '3': 'visto_australiano',
            '4': 'eta_uk',
            '5': 'eta_canadense',
            '6': 'passaporte'
        };

        // PROCESSAR ESCOLHA DE SERVIÇO (NÚMEROS)
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

        // OPÇÃO 7 - AJUDA / CONTATO
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

        // DETECTAR INTENÇÃO
        let intent = null;
        try {
            intent = detectarIntencao(messageText); // Usando a função detectarIntencao do bot
            console.log('Intenção detectada:', intent);
        } catch (err) {
            console.error('❌ Erro ao detectar intenção:', err);
            intent = null;
        }

        // INTENÇÃO: INICIAR PROCESSO ou SOLICITAR DS-160
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
                const mensagemFormulario = getMensagemFormularioParaBot(nomeCliente); // Usando a função do bot
                await sendReply(cleanPhone, mensagemFormulario);
            } catch (err) {
                console.error('❌ Erro ao gerar mensagem do formulário:', err);
                // Fallback
                await sendReply(cleanPhone, '🌟 Vamos iniciar seu processo!\n\n📋 Preencha nosso formulário:\n🔗 <a href="https://getvisa.com.br/formulario-ds160" target="_blank" style="text-decoration: underline;">https://getvisa.com.br/formulario-ds160</a>\n\n📱 Dúvidas? <a href="https://wa.me/5521974601812" target="_blank" style="text-decoration: underline;">https://wa.me/5521974601812</a>');
            }
            return;
        }

        // INTENÇÃO: VISTO AMERICANO (direto para o submenu)
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

        // OUTRAS INTENÇÕES (respostas diretas)
        if (intent) {
            try {
                const resposta = gerarRespostaBot(intent, state.nome, state.etapaAtual); // Usando gerarRespostaBot do bot
                await sendReply(cleanPhone, resposta + '\n\nDigite 0 para o menu principal');
            } catch (err) {
                console.error('❌ Erro ao processar intenção:', err);
                await sendReply(cleanPhone, '📋 Entendi sua pergunta! Digite 0 para o menu principal.');
            }
            return;
        }

        // FALLBACK - MENSAGEM NÃO RECONHECIDA
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
// 11. FUNÇÃO PRINCIPAL DE PROCESSAMENTO DE MENSAGENS (BOT)
// ============================================================

// ============================================================
// FUNÇÕES DE ONBOARDING - VERSÃO CORRIGIDA E COM DEBUG
// ============================================================

async function processarOnboarding(cleanPhone, incomingOnboardingMessage, state) {
    console.log('DEBUG processarOnboarding: cleanPhone:', cleanPhone);
    console.log('DEBUG processarOnboarding: Passo atual:', state.onboardingStep);
    console.log('DEBUG processarOnboarding: incomingOnboardingMessage (raw):', incomingOnboardingMessage, 'Type:', typeof incomingOnboardingMessage);

    // Garante que a mensagem é uma string, mesmo que venha como outro tipo
    let messageText = String(incomingOnboardingMessage || '').trim();
    console.log('DEBUG processarOnboarding: messageText (após String()): "' + messageText + '" (Type: ' + typeof messageText + ')');

    const telefoneLimpo = cleanPhone.toString().replace(/\D/g, '');

    // Comandos de escape
    const escapeCommands = ['0', 'menu', 'menu principal', 'inicio', 'voltar', 'principal'];
    if (escapeCommands.includes(messageText.toLowerCase())) { // Use toLowerCase() aqui
        await sendReply(cleanPhone, '👋 Antes de continuar, preciso saber seu nome para te atender melhor!\n\n' +
            '📝 **Qual é o seu nome completo?**\n\nEx: Maria Silva');
        return;
    }

    switch (state.onboardingStep) {
        // ============================================================
        // PASSO 1: SAUDAÇÃO - APRESENTAR A GETVISA
        // ============================================================
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

        // ============================================================
        // PASSO 2: AGUARDANDO NOME - VALIDAR E SALVAR
        // ============================================================
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

            // SALVAR NOME COM UPSERT
            try {
                const { data, error } = await supabase
                    .from('clientes_novos')
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
                    console.error('❌ Erro ao salvar nome:', error);
                    await sendReply(cleanPhone, '❌ Erro ao salvar seu nome. Tente novamente.');
                    return;
                }
                console.log('✅ Nome salvo no Supabase:', nomeFormatado);
            } catch (err) {
                console.error('❌ Erro ao salvar nome:', err);
                await sendReply(cleanPhone, '❌ Erro ao salvar. Tente novamente.');
                return;
            }

            // ATUALIZAR ESTADO
            state.nome = nomeFormatado;
            state.onboardingStep = ONBOARDING_STEPS.AGUARDANDO_EMAIL;
            state.lastActivity = Date.now();
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: AGUARDANDO_EMAIL');

            // ENVIAR MENSAGEM PEDINDO E-MAIL
            const parte1 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte1);
            const parte2 = getRandomMessage(BOAS_VINDAS_MESSAGES.confirmacao_nome.parte2);
            const mensagemEmail = parte1 + nomeFormatado.split(' ')[0] + parte2;

            await sendReply(cleanPhone, mensagemEmail);
            console.log('📧 Mensagem de email enviada');
            break;

        // ============================================================
        // PASSO 3: AGUARDANDO E-MAIL - VALIDAR E FINALIZAR
        // ============================================================
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

            // SALVAR E-MAIL E COMPLETAR ONBOARDING - USAR UPSERT
            try {
                const { data, error } = await supabase
                    .from('clientes_novos')
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

            // ATUALIZAR ESTADO - ONBOARDING COMPLETO
            state.email = email;
            state.onboardingCompleto = true;
            state.onboardingStep = ONBOARDING_STEPS.COMPLETO;
            state.nivel = 'principal';
            state.service = null;
            userState.set(cleanPhone, state);
            console.log('✅ Estado atualizado para: COMPLETO');

            // ENVIAR MENSAGEM DE CONFIRMAÇÃO COM MENU PRINCIPAL
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

        // ============================================================
        // PASSO 4: COMPLETO (FALLBACK)
        // ============================================================
        case ONBOARDING_STEPS.COMPLETO:
            console.log('⚠️ Onboarding já completo, enviando menu principal');
            const menuCompleto = await getMenuPrincipal();
            await sendReply(cleanPhone, menuCompleto);
            break;

        // ============================================================
        // DEFAULT: RESETAR ONBOARDING
        // ============================================================
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

// ============================================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO DE MENSAGENS
// ============================================================

async function processarMensagem(cleanPhone, incomingMessageContent) {
    console.log('DEBUG processarMensagem: cleanPhone:', cleanPhone);
    console.log('DEBUG processarMensagem: incomingMessageContent (raw):', incomingMessageContent, 'Type:', typeof incomingMessageContent);

    // Garante que a mensagem é uma string, mesmo que venha como outro tipo
    let messageText = String(incomingMessageContent || '').trim();
    console.log('DEBUG processarMensagem: messageText (após String()):', messageText, 'Type:', typeof messageText);

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
            state.lastActivity = Date.now(); // Atualiza a atividade
            userState.set(cleanPhone, state);
        }

        console.log('Estado atual:', state);

        // Se o onboarding não estiver completo, processa o onboarding
        if (state.onboardingCompleto === false) {
            console.log('🔄 INICIANDO ONBOARDING');
            await processarOnboarding(cleanPhone, messageText, state);
            return;
        }

        // Lógica para voltar ao menu principal
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
            // Fallback: mostrar menu principal
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

// ============================================================
// 12. WEBHOOK PRINCIPAL (Z-API)
// ============================================================

app.post('/api/webhook/zapi', async (req, res) => {
    console.log('--- DEBUG: INICIO WEBHOOK Z-API ---');
    console.log('Body recebido:', JSON.stringify(req.body, null, 2));

    // A Z-API espera um status 200 OK imediatamente.
    res.status(200).send('OK');

    // Processamento assíncrono para não bloquear a resposta da Z-API
    (async () => {
        try {
            const body = req.body;
            const telefoneParaZapi = body.phone; // Telefone do remetente no formato Z-API (com 55)

            // --- CORREÇÃO AQUI: Extrair o texto da mensagem corretamente ---
            const rawZapiMessage = body.text && body.text.message ? body.text.message : '';
            console.log('DEBUG WEBHOOK: rawZapiMessage (extraído):', rawZapiMessage, 'Type:', typeof rawZapiMessage);

            // Garante que a mensagem é uma string e remove espaços em branco
            const messageTextForProcessing = String(rawZapiMessage || '').trim();
            console.log('DEBUG WEBHOOK: messageTextForProcessing (após String()):', messageTextForProcessing, 'Type:', typeof messageTextForProcessing);

            if (!messageTextForProcessing || !telefoneParaZapi) {
                console.log('⚠️ Mensagem ou telefone ausentes ou vazios, ignorando.');
                return;
            }

            const cleanPhone = limparTelefone(telefoneParaZapi); // Telefone limpo (sem 55)

            // Buscar nome do cliente para usar nas respostas (lógica mantida)
            let nomeParaSalvar = 'Cliente';
            try {
                const { data: clienteExistente } = await supabase
                    .from('clientes_novos')
                    .select('nome')
                    .eq('telefone', cleanPhone)
                    .maybeSingle();
                if (clienteExistente && clienteExistente.nome) {
                    nomeParaSalvar = clienteExistente.nome;
                }
            } catch (err) {
                console.error('Erro ao buscar nome do cliente no webhook:', err);
            }

            // Chamar a função principal de processamento de mensagens
            // --- CORREÇÃO AQUI: Passar apenas os dois argumentos esperados ---
            await processarMensagem(cleanPhone, messageTextForProcessing);

        } catch (erro) {
            console.error('❌ Erro geral no processamento do webhook:', erro);
        }
    })();
});
// ============================================================
// 13. FUNÇÕES DE GERAÇÃO DE PDF (DS-160)
// ============================================================

// Placeholder para a função de validação do DS-160
function validateDS160(formData) {
    const errors = {};
    // Exemplo de validação:
    if (!formData['full_name'] || formData['full_name'].trim() === '') {
        errors['full_name'] = 'Nome completo é obrigatório.';
    }
    if (!formData['email'] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData['email'])) {
        errors['email'] = 'E-mail inválido.';
    }
    if (!formData['telefone'] || formData['telefone'].trim() === '') {
        errors['telefone'] = 'Telefone é obrigatório.';
    }
    // Adicione mais validações conforme necessário para cada campo crítico do seu formulário
    // Lembre-se de que esta função deve ser robusta para garantir a qualidade dos dados.
    return { isValid: Object.keys(errors).length === 0, errors };
}

// Função para gerar o PDF do DS-160
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

// Helper para a mensagem do formulário DS-160 para o CLIENTE (após envio)
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
// 14. FUNÇÕES DE GERENCIAMENTO DE CLIENTES E ETAPAS
// ============================================================

async function buscarClienteEmQualquerTabela(telefoneLimpo, tabelaInicial = 'clientes_novos') {
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
        if (error.code === '23505') { // Duplicate key error
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
// 15. ROTAS DE API (FORMULÁRIOS E ADMINISTRAÇÃO)
// ============================================================

// Rota para submissão do formulário DS-160
app.post('/api/submit-ds160', async (req, res) => {
    console.log('--- DEBUG: INICIO submit-ds160 ---');
    console.log('Body recebido:', JSON.stringify(req.body, null, 2));

    const formData = req.body;

    // 1. Verificar dados de spam
    if (isSpamData(formData)) {
        console.log('❌ Dados identificados como SPAM, ignorando.');
        return res.status(400).json({ success: false, message: 'Dados inválidos ou spam.' });
    }

    // 2. Validar dados do formulário
    const { isValid, errors } = validateDS160(formData);
    if (!isValid) {
        console.log('❌ Erros de validação:', errors);
        return res.status(400).json({ success: false, message: 'Dados do formulário inválidos.', errors });
    }

    const telefoneLimpo = limparTelefone(formData.telefone);
    const nomeCliente = formData.full_name || formData.nome || 'Cliente';
    const emailCliente = formData.email;

    try {
        // 3. Gerar PDF
        const pdfBuffer = await gerarPDF_DS160(formData);
        console.log(`📄 PDF gerado para ${nomeCliente}, tamanho: ${pdfBuffer.length} bytes`);

        // 4. Salvar dados no Supabase (clientes_ativos e formularios_ds160)
        const { data: clienteAtivo, error: clienteError } = await supabase
            .from('clientes_ativos')
            .upsert({
                telefone: telefoneLimpo,
                nome: nomeCliente,
                email: emailCliente,
                criado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                status: 'formulario_enviado'
            }, { onConflict: 'telefone' })
            .select()
            .single();

        if (clienteError) throw clienteError;
        console.log('✅ Cliente salvo/atualizado em clientes_ativos:', clienteAtivo.nome);

        const { data: formSalvo, error: formError } = await supabase
            .from('formularios_ds160')
            .upsert({
                telefone: telefoneLimpo,
                ...formData, // Salva todos os dados do formulário
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'telefone' })
            .select()
            .single();

        if (formError) throw formError;
        console.log('✅ Formulário DS-160 salvo/atualizado:', formSalvo.telefone);

        // 5. Criar/Atualizar etapa do processo
        await criarEtapaInicial(telefoneLimpo); // Garante que a etapa inicial é 'formulario_enviado'

        // 6. Remover de clientes_novos (se existir)
        await supabase.from('clientes_novos').delete().eq('telefone', telefoneLimpo);
        console.log('🗑️ Cliente removido de clientes_novos (se existia)');

        // 7. Enviar PDF por e-mail para a equipe
        await resend.emails.send({
            from: 'GetVisa <contato@getvisa.com.br>',
            to: [process.env.ADMIN_EMAIL || 'contato@getvisa.com.br'], // Email da equipe
            subject: `NOVO DS-160 Recebido - ${nomeCliente}`,
            html: `<strong>Olá equipe!</strong><br><p>Um novo formulário DS-160 foi preenchido por ${nomeCliente} (${emailCliente}).</p><p>Telefone: ${formatarTelefone(telefoneLimpo)}</p><p>Anexado o PDF para revisão.</p>`,
            attachments: [{
                filename: `DS160_${nomeCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                content: pdfBuffer.toString('base64')
            }]
        });
        console.log('📧 PDF enviado por e-mail para a equipe.');

        // 8. Enviar PDF por e-mail para o cliente
        if (emailCliente) {
            await resend.emails.send({
                from: 'GetVisa <contato@getvisa.com.br>',
                to: [emailCliente],
                subject: `Seu Formulário DS-160 - GetVisa Assessoria`,
                html: `<strong>Olá ${nomeCliente.split(' ')[0]}!</strong><br><p>Seu formulário DS-160 foi preenchido com sucesso. Segue o PDF em anexo para sua revisão.</p><p>Em breve nossa equipe entrará em contato para os próximos passos.</p>`,
                attachments: [{
                    filename: `DS160_${nomeCliente.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                    content: pdfBuffer.toString('base64')
                }]
            });
            console.log('📧 PDF enviado por e-mail para o cliente:', emailCliente);
        }

        // 9. Enviar mensagem de confirmação e PDF por WhatsApp para o cliente
        const mensagemConfirmacao = getMensagemFormularioDS160ParaCliente(nomeCliente);
        await enviarWhatsApp(telefoneLimpo, mensagemConfirmacao);
        await enviarPDFWhatsApp(telefoneLimpo, pdfBuffer, nomeCliente);
        console.log('📱 Mensagem de confirmação e PDF enviados por WhatsApp para o cliente.');

        // 10. Notificar a equipe via WhatsApp (opcional)
        await enviarWhatsApp(process.env.ADMIN_PHONE || '5521974601812', `🔔 NOVO DS-160 de ${nomeCliente} (${formatarTelefone(telefoneLimpo)}) recebido!`);
        console.log('📱 Notificação para a equipe via WhatsApp.');

        res.json({ success: true, message: 'Formulário enviado e processado com sucesso!' });

    } catch (error) {
        console.error('❌ Erro no processamento do formulário DS-160:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao processar o formulário.', error: error.message });
    }
});

// Rota para regenerar PDF DS-160 a partir dos dados salvos
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
                error: 'Dados do formulário não encontrados. O cliente pode ter preenchido antes de salvarmos os dados completos.'
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

// Rota para buscar dados do formulário
app.get('/api/admin/buscar-formulario/:telefone', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const telefone = req.params.telefone;
        const telefoneLimpo = limparTelefone(telefone);

        const tabelas = ['formularios_ds160', 'clientes_ativos', 'clientes_novos'];
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

// Rota para finalizar cliente
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
            .from('clientes_novos')
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

// Rota de teste - verificar conexão com o banco
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

// Rota de finalização - corresponde ao que o painel envia
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
            .from('clientes_novos')
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

// Rota para listar clientes finalizados
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

// Rota de teste - recebimento
app.post('/api/test-receive', function(req, res) {
    console.log('📨 ===== TESTE DE RECEBIMENTO =====');
    console.log('📨 Headers:', req.headers);
    console.log('📨 Body recebido:', JSON.stringify(req.body, null, 2));
    console.log('📨 Body keys:', Object.keys(req.body));

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

// Endpoint de diagnóstico - crie cliente
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

        console.log('🔍 Verificando tabela clientes_novos...');
        const { error: tableCheck } = await supabase
            .from('clientes_novos')
            .select('id')
            .limit(1);

        if (tableCheck) {
            console.error('❌ Erro na tabela:', tableCheck);
            return res.json({
                sucesso: false,
                etapa: 'verificacao_tabela',
                erro: tableCheck,
                mensagem: 'Tabela clientes_novos não existe ou está inacessível'
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
            .from('clientes_novos')
            .upsert(dados, { onConflict: 'telefone' })
            .select()
            .single();

        if (upsertError) {
            console.error('❌ UPSERT falhou:', upsertError);

            console.log('🔄 Tentando INSERT direto...');
            const { data: directInsertData, error: insertError } = await supabase
                .from('clientes_novos')
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

// Endpoint para verificar estrutura da tabela
app.get('/api/debug/verificar-tabela', async (req, res) => {
    console.log('🔍 ===== VERIFICANDO TABELA =====');

    try {
        const { error: tableError } = await supabase
            .from('clientes_novos')
            .select('id')
            .limit(1);

        if (tableError) {
            return res.json({
                existe: false,
                erro: tableError,
                mensagem: 'Tabela clientes_novos não existe'
            });
        }

        const { data: sample, error: sampleError } = await supabase
            .from('clientes_novos')
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
            mensagem: 'Tabela existe e está acessível'
        });

    } catch (error) {
        return res.status(500).json({
            erro: error.message,
            stack: error.stack
        });
    }
});

// Endpoint para criar tabela (se necessário)
app.post('/api/debug/criar-tabela', async (req, res) => {
    console.log('🔍 ===== CRIANDO TABELA =====');

    try {
        const sql = `
            CREATE TABLE IF NOT EXISTS clientes_novos (
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

            CREATE INDEX IF NOT EXISTS idx_clientes_novos_telefone ON clientes_novos(telefone);
            CREATE INDEX IF NOT EXISTS idx_clientes_novos_status ON clientes_novos(status);

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
                cliente_telefone VARCHAR(20) UNIQUE NOT NULL REFERENCES clientes_ativos(telefone) ON DELETE CASCADE,
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

// Endpoint para testar webhook manualmente
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
            .from('clientes_novos')
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

// Rota para notificar cliente (admin)
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

// Rota para mover cliente com notificação (painel)
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
            .from('clientes_novos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente não encontrado em clientes_novos' });
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

            await supabase.from('clientes_novos').delete().eq('telefone', telefone);

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

// Rota para notificar por tipo (painel)
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

// Rotas de clientes
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
            .from('clientes') // Supondo que 'clientes' é uma tabela consolidada ou view
            .select('*')
            .order('nome_completo', { ascending: true });

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

// Rotas de teste
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

// Rotas admin
app.get('/api/test/zapi', async function(req, res) {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== ADMIN_API_KEY) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const testPhone = process.env.ADMIN_PHONE || '5521974601812'; // Usar telefone admin para teste
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

        const tables = ['clientes_novos', 'clientes_ativos', 'clientes_finalizados', 'contatos_amigos'];
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
// 16. HEALTH CHECKS E INICIALIZAÇÃO DO SERVIDOR
// ============================================================

app.get('/health', (req, res) => { res.status(200).send('OK'); });
app.get('/ping', (req, res) => { res.status(200).send('ok'); });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
    console.log(`📱 Z-API configurada: ${
        process.env.ZAPI_TOKEN &&
        (process.env.ZAPI_INSTANCE_ID || process.env.ZAPI_CLIENT_ID)
            ? '✅ Sim'
            : '❌ Não'
    }`);
    console.log(`🔑 ADMIN_API_KEY configurada: ${process.env.ADMIN_API_KEY ? '✅ Sim' : '❌ Não'}`);
    console.log(`📧 ADMIN_EMAIL configurado: ${process.env.ADMIN_EMAIL ? '✅ Sim' : '❌ Não'}`);
    console.log(`📞 ADMIN_PHONE configurado: ${process.env.ADMIN_PHONE ? '✅ Sim' : '❌ Não'}`);
});