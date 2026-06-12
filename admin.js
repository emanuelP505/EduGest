import { app, auth, db, functions } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, query, where, orderBy, getDoc, setDoc, serverTimestamp, addDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";


// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);
// const auth = getAuth(app);
// const functions = getFunctions(app, 'us-central1');

// resto do código continua igual...
const listaEscolasTbody = document.getElementById('listaEscolas');
const filtroInput = document.getElementById('buscaEscola');
let todasAsEscolas = [];

// AUTH
onAuthStateChanged(auth, (user) => {
    if (user) {
        verificarSeEhAdmin(user.uid);
    } else {
        window.location.href = './index.html';
    }
});

async function verificarSeEhAdmin(uid) {
  console.log('1. UID logado:', uid);
  console.log('2. Tentando buscar doc:', 'usuarios/' + uid);
  
  const userRef = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  
  console.log('3. Doc existe?', userSnap.exists());
  
  if (userSnap.exists()) {
    const dados = userSnap.data();
    console.log('4. Dados completos:', dados);
    console.log('5. perfil =', `"${dados.perfil}"`, 'tipo:', typeof dados.perfil);
    console.log('6. Teste === admin:', dados.perfil === 'admin');
    
    if (dados.perfil === 'admin') {
      console.log('7. ✅ LIBEROU PAINEL');
      document.getElementById('adminContent').style.display = 'block';
      document.getElementById('acessoNegado').style.display = 'none';
      iniciarPainel();
    } else {
      console.log('7. ❌ PERFIL NEGADO:', dados.perfil);
      window.location.href = './index.html';
    }
  } else {
    console.log('7. ❌ DOC NÃO EXISTE pra esse UID');
    window.location.href = './index.html';
  }
}
function iniciarPainel() {
    carregarStats();
    listarEscolas();
    listarCodigos();
    carregarEscolas();
    listarFinanceiro();
    listarLogs();
}

// STATS DASHBOARD
async function carregarStats() {
    try {
        const escolasSnap = await getDocs(collection(db, 'escolas'));
        const ativas = escolasSnap.docs.filter(d => d.data().ativo!== false).length;
        const congeladas = escolasSnap.size - ativas;

        let totalAlunos = 0;
        let inadimplentes = 0;
        const hoje = new Date().toISOString().split('T')[0];

        for (const docSnap of escolasSnap.docs) {
            const escola = docSnap.data();
            const alunosSnap = await getDocs(query(collection(db, 'estudantes'), where('escolaId', '==', docSnap.id)));
            totalAlunos += alunosSnap.size;
            if (escola.dataVencimento && escola.dataVencimento < hoje && escola.ativo!== false) {
                inadimplentes++;
            }
        }

        document.getElementById('totalEscolas').textContent = ativas;
        document.getElementById('totalAlunos').textContent = totalAlunos;
        document.getElementById('totalCongeladas').textContent = congeladas;
        document.getElementById('totalInadimplentes').textContent = inadimplentes;
    } catch (e) {
        console.error('Erro stats:', e);
    }
}

// ESCOLAS
async function listarEscolas() {
    listaEscolasTbody.innerHTML = '<tr><td colspan="6">Carregando escolas...</td></tr>';
    try {
        const escolasQuery = query(collection(db, 'escolas'), orderBy('nome'));
        const escolasSnapshot = await getDocs(escolasQuery);
        todasAsEscolas = await Promise.all(escolasSnapshot.docs.map(async (escolaDoc) => {
            const escola = { id: escolaDoc.id,...escolaDoc.data() };
            const alunosQuery = query(collection(db, 'estudantes'), where('escolaId', '==', escola.id));
            const alunosSnapshot = await getDocs(alunosQuery);
            escola.totalAlunos = alunosSnapshot.size;
            return escola;
        }));
        renderizarEscolas(todasAsEscolas);
    } catch (error) {
        console.error("Erro ao listar escolas: ", error);
        listaEscolasTbody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro: ${error.code}</td></tr>`;
    }
}

function renderizarEscolas(escolas) {
    listaEscolasTbody.innerHTML = '';
    if (escolas.length === 0) {
        listaEscolasTbody.innerHTML = '<tr><td colspan="6">Nenhuma escola encontrada.</td></tr>';
        return;
    }
    escolas.forEach(escola => {
        const vencimento = escola.dataVencimento || escola.vencimento || 'Não definido';
        const vencimentoFormatado = vencimento!== 'Não definido'? new Date(vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : 'Não definido';
        const statusBadge = escola.ativo!== false
           ? '<span class="badge badge-green">Ativa</span>'
            : '<span class="badge badge-red">Congelada</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escola.nome}</td>
            <td>${escola.plano || 'basico'}</td>
            <td>${statusBadge}</td>
            <td>${escola.totalAlunos}</td>
            <td>${vencimentoFormatado}</td>
            <td>
                ${escola.ativo!== false
                   ? `<button class="btn btn-yellow" onclick="handleCongelar('${escola.id}', '${escola.nome.replace(/'/g, "\\'")}')">Congelar</button>`
                    : `<button class="btn btn-green" onclick="handleDescongelar('${escola.id}', '${escola.nome.replace(/'/g, "\\'")}')">Descongelar</button>`
                }
            </td>
        `;
        listaEscolasTbody.appendChild(tr);
    });
}

window.handleCongelar = async (escolaId, nome) => {
    const motivo = prompt(`Motivo do bloqueio da escola ${nome}:`, 'Inadimplência');
    if (!motivo) return;
    try {
        const escolaRef = doc(db, 'escolas', escolaId);
        await updateDoc(escolaRef, {
            ativo: false,
            motivoBloqueio: motivo,
            bloqueadoEm: serverTimestamp()
        });
        await addDoc(collection(db, 'logs_admin'), {
            adminEmail: auth.currentUser.email,
            acao: 'CONGELAR_ESCOLA',
            alvo: nome,
            data: serverTimestamp()
        });
        alert('Escola congelada com sucesso!');
        listarEscolas();
        carregarStats();
    } catch (e) {
        console.error(e);
        alert('Erro ao congelar: ' + e.message);
    }
};

window.handleDescongelar = async (escolaId, nome) => {
    if (!confirm(`Tem certeza que deseja descongelar a escola ${nome}?`)) return;
    try {
        const escolaRef = doc(db, 'escolas', escolaId);
        await updateDoc(escolaRef, {
            ativo: true,
            motivoBloqueio: null,
            bloqueadoEm: null
        });
        await addDoc(collection(db, 'logs_admin'), {
            adminEmail: auth.currentUser.email,
            acao: 'DESCONGELAR_ESCOLA',
            alvo: nome,
            data: serverTimestamp()
        });
        alert('Escola descongelada com sucesso!');
        listarEscolas();
        carregarStats();
    } catch (e) {
        console.error(e);
        alert('Erro ao descongelar: ' + e.message);
    }
};

window.filtrarEscolas = () => {
    const termo = filtroInput.value.toLowerCase();
    const filtradas = todasAsEscolas.filter(escola =>
        escola.nome.toLowerCase().includes(termo) ||
        (escola.cnpj && escola.cnpj.includes(termo))
    );
    renderizarEscolas(filtradas);
};

// CONVITES
window.gerarCodigo = async () => {
    const nome = document.getElementById('nomeEscolaConvite').value;
    const email = document.getElementById('emailLiberado').value;
    const dias = parseInt(document.getElementById('validadeDias').value) || 30;
    const plano = document.getElementById('plano').value || 'basico';

    if (!nome) return alert('Preencha o nome da escola');

    const codigo = 'EDU-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const expira = new Date();
    expira.setDate(expira.getDate() + dias);

    try {
        await setDoc(doc(db, 'convites', codigo), {
            codigo,
            nomeEscola: nome,
            emailLiberado: email || null,
            plano,
            expiraEm: expira.toISOString().split('T')[0],
            usado: false,
            criadoPor: auth.currentUser.email,
            criadoEm: serverTimestamp()
        });
        document.getElementById('codigoGerado').innerHTML = `
            <div style="background:rgba(22,163,74,.2);padding:12px;border-radius:8px;">
                <strong>Código gerado:</strong> ${codigo}<br>
                <small>Validade: ${expira.toLocaleDateString('pt-BR')}</small>
            </div>`;
        document.getElementById('nomeEscolaConvite').value = '';
        listarCodigos();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
};

async function listarCodigos() {
    const tbody = document.getElementById('listaCodigos');
    const snap = await getDocs(query(collection(db, 'convites'), orderBy('criadoEm', 'desc'), limit(20)));
    tbody.innerHTML = '';
    snap.forEach(docSnap => {
        const c = docSnap.data();
        const status = c.usado? '<span class="badge badge-red">Usado</span>' : '<span class="badge badge-green">Ativo</span>';
        tbody.innerHTML += `
            <tr>
                <td>${c.codigo}</td>
                <td>${c.nomeEscola}</td>
                <td>${c.plano}</td>
                <td>${new Date(c.expiraEm).toLocaleDateString('pt-BR')}</td>
                <td>${status}</td>
                <td>${!c.usado? `<button class="btn btn-red" onclick="revogarCodigo('${c.codigo}')">Revogar</button>` : '-'}</td>
            </tr>`;
    });
}

window.revogarCodigo = async (codigo) => {
    if (!confirm('Revogar código ' + codigo + '?')) return;
    await updateDoc(doc(db, 'convites', codigo), { usado: true, revogadoEm: serverTimestamp() });
    listarCodigos();
};

// FINANCEIRO
async function listarFinanceiro() {
    const tbody = document.getElementById('listaFinanceiro');
    const snap = await getDocs(query(collection(db, 'escolas'), orderBy('nome')));
    tbody.innerHTML = '';
    const hoje = new Date().toISOString().split('T')[0];

    snap.forEach(docSnap => {
        const e = docSnap.data();
        const vencido = e.dataVencimento && e.dataVencimento < hoje;
        const status = vencido? '<span class="badge badge-red">Vencido</span>' : '<span class="badge badge-green">Em dia</span>';
        const valores = { basico: 500, pro: 1000, premium: 2000 };

        tbody.innerHTML += `
            <tr>
                <td>${e.nome}</td>
                <td>${e.plano || 'basico'}</td>
                <td>R$ ${valores[e.plano] || 500}</td>
                <td>${e.dataVencimento? new Date(e.dataVencimento).toLocaleDateString('pt-BR') : '-'}</td>
                <td>${status}</td>
                <td>
                    <button class="btn btn-blue" onclick="marcarPago('${docSnap.id}')">Marcar Pago</button>
                </td>
            </tr>`;
    });
}

window.marcarPago = async (escolaId) => {
    const novaData = new Date();
    novaData.setMonth(novaData.getMonth() + 1);
    const dataVenc = novaData.toISOString().split('T')[0];
    await updateDoc(doc(db, 'escolas', escolaId), { dataVencimento: dataVenc });
    alert('Pagamento registrado! Novo vencimento: ' + new Date(dataVenc).toLocaleDateString('pt-BR'));
    listarFinanceiro();
    carregarStats();
};

// USUÁRIOS
async function carregarEscolas() {
    const select = document.getElementById('escolaId');
    if (!select) return;
    const snap = await getDocs(collection(db, 'escolas'));
    select.innerHTML = '<option value="">Selecione a escola</option>';
    snap.forEach(docSnap => {
        const nome = docSnap.data().nome || docSnap.id;
        select.innerHTML += `<option value="${docSnap.id}">${nome}</option>`;
    });
}

window.criarUsuarioManual = async () => {
    const dados = {
        escolaId: document.getElementById('escolaId').value,
        nome: document.getElementById('nome').value,
        email: document.getElementById('email').value,
        senha: document.getElementById('senha').value,
        perfil: document.getElementById('perfil').value
    };
    if (Object.values(dados).some(v =>!v)) return alert('Preencha tudo');
    try {
        const cred = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
            nome: dados.nome, email: dados.email, perfil: dados.perfil,
            escolaId: dados.escolaId, ativo: true, criadoEm: serverTimestamp()
        });
        alert('Usuário criado!');
        document.getElementById('formAdmin').reset();
    } catch (e) {
        alert('Erro: ' + e.message);
    }
};

// LOGS
async function listarLogs() {
    const tbody = document.getElementById('listaLogs');
    if (!tbody) return;
    const logs = await getDocs(query(collection(db, 'logs_admin'), orderBy('data', 'desc'), limit(100)));
    tbody.innerHTML = '';
    logs.forEach(docLog => {
        const d = docLog.data();
        tbody.innerHTML += `
            <tr>
                <td>${d.data?.toDate().toLocaleString('pt-AO') || '-'}</td>
                <td>${d.adminEmail || '-'}</td>
                <td>${d.acao}</td>
                <td>${d.alvo}</td>
                <td>${d.ip || '-'}</td>
            </tr>`;
    });
}

// MANUTENÇÃO
window.toggleModoManutencao = async () => {
    if (!confirm('Ativar/Desativar modo manutenção? Todas as escolas serão bloqueadas.')) return;
    try {
        const toggleManutencao = httpsCallable(functions, 'toggleManutencao');
        const result = await toggleManutencao();
        alert(result.data.ativo? 'Modo manutenção ATIVADO' : 'Modo manutenção DESATIVADO');
    } catch (e) {
        alert('Erro: ' + e.message);
    }
};

// NAVEGAÇÃO
window.trocarAba = (aba) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('ativa'));
    document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
    event.target.classList.add('ativa');
    document.getElementById('painel-' + aba).classList.add('ativo');
};

window.logout = async () => {
    if (!confirm('Deseja sair?')) return;
    await signOut(auth);
    window.location.href = '/index.html';
};
