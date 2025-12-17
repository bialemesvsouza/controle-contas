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
    password_hash = db.Column(db.String(200), nullable=False)

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
    parcelas = db.relationship('Parcela', backref='transacao', lazy=True, cascade="all, delete-orphan")
    tipo = db.relationship('Tipo', backref='transacoes')

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

# --- LÓGICA AUXILIAR ---
def gerar_parcelas_customizadas(transacao_obj, lista_datas):
    valor_parc = transacao_obj.valor_total / transacao_obj.qtd_parcelas
    
    # Define o status inicial baseado no tipo
    if transacao_obj.tipo_transacao == 'receita':
        status_inicial = 'recebido'
    else:
        status_inicial = 'a_pagar'

    for i, data_str in enumerate(lista_datas):
        data_venc = datetime.strptime(data_str, '%Y-%m-%d').date()
        
        nova_parcela = Parcela(
            id_transacao=transacao_obj.id,
            id_usuario=transacao_obj.id_usuario,
            numero_parcela=i + 1,
            valor=valor_parc,
            vencimento=data_venc,
            status=status_inicial,
            # Se for receita, já preenche a data de pagamento com a data informada (data de recebimento)
            data_pagamento=data_venc if status_inicial == 'recebido' else None
        )
        db.session.add(nova_parcela)
    db.session.commit()

# --- ROTAS ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    dados = request.json
    if Usuario.query.filter_by(username=dados['username']).first():
        return jsonify({"erro": "Usuário já existe"}), 400

    novo_user = Usuario(username=dados['username'], password_hash=generate_password_hash(dados['password']))
    db.session.add(novo_user)
    db.session.commit() 
    
    padroes = [
        ('Salário', 'receita'),
        ('Alimentação', 'despesa'),
        ('Transporte', 'despesa'),
        ('Moradia', 'despesa'),
        ('Lazer', 'despesa')
    ]
    
    for nome, cat in padroes:
        novo_tipo = Tipo(nome=nome, categoria=cat, id_usuario=novo_user.id)
        db.session.add(novo_tipo)
    
    db.session.commit()

    return jsonify({"mensagem": "Usuário criado com sucesso!"})

@app.route('/login', methods=['POST'])
def login():
    dados = request.json
    user = Usuario.query.filter_by(username=dados['username']).first()
    if user and check_password_hash(user.password_hash, dados['password']):
        login_user(user)
        return jsonify({"mensagem": f"Bem-vindo, {user.username}!"})
    return jsonify({"erro": "Credenciais inválidas"}), 401

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
    
    # Verifica se já existe uma categoria com este nome e tipo para o usuário atual
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

# --- ROTAS DE TRANSAÇÃO E DASHBOARD  ---

@app.route('/nova_transacao', methods=['POST'])
@login_required
def nova_transacao():
    dados = request.json
    
    tipo_check = Tipo.query.filter_by(id=dados.get('id_tipo_categoria'), id_usuario=current_user.id).first()
    if not tipo_check:
         return jsonify({"erro": "Categoria inválida"}), 400

    nova = Transacao(
        id_usuario=current_user.id,
        id_tipo=dados.get('id_tipo_categoria'),
        descricao=dados['descricao'],
        valor_total=dados['valor'],
        qtd_parcelas=dados['parcelas'],
        tipo_transacao=dados['tipo']
    )
    db.session.add(nova)
    db.session.commit()
    gerar_parcelas_customizadas(nova, dados['datas_parcelas'])
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
    
    # 1. Totais
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

    # 2. Gráfico Despesas por Categoria
    despesas_por_cat = db.session.query(Tipo.nome, db.func.sum(Parcela.valor))\
        .join(Transacao, Transacao.id_tipo == Tipo.id)\
        .join(Parcela, Parcela.id_transacao == Transacao.id)\
        .filter(Parcela.id_usuario == current_user.id)\
        .filter(Transacao.tipo_transacao == 'despesa')\
        .filter(Parcela.vencimento >= inicio, Parcela.vencimento <= fim)\
        .group_by(Tipo.nome).all()

    # 3. Gráfico Receitas por Categoria
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
            "id_categoria": p.transacao.id_tipo
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
    Parcela.query.filter(Parcela.id.in_(ids), Parcela.id_usuario == current_user.id).update({
        Parcela.status: 'pago',
        Parcela.data_pagamento: hoje
    }, synchronize_session=False)
    
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

    if parcela.status == 'pago' and not parcela.data_pagamento:
        parcela.data_pagamento = datetime.now().date()
    elif parcela.status != 'pago':
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)