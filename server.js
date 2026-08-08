const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 10000;

let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY);

console.log('✅ URL do Supabase:', supabaseUrl);
console.log('✅ Cliente Supabase inicializado');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/webhook/zapi', async (req, res) => {
  console.log('*** WEBHOOK Z-API RECEBIDO ***');

  try {
    console.log('📨 Body:', JSON.stringify(req.body, null, 2));

    const telefoneBruto = req.body.phone || '';
    const mensagemRecebida = req.body.text?.message || '';
    const nome = req.body.senderName || req.body.chatName || 'Cliente WhatsApp';

    let telefoneLimpo = telefoneBruto.replace(/\D/g, '');
    if (!telefoneLimpo.startsWith('55')) {
      telefoneLimpo = '55' + telefoneLimpo;
    }

    const telefoneParaSupabase = telefoneLimpo.startsWith('55')
      ? telefoneLimpo.substring(2)
      : telefoneLimpo;

    console.log(`📝 Mensagem bruta: "${mensagemRecebida}"`);
    console.log(`📱 Telefone bruto: "${telefoneBruto}"`);
    console.log(`📱 Telefone para Z-API: ${telefoneLimpo}`);
    console.log(`📱 Telefone para Supabase: ${telefoneParaSupabase}`);
    console.log(`💬 Mensagem: "${mensagemRecebida}"`);

    console.log('🔍 ===== INICIANDO VERIFICAÇÃO =====');
    console.log(`📱 Telefone: ${telefoneParaSupabase}`);

    const agora = new Date().toISOString();

    const { data: existente, error: selectError } = await supabase
      .from('clientes_novos')
      .select('id, telefone, nome')
      .eq('telefone', telefoneParaSupabase)
      .maybeSingle();

    if (selectError) {
      console.error('❌ Erro ao consultar cliente:', selectError);
    }

    // --- SEM updated_at! ---
    if (existente) {
      console.log('✅ Cliente já existe. Atualizando...');
      const { error: updateError } = await supabase
        .from('clientes_novos')
        .update({
          nome,
          data_contato: agora,
          status: 'novo',
          onboarding_completo: false

        })
        .eq('telefone', telefoneParaSupabase);

      if (updateError) {
        console.error('❌ Erro ao atualizar cliente:', updateError);
      } else {
        console.log('✅ Cliente atualizado com sucesso');
      }
    } else {
      console.log('🆕 Nenhum cliente encontrado. Criando novo cliente...');
      const { error: insertError } = await supabase
        .from('clientes_novos')
        .insert({
          telefone: telefoneParaSupabase,
          nome,
          data_contato: agora,
          status: 'novo',
          onboarding_completo: false
   
        });

      if (insertError) {
        console.error('❌ Erro ao inserir cliente:', insertError);
      } else {
        console.log('✅ Cliente inserido com sucesso');
      }
    }

    // --- Enviar Resposta via Z-API ---
    const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
    const ZAPI_CLIENT_ID = process.env.ZAPI_CLIENT_ID;
    const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

    console.log('📨 ===== ENVIO Z-API =====');
    console.log(`📨 Telefone: ${telefoneLimpo}`);
    console.log(`📨 Instância configurada: ${ZAPI_CLIENT_ID}`);
    console.log(`📨 Token configurado: ${!!ZAPI_TOKEN}`);
    console.log(`📨 Client-Token configurado: ${!!ZAPI_CLIENT_TOKEN}`);

    if (!ZAPI_TOKEN || !ZAPI_CLIENT_ID) {
      console.error('❌ ZAPI_TOKEN ou ZAPI_CLIENT_ID ausentes');
      return res.status(200).send('OK');
    }

    const urlZapi = `https://api.z-api.io/instances/${ZAPI_CLIENT_ID}/token/${ZAPI_TOKEN}/send-text`;
    const mensagemResposta = `Olá ${nome}! Recebi sua mensagem: "${mensagemRecebida}". Seu contato foi salvo!`;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (ZAPI_CLIENT_TOKEN) {
      headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
    }

    const responseZapi = await fetch(urlZapi, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: telefoneLimpo,
        message: mensagemResposta
      })
    });

    const dataZapi = await responseZapi.json();

    console.log(`📨 Z-API status para ${telefoneLimpo}: ${responseZapi.status}`);
    console.log('📨 Z-API resposta:', dataZapi);

    if (!responseZapi.ok) {
      console.error('❌ Falha ao enviar resposta via Z-API');
    }

    console.log('📨 POST /api/webhook');
    return res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Erro geral no webhook:', e);
    return res.status(200).send('OK');
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('ok'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/api/webhook/zapi`);
  console.log(`📱 Z-API Configurado: ${process.env.ZAPI_TOKEN ? '✅ Sim' : '❌ Não'}`);
});