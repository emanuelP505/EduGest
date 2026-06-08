import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const form = document.getElementById('formCadastro');
const btn = document.getElementById('btnCadastro');
const erroMsg = document.getElementById('erroMsg');
const sucessoMsg = document.getElementById('sucessoMsg');

form.addEventListener('submit', handleCadastro);

async function handleCadastro(e) {
  e.preventDefault();
  
  btn.disabled = true;
  btn.textContent = 'Validando...';
  erroMsg.style.display = 'none';
  sucessoMsg.style.display = 'none';

  const dados = {
    codigo: document.getElementById('codigoConvite').value.trim().toUpperCase(),
    nomeEscola: document.getElementById('nomeEscola').value.trim(),
    nomeDiretor: document.getElementById('nomeDiretor').value.trim(),
    email: document.getElementById('email').value.trim(),
    senha: document.getElementById('senha').value
  };

  if (Object.values(dados).some(v => !v)) {
    erroMsg.textContent = 'Preencha todos os campos';
    erroMsg.style.display = 'block';
    resetBtn();
    return;
  }

  if (dados.senha.length < 6) {
    erroMsg.textContent = 'Senha precisa ter mínimo 6 caracteres';
    erroMsg.style.display = 'block';
    resetBtn();
    return;
  }

  try {
    // 1. VALIDA CÓDIGO
    btn.textContent = 'Verificando código...';
    const codRef = doc(db, 'codigos_convite', dados.codigo);
    const codSnap = await getDoc(codRef);
    
    if (!codSnap.exists() || codSnap.data().usado) {
      throw new Error('Código de convite inválido ou já utilizado');
    }

    // 2. CRIA USUÁRIO AUTH
    btn.textContent = 'Criando conta...';
    const cred = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
    const uid = cred.user.uid;

    // 3. CRIA ESCOLA
    const escolaId = `escola_${Date.now()}`;
    await setDoc(doc(db, 'escolas', escolaId), {
      config: {
        escola: {
          nome: dados.nomeEscola,
          email: dados.email,
        }
      },
      anoLetivo: new Date().getFullYear(),
      criadoEm: serverTimestamp(),
      criadoPor: uid,
      ativo: true
    });

    // 4. CRIA DIRETOR
    await setDoc(doc(db, 'usuarios', uid), {
      nome: dados.nomeDiretor,
      email: dados.email,
      perfil: 'diretor',
      escolaId: escolaId,
      ativo: true,
      criadoEm: serverTimestamp()
    });

    // 5. INVALIDA CÓDIGO
    await deleteDoc(codRef);

    sucessoMsg.textContent = 'Escola cadastrada! Redirecionando...';
    sucessoMsg.style.display = 'block';
    setTimeout(() => window.location.href = 'dashboard.html', 1500);

  } catch (err) {
    erroMsg.textContent = 'Erro: ' + err.message;
    erroMsg.style.display = 'block';
    console.error(err);
    resetBtn();
  }
}

function resetBtn() {
  btn.disabled = false;
  btn.textContent = 'Criar Conta';
}