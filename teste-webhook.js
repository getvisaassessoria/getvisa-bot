const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

console.log('🔍 Iniciando teste isolado...');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

app.post('/api/webhook/zapi', async (req, res) => {
    try {
        console.log('🚀 TESTE ISOLADO - Webhook chamado!');
        console.log('📦 Body:', req.body);
        
        const telefoneBruto = req.body.phone || '';
        let telefone = telefoneBruto.replace(/\D/g, '');
        if (telefone.startsWith('55')) telefone = telefone.substring(2);
        
        console.log(`📱 Telefone limpo: ${telefone}`);
        
        // Verifica se existe
        const { data: existe, error: buscaError } = await supabase
            .from('clientes_novos')
            .select('*')
            .eq('telefone', telefone)
            .maybeSingle();
        
        if (buscaError) {
            console.error('❌ Erro ao buscar:', buscaError);
            return res.status(200).send('OK');
        }
        
        if (!existe) {
            console.log('🆕 Criando novo cliente...');
            const { error: insertError } = await supabase
                .from('clientes_novos')
                .insert([{
                    telefone: telefone,
                    nome: req.body.senderName || 'Teste',
                    data_contato: new Date().toISOString(),
                    status: 'novo',
                    onboarding_completo: false
                }]);
            if (insertError) {
                console.error('❌ Erro ao inserir:', insertError);
            } else {
                console.log('✅ Cliente criado com sucesso!');
            }
        } else {
            console.log('✅ Cliente já existe:', existe.nome);
        }
        
        res.status(200).send('OK');
    } catch (e) {
        console.error('❌ Erro no webhook:', e);
        res.status(200).send('OK');
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Teste isolado rodando na porta 3000');
    console.log('🔗 Webhook: http://localhost:3000/api/webhook/zapi');
});
