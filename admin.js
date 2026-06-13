                import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, orderBy, getDoc, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkOF8Az4NskBnGx1HyTY9wIfsFHC5aRjw",
  authDomain: "edugest-4bdc3.firebaseapp.com",
  projectId: "edugest-4bdc3",
  storageBucket: "edugest-4bdc3.firebasestorage.app",
  messagingSenderId: "1092615797287",
  appId: "1:1092615797287:web:177ab66d1134e04cb42c02",
  measurementId: "G-HD2H2CK0H6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const listaEscolasDiv = document.getElementById('lista-escolas');
const filtroInput = document.getElementById('filtro-escolas');
let todasAsEscolas = [];

onAuthStateChanged(auth, (user) => {
    if (user) {
        verificarSeEhAdmin(user.uid);
    } else {
        window.location.href = './index.html';
    }
});

async function verificarSeEhAdmin(uid) {
    try {
        const userRef = doc(db, 'usuarios', uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().perfil === 'admin') {
            listarEscolas();
        } else {
            alert('Acesso negado.');
            window.location.href = './dashboard.html';
        }
    } catch (e) {
        console.error(e);
        listaEscolasDiv.innerHTML = '<p style="color:red;">Erro ao verificar permissão</p>';
    }
}

async function listarEscolas() {
    listaEscolasDiv.innerHTML = `
      <div style="text-align:center;padding:3rem">
        <img src="https://undraw.co/api/illustrations/undraw_loading_re_5axr.svg?color=4285f4" width="200">
        <p>Carregando escolas...</p>
      </div>
    `;
    
    try {
        const escolasQuery = query(collection(db, 'escolas'), orderBy('nome'));
        const escolasSnapshot = await getDocs(escolasQuery);
        
        todasAsEscolas = await Promise.all(escolasSnapshot.docs.map(async (escolaDoc) => {
            const escola = { id: escolaDoc.id, ...escolaDoc.data() };
            const alunosQuery = query(collection(db, 'estudantes'), where('escolaId', '==', escola.id));
            const countSnap = await getCountFromServer(alunosQuery);
            escola.totalAlunos = countSnap.data().count;
            return escola;
        }));
        
        renderizarEscolas(todasAsEscolas);
    } catch (error) {
        console.error("Erro ao listar escolas: ", error);
        listaEscolasDiv.innerHTML = `
          <div style="text-align:center;padding:3rem">
            <img src="https://undraw.co/api/illustrations/undraw_warning_re_eoyh.svg?color=ea4335" width="250">
            <h3>Erro ao carregar</h3>
            <p style="color:#ea4335;">${error.code || 'Erro desconhecido'}</p>
          </div>
        `;
    }
}

function renderizarEscolas(escolas) {
    listaEscolasDiv.innerHTML = '';
    
    if (escolas.length === 0) {
        listaEscolasDiv.innerHTML = `
          <div style="text-align:center;padding:3rem">
            <img src="https://undraw.co/api/illustrations/undraw_void_3ggu.svg?color=6c63ff" width="250">
            <h3>Nenhuma escola encontrada</h3>
            <p>Tente ajustar o filtro de busca</p>
          </div>
        `;
        return;
    }
    
    escolas.forEach(escola => {
        const card = document.createElement('div');
        card.className = `escola-card ${!escola.ativo ? 'congelada' : ''}`;
        
        const vencimento = escola.dataVencimento || escola.vencimento;
        const vencimentoFormatado = vencimento 
            ? new Date(vencimento + 'T03:00:00').toLocaleDateString('pt-BR') 
            : 'Não definido';
        
        const nomeEscapado = escola.nome.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cnpjEscapado = (escola.cnpj || 'Não informado').replace(/</g, '&lt;');
        const motivoEscapado = (escola.motivoBloqueio || 'Não informado').replace(/</g, '&lt;');
        
        card.innerHTML = `
            <div class="escola-info">
                <h3>
                    <span class="nome-escola"></span>
                    ${!escola.ativo ? '<span class="badge-congelada">Congelada</span>' : ''}
                </h3>
                <p><strong>CNPJ:</strong> ${cnpjEscapado}</p>
                <p><strong>Alunos Total:</strong> ${escola.totalAlunos}</p>
                <p><strong>Vencimento:</strong> ${vencimentoFormatado}</p>
                ${!escola.ativo ? `<p><strong>Motivo:</strong> ${motivoEscapado}</p>` : ''}
            </div>
            <div class="escola-acoes">
                ${escola.ativo 
                    ? `<button class="btn-congelar" onclick="handleCongelar('${escola.id}', '${nomeEscapado}')">Congelar</button>`
                    : `<button class="btn-descongelar" onclick="handleDescongelar('${escola.id}', '${nomeEscapado}')">Descongelar</button>`
                }
            </div>
        `;
        
        card.querySelector('.nome-escola').textContent = escola.nome;
        listaEscolasDiv.appendChild(card);
    });
}

window.handleCongelar = async (escolaId, nome) => {
    const motivo = prompt(`Motivo do bloqueio da escola ${nome}:`, 'Inadimplência');
    if (!motivo) return;
    try {
        const escolaRef = doc(db, 'escolas', escolaId);
        await updateDoc(escolaRef, { ativo: false, motivoBloqueio: motivo, bloqueadoEm: new Date() });
        alert('Escola congelada com sucesso!');
        listarEscolas();
    } catch (e) {
        console.error(e);
        alert('Erro ao congelar: ' + e.code + ' - ' + e.message);
    }
};

window.handleDescongelar = async (escolaId, nome) => {
    if (!confirm(`Tem certeza que deseja descongelar a escola ${nome}?`)) return;
    try {
        const escolaRef = doc(db, 'escolas', escolaId);
        await updateDoc(escolaRef, { ativo: true, motivoBloqueio: null, bloqueadoEm: null });
        alert('Escola descongelada com sucesso!');
        listarEscolas();
    } catch (e) {
        console.error(e);
        alert('Erro ao descongelar: ' + e.code + ' - ' + e.message);
    }
};

if (filtroInput) {
    filtroInput.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        const filtradas = todasAsEscolas.filter(escola => 
            escola.nome.toLowerCase().includes(termo) || 
            (escola.cnpj && escola.cnpj.includes(termo))
        );
        renderizarEscolas(filtradas);
    });
        }
