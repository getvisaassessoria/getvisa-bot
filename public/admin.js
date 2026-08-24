// ============================================================
// ADMIN.JS - Gerenciamento do Painel Administrativo
// ============================================================

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const API_KEY = localStorage.getItem('admin_api_key') || '';

// Verificar autenticação
if (!API_KEY) {
    window.location.href = '/admin-login.html';
}

console.log('✅ Admin autenticado com sucesso!');

// ============================================================
// FUNÇÃO DE REQUISIÇÃO AUTENTICADA
// ============================================================
async function apiRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        }
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(url, mergedOptions);
        
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('admin_api_key');
            window.location.href = '/admin-login.html';
            return null;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ Erro na requisição:', error);
        showError('Erro ao carregar dados. Tente novamente.');
        return null;
    }
}

// ============================================================
// FUNÇÕES DE UI
// ============================================================
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 5000);
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

function formatPhone(phone) {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
    }
    return phone;
}

// ============================================================
// CARREGAR DADOS
// ============================================================

// Carregar agendamentos
async function carregarAgendamentos() {
    console.log('📊 Carregando agendamentos...');
    const data = await apiRequest('/agendamentos');
    if (data && data.data) {
        console.log(`✅ ${data.data.length} agendamentos carregados`);
        renderAgendamentos(data.data);
        updateStats(data.data);
    } else {
        console.log('⚠️ Nenhum agendamento encontrado');
    }
}

// Renderizar agendamentos na tabela
function renderAgendamentos(agendamentos) {
    const tbody = document.getElementById('agendamentosBody');
    if (!tbody) return;
    
    if (!agendamentos || agendamentos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center;">Nenhum agendamento encontrado</td></tr>`;
        return;
    }
    
    tbody.innerHTML = agendamentos.map(item => `
        <tr>
            <td>${item.clientes?.nome || '-'}</td>
            <td>${formatPhone(item.clientes?.telefone)}</td>
            <td>${item.atividade || '-'}</td>
            <td>${formatDate(item.data_agendamento)}</td>
            <td>${item.hora_agendamento || '-'}</td>
            <td>${item.local_agendamento || '-'}</td>
            <td>${item.protocolo_ds160 || '-'}</td>
            <td>${item.pdf_consulado_url ? '📎' : '-'}</td>
            <td>
                <span class="status ${item.concluido ? 'concluido' : 'pendente'}">
                    ${item.concluido ? '✅ Concluído' : '⏳ Pendente'}
                </span>
            </td>
            <td>
                <button onclick="abrirWhatsApp('${item.clientes?.telefone}')" class="btn-whatsapp">
                    💬
                </button>
                <button onclick="editarAgendamento('${item.id}')" class="btn-edit">✏️</button>
                <button onclick="excluirAgendamento('${item.id}')" class="btn-delete">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// Atualizar estatísticas
function updateStats(agendamentos) {
    if (!agendamentos) return;
    
    const total = agendamentos.length;
    const concluidos = agendamentos.filter(a => a.concluido).length;
    const pendentes = agendamentos.filter(a => !a.concluido).length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('concluidosCount').textContent = concluidos;
    document.getElementById('pendentesCount').textContent = pendentes;
}

// ============================================================
// AÇÕES
// ============================================================

// Abrir WhatsApp
function abrirWhatsApp(telefone) {
    if (!telefone) {
        showError('Telefone não disponível');
        return;
    }
    const cleaned = telefone.replace(/\D/g, '');
    const formatted = cleaned.startsWith('55') ? cleaned : '55' + cleaned;
    window.open(`https://wa.me/${formatted}`, '_blank');
}

// Editar agendamento
async function editarAgendamento(id) {
    showSuccess(`Editando agendamento ${id}`);
}

// Excluir agendamento
async function excluirAgendamento(id) {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    
    const result = await apiRequest(`/agendamentos/${id}`, {
        method: 'DELETE'
    });
    
    if (result && result.success) {
        showSuccess('Agendamento excluído com sucesso!');
        carregarAgendamentos();
    } else {
        showError('Erro ao excluir agendamento');
    }
}

// ============================================================
// EXPORTAR CSV
// ============================================================
async function exportarCSV() {
    const data = await apiRequest('/agendamentos');
    if (!data || !data.data) return;
    
    const agendamentos = data.data;
    if (agendamentos.length === 0) {
        showError('Nenhum dado para exportar');
        return;
    }
    
    const headers = ['Cliente', 'Telefone', 'Atividade', 'Data', 'Hora', 'Local', 'Protocolo', 'Status'];
    const rows = agendamentos.map(item => [
        item.clientes?.nome || '',
        item.clientes?.telefone || '',
        item.atividade || '',
        item.data_agendamento || '',
        item.hora_agendamento || '',
        item.local_agendamento || '',
        item.protocolo_ds160 || '',
        item.concluido ? 'Concluído' : 'Pendente'
    ]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `agendamentos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// ============================================================
// FILTROS
// ============================================================
function aplicarFiltros() {
    const filtros = {
        cliente: document.getElementById('filtroCliente')?.value || '',
        atividade: document.getElementById('filtroAtividade')?.value || '',
        status: document.getElementById('filtroStatus')?.value || ''
    };
    carregarAgendamentos();
}

function limparFiltros() {
    document.querySelectorAll('.filtro-input').forEach(input => input.value = '');
    carregarAgendamentos();
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Painel Admin inicializado');
    carregarAgendamentos();
    
    document.getElementById('btnBuscar')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpar')?.addEventListener('click', limparFiltros);
    document.getElementById('btnExportar')?.addEventListener('click', exportarCSV);
});

// ============================================================
// EXPORTAR FUNÇÕES PARA USO NO HTML
// ============================================================
window.carregarAgendamentos = carregarAgendamentos;
window.abrirWhatsApp = abrirWhatsApp;
window.editarAgendamento = editarAgendamento;
window.excluirAgendamento = excluirAgendamento;
window.exportarCSV = exportarCSV;
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;