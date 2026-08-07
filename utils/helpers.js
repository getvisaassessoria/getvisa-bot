// utils/helpers.js
const { DATE_FIELDS, RADIO_MAPPING, SPAM_DOMAINS } = require('../config/constants');

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
        const mapped = value.map(v => {
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

module.exports = {
    limparTelefone,
    formatarTelefone,
    getFormData,
    getRandomMessage,
    validarNome,
    formatarNome,
    getServiceName,
    formatDateToBrazilian,
    formatValue,
    groupParallelArrays,
    groupTravels,
    drawSectionTitle,
    isSpamData
};