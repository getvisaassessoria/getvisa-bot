// routes/ds160Routes.js - VERSÃO COMPLETA COM WHATSAPP
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ============================================================
// FUNÇÃO PARA ENVIAR WHATSAPP VIA Z-API
// ============================================================
async function enviarWhatsApp(telefone, mensagem) {
    try {
        const token = process.env.ZAPI_TOKEN;
        const instance = process.env.ZAPI_INSTANCE || process.env.ZAPI_INSTANCE_ID;
        const clientToken = process.env.ZAPI_CLIENT_TOKEN;

        if (!token || !instance) {
            console.log('⚠️ Z-API não configurada. Mensagem não enviada.');
            console.log('📨 Mensagem:', mensagem);
            return false;
        }

        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;

        const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;

        const headers = {
            'Content-Type': 'application/json'
        };

        if (clientToken) {
            headers['Client-Token'] = clientToken;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                phone: telefoneFormatado,
                message: mensagem
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro Z-API (${response.status}):`, errorText);
            return false;
        }

        const data = await response.json();
        console.log('✅ WhatsApp enviado para', telefoneFormatado);
        return true;

    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error);
        return false;
    }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================
function limparTelefone(telefone) {
    if (!telefone) return null;
    const limpo = telefone.toString().replace(/\D/g, '');
    if (limpo.startsWith('55')) return limpo.substring(2);
    return limpo;
}

function extractFormFields(data) {
    const full_name = data.full_name || data.nome || data['text-84'] || data.fullName || data.name || '';
    const email = data.email || data['email-1'] || data.emailAddress || '';
    const telefone = data.telefone_whatsapp || data.telefone || data['text-77'] || data['phone-1'] || data.phone || '';
    const consulado = data.consulado_cidade || data.consulado || data['text-88'] || data.consulate || '';
    
    let nomeEncontrado = full_name;
    if (!nomeEncontrado) {
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string' && value.length > 3 && value.length < 100) {
                const words = value.trim().split(/\s+/);
                if (words.length >= 2 && words.every(w => w.length > 1)) {
                    nomeEncontrado = value;
                    break;
                }
            }
        }
    }
    
    return { full_name: nomeEncontrado, email, telefone, consulado };
}

// ============================================================
// ROTA PRINCIPAL - SUBMIT
// ============================================================
router.post('/submit-ds160', async (req, res) => {
    console.log('🔔 Rota /api/submit-ds160 chamada!');
    console.log('📝 Dados recebidos:', JSON.stringify(req.body, null, 2));

    const formData = req.body;
    const { full_name, email, telefone, consulado } = extractFormFields(formData);

    console.log(`📋 Nome: "${full_name}"`);
    console.log(`📧 Email: "${email}"`);
    console.log(`📱 Telefone: "${telefone}"`);
    console.log(`🏛️ Consulado: "${consulado}"`);

    let nomeValido = full_name || formData.nome_completo || formData.fullName || '';
    let emailValido = email || formData['email-1'] || '';
    let telefoneValido = telefone || formData['text-77'] || '';

    if (!nomeValido || !emailValido || !telefoneValido) {
        console.error('❌ Dados obrigatórios faltando');
        return res.status(400).json({
            success: false,
            message: 'Nome, email e telefone são obrigatórios.'
        });
    }

    const cleanPhone = limparTelefone(telefoneValido);
    if (!cleanPhone) {
        return res.status(400).json({ success: false, message: 'Número de telefone inválido.' });
    }

    try {
        if (supabase) {
            // 1. SALVAR CLIENTE
            const { data: clienteData, error: clienteError } = await supabase
                .from('clientes')
                .upsert({
                    telefone: cleanPhone,
                    nome: nomeValido,
                    email: emailValido,
                    consulado: consulado || '',
                    data_contato: new Date().toISOString(),
                    status: 'formulario_enviado',
                    onboarding_completo: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'telefone' })
                .select('id, telefone')
                .single();

            if (clienteError) {
                console.error('❌ Erro ao salvar cliente:', clienteError);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao salvar cliente',
                    error: clienteError.message
                });
            }

            console.log('✅ Cliente salvo no Supabase:', clienteData);

            // 2. VERIFICAR SE JÁ EXISTE FORMULÁRIO
            const { data: formExistente } = await supabase
                .from('form_ds160')
                .select('id, id_cliente')
                .eq('id_cliente', clienteData.id)
                .maybeSingle();

            if (formExistente) {
                // ATUALIZAR formulário existente
                console.log(`🔄 Atualizando formulário existente para cliente: ${clienteData.id}`);
                const { data: formData_saved, error: formError } = await supabase
                    .from('form_ds160')
                    .update({
                        dados_formulario: formData,
                        status: 'rascunho',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', formExistente.id)
                    .select()
                    .single();

                if (formError) {
                    console.error('❌ Erro ao atualizar formulário:', formError);
                    return res.status(500).json({
                        success: false,
                        message: 'Erro ao atualizar formulário',
                        error: formError.message
                    });
                }
                console.log('✅ Formulário atualizado no Supabase (form_ds160)');
            } else {
                // CRIAR novo formulário
                console.log(`🆕 Criando novo formulário para cliente: ${clienteData.id}`);
                const { data: formData_saved, error: formError } = await supabase
                    .from('form_ds160')
                    .insert({
                        id_cliente: clienteData.id,
                        dados_formulario: formData,
                        status: 'rascunho',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (formError) {
                    console.error('❌ Erro ao salvar formulário:', formError);
                    return res.status(500).json({
                        success: false,
                        message: 'Erro ao salvar formulário',
                        error: formError.message
                    });
                }
                console.log('✅ Formulário salvo no Supabase (form_ds160)');
            }

            // 3. ENVIAR NOTIFICAÇÃO WHATSAPP
            try {
                const primeiroNome = nomeValido.split(' ')[0];
                const mensagemWhats = `🎉 *Olá ${primeiroNome}!*\n\n` +
                    `Recebemos seu formulário DS-160 com sucesso! ✅\n\n` +
                    `📋 *Dados recebidos:*\n` +
                    `👤 Nome: ${nomeValido}\n` +
                    `📧 Email: ${emailValido}\n` +
                    `📱 Telefone: ${cleanPhone}\n` +
                    `🏛️ Consulado: ${consulado || 'Não informado'}\n\n` +
                    `⏳ *Próximos passos:*\n` +
                    `1️⃣ Nossa equipe fará a análise dos dados\n` +
                    `2️⃣ Você receberá a confirmação por e-mail\n` +
                    `3️⃣ Iniciaremos o agendamento da entrevista\n\n` +
                    `📱 Dúvidas? Fale conosco: https://wa.me/5521974601812\n\n` +
                    `🌟 *GetVisa Assessoria - Seu visto americano com segurança!* 🇺🇸`;

                await enviarWhatsApp(cleanPhone, mensagemWhats);
                console.log('📱 Notificação WhatsApp enviada para:', cleanPhone);
            } catch (whatsError) {
                console.error('❌ Erro ao enviar notificação WhatsApp:', whatsError);
            }

        }

        res.json({
            success: true,
            message: 'Formulário recebido com sucesso!',
            data: {
                nome: nomeValido,
                email: emailValido,
                telefone: cleanPhone
            }
        });

    } catch (error) {
        console.error('❌ Erro ao processar formulário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar formulário',
            error: error.message
        });
    }
});

// ============================================================
// ROTA PARA BUSCAR FORMULÁRIO POR TELEFONE
// ============================================================
router.get('/buscar/:telefone', async (req, res) => {
    try {
        const { telefone } = req.params;
        const cleanPhone = limparTelefone(telefone);

        if (!cleanPhone) {
            return res.status(400).json({ success: false, message: 'Telefone inválido' });
        }

        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .select('id, nome, telefone, email, status, consulado')
            .eq('telefone', cleanPhone)
            .maybeSingle();

        if (clienteError || !cliente) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        }

        const { data: form, error: formError } = await supabase
            .from('form_ds160')
            .select('*')
            .eq('id_cliente', cliente.id)
            .maybeSingle();

        if (formError) {
            return res.status(404).json({ success: false, message: 'Formulário não encontrado' });
        }

        res.json({
            success: true,
            cliente: cliente,
            formulario: form || null
        });

    } catch (error) {
        console.error('❌ Erro ao buscar formulário:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// ROTA PARA ATUALIZAR STATUS DO PROCESSO
// ============================================================
router.patch('/atualizar-status/:telefone', async (req, res) => {
    try {
        const { telefone } = req.params;
        const { status, etapa, observacao } = req.body;
        const cleanPhone = limparTelefone(telefone);

        if (!cleanPhone) {
            return res.status(400).json({ success: false, message: 'Telefone inválido' });
        }

        const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .select('id, nome, telefone')
            .eq('telefone', cleanPhone)
            .maybeSingle();

        if (clienteError || !cliente) {
            return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
        }

        await supabase
            .from('clientes')
            .update({
                status: status || 'em_andamento',
                updated_at: new Date().toISOString()
            })
            .eq('id', cliente.id);

        await supabase
            .from('form_ds160')
            .update({
                status: 'rascunho',
                updated_at: new Date().toISOString()
            })
            .eq('id_cliente', cliente.id);

        console.log(`✅ Status atualizado para cliente ${cleanPhone}`);

        // ENVIAR NOTIFICAÇÃO DE STATUS
        try {
            const primeiroNome = cliente.nome?.split(' ')[0] || 'Cliente';
            const mensagemStatus = `📢 *Atualização do seu processo - GetVisa*\n\n` +
                `Olá ${primeiroNome}! 👋\n\n` +
                `✅ Seu processo foi atualizado para:\n` +
                `📌 *${status || 'Em andamento'}*\n` +
                `${etapa ? `📍 Etapa: ${etapa}\n` : ''}` +
                `${observacao ? `📝 Observação: ${observacao}\n` : ''}\n\n` +
                `📱 Acompanhe pelo nosso painel ou entre em contato conosco.\n\n` +
                `🌟 *GetVisa Assessoria*`;

            await enviarWhatsApp(cleanPhone, mensagemStatus);
            console.log('📱 Notificação de status enviada para:', cleanPhone);
        } catch (whatsError) {
            console.error('❌ Erro ao enviar notificação de status:', whatsError);
        }

        res.json({
            success: true,
            message: 'Status atualizado com sucesso!',
            cliente: { id: cliente.id, telefone: cleanPhone, status: status || 'em_andamento' }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// ROTA DE TESTE
// ============================================================
router.get('/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'DS-160 funcionando!',
        supabase: !!supabase
    });
});

module.exports = { router, messageQueue };x