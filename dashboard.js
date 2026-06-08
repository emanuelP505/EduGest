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
          userAtual = { uid: firebaseUser.uid,...userDoc.data() };
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
      const estudantes = snap.docs.map(d => ({ id: d.id,...d.data() }));
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
      const turmas = snap.docs.map(d => ({ id: d.id,...d.data() }));
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
      const caixa = snap.docs.map(d => ({ id: d.id,...d.data() }));
      localStorage.setItem('edugest_caixa_cache', JSON.stringify(caixa));
      atualizarDashboard();
    },
    (error) => {
      if (error.code === 'permission-denied' && navigator.onLine) {
        window.location.href = 'bloqueado.html';
      }
    }
  );