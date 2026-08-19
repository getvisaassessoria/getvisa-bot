// repositories/agendamentoRepository.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Insere um novo agendamento na tabela 'agendamentos'.
 * @param {object} agendamentoData - Dados do agendamento a ser inserido.
 * @returns {Promise<object|null>} O agendamento inserido ou null em caso de erro.
 */
async function createAgendamento(agendamentoData) {
    try {
        const { data, error } = await supabase
            .from('agendamentos')
            .insert(agendamentoData)
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar agendamento:', error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.error('❌ Exceção ao criar agendamento:', e.message);
        return null;
    }
}

/**
 * Busca agendamentos na tabela 'agendamentos'.
 * @param {object} [filters={}] - Filtros para a busca (ex: { cliente_id: 'uuid', concluido: false }).
 * @returns {Promise<Array<object>>} Uma lista de agendamentos.
 */
async function getAgendamentos(filters = {}) {
    try {
        let query = supabase.from('agendamentos').select('*');

        for (const key in filters) {
            if (filters.hasOwnProperty(key)) {
                query = query.eq(key, filters[key]);
            }
        }

        const { data, error } = await query.order('data_compromisso', { ascending: true }).order('hora_compromisso', { ascending: true });

        if (error) {
            console.error('❌ Erro ao buscar agendamentos:', error.message);
            return [];
        }
        return data;
    } catch (e) {
        console.error('❌ Exceção ao buscar agendamentos:', e.message);
        return [];
    }
}

/**
 * Atualiza um agendamento existente.
 * @param {string} id - O UUID do agendamento a ser atualizado.
 * @param {object} updateData - Os dados a serem atualizados.
 * @returns {Promise<object|null>} O agendamento atualizado ou null em caso de erro.
 */
async function updateAgendamento(id, updateData) {
    try {
        const { data, error } = await supabase
            .from('agendamentos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(`❌ Erro ao atualizar agendamento ${id}:`, error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.error(`❌ Exceção ao atualizar agendamento ${id}:`, e.message);
        return null;
    }
}

/**
 * Exclui um agendamento.
 * @param {string} id - O UUID do agendamento a ser excluído.
 * @returns {Promise<boolean>} True se excluído com sucesso, false caso contrário.
 */
async function deleteAgendamento(id) {
    try {
        const { error } = await supabase
            .from('agendamentos')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(`❌ Erro ao excluir agendamento ${id}:`, error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`❌ Exceção ao excluir agendamento ${id}:`, e.message);
        return false;
    }
}

module.exports = {
    createAgendamento,
    getAgendamentos,
    updateAgendamento,
    deleteAgendamento
};