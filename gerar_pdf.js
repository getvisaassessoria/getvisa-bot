const PDFDocument = require('pdfkit');
const fs = require('fs');

function criarPDFTeste() {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream('teste_correto.pdf');
    doc.pipe(stream);

    doc.fontSize(16).text('CONFIRMAÇÃO DE AGENDAMENTO', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text('Nome do Solicitante: Moises Barreto');
    doc.text('Telefone: 21985234917');
    doc.text('Email: moises_barreto@yahoo.com.br');
    doc.text('Protocolo DS-160: AA00FPQ603');
    doc.moveDown();

    doc.fontSize(14).text('AGENDAMENTOS:', { underline: true });
    doc.moveDown();

    doc.fontSize(12).text('1. CASV');
    doc.text('   Data: 15/09/2026 às 09:30');
    doc.text('   Local: Consulado Americano - Rio de Janeiro');
    doc.moveDown();

    doc.text('2. Entrevista no Consulado Americano');
    doc.text('   Data: 16/09/2026 às 08:00');
    doc.text('   Local: Consulado Americano - Rio de Janeiro');
    doc.moveDown();

    doc.fontSize(10).text('Protocolo: AA00FPQ603', { align: 'center' });

    doc.end();

    stream.on('finish', () => {
        console.log('✅ PDF criado: teste_correto.pdf');
    });
}

criarPDFTeste();
