import { auth, db } from './firebase-config.js';
import {
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let editandoId = null;
let cursos = [], turmas = [], estudantes = [];
let unsubCursos, unsubTurmas, unsubEstudantes, unsubEscola;

document.addEventListener('DOMContentLoaded', function () {
  lucide.createIcons();

  // BANNER OFFLINE
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  auth.onAuthStateChanged(async (firebaseUser) => {
    if (!navigator.onLine) {
      console.log('Modo offline - usando cache');
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
        if (userDoc.exists()) {
          userAtual = { uid: firebaseUser.uid,...userDoc.data() };
          iniciarCursos();
        }
      }
      return;
    }

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

    // CHECA BLOQUEIO ANTES DE TUDO
    const escolaDoc = await getDoc(doc(db, 'escolas', userAtual.escolaId));
    if (!escolaDoc.exists()) {
      alert('Escola não encontrada.');
      signOut(auth);
      return;
    }

    // BLOQUEIA SE CONGELADA
    if (escolaDoc.data().ativo === false) {
      window.location.href = 'bloqueado.html';
      return;
    }

    // BLOQUEIA SE EM MANUTENÇÃO
    const configDoc = await getDoc(doc(db, 'config', 'app'));
    if (configDoc.exists() && configDoc.data().manutencao === true && userAtual.perfil!== 'admin') {
      window.location.href = 'manutencao.html';
      return;
    }

    iniciarCursos();
  });
});

function updateOnlineStatus() {
  const banner = document.getElementById('offlineBanner');
  if (banner) {
    if (navigator.onLine) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'block';
      lucide.createIcons();
    }
  }
}

function iniciarCursos() {
  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Sair?\n${userAtual.nome} - ${userAtual.perfil}`)) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);

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

  document.getElementById('btnAddCurso').onclick = () => {
    if (!navigator.onLine) {
      alert('Cadastros indisponíveis offline');
      return;
    }
    editandoId = null;
    document.getElementById('modalTitle').textContent = 'Novo Curso';
    document.getElementById('nomeCurso').value = '';
    document.getElementById('areaCurso').value = 'Ciências Exatas';
    document.getElementById('duracaoCurso').value = '3';
    modal.classList.add('active');
  };

  document.getElementById('btnCancelar').onclick = () => {
    modal.classList.remove('active');
    editandoId = null;
  };

  document.getElementById('btnSalvar').onclick = salvarCurso;

  escutarDados();
}

const cores = ['var(--card-1)', 'var(--card-2)', 'var(--card-3)', 'var(--card-4)', 'var(--card-5)'];
const modal = document.getElementById('modalCurso');

function escutarDados() {
  const escolaId = userAtual.escolaId;

  // ESCOLA - TRAVA TEMPO REAL
  unsubEscola = onSnapshot(doc(db, 'escolas', escolaId), (snap) => {
    if (snap.exists() && snap.data().ativo === false && navigator.onLine) {
      window.location.href = 'bloqueado.html';
    }
  }, (error) => {
    if (error.code === 'permission-denied' && navigator.onLine) {
      window.location.href = 'bloqueado.html';
    }
  });

  // CURSOS
  unsubCursos = onSnapshot(
    query(collection(db, 'cursos'), where('escolaId', '==', escolaId)),
    (snap) => {
      cursos = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderCursos();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );

  unsubTurmas = onSnapshot(
    query(collection(db, 'turmas'), where('escolaId', '==', escolaId)),
    (snap) => {
      turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderCursos();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );

  unsubEstudantes = onSnapshot(
    query(collection(db, 'estudantes'), where('escolaId', '==', escolaId)),
    (snap) => {
      estudantes = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderCursos();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );
}

function calcularStatsCurso(cursoId) {
  const turmasCurso = turmas.filter(t => String(t.cursoId) === String(cursoId));
  const totalAlunos = estudantes.filter(e => {
    const turma = turmas.find(t => String(t.id) === String(e.turmaId));
    return turma && String(turma.cursoId) === String(cursoId);
  }).length;
  return { turmas: turmasCurso.length, alunos: totalAlunos };
}

function renderCursos() {
  try {
    const container = document.getElementById('cursoContainer');

    if (cursos.length === 0) {
      container.innerHTML = '<p style="padding: 32px; color: var(--secondary-color);">Nenhum curso cadastrado. Clique no + para adicionar.</p>';
    } else {
      container.innerHTML = cursos.map((c, i) => {
        const stats = calcularStatsCurso(c.id);
        return `
        <div class="project-box-wrapper">
          <div class="project-box" style="background-color: ${cores[i % cores.length]};">
            <div class="project-box-header">
              <span>${c.area}</span>
              <div style="display:flex; gap:6px">
                <button class="project-btn-more" onclick="editarCurso('${c.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="project-btn-more" onclick="removerCurso('${c.id}')" title="Remover"><i data-lucide="trash-2"></i></button>
              </div>
            <div class="project-box-content-header">
              <p class="box-content-header">${c.nome}</p>
              <p class="box-content-subheader">10ª à ${9 + c.duracao}ª Classe</p>
            </div>
            <div class="box-progress-wrapper">
              <p class="box-progress-header">Duração</p>
              <div class="box-progress-bar">
                <span class="box-progress" style="width: ${(c.duracao/5)*100}%; background-color: #2563eb"></span>
              </div>
              <p class="box-progress-percentage">${c.duracao} Anos</p>
            </div>
            <div class="project-box-footer">
              <div class="days-left" style="color: #fff;">${stats.turmas} Turmas • ${stats.alunos} Alunos</div>
            </div>
          </div>
        </div>
        `;
      }).join('');
      lucide.createIcons();
    }

    const totalTurmas = cursos.reduce((s, c) => s + calcularStatsCurso(c.id).turmas, 0);
    const totalAlunos = cursos.reduce((s, c) => s + calcularStatsCurso(c.id).alunos, 0);
    document.getElementById('totalCursos').textContent = cursos.length;
    document.getElementById('totalTurmas').textContent = totalTurmas;
    document.getElementById('totalAlunos').textContent = totalAlunos;

  } catch (e) {
    console.error('Erro ao renderizar cursos:', e);
    document.getElementById('cursoContainer').innerHTML =
      '<p style="padding: 32px; color: red;">Erro ao carregar cursos. F12 pra ver detalhes.</p>';
  }
}

async function salvarCurso() {
  if (!navigator.onLine) {
    alert('Sem conexão. Não é possível salvar.');
    return;
  }

  const btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeCurso').value.trim();
  const area = document.getElementById('areaCurso').value;
  const duracao = parseInt(document.getElementById('duracaoCurso').value);

  if (!nome) {
    alert('Preencha o nome do curso');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  if (cursos.some(c => c.nome.toLowerCase() === nome.toLowerCase() && c.id!== editandoId)) {
    alert('Já existe um curso com este nome');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    const dadosCurso = {
      nome,
      area,
      duracao,
      escolaId: userAtual.escolaId,
      criadoPor: userAtual.uid,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'cursos', editandoId), dadosCurso);
    } else {
      dadosCurso.criadoEm = new Date().toISOString();
      await addDoc(collection(db, 'cursos'), dadosCurso);
    }

    modal.classList.remove('active');
    editandoId = null;
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

window.editarCurso = function(id) {
  if (!navigator.onLine) {
    alert('Edição indisponível offline');
    return;
  }
  const c = cursos.find(c => c.id === id);
  if (!c) return;
  editandoId = id;

  document.getElementById('modalTitle').textContent = 'Editar Curso';
  document.getElementById('nomeCurso').value = c.nome;
  document.getElementById('areaCurso').value = c.area;
  document.getElementById('duracaoCurso').value = c.duracao;
  modal.classList.add('active');
};

window.removerCurso = async function(id) {
  if (!navigator.onLine) {
    alert('Remoção indisponível offline');
    return;
  }
  if (turmas.some(t => String(t.cursoId) === String(id))) {
    alert('Não podes remover um curso que tem turmas cadastradas');
    return;
  }

  if (confirm('Remover este curso?')) {
    try {
      await deleteDoc(doc(db, 'cursos', id));
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
  }
}

window.addEventListener('beforeunload', () => {
  unsubCursos?.();
  unsubTurmas?.();
  unsubEstudantes?.();
  unsubEscola?.();
});