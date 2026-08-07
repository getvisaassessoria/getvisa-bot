// services/pdfService.js
const PDFDocument = require('pdfkit');
const { getFormData, formatValue, groupParallelArrays, groupTravels, drawSectionTitle } = require('../utils/helpers');

async function gerarPDF_DS160(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => { resolve(Buffer.concat(buffers)); });
        doc.on('error', reject);

        const nomeCliente = getFormData(data, 'nome', 'nome_completo', 'Cliente_Sem_Nome');

        // ============================================================
        // CABEÇALHO
        // ============================================================
        doc.fillColor('#003366').fontSize(22).text('SOLICITACAO DE VISTO DS-160', { align: 'center' });
        doc.fontSize(12).fillColor('#666666').text('Assessoria GetVisa - Documentacao Consular', { align: 'center' });
        doc.moveDown(2);
        doc.strokeColor('#cccccc').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1);

        let currentSection = null;
        let hasContentInSection = false;

        function renderField(fieldName, label) {
            const value = data[fieldName];
            if (value !== undefined && value !== null && value !== '') {
                const formatted = formatValue(fieldName, value);
                if (formatted && formatted !== '(nao informado)') {
                    doc.font('Helvetica-Bold').fontSize(10).text(label + ': ', { continued: true });
                    doc.font('Helvetica').text(formatted);
                    doc.moveDown(0.6);
                    hasContentInSection = true;
                    return true;
                }
            }
            return false;
        }

        function startSection(sectionTitle) {
            if (currentSection !== null && hasContentInSection) {
                doc.moveDown(0.8);
            }
            drawSectionTitle(doc, sectionTitle);
            currentSection = sectionTitle;
            hasContentInSection = false;
        }

        // ============================================================
        // SEÇÃO 1: INFORMACOES INICIAIS
        // ============================================================
        startSection('INFORMACOES INICIAIS');
        renderField('consulado_cidade', 'Cidade do Consulado');
        if (renderField('radio-26', 'Indicado por agencia/agente?') && data['radio-26'] === 'one') {
            renderField('text-1', 'Nome da agencia/agente');
        }
        renderField('text-64', 'Idioma usado para preencher');

        // ============================================================
        // SEÇÃO 2: INFORMACOES PESSOAIS
        // ============================================================
        startSection('INFORMACOES PESSOAIS');
        renderField('full_name', 'Nome completo');
        if (renderField('radio-2', 'Ja teve outro nome?') && data['radio-2'] === 'one') {
            renderField('text-87', 'Nome anterior');
        }
        renderField('radio-3', 'Sexo');
        renderField('select-4', 'Estado civil');
        renderField('text-5', 'Data de nascimento');
        renderField('text-7', 'Cidade de nascimento');
        renderField('text-6', 'Estado/Provincia');
        renderField('text-95', 'Pais de nacionalidade');
        if (renderField('radio-outra-nac', 'Possui outra nacionalidade?') && data['radio-outra-nac'] === 'one') {
            renderField('outra_nacionalidade_text', 'Qual outra nacionalidade?');
        }
        renderField('radio-residente', 'Residente permanente de outro pais?');
        renderField('text-86', 'CPF');
        renderField('text-17', 'Numero do Seguro Social (SSN)');
        renderField('text-18', 'Numero do contribuinte dos EUA (TIN)');

        // ============================================================
        // SEÇÃO 3: INFORMACOES DA VIAGEM
        // ============================================================
        startSection('INFORMACOES DA VIAGEM');
        renderField('radio-28', 'Proposito da viagem');
        renderField('radio-planos', 'Planos especificos?');
        renderField('text-21', 'Data de chegada prevista');
        renderField('text-34', 'Duracao da estadia (dias)');
        renderField('text-41', 'Endereco nos EUA');
        renderField('text-42', 'Cidade (EUA)');
        renderField('text-43', 'Estado (EUA)');
        renderField('email-4', 'CEP (EUA)');

        // ============================================================
        // SEÇÃO 4: PAGADOR DA VIAGEM
        // ============================================================
        startSection('PAGADOR DA VIAGEM');
        renderField('radio-6', 'Quem pagara a viagem?');
        renderField('text-22', 'Nome do pagador');
        renderField('text-23', 'Telefone do pagador');
        renderField('text-24', 'Email do pagador');
        renderField('text-25', 'Relacao com o pagador');
        renderField('text-26', 'Endereco do pagador');

        // ============================================================
        // SEÇÃO 5: ACOMPANHANTES
        // ============================================================
        startSection('ACOMPANHANTES');
        if (renderField('radio-7', 'Viaja com outras pessoas?') && data['radio-7'] === 'one') {
            renderField('text-27', 'Nome dos acompanhantes');
            renderField('text-28', 'Relacao com acompanhantes');
        }

        // ============================================================
        // SEÇÃO 6: VIAGENS ANTERIORES AOS EUA
        // ============================================================
        startSection('VIAGENS ANTERIORES AOS EUA');
        if (renderField('radio-8', 'Ja esteve nos EUA?') && data['radio-8'] === 'one') {
            const viagens = groupTravels(data);
            if (viagens.length > 0) {
                doc.font('Helvetica-Bold').fontSize(10).text('Datas e duracao das viagens: ');
                doc.font('Helvetica').list(viagens, { bulletRadius: 1 });
                doc.moveDown(0.6);
                hasContentInSection = true;
            }
            renderField('radio-9', 'Ja teve visto americano?');
            if (data['radio-9'] === 'one') {
                renderField('text-29', 'Numero do visto');
                renderField('text-30', 'Data de emissao do visto');
                renderField('text-31', 'Data de expiracao do visto');
            }
            renderField('radio-10', 'Ja teve visto negado?');
            if (data['radio-10'] === 'one') {
                renderField('text-32', 'Motivo da negacao');
            }
            renderField('radio-11', 'Ja teve entrada negada nos EUA?');
            if (data['radio-11'] === 'one') {
                renderField('text-33', 'Motivo da entrada negada');
            }
            renderField('radio-12', 'Ja foi deportado dos EUA?');
            if (data['radio-12'] === 'one') {
                renderField('text-35', 'Data da deportacao');
                renderField('text-36', 'Motivo da deportacao');
            }
        }

        // ============================================================
        // SEÇÃO 7: INFORMACOES DE CONTATO
        // ============================================================
        startSection('INFORMACOES DE CONTATO');
        renderField('text-37', 'Endereco completo');
        renderField('text-38', 'Cidade');
        renderField('text-39', 'Estado/Provincia');
        renderField('text-40', 'CEP');
        renderField('text-44', 'Telefone residencial');
        renderField('text-45', 'Telefone comercial');
        renderField('text-46', 'Telefone celular');
        renderField('email-5', 'Email');

        // ============================================================
        // SEÇÃO 8: INFORMACOES DE PASSAPORTE
        // ============================================================
        startSection('INFORMACOES DE PASSAPORTE');
        renderField('text-47', 'Numero do passaporte');
        renderField('text-48', 'Tipo de passaporte');
        renderField('text-49', 'Pais de emissao');
        renderField('text-50', 'Data de emissao');
        renderField('text-51', 'Data de expiracao');

        // ============================================================
        // SEÇÃO 9: INFORMACOES DE FAMILIA
        // ============================================================
        startSection('INFORMACOES DE FAMILIA');
        renderField('text-52', 'Nome completo do pai');
        renderField('text-53', 'Data de nascimento do pai');
        renderField('text-54', 'Pais de nascimento do pai');
        renderField('text-55', 'Nome completo da mae');
        renderField('text-56', 'Data de nascimento da mae');
        renderField('text-57', 'Pais de nascimento da mae');

        if (data['select-4'] === 'one' || data['select-4'] === 'Uniao-estavel') { // Casado(a) ou União Estável
            renderField('text-58', 'Nome completo do conjuge');
            renderField('spouse-dob', 'Data de nascimento do conjuge');
            renderField('text-59', 'Pais de nascimento do conjuge');
            renderField('text-60', 'Nacionalidade do conjuge');
            renderField('spouse-address-same', 'Endereco do conjuge');
            if (data['spouse-address-same'] === 'two') {
                renderField('spouse-address', 'Endereco completo do conjuge');
            }
            renderField('data_casamento_div', 'Data do casamento');
        } else if (data['select-4'] === 'Divorciado(a)') {
            renderField('text-61', 'Nome completo do ex-conjuge');
            renderField('ex-dob', 'Data de nascimento do ex-conjuge');
            renderField('ex-address-same', 'Endereco do ex-conjuge');
            if (data['ex-address-same'] === 'two') {
                renderField('ex-address', 'Endereco completo do ex-conjuge');
            }
            renderField('data_divorcio', 'Data do divorcio');
        } else if (data['select-4'] === 'Viuvo(a)') {
            renderField('text-62', 'Nome completo do conjuge falecido');
            renderField('falecido-dob', 'Data de nascimento do conjuge falecido');
            renderField('falecido-address-same', 'Endereco do conjuge falecido');
            if (data['falecido-address-same'] === 'two') {
                renderField('falecido-address', 'Endereco completo do conjuge falecido');
            }
            renderField('data_falecimento', 'Data do falecimento');
        }

        // ============================================================
        // SEÇÃO 10: INFORMACOES DE TRABALHO/EDUCACAO
        // ============================================================
        startSection('INFORMACOES DE TRABALHO/EDUCACAO');
        renderField('radio-27', 'Ocupacao atual');
        renderField('text-63', 'Nome do empregador/instituicao de ensino');
        renderField('text-65', 'Endereco do empregador/instituicao de ensino');
        renderField('text-66', 'Data de inicio do trabalho/estudo');
        renderField('text-67', 'Salario mensal');
        renderField('text-68', 'Descricao das funcoes');
        if (renderField('radio-14', 'Ja trabalhou em outro lugar?') && data['radio-14'] === 'one') {
            renderField('text-69', 'Nome do empregador anterior');
            renderField('text-70', 'Endereco do empregador anterior');
            renderField('text-71', 'Telefone do empregador anterior');
            renderField('text-72', 'Data de inicio do trabalho anterior');
            renderField('text-73', 'Data de termino do trabalho anterior');
            renderField('text-74', 'Descricao das funcoes anteriores');
        }
        if (renderField('radio-15', 'Ja estudou em nivel superior?') && data['radio-15'] === 'one') {
            renderField('text-75', 'Nome da instituicao de ensino');
            renderField('text-76', 'Endereco da instituicao de ensino');
            renderField('text-77', 'Curso');
            renderField('text-78', 'Data de inicio do curso');
            renderField('text-79', 'Data de termino do curso');
        }
        if (renderField('radio-16', 'Tem alguma habilidade especial?') && data['radio-16'] === 'one') {
            renderField('text-80', 'Descricao da habilidade');
        }

        // ============================================================
        // SEÇÃO 11: INFORMACOES DE SEGURANCA E ANTECEDENTES
        // ============================================================
        startSection('INFORMACOES DE SEGURANCA E ANTECEDENTES');
        renderField('radio-17', 'Tem doenca contagiosa?');
        renderField('radio-18', 'Tem transtorno mental/fisico?');
        renderField('radio-19', 'Usa drogas?');
        renderField('radio-20', 'Ja cometeu crime?');
        renderField('radio-23', 'Ja esteve envolvido com terrorismo?');
        renderField('radio-29', 'Ja violou leis de imigracao?');
        renderField('radio-30', 'Ja foi deportado?');
        renderField('radio-33', 'Ja serviu em forcas armadas?');
        if (data['radio-33'] === 'one') {
            renderField('military_country', 'Pais');
            renderField('military_branch', 'Ramo');
            renderField('military_rank', 'Patente');
            renderField('military_date_from', 'De');
            renderField('military_date_to', 'Ate');
            renderField('military_duties', 'Funcoes');
        }
        renderField('antecedentes_radio', 'Tem antecedentes criminais?');
        if (data['antecedentes_radio'] === 'one') {
            renderField('antecedentes_descricao', 'Descricao dos antecedentes');
            renderField('antecedentes_data', 'Data dos antecedentes');
        }

        // ============================================================
        // SEÇÃO 12: INFORMACOES ADICIONAIS
        // ============================================================
        startSection('INFORMACOES ADICIONAIS');
        renderField('text-81', 'Outras informacoes relevantes');

        // ============================================================
        // RODAPÉ
        // ============================================================
        doc.moveDown(2);
        doc.fontSize(8).fillColor('#666666').text('Documento gerado automaticamente pela Assessoria GetVisa. Todos os direitos reservados.', { align: 'center' });
        doc.text('Data de Geracao: ' + new Date().toLocaleString('pt-BR'), { align: 'center' });

        doc.end();
    });
}

module.exports = {
    gerarPDF_DS160
};