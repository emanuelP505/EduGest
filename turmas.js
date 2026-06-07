import { auth, db } from 'firebase-config.js';
import { 
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let editandoId = null;
let filtroTurno = 'Todos';
let turmas = [], cursos = [], estudantes = [], disciplinas = [];
let escolaAtual = null;
let unsubTurmas, unsubCursos, unsubEstudantes, unsubDisciplinas, unsubEscola;

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
    iniciarTurmas();
  });
});

function iniciarTurmas() {
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

  // FILTRO
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroTurno = btn.dataset.turno;
      renderTurmas();
    };
  });

  // CRUD
  document.getElementById('btnAddTurma').onclick = () => {
    editandoId = null;
    document.getElementById('modalTitle').textContent = 'Nova Turma';
    limparForm();
    if (!carregarCursosSelect()) {
      alert('Cadastre pelo menos 1 curso em "Cursos" antes de criar turmas');
      return;
    }
    modal.classList.add('active');
  };

  document.getElementById('btnCancelarTurma').onclick = () => {
    modal.classList.remove('active');
    limparForm();
  };

  document.getElementById('btnSalvarTurma').onclick = salvarTurma;

  escutarDados();
}

const cores = ['var(--card-1)', 'var(--card-2)', 'var(--card-3)', 'var(--card-4)', 'var(--card-5)', 'var(--card-6)'];
const modal = document.getElementById('modalTurma');
const container = document.getElementById('turmaContainer');

function escutarDados() {
  const escolaId = userAtual.escolaId;

  // ESCOLA
  unsubEscola = onSnapshot(doc(db, 'escolas', escolaId), (snap) => {
    if (snap.exists()) escolaAtual = snap.data();
  });

  // TURMAS
  unsubTurmas = onSnapshot(
    query(collection(db, 'turmas'), where('escolaId', '==', escolaId)),
    (snap) => {
      turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderTurmas();
    }
  );

  // CURSOS
  unsubCursos = onSnapshot(
    query(collection(db, 'cursos'), where('escolaId', '==', escolaId)),
    (snap) => {
      cursos = snap.docs.map(d => ({ id: d.id,...d.data() }));
    }
  );

  // ESTUDANTES
  unsubEstudantes = onSnapshot(
    query(collection(db, 'estudantes'), where('escolaId', '==', escolaId)),
    (snap) => {
      estudantes = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderTurmas();
    }
  );

  // DISCIPLINAS
  unsubDisciplinas = onSnapshot(
    query(collection(db, 'disciplinas'), where('escolaId', '==', escolaId)),
    (snap) => {
      disciplinas = snap.docs.map(d => ({ id: d.id,...d.data() }));
    }
  );
}

function getNomeCurso(cursoId) {
  const c = cursos.find(c => String(c.id) === String(cursoId));
  return c? c.nome : 'Curso não definido';
}

function carregarCursosSelect() {
  const select = document.getElementById('cursoTurma');
  if (cursos.length === 0) {
    select.innerHTML = '<option value="">Cadastre um curso primeiro</option>';
    return false;
  }
  select.innerHTML = cursos.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  return true;
}

function calcularStats(turmas, estudantes) {
  const totalAlunos = estudantes.length;
  const ocupacaoMedia = turmas.length? Math.round(
    turmas.reduce((s, t) => {
      const alunos = estudantes.filter(e => String(e.turmaId) === String(t.id)).length;
      return s + (t.vagas > 0? alunos / t.vagas : 0);
    }, 0) / turmas.length * 100
  ) : 0;
  return { total: turmas.length, alunos: totalAlunos, ocupacao: ocupacaoMedia };
}

function renderTurmas() {
  try {
    const turmasFiltradas = filtroTurno === 'Todos'
   ? turmas
      : turmas.filter(t => t.turno === filtroTurno);

    const stats = calcularStats(turmasFiltradas, estudantes);

    if (turmasFiltradas.length === 0) {
      container.innerHTML = `<p style="padding: 32px; color: var(--secondary-color);">Nenhuma turma ${filtroTurno!== 'Todos'? 'no turno ' + filtroTurno : 'cadastrada'}.</p>`;
    } else {
      container.innerHTML = turmasFiltradas.map((t, i) => {
        const alunosNaTurma = estudantes.filter(e => String(e.turmaId) === String(t.id)).length;
        const ocupacao = t.vagas > 0? Math.round((alunosNaTurma / t.vagas) * 100) : 0;
        const corBarra = ocupacao >= 100? '#16a34a' : ocupacao >= 80? '#2563eb' : '#ca8a04';

        return `
        <div class="project-box-wrapper">
          <div class="project-box" style="background-color: ${cores[i % cores.length]};">
            <div class="project-box-header">
              <div style="display:flex; gap:8px; align-items:center">
                <span>${t.ano}</span>
                ${t.turno? `<span class="badge turno">${t.turno}</span>` : ''}
              </div>
              <div style="display:flex; gap:6px">
                <button class="project-btn-more" onclick="gerarPautaTurma('${t.id}')" title="Imprimir Pauta"><i data-lucide="file-text"></i></button>
                <button class="project-btn-more" onclick="editarTurma('${t.id}')" title="Editar"><i data-lucide="edit-3"></i></button>
                <button class="project-btn-more" onclick="removerTurma('${t.id}')" title="Remover"><i data-lucide="trash-2"></i></button>
              </div>
            </div>
            <div class="project-box-content-header">
              <p class="box-content-header">${t.nome}</p>
              <p class="box-content-subheader">${getNomeCurso(t.cursoId)}</p>
            </div>
            <div class="box-progress-wrapper">
              <p class="box-progress-header">Ocupação</p>
              <div class="box-progress-bar">
                <span class="box-progress" style="width: ${ocupacao}%; background-color: ${corBarra}"></span>
              </div>
              <p class="box-progress-percentage">${alunosNaTurma} / ${t.vagas} alunos</p>
            </div>
            <div class="project-box-footer">
              <div class="days-left" style="color:#fff;">
                Propina: ${Number(t.propina || 0).toLocaleString()} KZ
              </div>
            </div>
          </div>
        </div>
        `;
      }).join('');
      lucide.createIcons();
    }

    document.getElementById('totalTurmas').textContent = stats.total;
    document.getElementById('totalAlunos').textContent = stats.alunos;
    document.getElementById('ocupacaoMedia').textContent = stats.ocupacao + '%';

  } catch (e) {
    console.error('Erro ao renderizar turmas:', e);
    container.innerHTML = '<p style="padding: 32px; color: red;">Erro ao carregar turmas. Abra F12 pra ver detalhes.</p>';
  }
}

function limparForm() {
  document.getElementById('nomeTurma').value = '';
  document.getElementById('vagasTurma').value = '35';
  document.getElementById('propinaTurma').value = '15000';
  document.getElementById('anoTurma').value = '2025/2026';
  document.getElementById('turnoTurma').value = 'Manhã';
  editandoId = null;
}

async function salvarTurma() {
  const btn = document.getElementById('btnSalvarTurma');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeTurma').value.trim();
  const cursoId = document.getElementById('cursoTurma').value;
  const turno = document.getElementById('turnoTurma').value;
  const vagas = parseInt(document.getElementById('vagasTurma').value);
  const propina = parseInt(document.getElementById('propinaTurma').value) || 0;
  const ano = document.getElementById('anoTurma').value.trim();

  if (!nome ||!cursoId ||!vagas || ano === '' ||!turno) {
    alert('Preencha todos os campos');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    if (turmas.some((t) =>
      t.nome.toLowerCase() === nome.toLowerCase() &&
      t.ano === ano &&
      t.turno === turno &&
      String(t.id)!== String(editandoId)
    )) {
      alert('Já existe uma turma com este nome neste ano e turno');
      btn.disabled = false;
      btn.innerHTML = 'Salvar';
      return;
    }

    const dadosTurma = {
      nome,
      cursoId: String(cursoId),
      turno,
      vagas,
      propina,
      ano,
      escolaId: userAtual.escolaId,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'turmas', editandoId), dadosTurma);
    } else {
      dadosTurma.criadoEm = new Date().toISOString();
      await addDoc(collection(db, 'turmas'), dadosTurma);
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

window.editarTurma = function(id) {
  const t = turmas.find(t => String(t.id) === String(id));
  if (!t) return;
  editandoId = id;

  document.getElementById('modalTitle').textContent = 'Editar Turma';
  document.getElementById('nomeTurma').value = t.nome;
  carregarCursosSelect();
  document.getElementById('cursoTurma').value = t.cursoId;
  document.getElementById('turnoTurma').value = t.turno || 'Manhã';
  document.getElementById('vagasTurma').value = t.vagas;
  document.getElementById('propinaTurma').value = t.propina;
  document.getElementById('anoTurma').value = t.ano;

  modal.classList.add('active');
};

window.removerTurma = async function(id) {
  if (confirm('Remover esta turma?')) {
    if (estudantes.some(e => String(e.turmaId) === String(id))) {
      alert('Não é possível remover turma com alunos matriculados');
      return;
    }
    try {
      await deleteDoc(doc(db, 'turmas', id));
    } catch (err) {
      alert('Erro ao remover.');
      console.error(err);
    }
  }
};

window.gerarPautaTurma = async function(turmaId) {
  const btn = event.target.closest('button');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i>';
  lucide.createIcons();

  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const estudantesTurma = estudantes.filter(e => String(e.turmaId) === String(turmaId));
    const turma = turmas.find(t => String(t.id) === String(turmaId));
    const anoLetivoAtual = escolaAtual?.config?.ano?.letivo || '2025/2026';

    if (!turma) {
      alert('Turma não encontrada');
      return;
    }

    if (estudantesTurma.length === 0) {
      alert('Esta turma não possui alunos matriculados');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    const margem = 15;
    let y = 20;

    if (escolaAtual?.config?.escola?.logo && escolaAtual.config.escola.logo.length < 500000) {
      try {
        doc.addImage(escolaAtual.config.escola.logo, 'PNG', 15, 12, 20, 20, undefined, 'FAST');
      } catch(e) {
        console.log('Logo falhou');
      }
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(escolaAtual?.config?.escola?.nome || 'MINISTÉRIO DA EDUCAÇÃO', 148, y, { align: 'center' });
    y += 7;
    doc.setFontSize(12);
    doc.text(escolaAtual?.config?.escola?.endereco || 'ESCOLA', 148, y, { align: 'center' });
    y += 10;
    doc.setFontSize(14);
    doc.text(`PAUTA DE FREQUÊNCIA E APROVEITAMENTO`, 148, y, { align: 'center' });
    y += 7;
    doc.setFontSize(12);
    doc.text(`Turma: ${turma.nome} | Ano Letivo: ${anoLetivoAtual}`, 148, y, { align: 'center' });
    y += 10;

    const dadosTabela = estudantesTurma.map((est, idx) => {
      const linha = [idx + 1, est.nome.substring(0, 35)];
      let somaMF = 0, countTrim = 0;

      ['1º Trimestre', '2º Trimestre', '3º Trimestre'].forEach(trim => {
        let somaDisc = 0, countDisc = 0;
        disciplinas.forEach(d => {
          const n = est.notas?.[anoLetivoAtual]?.[trim]?.[d.nome];
          if (n && (n.mac > 0 || n.pp > 0 || n.pt > 0)) {
            const media = n.mac*0.4 + n.pp*0.3 + n.pt*0.3;
            somaDisc += media;
            countDisc++;
          }
        });
        const mediaTrim = countDisc > 0? (somaDisc/countDisc) : 0;
        linha.push(mediaTrim > 0? mediaTrim.toFixed(1) : '-');
        if (mediaTrim > 0) {
          somaMF += mediaTrim;
          countTrim++;
        }
      });

      const mf = countTrim > 0? (somaMF / countTrim).toFixed(1) : '0.0';
      linha.push(mf);
      linha.push(parseFloat(mf) >= 10? 'APROVADO' : 'REPROVADO');

      return linha;
    });

    doc.autoTable({
      startY: y,
      head: [['Nº', 'NOME DO ALUNO', '1º TRIM', '2º TRIM', '3º TRIM', 'MF', 'RESULTADO']],
      body: dadosTabela,
      theme: 'grid',
      headStyles: { 
        fillColor: [37, 99, 235], 
        fontSize: 9,
        halign: 'center',
        textColor: 255
      },
      styles: { 
        fontSize: 8, 
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 85 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: function(data) {
        if (data.column.index === 6) {
          if (data.cell.text[0] === 'APROVADO') {
            data.cell.styles.textColor = [22, 163, 74];
          } else if (data.cell.text[0] === 'REPROVADO') {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
      margin: { left: margem, right: margem }
    });

    y = doc.lastAutoTable.finalY + 15;

    doc.line(margem, y, 80, y);
    doc.line(115, y, 185, y);
    doc.line(220, y, 280, y);
    y += 5;
    doc.setFontSize(9);
    doc.text('Director de Turma', margem + 15, y);
    doc.text('Secretário(a)', 115 + 20, y);
    doc.text('O(A) Director(a)', 220 + 15, y);

    y += 12;
    doc.text(`Luanda, ${new Date().toLocaleDateString('pt-AO')}`, 148, y, { align: 'center' });

    doc.save(`Pauta_${turma.nome.replace(/\s+/g, '_')}_${anoLetivoAtual.replace('/', '-')}.pdf`);

  } catch (e) {
    console.error('Erro ao gerar pauta:', e);
    alert('Erro ao gerar PDF. Verifica se jspdf e autotable estão carregados.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
  }
}

function aplicarPermissoes(perfil) {
  const paginasSoDiretor = ['funcionarios.html', 'config.html', 'disciplina.html'];
  const paginaAtual = window.location.pathname.split('/').pop();
  
  if (perfil === 'secretario' && paginasSoDiretor.includes(paginaAtual)) {
    alert('Acesso negado. Redirecionando...');
    window.location.href = 'dashboard.html';
    return;
  }
  
  if (perfil === 'secretario') {
    paginasSoDiretor.forEach(pagina => {
      const link = document.querySelector(`a[href="${pagina}"]`);
      if (link) link.remove();
    });
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
  unsubTurmas?.();
  unsubCursos?.();
  unsubEstudantes?.();
  unsubDisciplinas?.();
  unsubEscola?.();
});