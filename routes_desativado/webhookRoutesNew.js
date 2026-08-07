cat > routes/webhookRoutesNew.js << 'EOF'
// routes/webhookRoutesNew.js - VERSÃO DEFINITIVA
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

function limparTelefone(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('55')) {
        cleaned = cleaned.substring(2);
    }
    return cleaned;
}

router.post('/zapi', async (req, res) => {
    try {
        console.log('📨 WEBHOOK Z-API (DEFINITIVO)');

        const telefoneBruto = req.body.phone || '';
        const mensagem = req.body.text?.message || '';
        const nome = req.body.senderName || 'Cliente WhatsApp';

        const telefone = limparTelefone(telefoneBruto);
        
        if (!telefone) {
            console.log('⚠️ Telefone inválido');
            return res.status(200).send('OK');
        }

        console.log(`📱 Telefone: ${telefone}`);
        console.log(`💬 Mensagem: "${mensagem}"`);

        const { data: clienteExistente } = await supabase
            .from('clientes_novos')
            .select('*')
            .eq('cliente_telefone', telefone)
            .maybeSingle();

        if (!clienteExistente) {
            console.log('🆕 Criando novo cliente...');
            
            const novoCliente = {
                cliente_telefone: telefone,
                nome: nome,
                data_contato: new Date().toISOString(),
                origem: 'whatsapp',
                status: 'novo'
            };

            const { error: insertError } = await supabase
                .from('clientes_novos')
                .insert([novoCliente]);

            if (insertError) {
                console.error('❌ Erro ao criar:', insertError);
            } else {
                console.log('✅ Cliente criado!');
            }
        } else {
            console.log('✅ Cliente já existe');
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(200).send('OK');
    }
});

module.exports = router;
EOF