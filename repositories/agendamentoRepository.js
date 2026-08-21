// repositories/agendamentoRepository.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Usar SUPABASE_SERVICE_ROLE_KEY para operações de backend
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // <--- ALTERADO AQUI
);

/**
 * Insere um novo agendamento na tabela 'agendamentos'.
 * @param {object} agendamentoData - Dados do agendamento a ser inserido.
 * @param {string} agendamentoData.cliente_id - ID do cliente associado.
 * @param {string} agendamentoData.atividade - Descrição da atividade/compromisso.
 * @param {string} agendamentoData.data_agendamento - Data do agendamento (formato 'YYYY-MM-DD').
 * @param {string} [agendamentoData.hora_agendamento] - Hora do agendamento (formato 'HH:MM').
 * @param {string} [agendamentoData.local_agendamento] - Local do agendamento.
 * @param {string} [agendamentoData.protocolo_ds160] - Protocolo DS-160, se aplicável.
 * @param {string} [agendamentoData.pdf_consulado_url] - URL do PDF do consulado.
 * @param {string} [agendamentoData.data_extracao_pdf] - Data de extração dos dados do PDF.
 * @param {boolean} [agendamentoData.concluido=false] - Se o agendamento foi concluído.
 * @param {string} [agendamentoData.observacoes] - Observações adicionais.
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

        // Ajuste a ordenação para os novos nomes de coluna, se necessário
        query = query.order('data_agendamento', { ascending: true });
        query = query.order('hora_agendamento', { ascending: true });

        const { data, error } = await query;

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
 * @param {string} [updateData.cliente_id] - ID do cliente associado.
 * @param {string} [updateData.atividade] - Descrição da atividade/compromisso.
 * @param {string} [updateData.data_agendamento] - Data do agendamento (formato 'YYYY-MM-DD').
 * @param {string} [updateData.hora_agendamento] - Hora do agendamento (formato 'HH:MM').
 * @param {string} [updateData.local_agendamento] - Local do agendamento.
 * @param {string} [updateData.protocolo_ds160] - Protocolo DS-160, se aplicável.
 * @param {string} [updateData.pdf_consulado_url] - URL do PDF do consulado.
 * @param {string} [updateData.data_extracao_pdf] - Data de extração dos dados do PDF.
 * @param {boolean} [updateData.concluido] - Se o agendamento foi concluído.
 * @param {string} [updateData.observacoes] - Observações adicionais.
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