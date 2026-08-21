const multer = require('multer');
// routes/agendamentoRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const supabase = require('../config/supabase');
const agendamentoService = require('../services/agendamentoService');
const lembretesService = require('../services/lembretes.service');
console.log('🚀 agendamentoRoutes.js CARREGADO (INÍCIO)');
// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================
const verificarApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const adminKey = process.env.ADMIN_API_KEY || 'admin123';
    
    if (apiKey !== adminKey) {
        console.log('⚠️ Acesso sem API Key - permitido em modo dev');
    }
    next();
};

// ============================================================
// CONFIGURAÇÃO DE UPLOAD DE PDF (para vincular a agendamentos)
// ============================================================
const uploadDir = path.join(__dirname, '../uploads/pdfs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const nome = file.originalname.replace(/\s/g, '_');
        cb(null, uniqueSuffix + '-' + nome);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos PDF são permitidos'));
        }
    }
});

// Configuração para upload em memória (extração de dados do PDF)
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
// 📊 ROTAS DE AGENDAMENTOS
// ============================================================

// Listar agendamentos com filtros
router.get('/', verificarApiKey, async (req, res) => {
    try {
        const { data_inicio, data_fim, atividade, status, cliente_id } = req.query;

        let query = supabase
            .from('agendamentos')
            .select('*, clientes(*)');

        if (data_inicio) query = query.gte('data_agendamento', data_inicio);
        if (data_fim) query = query.lte('data_agendamento', data_fim);
        if (atividade) query = query.eq('atividade', atividade);
        if (status === 'concluido') query = query.eq('concluido', true);
        else if (status === 'pendente') query = query.eq('concluido', false);
        if (cliente_id) query = query.eq('cliente_id', cliente_id);

        const { data, error } = await query
            .order('data_agendamento', { ascending: true })
            .order('hora_agendamento', { ascending: true });

        if (error) throw error;

        res.json({ success: true, data, total: data.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Estatísticas
router.get('/estatisticas', verificarApiKey, async (req, res) => {
    try {
        const { data_inicio, data_fim } = req.query;

        let query = supabase.from('agendamentos').select('*');
        if (data_inicio) query = query.gte('data_agendamento', data_inicio);
        if (data_fim) query = query.lte('data_agendamento', data_fim);

        const { data, error } = await query;
        if (error) throw error;

        const hoje = new Date();
        const daqui30Dias = new Date();
        daqui30Dias.setDate(hoje.getDate() + 30);

        const stats = {
            total: data.length,
            concluidos: data.filter(a => a.concluido).length,
            pendentes: data.filter(a => !a.concluido).length,
            porAtividade: {},
            porLocal: {},
            proximos30dias: data.filter(a => {
                const d = new Date(a.data_agendamento);
                return d >= hoje && d <= daqui30Dias;
            }).length,
            ultimos7dias: 0
        };

        data.forEach(item => {
            stats.porAtividade[item.atividade] = (stats.porAtividade[item.atividade] || 0) + 1;
            stats.porLocal[item.local_agendamento] = (stats.porLocal[item.local_agendamento] || 0) + 1;
        });

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Buscar agendamento por ID
router.get('/:id', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('agendamentos')
            .select('*, clientes(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Atualizar agendamento
router.put('/:id', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { data_agendamento, hora_agendamento, local_agendamento, atividade, concluido, observacoes, protocolo_ds160 } = req.body;

        const updateData = {};
        if (data_agendamento) updateData.data_agendamento = data_agendamento;
        if (hora_agendamento) updateData.hora_agendamento = hora_agendamento;
        if (local_agendamento) updateData.local_agendamento = local_agendamento;
        if (atividade) updateData.atividade = atividade;
        if (concluido !== undefined) updateData.concluido = concluido;
        if (observacoes !== undefined) updateData.observacoes = observacoes;
        if (protocolo_ds160) updateData.protocolo_ds160 = protocolo_ds160;

        const { data, error } = await supabase
            .from('agendamentos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        if (concluido === true) {
            try {
                await agendamentoService.markAgendamentoAsConcluido(id);
            } catch (e) {
                console.log('⚠️ Erro ao marcar como concluído:', e.message);
            }
        }

        res.json({ success: true, message: 'Agendamento atualizado com sucesso!', data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Excluir agendamento
router.delete('/:id', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;

        await supabase.from('lembretes').delete().eq('id_agendamento', id);

        const { error } = await supabase.from('agendamentos').delete().eq('id', id);
        if (error) throw error;

        res.json({ success: true, message: 'Agendamento excluído com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Marcar como concluído
router.patch('/:id/concluir', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await agendamentoService.markAgendamentoAsConcluido(id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 📤 UPLOAD DE PDF PARA EXTRAIR AGENDAMENTOS (CRIAÇÃO EM MASSA)
// ============================================================

router.get('/teste', (req, res) => {
    res.json({ success: true, message: 'Rota de teste funcionando!' });
});
console.log('🔧 Definindo rota /upload-pdf...');


console.log('✅ Rota /upload-pdf definida.');

// ============================================================
// 📄 ROTAS PARA GERENCIAR PDFs VINCULADOS A AGENDAMENTOS
// ============================================================

// Upload de PDF para um agendamento específico
router.post('/:id/upload-pdf', verificarApiKey, upload.single('pdf'), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
        }

        const { data: agendamento, error } = await supabase
            .from('agendamentos')
            .select('pdf_consulado_url')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
        }

        if (agendamento.pdf_consulado_url) {
            const oldPath = path.join(__dirname, '..', agendamento.pdf_consulado_url);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const pdfUrl = `/uploads/pdfs/${req.file.filename}`;
        const { data: updated, error: updateError } = await supabase
            .from('agendamentos')
            .update({ pdf_consulado_url: pdfUrl, data_extracao_pdf: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(500).json({ success: false, message: updateError.message });
        }

        res.json({ success: true, message: 'PDF enviado com sucesso!', data: updated, pdf_url: pdfUrl });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Download do PDF
router.get('/:id/pdf', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: agendamento, error } = await supabase
            .from('agendamentos')
            .select('pdf_consulado_url')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
        }

        if (!agendamento.pdf_consulado_url) {
            return res.status(404).json({ success: false, message: 'Nenhum PDF vinculado' });
        }

        const filePath = path.join(__dirname, '..', agendamento.pdf_consulado_url);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Arquivo não encontrado' });
        }

        res.download(filePath);

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Remover PDF
router.delete('/:id/pdf', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: agendamento, error } = await supabase
            .from('agendamentos')
            .select('pdf_consulado_url')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
        }

        if (!agendamento.pdf_consulado_url) {
            return res.status(404).json({ success: false, message: 'Nenhum PDF vinculado' });
        }

        const filePath = path.join(__dirname, '..', agendamento.pdf_consulado_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        const { data: updated, error: updateError } = await supabase
            .from('agendamentos')
            .update({ pdf_consulado_url: null, data_extracao_pdf: null })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        res.json({ success: true, message: 'PDF removido com sucesso!', data: updated });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 🔔 ROTAS DE LEMBRETES
// ============================================================

// Listar lembretes de um agendamento
router.get('/:id/lembretes', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const lembretes = await lembretesService.listarLembretesPorAgendamento(id);
        res.json({ success: true, data: lembretes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reenviar um lembrete manualmente
router.post('/lembretes/:id/reenviar', verificarApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await lembretesService.reenviarLembrete(id);
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Listar lembretes pendentes
router.get('/lembretes/pendentes', verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('lembretes')
            .select(`
                *,
                agendamentos (
                    id,
                    atividade,
                    data_agendamento,
                    hora_agendamento,
                    clientes (nome, telefone, email)
                )
            `)
            .eq('status_envio', 'pendente')
            .order('data_disparo', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Estatísticas de lembretes
router.get('/lembretes/estatisticas', verificarApiKey, async (req, res) => {
    try {
        const { data, error } = await supabase.from('lembretes').select('status_envio');
        if (error) throw error;

        const stats = {
            total: data.length,
            pendentes: data.filter(l => l.status_envio === 'pendente').length,
            enviados: data.filter(l => l.status_envio === 'enviado').length,
            falhas: data.filter(l => l.status_envio === 'falha_envio' || l.status_envio === 'falha_processamento').length
        };

        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 📋 RELATÓRIO POR PERÍODO
// ============================================================

router.get('/relatorio/periodo', verificarApiKey, async (req, res) => {
    try {
        const { inicio, fim, formato } = req.query;

        let query = supabase
            .from('agendamentos')
            .select('*, clientes(nome, telefone, email)')
            .order('data_agendamento', { ascending: true });

        if (inicio) query = query.gte('data_agendamento', inicio);
        if (fim) query = query.lte('data_agendamento', fim);

        const { data, error } = await query;
        if (error) throw error;

        if (formato === 'csv') {
            const headers = ['ID', 'Cliente', 'Telefone', 'Atividade', 'Data', 'Hora', 'Local', 'Protocolo', 'Status'];
            const rows = [headers.join(',')];
            data.forEach(item => {
                rows.push([
                    item.id,
                    item.clientes?.nome || 'N/A',
                    item.clientes?.telefone || 'N/A',
                    item.atividade,
                    item.data_agendamento,
                    item.hora_agendamento,
                    item.local_agendamento || 'N/A',
                    item.protocolo_ds160 || 'N/A',
                    item.concluido ? 'Concluído' : 'Pendente'
                ].join(','));
            });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=relatorio_agendamentos.csv');
            return res.send(rows.join('\n'));
        }

        const stats = {
            total: data.length,
            concluidos: data.filter(a => a.concluido).length,
            pendentes: data.filter(a => !a.concluido).length,
            porAtividade: {},
            porDia: {}
        };

        data.forEach(item => {
            stats.porAtividade[item.atividade] = (stats.porAtividade[item.atividade] || 0) + 1;
            stats.porDia[item.data_agendamento] = (stats.porDia[item.data_agendamento] || 0) + 1;
        });

        res.json({ success: true, data, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 🔄 BUSCAR CLIENTES
// ============================================================

router.get('/clientes', verificarApiKey, async (req, res) => {
    try {
        const { nome, telefone, limit = 100 } = req.query;

        let query = supabase
            .from('clientes')
            .select('id, nome, telefone, email, status')
            .order('nome', { ascending: true })
            .limit(parseInt(limit));

        if (nome) query = query.ilike('nome', `%${nome}%`);
        if (telefone) query = query.ilike('telefone', `%${telefone}%`);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// 📊 ATIVIDADES DISPONÍVEIS
// ============================================================

router.get('/atividades', verificarApiKey, (req, res) => {
    res.json({
        success: true,
        data: [
            { value: 'CASV', label: 'CASV' },
            { value: 'Entrevista no Consulado Americano', label: 'Entrevista' },
            { value: 'Treinamento', label: 'Treinamento' },
            { value: 'Retirada do Passaporte', label: 'Retirada' }
        ]
    });
});

router.get('/teste', verificarApiKey, (req, res) => {
    res.json({ success: true, message: 'Rota de teste funcionando!' });
});

console.log('✅ agendamentoRoutes.js CARREGADO (FIM)');

// ============================================================
// EXPORTAR ROUTER
// ============================================================

module.exports = router;