import { auth, db } from './firebase-config.js';
import {
  doc, getDoc, collection, query, where, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let escolaAtual = null;
let unsubEstudantes, unsubTurmas, unsubCaixa, unsubEscola;

document.addEventListener('DOMContentLoaded', async function () {
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
          userAtual = { uid: firebaseUser.uid, ...userDoc.data() };
          iniciarDashboard();
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
      alert('Usuário sem dados. Contate o suporte.');
      signOut(auth);
      return;
    }

    userAtual = { uid: firebaseUser.uid, ...userDoc.data() };

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
    if (configDoc.exists() && configDoc.data().manutencao === true && userAtual.perfil !== 'admin') {
      window.location.href = 'manutencao.html';
      return;
    }

    escolaAtual = escolaDoc.data();
    iniciarDashboard();
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

function iniciarDashboard() {
  atualizarDataHora();
  setInterval(atualizarDataHora, 60000);

  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Deseja sair do sistema?`)) {
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
    // TRAVA EM TEMPO REAL SE CONGELAR
    if (escolaAtual.ativo === false && navigator.onLine) {
      window.location.href = 'bloqueado.html';
      return;
    }
    atualizarDashboard();
  }, (error) => {
    if (error.code === 'permission-denied' && navigator.onLine) {
      window.location.href = 'bloqueado.html';
    }
  });

  unsubEstudantes = onSnapshot(
    query(collection(db, 'estudantes'), where('escolaId', '==', escolaId)),
    (snap) => {
      const estudantes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      localStorage.setItem('edugest_estudantes_cache', JSON.stringify(estudantes));
      atualizarDashboard();
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
      const turmas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      localStorage.setItem('edugest_turmas_cache', JSON.stringify(turmas));
      atualizarDashboard();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );

  unsubCaixa = onSnapshot(
    query(collection(db, 'caixa'), where('escolaId', '==', escolaId)),
    (snap) => {
      const caixa = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      localStorage.setItem('edugest_caixa_cache', JSON.stringify(caixa));
      atualizarDashboard();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );
}

function atualizarDashboard() {
  const estudantes = JSON.parse(localStorage.getItem('edugest_estudantes_cache') || '[]');
  const turmas = JSON.parse(localStorage.getItem('edugest_turmas_cache') || '[]');
  const caixa = JSON.parse(localStorage.getItem('edugest_caixa_cache') || '[]');
  
  document.getElementById('totalEstudantes').textContent = estudantes.length;
  document.getElementById('totalTurmas').textContent = turmas.length;
  
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  
  const receitasMes = caixa.filter(c => {
    const data = new Date(c.data);
    return c.tipo === 'entrada' && data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
  }).reduce((sum, c) => sum + (c.valor || 0), 0);
  
  document.getElementById('receitaMes').textContent = `${receitasMes.toLocaleString('pt-AO')} KZ`;
  
  const emAtraso = estudantes.filter(e => e.statusFinanceiro === 'atrasado').length;
  document.getElementById('emAtraso').textContent = emAtraso;
  
  renderizarArrecadacaoAnual(caixa);
  renderizarAtividadeRecente(caixa);
  renderizarEstudantesAtraso(estudantes);
}

function renderizarArrecadacaoAnual(caixa) {
  const div = document.getElementById('arrecadacaoAno');
  if (!div) return;
  
  const anoAtual = new Date().getFullYear();
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  let html = '<div style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px;">';
  
  for (let i = 0; i < 12; i++) {
    const totalMes = caixa.filter(c => {
      const data = new Date(c.data);
      return c.tipo === 'entrada' && data.getMonth() === i && data.getFullYear() === anoAtual;
    }).reduce((sum, c) => sum + (c.valor || 0), 0);
    
    html += `
      <div style="text-align:center; padding:8px; background:var(--card-1); border-radius:6px;">
        <div style="font-size:11px; color:var(--text-2);">${meses[i]}</div>
        <div style="font-weight:600; font-size:13px;">${totalMes > 0 ? totalMes.toLocaleString('pt-AO') : '0'}</div>
      </div>
    `;
  }
  
  html += '</div>';
  div.innerHTML = html;
}

function renderizarAtividadeRecente(caixa) {
  const div = document.getElementById('atividadeRecente');
  if (!div) return;
  
  const recentes = caixa.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  
  if (recentes.length === 0) {
    div.innerHTML = '<div style="color:var(--text-2);">Nenhum pagamento ainda</div>';
    return;
  }
  
  div.innerHTML = recentes.map(c => `
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">
      <div>
        <div style="font-weight:500;">${c.descricao || 'Pagamento'}</div>
        <div style="font-size:12px; color:var(--text-2);">${new Date(c.data).toLocaleDateString('pt-AO')}</div>
      </div>
      <div style="font-weight:600; color:${c.tipo === 'entrada' ? '#16a34a' : '#dc2626'};">
        ${c.tipo === 'entrada' ? '+' : '-'}${(c.valor || 0).toLocaleString('pt-AO')} KZ
      </div>
    </div>
  `).join('');
}

function renderizarEstudantesAtraso(estudantes) {
  const div = document.getElementById('estudantesAtraso');
  if (!div) return;
  
  const atrasados = estudantes.filter(e => e.statusFinanceiro === 'atrasado').slice(0, 10);
  
  if (atrasados.length === 0) {
    div.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-2);">Nenhum em atraso</td></tr>';
    return;
  }
  
  div.innerHTML = atrasados.map(e => `
    <tr>
      <td>${e.nome}</td>
      <td>${e.turma || '-'}</td>
      <td><span style="background:#fef2f2; color:#dc2626; padding:4px 8px; border-radius:4px; font-size:12px;">Atrasado</span></td>
    </tr>
  `).join('');
}

function aplicarPermissoes(perfil) {
  const btnWord = document.getElementById('btnWordAtrasados');
  const btnExcel = document.getElementById('btnExcelCompleto');
  
  if (perfil === 'secretario') {
    if (btnWord) btnWord.style.display = 'none';
    if (btnExcel) btnExcel.style.display = 'none';
  }
}

function bindBotoesExport() {
  document.getElementById('btnWordAtrasados')?.addEventListener('click', () => {
    if (!navigator.onLine) return alert('Função indisponível offline');
    exportarWordAtrasados();
  });
  
  document.getElementById('btnExcelCompleto')?.addEventListener('click', () => {
    if (!navigator.onLine) return alert('Função indisponível offline');
    exportarExcelCompleto();
  });
}

function exportarWordAtrasados() {
  const estudantes = JSON.parse(localStorage.getItem('edugest_estudantes_cache') || '[]');
  const atrasados = estudantes.filter(e => e.statusFinanceiro === 'atrasado');
  alert(`Exportar ${atrasados.length} estudantes atrasados - Função em desenvolvimento`);
}

function exportarExcelCompleto() {
  alert('Exportar Excel completo - Função em desenvolvimento');
}

function renderizarAvatar() {
  const avatarDiv = document.getElementById('avatarIcon');
  if (!avatarDiv) return;
  
  if (userAtual.perfil === 'admin') {
    avatarDiv.innerHTML = '<i data-lucide="shield"></i>';
    avatarDiv.style.background = '#dc2626';
    avatarDiv.style.color = '#fff';
    avatarDiv.title = 'Admin - Acesso Total';
  } else if (userAtual.perfil === 'diretor') {
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

function atualizarDataHora() {
  const el = document.getElementById('dataHora');
  if (el) {
    const agora = new Date();
    el.textContent = agora.toLocaleString('pt-AO', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

window.addEventListener('beforeunload', () => {
  unsubEstudantes?.();
  unsubTurmas?.();
  unsubCaixa?.();
  unsubEscola?.();
});
