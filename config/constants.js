// config/constants.js

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
        'Vamos iniciar seu processo! Primeiro, me diga:\n\n📝 **Qual é o seu nome completo?**\n\nEx: João Santos',
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

const ADMIN_API_KEY = process.env.ADMIN_API_KEY; // Importante para rotas admin

module.exports = {
    ONBOARDING_STEPS,
    BOAS_VINDAS_MESSAGES,
    ETAPAS,
    RADIO_MAPPING,
    DATE_FIELDS,
    SPAM_DOMAINS,
    FEATURES,
    ADMIN_API_KEY
};