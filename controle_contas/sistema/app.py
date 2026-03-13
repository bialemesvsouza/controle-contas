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

    parcela.valor = float(dados['valor'])
    parcela.vencimento = datetime.strptime(dados['vencimento'], '%Y-%m-%d').date()
    parcela.status = dados['status']
    parcela.transacao.descricao = dados['descricao']

    if 'id_categoria' in dados and dados['id_categoria']:
        parcela.transacao.id_tipo = int(dados['id_categoria'])

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

    db.session.delete(parcela)
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)