import { auth, db } from 'firebase-config.js';
import { 
  doc, getDoc, collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let editandoId = null;
let alunoNotasId = null;
let alunoPropinaId = null;
let userAtual = null;
let escolaAtual = null;
let trimestreAtual = '1º Trimestre';
let anoLetivoAtual = '2025/2026';
let todosEstudantes = [], turmas = [], disciplinas = [];
let unsubEstudantes, unsubTurmas, unsubDisciplinas, unsubEscola;

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
    iniciarEstudantes();
  });
});

function iniciarEstudantes() {
  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Sair?\n${userAtual.nome} - ${userAtual.perfil}`)) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);
  
  // Escuta dados
  escutarDados();

  document.getElementById('btnNovoEstudante').onclick = abrirModalNovo;
  document.getElementById('btnSalvarNotas').onclick = salvarNotas;
  document.getElementById('btnImprimirBoletim').onclick = () => {
    if (alunoNotasId) {
      const btn = document.getElementById('btnImprimirBoletim');
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Gerando...';
      lucide.createIcons();
      setTimeout(() => {
        gerarBoletim(alunoNotasId);
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="printer"></i> Imprimir Boletim';
        lucide.createIcons();
      }, 100);
    }
  };
  document.getElementById('btnSalvarPropina').onclick = salvarPropina;

  // BUSCA DE ESTUDANTES
  const inputBusca = document.getElementById('buscaEstudante');
  inputBusca.addEventListener('input', (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const filtrados =!termo? todosEstudantes : todosEstudantes.filter(est => {
      const turma = turmas.find(t => String(t.id) === String(est.turmaId));
      const nomeTurma = turma? turma.nome.toLowerCase() : '';
      return est.nome.toLowerCase().includes(termo) ||
             est.bi.toLowerCase().includes(termo) ||
             nomeTurma.includes(termo);
    });
    renderTabelaEstudantes(filtrados);
  });

  // IMPORTAÇÃO EXCEL
  document.getElementById('btnImportar').onclick = () => {
    document.getElementById('inputExcel').click();
  };
  document.getElementById('btnBaixarModelo').onclick = baixarModeloExcel;
  document.getElementById('inputExcel').addEventListener('change', importarExcel);
}

function escutarDados() {
  const escolaId = userAtual.escolaId;

  // ESCOLA - pra pegar ano/trimestre
  unsubEscola = onSnapshot(doc(db, 'escolas', escolaId), (snap) => {
    if (snap.exists()) {
      escolaAtual = snap.data();
      trimestreAtual = escolaAtual.config?.ano?.trimestre || '1º Trimestre';
      anoLetivoAtual = escolaAtual.config?.ano?.letivo || '2025/2026';
    }
  });

  // ESTUDANTES
  unsubEstudantes = onSnapshot(
    query(collection(db, 'estudantes'), where('escolaId', '==', escolaId)),
    (snap) => {
      todosEstudantes = snap.docs.map(d => ({ id: d.id,...d.data() }));
      renderTabelaEstudantes(todosEstudantes);
    }
  );

  // TURMAS
  unsubTurmas = onSnapshot(
    query(collection(db, 'turmas'), where('escolaId', '==', escolaId)),
    (snap) => {
      turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
      carregarTurmasSelect();
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

function carregarTurmasSelect() {
  const select = document.getElementById('turmaEst');
  select.innerHTML = '<option value="">Selecione a turma</option>' +
    turmas.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
}

function renderTabelaEstudantes(lista) {
  const tbody = document.getElementById('tbodyEstudantes');

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--secondary-color);padding:40px">Nenhum estudante encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(e => {
    const turma = turmas.find(t => String(t.id) === String(e.turmaId));
    const statusPropina = calcularStatusPropina(e);
    return `
      <tr>
        <td>${e.nome}</td>
        <td>${e.bi}</td>
        <td>${turma? turma.nome : 'N/A'}</td>
        <td><span class="badge ${statusPropina}">${statusPropina === 'green'? 'Em Dia' : 'Em Atraso'}</span></td>
        <td>
          <button class="project-btn-more" onclick="abrirNotas('${e.id}')" title="Notas"><i data-lucide="book-open"></i></button>
          <button class="project-btn-more" onclick="abrirPropina('${e.id}')" title="Propinas"><i data-lucide="dollar-sign"></i></button>
          <button class="project-btn-more" onclick="editarEstudante('${e.id}')" title="Editar"><i data-lucide="edit"></i></button>
          <button class="project-btn-more" onclick="excluirEstudante('${e.id}')" title="Excluir"><i data-lucide="trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function calcularStatusPropina(est) {
  const propinas = est.propinas || {};
  const ano = anoLetivoAtual.split('/')[0];
  const propinasAno = propinas[ano] || {};
  const mesesPagos = Object.values(propinasAno).filter(v => v === true).length;
  const mesAtual = new Date().getMonth() + 1;
  const mesesDevidos = Math.max(0, mesAtual - 8);
  return mesesPagos >= mesesDevidos? 'green' : 'red';
}

function abrirModalNovo() {
  editandoId = null;
  document.getElementById('modalTitle').textContent = 'Novo Estudante';
  document.getElementById('nomeEst').value = '';
  document.getElementById('biEst').value = '';
  document.getElementById('turmaEst').value = '';
  document.getElementById('encEst').value = '';
  document.getElementById('telEst').value = '';
  document.getElementById('modalEstudante').classList.add('active');
}

function editarEstudante(id) {
  const est = todosEstudantes.find(e => String(e.id) === String(id));
  if (!est) return;

  editandoId = id;
  document.getElementById('modalTitle').textContent = 'Editar Estudante';
  document.getElementById('nomeEst').value = est.nome;
  document.getElementById('biEst').value = est.bi;
  document.getElementById('turmaEst').value = est.turmaId;
  document.getElementById('encEst').value = est.encarregado || '';
  document.getElementById('telEst').value = est.telefone || '';
  document.getElementById('modalEstudante').classList.add('active');
}

window.salvarEstudante = async function() {
  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  const nome = document.getElementById('nomeEst').value.trim();
  const bi = document.getElementById('biEst').value.trim();
  const turmaId = document.getElementById('turmaEst').value;

  if (!nome ||!bi ||!turmaId) {
    alert('Preencha nome, BI e turma');
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
    return;
  }

  try {
    const dadosEst = {
      nome,
      bi,
      turmaId,
      encarregado: document.getElementById('encEst').value.trim(),
      telefone: document.getElementById('telEst').value.trim(),
      escolaId: userAtual.escolaId,
      atualizadoEm: new Date().toISOString()
    };

    if (editandoId) {
      await updateDoc(doc(db, 'estudantes', editandoId), dadosEst);
    } else {
      // Verifica BI duplicado
      if (todosEstudantes.some(e => e.bi === bi)) {
        alert('BI já cadastrado');
        btn.disabled = false;
        btn.innerHTML = 'Salvar';
        return;
      }
      dadosEst.criadoEm = new Date().toISOString();
      dadosEst.propinas = {};
      dadosEst.notas = {};
      await addDoc(collection(db, 'estudantes'), dadosEst);
    }

    fecharModal('modalEstudante');
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

window.excluirEstudante = async function(id) {
  if (!confirm('Excluir este estudante?')) return;
  try {
    await deleteDoc(doc(db, 'estudantes', id));
  } catch (err) {
    alert('Erro ao excluir.');
    console.error(err);
  }
}

// IMPORTAÇÃO EXCEL
function baixarModeloExcel() {
  const modelo = [
    { Nome: 'João Silva', BI: '123456LA041', DataNasc: '2010-05-10', Turma: '10ª A', Encarregado: 'Pedro Silva', Telefone: '923000001' },
    { Nome: 'Maria Santos', BI: '654321LA042', DataNasc: '2010-08-22', Turma: '10ª A', Encarregado: 'Ana Santos', Telefone: '923000002' }
  ];
  const ws = XLSX.utils.json_to_sheet(modelo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alunos');
  XLSX.writeFile(wb, 'Modelo_Importacao_EduGest.xlsx');
}

async function importarExcel(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm('Isso vai adicionar os alunos da planilha. Turmas devem existir antes. Continuar?')) {
    e.target.value = '';
    return;
  }

  const btn = document.getElementById('btnImportar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Importando...';
  lucide.createIcons();

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const alunos = XLSX.utils.sheet_to_json(sheet);

    let importados = 0;
    let erros = [];

    for (const [i, a] of alunos.entries()) {
      const linha = i + 2;

      if (!a.Nome ||!a.BI ||!a.Turma) {
        erros.push(`Linha ${linha}: Faltando Nome, BI ou Turma`);
        continue;
      }

      const turma = turmas.find(t => t.nome.trim().toLowerCase() === String(a.Turma).trim().toLowerCase());
      if (!turma) {
        erros.push(`Linha ${linha}: Turma "${a.Turma}" não encontrada`);
        continue;
      }

      if (todosEstudantes.some(e => e.bi === String(a.BI))) {
        erros.push(`Linha ${linha}: BI ${a.BI} já cadastrado`);
        continue;
      }

      let nascimento = '';
      if (a.DataNasc) {
        const dataTemp = new Date(a.DataNasc);
        if (!isNaN(dataTemp)) nascimento = dataTemp.toISOString().split('T')[0];
      }

      const novoAluno = {
        nome: String(a.Nome).trim(),
        bi: String(a.BI).trim(),
        nascimento: nascimento,
        turmaId: turma.id,
        encarregado: a.Encarregado? String(a.Encarregado).trim() : '',
        telefone: a.Telefone? String(a.Telefone).trim() : '',
        escolaId: userAtual.escolaId,
        propinas: {},
        notas: {},
        criadoEm: new Date().toISOString()
      };

      await addDoc(collection(db, 'estudantes'), novoAluno);
      importados++;
    }

    let msg = `${importados} alunos importados com sucesso!`;
    if (erros.length) {
      msg += `\n\nErros:\n${erros.slice(0, 5).join('\n')}`;
      if (erros.length > 5) msg += `\n... e mais ${erros.length - 5} erros`;
    }
    alert(msg);

  } catch (err) {
    alert('Erro ao ler arquivo: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="upload"></i> Importar';
    lucide.createIcons();
    e.target.value = '';
  }
}

function validarNota(input) {
  let valor = parseFloat(input.value);
  if (isNaN(valor) || valor < 0) {
    input.value = 0;
    input.style.borderColor = '#ef4444';
    setTimeout(() => input.style.borderColor = '', 1000);
    return 0;
  }
  if (valor > 20) {
    input.value = 20;
    input.style.borderColor = '#ef4444';
    setTimeout(() => input.style.borderColor = '', 1000);
    alert('Nota máxima é 20');
    return 20;
  }
  input.style.borderColor = '';
  return valor;
}

window.abrirNotas = function(id) {
  alunoNotasId = id;
  const est = todosEstudantes.find(e => String(e.id) === String(id));
  if (!est) return;

  document.getElementById('nomeAlunoNotas').textContent = `Notas: ${est.nome}`;
  document.getElementById('trimestreAtual').textContent = `Trimestre: ${trimestreAtual}`;

  const notasAluno = est.notas?.[anoLetivoAtual]?.[trimestreAtual] || {};
  const lista = document.getElementById('listaDisciplinasNotas');

  lista.innerHTML = disciplinas.map(d => {
    const notasDisc = notasAluno[d.nome] || {mac: 0, pp: 0, pt: 0};
    const media = (notasDisc.mac * 0.4 + notasDisc.pp * 0.3 + notasDisc.pt * 0.3).toFixed(1);
    return `
      <div class="disciplina-item">
        <div class="disciplina-header">
          <span class="disciplina-nome">${d.nome}</span>
          <span class="trimestre-badge">${trimestreAtual}</span>
        </div>
        <div class="notas-inputs">
          <div>
            <label>MAC 40%</label>
            <input type="number" class="nota-input" data-disc="${d.nome}" data-tipo="mac" value="${notasDisc.mac}" min="0" max="20" step="0.1">
          </div>
          <div>
            <label>PP 30%</label>
            <input type="number" class="nota-input" data-disc="${d.nome}" data-tipo="pp" value="${notasDisc.pp}" min="0" max="20" step="0.1">
          </div>
          <div>
            <label>PT 30%</label>
            <input type="number" class="nota-input" data-disc="${d.nome}" data-tipo="pt" value="${notasDisc.pt}" min="0" max="20" step="0.1">
          </div>
        </div>
        <div class="media-disc">Média: <strong>${media}</strong></div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.nota-input').forEach(input => {
    input.oninput = () => {
      validarNota(input);
      calcularMediaTrimestre();
    };
  });

  calcularMediaTrimestre();
  document.getElementById('modalNotas').classList.add('active');
  lucide.createIcons();
}

function calcularMediaTrimestre() {
  const inputs = document.querySelectorAll('.nota-input');
  const medias = {};

  inputs.forEach(input => {
    const disc = input.dataset.disc;
    const tipo = input.dataset.tipo;
    const valor = parseFloat(input.value) || 0;

    if (!medias[disc]) medias[disc] = {mac: 0, pp: 0, pt: 0};
    medias[disc][tipo] = valor;
  });

  let somaMedias = 0;
  let count = 0;

  Object.keys(medias).forEach(disc => {
    const m = medias[disc];
    const media = (m.mac * 0.4 + m.pp * 0.3 + m.pt * 0.3);
    somaMedias += media;
    count++;

    const item = document.querySelector(`.disciplina-item:has([data-disc="${disc}"])`);
    if (item) {
      item.querySelector('.media-disc strong').textContent = media.toFixed(1);
    }
  });

  const mediaFinal = count > 0? (somaMedias / count).toFixed(1) : '0.0';
  document.getElementById('mediaFinalTrimestre').textContent = mediaFinal;
}

async function salvarNotas() {
  const btn = document.getElementById('btnSalvarNotas');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  try {
    const est = todosEstudantes.find(e => String(e.id) === String(alunoNotasId));
    if (!est) return;

    const notasUpdate = est.notas || {};
    if (!notasUpdate[anoLetivoAtual]) notasUpdate[anoLetivoAtual] = {};
    if (!notasUpdate[anoLetivoAtual][trimestreAtual]) notasUpdate[anoLetivoAtual][trimestreAtual] = {};

    document.querySelectorAll('.nota-input').forEach(input => {
      const disc = input.dataset.disc;
      const tipo = input.dataset.tipo;
      const valor = parseFloat(input.value) || 0;

      if (!notasUpdate[anoLetivoAtual][trimestreAtual][disc]) {
        notasUpdate[anoLetivoAtual][trimestreAtual][disc] = {mac: 0, pp: 0, pt: 0};
      }
      notasUpdate[anoLetivoAtual][trimestreAtual][disc][tipo] = valor;
    });

    await updateDoc(doc(db, 'estudantes', alunoNotasId), {
      notas: notasUpdate,
      atualizadoEm: new Date().toISOString()
    });

    fecharModal('modalNotas');
    alert('Notas salvas com sucesso!');
  } catch (err) {
    alert('Erro ao salvar notas.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar Notas';
    lucide.createIcons();
  }
}

window.abrirPropina = function(id) {
  alunoPropinaId = id;
  const est = todosEstudantes.find(e => String(e.id) === String(id));
  if (!est) return;

  document.getElementById('nomeAlunoPropina').textContent = `Propinas: ${est.nome}`;
  document.getElementById('anoLetivoPropina').textContent = `Ano: ${anoLetivoAtual}`;

  const ano = anoLetivoAtual.split('/')[0];
  const propinas = est.propinas?.[ano] || {};
  const meses = ['Setembro','Outubro','Novembro','Dezembro','Janeiro','Fevereiro','Março','Abril','Maio','Junho'];

  document.getElementById('gridPropinas').innerHTML = meses.map((mes) => {
    const pago = propinas[mes] === true;
    return `
      <div class="mes-propina ${pago? 'pago' : ''}">
        <label>${mes}</label>
        <input type="checkbox" data-mes="${mes}" ${pago? 'checked' : ''}>
      </div>
    `;
  }).join('');

  document.querySelectorAll('#gridPropinas input[type="checkbox"]').forEach(cb => {
    cb.onchange = function() {
      this.closest('.mes-propina').classList.toggle('pago', this.checked);
    };
  });

  document.getElementById('modalPropina').classList.add('active');
}

async function salvarPropina() {
  const btn = document.getElementById('btnSalvarPropina');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Salvando...';
  lucide.createIcons();

  try {
    const est = todosEstudantes.find(e => String(e.id) === String(alunoPropinaId));
    if (!est) return;

    const ano = anoLetivoAtual.split('/')[0];
    const propinasUpdate = est.propinas || {};
    if (!propinasUpdate[ano]) propinasUpdate[ano] = {};

    const propinasAntigas = {...propinasUpdate[ano]};

    document.querySelectorAll('#gridPropinas input[type="checkbox"]').forEach(cb => {
      const mes = cb.dataset.mes;
      propinasUpdate[ano][mes] = cb.checked;
    });

    await updateDoc(doc(db, 'estudantes', alunoPropinaId), {
      propinas: propinasUpdate,
      atualizadoEm: new Date().toISOString()
    });

    // Atualiza caixa
    const turma = turmas.find(t => String(t.id) === String(est.turmaId));
    const valorPropina = turma?.propina || 0;

    // Busca caixa existente
    const caixaSnap = await getDoc(doc(db, 'caixa', 'global'));
    let caixa = caixaSnap.exists()? caixaSnap.data().movimentos || [] : [];

    //... continuação da função salvarPropina()

    document.querySelectorAll('#gridPropinas input[type="checkbox"]').forEach(cb => {
      const mes = cb.dataset.mes;
      const estavaPago = propinasAntigas[mes] === true;
      const agoraPago = cb.checked;

      if (agoraPago &&!estavaPago && valorPropina > 0) {
        caixa.push({
          id: Date.now().toString() + Math.random(),
          tipo: 'entrada',
          descricao: `Propina ${mes}/${ano} - ${est.nome}`,
          valor: valorPropina,
          data: new Date().toISOString(),
          estudanteId: est.id,
          escolaId: userAtual.escolaId
        });
      }

      if (!agoraPago && estavaPago) {
        const idxCaixa = caixa.findIndex(c => 
          c.estudanteId === est.id && 
          c.descricao.includes(mes) && 
          c.descricao.includes(ano)
        );
        if (idxCaixa!== -1) caixa.splice(idxCaixa, 1);
      }
    });

    // Salva caixa na subcoleção da escola
    await setDoc(doc(db, 'escolas', userAtual.escolaId, 'caixa', 'movimentos'), { 
      lista: caixa 
    }, { merge: true });

    fecharModal('modalPropina');
    alert('Propinas atualizadas!');
  } catch (err) {
    alert('Erro ao salvar propinas.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

async function gerarBoletim(id) {
  const btn = document.getElementById('btnImprimirBoletim');
  try {
    const est = todosEstudantes.find(e => String(e.id) === String(id));
    const turma = turmas.find(t => String(t.id) === String(est.turmaId));

    if (!est) {
      alert('Erro: Estudante não encontrado');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4', true);

    const margem = 20;
    let y = 20;

    if (escolaAtual?.config?.escola?.logo && escolaAtual.config.escola.logo.length < 500000) {
      try {
        doc.addImage(escolaAtual.config.escola.logo, 'PNG', 15, 15, 25, 25, undefined, 'FAST');
      } catch(e) {
        console.log('Logo falhou');
      }
      y = 45;
    }

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(escolaAtual?.config?.escola?.nome || 'MINISTÉRIO DA EDUCAÇÃO', 105, y, { align: 'center' });
    y += 7;

    doc.setFontSize(14);
    doc.text(escolaAtual?.config?.escola?.endereco || 'ESCOLA', 105, y, { align: 'center' });
    y += 10;

    doc.setFontSize(16);
    doc.text(`BOLETIM DE NOTAS - ${trimestreAtual} - ${anoLetivoAtual}`, 105, y, { align: 'center' });
    y += 15;

    doc.setLineWidth(0.5);
    doc.line(margem, y, 210 - margem, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${est.nome}`, margem, y);
    doc.text(`Nº BI: ${est.bi}`, 120, y);
    y += 7;
    doc.text(`Turma: ${turma?.nome || 'N/A'}`, margem, y);
    doc.text(`Ano: ${anoLetivoAtual}`, 120, y);
    y += 7;
    doc.text(`Encarregado: ${est.encarregado || 'N/A'}`, margem, y);
    y += 10;

    const dadosTabela = [];
    let somaMedias = 0;
    let countDisc = 0;

    disciplinas.forEach(d => {
      const notasTrim = est.notas?.[anoLetivoAtual]?.[trimestreAtual]?.[d.nome];

      if (!notasTrim) {
        dadosTabela.push([d.nome.substring(0, 35), '-', '-', '-', '-']);
        return;
      }

      const mac = parseFloat(notasTrim.mac) || 0;
      const pp = parseFloat(notasTrim.pp) || 0;
      const pt = parseFloat(notasTrim.pt) || 0;
      const media = (mac * 0.4 + pp * 0.3 + pt * 0.3);

      dadosTabela.push([
        d.nome.substring(0, 35),
        mac.toFixed(1),
        pp.toFixed(1),
        pt.toFixed(1),
        media.toFixed(1)
      ]);

      somaMedias += media;
      countDisc++;
    });

    doc.autoTable({
      startY: y,
      head: [['DISCIPLINA', 'MAC 40%', 'PP 30%', 'PT 30%', 'MÉDIA']],
      body: dadosTabela,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 10, halign: 'center' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 25, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: margem, right: margem }
    });

    y = doc.lastAutoTable.finalY + 10;

    const mediaGeral = countDisc > 0? (somaMedias / countDisc).toFixed(1) : '0.0';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Média Geral do ${trimestreAtual}: ${mediaGeral}`, margem, y);

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const statusProp = calcularStatusPropina(est);
    doc.text(`Situação da Propina: ${statusProp === 'green'? 'EM DIA' : 'EM ATRASO'}`, margem, y);

    y = 270;
    doc.line(margem, y, 80, y);
    doc.line(130, y, 190, y);
    y += 5;
    doc.setFontSize(9);
    doc.text('O(A) Diretor(a)', margem + 20, y);
    doc.text('O(A) Secretário(a)', 130 + 15, y);

    y += 10;
    doc.text(`Luanda, ${new Date().toLocaleDateString('pt-AO')}`, 105, y, { align: 'center' });

    doc.save(`Boletim_${est.nome.replace(/\s+/g, '_')}_${trimestreAtual.replace('º ', 'T')}_${anoLetivoAtual.replace('/', '-')}.pdf`);

  } catch (e) {
    console.error('Erro ao gerar boletim:', e);
    alert('Erro ao gerar PDF. Ver F12.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="printer"></i> Imprimir Boletim';
    lucide.createIcons();
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

function fecharModal(id) {
  document.getElementById(id).classList.remove('active');
}

window.addEventListener('beforeunload', () => {
  unsubEstudantes?.();
  unsubTurmas?.();
  unsubDisciplinas?.();
  unsubEscola?.();
});