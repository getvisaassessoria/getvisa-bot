// server-test.js
const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 10001; // porta diferente para não conflitar

// Middleware para log
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Configuração do multer (em memória)
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

// Rota de upload (exatamente como no server.js)
app.post('/api/agendamentos/upload-pdf', uploadMemory.single('pdfFile'), async (req, res) => {
    console.log('📥 Rota /upload-pdf foi chamada!');
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
        }
        console.log(`📄 Recebendo PDF: ${req.file.originalname}, tamanho: ${req.file.size} bytes`);
        res.json({ success: true, message: 'Rota de teste funcionando!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de teste rodando na porta ${PORT}`);
    console.log(`🔗 Teste: http://localhost:${PORT}/api/agendamentos/upload-pdf`);
});