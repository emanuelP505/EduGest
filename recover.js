
import { auth } from './firebase-config.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRecuperar').onclick = enviarLink;
});

async function enviarLink() {
  const email = document.getElementById('emailRec').value.trim();
  const btn = document.getElementById('btnRecuperar');
  const erroMsg = document.getElementById('erroMsg');
  const sucessoMsg = document.getElementById('sucessoMsg');

  erroMsg.style.display = 'none';
  sucessoMsg.style.display = 'none';

  if (!email) {
    erroMsg.textContent = 'Digite o email cadastrado';
    erroMsg.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

  try {
    await sendPasswordResetEmail(auth, email);
    sucessoMsg.textContent = 'Link enviado! Verifica teu email e spam.';
    sucessoMsg.style.display = 'block';
    setTimeout(() => window.location.href = 'index.html', 3000);
  } catch (err) {
    let msg = 'Erro ao enviar email';
    if (err.code === 'auth/user-not-found') msg = 'Email não cadastrado';
    if (err.code === 'auth/invalid-email') msg = 'Email inválido';
    erroMsg.textContent = msg;
    erroMsg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Enviar link de recuperação';
  }
}