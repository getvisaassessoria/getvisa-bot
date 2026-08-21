// repositories/clientRepository.js
const supabase = require('../config/supabase');

/**
 * Encontra um cliente pelo telefone.
 * @param {string} telefoneCliente - O número de telefone do cliente.
 * @returns {Promise<object|null>} O objeto do cliente ou null se não encontrado.
 */
async function findClientByTelefone(telefoneCliente) {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefone', telefoneCliente) // Assumindo que a coluna no banco é 'telefone'
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 é "No rows found"
        console.error('Erro ao buscar cliente por telefone:', error);
        return null;
    }
    return data;
}

/**
 * Cria um novo cliente.
 * @param {string} nomeCliente - O nome do cliente.
 * @param {string} telefoneCliente - O número de telefone do cliente.
 * @returns {Promise<object|null>} O objeto do cliente criado ou null em caso de erro.
 */
async function createClient(nomeCliente, telefoneCliente) {
    const { data, error } = await supabase
        .from('clientes')
        .insert([
            {
                nome: nomeCliente,
                telefone: telefoneCliente, // Assumindo que a coluna no banco é 'telefone'
                // Outros campos padrão se houver
            }
        ])
        .select()
        .single();

    if (error) {
        console.error('Erro ao criar cliente:', error);
        return null;
    }
    return data;
}

/**
 * Encontra um cliente pelo ID.
 * @param {string} clienteId - O ID do cliente.
 * @returns {Promise<object|null>} O objeto do cliente ou null se não encontrado.
 */
async function getClientById(clienteId) {
    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar cliente por ID:', error);
        return null;
    }
    return data;
}

module.exports = {
    findClientByTelefone,
    createClient,
    getClientById
};