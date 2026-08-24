// ============================================================
// ADMIN.JS - VERSÃO SIMPLIFICADA
// ============================================================

// Pega a chave do localStorage
const API_KEY = localStorage.getItem('admin_api_key') || '';

// Se não tiver chave, volta para o login
if (!API_KEY) {
    window.location.href = '/admin-login.html';
}

console.log('✅ Admin autenticado');

// ============================================================
// FUNÇÃO PARA FAZER REQUISIÇÕES
// ============================================================
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        }
    });

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('admin_api_key');
        window.location.href = '/admin-login.html';
        return null;
    }

    return response.json();
}

// ============================================================
// CARREGAR AGENDAMENTOS
// ============================================================
async function carregarAgendamentos() {
    console.log('📊 Carregando...');
    const data = await apiRequest('/agendamentos');
    if (data && data.data) {
        console.log('✅', data.data.length, 'agendamentos');
        const tbody = document.getElementById('tableBody');
        if (tbody) {
            tbody.innerHTML = data.data.map(item => `
                <tr>
                    <td>${item.clientes?.nome || '-'}</td>
                    <td>${item.clientes?.telefone || '-'}</td>
                    <td>${item.atividade || '-'}</td>
                    <td>${item.data_agendamento || '-'}</td>
                    <td>${item.hora_agendamento || '-'}</td>
                    <td>${item.local_agendamento || '-'}</td>
                    <td>${item.protocolo_ds160 || '-'}</td>
                    <td>${item.pdf_consulado_url ? '📎' : '-'}</td>
                    <td>${item.concluido ? '✅ Concluído' : '⏳ Pendente'}</td>
                    <td>
                        <button onclick="alert('Editar ${item.id}')">✏️</button>
                        <button onclick="excluir('${item.id}')">🗑️</button>
                    </td>
                    <td>
                        <button onclick="whatsapp('${item.clientes?.telefone}')">💬</button>
                    </td>
                </tr>
            `).join('');
        }
        
        // Atualizar stats
        document.getElementById('statTotal').textContent = data.data.length;
        document.getElementById('statConcluidos').textContent = data.data.filter(a => a.concluido).length;
        document.getElementById('statPendentes').textContent = data.data.filter(a => !a.concluido).length;
    }
}

// ============================================================
// FUNÇÕES
// ============================================================
function whatsapp(telefone) {
    if (telefone) {
        const clean = telefone.replace(/\D/g, '');
        window.open(`https://wa.me/55${clean}`, '_blank');
    }
}

async function excluir(id) {
    if (confirm('Excluir?')) {
        await apiRequest(`/agendamentos/${id}`, { method: 'DELETE' });
        carregarAgendamentos();
    }
}

// ============================================================
// INICIAR
// ============================================================
document.addEventListener('DOMContentLoaded', carregarAgendamentos);

// Exportar para o HTML
window.carregarAgendamentos = carregarAgendamentos;
window.whatsapp = whatsapp;
window.excluir = excluir;