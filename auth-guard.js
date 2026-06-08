import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const PAGINAS_PUBLICAS = ['/cadastro.html', '/recuperar.html', '/index.html', '/'];
const PAGINAS_DIRETOR = ['/funcionarios.html', '/config.html', '/disciplina.html'];

// 1. Esconde rápido sem esperar JS
document.documentElement.style.visibility = 'hidden';

// 2. Promise que outros scripts podem esperar
let resolveUsuario;
window.usuarioPronto = new Promise(r => resolveUsuario = r);

onAuthStateChanged(auth, async (user) => {
  const paginaAtual = window.location.pathname;
  const ehPaginaPublica = PAGINAS_PUBLICAS.some(p => paginaAtual.endsWith(p));

  if (!user) {
    if (ehPaginaPublica) {
      document.documentElement.style.visibility = 'visible';
      resolveUsuario(null);
      return;
    }
    window.location.href = '/index.html';
    return;
  }

  if (ehPaginaPublica) {
    window.location.href = '/dashboard.html';
    return;
  }

  // 3. Cache de 5min pra não bater no Firestore toda hora
  const cacheKey = `edugest_user_${user.uid}`;
  const cache = sessionStorage.getItem(cacheKey);
  let dados;
  
  if (cache) {
    dados = JSON.parse(cache);
    // Verifica se cache não expirou
    if (Date.now() - dados.cachedAt > 300000) {
      sessionStorage.removeItem(cacheKey);
      dados = null;
    }
  }

  if (!dados) {
    try {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      if (!userDoc.exists()) throw new Error('Usuário sem dados');
      dados = userDoc.data();
      dados.cachedAt = Date.now();
      sessionStorage.setItem(cacheKey, JSON.stringify(dados));
    } catch (error) {
      console.error('Erro auth:', error);
      await signOut(auth);
      window.location.href = '/index.html';
      return;
    }
  }

  if (dados.ativo === false) {
    alert('Conta desativada.');
    await signOut(auth);
    window.location.href = '/index.html';
    return;
  }

  const usuarioLogado = {
    uid: user.uid,
    perfil: dados.perfil,
    escolaId: dados.escolaId,
    nome: dados.nome,
    email: user.email
  };

  // 4. Expõe global e resolve a promise pros outros scripts
  window.usuarioLogado = usuarioLogado;
  resolveUsuario(usuarioLogado);

  // 5. Valida permissão de diretor
  if (dados.perfil === 'secretario' && PAGINAS_DIRETOR.some(p => paginaAtual.endsWith(p))) {
    alert('Acesso negado. Apenas diretores.');
    window.location.href = '/dashboard.html';
    return;
  }

  // 6. Remove menus proibidos
  if (dados.perfil === 'secretario') {
    ['a[href="funcionarios.html"]', 'a[href="config.html"]', 'a[href="disciplina.html"]']
      .forEach(sel => document.querySelector(sel)?.remove());
  }

  document.documentElement.style.visibility = 'visible';
});

// Helpers globais
window.getEscolaId = () => window.usuarioLogado?.escolaId || null;

window.fazerLogout = async () => {
  if (confirm('Deseja sair do sistema?')) {
    sessionStorage.clear();
    await signOut(auth);
    window.location.href = '/index.html';
  }
};