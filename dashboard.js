import { auth, db } from 'firebase-config.js';
import { 
  doc, getDoc, collection, query, where, onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let escolaAtual = null;
let unsubEstudantes, unsubTurmas, unsubCaixa, unsubEscola;

document.addEventListener('DOMContentLoaded', async function () {
  lucide.createIcons();

  auth.onAuthStateChanged(async (firebaseUser) => {
    if (!firebaseUser) {
      window.location.href = 'index.html';
      return;
    }

    const userDoc = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
    if (!userDoc.exists()) {
      alert('Usuário sem dados. Contate o suporte.');
      signOut(auth);
      return;
    }

    userAtual = { uid: firebaseUser.uid,...userDoc.data() };
    
    const escolaDoc = await getDoc(doc(db, 'escolas', userAtual.escolaId));
    escolaAtual = escolaDoc.data();
    
    iniciarDashboard();
  });
});

function iniciarDashboard() {
  atualizarDataHora();
  setInterval(atualizarDataHora, 60000);

  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm('Deseja sair do sistema?')) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);
  bindBotoesExport();
  escutarDados();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarDashboard();
  });
}

function escutarDados() {
  const escolaId = userAtual.escolaId;
  
  unsubEscola = onSnapshot(doc(db, 'escolas', escolaId), (snap) => {
    escolaAtual = snap.data();
    atualizarDashboard();
  });
  
  unsubEstudantes = onSnapshot(
    query(collection(db, 'estudantes'), where('escolaId', '==', escolaId)),
    (snap) => {
      const estudantes = snap.docs.map(d => ({ id: d.id,...d.data() }));
      localStorage.setItem('edugest_estudantes_cache', JSON.stringify(estudantes));
      atualizarDashboard();
    }
  );

  unsubTurmas = onSnapshot(
    query(collection(db, 'turmas'), where('escolaId', '==', escolaId)),
    (snap) => {
      const turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
      localStorage.setItem('edugest_turmas_cache', JSON.stringify(turmas));
      atualizarDashboard();
    }
  );

  unsubCaixa = onSnapshot(
    query(collection(db, 'caixa'), where('escolaId', '==', escolaId)),
    (snap) => {
      const caixa = snap.docs.map(d => ({ id: d.id,...d.data() }));
      localStorage.setItem('edugest_caixa_cache', JSON.stringify(caixa));
      atualizarDashboard();
    }
  );
}

function getEstudantes() { 
  return JSON.parse(localStorage.getItem('edugest_estudantes_cache')) || []; 
}
function getTurmas() { 
  return JSON.parse(localStorage.getItem('edugest_turmas_cache')) || []; 
}
function getCaixa() { 
  return JSON.parse(localStorage.getItem('edugest_caixa_cache')) || []; 
}

function getAnoAtivo() {
  return escolaAtual?.anoLetivo || '2025/2026';
}

window.calcularStatus = function(est) {
  const ano = getAnoAtivo().split('/')[0];
  const propinasAno = est.propinas?.[ano] || {};
  const mesesPagos = Object.values(propinasAno).filter(v => v === true).length;
  const mesAtual = new Date().getMonth() + 1;
  const mesesDevidos = Math.max(0, mesAtual - 8);
  return mesesPagos >= mesesDevidos? 'green' : 'red';
};

function atualizarDataHora() {
  const agora = new Date();
  const opcoes = {
    weekday: 'long', year: 'numeric', month: 'long', 
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  };
  document.getElementById('dataHora').textContent = agora.toLocaleDateString('pt-AO', opcoes);
}

function renderizarAvatar() {
  const avatarDiv = document.getElementById('avatarIcon');
  if (userAtual.perfil === 'diretor') {
    avatarDiv.innerHTML = '<i data-lucide="shield-check"></i>';
    avatarDiv.style.background = 'var(--card-4)';
    avatarDiv.style.color = '#9333ea';
  } else if (userAtual.perfil === 'secretario') {
    avatarDiv.innerHTML = '<i data-lucide="clipboard-list"></i>';
    avatarDiv.style.background = 'var(--card-2)';
    avatarDiv.style.color = '#16a34a';
  } else {
    avatarDiv.innerHTML = '<i data-lucide="user"></i>';
  }
}

function bindBotoesExport() {
  document.getElementById('btnExportExcel').onclick = () => {
    const btn = document.getElementById('btnExportExcel');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Gerando...';
    lucide.createIcons();
    setTimeout(() => {
      exportarExcel();
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="file-spreadsheet"></i> Excel Completo';
      lucide.createIcons();
    }, 100);
  };

  document.getElementById('btnExportWord').onclick = () => {
    const btn = document.getElementById('btnExportWord');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Gerando...';
    lucide.createIcons();
    setTimeout(() => {
      exportarWord();
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="file-text"></i> Word Atrasados';
      lucide.createIcons();
    }, 100);
  };
}

function atualizarDashboard() {
  const estudantes = getEstudantes();
  const turmas = getTurmas();
  const caixa = getCaixa();
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  document.getElementById('cardTotalEst').textContent = estudantes.length;
  document.getElementById('cardTotalTurmas').textContent = turmas.length;

  const arrecadadoMes = caixa
   .filter(c => {
      if (c.tipo!== 'entrada') return false;
      const d = new Date(c.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    })
   .reduce((s, c) => s + Number(c.valor), 0);
  document.getElementById('cardArrecadado').textContent = arrecadadoMes.toLocaleString() + ' KZ';

  const arrecadadoAno = caixa
   .filter(c => {
      if (c.tipo!== 'entrada') return false;
      return new Date(c.data).getFullYear() === anoAtual;
    })
   .reduce((s, c) => s + Number(c.valor), 0);

  const subEl = document.getElementById('cardArrecadadoAno');
  if (subEl) {
    subEl.textContent = `Ano: ${arrecadadoAno.toLocaleString()} KZ`;
  } else {
    const cardEl = document.getElementById('cardArrecadado').parentElement;
    const sub = document.createElement('span');
    sub.id = 'cardArrecadadoAno';
    sub.style.cssText = 'font-size:11px; opacity:0.7; display:block; margin-top:2px;';
    sub.textContent = `Ano: ${arrecadadoAno.toLocaleString()} KZ`;
    cardEl.appendChild(sub);
  }

  const emAtraso = estudantes.filter(e => calcularStatus(e) === 'red').length;
  document.getElementById('cardAtraso').textContent = emAtraso;

  const atrasados = estudantes.filter(e => calcularStatus(e) === 'red').slice(0, 5);
  const tbody = document.getElementById('tbodyAtrasados');
  if (atrasados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color: var(--secondary-color);">Nenhum em atraso</td></tr>';
  } else {
    tbody.innerHTML = atrasados.map(e => {
      const turma = turmas.find(t => String(t.id) === String(e.turmaId));
      return `
        <tr>
          <td>${e.nome}</td>
          <td>${turma? turma.nome : 'N/A'}</td>
          <td><span class="badge red">Em Atraso</span></td>
        </tr>
      `;
    }).join('');
  }

  const recentes = caixa.filter(c => c.tipo === 'entrada')
   .sort((a,b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  const divAtividade = document.getElementById('atividadeRecente');
  if (recentes.length === 0) {
    divAtividade.innerHTML = '<p style="color: var(--secondary-color);">Nenhum pagamento ainda</p>';
  } else {
    divAtividade.innerHTML = recentes.map(c => `
      <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color)">
        <span style="font-size: 14px;">${c.descricao}</span>
        <span style="color:#16a34a;font-weight:600">+${Number(c.valor).toLocaleString()} KZ</span>
      </div>
    `).join('');
  }

  const meses = [];
  const anoLetivo = getAnoAtivo().split('/')[0];
  const mesesLetivo = [
    {mes: 'Set', num: 8}, {mes: 'Out', num: 9}, {mes: 'Nov', num: 10},
    {mes: 'Dez', num: 11}, {mes: 'Jan', num: 0}, {mes: 'Fev', num: 1},
    {mes: 'Mar', num: 2}, {mes: 'Abr', num: 3}, {mes: 'Mai', num: 4}, {mes: 'Jun', num: 5}
  ];

  mesesLetivo.forEach(m => {
    const ano = m.num >= 8? anoLetivo : Number(anoLetivo) + 1;
    const total = caixa.filter(c => {
      if (c.tipo!== 'entrada') return false;
      const d = new Date(c.data);
      return d.getMonth() === m.num && d.getFullYear() == ano;
    }).reduce((s, c) => s + Number(c.valor), 0);
    meses.push({ mes: m.mes, valor: total });
  });
  desenharGrafico(meses);
}

function desenharGrafico(dados) {
  const canvas = document.getElementById('graficoArrecadacao');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth;
  const h = canvas.height = 200;
  const padding = 40;
  const barWidth = (w - padding*2) / dados.length * 0.6;
  const max = Math.max(...dados.map(d => d.valor), 1);

  ctx.clearRect(0,0,w,h);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--secondary-color');

  dados.forEach((d, i) => {
    const barHeight = (d.valor / max) * (h - padding*2);
    const x = padding + i * ((w - padding*2) / dados.length) + barWidth*0.2;
    const y = h - padding - barHeight;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--link-color-active-bg');
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--main-color');
    ctx.fillText(d.valor.toLocaleString(), x, y - 5);
    ctx.fillText(d.mes, x, h - 10);
  });
}

function exportarExcel() {
  const estudantes = getEstudantes();
  const turmas = getTurmas();
  const caixa = getCaixa();
  const mesAtual = new Date().toISOString().slice(0,7);
  const ano = getAnoAtivo().split('/')[0];

  const resumo = [
    ['Relatório EduGest', ''],
    ['Mês', mesAtual],
    [''],
    ['Total Estudantes', estudantes.length],
    ['Total Turmas', turmas.length],
    ['Arrecadação Mês', caixa.filter(c => c.data.startsWith(mesAtual)).reduce((s,c) => s + Number(c.valor), 0)],
    ['Estudantes em Atraso', estudantes.filter(e => calcularStatus(e) === 'red').length]
  ];

  const pagamentosMes = caixa.filter(c => c.tipo === 'entrada' && c.data.startsWith(mesAtual))
   .map(c => ({
      Data: new Date(c.data).toLocaleDateString('pt-AO'),
      Descrição: c.descricao,
      Valor: Number(c.valor)
    }));

  const atrasados = estudantes.filter(e => calcularStatus(e) === 'red')
   .map(e => {
      const turma = turmas.find(t => String(t.id) === String(e.turmaId));
      const mesesPagos = Object.values(e.propinas?.[ano] || {}).filter(v => v === true).length;
      return {
        Nome: e.nome,
        BI: e.bi,
        Turma: turma? turma.nome : 'N/A',
        Propina: turma? turma.propina : 0,
        MesesPagos: mesesPagos
      };
    });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagamentosMes), 'Pagamentos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(atrasados), 'Atrasados');

  XLSX.writeFile(wb, `EduGest_Relatorio_${mesAtual}.xlsx`);
}

function exportarWord() {
  const estudantes = getEstudantes();
  const turmas = getTurmas();
  const atrasados = estudantes.filter(e => calcularStatus(e) === 'red');
  const ano = getAnoAtivo().split('/')[0];

  let html = `
    <html><head><meta charset="UTF-8"></head><body>
    <h2>GestEdu+ - Relatório de Estudantes em Atraso</h2>
    <p>Mês: ${new Date().toLocaleDateString('pt-AO', {month:'long', year:'numeric'})}</p>
    <table border="1" cellpadding="5" style="border-collapse:collapse; width:100%;">
      <tr><th>Nome</th><th>BI</th><th>Turma</th><th>Propina</th><th>Meses Pagos</th></tr>
  `;

  atrasados.forEach(e => {
    const turma = turmas.find(t => String(t.id) === String(e.turmaId));
    const mesesPagos = Object.values(e.propinas?.[ano] || {}).filter(v => v === true).length;
    html += `<tr>
      <td>${e.nome}</td>
      <td>${e.bi}</td>
      <td>${turma? turma.nome : 'N/A'}</td>
      <td>${turma? turma.propina.toLocaleString() : 0} KZ</td>
      <td>${mesesPagos}</td>
    </tr>`;
  });

  html += '</table></body></html>';

  const blob = new Blob([html], {type: 'application/msword'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Atrasados_${new Date().toISOString().slice(0,7)}.doc`;
  a.click();
}

function aplicarPermissoes(perfil) {
  const soDiretor = [
    document.querySelector('a[href="funcionarios.html"]'),
    document.querySelector('a[href="config.html"]'),
    document.querySelector('a[href="disciplina.html"]')
  ];
  if (perfil === 'secretario') {
    soDiretor.forEach(el => { if (el) el.style.display = 'none'; });

    const paginaAtual = window.location.pathname.split('/').pop();
    if (['funcionarios.html', 'config.html','disciplina.html'].includes(paginaAtual)) {
      alert('Acesso negado. Apenas diretores podem acessar esta página.');
      window.location.href = 'dashboard.html';
    }
  }
}

window.addEventListener('beforeunload', () => {
  unsubEstudantes?.();
  unsubTurmas?.();
  unsubCaixa?.();
  unsubEscola?.();
});