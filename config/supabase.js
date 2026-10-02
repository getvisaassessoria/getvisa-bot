// config/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Garante que as variáveis de ambiente estejam carregadas

const supabaseUrl = process.env.SUPABASE_URL;
// 🔧 Usa SERVICE_ROLE_KEY (bypass RLS) — backend precisa criar/atualizar clientes
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL ou chave Supabase não configuradas.');
    // throw new Error('Configuração do Supabase incompleta.');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada — usando ANON_KEY (RLS será aplicado).');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;