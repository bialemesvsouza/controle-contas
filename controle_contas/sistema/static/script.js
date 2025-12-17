const API_BASE_URL = '';
let currentUser = null;

// Estado do Dashboard e Extrato
let dashDataInicio = '';
let dashDataFim = '';
let mesAtualExtrato = new Date().toISOString().slice(0, 7);
let parcelasAtuais = [];
let filtroTipoExtrato = 'despesa'; 
let todasCategorias = []; 

// Variáveis dos Gráficos
let chartDespesas = null;
let chartReceitas = null;

document.addEventListener('DOMContentLoaded', function() {
    initDates();
    checkAuthStatus();
    setupEventListeners();
    gerarCamposData();
    renderizarRover();
    
    document.getElementById('transacao-tipo').addEventListener('change', function() {
        atualizarSelectCategorias(this.value);
    });
});

function initDates() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    dashDataInicio = primeiroDia.toISOString().split('T')[0];
    dashDataFim = ultimoDia.toISOString().split('T')[0];
    document.getElementById('dash-inicio').value = dashDataInicio;
    document.getElementById('dash-fim').value = dashDataFim;
}

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('nova-transacao-form').addEventListener('submit', handleNovaTransacao);
    document.getElementById('nova-categoria-form').addEventListener('submit', handleNovaCategoria);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    

    const formNovaTransacao = document.getElementById('nova-transacao-form');
    const campos = formNovaTransacao.querySelectorAll('input, select');

    campos.forEach((campo, index) => {
        campo.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                
                const proximoCampo = campos[index + 1];
                if (proximoCampo) {
                    proximoCampo.focus();
                }
            }
        });
    });
}

// --- NAVEGAÇÃO ---
function navegarPara(tela) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    const items = document.querySelectorAll('.nav-item');
    if(tela === 'dashboard') items[0].classList.add('active');
    if(tela === 'extrato') items[1].classList.add('active');
    if(tela === 'novo') items[2].classList.add('active');
    if(tela === 'categorias') items[3].classList.add('active'); 

    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${tela}`).classList.add('active');

    if(tela === 'dashboard') loadDashboard();
    if(tela === 'extrato') loadParcelas();
    if(tela === 'novo' || tela === 'categorias') loadCategorias(tela === 'categorias');
}

// --- AUTH ---
function toggleAuth(type) {
    if(type === 'login') {
        document.getElementById('login-tab').classList.remove('hidden');
        document.getElementById('register-tab').classList.add('hidden');
        document.getElementById('tab-login-btn').style.borderBottom = '3px solid var(--primary)';
        document.getElementById('tab-login-btn').style.color = 'var(--primary)';
        document.getElementById('tab-register-btn').style.borderBottom = 'none';
        document.getElementById('tab-register-btn').style.color = '#666';
    } else {
        document.getElementById('login-tab').classList.add('hidden');
        document.getElementById('register-tab').classList.remove('hidden');
        document.getElementById('tab-register-btn').style.borderBottom = '3px solid var(--secondary)';
        document.getElementById('tab-register-btn').style.color = 'var(--secondary)';
        document.getElementById('tab-login-btn').style.borderBottom = 'none';
        document.getElementById('tab-login-btn').style.color = '#666';
    }
}

async function checkAuthStatus() {
    const userStored = localStorage.getItem('currentUser');
    if (!userStored) {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-nav').classList.add('hidden');
        return;
    }
    try {
        currentUser = JSON.parse(userStored);
        showApp();
    } catch {
        document.getElementById('auth-section').classList.remove('hidden');
    }
}

function showApp() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-nav').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('username-display').textContent = currentUser.username;
    navegarPara('dashboard');
    loadCategorias();
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    doPost('/login', {username: u, password: p}, (data) => {
        currentUser = { username: u };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showNotification(data.mensagem);
        showApp();
    });
}

async function handleRegister(e) {
    e.preventDefault();
    const u = document.getElementById('register-username').value;
    const p = document.getElementById('register-password').value;
    doPost('/register', {username: u, password: p}, (data) => {
        showNotification(data.mensagem);
        toggleAuth('login');
    });
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    location.reload();
}

// --- DASHBOARD ---
async function loadDashboard() {
    const inicio = document.getElementById('dash-inicio').value;
    const fim = document.getElementById('dash-fim').value;
    
    try {
        const res = await fetch(`${API_BASE_URL}/dashboard?inicio=${inicio}&fim=${fim}`);
        
        if (res.ok) {
            const data = await res.json();
            
            // Cards Superiores
            const elReceitas = document.getElementById('dash-total-receitas');
            if(elReceitas) elReceitas.textContent = `R$ ${data.total_receitas.toFixed(2)}`;

            const elDespesas = document.getElementById('dash-total-despesas');
            if(elDespesas) elDespesas.textContent = `R$ ${data.total_despesas.toFixed(2)}`;

            // Gráficos
            renderizarGrafico('chart-despesas', 'despesa', data.grafico_despesas);
            renderizarGrafico('chart-receitas', 'receita', data.grafico_receitas);

            // Cálculo e Exibição do Balanço
            const saldo = data.total_receitas - data.total_despesas;
            const elBalanco = document.getElementById('dash-balanco');
            if(elBalanco) {
                // Formatação de moeda
                elBalanco.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldo);
                
                // Muda a cor
                elBalanco.className = 'balance-value ' + (saldo >= 0 ? 'balance-positive' : 'balance-negative');
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
    }
}

// Função auxiliar para criar/atualizar gráficos
function renderizarGrafico(canvasId, tipo, dados) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Preparar dados
    const labels = dados.map(item => item.categoria);
    const valores = dados.map(item => item.total);
    
    // Paleta de cores
    const coresBase = [
        '#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', 
        '#34495e', '#16a085', '#d35400', '#7f8c8d', '#c0392b'
    ];
    
    if (tipo === 'despesa') {
        if (chartDespesas) chartDespesas.destroy();
    } else {
        if (chartReceitas) chartReceitas.destroy();
    }

    const config = {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: coresBase,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            const valor = context.raw;
                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
                            return label;
                        }
                    }
                }
            }
        }
    };

    if (tipo === 'despesa') {
        chartDespesas = new Chart(ctx, config);
    } else {
        chartReceitas = new Chart(ctx, config);
    }
}

// --- CATEGORIAS ---
async function loadCategorias(renderizarNaTela = false) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/tipos`);
        if(res.ok) {
            todasCategorias = await res.json();
            
            const tipoTransacaoAtual = document.getElementById('transacao-tipo').value;
            atualizarSelectCategorias(tipoTransacaoAtual);

            if(renderizarNaTela) {
                renderizarListaCategoriasGerenciamento();
            }
        }
    } catch(e) {
        console.error("Erro ao carregar categorias", e);
    }
}

function atualizarSelectCategorias(tipoSelecionado) {
    const select = document.getElementById('transacao-tipo-categoria');
    select.innerHTML = '';
    
    const filtradas = todasCategorias.filter(c => c.categoria === tipoSelecionado);
    
    if (filtradas.length === 0) {
        const option = document.createElement('option');
        option.text = "Nenhuma categoria encontrada";
        select.appendChild(option);
        return;
    }

    filtradas.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.nome;
        select.appendChild(option);
    });
}

function renderizarListaCategoriasGerenciamento() {
    const containerDespesa = document.getElementById('lista-categorias-despesa');
    const containerReceita = document.getElementById('lista-categorias-receita');
    
    containerDespesa.innerHTML = '';
    containerReceita.innerHTML = '';

    todasCategorias.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'categoria-item';
        item.innerHTML = `
            <span>${cat.nome}</span>
            <button class="btn-icon-del" onclick="excluirCategoria(${cat.id})">&times;</button>
        `;

        if(cat.categoria === 'despesa') containerDespesa.appendChild(item);
        else containerReceita.appendChild(item);
    });
}

async function handleNovaCategoria(e) {
    e.preventDefault();
    const nome = document.getElementById('cat-nome').value;
    const tipo = document.getElementById('cat-tipo').value;
    
    doPost('/api/tipos', { nome: nome, categoria: tipo }, (data) => {
        showNotification(data.mensagem);
        document.getElementById('cat-nome').value = '';
        loadCategorias(true);
    });
}

function excluirCategoria(id) {
    abrirConfirmacao("Deseja realmente excluir esta categoria?", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/tipos/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if(res.ok) {
                showNotification(data.mensagem);
                loadCategorias(true);
            } else {
                showNotification(data.erro, 'error');
            }
        } catch(e) {
            showNotification('Erro ao excluir', 'error');
        }
    });
}

// --- EXTRATO & ROVER ---
function renderizarRover() {
    const lista = document.getElementById('rover-lista');
    lista.innerHTML = '';
    const [ano, mes] = mesAtualExtrato.split('-').map(Number);
    const dataAtual = new Date(ano, mes - 1, 1);

    for (let i = -2; i <= 2; i++) {
        const d = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + i, 1);
        const anoIso = d.getFullYear();
        const mesIso = String(d.getMonth() + 1).padStart(2, '0');
        const valorIso = `${anoIso}-${mesIso}`;
        
        const nomeMes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const label = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${anoIso}`;

        const div = document.createElement('div');
        div.className = `rover-item ${i === 0 ? 'active' : ''}`;
        div.textContent = label;
        div.onclick = () => { 
            if (valorIso !== mesAtualExtrato) {
                mesAtualExtrato = valorIso;
                renderizarRover();
                loadParcelas();
            }
        };
        lista.appendChild(div);
    }
}

function mudarMesRover(delta) {
    const [ano, mes] = mesAtualExtrato.split('-').map(Number);
    const novaData = new Date(ano, (mes - 1) + delta, 1);
    const anoIso = novaData.getFullYear();
    const mesIso = String(novaData.getMonth() + 1).padStart(2, '0');
    mesAtualExtrato = `${anoIso}-${mesIso}`;
    renderizarRover();
    loadParcelas();
}

function mudarTipoExtrato(tipo) {
    filtroTipoExtrato = tipo;
    document.getElementById('btn-tab-despesa').classList.toggle('active', tipo === 'despesa');
    document.getElementById('btn-tab-receita').classList.toggle('active', tipo === 'receita');
    document.getElementById('titulo-lista-mes').textContent = `${tipo === 'despesa' ? 'Despesas' : 'Receitas'} do Mês`;
    renderizarTabela();
}

async function loadParcelas() {
    const res = await fetch(`${API_BASE_URL}/parcelas?mes=${mesAtualExtrato}`);
    parcelasAtuais = await res.json();
    renderizarTabela();
}

function renderizarTabela() {
    const tbody = document.getElementById('parcelas-table-body');
    const tfoot = document.getElementById('parcelas-footer');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    document.getElementById('check-all').checked = false;
    atualizarBotaoLote();

    const listaFiltrada = parcelasAtuais.filter(p => p.tipo === filtroTipoExtrato);

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px; color: #666;">Nenhuma ${filtroTipoExtrato} encontrada.</td></tr>`;
        return;
    }

    let totalFiltrado = 0;
    // Substitua o trecho dentro do loop listaFiltrada.forEach na função renderizarTabela

    listaFiltrada.forEach((p) => {
        totalFiltrado += parseFloat(p.valor);
        const indexOriginal = parcelasAtuais.findIndex(item => item.id === p.id);
        const row = document.createElement('tr');
        const dataParts = p.vencimento.split('-'); 
        const dataDisplay = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
        
        let badge = '';
        let checkboxHtml = '';

        // Lógica diferenciada para Receita vs Despesa
        if (p.tipo === 'receita') {
            // Receitas: Sem checkbox, status fixo de "Recebido"
            checkboxHtml = `<span style="color:var(--secondary); font-weight:bold;">●</span>`;
            badge = 'status-pago'; // Reutiliza a cor verde
            p.status = 'Recebido'; // Força o texto para exibição
        } else {
            // Despesas: Comportamento padrão (checkbox se não pago)
            if(p.status === 'pago') badge = 'status-pago';
            else if(p.status === 'atrasado') badge = 'status-atrasado';
            else badge = 'status-a_pagar';

            checkboxHtml = p.status !== 'pago' 
                ? `<input type="checkbox" class="parcela-checkbox" value="${p.id}" onchange="atualizarBotaoLote()">` 
                : `<span style="color:var(--secondary); font-weight:bold;">&#10003;</span>`;
        }

         row.innerHTML = `
            <td style="text-align: center;">${checkboxHtml}</td>
            <td>${p.descricao}</td>
            <td>${p.numero}</td> 
            <td>${p.categoria}</td>  
            <td>R$ ${parseFloat(p.valor).toFixed(2)}</td>
            <td>${dataDisplay}</td> <td><span class="status-badge ${badge}">${p.status.replace('_', ' ')}</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="abrirModal(${indexOriginal})">Editar</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    const corTotal = filtroTipoExtrato === 'receita' ? '#2ecc71' : '#e74c3c';
    tfoot.innerHTML = `
        <tr style="background-color: #f8f9fa; font-weight: bold;">
            <td colspan="4" style="text-align: right;">Total ${filtroTipoExtrato === 'receita' ? 'Receitas' : 'Despesas'}:</td>
            <td colspan="4" style="color: ${corTotal}; font-size: 1.1rem;">R$ ${totalFiltrado.toFixed(2)}</td>
        </tr>
    `;
}

// --- TRANSAÇÕES ---
async function handleNovaTransacao(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.input-data-parcela');
    const listaDatas = Array.from(inputs).map(input => input.value);
    
    const catId = document.getElementById('transacao-tipo-categoria').value;
    if(!catId || isNaN(catId)) {
        showNotification('Selecione uma categoria válida', 'error');
        return;
    }

    const body = {
        descricao: document.getElementById('transacao-descricao').value,
        valor: parseFloat(document.getElementById('transacao-valor').value),
        parcelas: parseInt(document.getElementById('transacao-parcelas').value),
        tipo: document.getElementById('transacao-tipo').value,
        id_tipo_categoria: parseInt(catId),
        datas_parcelas: listaDatas
    };
    doPost('/nova_transacao', body, (data) => {
        showNotification(data.mensagem);
        document.getElementById('nova-transacao-form').reset();
        gerarCamposData();
        document.getElementById('transacao-tipo').value = 'despesa';
        atualizarSelectCategorias('despesa');
        navegarPara('extrato');
    });
}

function toggleTodos(source) {
    document.querySelectorAll('.parcela-checkbox').forEach(cb => cb.checked = source.checked);
    atualizarBotaoLote();
}

function atualizarBotaoLote() {
    const count = document.querySelectorAll('.parcela-checkbox:checked').length;
    const btn = document.getElementById('btn-baixar-lote');
    if (count > 0) {
        btn.classList.remove('hidden');
        btn.textContent = `Confirmar Baixa (${count})`;
    } else {
        btn.classList.add('hidden');
    }
}

function baixarSelecionados() {
    const checkboxes = document.querySelectorAll('.parcela-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if(ids.length === 0) return;

    abrirConfirmacao(`Deseja baixar ${ids.length} parcelas selecionadas?`, () => {
        doPost('/baixar_lote', { ids: ids }, (data) => {
            showNotification(data.mensagem);
            loadParcelas();
            loadDashboard();
        });
    });
}

// --- MODAL EDIÇÃO ---
function abrirModal(index) {
    const p = parcelasAtuais[index];
    
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-descricao').value = p.descricao;
    document.getElementById('edit-valor').value = p.valor;
    document.getElementById('edit-vencimento').value = p.vencimento;

    const selectStatus = document.getElementById('edit-status');
    const divStatus = selectStatus.closest('.form-group');
    const labelVencimento = document.getElementById('edit-vencimento').closest('.form-group').querySelector('label');

    if (p.tipo === 'receita') {
        divStatus.classList.add('hidden');           
        labelVencimento.textContent = 'Data de Recebimento'; 
    } else {
        divStatus.classList.remove('hidden');        
        selectStatus.value = p.status;               
        labelVencimento.textContent = 'Vencimento';  
    }

    const selectCategoria = document.getElementById('edit-categoria');
    selectCategoria.innerHTML = ''; // Limpa opções anteriores

    // Filtra as categorias globais para mostrar apenas as do tipo correto (receita ou despesa)
    const categoriasCompativeis = todasCategorias.filter(c => c.categoria === p.tipo);

    if (categoriasCompativeis.length === 0) {
        const option = document.createElement('option');
        option.text = "Nenhuma categoria disponível";
        selectCategoria.appendChild(option);
    } else {
        categoriasCompativeis.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.nome;
            
            // Verifica se é a categoria atual da parcela para deixar selecionado
            if (cat.id === p.id_categoria) {
                option.selected = true;
            }
            selectCategoria.appendChild(option);
        });
    }
    // -----------------------------------------------------

    document.getElementById('modal-edicao').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modal-edicao').classList.add('hidden');
}

async function salvarEdicao(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const itemOriginal = parcelasAtuais.find(p => p.id == id);
    
    let statusParaEnviar = document.getElementById('edit-status').value;
    
    if (itemOriginal && itemOriginal.tipo === 'receita') {
        statusParaEnviar = 'recebido';
    }

    const body = {
        descricao: document.getElementById('edit-descricao').value,
        valor: document.getElementById('edit-valor').value,
        vencimento: document.getElementById('edit-vencimento').value,
        status: statusParaEnviar,
        id_categoria: document.getElementById('edit-categoria').value 
    };

    doPost(`/editar_parcela/${id}`, body, (data) => {
        showNotification(data.mensagem);
        fecharModal();
        loadParcelas();
        loadDashboard();
    });
}

function confirmarExclusao() {
    abrirConfirmacao("Tem certeza que deseja excluir esta parcela permanentemente?", async () => {
        const id = document.getElementById('edit-id').value;
        try {
            const res = await fetch(`${API_BASE_URL}/excluir_parcela/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                showNotification(data.mensagem);
                fecharModal(); // Fecha o modal de edição
                loadParcelas();
                loadDashboard();
            } else showNotification(data.erro, 'error');
        } catch(e) { showNotification('Erro ao excluir', 'error'); }
    });
}

function gerarCamposData() {
    const qtd = parseInt(document.getElementById('transacao-parcelas').value) || 1;
    const container = document.getElementById('container-datas');
    container.innerHTML = ''; 
    const hoje = new Date();
    for (let i = 0; i < qtd; i++) {
        const dataSugerida = new Date(hoje.getFullYear(), hoje.getMonth() + i, hoje.getDate());
        const dataStr = dataSugerida.toISOString().split('T')[0];
        const div = document.createElement('div');
        div.innerHTML = `<label style="font-size:0.75rem; color:#666">Parcela ${i + 1}</label><input type="date" class="input-data-parcela" value="${dataStr}" required>`;
        container.appendChild(div);
    }
}

async function doPost(url, body, callback) {
    try {
        const res = await fetch(API_BASE_URL + url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) callback(data);
        else showNotification(data.erro, 'error');
    } catch(e) { console.error(e); showNotification('Erro de conexão', 'error'); }
}

function showNotification(msg, type='success') {
    const area = document.getElementById('notification-area');
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = msg;
    area.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// Variável para guardar a ação que será executada
let acaoConfirmacaoAtual = null;

function abrirConfirmacao(mensagem, callback) {
    const modal = document.getElementById('modal-confirmacao');
    const txt = document.getElementById('msg-confirmacao');
    const btn = document.getElementById('btn-confirmar-acao');

    // Define a mensagem
    txt.textContent = mensagem;

    // Define o que acontece ao clicar em "Confirmar"
    btn.onclick = function() {
        if (callback) callback(); // Executa a função passada
        fecharModalConfirmacao();
    };

    modal.classList.remove('hidden');
}

function fecharModalConfirmacao() {
    document.getElementById('modal-confirmacao').classList.add('hidden');
}

// Adicionar no script.js
document.getElementById('transacao-tipo').addEventListener('change', function() {
    const labelDatas = document.querySelector('#container-datas').previousElementSibling;
    if(this.value === 'receita') {
        labelDatas.textContent = 'Datas de Recebimento:';
    } else {
        labelDatas.textContent = 'Datas de Vencimento:';
    }
    atualizarSelectCategorias(this.value);
});