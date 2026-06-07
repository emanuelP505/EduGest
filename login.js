import { auth, db } from 'firebase-config.js';
import { signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const CARGOS_PERMITIDOS = ['diretor', 'secretario'];

function toggleSenha() {
  const inputSenha = document.getElementById('senha');
  const iconeOlho = document.getElementById('iconeOlho');
  inputSenha.type = inputSenha.type === 'password' ? 'text' : 'password';
  iconeOlho.classList.toggle('fa-eye');
  iconeOlho.classList.toggle('fa-eye-slash');
}

async function fazerLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;
  const erroMsg = document.getElementById('erroMsg');
  const loading = document.getElementById('loading');
  const btnLogin = document.getElementById('btnLogin');

  if (!email || !senha) {
    mostrarErro('Preencha email e senha');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';
  loading.style.display = 'block';
  erroMsg.style.display = 'none';

  try {
    // 1. Autentica no Firebase Auth
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    
    // 2. Busca dados do usuário no Firestore
    const userDoc = await getDoc(doc(db, 'usuarios', cred.user.uid));
    
    if (!userDoc.exists()) {
      await signOut(auth);
      mostrarErro('Usuário sem permissão cadastrada');
      resetBtn();
      return;
    }

    const dados = userDoc.data();
    
    // 3. Valida cargo
    if (!CARGOS_PERMITIDOS.includes(dados.perfil)) {
      await signOut(auth);
      mostrarErro('Seu cargo não tem permissão de acesso');
      resetBtn();
      return;
    }

    if (dados.ativo === false) {
      await signOut(auth);
      mostrarErro('Conta desativada. Contate o administrador');
      resetBtn();
      return;
    }

    // 4. Sucesso - auth-guard.js cuida do resto
    window.location.href = 'dashboard.html';

  } catch (error) {
    console.error('Erro login:', error);
    let msg = 'Erro ao fazer login';
    
    if (error.code === 'auth/invalid-email') msg = 'Email inválido';
    if (error.code === 'auth/user-not-found') msg = 'Conta não encontrada';
    if (error.code === 'auth/wrong-password') msg = 'Senha incorreta';
    if (error.code === 'auth/invalid-credential') msg = 'Email ou senha incorretos';
    if (error.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente mais tarde';
    if (error.code === 'auth/user-disabled') msg = 'Conta desativada';
    
    mostrarErro(msg);
    resetBtn();
  }
}

function mostrarErro(msg) {
  const erroMsg = document.getElementById('erroMsg');
  erroMsg.textContent = msg;
  erroMsg.style.display = 'block';
  document.getElementById('loading').style.display = 'none';
}

function resetBtn() {
  const btn = document.getElementById('btnLogin');
  btn.disabled = false;
  btn.textContent = 'Entrar';
  document.getElementById('loading').style.display = 'none';
}

// Limpa erro ao digitar
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input').forEach(el => {
    el.addEventListener('input', () => {
      document.getElementById('erroMsg').style.display = 'none';
    });
  });
});

// Expõe funções pro HTML
window.fazerLogin = fazerLogin;
window.toggleSenha = toggleSenha;