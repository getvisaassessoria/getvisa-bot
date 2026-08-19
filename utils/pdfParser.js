// utils/pdfParser.js
const pdf = require('pdf-parse');

/**
 * Mapeamento de nomes de meses em português para números.
 */
const meses = {
    "Janeiro": "01", "Fevereiro": "02", "Março": "03", "Abril": "04", "Maio": "05", "Junho": "06",
    "Julho": "07", "Agosto": "08", "Setembro": "09", "Outubro": "10", "Novembro": "11", "Dezembro": "12",
    "Jan": "01", "Fev": "02", "Mar": "03", "Abr": "04", "Mai": "05", "Jun": "06",
    "Jul": "07", "Ago": "08", "Set": "09", "Out": "10", "Nov": "11", "Dez": "12"
};

/**
 * Extrai texto de um buffer de PDF.
 * @param {Buffer} pdfBuffer - O buffer do arquivo PDF.
 * @returns {Promise<string>} O texto extraído do PDF.
 */
async function extractTextFromPdf(pdfBuffer) {
    try {
        const data = await pdf(pdfBuffer);
        return data.text;
    } catch (error) {
        console.error('❌ Erro ao extrair texto do PDF:', error);
        throw new Error('Falha ao extrair texto do PDF.');
    }
}

/**
 * Analisa o texto extraído do PDF para encontrar informações de agendamento.
 * @param {string} textoCompleto - O texto completo extraído do PDF.
 * @param {string[]} locaisPermitidos - Lista de locais válidos para autocompletar.
 * @returns {object} Um objeto contendo os dados extraídos (nomes, etapas, local).
 */
function parsePdfText(textoCompleto, locaisPermitidos) {
    const resultados = {
        clientePrincipal: '',
        acompanhantes: [],
        etapas: [],
        localPadrao: ''
    };

    // 1. Extrair Nomes dos Solicitantes
    const matchesNomes = [...textoCompleto.matchAll(/Nome do Solicitante\s+([^\n\r]+)/g)];
    if (matchesNomes.length > 0) {
        const nomesLimpos = matchesNomes.map(match => match[1].trim());
        const nomesUnicos = [...new Set(nomesLimpos)]; // Remove duplicatas
        resultados.clientePrincipal = nomesUnicos[0] || '';
        resultados.acompanhantes = nomesUnicos.slice(1);
    }

    // 2. Extrair Dados do CASV
    const matchCasv = textoCompleto.match(/Data do Agendamento no CASV:\s*(\d{1,2})\s+([A-Za-zç]+),\s+(\d{4}),\s+(\d{2}:\d{2})\s+([A-Za-z\s]+?)\s+Horário/);
    if (matchCasv) {
        const [, dia, mesNome, ano, hora, localBruto] = matchCasv;
        const mes = meses[mesNome] || "01"; // Fallback para "01" se o mês não for encontrado
        const dataFormatada = `${parseInt(dia, 10).toString().padStart(2, '0')}/${mes}/${ano}`;
        resultados.etapas.push({ tipo: "CASV", data: dataFormatada, hora: hora });

        const localUpper = localBruto.toUpperCase();
        for (const loc of locaisPermitidos) {
            if (localUpper.includes(loc) || loc.includes(localUpper)) {
                resultados.localPadrao = loc;
                break;
            }
        }
    }

    // 3. Extrair Dados da Entrevista no Consulado
    const matchEntrevista = textoCompleto.match(/Data da entrevista no Consulado:\s*(\d{1,2})\s+([A-Za-zç]+),\s+(\d{4}),\s+(\d{2}:\d{2})/);
    if (matchEntrevista) {
        const [, dia, mesNome, ano, hora] = matchEntrevista;
        const mes = meses[mesNome] || "01";
        const dataFormatada = `${parseInt(dia, 10).toString().padStart(2, '0')}/${mes}/${ano}`;
        resultados.etapas.push({ tipo: "ENTREVISTA", data: dataFormatada, hora: hora });
    }

    return resultados;
}

module.exports = {
    extractTextFromPdf,
    parsePdfText
};