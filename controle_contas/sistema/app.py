from flask import Flask, jsonify, request, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from datetime import datetime
from dateutil.relativedelta import relativedelta
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func

# --- CONFIGURAÇÃO ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'segredo_super_secreto_financeiro'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///financeiro.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- MODELS ---

class Usuario(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)
    password = db.Column(db.String(200), nullable=False)

class CartaoCredito(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    nome = db.Column(db.String(50), nullable=False)

class Tipo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    nome = db.Column(db.String(50), nullable=False)
    categoria = db.Column(db.String(20)) # 'receita' ou 'despesa'

class Transacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'))
    id_tipo = db.Column(db.Integer, db.ForeignKey('tipo.id'))
    descricao = db.Column(db.String(200))
    valor_total = db.Column(db.Float)
    qtd_parcelas = db.Column(db.Integer)
    data_criacao = db.Column(db.DateTime, default=datetime.utcnow)
    tipo_transacao = db.Column(db.String(20))
    forma_pagamento = db.Column(db.String(50))
    id_cartao = db.Column(db.Integer, db.ForeignKey('cartao_credito.id'), nullable=True)

    parcelas = db.relationship('Parcela', backref='transacao', lazy=True, cascade="all, delete-orphan")
    tipo = db.relationship('Tipo', backref='transacoes')
    cartao = db.relationship('CartaoCredito', backref='transacoes')

class Parcela(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_transacao = db.Column(db.Integer, db.ForeignKey('transacao.id'))
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'))
    numero_parcela = db.Column(db.Integer)
    valor = db.Column(db.Float)
    vencimento = db.Column(db.Date)
    status = db.Column(db.String(20), default='a_pagar')
    data_pagamento = db.Column(db.Date, nullable=True)

class Poupanca(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), unique=True, nullable=False)
    saldo = db.Column(db.Float, default=0.0)
    meta = db.Column(db.Float, nullable=True, default=0.0)

class HistoricoPoupanca(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'))
    descricao = db.Column(db.String(200))
    categoria = db.Column(db.String(50))
    valor = db.Column(db.Float)
    tipo = db.Column(db.String(20)) 
    data_registro = db.Column(db.Date, default=lambda: datetime.now().date())


@login_manager.user_loader
def load_user(user_id):
    return Usuario.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized_callback():
    return jsonify({"erro": "Sessão expirada. Faça login novamente."}), 401


# --- LÓGICA AUXILIAR ---
def gerar_parcelas_customizadas(transacao_obj, lista_datas, lista_valores=None):
    hoje = datetime.now().date()
    
    for i, data_str in enumerate(lista_datas):
        data_venc = datetime.strptime(data_str, '%Y-%m-%d').date()

        if transacao_obj.tipo_transacao == 'receita':
            status_inicial = 'recebido' if data_venc <= hoje else 'a_receber'
            data_pag = data_venc if status_inicial == 'recebido' else None
        else:
            status_inicial = 'a_pagar'
            data_pag = None

        if lista_valores and len(lista_valores) > i:
            valor_parc = float(lista_valores[i])
        else:
            valor_parc = transacao_obj.valor_total / transacao_obj.qtd_parcelas

        nova_parcela = Parcela(
            id_transacao=transacao_obj.id,
            id_usuario=transacao_obj.id_usuario,
            numero_parcela=i + 1,
            valor=valor_parc,
            vencimento=data_venc,
            status=status_inicial,
            data_pagamento=data_pag
        )
        db.session.add(nova_parcela)
    db.session.commit()

def atualizar_status_automaticos(user_id):
    hoje = datetime.now().date()
    
    # Atualiza Despesas Atrasadas
    Parcela.query.filter(
        Parcela.id_usuario == user_id,
        Parcela.status == 'a_pagar',
        Parcela.vencimento < hoje
    ).update({Parcela.status: 'atrasado'}, synchronize_session=False)
    
    # Atualiza Receitas que chegaram na data
    Parcela.query.filter(
        Parcela.id_usuario == user_id,
        Parcela.status == 'a_receber',
        Parcela.vencimento <= hoje
    ).update({Parcela.status: 'recebido', Parcela.data_pagamento: hoje}, synchronize_session=False)

    db.session.commit()

# --- ROTAS ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    dados = request.json
    if Usuario.query.filter_by(email=dados['email']).first():
        return jsonify({"erro": "E-mail já cadastrado"}), 400

    novo_user = Usuario(
        username=dados['username'],
        email=dados['email'],
        password=dados['password']
    )
    db.session.add(novo_user)
    db.session.commit()

    # Cria a carteira de poupança vazia para o novo usuário
    nova_poupanca = Poupanca(id_usuario=novo_user.id, saldo=0.0, meta=0.0)
    db.session.add(nova_poupanca)
    db.session.commit()

    padroes = [
        ('Salário', 'receita'), ('Alimentação', 'despesa'),
        ('Transporte', 'despesa'), ('Moradia', 'despesa'), ('Lazer', 'despesa')
    ]

    for nome, cat in padroes:
        novo_tipo = Tipo(nome=nome, categoria=cat, id_usuario=novo_user.id)
        db.session.add(novo_tipo)

    db.session.commit()

    return jsonify({"mensagem": "Usuário criado com sucesso!"})

@app.route('/login', methods=['POST'])
def login():
    dados = request.json
    user = Usuario.query.filter_by(email=dados['email']).first()

    if user and user.password == dados['password']:
        login_user(user)
        return jsonify({"mensagem": f"Bem-vindo, {user.username}!", "username": user.username})

    return jsonify({"erro": "E-mail ou senha inválidos"}), 401

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({"mensagem": "Deslogado com sucesso"})

# --- ROTAS DE CATEGORIAS ---

@app.route('/api/tipos', methods=['GET'])
@login_required
def listar_tipos():
    tipos = Tipo.query.filter_by(id_usuario=current_user.id).all()
    lista = [{"id": t.id, "nome": t.nome, "categoria": t.categoria} for t in tipos]
    return jsonify(lista)

@app.route('/api/tipos', methods=['POST'])
@login_required
def criar_tipo():
    dados = request.json
    nome = dados.get('nome')
    categoria = dados.get('categoria')

    if not nome or not categoria:
        return jsonify({"erro": "Nome e Categoria são obrigatórios"}), 400

    tipo_existente = Tipo.query.filter_by(
        nome=nome,
        categoria=categoria,
        id_usuario=current_user.id
    ).first()

    if tipo_existente:
        return jsonify({"erro": f"A categoria '{nome}' já existe em {categoria}."}), 400

    novo_tipo = Tipo(nome=nome, categoria=categoria, id_usuario=current_user.id)
    db.session.add(novo_tipo)
    db.session.commit()
    return jsonify({"mensagem": "Categoria criada com sucesso!", "id": novo_tipo.id})

@app.route('/api/tipos/<int:id_tipo>', methods=['DELETE'])
@login_required
def excluir_tipo(id_tipo):
    tipo = Tipo.query.filter_by(id=id_tipo, id_usuario=current_user.id).first()

    if not tipo:
        return jsonify({"erro": "Categoria não encontrada ou acesso negado"}), 404

    # Trava de segurança com os novos nomes
    if tipo.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA']:
        return jsonify({"erro": "Esta é uma categoria vinculada ao sistema e não pode ser excluída."}), 400

    uso = Transacao.query.filter_by(id_tipo=id_tipo).first()
    if uso:
        return jsonify({"erro": "Não é possível excluir: Categoria em uso por transações."}), 400

    db.session.delete(tipo)
    db.session.commit()
    return jsonify({"mensagem": "Categoria excluída."})
# --- ROTAS DE CARTÕES ---

@app.route('/api/cartoes', methods=['GET'])
@login_required
def listar_cartoes():
    cartoes = CartaoCredito.query.filter_by(id_usuario=current_user.id).all()
    lista = [{"id": c.id, "nome": c.nome} for c in cartoes]
    return jsonify(lista)

@app.route('/api/cartoes', methods=['POST'])
@login_required
def criar_cartao():
    dados = request.json
    nome = dados.get('nome')
    if not nome:
        return jsonify({"erro": "Nome do cartão é obrigatório"}), 400

    novo = CartaoCredito(nome=nome, id_usuario=current_user.id)
    db.session.add(novo)
    db.session.commit()
    return jsonify({"mensagem": "Cartão cadastrado com sucesso!"})

@app.route('/api/cartoes/<int:id_cartao>', methods=['DELETE'])
@login_required
def excluir_cartao(id_cartao):
    cartao = CartaoCredito.query.filter_by(id=id_cartao, id_usuario=current_user.id).first()
    if not cartao:
        return jsonify({"erro": "Cartão não encontrado"}), 404

    uso = Transacao.query.filter_by(id_cartao=id_cartao).first()
    if uso:
        return jsonify({"erro": "Não é possível excluir: Cartão vinculado a transações."}), 400

    db.session.delete(cartao)
    db.session.commit()
    return jsonify({"mensagem": "Cartão excluído."})


# --- ROTAS DE TRANSAÇÃO E DASHBOARD  ---

@app.route('/nova_transacao', methods=['POST'])
@login_required
def nova_transacao():
    dados = request.json

    tipo_check = Tipo.query.filter_by(id=dados.get('id_tipo_categoria'), id_usuario=current_user.id).first()
    if not tipo_check:
         return jsonify({"erro": "Categoria inválida"}), 400

    id_cartao = None
    if dados.get('forma_pagamento') == 'Cartão Crédito':
        id_cartao = dados.get('id_cartao')

    usar_poupanca = dados.get('usar_poupanca', False)
    valor_transacao = float(dados['valor'])
    valores_parcelas = dados.get('valores_parcelas', [])

    if tipo_check.nome == 'ENVIAR POUPANÇA':
        poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
        poupanca.saldo += valor_transacao
        data_gasto = datetime.strptime(dados['datas_parcelas'][0], '%Y-%m-%d').date() if dados.get('datas_parcelas') else datetime.now().date()
        hist = HistoricoPoupanca(id_usuario=current_user.id, descricao=dados['descricao'], categoria='Transferência', valor=valor_transacao, tipo='entrada', data_registro=data_gasto)
        db.session.add(hist)
        usar_poupanca = False 

    elif tipo_check.nome == 'RESGATAR POUPANÇA':
        poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
        if not poupanca or poupanca.saldo < valor_transacao:
            return jsonify({"erro": "Saldo insuficiente na poupança para realizar este resgate!"}), 400
        poupanca.saldo -= valor_transacao
        data_gasto = datetime.strptime(dados['datas_parcelas'][0], '%Y-%m-%d').date() if dados.get('datas_parcelas') else datetime.now().date()
        hist = HistoricoPoupanca(id_usuario=current_user.id, descricao=dados['descricao'], categoria='Transferência', valor=valor_transacao, tipo='saida', data_registro=data_gasto)
        db.session.add(hist)

    elif usar_poupanca and dados['tipo'] == 'despesa':
        poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
        
        if poupanca and poupanca.saldo > 0:
            desconto = min(poupanca.saldo, valor_transacao)
            
            poupanca.saldo -= desconto
            valor_transacao -= desconto

            data_gasto = datetime.strptime(dados['datas_parcelas'][0], '%Y-%m-%d').date() if dados.get('datas_parcelas') else datetime.now().date()
            historico = HistoricoPoupanca(
                id_usuario=current_user.id,
                descricao=dados['descricao'],
                categoria=tipo_check.nome,
                valor=desconto,
                tipo='saida',
                data_registro=data_gasto
            )
            db.session.add(historico)
            
            if valor_transacao <= 0:
                db.session.commit()
                return jsonify({"mensagem": f"Despesa de R$ {desconto:.2f} coberta 100% pela Poupança!"})
            
            qtd = len(valores_parcelas)
            if qtd > 0:
                novo_valor_base = round(valor_transacao / qtd, 2)
                for i in range(qtd):
                    if i == qtd - 1:
                        valores_parcelas[i] = round(valor_transacao - (novo_valor_base * (qtd - 1)), 2)
                    else:
                        valores_parcelas[i] = novo_valor_base
            
            dados['valor'] = valor_transacao
            dados['valores_parcelas'] = valores_parcelas

    nova = Transacao(
        id_usuario=current_user.id,
        id_tipo=dados.get('id_tipo_categoria'),
        descricao=dados['descricao'],
        valor_total=dados['valor'],
        qtd_parcelas=dados['parcelas'],
        tipo_transacao=dados['tipo'],
        forma_pagamento=dados.get('forma_pagamento'),
        id_cartao=id_cartao
    )
    db.session.add(nova)
    db.session.commit()

    gerar_parcelas_customizadas(nova, dados['datas_parcelas'], dados.get('valores_parcelas'))
    return jsonify({"mensagem": "Transação criada com sucesso!"})

@app.route('/dashboard', methods=['GET'])
@login_required
def dashboard():
    inicio_str = request.args.get('inicio')
    fim_str = request.args.get('fim')

    if inicio_str and fim_str:
        try:
            inicio = datetime.strptime(inicio_str, '%Y-%m-%d').date()
            fim = datetime.strptime(fim_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"erro": "Datas inválidas. Use formato YYYY-MM-DD"}), 400
    else:
        hoje = datetime.now().date()
        inicio = hoje.replace(day=1)
        fim = (inicio + relativedelta(months=1)) - relativedelta(days=1)

    total_receitas = db.session.query(db.func.sum(Parcela.valor))\
        .join(Transacao)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.tipo_transacao == 'receita')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim).scalar() or 0.0

    total_despesas = db.session.query(db.func.sum(Parcela.valor))\
        .join(Transacao)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.tipo_transacao == 'despesa')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim).scalar() or 0.0

    despesas_por_cat = db.session.query(Tipo.nome, db.func.sum(Parcela.valor))\
        .join(Transacao, Transacao.id_tipo == Tipo.id)\
        .join(Parcela, Parcela.id_transacao == Transacao.id)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.tipo_transacao == 'despesa')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim)\
        .group_by(Tipo.nome).all()

    receitas_por_cat = db.session.query(Tipo.nome, db.func.sum(Parcela.valor))\
        .join(Transacao, Transacao.id_tipo == Tipo.id)\
        .join(Parcela, Parcela.id_transacao == Transacao.id)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.tipo_transacao == 'receita')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim)\
        .group_by(Tipo.nome).all()

    grafico_despesas = [{"categoria": nome, "total": valor} for nome, valor in despesas_por_cat]
    grafico_receitas = [{"categoria": nome, "total": valor} for nome, valor in receitas_por_cat]

    return jsonify({
        "usuario": current_user.username,
        "periodo": f"{inicio.strftime('%d/%m/%Y')} a {fim.strftime('%d/%m/%Y')}",
        "total_receitas": total_receitas,
        "total_despesas": total_despesas,
        "grafico_despesas": grafico_despesas,
        "grafico_receitas": grafico_receitas
    })

@app.route('/parcelas', methods=['GET'])
@login_required
def listar_parcelas():
    atualizar_status_automaticos(current_user.id)
    mes_filtro = request.args.get('mes')
    query = Parcela.query.filter_by(id_usuario=current_user.id)

    if mes_filtro:
        inicio = datetime.strptime(mes_filtro, '%Y-%m').date()
        fim = inicio + relativedelta(months=+1)
        query = query.filter(Parcela.vencimento >= inicio, Parcela.vencimento < fim)

    parcelas = query.order_by(Parcela.vencimento).all()

    lista = []
    for p in parcelas:
        lista.append({
            "id": p.id,
            "descricao": p.transacao.descricao,
            "numero": f"{p.numero_parcela}/{p.transacao.qtd_parcelas}",
            "valor": p.valor,
            "vencimento": str(p.vencimento),
            "status": p.status,
            "tipo": p.transacao.tipo_transacao,
            "categoria": p.transacao.tipo.nome if p.transacao.tipo else 'Geral',
            "id_categoria": p.transacao.id_tipo,
            "id_transacao": p.transacao.id,
            "forma_pagamento": p.transacao.forma_pagamento,
            "nome_cartao": p.transacao.cartao.nome if p.transacao.cartao else None
        })
    return jsonify(lista)

@app.route('/baixar_lote', methods=['POST'])
@login_required
def baixar_lote():
    dados = request.json
    ids = dados.get('ids', [])
    if not ids:
        return jsonify({"erro": "Nenhum item selecionado"}), 400

    hoje = datetime.now().date()
    parcelas = Parcela.query.filter(Parcela.id.in_(ids), Parcela.id_usuario == current_user.id).all()
    
    for p in parcelas:
        p.status = 'recebido' if p.transacao.tipo_transacao == 'receita' else 'pago'
        p.data_pagamento = hoje

    db.session.commit()
    return jsonify({"mensagem": f"{len(ids)} parcelas baixadas com sucesso!"})

@app.route('/editar_parcela/<int:id_parcela>', methods=['POST'])
@login_required
def editar_parcela(id_parcela):
    dados = request.json
    parcela = Parcela.query.get(id_parcela)
    if not parcela or parcela.id_usuario != current_user.id:
        return jsonify({"erro": "Parcela não encontrada"}), 404

    novo_valor = float(dados['valor'])
    diferenca = novo_valor - parcela.valor

    if 'id_categoria' in dados and dados['id_categoria']:
        novo_id_tipo = int(dados['id_categoria'])
        tipo_atual = parcela.transacao.tipo
        novo_tipo_obj = Tipo.query.get(novo_id_tipo)
        
        if tipo_atual.id != novo_id_tipo:
            if tipo_atual.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA'] or novo_tipo_obj.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA']:
                return jsonify({"erro": "Não é permitido alterar para ou de categorias da Poupança na edição. Exclua a conta e crie novamente."}), 400
        parcela.transacao.id_tipo = novo_id_tipo

    if parcela.transacao.tipo and parcela.transacao.tipo.nome == 'ENVIAR POUPANÇA':
        poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
        if poupanca: 
            poupanca.saldo += diferenca
    elif parcela.transacao.tipo and parcela.transacao.tipo.nome == 'RESGATAR POUPANÇA':
        poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
        if poupanca:
            if diferenca > poupanca.saldo:
                return jsonify({"erro": "Saldo da poupança insuficiente para aumentar este resgate"}), 400
            poupanca.saldo -= diferenca

    if parcela.transacao.tipo and parcela.transacao.tipo.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA']:
        hist = HistoricoPoupanca.query.filter(
            HistoricoPoupanca.id_usuario == current_user.id,
            HistoricoPoupanca.descricao == parcela.transacao.descricao
        ).filter(func.abs(HistoricoPoupanca.valor - parcela.valor) < 0.01).first()
        
        if hist:
            hist.valor = novo_valor
            hist.descricao = dados['descricao']
            
        parcela.transacao.valor_total = novo_valor

    parcela.valor = novo_valor
    parcela.vencimento = datetime.strptime(dados['vencimento'], '%Y-%m-%d').date()
    parcela.status = dados['status']
    parcela.transacao.descricao = dados['descricao']

    if 'forma_pagamento' in dados:
        parcela.transacao.forma_pagamento = dados['forma_pagamento']
        if dados['forma_pagamento'] == 'Cartão Crédito' and dados.get('id_cartao'):
            parcela.transacao.id_cartao = int(dados['id_cartao'])
        else:
            parcela.transacao.id_cartao = None

    if parcela.status in ['pago', 'recebido'] and not parcela.data_pagamento:
        parcela.data_pagamento = datetime.now().date()
    elif parcela.status not in ['pago', 'recebido']:
        parcela.data_pagamento = None

    db.session.commit()
    return jsonify({"mensagem": "Parcela atualizada com sucesso!"})

@app.route('/excluir_parcela/<int:id_parcela>', methods=['DELETE'])
@login_required
def excluir_parcela(id_parcela):
    parcela = Parcela.query.get(id_parcela)
    if not parcela or parcela.id_usuario != current_user.id:
        return jsonify({"erro": "Parcela não encontrada"}), 404

    transacao = parcela.transacao
    is_poupanca = False

    if transacao.tipo:
        if transacao.tipo.nome == 'ENVIAR POUPANÇA':
            poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
            if poupanca: 
                poupanca.saldo = max(0, poupanca.saldo - parcela.valor)
            is_poupanca = True

        if transacao.tipo.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA']:
            is_poupanca = True
           
            hist = HistoricoPoupanca.query.filter(
                HistoricoPoupanca.id_usuario == current_user.id,
                HistoricoPoupanca.descricao == transacao.descricao
            ).filter(func.abs(HistoricoPoupanca.valor - parcela.valor) < 0.01).first()
            if hist:
                db.session.delete(hist)

    db.session.delete(parcela)

    if is_poupanca:
        db.session.delete(transacao)

    db.session.commit()
    return jsonify({"mensagem": "Parcela excluída com sucesso!"})

@app.route('/api/dashboard/cartao_stats', methods=['GET'])
@login_required
def dashboard_cartao():
    id_cartao = request.args.get('id_cartao')
    inicio_str = request.args.get('inicio')
    fim_str = request.args.get('fim')

    if not id_cartao or not inicio_str or not fim_str:
        return jsonify({"erro": "Parâmetros incompletos"}), 400

    try:
        inicio = datetime.strptime(inicio_str, '%Y-%m-%d').date()
        fim = datetime.strptime(fim_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"erro": "Datas inválidas"}), 400

    resultados = db.session.query(Tipo.nome, db.func.sum(Parcela.valor))\
        .join(Transacao, Transacao.id_tipo == Tipo.id)\
        .join(Parcela, Parcela.id_transacao == Transacao.id)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.id_cartao == id_cartao)\
        .filter(Transacao.tipo_transacao == 'despesa')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim)\
        .group_by(Tipo.nome).all()

    dados_grafico = [{"categoria": nome, "total": valor} for nome, valor in resultados]

    return jsonify(dados_grafico)

@app.route('/verificar_usuario', methods=['POST'])
def verificar_usuario():
    dados = request.json
    email = dados.get('email')
    user = Usuario.query.filter_by(email=email).first()
    
    if user:
        return jsonify({"existe": True, "username": user.username, "email": user.email})
    
    return jsonify({"erro": "E-mail não encontrado no sistema"}), 404

@app.route('/atualizar_senha_direto', methods=['POST'])
def atualizar_senha_direto():
    dados = request.json
    email = dados.get('email')
    nova_senha = dados.get('password')
    
    user = Usuario.query.filter_by(email=email).first()
    if user:
        user.password = nova_senha 
        db.session.commit()
        return jsonify({"mensagem": "Senha atualizada com sucesso!"})
        
    return jsonify({"erro": "Erro ao atualizar senha"}), 400

@app.route('/api/dashboard/extras', methods=['GET'])
@login_required
def dashboard_extras():
    atualizar_status_automaticos(current_user.id) 
    
    hoje = datetime.now().date()
    mes_atual_str = hoje.strftime('%Y-%m')
    limite_futuro = hoje + relativedelta(months=12)
    limite_futuro_str = limite_futuro.strftime('%Y-%m')

    parcelas_query = db.session.query(Parcela, Transacao).join(Transacao).filter(Parcela.id_usuario == current_user.id).all()

    saldo_acumulado = 0.0
    meses_fechados = {}
    meses_futuros = {}
    pendentes = []

    for p, t in parcelas_query:
        valor = p.valor
        mes_p = p.vencimento.strftime('%Y-%m')
        
        if p.vencimento <= hoje:
            if t.tipo_transacao == 'receita':
                saldo_acumulado += valor
            else:
                saldo_acumulado -= valor
                
        if mes_p < mes_atual_str:
            if mes_p not in meses_fechados:
                meses_fechados[mes_p] = {"receitas": 0.0, "despesas": 0.0}
            if t.tipo_transacao == 'receita':
                meses_fechados[mes_p]["receitas"] += valor
            else:
                meses_fechados[mes_p]["despesas"] += valor
                
        if mes_atual_str <= mes_p < limite_futuro_str:
            if mes_p not in meses_futuros:
                meses_futuros[mes_p] = {"receitas": 0.0, "despesas": 0.0}
            if t.tipo_transacao == 'receita':
                meses_futuros[mes_p]["receitas"] += valor
            else:
                meses_futuros[mes_p]["despesas"] += valor
                
        if p.status in ['a_pagar', 'atrasado', 'a_receber']:
            pendentes.append({
                "id": p.id,
                "descricao": t.descricao,
                "numero": f"{p.numero_parcela}/{t.qtd_parcelas}",
                "valor": p.valor,
                "vencimento": str(p.vencimento),
                "status": p.status,
                "categoria": t.tipo.nome if t.tipo else 'Geral',
                "tipo": t.tipo_transacao
            })

    return jsonify({
        "saldo_acumulado": saldo_acumulado,
        "meses_fechados": meses_fechados,
        "meses_futuros": meses_futuros,
        "pendentes": pendentes
    })

@app.route('/api/transacao/<int:id_transacao>/parcelas', methods=['GET'])
@login_required
def listar_parcelas_transacao(id_transacao):
    transacao = Transacao.query.filter_by(id=id_transacao, id_usuario=current_user.id).first()
    if not transacao:
        return jsonify({"erro": "Transação não encontrada"}), 404
    
    parcelas = Parcela.query.filter_by(id_transacao=id_transacao).order_by(Parcela.numero_parcela).all()
    lista = []
    for p in parcelas:
        lista.append({
            "id": p.id,
            "numero_parcela": p.numero_parcela,
            "qtd_parcelas": transacao.qtd_parcelas,
            "valor": p.valor,
            "vencimento": str(p.vencimento),
            "status": p.status
        })
    return jsonify(lista)

@app.route('/excluir_transacao/<int:id_transacao>', methods=['DELETE'])
@login_required
def excluir_transacao(id_transacao):
    transacao = Transacao.query.filter_by(id=id_transacao, id_usuario=current_user.id).first()
    if not transacao:
        return jsonify({"erro": "Transação não encontrada"}), 404
    
    if transacao.tipo:
        if transacao.tipo.nome == 'ENVIAR POUPANÇA':
            poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
            if poupanca: 
                poupanca.saldo = max(0, poupanca.saldo - transacao.valor_total)
                
        if transacao.tipo.nome in ['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA']:
            hist = HistoricoPoupanca.query.filter(
                HistoricoPoupanca.id_usuario == current_user.id,
                HistoricoPoupanca.descricao == transacao.descricao
            ).filter(func.abs(HistoricoPoupanca.valor - transacao.valor_total) < 0.01).first()
            if hist:
                db.session.delete(hist)

    db.session.delete(transacao)
    db.session.commit()
    return jsonify({"mensagem": "Fluxo cancelado e parcelas excluídas com sucesso!"})

@app.route('/reparcelar/<int:id_transacao>', methods=['POST'])
@login_required
def reparcelar_transacao(id_transacao):
    transacao = Transacao.query.filter_by(id=id_transacao, id_usuario=current_user.id).first()
    if not transacao:
        return jsonify({"erro": "Transação não encontrada"}), 404
    
    dados = request.json
    novas_datas = dados.get('datas_parcelas', [])
    novos_valores = dados.get('valores_parcelas', [])
    
    if len(novas_datas) != len(novos_valores) or len(novas_datas) == 0:
        return jsonify({"erro": "Dados inválidos para reparcelamento."}), 400
        
    soma_total = sum([float(v) for v in novos_valores])
    
    transacao.valor_total = soma_total
    transacao.qtd_parcelas = len(novos_valores)
    
    Parcela.query.filter_by(id_transacao=id_transacao).delete()
    gerar_parcelas_customizadas(transacao, novas_datas, novos_valores)
    
    return jsonify({"mensagem": "Reparcelamento concluído com sucesso!"})

# --- ROTAS DA POUPANÇA ---

@app.route('/api/poupanca', methods=['GET'])
@login_required
def get_poupanca():
    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    if not poupanca:
        poupanca = Poupanca(id_usuario=current_user.id, saldo=0.0, meta=0.0)
        db.session.add(poupanca)
        db.session.commit()
    return jsonify({"saldo": poupanca.saldo, "meta": poupanca.meta})

@app.route('/api/poupanca/meta', methods=['POST'])
@login_required
def definir_meta_poupanca():
    meta = float(request.json.get('meta', 0))
    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    poupanca.meta = meta
    db.session.commit()
    return jsonify({"mensagem": "Meta atualizada com sucesso!"})

@app.route('/api/poupanca/depositar', methods=['POST'])
@login_required
def depositar_poupanca():
    valor = float(request.json.get('valor', 0))
    if valor <= 0:
        return jsonify({"erro": "Valor inválido"}), 400
        
    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    poupanca.saldo += valor
    
    tipo_cat = Tipo.query.filter_by(id_usuario=current_user.id, categoria='despesa', nome='ENVIAR POUPANÇA').first()
    if not tipo_cat:
        tipo_cat = Tipo(nome='ENVIAR POUPANÇA', categoria='despesa', id_usuario=current_user.id)
        db.session.add(tipo_cat)
        db.session.commit()
        
    nova_transacao = Transacao(
        id_usuario=current_user.id, id_tipo=tipo_cat.id,
        descricao='Depósito na Poupança', valor_total=valor, qtd_parcelas=1,
        tipo_transacao='despesa', forma_pagamento='Transferência Bancária'
    )
    db.session.add(nova_transacao)
    db.session.commit()
    
    hoje = datetime.now().date()
    nova_parcela = Parcela(
        id_transacao=nova_transacao.id, id_usuario=current_user.id,
        numero_parcela=1, valor=valor, vencimento=hoje,
        status='pago', data_pagamento=hoje
    )
    db.session.add(nova_parcela)

    hist = HistoricoPoupanca(id_usuario=current_user.id, descricao='Depósito na Poupança', categoria='Poupança', valor=valor, tipo='entrada')
    db.session.add(hist)

    db.session.commit()
    return jsonify({"mensagem": "Valor guardado na poupança!"})

@app.route('/api/poupanca/resgatar', methods=['POST'])
@login_required
def resgatar_poupanca():
    valor = float(request.json.get('valor', 0))
    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    
    if valor <= 0 or not poupanca or valor > poupanca.saldo:
        return jsonify({"erro": "Valor inválido ou saldo da poupança insuficiente"}), 400
        
    poupanca.saldo -= valor
    
    tipo_cat = Tipo.query.filter_by(id_usuario=current_user.id, categoria='receita', nome='RESGATAR POUPANÇA').first()
    if not tipo_cat:
        tipo_cat = Tipo(nome='RESGATAR POUPANÇA', categoria='receita', id_usuario=current_user.id)
        db.session.add(tipo_cat)
        db.session.commit()
        
    nova_transacao = Transacao(
        id_usuario=current_user.id, id_tipo=tipo_cat.id,
        descricao='Resgate da Poupança', valor_total=valor, qtd_parcelas=1,
        tipo_transacao='receita', forma_pagamento='Transferência Bancária'
    )
    db.session.add(nova_transacao)
    db.session.commit()
    
    hoje = datetime.now().date()
    nova_parcela = Parcela(
        id_transacao=nova_transacao.id, id_usuario=current_user.id,
        numero_parcela=1, valor=valor, vencimento=hoje,
        status='recebido', data_pagamento=hoje
    )
    db.session.add(nova_parcela)

    hist = HistoricoPoupanca(id_usuario=current_user.id, descricao='Resgate da Poupança', categoria='Poupança', valor=valor, tipo='saida')
    db.session.add(hist)

    db.session.commit()
    return jsonify({"mensagem": f"Resgate de R$ {valor:.2f} realizado com sucesso!"})

@app.route('/api/poupanca/sobras', methods=['GET'])
@login_required
def verificar_sobras():
    hoje = datetime.now().date()
    inicio_proximo_mes = hoje.replace(day=1) + relativedelta(months=1)

    parcelas = Parcela.query.join(Transacao).filter(
        Parcela.id_usuario == current_user.id,
        Parcela.vencimento < inicio_proximo_mes
    ).all()
    
    meses = {}
    for p in parcelas:
        mes = p.vencimento.strftime('%Y-%m')
        if mes not in meses:
            meses[mes] = 0.0
        if p.transacao.tipo_transacao == 'receita':
            meses[mes] += p.valor
        else:
            meses[mes] -= p.valor
            
    sobras_disponiveis = sum(dados for dados in meses.values() if dados > 0.01)
    return jsonify({"sobras_disponiveis": sobras_disponiveis})

@app.route('/api/poupanca/puxar_sobras', methods=['POST'])
@login_required
def puxar_sobras():
    valor_desejado = float(request.json.get('valor', 0))
    if valor_desejado <= 0:
        return jsonify({"erro": "Valor inválido"}), 400

    hoje = datetime.now().date()
    inicio_proximo_mes = hoje.replace(day=1) + relativedelta(months=1)

    parcelas = Parcela.query.join(Transacao).filter(
        Parcela.id_usuario == current_user.id,
        Parcela.vencimento < inicio_proximo_mes
    ).all()
    
    meses = {}
    for p in parcelas:
        mes = p.vencimento.strftime('%Y-%m')
        if mes not in meses:
            meses[mes] = {"saldo": 0.0, "data_ref": p.vencimento}
        if p.transacao.tipo_transacao == 'receita':
            meses[mes]["saldo"] += p.valor
        else:
            meses[mes]["saldo"] -= p.valor
            
    sobras_disponiveis = sum(dados["saldo"] for dados in meses.values() if dados["saldo"] > 0.01)
    if valor_desejado > sobras_disponiveis:
        return jsonify({"erro": "O valor solicitado é maior que as sobras reais disponíveis."}), 400
            
    tipo_cat = Tipo.query.filter_by(id_usuario=current_user.id, categoria='despesa', nome='ENVIAR POUPANÇA').first()
    if not tipo_cat:
        tipo_cat = Tipo(nome='ENVIAR POUPANÇA', categoria='despesa', id_usuario=current_user.id)
        db.session.add(tipo_cat)
        db.session.commit()

    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    valor_restante = valor_desejado
    
    for mes, dados in meses.items():
        if valor_restante <= 0:
            break
            
        saldo_mes = dados["saldo"]
        if saldo_mes > 0.01: 
            valor_a_transferir = min(saldo_mes, valor_restante)
            descricao_str = f'Transferência de Sobra - {mes}'
            
            nova_transacao = Transacao(
                id_usuario=current_user.id, id_tipo=tipo_cat.id,
                descricao=descricao_str, valor_total=valor_a_transferir, qtd_parcelas=1,
                tipo_transacao='despesa', forma_pagamento='Transferência Bancária'
            )
            db.session.add(nova_transacao)
            db.session.commit()
            
            nova_parcela = Parcela(
                id_transacao=nova_transacao.id, id_usuario=current_user.id,
                numero_parcela=1, valor=valor_a_transferir, vencimento=dados["data_ref"],
                status='pago', data_pagamento=dados["data_ref"]
            )
            db.session.add(nova_parcela)
            
            poupanca.saldo += valor_a_transferir
            valor_restante -= valor_a_transferir
            
            hist = HistoricoPoupanca(id_usuario=current_user.id, descricao=descricao_str, categoria='Poupança', valor=valor_a_transferir, tipo='entrada')
            db.session.add(hist)

    db.session.commit()
    return jsonify({"mensagem": f"R$ {valor_desejado:.2f} resgatados das sobras reais com sucesso!"})


@app.route('/api/poupanca/historico', methods=['GET'])
@login_required
def historico_poupanca():
    historico = HistoricoPoupanca.query.filter_by(id_usuario=current_user.id).order_by(HistoricoPoupanca.data_registro.desc(), HistoricoPoupanca.id.desc()).all()
    lista = []
    for h in historico:
        lista.append({
            "id": h.id,
            "descricao": h.descricao,
            "categoria": h.categoria,
            "valor": h.valor,
            "tipo": h.tipo,
            "data": str(h.data_registro)
        })
    return jsonify(lista)

@app.route('/api/poupanca/historico/<int:id_historico>', methods=['DELETE'])
@login_required
def excluir_historico_poupanca(id_historico):
    hist = HistoricoPoupanca.query.filter_by(id=id_historico, id_usuario=current_user.id).first()
    if not hist:
        return jsonify({"erro": "Registro não encontrado"}), 404
        
    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    if poupanca:
        if hist.tipo == 'entrada':
            poupanca.saldo = max(0, poupanca.saldo - hist.valor)
        else: 
            poupanca.saldo += hist.valor
            
    transacao_vinculada = Transacao.query.join(Tipo).filter(
        Transacao.id_usuario == current_user.id,
        Transacao.descricao == hist.descricao,
        Tipo.nome.in_(['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA'])
    ).first()
    
    if not transacao_vinculada:
        transacao_vinculada = Transacao.query.filter(
            Transacao.id_usuario == current_user.id,
            Transacao.descricao == hist.descricao
        ).filter(func.abs(Transacao.valor_total - hist.valor) < 0.01).first()

    if transacao_vinculada:
        db.session.delete(transacao_vinculada) 
            
    db.session.delete(hist)
    db.session.commit()
    return jsonify({"mensagem": "Registro excluído e saldo restaurado!"})

@app.route('/api/poupanca/historico/<int:id_historico>', methods=['POST'])
@login_required
def editar_historico_poupanca(id_historico):
    hist = HistoricoPoupanca.query.filter_by(id=id_historico, id_usuario=current_user.id).first()
    if not hist:
        return jsonify({"erro": "Registro não encontrado"}), 404
        
    dados = request.json
    novo_valor = float(dados.get('valor', hist.valor))
    nova_descricao = dados.get('descricao', hist.descricao)
    
    transacao_vinculada = Transacao.query.join(Tipo).filter(
        Transacao.id_usuario == current_user.id,
        Transacao.descricao == hist.descricao,
        Tipo.nome.in_(['ENVIAR POUPANÇA', 'RESGATAR POUPANÇA'])
    ).first()
    
    if not transacao_vinculada:
        transacao_vinculada = Transacao.query.filter(
            Transacao.id_usuario == current_user.id,
            Transacao.descricao == hist.descricao
        ).filter(func.abs(Transacao.valor_total - hist.valor) < 0.01).first()

    poupanca = Poupanca.query.filter_by(id_usuario=current_user.id).first()
    if poupanca:
        if hist.tipo == 'entrada':
            poupanca.saldo -= hist.valor
        else:
            poupanca.saldo += hist.valor
            
        if hist.tipo == 'entrada':
            poupanca.saldo += novo_valor
        else:
            if novo_valor > poupanca.saldo:
                db.session.rollback()
                return jsonify({"erro": "Saldo insuficiente na poupança para este valor"}), 400
            poupanca.saldo -= novo_valor
            
        if poupanca.saldo < 0:
            poupanca.saldo = 0

    if transacao_vinculada:
        transacao_vinculada.descricao = nova_descricao
        transacao_vinculada.valor_total = novo_valor 
        parcela = Parcela.query.filter_by(id_transacao=transacao_vinculada.id).first()
        if parcela:
            parcela.valor = novo_valor

    hist.descricao = nova_descricao
    hist.valor = novo_valor
    try:
        hist.data_registro = datetime.strptime(dados.get('data'), '%Y-%m-%d').date()
    except ValueError:
        pass

    db.session.commit()
    return jsonify({"mensagem": "Registro da poupança atualizado!"})


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)