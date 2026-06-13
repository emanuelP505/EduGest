                import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// resto do código...
let authIniciado = false;

onAuthStateChanged(auth, async (user) => {
  // 1. Ignora o primeiro null que o Firebase manda na inicialização
  if (!authIniciado) {
    authIniciado = true;
    if (!user) return; // Só espera, não redireciona ainda
  }

  console.log('Auth mudou:', user?.email); // 👈 Pra debugar

  if (!user) {
    console.log('Deslogado, redirecionando...');
    window.location.href = 'index.html';
    return;
  }

  try {
    // 2. Confere se é admin ANTES de liberar o painel
    const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
    
    if (!userDoc.exists()) {
      console.log('Usuário sem doc no Firestore');
      await signOut(auth);
      return;
    }

    const dados = userDoc.data();
    console.log('Perfil:', dados.perfil);

    if (dados.perfil !== 'admin') {
      console.log('Não é admin, redirecionando...');
      window.location.href = 'index.html';
      return;
    }

    // 3. Só aqui libera o painel
    console.log('Admin confirmado, carregando painel');
    document.body.style.display = 'block'; // Mostra o body
    carregarPainelAdmin();

  } catch (err) {
    console.error('Erro ao verificar admin:', err);
    // Se deu network-request-failed, NÃO desloga. Só mostra erro.
    if (err.code === 'unavailable' || err.code === 'auth/network-request-failed') {
      alert('Erro de conexão. Verifique sua internet.');
    } else {
      await signOut(auth);
    }
  }
});
