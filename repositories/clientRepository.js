// repositories/clientRepository.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Busca o UUID de um cliente na tabela 'clientes' usando o nome (busca aproximada).
 * @param {string} nomeCliente - O nome do cliente a ser buscado.
 * @returns {Promise<string|null>} O UUID do cliente ou null se não encontrado.
 */
async function findClientByName(nomeCliente) {
    if (!nomeCliente || nomeCliente.trim() === '') {
        return null;
    }
    try {
        // A busca é feita na coluna 'nome' (confirmado pela sua estrutura)
        const { data, error } = await supabase
            .from('clientes')
            .select('id')
            .ilike('nome', `%${nomeCliente}%`) // Busca aproximada (case-insensitive)
            .limit(1)
            .single(); // Espera um único resultado

        if (error && error.code !== 'PGRST116') { // PGRST116 é "No rows found", que não é um erro real aqui
            console.error(`❌ Erro ao buscar cliente_id para '${nomeCliente}':`, error.message);
            return null;
        }

        return data ? data.id : null;
    } catch (e) {
        console.error(`❌ Exceção ao buscar cliente_id para '${nomeCliente}':`, e.message);
        return null;
    }
}

module.exports = {
    findClientByName
};