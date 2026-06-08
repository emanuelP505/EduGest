import { auth, db } from './firebase-config.js';
import { 
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let editandoId = null;
let filtroTurno = 'Todos';
let termoBusca = '';
let searchTimeout = null;
let professores = [], turmas = [];
let unsubProf, unsubTurmas;

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
    iniciarProfessores();
  });
});

function iniciarProfessores() {
  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Sair?\n${userAtual.nome} - ${userAtual.perfil}`)) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);

  // VIEW LIST/GRID
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

  // FILTRO POR TURNO
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroTurno = btn.dataset.turno;
      renderProf();
    };
  });

  // BUSCA COM DEBOUNCE
  document.getElementById('searchFunc').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      termoBusca = e.target.value.toLowerCase().trim();
      renderProf();
    }, 300);
  });

  // PDF FOLHA
  document.getElementById('btnPdfFolha').onclick = () => {
    document.getElementById('btnPdfFolha').disabled = true;
    document.getElementById('btnPdfFolha').innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Gerando...';
    lucide.createIcons();

    setTimeout(() => {
      gerarPdfFolha();
      document.getElementById('btnPdfFolha').disabled = false;
      document.getElementById('btnPdfFolha').innerHTML = '<i data-lucide="file-text"></i><span style="font-size:13px;font-weight:600;">Folha PDF</span>';
      lucide.createIcons();
    }, 100);
  };

  // CRUD
  document.getElementById('btnAddProf').onclick = () => {
    editandoId = null;
    document.getElementById('modalTitle').textContent = 'Novo Professor';
    limparFormulario();
    carregarTurmas();
    modal.classList.add('active');
  };

  document.getElementById('btnCancelar').onclick = () => {
    modal.classList.remove('active');
    limparFormulario();
  };

  document.getElementById('btnSalvar').onclick = salvarProfessor;

  escutarDados();
}

const cores = ['var(--card-1)', 'var(--card-2)', 'var(--card-3)', 'var(--card-4)', 'var(--card-5)', 'var(--card-6)'];
const modal = document.getElementById('modalProf');
const container = document.getElementById('profContainer');

function escutarDados() {
  const escolaId = userAtual.escolaId;

  // PROFESSORES
  unsubProf = onSnapshot(
    query(collection(db, 'professores'), where('escolaId', '==', escolaId)),
    (snap) => {
      professores = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderProf();
    }
  );

  // TURMAS
  unsubTurmas = onSnapshot(
    query(collection(db, 'turmas'), where('escolaId', '==', escolaId)),
    (snap) => {
      turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
    }
  );
}

function getTurnoDaTurma(turmaId) {
  const t = turmas.find(t => t.id === turmaId);
  return t? t.turno : null;
}

function getNomeDaTurma(turmaId) {
  const t = turmas.find(t => t.id === turmaId);
  return t? t.nome : 'Turma removida';
}

function renderProf() {
  try {
    let prof = professores;

    if (filtroTurno!== 'Todos') {
      prof = prof.filter(p => p.turmaIds && p.turmaIds.some(tid => getTurnoDaTurma(tid) === filtroTurno));
    }

    if (termoBusca) {
      prof = prof.filter(f =>
        f.nome.toLowerCase().includes(termoBusca) ||
        f.disciplina.toLowerCase().includes(termoBusca) ||
        f.bi.toLowerCase().includes(termoBusca) ||
        f.departamento.toLowerCase().includes(termoBusca)
      );
    }

    document.getElementById('totalProf').textContent = prof.length;
    document.getElementById('ativosProf').textContent = prof.length;
    const disciplinas = [...new Set(prof.map(p => p.disciplina))];
    document.getElementById('totalDisciplinas').textContent = disciplinas.length;

    if (prof.length === 0) {
      container.innerHTML = `<p style="padding:32px;color:var(--secondary-color)">Nenhum professor ${filtroTurno!== 'Todos'? 'no turno ' + filtroTurno : 'cadastrado'}.</p>`;
      return;
    }

    container.innerHTML = prof.map((p, i) => {
      const turmasComTurno = p.turmaIds && p.turmaIds.length
     ? p.turmaIds.map(tid => {
          const nome = getNomeDaTurma(tid);
          const turno = getTurnoDaTurma(tid);
          return turno? `${nome} <span class="badge turno">${turno}</span>` : nome;
        }).join(', ')
      : 'Nenhuma';

      return `
      <div class="project-box-wrapper">
        <div class="project-box" style="background-color: ${cores[i % cores.length]};">
          <div class="project-box-header">
            <span>${p.disciplina}</span>
            <div style="display:flex; gap:6px">
              <button class="project-btn-more" onclick="editarProf('${p.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
              <button class="project-btn-more" onclick="removerProf('${p.id}')" title="Remover"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="project-box-content-header">
            <p class="box-content-header">${p.nome}</p>
            <p class="box-content-subheader">${p.contrato} - ${p.ano}</p>
          </div>
          <div class="box-progress-wrapper">
            <p class="box-progress-header">Contato</p>
            <p class="box-progress-percentage">${p.contato || 'Não informado'}</p>
          </div>
          <div class="project-box-footer">
            <div class="participants">
              <img src="${p.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.nome)}" alt="foto">
            </div>
            <div class="days-left" style="color: #fff; font-size: 12px;">
              Turmas: ${turmasComTurno}
            </div>
          </div>
        </div>
      </div>
      `;
    }).join('');
    lucide.createIcons();
  } catch (e) {
    console.error('Erro ao renderizar professores:', e);
    container.innerHTML = '<p style="padding: 32px; color: red;">Erro ao carregar. F12 pra ver detalhes.</p>';
  }
}

function carregarTurmas(checkboxesMarcados = []) {
  const div = document.getElementById('turmasCheckboxes');
  div.innerHTML = turmas.length === 0
 ? '<p style="font-size:12px;color:var(--secondary-color)">Cadastre turmas primeiro</p>'
    : turmas.map(t => `
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" value="${t.id}" ${checkboxesMarcados.includes(t.id)? 'checked' : ''}>
        ${t.nome} <span class="badge turno">${t.turno}</span>
      </label>
    `).join('');
}

function limparFormulario() {
  document.getElementById('nomeProf').value = '';
  document.getElementById('discProf').value = '';
  document.getElementById('contatoProf').value = '';
  document.getElementById('formacaoProf').value = '';
  document.getElementById('fotoProf').value = '';
  document.getElementById('anoProf').value = '2024';
  document.getElementById('contratoProf').value = 'Efetivo';
  document.getElementById('nascProf').value = '';
  document.getElementById('admissaoProf').value = '';
  document.getElementById('endProf').value = '';
  document.getElementById('statusProf').value = 'ativo';
  editandoId = null;
}

async function salvarProfessor() {
  const btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeProf').value.trim();
  const disciplina = document.getElementById('discProf').value.trim();
  const formacao = document.getElementById('formacaoProf').value.trim();

  if (!nome ||!disciplina ||!formacao) {
    alert('Preencha Nome, Disciplina e Formação');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    const turmaIds = [...document.querySelectorAll('#turmasCheckboxes input:checked')].map(c => c.value);
    
    const dadosProf = {
      nome,
      bi: document.getElementById('biProf')?.value.trim() || '',
      contato: document.getElementById('contatoProf').value.trim(),
      disciplina,
      formacao,
      contrato: document.getElementById('contratoProf').value,
      foto: document.getElementById('fotoProf').value.trim(),
      ano: document.getElementById('anoProf').value,
      dataNasc: document.getElementById('nascProf').value,
      dataAdmissao: document.getElementById('admissaoProf').value,
      endereco: document.getElementById('endProf').value.trim(),
      status: document.getElementById('statusProf').value,
      turmaIds,
      escolaId: userAtual.escolaId,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'professores', editandoId), dadosProf);
    } else {
      // Verifica nome duplicado
      if (professores.some(p => p.nome.toLowerCase() === nome.toLowerCase())) {
        alert('Já existe um professor com este nome');
        btn.disabled = false;
        btn.innerHTML = 'Salvar';
        return;
      }
      dadosProf.criadoEm = new Date().toISOString();
      await addDoc(collection(db, 'professores'), dadosProf);
    }

    modal.classList.remove('active');
    limparFormulario();
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

window.editarProf = function(id) {
  const p = professores.find(p => p.id === id);
  if (!p) return;
  editandoId = id;

  document.getElementById('modalTitle').textContent = 'Editar Professor';
  document.getElementById('nomeProf').value = p.nome;
  document.getElementById('biProf').value = p.bi || '';
  document.getElementById('contatoProf').value = p.contato || '';
  document.getElementById('discProf').value = p.disciplina;
  document.getElementById('formacaoProf').value = p.formacao;
  document.getElementById('contratoProf').value = p.contrato;
  document.getElementById('fotoProf').value = p.foto || '';
  document.getElementById('anoProf').value = p.ano;
  document.getElementById('nascProf').value = p.dataNasc || '';
  document.getElementById('admissaoProf').value = p.dataAdmissao || '';
  document.getElementById('endProf').value = p.endereco || '';
  document.getElementById('statusProf').value = p.status;

  carregarTurmas(p.turmaIds || []);
  modal.classList.add('active');
};

window.removerProf = async function(id) {
  if (confirm('Remover este professor?')) {
    try {
      await deleteDoc(doc(db, 'professores', id));
    } catch (err) {
      alert('Erro ao remover.');
      console.error(err);
    }
  }
};

async function gerarPdfFolha() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const funcAtivos = professores.filter(f => f.status === 'ativo');
  if (funcAtivos.length === 0) {
    alert('Nenhum professor ativo para gerar folha');
    return;
  }

  const nomeEscola = escolaAtual?.config?.escola?.nome || 'EduGest';
  const dataAtual = new Date().toLocaleDateString('pt-AO');
  const mesAno = new Date().toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' });

  doc.setFontSize(18);
  doc.text(nomeEscola, 105, 15, { align: 'center' });
  doc.setFontSize(14);
  doc.text(`Folha de Pagamento - ${mesAno}`, 105, 23, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Emitido em: ${dataAtual}`, 105, 29, { align: 'center' });

  const totalSalarios = funcAtivos.reduce((sum, f) => sum + (f.salario || 0), 0);

  doc.autoTable({
    startY: 35,
    head: [['Nº', 'Nome', 'Cargo', 'Departamento', 'Salário (KZ)']],
    body: funcAtivos.map((f, i) => [
      i + 1,
      f.nome,
      f.cargo,
      f.departamento,
      Number(f.salario || 0).toLocaleString('pt-AO')
    ]),
    foot: [['', '', '', 'TOTAL:', totalSalarios.toLocaleString('pt-AO') + ' KZ']],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] },
    footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10 },
      4: { halign: 'right' }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(10);
  doc.text('_________________________', 30, finalY);
  doc.text('Diretor', 50, finalY + 5);
  doc.text('_________________________', 130, finalY);
  doc.text('Financeiro', 148, finalY + 5);

  doc.save(`Folha_Pagamento_${mesAno.replace(' ', '_')}.pdf`);
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
      alert('Acesso negado. Apenas diretores podem acessar Funcionários.');
      window.location.href = 'dashboard.html';
    }
  }
}

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

window.addEventListener('beforeunload', () => {
  unsubProf?.();
  unsubTurmas?.();
});