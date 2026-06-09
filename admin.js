import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, collection, getDocs, doc, updateDoc, query, where, orderBy, getDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
    const userRef = doc(db, 'usuarios', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().perfil === 'admin') {
        listarEscolas();
    } else {
        alert('Acesso negado.');
        window.location.href = './dashboard.html';
    }
}

async function listarEscolas() {
    listaEscolasDiv.innerHTML = '<p>Carregando escolas...</p>';
    try {
        const escolasQuery = query(collection(db, 'escolas'), orderBy('nome'));
        const escolasSnapshot = await getDocs(escolasQuery);
        
        todasAsEscolas = await Promise.all(escolasSnapshot.docs.map(async (escolaDoc) => {
            const escola = { id: escolaDoc.id, ...escolaDoc.data() };
            
            // CONTA ALUNOS NA COLEÇÃO CORRETA: estudantes
            const alunosQuery = query(collection(db, 'estudantes'), where('escolaId', '==', escola.id));
            const alunosSnapshot = await getDocs(alunosQuery);
            escola.totalAlunos = alunosSnapshot.size;
            
            return escola;
        }));
        
        renderizarEscolas(todasAsEscolas);
    } catch (error) {
        console.error("Erro ao listar escolas: ", error);
        listaEscolasDiv.innerHTML = '<p style="color:red;">Erro ao carregar escolas.</p>';
    }
}

function renderizarEscolas(escolas) {
    listaEscolasDiv.innerHTML = '';
    if (escolas.length === 0) {
        listaEscolasDiv.innerHTML = '<p>Nenhuma escola encontrada.</p>';
        return;
    }
    
    escolas.forEach(escola => {
        const card = document.createElement('div');
        card.className = `escola-card ${!escola.ativo ? 'congelada' : ''}`;
        
        // FALLBACK DE VENCIMENTO
        const vencimento = escola.dataVencimento || escola.vencimento || 'Não definido';
        const vencimentoFormatado = vencimento !== 'Não definido' 
            ? new Date(vencimento + 'T00:00:00').toLocaleDateString('pt-BR') 
            : 'Não definido';
        
        card.innerHTML = `
            <div class="escola-info">
                <h3>${escola.nome} ${!escola.ativo ? '<span class="badge-congelada">Congelada</span>' : ''}</h3>
                <p><strong>CNPJ:</strong> ${escola.cnpj || 'Não informado'}</p>
                <p><strong>Alunos Total:</strong> ${escola.totalAlunos}</p>
                <p><strong>Vencimento:</strong> ${vencimentoFormatado}</p>
                ${!escola.ativo ? `<p><strong>Motivo:</strong> ${escola.motivoBloqueio || 'Não informado'}</p>` : ''}
            </div>
            <div class="escola-acoes">
                ${escola.ativo 
                    ? `<button class="btn-congelar" onclick="handleCongelar('${escola.id}', '${escola.nome}')">Congelar</button>`
                    : `<button class="btn-descongelar" onclick="handleDescongelar('${escola.id}', '${escola.nome}')">Descongelar</button>`
                }
            </div>
        `;
        listaEscolasDiv.appendChild(card);
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
            bloqueadoEm: new Date() 
        });
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
        await updateDoc(escolaRef, { 
            ativo: true, 
            motivoBloqueio: null, 
            bloqueadoEm: null 
        });
        alert('Escola descongelada com sucesso!');
        listarEscolas();
    } catch (e) {
        console.error(e);
        alert('Erro ao descongelar: ' + e.code + ' - ' + e.message);
    }
};

filtroInput.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase();
    const filtradas = todasAsEscolas.filter(escola => 
        escola.nome.toLowerCase().includes(termo) || 
        (escola.cnpj && escola.cnpj.includes(termo))
    );
    renderizarEscolas(filtradas);
});