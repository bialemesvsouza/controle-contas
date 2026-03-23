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
let historicoPoupancaAtual = [];

// Variáveis dos Gráficos e Calendário
let chartDespesas = null;
let chartReceitas = null;
let chartCartaoEspecifico = null;
let mesAtualCalendario = new Date();
let listaPendentesGlobal = [];

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function mascaraMilhar(event) {
    let input = event.target;
    let valor = input.value.replace(/[^\d,]/g, '');
    let partes = valor.split(',');
    if (partes.length > 2) {
        partes = [partes[0], partes.slice(1).join('')];
    }
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    input.value = partes.join(',');
}

function limparFormatacao(valorFormatado) {
    if (!valorFormatado) return 0;
    if (typeof valorFormatado === 'number') return valorFormatado;
    return parseFloat(valorFormatado.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatarValorInput(valor) {
    let num = parseFloat(valor);
    if (isNaN(num)) return "0,00";
    let formatado = num.toFixed(2).replace('.', ',');
    let partes = formatado.split(',');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return partes.join(',');
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
    
    const recoverForm1 = document.getElementById('recover-form-1');
    if(recoverForm1) recoverForm1.addEventListener('submit', handleVerificarEmail);
    
    const recoverForm2 = document.getElementById('recover-form-2');
    if(recoverForm2) recoverForm2.addEventListener('submit', handleRedefinirSenha);

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

function navegarPara(tela) {
    document.querySelector('.app-menubar').classList.remove('menu-aberto');
    document.querySelectorAll('.menu-link').forEach(item => item.classList.remove('active'));
    const activeLink = document.querySelector(`[onclick="navegarPara('${tela}')"]`);
    if (activeLink) activeLink.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('d-none');
        view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${tela}`);
    if(targetView) {
        targetView.classList.remove('d-none');
        targetView.classList.add('active');
    }

    const titulos = {
        'dashboard': 'Visão Geral',
        'extrato': 'Extrato Mensal',
        'novo': 'Nova Transação',
        'categorias': 'Cadastros',
        'simulacao': 'Simulador de Contas',
        'poupanca': 'Sua Poupança'
    };
    const titleElement = document.querySelector('.page-title');
    if(titleElement) titleElement.textContent = titulos[tela] || 'SmartGrana';

    if(tela === 'dashboard') { loadDashboard(); carregarDadosExtrasDashboard(); }
    if(tela === 'extrato') loadParcelas();
    if(tela === 'poupanca') loadPoupanca();
    if(tela === 'novo' || tela === 'categorias') {
        loadCategorias(tela === 'categorias');
        loadCartoes();
    }
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
        mostrarTelaLogin();
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/api/tipos`);
        if (res.ok) {
            currentUser = JSON.parse(userStored);
            showApp();
        } else {
            localStorage.removeItem('currentUser');
            mostrarTelaLogin();
            showNotification('Sua sessão expirou. Faça login novamente.', 'error');
        }
    } catch (e) {
        mostrarTelaLogin();
    }
}

function mostrarTelaLogin() {
    document.getElementById('auth-section').classList.remove('d-none-important');
    document.getElementById('app-nav').classList.add('d-none-important');
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
            document.getElementById('dash-total-receitas').textContent = formatarMoeda(data.total_receitas);
            document.getElementById('dash-total-despesas').textContent = formatarMoeda(data.total_despesas);
            renderizarGrafico('chart-despesas', 'despesa', data.grafico_despesas);
            renderizarGrafico('chart-receitas', 'receita', data.grafico_receitas);

            const saldo = data.total_receitas - data.total_despesas;
            const elBalanco = document.getElementById('dash-balanco');
            elBalanco.textContent = formatarMoeda(saldo);
            elBalanco.className = 'fw-bold mb-0 mt-1 ' + (saldo >= 0 ? 'text-success' : 'text-danger');

            const selectCartao = document.getElementById('dash-card-select');
            if (selectCartao && selectCartao.options.length <= 1) {
                await preencherSelectCartoesDashboard();
            }
            if (selectCartao && selectCartao.value) {
                atualizarGraficoCartao();
            }
        }
    } catch (error) { console.error("Erro ao carregar dashboard:", error); }
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
            datasets: [{ data: valores, backgroundColor: coresBase, borderWidth: 1 }]
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
                            label += formatarMoeda(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    };

    if (tipo === 'despesa') chartDespesas = new Chart(ctx, config);
    else chartReceitas = new Chart(ctx, config);
}

// --- CATEGORIAS E CARTÕES ---
async function loadCategorias(renderizarNaTela = false) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/tipos`);
        if(res.ok) {
            todasCategorias = await res.json();
            const tipoTransacaoAtual = document.getElementById('transacao-tipo').value;
            atualizarSelectCategorias(tipoTransacaoAtual);
            if(renderizarNaTela) renderizarListaCategoriasGerenciamento();
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

function toggleSelectCartaoEdit() {
    const forma = document.getElementById('edit-forma-pagamento').value;
    const divCartao = document.getElementById('div-select-cartao-edit');
    const inputCartao = document.getElementById('edit-cartao-id');

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
        } catch(e) { showNotification('Erro ao excluir', 'error'); }
    });
}

// ===============================================
// EXTRATO & ROVER & FILTROS
// ===============================================

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
    
    const tituloMes = document.getElementById('titulo-lista-mes');
    tituloMes.textContent = `${tipo === 'despesa' ? 'Despesas' : 'Receitas'} do Mês`;
    
    tituloMes.classList.remove('text-dark', 'text-danger', 'text-success');
    
    if (tipo === 'despesa') {
        tituloMes.classList.add('text-danger'); // Vermelho
    } else {
        tituloMes.classList.add('text-success'); // Verde
    }

    preencherFiltrosExtrato();
    renderizarTabela();
}

function preencherFiltrosExtrato() {
    const selectCat = document.getElementById('filtro-categoria');
    if (selectCat) {
        selectCat.innerHTML = '<option value="">Todas</option>';
        todasCategorias.filter(c => c.categoria === filtroTipoExtrato).forEach(c => {
            selectCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
        });
    }

    const selectFp = document.getElementById('filtro-forma-pag');
    if (selectFp) {
        selectFp.innerHTML = '<option value="">Todas</option>';
        const formasPadrao = ['Pix', 'Cartão Débito', 'Dinheiro', 'Transferência Bancária'];
        formasPadrao.forEach(f => {
            selectFp.innerHTML += `<option value="${f}">${f}</option>`;
        });
        if (filtroTipoExtrato === 'despesa') {
            todosCartoes.forEach(c => {
                selectFp.innerHTML += `<option value="${c.nome}">💳 ${c.nome} (Cartão)</option>`;
            });
        }
    }
    
    if(document.getElementById('filtro-status')) {
        const selectSt = document.getElementById('filtro-status');
        selectSt.innerHTML = '<option value="">Todos</option>';
        if(filtroTipoExtrato === 'despesa') {
            selectSt.innerHTML += `<option value="a_pagar">A Pagar</option>
                                   <option value="pago">Pago</option>
                                   <option value="atrasado">Atrasado</option>`;
        } else {
            selectSt.innerHTML += `<option value="a_receber">A Receber</option>
                                   <option value="recebido">Recebido</option>`;
        }
    }

    if(document.getElementById('filtro-descricao')) document.getElementById('filtro-descricao').value = '';
    if(document.getElementById('filtro-vencimento')) document.getElementById('filtro-vencimento').value = '';
}

async function loadParcelas() {
    const res = await fetch(`${API_BASE_URL}/parcelas?mes=${mesAtualExtrato}`);
    parcelasAtuais = await res.json();
    
    if(todasCategorias.length === 0) await loadCategorias();
    if(todosCartoes.length === 0) await loadCartoes();
    
    preencherFiltrosExtrato();
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

    const desc = document.getElementById('filtro-descricao')?.value.toLowerCase() || '';
    const cat = document.getElementById('filtro-categoria')?.value || '';
    const fp = document.getElementById('filtro-forma-pag')?.value || '';
    const venc = document.getElementById('filtro-vencimento')?.value || '';
    const st = document.getElementById('filtro-status')?.value || '';

    const listaFiltrada = parcelasAtuais.filter(p => {
        if (p.tipo !== filtroTipoExtrato) return false;
        if (desc && !p.descricao.toLowerCase().includes(desc)) return false;
        if (cat && p.id_categoria.toString() !== cat) return false;
        
        let formaExibicao = p.forma_pagamento;
        if (p.forma_pagamento === 'Cartão Crédito' && p.nome_cartao) {
            formaExibicao = p.nome_cartao;
        }
        if (fp && formaExibicao !== fp) return false;
        if (venc && p.vencimento !== venc) return false;
        
        if (st) {
            if (st === 'a_pagar' && p.status !== 'a_pagar') return false;
            if (st === 'pago' && p.status !== 'pago') return false;
            if (st === 'atrasado' && p.status !== 'atrasado') return false;
            if (st === 'a_receber' && p.status !== 'a_receber') return false;
            if (st === 'recebido' && p.status !== 'recebido') return false;
        }
        return true;
    });

    if (listaFiltrada.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Nenhuma ${filtroTipoExtrato} encontrada para os filtros selecionados.</td></tr>`;
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
        let pStatusExibicao = '';

        if (p.tipo === 'receita') {
            if (p.status === 'recebido') {
                checkboxHtml = `<span class="text-success fw-bold">●</span>`;
                badge = 'status-pago';
                pStatusExibicao = 'Recebido';
            } else {
                checkboxHtml = `<input type="checkbox" class="form-check-input parcela-checkbox" value="${p.id}" onchange="atualizarBotaoLote()">`;
                badge = 'status-a_receber';
                pStatusExibicao = 'A Receber';
            }
        } else {
            if(p.status === 'pago') badge = 'status-pago';
            else if(p.status === 'atrasado') badge = 'status-atrasado';
            else badge = 'status-a_pagar';

            pStatusExibicao = p.status.replace('_', ' ');

            checkboxHtml = p.status !== 'pago'
                ? `<input type="checkbox" class="form-check-input parcela-checkbox" value="${p.id}" onchange="atualizarBotaoLote()">`
                : `<span class="text-success fw-bold">&#10003;</span>`;
        }

        let formaPgtoHTML = p.forma_pagamento || '-';
        if (p.forma_pagamento === 'Cartão Crédito' && p.nome_cartao) {
            formaPgtoHTML = `<i class='bx bx-credit-card text-primary me-1'></i> <strong>${p.nome_cartao}</strong>`;
        }

         row.innerHTML = `
            <td class="text-center">${checkboxHtml}</td>
            <td class="fw-medium text-dark">${p.descricao}</td>
            <td class="text-muted">${p.numero}</td>
            <td><span class="badge bg-light text-dark border">${p.categoria}</span></td>
            <td class="text-muted small">${formaPgtoHTML}</td>
            <td class="fw-bold">${formatarMoeda(p.valor)}</td>
            <td>${dataDisplay}</td>
            <td><span class="status-badge ${badge}">${pStatusExibicao}</span></td>
            <td class="text-end pe-4">
                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-primary btn-sm px-3" onclick="abrirModal(${indexOriginal})"><i class='bx bx-edit'></i> Editar</button>
                    <button class="btn btn-danger btn-sm px-3" onclick="tentarExcluirParcela(${indexOriginal})"><i class='bx bx-trash'></i> Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    const corTotal = filtroTipoExtrato === 'receita' ? 'text-success' : 'text-danger';
    tfoot.innerHTML = `
        <tr>
            <td colspan="5" class="text-end fw-bold text-dark">Total ${filtroTipoExtrato === 'receita' ? 'Receitas' : 'Despesas'}:</td>
            <td colspan="4" class="fw-bold fs-6 ${corTotal}">${formatarMoeda(totalFiltrado)}</td>
        </tr>
    `;
}

// ==========================================
// LÓGICA DE CÁLCULO E TABELA DE PARCELAS 
// ==========================================
function gerarCamposData() {
    const inputQtd = document.getElementById('transacao-parcelas');
    if(!inputQtd) return;
    let qtd = parseInt(inputQtd.value);
    if (isNaN(qtd) || qtd < 1) qtd = 1;

    const isFixa = document.getElementById('transacao-fixa') && document.getElementById('transacao-fixa').checked;
    let valorDigitado = limparFormatacao(document.getElementById('transacao-valor').value) || 0;
    
    const valorTotal = isFixa ? valorDigitado * qtd : valorDigitado;
    
    const container = document.getElementById('container-datas');
    container.innerHTML = '';

    let valorBase = valorTotal / qtd;
    let somaArr = [];
    let totalDistribuido = 0;

    for(let i = 0; i < qtd; i++) {
        let v = Number(valorBase.toFixed(2));
        if(i === qtd - 1) { 
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
                    <input type="text" class="form-control form-control-sm border-start-0 ps-0 input-valor-parcela fw-bold text-dark" value="${formatarValorInput(somaArr[i])}" required onchange="recalcularValoresAbaixo(${i})" oninput="mascaraMilhar(event); calcularSomaParcelas()">
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
            <td class="text-center" style="vertical-align: middle;">
                <input class="form-check-input input-paga-parcela mt-1" type="checkbox" style="transform: scale(1.3); cursor: pointer;">
            </td>
        `;
        container.appendChild(tr);
    }
    calcularSomaParcelas();
}

function recalcularValoresAbaixo(indexAlterado) {
    const inputs = document.querySelectorAll('.input-valor-parcela');
    const valorTotal = limparFormatacao(document.getElementById('transacao-valor').value);

    let somaFixada = 0;
    for(let i = 0; i <= indexAlterado; i++) {
        somaFixada += limparFormatacao(inputs[i].value) || 0;
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
            inputs[i].value = formatarValorInput(v);
        }
    }
    calcularSomaParcelas();
}

function calcularSomaParcelas() {
    const elValorTotal = document.getElementById('transacao-valor');
    if(!elValorTotal) return;

    const valorTotal = limparFormatacao(elValorTotal.value);
    const inputsValores = document.querySelectorAll('.input-valor-parcela');
    let soma = 0;

    inputsValores.forEach(input => { soma += limparFormatacao(input.value) || 0; });

    const diferenca = valorTotal - soma;
    const elSoma = document.getElementById('soma-parcelas');
    const elDif = document.getElementById('diferenca-parcelas');

    if (elSoma && elDif) {
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

    const isFixa = document.getElementById('transacao-fixa') ? document.getElementById('transacao-fixa').checked : false;

    const inputsData = document.querySelectorAll('.input-data-parcela');
    const listaDatas = Array.from(inputsData).map(input => input.value);

    const inputsValor = document.querySelectorAll('.input-valor-parcela');
    const listaValores = Array.from(inputsValor).map(input => limparFormatacao(input.value) || 0);

    const inputsPagas = document.querySelectorAll('.input-paga-parcela');
    const listaPagas = Array.from(inputsPagas).map(input => input.checked);

    let valorBaseDigitado = limparFormatacao(document.getElementById('transacao-valor').value) || 0;
    let qtdParcelas = parseInt(document.getElementById('transacao-parcelas').value) || 1;

    let valorTotal = isFixa ? (valorBaseDigitado * qtdParcelas) : valorBaseDigitado;
    
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
        parcelas: qtdParcelas,
        tipo: document.getElementById('transacao-tipo').value,
        id_tipo_categoria: parseInt(catId),
        datas_parcelas: listaDatas,
        valores_parcelas: listaValores,
        forma_pagamento: formaPagamento,
        id_cartao: idCartao ? parseInt(idCartao) : null,
        is_fixa: isFixa,
        pagas_parcelas: listaPagas
    };

    doPost('/nova_transacao', body, (data) => {
        showNotification(data.mensagem);
        
        document.getElementById('nova-transacao-form').reset();
        
        if (typeof toggleTransacaoFixa === 'function') {
            toggleTransacaoFixa();
        }
        
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
            carregarDadosExtrasDashboard();
        });
    });
}

// --- MODAIS (Edição e Exclusão) ---
function abrirModal(index) {
    const p = parcelasAtuais[index];

    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-descricao').value = p.descricao;
    document.getElementById('edit-valor').value = formatarValorInput(p.valor);
    document.getElementById('edit-vencimento').value = p.vencimento;

    const selectStatus = document.getElementById('edit-status');
    const divStatus = selectStatus.closest('.form-group');
    const labelVencimento = document.getElementById('edit-vencimento').closest('.form-group').querySelector('label');

    divStatus.classList.remove('d-none'); 
    selectStatus.innerHTML = '';
    
    if (p.tipo === 'receita') {
        labelVencimento.textContent = 'Data de Recebimento';
        selectStatus.innerHTML = `
            <option value="a_receber">A Receber</option>
            <option value="recebido">Recebido</option>
        `;
    } else {
        labelVencimento.textContent = 'Vencimento';
        selectStatus.innerHTML = `
            <option value="a_pagar">A Pagar</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
        `;
    }
    selectStatus.value = p.status;

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

    const selectFormaPagamento = document.getElementById('edit-forma-pagamento');
    const selectCartao = document.getElementById('edit-cartao-id');
    
    if (selectFormaPagamento) {
        selectFormaPagamento.value = p.forma_pagamento || 'Pix';
    }

    if (selectCartao) {
        selectCartao.innerHTML = '<option value="" disabled selected>Escolha um cartão...</option>';
        todosCartoes.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.nome;
            selectCartao.appendChild(option);
        });
        
        if (p.forma_pagamento === 'Cartão Crédito' && p.nome_cartao) {
            const cartaoEncontrado = todosCartoes.find(c => c.nome === p.nome_cartao);
            if (cartaoEncontrado) {
                selectCartao.value = cartaoEncontrado.id;
            }
        }
    }
    toggleSelectCartaoEdit();

    document.getElementById('modal-edicao').classList.remove('d-none');
}

function fecharModal() {
    document.getElementById('modal-edicao').classList.add('d-none');
}

async function salvarEdicao(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;

    const formaPagamento = document.getElementById('edit-forma-pagamento').value;
    const idCartao = document.getElementById('edit-cartao-id').value;

    if (formaPagamento === 'Cartão Crédito' && !idCartao) {
        showNotification('Selecione qual cartão foi utilizado', 'error');
        return;
    }

    const body = {
        descricao: document.getElementById('edit-descricao').value,
        valor: limparFormatacao(document.getElementById('edit-valor').value),
        vencimento: document.getElementById('edit-vencimento').value,
        status: document.getElementById('edit-status').value,
        id_categoria: document.getElementById('edit-categoria').value,
        forma_pagamento: formaPagamento,
        id_cartao: idCartao ? parseInt(idCartao) : null
    };

    doPost(`/editar_parcela/${id}`, body, (data) => {
        showNotification(data.mensagem);
        fecharModal();
        loadParcelas();
        loadDashboard();
        carregarDadosExtrasDashboard();
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
                carregarDadosExtrasDashboard();
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
                carregarDadosExtrasDashboard();
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
        if (res.status === 401) {
            handleLogout(); 
            showNotification('Sua sessão expirou.', 'error');
            return;
        }
        const data = await res.json();
        if (res.ok) {
            callback(data);
        } else {
            showNotification(data.erro, 'error');
        }
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
    } catch (error) { console.error("Erro ao atualizar gráfico de cartão:", error); }
}

function renderizarGraficoCartao(dados) {
    const ctx = document.getElementById('chart-cartao-especifico').getContext('2d');
    const labels = dados.map(item => item.categoria);
    const valores = dados.map(item => item.total);
    const cores = ['#6c5ce7', '#0984e3', '#00cec9', '#00b894', '#fdcb6e','#e17055', '#d63031', '#e84393', '#2d3436', '#636e72'];

    if (chartCartaoEspecifico) chartCartaoEspecifico.destroy();

    chartCartaoEspecifico = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 1 }] },
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
                            label += formatarMoeda(context.raw);
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
    
    const valorTotal = limparFormatacao(document.getElementById('sim-valor').value);
    const qtdParcelas = parseInt(document.getElementById('sim-parcelas').value);
    const mesInicio = document.getElementById('sim-mes-inicio').value; 
    const tipo = document.getElementById('sim-tipo').value;
    
    const valorParcela = valorTotal / qtdParcelas;
    
    try {
        const res = await fetch(`${API_BASE_URL}/parcelas`);
        if (!res.ok) throw new Error('Erro ao buscar parcelas');
        const todasParcelas = await res.json();
        
        const saldosPorMes = {};
        todasParcelas.forEach(p => {
            const mesStr = p.vencimento.slice(0, 7); 
            if (!saldosPorMes[mesStr]) {
                saldosPorMes[mesStr] = { receitas: 0, despesas: 0 };
            }
            if (p.tipo === 'receita') saldosPorMes[mesStr].receitas += parseFloat(p.valor);
            else saldosPorMes[mesStr].despesas += parseFloat(p.valor);
        });
        
        const mesesAfetados = [];
        const [anoInicial, mesInicial] = mesInicio.split('-').map(Number);
        
        for (let i = 0; i < qtdParcelas; i++) {
            const data = new Date(anoInicial, (mesInicial - 1) + i, 1);
            const anoFormatado = data.getFullYear();
            const mesFormatado = String(data.getMonth() + 1).padStart(2, '0');
            mesesAfetados.push(`${anoFormatado}-${mesFormatado}`);
        }
        
        const tbody = document.getElementById('simulacao-resultados');
        tbody.innerHTML = '';
        
        let saldoFinalDaSimulacao = 0;

        mesesAfetados.forEach((mes) => {
            const dadosDoMes = saldosPorMes[mes] || { receitas: 0, despesas: 0 };
            const saldoBaseAtual = dadosDoMes.receitas - dadosDoMes.despesas;
            
            let novoSaldo = saldoBaseAtual;
            if (tipo === 'despesa') { novoSaldo -= valorParcela; } else { novoSaldo += valorParcela; }
            
            saldoFinalDaSimulacao += novoSaldo;
            
            const [a, m] = mes.split('-');
            const dataExibicao = new Date(a, m - 1, 10);
            let mesCapitalizado = dataExibicao.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
            mesCapitalizado = mesCapitalizado.charAt(0).toUpperCase() + mesCapitalizado.slice(1);
            
            let situacaoHtml = '';
            if (novoSaldo < 0) {
                situacaoHtml = '<span class="badge bg-danger-subtle text-danger border border-danger p-2"><i class="bx bx-error"></i> Negativo</span>';
            } else if (novoSaldo < 150) { 
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
        
        document.getElementById('simulacao-resumo').classList.remove('d-none');
        document.getElementById('resumo-valor-total').textContent = formatarMoeda(valorTotal);
        document.getElementById('resumo-qtd-parcelas').textContent = qtdParcelas + 'x';
        document.getElementById('resumo-valor-parcela').textContent = formatarMoeda(valorParcela);
        
        const elSaldoFinal = document.getElementById('resumo-saldo-final');
        elSaldoFinal.textContent = formatarMoeda(saldoFinalDaSimulacao);
        elSaldoFinal.className = saldoFinalDaSimulacao < 0 ? 'text-danger fw-bold fs-6' : 'text-success fw-bold fs-6';
        
    } catch (error) {
        console.error("Erro ao simular:", error);
        showNotification("Erro ao processar simulação", "error");
    }
}

function limparSimulacao() {
    document.getElementById('form-simulacao').reset();
    const inputMesInicio = document.getElementById('sim-mes-inicio');
    if(inputMesInicio) {
        inputMesInicio.value = new Date().toISOString().slice(0, 7);
    }
    const resumo = document.getElementById('simulacao-resumo');
    if (resumo) resumo.classList.add('d-none');
    const tbody = document.getElementById('simulacao-resultados');
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-5 text-muted">
                <i class='bx bx-info-circle fs-3 d-block mb-2'></i>
                Preencha os dados e clique em "Simular Projeção" para visualizar.
            </td>
        </tr>
    `;
}

// --- CALENDÁRIO DASHBOARD ---
function renderizarCalendarioPendencias(lista) {
    listaPendentesGlobal = lista; 
    renderizarGradeCalendario();
}

function mudarMesCalendario(delta) {
    mesAtualCalendario.setMonth(mesAtualCalendario.getMonth() + delta);
    renderizarGradeCalendario();
}

function renderizarGradeCalendario() {
    const year = mesAtualCalendario.getFullYear();
    const month = mesAtualCalendario.getMonth();
    const mesAnoTexto = mesAtualCalendario.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
    const titulo = document.getElementById('calendario-mes-ano');
    if (titulo) titulo.textContent = mesAnoTexto;

    const grid = document.getElementById('calendar-grid');
    if(!grid) return;
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const hoje = new Date();
    const hojeY = hoje.getFullYear(), hojeM = hoje.getMonth(), hojeD = hoje.getDate();

    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += `<div class="calendar-day empty"></div>`;
    }

    for(let day=1; day<=daysInMonth; day++) {
        const dataAtualStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (year === hojeY && month === hojeM && day === hojeD);
        const eventosDia = listaPendentesGlobal.filter(p => p.vencimento === dataAtualStr);
        
        let htmlEventos = '';
        eventosDia.forEach(ev => {
            const classeCor = ev.tipo === 'receita' ? 'receita' : 'despesa';
            const prefix = ev.tipo === 'receita' ? '+' : '-';
            htmlEventos += `<div class="calendar-event ${classeCor}" title="${ev.descricao} - ${formatarMoeda(ev.valor)}">${prefix}${formatarMoeda(ev.valor)} ${ev.descricao}</div>`;
        });

        grid.innerHTML += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="calendar-day-number">${day}</div>
                <div class="calendar-events flex-grow-1">${htmlEventos}</div>
            </div>
        `;
    }
}

function abrirModalPendentes() {
    const tbody = document.getElementById('tabela-pendentes-modal');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(listaPendentesGlobal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-success py-5"><i class='bx bx-check-circle fs-3 d-block mb-2'></i> Oba! Nenhuma conta ou receita pendente.</td></tr>`;
    } else {
        const pendentesOrdenados = [...listaPendentesGlobal].sort((a,b) => new Date(a.vencimento) - new Date(b.vencimento));
        pendentesOrdenados.forEach(p => {
            const dataParts = p.vencimento.split('-');
            const dataDisplay = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
            
            let badge = 'status-a_pagar';
            let stExib = 'A Pagar';
            if(p.status === 'atrasado') { badge = 'status-atrasado'; stExib = 'Atrasado'; }
            if(p.status === 'a_receber') { badge = 'status-a_receber'; stExib = 'A Receber'; }
            
            const corValor = p.tipo === 'receita' ? 'text-success' : 'text-danger';
            const prefix = p.tipo === 'receita' ? '+' : '-';

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4 fw-medium">${dataDisplay}</td>
                    <td class="fw-bold text-dark">${p.descricao}</td>
                    <td><span class="badge bg-light text-dark border">${p.categoria}</span></td>
                    <td class="text-muted">${p.numero}</td>
                    <td class="fw-bold ${corValor}">${prefix}${formatarMoeda(p.valor)}</td>
                    <td><span class="status-badge ${badge}">${stExib}</span></td>
                </tr>
            `;
        });
    }
    document.getElementById('modal-lista-pendentes').classList.remove('d-none');
}

function fecharModalPendentes() {
    document.getElementById('modal-lista-pendentes').classList.add('d-none');
}

async function carregarDadosExtrasDashboard() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/extras`);
        if (!res.ok) return;
        const dados = await res.json();
        
        document.getElementById('dash-saldo-acumulado').textContent = formatarMoeda(dados.saldo_acumulado);
        renderizarTabelaMeses('tabela-fechamento', dados.meses_fechados, true); 
        renderizarTabelaMeses('tabela-previsao', dados.meses_futuros, false);   
        
        // Renderiza o Calendário e a lista do Modal
        renderizarCalendarioPendencias(dados.pendentes);
    } catch (error) { console.error("Erro ao carregar dados extras:", error); }
}

function formatarMesAnoUI(mesIso) {
    const [ano, mes] = mesIso.split('-');
    const data = new Date(ano, mes - 1, 10);
    let str = data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderizarTabelaMeses(idTabela, dadosDict, desc) {
    const tbody = document.getElementById(idTabela);
    if (!tbody) return;
    tbody.innerHTML = '';
    let chaves = Object.keys(dadosDict).sort();
    if (desc) chaves.reverse();
    if (chaves.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted py-5">Nenhum dado encontrado.</td></tr>`;
        return;
    }
    chaves.forEach(mes => {
        const row = dadosDict[mes];
        const saldo = row.receitas - row.despesas;
        const cor = saldo >= 0 ? 'text-success' : 'text-danger';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="fw-bold text-dark">${formatarMesAnoUI(mes)}</td>
            <td class="text-success fw-medium">${formatarMoeda(row.receitas)}</td>
            <td class="text-danger fw-medium">${formatarMoeda(row.despesas)}</td>
            <td class="fw-bold ${cor} bg-light">${formatarMoeda(saldo)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- LÓGICA DO MODAL DE EXCLUSÃO EM LOTE (FLUXO) ---

function tentarExcluirParcela(index) {
    const p = parcelasAtuais[index];
    const partesNum = p.numero.split('/');
    const totalParcelas = parseInt(partesNum[1]);

    if (totalParcelas > 1) {
        abrirModalExclusaoLote(p.id_transacao, p.descricao);
    } else {
        excluirDireto(p.id); 
    }
}

async function abrirModalExclusaoLote(id_transacao, descricao) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/transacao/${id_transacao}/parcelas`);
        if (!res.ok) throw new Error("Erro ao buscar parcelas");
        const parcelas = await res.json();

        if(parcelas.length === 0) {
            fecharModalExclusaoLote();
            return;
        }

        const tbody = document.getElementById('lista-exclusao-parcelas');
        tbody.innerHTML = '';

        parcelas.forEach(p => {
            const dataParts = p.vencimento.split('-');
            const dataDisplay = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
            
            let badge = p.status === 'atrasado' ? 'status-atrasado' : (p.status === 'pago' || p.status === 'recebido' ? 'status-pago' : 'status-a_pagar');
            if (p.status === 'a_receber') badge = 'status-a_receber';

            tbody.innerHTML += `
                <tr>
                    <td><button class="btn btn-sm btn-outline-danger py-0 px-2 fs-6" title="Excluir apenas esta" onclick="excluirParcelaUnicaModal(${p.id}, ${id_transacao}, '${descricao}')"><i class='bx bx-trash'></i></button></td>
                    <td class="fw-medium">${dataDisplay}</td>
                    <td class="text-muted">${p.numero_parcela}/${p.qtd_parcelas}</td>
                    <td class="fw-bold">${formatarMoeda(p.valor)}</td>
                    <td><span class="status-badge ${badge}">${p.status.replace('_', ' ')}</span></td>
                </tr>
            `;
        });

        document.getElementById('btn-excluir-todas-parcelas').onclick = () => excluirTodasParcelas(id_transacao);
        document.getElementById('modal-exclusao-lote').classList.remove('d-none');
        document.getElementById('btn-cancelar-fixa').onclick = () => cancelarRenovacaoFixa(id_transacao);
    } catch(e) { showNotification("Erro ao carregar os dados da transação", "error"); }
}

function fecharModalExclusaoLote() {
    document.getElementById('modal-exclusao-lote').classList.add('d-none');
}

function excluirParcelaUnicaModal(idParcela, idTransacao, descricao) {
    abrirConfirmacao("Excluir apenas esta parcela?", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/excluir_parcela/${idParcela}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                showNotification(data.mensagem, 'success');
                abrirModalExclusaoLote(idTransacao, descricao); 
                loadParcelas();
                loadDashboard();
                carregarDadosExtrasDashboard();
            } else {
                showNotification(data.erro, 'error');
            }
        } catch(e) { showNotification('Erro ao excluir', 'error'); }
    });
}

function excluirTodasParcelas(id_transacao) {
    abrirConfirmacao("Tem certeza que deseja Cancelar o Fluxo inteiro e apagar todas as parcelas deste lançamento?", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/excluir_transacao/${id_transacao}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                showNotification(data.mensagem, 'success');
                fecharModalExclusaoLote();
                loadParcelas();
                loadDashboard();
                carregarDadosExtrasDashboard();
            } else { showNotification(data.erro, 'error'); }
        } catch(e) { showNotification('Erro ao cancelar fluxo', 'error'); }
    });
}

// ==========================================
// LÓGICA DE REPARCELAMENTO (MODAL)
// ==========================================
let parcelasReparcelamento = [];

function prepararReparcelar() {
    const idParcela = document.getElementById('edit-id').value;
    const p = parcelasAtuais.find(x => x.id == idParcela);
    if (p) {
        fecharModal(); 
        abrirModalReparcelar(p.id_transacao);
    }
}

async function abrirModalReparcelar(id_transacao) {
    document.getElementById('reparcelar-id-transacao').value = id_transacao;
    try {
        const res = await fetch(`${API_BASE_URL}/api/transacao/${id_transacao}/parcelas`);
        if (!res.ok) throw new Error("Erro ao buscar parcelas");
        const parcelas = await res.json();
        
        let total = parcelas.reduce((acc, p) => acc + parseFloat(p.valor), 0);
        document.getElementById('reparcelar-valor-total').value = formatarValorInput(total);
        
        parcelasReparcelamento = parcelas.map((p) => ({ valor: parseFloat(p.valor), vencimento: p.vencimento }));
        
        renderizarListaReparcelamento();
        document.getElementById('modal-reparcelar').classList.remove('d-none');
    } catch(e) { showNotification("Erro ao carregar os dados para reparcelamento", "error"); }
}

function fecharModalReparcelar() {
    document.getElementById('modal-reparcelar').classList.add('d-none');
}

function renderizarListaReparcelamento() {
    const tbody = document.getElementById('lista-reparcelamento');
    tbody.innerHTML = '';
    parcelasReparcelamento.forEach((p, i) => {
        tbody.innerHTML += `
            <tr>
                <td class="text-muted fw-bold">${i + 1}</td>
                <td><input type="text" class="form-control form-control-sm text-center fw-bold input-rep-valor" value="${formatarValorInput(p.valor)}" oninput="mascaraMilhar(event); atualizarValorReparcelamento(${i}, this.value); calcularSomaReparcelamento()"></td>
                <td><input type="date" class="form-control form-control-sm text-center input-rep-data" value="${p.vencimento}" onchange="atualizarDataReparcelamento(${i}, this.value)"></td>
                <td>
                    <div class="btn-group btn-group-sm shadow-sm" role="group">
                        <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaReparcelamento(${i}, 'M')" title="Avançar 1 Mês"> M</button>
                        <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaReparcelamento(${i}, 'A')" title="Avançar 1 Ano"> A</button>
                        <button type="button" class="btn btn-light border text-primary fw-bold" onclick="aplicarRecorrenciaReparcelamento(${i}, '=')" title="Copiar p/ Baixo"> = </button>
                    </div>
                </td>
                <td><button class="btn btn-sm btn-outline-danger py-0 px-2 fs-6" onclick="removerParcelaReparcelamento(${i})"><i class='bx bx-trash'></i></button></td>
            </tr>
        `;
    });
    calcularSomaReparcelamento();
}

function atualizarValorReparcelamento(index, valStr) { parcelasReparcelamento[index].valor = limparFormatacao(valStr) || 0; }
function atualizarDataReparcelamento(index, val) { parcelasReparcelamento[index].vencimento = val; }

function adicionarParcelaReparcelamento() {
    let nextDate = new Date().toISOString().split('T')[0];
    if (parcelasReparcelamento.length > 0) {
        let lastDate = parcelasReparcelamento[parcelasReparcelamento.length - 1].vencimento;
        if (lastDate) {
            let [ano, mes, dia] = lastDate.split('-').map(Number);
            let nd = new Date(ano, mes, dia); 
            nextDate = nd.toISOString().split('T')[0];
        }
    }
    parcelasReparcelamento.push({ valor: 0, vencimento: nextDate });
    recalcularTodasParcelasReparcelamento();
}

function removerParcelaReparcelamento(index) {
    if (parcelasReparcelamento.length <= 1) {
        showNotification("A transação precisa ter pelo menos uma parcela.", "error");
        return;
    }
    parcelasReparcelamento.splice(index, 1);
    recalcularTodasParcelasReparcelamento();
}

function recalcularTodasParcelasReparcelamento() {
    let totalStr = document.getElementById('reparcelar-valor-total').value;
    let total = limparFormatacao(totalStr);
    let qtd = parcelasReparcelamento.length;
    
    if (qtd > 0 && total > 0) {
        let valorBase = total / qtd;
        let totalDistribuido = 0;
        for (let i = 0; i < qtd; i++) {
            let v = Number(valorBase.toFixed(2));
            if (i === qtd - 1) { v = Number((total - totalDistribuido).toFixed(2)); }
            totalDistribuido += v;
            parcelasReparcelamento[i].valor = v;
        }
    }
    renderizarListaReparcelamento();
}

function calcularSomaReparcelamento() {
    let totalStr = document.getElementById('reparcelar-valor-total').value;
    let total = limparFormatacao(totalStr);
    let soma = 0;
    document.querySelectorAll('.input-rep-valor').forEach(inp => { soma += limparFormatacao(inp.value) || 0; });
    let dif = total - soma;
    document.getElementById('reparcelar-soma').textContent = formatarMoeda(soma);
    document.getElementById('reparcelar-diferenca').textContent = formatarMoeda(Math.abs(dif));
    
    if (Math.abs(dif) > 0.01) {
        document.getElementById('reparcelar-soma').className = 'text-danger fw-bold';
        document.getElementById('reparcelar-diferenca').className = 'text-danger fw-bold';
    } else {
        document.getElementById('reparcelar-soma').className = 'text-primary fw-bold';
        document.getElementById('reparcelar-diferenca').className = 'text-success fw-bold';
    }
}

function aplicarRecorrenciaReparcelamento(indexBase, tipo) {
    const dataBaseVal = parcelasReparcelamento[indexBase].vencimento;
    if (!dataBaseVal) { showNotification('Preencha a data base antes de replicar.', 'error'); return; }

    const [anoBase, mesBase, diaBase] = dataBaseVal.split('-').map(Number);

    for (let i = indexBase + 1; i < parcelasReparcelamento.length; i++) {
        if (tipo === '=') {
            parcelasReparcelamento[i].vencimento = dataBaseVal;
        } else {
            let novaData = new Date(anoBase, mesBase - 1, diaBase);
            let delta = i - indexBase; 

            if (tipo === 'M') novaData.setMonth(novaData.getMonth() + delta);
            if (tipo === 'A') novaData.setFullYear(novaData.getFullYear() + delta);

            if (novaData.getDate() !== diaBase) novaData.setDate(0);

            const anoIso = novaData.getFullYear();
            const mesIso = String(novaData.getMonth() + 1).padStart(2, '0');
            const diaIso = String(novaData.getDate()).padStart(2, '0');

            parcelasReparcelamento[i].vencimento = `${anoIso}-${mesIso}-${diaIso}`;
        }
    }
    renderizarListaReparcelamento();
}

function salvarReparcelamento() {
    let totalStr = document.getElementById('reparcelar-valor-total').value;
    let total = limparFormatacao(totalStr);
    let soma = 0;
    
    parcelasReparcelamento.forEach(p => soma += p.valor);
    if (Math.abs(total - soma) > 0.01) { showNotification("A soma das parcelas deve ser igual ao Valor Total.", "error"); return; }
    if (parcelasReparcelamento.some(p => !p.vencimento)) { showNotification("Preencha as datas de todas as parcelas.", "error"); return; }
    
    const id_transacao = document.getElementById('reparcelar-id-transacao').value;
    const datas = parcelasReparcelamento.map(p => p.vencimento);
    const valores = parcelasReparcelamento.map(p => p.valor);
    
    doPost(`/reparcelar/${id_transacao}`, { datas_parcelas: datas, valores_parcelas: valores }, (data) => {
        showNotification(data.mensagem, 'success');
        fecharModalReparcelar();
        loadParcelas();
        loadDashboard();
        carregarDadosExtrasDashboard();
    });
}

// ==========================================
// LÓGICA DA POUPANÇA
// ==========================================
async function loadPoupanca() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/poupanca`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('poupanca-saldo-atual').textContent = formatarMoeda(data.saldo);
            
            let textoMeta = 'Sem meta definida';
            let percentual = 0;
            if (data.meta > 0) {
                textoMeta = `Meta: ${formatarMoeda(data.meta)}`;
                percentual = (data.saldo / data.meta) * 100;
                if (percentual > 100) percentual = 100;
                document.getElementById('poupanca-meta-input').value = formatarValorInput(data.meta);
            }
            
            document.getElementById('poupanca-meta-texto').textContent = textoMeta;
            document.getElementById('poupanca-barra').style.width = `${percentual}%`;
        }
        loadHistoricoPoupanca();
    } catch (e) { console.error("Erro ao carregar poupança", e); }
}

function salvarMetaPoupanca(e) {
    e.preventDefault();
    const metaStr = document.getElementById('poupanca-meta-input').value;
    const meta = limparFormatacao(metaStr);
    
    doPost('/api/poupanca/meta', { meta: meta }, (data) => {
        showNotification(data.mensagem);
        loadPoupanca();
    });
}

function depositarPoupanca(e) {
    if (e) e.preventDefault();
    const valorStr = document.getElementById('poupanca-deposito-input').value;
    const valor = limparFormatacao(valorStr);
    
    if (valor <= 0) {
        showNotification("Digite um valor válido para depositar.", "error");
        return;
    }
    
    abrirConfirmacao(`Deseja retirar ${formatarMoeda(valor)} das receitas deste mês para guardar na Poupança?`, () => {
        doPost('/api/poupanca/depositar', { valor: valor }, (data) => {
            showNotification(data.mensagem);
            document.getElementById('poupanca-deposito-input').value = '';
            loadPoupanca();
        });
    });
}

function resgatarPoupanca() {
    const valorStr = document.getElementById('poupanca-deposito-input').value;
    const valor = limparFormatacao(valorStr);
    
    if (valor <= 0) {
        showNotification("Digite um valor válido para resgatar.", "error");
        return;
    }
    
    abrirConfirmacao(`Deseja resgatar ${formatarMoeda(valor)} da poupança para o saldo do mês atual?`, () => {
        doPost('/api/poupanca/resgatar', { valor: valor }, (data) => {
            showNotification(data.mensagem);
            document.getElementById('poupanca-deposito-input').value = '';
            loadPoupanca();
        });
    });
}

async function abrirModalSobras() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/poupanca/sobras`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('sobras-valor-disponivel').textContent = formatarMoeda(data.sobras_disponiveis);
            
            const inputValor = document.getElementById('sobras-valor-input');
            inputValor.value = '';
            
            const btn = document.getElementById('btn-puxar-sobras');
            if (data.sobras_disponiveis <= 0) {
                btn.disabled = true;
                btn.textContent = "Nenhuma sobra encontrada";
                btn.classList.replace('btn-primary', 'btn-secondary');
                inputValor.disabled = true;
            } else {
                btn.disabled = false;
                btn.textContent = "Transferir para Poupança";
                btn.classList.replace('btn-secondary', 'btn-primary');
                inputValor.disabled = false;
            }
            
            document.getElementById('modal-sobras').classList.remove('d-none');
        }
    } catch (e) {
        showNotification("Erro ao buscar as sobras", "error");
    }
}

function fecharModalSobras() {
    document.getElementById('modal-sobras').classList.add('d-none');
}

function executarPuxarSobras() {
    const valorStr = document.getElementById('sobras-valor-input').value;
    const valor = limparFormatacao(valorStr);
    
    if (valor <= 0) {
        showNotification("Digite um valor válido a ser resgatado.", "error");
        return;
    }
    
    const btn = document.getElementById('btn-puxar-sobras');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processando...`;

    doPost('/api/poupanca/puxar_sobras', { valor: valor }, (data) => {
        showNotification(data.mensagem, 'success');
        fecharModalSobras();
        loadPoupanca();
    });
}

async function loadHistoricoPoupanca() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/poupanca/historico`);
        if (res.ok) {
            historicoPoupancaAtual = await res.json(); 
            const tbody = document.getElementById('poupanca-historico-lista');
            tbody.innerHTML = '';
            
            if(historicoPoupancaAtual.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="py-5 text-muted"><i class="bx bx-info-circle fs-3 d-block mb-2"></i> Nenhuma movimentação registrada na poupança.</td></tr>';
                return;
            }

            historicoPoupancaAtual.forEach((h, index) => {
                const dataParts = h.data.split('-');
                const dataDisplay = `${dataParts[2]}/${dataParts[1]}/${dataParts[0]}`;
                
                let cor = h.tipo === 'entrada' ? 'text-success' : 'text-danger';
                let sinal = h.tipo === 'entrada' ? '+' : '-';
                let badge = h.tipo === 'entrada' 
                    ? '<span class="badge bg-success-subtle text-success border border-success">Entrada</span>' 
                    : '<span class="badge bg-danger-subtle text-danger border border-danger">Gasto / Saída</span>';

                tbody.innerHTML += `
                    <tr>
                        <td class="fw-medium text-muted">${dataDisplay}</td>
                        <td class="fw-bold text-dark">${h.descricao}</td>
                        <td><span class="badge bg-light text-dark border">${h.categoria}</span></td>
                        <td>${badge}</td>
                        <td class="fw-bold ${cor}">${sinal} ${formatarMoeda(h.valor)}</td>
                        <td>
                            <button class="btn btn-sm btn-light text-primary p-1" onclick="abrirModalEditarHistorico(${index})"><i class='bx bx-edit'></i></button>
                            <button class="btn btn-sm btn-light text-danger p-1" onclick="excluirHistoricoPoupanca(${h.id})"><i class='bx bx-trash'></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (e) { console.error("Erro ao carregar histórico da poupança", e); }
}

function excluirHistoricoPoupanca(id) {
    abrirConfirmacao("Tem certeza que deseja excluir esta movimentação? Seu saldo da poupança será recalculado automaticamente.", () => {
        fetch(`${API_BASE_URL}/api/poupanca/historico/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if(data.erro) showNotification(data.erro, 'error');
            else {
                showNotification(data.mensagem, 'success');
                loadPoupanca(); // Atualiza a tela
            }
        })
        .catch(() => showNotification('Erro ao excluir registro', 'error'));
    });
}

function abrirModalEditarHistorico(index) {
    const h = historicoPoupancaAtual[index];
    document.getElementById('edit-hist-id').value = h.id;
    document.getElementById('edit-hist-descricao').value = h.descricao;
    document.getElementById('edit-hist-valor').value = formatarValorInput(h.valor);
    document.getElementById('edit-hist-data').value = h.data;
    
    document.getElementById('modal-editar-historico-poupanca').classList.remove('d-none');
}

function fecharModalEditarHistorico() {
    document.getElementById('modal-editar-historico-poupanca').classList.add('d-none');
}

function salvarEdicaoHistorico(e) {
    e.preventDefault();
    const id = document.getElementById('edit-hist-id').value;
    
    const body = {
        descricao: document.getElementById('edit-hist-descricao').value,
        valor: limparFormatacao(document.getElementById('edit-hist-valor').value),
        data: document.getElementById('edit-hist-data').value
    };

    doPost(`/api/poupanca/historico/${id}`, body, (data) => {
        showNotification(data.mensagem, 'success');
        fecharModalEditarHistorico();
        loadPoupanca(); // Atualiza os saldos e a tabela
    });
}


function toggleTransacaoFixa() {
    const isFixa = document.getElementById('transacao-fixa').checked;
    const labelValor = document.getElementById('label-transacao-valor');
    const divParcelas = document.getElementById('div-transacao-parcelas');
    const inputParcelas = document.getElementById('transacao-parcelas');
    
    const divResumoValores = document.getElementById('resumo-valores-parcelas');

    if (isFixa) {
        labelValor.textContent = 'Valor da Mensalidade (R$)';
        divParcelas.classList.add('d-none');

        if (divResumoValores) divResumoValores.classList.add('d-none'); 
        
        inputParcelas.value = 12; 
    } else {
        labelValor.textContent = 'Valor Total (R$)';
        divParcelas.classList.remove('d-none');

        if (divResumoValores) divResumoValores.classList.remove('d-none');

        inputParcelas.value = 1;
    }
    
    gerarCamposData(); 
}

function cancelarRenovacaoFixa(id_transacao) {
    abrirConfirmacao("Deseja cancelar a renovação automática? Os pagamentos anteriores serão mantidos no histórico.", async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/cancelar_fixa/${id_transacao}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showNotification(data.mensagem, 'success');
                fecharModalExclusaoLote();
                loadParcelas();
                loadDashboard();
                carregarDadosExtrasDashboard();
            } else { 
                showNotification(data.erro, 'error'); 
            }
        } catch(e) { 
            showNotification('Erro ao cancelar renovação', 'error'); 
        }
    });
}