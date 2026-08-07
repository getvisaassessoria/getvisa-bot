// config/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Garante que as variáveis de ambiente estejam carregadas

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL ou SUPABASE_ANON_KEY não configuradas.');
    // Você pode optar por lançar um erro ou usar valores padrão/mock aqui
    // throw new Error('Configuração do Supabase incompleta.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;