const API_BASE_URL = '';
let currentUser = null;

// Estado do Dashboard e Extrato
let dashDataInicio = '';
let dashDataFim = '';
let mesAtualExtrato = new Date().toISOString().slice(0, 7);
let parcelasAtuais = [];
let filtroTipoExtrato = 'despesa';
let todasCategorias = [];
let todosCartoes = [];

// Variáveis dos Gráficos
let chartDespesas = null;
let chartReceitas = null;
let chartCartaoEspecifico = null;

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

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

function toggleMenuMobile() {
    const sidebar = document.querySelector('.app-menubar');
    sidebar.classList.toggle('menu-aberto');
}

function initDates() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    dashDataInicio = primeiroDia.toISOString().split('T')[0];
    dashDataFim = ultimoDia.toISOString().split('T')[0];
    document.getElementById('dash-inicio').value = dashDataInicio;
    document.getElementById('dash-fim').value = dashDataFim;

    if(document.getElementById('sim-mes-inicio')) {
        document.getElementById('sim-mes-inicio').value = new Date().toISOString().slice(0, 7);
    }
}

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('nova-transacao-form').addEventListener('submit', handleNovaTransacao);
    document.getElementById('nova-categoria-form').addEventListener('submit', handleNovaCategoria);
    document.getElementById('novo-cartao-form').addEventListener('submit', handleNovoCartao);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Listeners da Recuperação de Senha
    const recoverForm1 = document.getElementById('recover-form-1');
    if(recoverForm1) recoverForm1.addEventListener('submit', handleVerificarEmail);
    
    const recoverForm2 = document.getElementById('recover-form-2');
    if(recoverForm2) recoverForm2.addEventListener('submit', handleRedefinirSenha);

    // Atualiza a tabela dinamicamente quando o valor total muda
    document.getElementById('transacao-valor').addEventListener('input', gerarCamposData);

    const formNovaTransacao = document.getElementById('nova-transacao-form');
    if(formNovaTransacao) {
        const campos = formNovaTransacao.querySelectorAll('input, select');
        campos.forEach((campo, index) => {
            campo.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const proximoCampo = campos[index + 1];
                    if (proximoCampo) proximoCampo.focus();
                }
            });
        });
    }
}

// --- NAVEGAÇÃO ---
function navegarPara(tela) {
    document.querySelector('.app-menubar').classList.remove('menu-aberto');
    document.querySelectorAll('.menu-link').forEach(item => item.classList.remove('active'));
    const activeLink = document.querySelector(`[onclick="navegarPara('${tela}')"]`);
    if (activeLink) activeLink.classList.add('active');

    // Esconde todas as telas e mostra só a correta
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('d-none');
        view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${tela}`);
    if(targetView) {
        targetView.classList.remove('d-none');
        targetView.classList.add('active');
    }

    // Atualiza o título da página
    const titulos = {
        'dashboard': 'Visão Geral',
        'extrato': 'Extrato Mensal',
        'novo': 'Nova Transação',
        'categorias': 'Cadastros',
        'simulacao': 'Simulador de Contas'
    };
    const titleElement = document.querySelector('.page-title');
    if(titleElement) titleElement.textContent = titulos[tela] || 'SmartGrana';

    if(tela === 'dashboard') loadDashboard();
    if(tela === 'extrato') loadParcelas();

    if(tela === 'novo' || tela === 'categorias') {
        loadCategorias(tela === 'categorias');
        loadCartoes();
    }
    document.querySelectorAll('.menu-link').forEach(item => item.classList.remove('active'));
}

// --- AUTH ---
function toggleAuth(type) {
    document.getElementById('login-tab').classList.add('d-none');
    document.getElementById('register-tab').classList.add('d-none');
    
    const recoverTab = document.getElementById('recover-tab');
    if(recoverTab) recoverTab.classList.add('d-none');
    
    const authTabsNav = document.getElementById('auth-tabs-nav');
    if(authTabsNav) authTabsNav.classList.remove('d-none');

    const btnLogin = document.getElementById('tab-login-btn');
    const btnReg = document.getElementById('tab-register-btn');

    if(type === 'login') {
        document.getElementById('login-tab').classList.remove('d-none');
        btnLogin.classList.add('border-primary', 'border-3', 'fw-bold', 'text-dark');
        btnLogin.classList.remove('text-muted');
        btnReg.classList.remove('border-primary', 'border-3', 'fw-bold', 'text-dark');
        btnReg.classList.add('text-muted');
    } else if (type === 'register') {
        document.getElementById('register-tab').classList.remove('d-none');
        btnReg.classList.add('border-primary', 'border-3', 'fw-bold', 'text-dark');
        btnReg.classList.remove('text-muted');
        btnLogin.classList.remove('border-primary', 'border-3', 'fw-bold', 'text-dark');
        btnLogin.classList.add('text-muted');
    } else if (type === 'recover') {
        if(recoverTab) {
            recoverTab.classList.remove('d-none');
            document.getElementById('recover-step-1').classList.remove('d-none');
            document.getElementById('recover-step-2').classList.add('d-none');
        }
        if(authTabsNav) authTabsNav.classList.add('d-none'); 
    }
}

function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace('bx-hide', 'bx-show');
    } else {
        input.type = "password";
        icon.classList.replace('bx-show', 'bx-hide');
    }
}

async function checkAuthStatus() {
    const userStored = localStorage.getItem('currentUser');
    if (!userStored) {
        document.getElementById('auth-section').classList.remove('d-none-important');
        document.getElementById('app-nav').classList.add('d-none-important');
        return;
    }
    try {
        currentUser = JSON.parse(userStored);
        showApp();
    } catch {
        document.getElementById('auth-section').classList.remove('d-none-important');
    }
}

function showApp() {
    document.getElementById('auth-section').classList.add('d-none-important');
    document.getElementById('app-nav').classList.remove('d-none-important');
    document.getElementById('logout-btn').classList.remove('d-none-important');
    document.getElementById('username-display').textContent = currentUser.username;
    navegarPara('dashboard');
    loadCategorias();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const p = document.getElementById('login-password').value;

    doPost('/login', {email: email, password: p}, (data) => {
        currentUser = { username: data.username };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showNotification(data.mensagem);
        showApp();
    });
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const u = document.getElementById('register-username').value;
    const p = document.getElementById('register-password').value;
    const pConf = document.getElementById('register-password-confirm').value;

    if (p !== pConf) {
        showNotification('As senhas não coincidem!', 'error');
        return;
    }

    doPost('/register', {email: email, username: u, password: p}, (data) => {
        showNotification(data.mensagem);
        toggleAuth('login');
    });
}

// Fluxo de Recuperação de Senha
async function handleVerificarEmail(e) {
    e.preventDefault();
    const email = document.getElementById('recover-search-email').value;

    doPost('/verificar_usuario', {email: email}, (data) => {
        if(data.existe) {
            document.getElementById('recover-found-user').value = data.username;
            document.getElementById('recover-found-email').value = data.email;
            
            document.getElementById('recover-step-1').classList.add('d-none');
            document.getElementById('recover-step-2').classList.remove('d-none');
            showNotification('Usuário encontrado!', 'success');
        }
    });
}

async function handleRedefinirSenha(e) {
    e.preventDefault();
    const email = document.getElementById('recover-found-email').value;
    const p = document.getElementById('recover-password').value;
    const pConf = document.getElementById('recover-password-confirm').value;

    if (p !== pConf) {
        showNotification('As novas senhas não coincidem!', 'error');
        return;
    }

    doPost('/atualizar_senha_direto', {email: email, password: p}, (data) => {
        showNotification(data.mensagem);
        document.getElementById('recover-form-1').reset();
        document.getElementById('recover-form-2').reset();
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

            // Usando a nova função formatarMoeda
            const elReceitas = document.getElementById('dash-total-receitas');
            if(elReceitas) elReceitas.textContent = formatarMoeda(data.total_receitas);

            const elDespesas = document.getElementById('dash-total-despesas');
            if(elDespesas) elDespesas.textContent = formatarMoeda(data.total_despesas);

            renderizarGrafico('chart-despesas', 'despesa', data.grafico_despesas);
            renderizarGrafico('chart-receitas', 'receita', data.grafico_receitas);

            const saldo = data.total_receitas - data.total_despesas;
            const elBalanco = document.getElementById('dash-balanco');
            if(elBalanco) {
                elBalanco.textContent = formatarMoeda(saldo);
                elBalanco.className = 'fw-bold mb-0 mt-1 ' + (saldo >= 0 ? 'text-success' : 'text-danger');
            }

            const selectCartao = document.getElementById('dash-card-select');
            if (selectCartao && selectCartao.options.length <= 1) {
                await preencherSelectCartoesDashboard();
            }
            if (selectCartao && selectCartao.value) {
                atualizarGraficoCartao();
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
    }
}

function renderizarGrafico(canvasId, tipo, dados) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = dados.map(item => item.categoria);
    const valores = dados.map(item => item.total);

    const coresBase = [
        '#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6',
        '#34495e', '#16a085', '#d35400', '#7f8c8d', '#c0392b',
        '#1abc9c', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50'
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
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            const valor = context.raw;
                            // Usando formatarMoeda no tooltip
                            label += formatarMoeda(valor);
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

// --- CATEGORIAS E CARTÕES ---
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
    } catch(e) { console.error("Erro ao carregar categorias", e); }
}

async function loadCartoes() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/cartoes`);
        if(res.ok) {
            todosCartoes = await res.json();
            renderizarSelectCartoes();
            renderizarListaCartoesGerenciamento();
        }
    } catch(e) { console.error("Erro ao carregar cartões", e); }
}

function renderizarSelectCartoes() {
    const select = document.getElementById('transacao-cartao-id');
    if(!select) return;
    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);

    todosCartoes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nome;
        select.appendChild(option);
    });
}

function renderizarListaCartoesGerenciamento() {
    const container = document.getElementById('lista-cartoes-cadastrados');
    if(!container) return;
    container.innerHTML = '';

    todosCartoes.forEach(c => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-light rounded-3 d-flex justify-content-between align-items-center mb-2';
        item.innerHTML = `
            <span class="fw-medium text-dark"><i class='bx bx-credit-card text-primary me-2'></i> ${c.nome}</span>
            <button class="btn btn-sm btn-outline-danger rounded-circle p-1" style="line-height: 1;" onclick="excluirCartao(${c.id})"><i class='bx bx-trash'></i></button>
        `;
        container.appendChild(item);
    });
}

async function handleNovoCartao(e) {
    e.preventDefault();
    const nome = document.getElementById('cartao-nome').value;

    doPost('/api/cartoes', { nome: nome }, (data) => {
        showNotification(data.mensagem);
        document.getElementById('cartao-nome').value = '';
        loadCartoes();
    });
}

function excluirCartao(id) {
    abrirConfirmacao("Deseja excluir este cartão?", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/cartoes/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if(res.ok) {
                showNotification(data.mensagem);
                loadCartoes();
            } else {
                showNotification(data.erro, 'error');
            }
        } catch(e) { showNotification('Erro ao excluir', 'error'); }
    });
}

function toggleSelectCartao() {
    const forma = document.getElementById('transacao-forma-pagamento').value;
    const divCartao = document.getElementById('div-select-cartao');
    const inputCartao = document.getElementById('transacao-cartao-id');

    if (forma === 'Cartão Crédito') {
        divCartao.classList.remove('d-none');
        if(inputCartao) inputCartao.setAttribute('required', 'required');
    } else {
        divCartao.classList.add('d-none');
        if(inputCartao) {
            inputCartao.removeAttribute('required');
            inputCartao.value = "";
        }
    }
}

function atualizarSelectCategorias(tipoSelecionado) {
    const select = document.getElementById('transacao-tipo-categoria');
    if(!select) return;
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
    if(!containerDespesa || !containerReceita) return;

    containerDespesa.innerHTML = '';
    containerReceita.innerHTML = '';

    todasCategorias.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'p-2 px-3 bg-light rounded-3 d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <span class="fw-medium text-dark">${cat.nome}</span>
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle p-1" style="line-height: 1;" onclick="excluirCategoria(${cat.id})"><i class='bx bx-x fs-5'></i></button>
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
    if(!lista) return;
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
        div.className = `rover-item ${i === 0 ? 'active' : 'text-muted'}`;
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
    if(!tbody) return;
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    document.getElementById('check-all').checked = false;
    atualizarBotaoLote();

    const listaFiltrada = parcelasAtuais.filter(p => p.tipo === filtroTipoExtrato);

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Nenhuma ${filtroTipoExtrato} encontrada neste mês.</td></tr>`;
        return;
    }

    let totalFiltrado = 0;

    listaFiltrada.forEach((p) => {
        totalFiltrado += parseFloat(p.valor);
        const indexOriginal = parcelasAtuais.findIndex(item => item.id === p.id);
        const row = document.createElement('tr');
        const dataParts = p.vencimento.split('-');
        const dataDisplay = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;

        let badge = '';
        let checkboxHtml = '';

        if (p.tipo === 'receita') {
            checkboxHtml = `<span class="text-success fw-bold">●</span>`;
            badge = 'status-pago';
            p.status = 'Recebido';
        } else {
            if(p.status === 'pago') badge = 'status-pago';
            else if(p.status === 'atrasado') badge = 'status-atrasado';
            else badge = 'status-a_pagar';

            checkboxHtml = p.status !== 'pago'
                ? `<input type="checkbox" class="form-check-input parcela-checkbox" value="${p.id}" onchange="atualizarBotaoLote()">`
                : `<span class="text-success fw-bold">&#10003;</span>`;
        }

         row.innerHTML = `
            <td class="text-center">${checkboxHtml}</td>
            <td class="fw-medium text-dark">${p.descricao}</td>
            <td class="text-muted">${p.numero}</td>
            <td><span class="badge bg-light text-dark border">${p.categoria}</span></td>
            
            <td class="fw-bold">${formatarMoeda(p.valor)}</td>
            
            <td>${dataDisplay}</td>
            <td><span class="status-badge ${badge}">${p.status.replace('_', ' ')}</span></td>
            <td class="text-end pe-4">
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-primary btn-sm px-3" onclick="abrirModal(${indexOriginal})"><i class='bx bx-edit'></i> Editar</button>
                    <button class="btn btn-danger btn-sm px-3" onclick="excluirDireto(${p.id})"><i class='bx bx-trash'></i> Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    const corTotal = filtroTipoExtrato === 'receita' ? 'text-success' : 'text-danger';
    
    // AQUI: Usando formatarMoeda no footer da tabela
    tfoot.innerHTML = `
        <tr>
            <td colspan="4" class="text-end fw-bold text-dark">Total ${filtroTipoExtrato === 'receita' ? 'Receitas' : 'Despesas'}:</td>
            <td colspan="4" class="fw-bold fs-6 ${corTotal}">${formatarMoeda(totalFiltrado)}</td>
        </tr>
    `;
}

// ==========================================
// LÓGICA DE CÁLCULO E TABELA DE PARCELAS (NOVO)
// ==========================================
function gerarCamposData() {
    const inputQtd = document.getElementById('transacao-parcelas');
    if(!inputQtd) return;
    let qtd = parseInt(inputQtd.value);
    if (isNaN(qtd) || qtd < 1) qtd = 1;

    const valorTotal = parseFloat(document.getElementById('transacao-valor').value) || 0;
    const container = document.getElementById('container-datas');
    container.innerHTML = '';

    // Calcula o valor base por parcela
    let valorBase = valorTotal / qtd;
    let somaArr = [];
    let totalDistribuido = 0;

    for(let i = 0; i < qtd; i++) {
        let v = Number(valorBase.toFixed(2));
        if(i === qtd - 1) { // A última parcela tira a diferença de centavos
            v = Number((valorTotal - totalDistribuido).toFixed(2));
        }
        totalDistribuido += v;
        somaArr.push(v);
    }

    const hoje = new Date();
    for (let i = 0; i < qtd; i++) {
        const dataSugerida = new Date(hoje.getFullYear(), hoje.getMonth() + i, hoje.getDate());
        const dataStr = dataSugerida.toISOString().split('T')[0];

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center fw-bold text-muted bg-light border-end" style="vertical-align: middle;">${i + 1}</td>
            <td>
                <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white border-end-0 text-muted">R$</span>
                    <input type="number" class="form-control form-control-sm border-start-0 ps-0 input-valor-parcela fw-bold text-dark" value="${somaArr[i].toFixed(2)}" step="0.01" min="0" required onchange="recalcularValoresAbaixo(${i})" oninput="calcularSomaParcelas()">
                </div>
            </td>
            <td>
                <input type="date" class="form-control form-control-sm input-data-parcela text-dark" value="${dataStr}" required>
            </td>
            <td class="text-center" style="vertical-align: middle;">
                <div class="btn-group btn-group-sm shadow-sm" role="group">
                    <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaLinha(${i}, 'M')" title="Avançar 1 Mês p/ Baixo"> M</button>
                    <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaLinha(${i}, 'A')" title="Avançar 1 Ano p/ Baixo"> A</button>
                    <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaLinha(${i}, '=')" title="Copiar p/ Baixo"> = </button>
                </div>
            </td>
        `;
        container.appendChild(tr);
    }
    calcularSomaParcelas();
}

function recalcularValoresAbaixo(indexAlterado) {
    const inputs = document.querySelectorAll('.input-valor-parcela');
    const valorTotal = parseFloat(document.getElementById('transacao-valor').value) || 0;

    // Soma tudo que está "acima" e a própria parcela alterada
    let somaFixada = 0;
    for(let i = 0; i <= indexAlterado; i++) {
        somaFixada += parseFloat(inputs[i].value) || 0;
    }

    const restante = valorTotal - somaFixada;
    const parcelasRestantes = inputs.length - 1 - indexAlterado;

    if (parcelasRestantes > 0) {
        let valorBase = Math.max(0, restante / parcelasRestantes);
        let totalDistribuido = 0;

        for(let i = indexAlterado + 1; i < inputs.length; i++) {
            let v = Number(valorBase.toFixed(2));

            if (i === inputs.length - 1 && restante > 0) {
                v = Number((restante - totalDistribuido).toFixed(2));
            } else if (restante <= 0) {
                v = 0; 
            }

            totalDistribuido += v;
            inputs[i].value = v.toFixed(2);
        }
    }

    calcularSomaParcelas();
}

function calcularSomaParcelas() {
    const elValorTotal = document.getElementById('transacao-valor');
    if(!elValorTotal) return;

    const valorTotal = parseFloat(elValorTotal.value) || 0;
    const inputsValores = document.querySelectorAll('.input-valor-parcela');
    let soma = 0;

    inputsValores.forEach(input => { soma += parseFloat(input.value) || 0; });

    const diferenca = valorTotal - soma;
    const elSoma = document.getElementById('soma-parcelas');
    const elDif = document.getElementById('diferenca-parcelas');

    if (elSoma && elDif) {
        // AQUI: Usando formatarMoeda no resumo de parcelas
        elSoma.textContent = formatarMoeda(soma);
        elDif.textContent = formatarMoeda(Math.abs(diferenca));

        if (Math.abs(diferenca) > 0.01) {
            elDif.className = 'text-danger fw-bold';
            elSoma.className = 'text-danger fw-bold';
        } else {
            elDif.className = 'text-success fw-bold';
            elSoma.className = 'text-primary fw-bold';
        }
    }
}

// Botões individuais por linha
function aplicarRecorrenciaLinha(indexBase, tipo) {
    const inputs = document.querySelectorAll('.input-data-parcela');
    if (inputs.length === 0) return;

    const dataBaseVal = inputs[indexBase].value;
    if (!dataBaseVal) {
        showNotification('Preencha a data antes de aplicar a recorrência.', 'error');
        return;
    }

    const [anoBase, mesBase, diaBase] = dataBaseVal.split('-').map(Number);

    for(let i = indexBase + 1; i < inputs.length; i++) {
        if (tipo === '=') {
            inputs[i].value = dataBaseVal;
        } else {
            let novaData = new Date(anoBase, mesBase - 1, diaBase);
            let delta = i - indexBase; 

            if (tipo === 'M') novaData.setMonth(novaData.getMonth() + delta);
            if (tipo === 'A') novaData.setFullYear(novaData.getFullYear() + delta);

            if (novaData.getDate() !== diaBase) novaData.setDate(0);

            const anoIso = novaData.getFullYear();
            const mesIso = String(novaData.getMonth() + 1).padStart(2, '0');
            const diaIso = String(novaData.getDate()).padStart(2, '0');

            inputs[i].value = `${anoIso}-${mesIso}-${diaIso}`;
        }
    }
}

async function handleNovaTransacao(e) {
    e.preventDefault();

    const inputsData = document.querySelectorAll('.input-data-parcela');
    const listaDatas = Array.from(inputsData).map(input => input.value);

    const inputsValor = document.querySelectorAll('.input-valor-parcela');
    const listaValores = Array.from(inputsValor).map(input => parseFloat(input.value) || 0);

    const valorTotal = parseFloat(document.getElementById('transacao-valor').value) || 0;
    const somaValores = listaValores.reduce((a, b) => a + b, 0);

    if (Math.abs(valorTotal - somaValores) > 0.01) {
        showNotification('Corrija as parcelas: A soma dos valores deve ser igual ao Valor Total.', 'error');
        return;
    }

    const catId = document.getElementById('transacao-tipo-categoria').value;
    const formaPagamento = document.getElementById('transacao-forma-pagamento').value;
    const idCartao = document.getElementById('transacao-cartao-id').value;

    if(!catId || isNaN(catId)) {
        showNotification('Selecione uma categoria válida', 'error');
        return;
    }

    if(formaPagamento === 'Cartão Crédito' && !idCartao) {
        showNotification('Selecione qual cartão foi utilizado', 'error');
        return;
    }

    const body = {
        descricao: document.getElementById('transacao-descricao').value,
        valor: valorTotal,
        parcelas: parseInt(document.getElementById('transacao-parcelas').value),
        tipo: document.getElementById('transacao-tipo').value,
        id_tipo_categoria: parseInt(catId),
        datas_parcelas: listaDatas,
        valores_parcelas: listaValores,
        forma_pagamento: formaPagamento,
        id_cartao: idCartao ? parseInt(idCartao) : null
    };

    doPost('/nova_transacao', body, (data) => {
        showNotification(data.mensagem);
        document.getElementById('nova-transacao-form').reset();
        gerarCamposData();
        toggleSelectCartao();
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
        btn.classList.remove('d-none');
        btn.innerHTML = `<i class='bx bx-check-double'></i> Confirmar Baixa (${count})`;
    } else {
        btn.classList.add('d-none');
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

// --- MODAIS (Edição e Exclusão) ---
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
        divStatus.classList.add('d-none');
        labelVencimento.textContent = 'Data de Recebimento';
    } else {
        divStatus.classList.remove('d-none');
        selectStatus.value = p.status;
        labelVencimento.textContent = 'Vencimento';
    }

    const selectCategoria = document.getElementById('edit-categoria');
    selectCategoria.innerHTML = '';

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
            if (cat.id === p.id_categoria) option.selected = true;
            selectCategoria.appendChild(option);
        });
    }

    document.getElementById('modal-edicao').classList.remove('d-none');
}

function fecharModal() {
    document.getElementById('modal-edicao').classList.add('d-none');
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
                fecharModal();
                loadParcelas();
                loadDashboard();
            } else showNotification(data.erro, 'error');
        } catch(e) { showNotification('Erro ao excluir', 'error'); }
    });
}

function excluirDireto(id) {
    abrirConfirmacao("Tem certeza que deseja excluir esta parcela permanentemente?", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/excluir_parcela/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                showNotification(data.mensagem, 'success');
                loadParcelas();
                loadDashboard();
            } else {
                showNotification(data.erro, 'error');
            }
        } catch(e) {
            showNotification('Erro ao excluir', 'error');
        }
    });
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
    if(!area) return;
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = msg;
    area.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function abrirConfirmacao(mensagem, callback) {
    const modal = document.getElementById('modal-confirmacao');
    const txt = document.getElementById('msg-confirmacao');
    const btn = document.getElementById('btn-confirmar-acao');

    txt.textContent = mensagem;

    btn.onclick = function() {
        if (callback) callback();
        fecharModalConfirmacao();
    };

    modal.classList.remove('d-none');
}

function fecharModalConfirmacao() {
    document.getElementById('modal-confirmacao').classList.add('d-none');
}

// --- GRÁFICOS DO DASHBOARD (CARTÕES) ---
async function preencherSelectCartoesDashboard() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/cartoes`);
        if (res.ok) {
            const cartoes = await res.json();
            const select = document.getElementById('dash-card-select');
            if(!select) return;

            select.innerHTML = '<option value="" disabled selected>Selecione um cartão...</option>';

            cartoes.forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.nome;
                select.appendChild(option);
            });

            if (cartoes.length > 0) {
                select.value = cartoes[0].id;
                atualizarGraficoCartao();
            }
        }
    } catch (e) { console.error("Erro ao carregar cartões no dashboard", e); }
}

async function atualizarGraficoCartao() {
    const idCartao = document.getElementById('dash-card-select').value;
    const inicio = document.getElementById('dash-inicio').value;
    const fim = document.getElementById('dash-fim').value;

    if (!idCartao) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/cartao_stats?id_cartao=${idCartao}&inicio=${inicio}&fim=${fim}`);
        if (res.ok) {
            const dados = await res.json();
            renderizarGraficoCartao(dados);
        }
    } catch (error) {
        console.error("Erro ao atualizar gráfico de cartão:", error);
    }
}

function renderizarGraficoCartao(dados) {
    const ctx = document.getElementById('chart-cartao-especifico').getContext('2d');
    const labels = dados.map(item => item.categoria);
    const valores = dados.map(item => item.total);

    const cores = [
        '#6c5ce7', '#0984e3', '#00cec9', '#00b894', '#fdcb6e',
        '#e17055', '#d63031', '#e84393', '#2d3436', '#636e72'
    ];

    if (chartCartaoEspecifico) chartCartaoEspecifico.destroy();

    chartCartaoEspecifico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: cores,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                title: { display: true, text: 'Distribuição de Gastos' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            const valor = context.raw;
                            // Usando formatarMoeda no tooltip
                            label += formatarMoeda(valor);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// LÓGICA DE SIMULAÇÃO DE CONTAS
// ==========================================
async function realizarSimulacao(e) {
    e.preventDefault();
    
    const valorTotal = parseFloat(document.getElementById('sim-valor').value);
    const qtdParcelas = parseInt(document.getElementById('sim-parcelas').value);
    const mesInicio = document.getElementById('sim-mes-inicio').value; // Formato "YYYY-MM"
    const tipo = document.getElementById('sim-tipo').value;
    
    const valorParcela = valorTotal / qtdParcelas;
    
    try {
        // Busca TODAS as parcelas do usuário chamando o endpoint sem filtro de mês
        const res = await fetch(`${API_BASE_URL}/parcelas`);
        if (!res.ok) throw new Error('Erro ao buscar parcelas');
        
        const todasParcelas = await res.json();
        
        // 1. Agrupar saldos cadastrados por mês
        const saldosPorMes = {};
        
        todasParcelas.forEach(p => {
            const mesStr = p.vencimento.slice(0, 7); // Extrai "YYYY-MM"
            if (!saldosPorMes[mesStr]) {
                saldosPorMes[mesStr] = { receitas: 0, despesas: 0 };
            }
            if (p.tipo === 'receita') saldosPorMes[mesStr].receitas += parseFloat(p.valor);
            else saldosPorMes[mesStr].despesas += parseFloat(p.valor);
        });
        
        // 2. Criar a lista de meses que serão afetados pela compra
        const mesesAfetados = [];
        const [anoInicial, mesInicial] = mesInicio.split('-').map(Number);
        
        for (let i = 0; i < qtdParcelas; i++) {
            // Ao criar a data dessa forma, se o mês passar de 12 o JS ajusta o ano automaticamente
            const data = new Date(anoInicial, (mesInicial - 1) + i, 1);
            const anoFormatado = data.getFullYear();
            const mesFormatado = String(data.getMonth() + 1).padStart(2, '0');
            mesesAfetados.push(`${anoFormatado}-${mesFormatado}`);
        }
        
        // 3. Montar a tabela de resultados
        const tbody = document.getElementById('simulacao-resultados');
        tbody.innerHTML = '';
        
        mesesAfetados.forEach((mes) => {
            const dadosDoMes = saldosPorMes[mes] || { receitas: 0, despesas: 0 };
            const saldoBaseAtual = dadosDoMes.receitas - dadosDoMes.despesas;
            
            let novoSaldo = saldoBaseAtual;
            if (tipo === 'despesa') {
                novoSaldo -= valorParcela;
            } else {
                novoSaldo += valorParcela;
            }
            
            // Formatando o nome do Mês para exibição (ex: Jan/2026)
            const [a, m] = mes.split('-');
            const dataExibicao = new Date(a, m - 1, 10);
            let mesCapitalizado = dataExibicao.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
            mesCapitalizado = mesCapitalizado.charAt(0).toUpperCase() + mesCapitalizado.slice(1);
            
            // Decidindo cores e status baseados no Novo Saldo final
            let situacaoHtml = '';
            if (novoSaldo < 0) {
                situacaoHtml = '<span class="badge bg-danger-subtle text-danger border border-danger p-2"><i class="bx bx-error"></i> Negativo</span>';
            } else if (novoSaldo < 150) { // Margem de alerta curta
                situacaoHtml = '<span class="badge bg-warning-subtle text-warning border border-warning p-2"><i class="bx bx-info-circle"></i> Apertado</span>';
            } else {
                situacaoHtml = '<span class="badge bg-success-subtle text-success border border-success p-2"><i class="bx bx-check-shield"></i> Seguro</span>';
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${mesCapitalizado}</td>
                <td class="fw-medium text-muted">${formatarMoeda(saldoBaseAtual)}</td>
                <td class="${tipo === 'despesa' ? 'text-danger' : 'text-success'} fw-medium">
                    ${tipo === 'despesa' ? '-' : '+'}${formatarMoeda(valorParcela)}
                </td>
                <td class="fw-bold ${novoSaldo < 0 ? 'text-danger' : 'text-success'} fs-6">${formatarMoeda(novoSaldo)}</td>
                <td>${situacaoHtml}</td>
            `;
            
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error("Erro ao simular:", error);
        showNotification("Erro ao processar simulação", "error");
    }
}