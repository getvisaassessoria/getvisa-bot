// repositories/lembretes.repository.js
const supabase = require('../config/supabase');

/**
 * Cria um novo lembrete no Supabase.
 * @param {object} lembreteData - Os dados do lembrete a ser criado.
 * @returns {Promise<object|null>} O lembrete criado ou null em caso de erro.
 */
async function createLembrete(lembreteData) {
    const { data, error } = await supabase
        .from('lembretes')
        .insert([lembreteData])
        .select()
        .single();

    if (error) {
        console.error('Erro ao criar lembrete no Supabase:', error);
        return null;
    }
    return data;
}

/**
 * Obtém lembretes pendentes para processamento.
 * @returns {Promise<Array<object>>} Uma lista de lembretes pendentes.
 */
async function getPendingLembretes() {
    const { data, error } = await supabase
        .from('lembretes')
        .select('*')
        .eq('status_envio', 'pendente')
        .lte('data_disparo', new Date().toISOString()); // Lembretes cuja data de disparo já passou ou é hoje

    if (error) {
        console.error('Erro ao buscar lembretes pendentes:', error);
        return [];
    }
    return data;
}

/**
 * Atualiza o status de um lembrete.
 * @param {string} lembreteId - O ID do lembrete.
 * @param {string} status - O novo status (ex: 'enviado', 'falha_envio').
 * @returns {Promise<boolean>} True se atualizado com sucesso, false caso contrário.
 */
async function updateLembreteStatus(lembreteId, status) {
    const { error } = await supabase
        .from('lembretes')
        .update({ status_envio: status, updated_at: new Date().toISOString() })
        .eq('id', lembreteId);

    if (error) {
        console.error(`Erro ao atualizar status do lembrete ${lembreteId}:`, error);
        return false;
    }
    return true;
}

module.exports = {
    createLembrete,
    getPendingLembretes,
    updateLembreteStatus
};