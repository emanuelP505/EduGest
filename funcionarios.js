import { auth, db } from './firebase-config.js';
import {
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let editandoId = null;
let filtroStatus = 'Todos';
let termoBusca = '';
let searchTimeout = null;
let funcionarios = [];
let unsubFunc, unsubEscola;
let escolaAtual = null;

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
          iniciarFuncionarios();
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

    iniciarFuncionarios();
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

function iniciarFuncionarios() {
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

  // BUSCA COM DEBOUNCE
  document.getElementById('searchFunc').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      termoBusca = e.target.value.toLowerCase().trim();
      renderFunc();
    }, 300);
  });

  // PDF FOLHA
  document.getElementById('btnPdfFolha').onclick = () => {
    if (!navigator.onLine) {
      alert('Função indisponível offline');
      return;
    }
    document.getElementById('btnPdfFolha').disabled = true;
    document.getElementById('btnPdfFolha').innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Gerando...';
    lucide.createIcons();

    setTimeout(() => {
      gerarPdfFolha();
      document.getElementById('btnPdfFolha').disabled = false;
      document.getElementById('btnPdfFolha').innerHTML = '<i data-lucide="file-text"></i><span style="font-size:13px;font-weight:600;">pdf</span>';
      lucide.createIcons();
    }, 100);
  };

  // CRUD FUNCIONÁRIOS - SÓ DIRETOR
  if (userAtual.perfil === 'diretor') {
    document.getElementById('btnAddFunc').style.display = 'flex';
    document.getElementById('btnAddFunc').onclick = () => {
      if (!navigator.onLine) {
        alert('Cadastros indisponíveis offline');
        return;
      }
      editandoId = null;
      document.getElementById('modalTitle').textContent = 'Novo Funcionário';
      limparForm();
      modal.classList.add('active');
    };
  }

  document.getElementById('btnCancelar').onclick = () => {
    modal.classList.remove('active');
    limparForm();
  };

  document.getElementById('btnSalvar').onclick = salvarFuncionario;

  // FILTRO
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroStatus = btn.dataset.filtro;
      renderFunc();
    };
  });

  escutarDados();
}

const cores = ['var(--card-1)', 'var(--card-2)', 'var(--card-3)', 'var(--card-4)', 'var(--card-5)', 'var(--card-6)'];
const modal = document.getElementById('modalFunc');

function escutarDados() {
  const escolaId = userAtual.escolaId;

  unsubEscola = onSnapshot(doc(db, 'escolas', escolaId), (snap) => {
    if (snap.exists()) {
      escolaAtual = snap.data();
      // TRAVA EM TEMPO REAL SE CONGELAR
      if (escolaAtual.ativo === false && navigator.onLine) {
        window.location.href = 'bloqueado.html';
        return;
      }
    }
  }, (error) => {
    if (error.code === 'permission-denied' && navigator.onLine) {
      window.location.href = 'bloqueado.html';
    }
  });

  unsubFunc = onSnapshot(
    query(collection(db, 'funcionarios'), where('escolaId', '==', escolaId)),
    (snap) => {
      funcionarios = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderFunc();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );
}

function calcularIdade(dataNasc) {
  if (!dataNasc) return '';
  const hoje = new Date();
  const nasc = new Date(dataNasc);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function calcularTempoCasa(dataAdmissao) {
  if (!dataAdmissao) return '';
  const hoje = new Date();
  const adm = new Date(dataAdmissao);
  let anos = hoje.getFullYear() - adm.getFullYear();
  const m = hoje.getMonth() - adm.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < adm.getDate())) anos--;
  return anos + ' ano' + (anos!== 1? 's' : '');
}

function renderFunc() {
  let func = funcionarios;

  if (filtroStatus!== 'Todos') {
    func = func.filter(f => f.status === filtroStatus);
  }

  if (termoBusca) {
    func = func.filter(f =>
      f.nome.toLowerCase().includes(termoBusca) ||
      f.cargo.toLowerCase().includes(termoBusca) ||
      f.bi?.toLowerCase().includes(termoBusca) ||
      f.departamento.toLowerCase().includes(termoBusca)
    );
  }

  const container = document.getElementById('funcContainer');
  const ehDiretor = userAtual.perfil === 'diretor';

  if (func.length === 0) {
    container.innerHTML = `<p style="padding: 32px; color: var(--secondary-color);">Nenhum funcionário encontrado.</p>`;
  } else {
    container.innerHTML = func.map((f, i) => {
      const statusMap = {
        ativo: { color: '#16a34a', text: 'Ativo', class: 'ativo' },
        ferias: { color: '#ca8a04', text: 'Férias', class: 'ferias' },
        inativo: { color: '#dc2626', text: 'Inativo', class: 'inativo' }
      };
      const st = statusMap[f.status] || statusMap.inativo;
      const idade = calcularIdade(f.dataNasc);
      const tempoCasa = calcularTempoCasa(f.dataAdmissao);

      return `
      <div class="project-box-wrapper">
        <div class="project-box" style="background-color: ${cores[i % cores.length]};">
          <div class="project-box-header">
            <div style="display:flex; gap:6px; align-items:center">
              <span>${f.departamento}</span>
              <span class="badge status ${st.class}">${st.text}</span>
            </div>
            ${ehDiretor ? `
            <div style="display:flex; gap:6px">
              <button class="project-btn-more" onclick="editarFunc('${f.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
              <button class="project-btn-more" onclick="removerFunc('${f.id}')" title="Remover"><i data-lucide="trash-2"></i></button>
            </div>
            ` : ''}
          </div>
          <div class="project-box-content-header">
            <p class="box-content-header">${f.nome}</p>
            <p class="box-content-subheader">${f.cargo} - ${f.contrato}</p>
          </div>
          <div class="box-progress-wrapper">
            <p class="box-progress-header">Salário Base</p>
            <p class="box-progress-percentage">${Number(f.salario || 0).toLocaleString('pt-AO')} KZ</p>
          </div>
          <div class="project-box-footer">
            <div class="participants">
              <img src="${f.foto || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(f.nome)}" alt="foto">
            </div>
            <div class="days-left" style="color: #fff; font-size: 12px;">
              ${idade ? idade + ' anos' : ''} ${tempoCasa ? '• ' + tempoCasa : ''}
            </div>
          </div>
        </div>
      </div>
      `;
    }).join('');
    lucide.createIcons();
  }

  const ativos = funcionarios.filter(f => f.status === 'ativo').length;
  const ferias = funcionarios.filter(f => f.status === 'ferias').length;
  document.getElementById('totalFunc').textContent = funcionarios.length;
  document.getElementById('ativosFunc').textContent = ativos;
  document.getElementById('feriasFunc').textContent = ferias;
}

function limparForm() {
  document.getElementById('nomeFunc').value = '';
  document.getElementById('biFunc').value = '';
  document.getElementById('telFunc').value = '';
  document.getElementById('emailFunc').value = '';
  document.getElementById('deptFunc').value = 'RH';
  document.getElementById('cargoFunc').value = '';
  document.getElementById('salarioFunc').value = '0';
  document.getElementById('contratoFunc').value = 'Efetivo';
  document.getElementById('nascFunc').value = '';
  document.getElementById('admissaoFunc').value = '';
  document.getElementById('endFunc').value = '';
  document.getElementById('statusFunc').value = 'ativo';
  document.getElementById('fotoFunc').value = '';
  editandoId = null;
}

async function salvarFuncionario() {
  if (!navigator.onLine) {
    alert('Sem conexão. Não é possível salvar.');
    return;
  }

  if (userAtual.perfil!== 'diretor') {
    alert('Apenas diretores podem cadastrar funcionários');
    return;
  }

  const btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeFunc').value.trim();
  const bi = document.getElementById('biFunc').value.trim();
  const cargo = document.getElementById('cargoFunc').value.trim();
  const email = document.getElementById('emailFunc').value.trim();

  if (!nome ||!cargo ||!email) {
    alert('Preencha Nome, Cargo e Email');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    const dadosFunc = {
      nome,
      bi,
      telefone: document.getElementById('telFunc').value.trim(),
      email,
      departamento: document.getElementById('deptFunc').value,
      cargo,
      salario: parseInt(document.getElementById('salarioFunc').value) || 0,
      contrato: document.getElementById('contratoFunc').value,
      dataNasc: document.getElementById('nascFunc').value,
      dataAdmissao: document.getElementById('admissaoFunc').value,
      endereco: document.getElementById('endFunc').value.trim(),
      status: document.getElementById('statusFunc').value,
      foto: document.getElementById('fotoFunc').value.trim(),
      escolaId: userAtual.escolaId,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'funcionarios', editandoId), dadosFunc);
      alert('Funcionário atualizado!');
    } else {
      if (bi && funcionarios.some(f => f.bi === bi)) {
        alert('Já existe um funcionário com este BI');
        btn.disabled = false;
        btn.innerHTML = 'Salvar';
        return;
      }
      dadosFunc.criadoEm = new Date().toISOString();
      await addDoc(collection(db, 'funcionarios'), dadosFunc);
      alert('Funcionário cadastrado! Agora crie o login dele no Painel Admin.');
    }

    modal.classList.remove('active');
    limparForm();
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

window.editarFunc = function(id) {
  if (!navigator.onLine) {
    alert('Edição indisponível offline');
    return;
  }
  if (userAtual.perfil!== 'diretor') return alert('Apenas diretores podem editar');
  const f = funcionarios.find(f => f.id === id);
  if (!f) return;
  editandoId = id;

  document.getElementById('modalTitle').textContent = 'Editar Funcionário';
  document.getElementById('nomeFunc').value = f.nome;
  document.getElementById('biFunc').value = f.bi || '';
  document.getElementById('telFunc').value = f.telefone || '';
  document.getElementById('emailFunc').value = f.email || '';
  document.getElementById('deptFunc').value = f.departamento;
  document.getElementById('cargoFunc').value = f.cargo;
  document.getElementById('salarioFunc').value = f.salario || 0;
  document.getElementById('contratoFunc').value = f.contrato || 'Efetivo';
  document.getElementById('nascFunc').value = f.dataNasc || '';
  document.getElementById('admissaoFunc').value = f.dataAdmissao || '';
  document.getElementById('endFunc').value = f.endereco || '';
  document.getElementById('statusFunc').value = f.status;
  document.getElementById('fotoFunc').value = f.foto || '';

  modal.classList.add('active');
};

window.removerFunc = async function(id) {
  if (!navigator.onLine) {
    alert('Remoção indisponível offline');
    return;
  }
  if (userAtual.perfil!== 'diretor') return alert('Apenas diretores podem remover');
  if (confirm('Remover este funcionário? Isso não apaga o login dele.')) {
    try {
      await deleteDoc(doc(db, 'funcionarios', id));
    } catch (err) {
      alert('Erro ao remover.');
      console.error(err);
    }
  }
};

async function gerarPdfFolha() {
  if (!navigator.onLine) {
    alert('Geração de PDF indisponível offline');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const funcAtivos = funcionarios.filter(f => f.status === 'ativo');
  if (funcAtivos.length === 0) {
    alert('Nenhum funcionário ativo para gerar folha');
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
  unsubFunc?.();
  unsubEscola?.();
});