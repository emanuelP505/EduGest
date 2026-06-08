import { auth, db } from './firebase-config.js';
import { 
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let editandoId = null;
let disciplinas = [], cursos = [];
let unsubDisc, unsubCursos;

document.addEventListener('DOMContentLoaded', function () {
  lucide.createIcons();

  auth.onAuthStateChanged(async (firebaseUser) => {
    if (!firebaseUser) {
      window.location.href = 'index.html';
      return;
    }

    const userDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
    if (!userDoc.exists()) {
      alert('Usuário sem dados.');
      signOut(auth);
      return;
    }

    userAtual = { uid: firebaseUser.uid,...userDoc.data() };
    iniciarDisciplinas();
  });
});

function iniciarDisciplinas() {
  // Avatar + Nome
  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  // Botão sair
  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Sair?\n${userAtual.nome} - ${userAtual.perfil}`)) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);

  // View List/Grid
  const listView = document.querySelector('.list-view');
  const gridView = document.querySelector('.grid-view');
  const projectsList = document.querySelector('.project-boxes');
  
  listView.onclick = () => {
    gridView.classList.remove('active');
    listView.classList.add('active');
    projectsList.classList.remove('jsGridView');
    projectsList.classList.add('jsListView');
  };
  
  gridView.onclick = () => {
    gridView.classList.add('active');
    listView.classList.remove('active');
    projectsList.classList.remove('jsListView');
    projectsList.classList.add('jsGridView');
  };

  // CRUD Disciplinas
  document.getElementById('btnAddDisc').onclick = () => {
    carregarCursosSelect();
    document.getElementById('modalTitle').textContent = 'Nova Disciplina';
    limparForm();
    modal.classList.add('active');
  };

  document.getElementById('btnCancelar').onclick = () => {
    modal.classList.remove('active');
    limparForm();
  };

  document.getElementById('btnSalvar').onclick = salvarDisciplina;

  // Escuta Firestore
  escutarDados();
}

const cores = ['var(--card-1)', 'var(--card-2)', 'var(--card-3)', 'var(--card-4)', 'var(--card-5)', 'var(--card-6)'];
const modal = document.getElementById('modalDisc');

function escutarDados() {
  const escolaId = userAtual.escolaId;

  // DISCIPLINAS
  unsubDisc = onSnapshot(
    query(collection(db, 'disciplinas'), where('escolaId', '==', escolaId)),
    (snap) => {
      disciplinas = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderDisc();
    }
  );

  // CURSOS - pra popular select
  unsubCursos = onSnapshot(
    query(collection(db, 'cursos'), where('escolaId', '==', escolaId)),
    (snap) => {
      cursos = snap.docs.map(d => ({ id: d.id,...d.data() }));
    }
  );
}

function carregarCursosSelect() {
  const select = document.getElementById('cursoDisc');
  select.innerHTML = '<option value="">Seleciona um curso...</option>';
  
  if (cursos.length === 0) {
    select.innerHTML = '<option value="">Cadastra um curso primeiro</option>';
  } else {
    cursos.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id; // Salva ID, não nome
      option.textContent = c.nome;
      select.appendChild(option);
    });
  }
}

function limparForm() {
  document.getElementById('nomeDisc').value = '';
  document.getElementById('cursoDisc').value = '';
  document.getElementById('cargaDisc').value = '4';
  document.getElementById('tipoDisc').value = 'Teórica';
  document.getElementById('profDisc').value = '';
  editandoId = null;
}

function renderDisc() {
  try {
    const container = document.getElementById('discContainer');
    
    if (disciplinas.length === 0) {
      container.innerHTML = '<p style="padding: 32px; color: var(--secondary-color);">Nenhuma disciplina cadastrada. Clique no + para adicionar.</p>';
    } else {
      container.innerHTML = disciplinas.map((d, i) => {
        const curso = cursos.find(c => c.id === d.cursoId);
        const nomeCurso = curso ? curso.nome : 'Curso removido';
        const cargaPct = Math.min((d.carga / 10) * 100, 100);
        const corBarra = d.tipo === 'Prática' ? '#16a34a' : d.tipo === 'Teórica' ? '#2563eb' : '#ca8a04';
        
        return `
        <div class="project-box-wrapper">
          <div class="project-box" style="background-color: ${cores[i % cores.length]};">
            <div class="project-box-header">
              <span>${d.tipo}</span>
              <div style="display:flex; gap:6px">
                <button class="project-btn-more" onclick="editarDisc('${d.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="project-btn-more" onclick="removerDisc('${d.id}')" title="Remover"><i data-lucide="trash-2"></i></button>
              </div>
            </div>
            <div class="project-box-content-header">
              <p class="box-content-header">${d.nome}</p>
              <p class="box-content-subheader">${nomeCurso}</p>
            </div>
            <div class="box-progress-wrapper">
              <p class="box-progress-header">Carga Semanal</p>
              <div class="box-progress-bar">
                <span class="box-progress" style="width: ${cargaPct}%; background-color: ${corBarra}"></span>
              </div>
              <p class="box-progress-percentage">${d.carga} horas</p>
            </div>
            <div class="project-box-footer">
              <div class="days-left" style="color: ${corBarra};">Prof. ${d.professor}</div>
            </div>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }
    
    const mediaCarga = disciplinas.length ? Math.round(disciplinas.reduce((s, d) => s + d.carga, 0) / disciplinas.length) : 0;
    const professoresUnicos = new Set(disciplinas.map(d => d.professor)).size;
    document.getElementById('totalDisc').textContent = disciplinas.length;
    document.getElementById('mediaCarga').textContent = mediaCarga + 'h';
    document.getElementById('professoresDisc').textContent = professoresUnicos;
    
  } catch (e) {
    console.error('Erro ao renderizar disciplinas:', e);
    document.getElementById('discContainer').innerHTML =
      '<p style="padding: 32px; color: red;">Erro ao carregar disciplinas. F12 pra ver detalhes.</p>';
  }
}

async function salvarDisciplina() {
  const btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeDisc').value.trim();
  const cursoId = document.getElementById('cursoDisc').value;
  const carga = parseInt(document.getElementById('cargaDisc').value);
  const tipo = document.getElementById('tipoDisc').value;
  const professor = document.getElementById('profDisc').value.trim();
  
  if (!nome || !cursoId || !professor) {
    alert('Preencha todos os campos e seleciona um curso');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  // Verifica duplicado
  if (disciplinas.some(d => 
    d.nome.toLowerCase() === nome.toLowerCase() && 
    d.cursoId === cursoId && 
    d.id!== editandoId
  )) {
    alert('Já existe esta disciplina neste curso');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    const dadosDisc = {
      nome,
      cursoId,
      carga,
      tipo,
      professor,
      escolaId: userAtual.escolaId,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'disciplinas', editandoId), dadosDisc);
    } else {
      dadosDisc.criadoEm = new Date().toISOString();
      await addDoc(collection(db, 'disciplinas'), dadosDisc);
    }

    modal.classList.remove('active');
    limparForm();
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

window.editarDisc = function(id) {
  const d = disciplinas.find(d => d.id === id);
  if (!d) return;
  
  editandoId = id;
  carregarCursosSelect();
  document.getElementById('modalTitle').textContent = 'Editar Disciplina';
  document.getElementById('nomeDisc').value = d.nome;
  document.getElementById('cursoDisc').value = d.cursoId;
  document.getElementById('cargaDisc').value = d.carga;
  document.getElementById('tipoDisc').value = d.tipo;
  document.getElementById('profDisc').value = d.professor;
  modal.classList.add('active');
};

window.removerDisc = async function(id) {
  if (confirm('Remover esta disciplina?')) {
    try {
      await deleteDoc(doc(db, 'disciplinas', id));
    } catch (err) {
      alert('Erro ao remover. Verifique sua conexão.');
      console.error(err);
    }
  }
};

function renderizarAvatar() {
  const avatarDiv = document.getElementById('avatarIcon');
  if (userAtual.perfil === 'diretor') {
    avatarDiv.innerHTML = '<i data-lucide="shield-check"></i>';
    avatarDiv.style.background = 'var(--card-4)';
    avatarDiv.style.color = '#9333ea';
    avatarDiv.title = 'Diretor - Acesso Total';
  } else {
    avatarDiv.innerHTML = '<i data-lucide="clipboard-list"></i>';
    avatarDiv.style.background = 'var(--card-2)';
    avatarDiv.style.color = '#16a34a';
    avatarDiv.title = 'Secretário - Acesso Limitado';
  }
  lucide.createIcons();
}

function aplicarPermissoes(perfil) {
  const paginasSoDiretor = ['funcionarios.html', 'config.html', 'disciplina.html'];

  if (perfil === 'secretario') {
    paginasSoDiretor.forEach(pagina => {
      const link = document.querySelector(`a[href="${pagina}"]`);
      if (link) link.style.display = 'none';
    });

    const paginaAtual = window.location.pathname.split('/').pop();
    if (paginasSoDiretor.includes(paginaAtual)) {
      alert('Acesso negado. Apenas diretores podem acessar Disciplinas.');
      window.location.href = 'dashboard.html';
    }
  }
}

window.addEventListener('beforeunload', () => {
  unsubDisc?.();
  unsubCursos?.();
});