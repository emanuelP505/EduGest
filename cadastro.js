import { auth, db } from 'firebase-config.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const form = document.getElementById('formCadastro');
const btn = document.getElementById('btnCadastrar');

form.addEventListener('submit', handleCadastro);

async function handleCadastro(e) {
  e.preventDefault();
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Validando...';
  lucide.createIcons();

  const dados = {
    codigo: document.getElementById('codigoConvite').value.trim().toUpperCase(),
    nomeEscola: document.getElementById('nomeEscola').value.trim(),
    nomeDiretor: document.getElementById('nomeDiretor').value.trim(),
    email: document.getElementById('email').value.trim(),
    telefone: document.getElementById('telefone').value.trim(),
    senha: document.getElementById('senha').value
  };

  if (Object.values(dados).some(v => !v)) {
    alert('Preencha todos os campos');
    resetBtn();
    return;
  }

  if (dados.senha.length < 6) {
    alert('Senha precisa ter mínimo 6 caracteres');
    resetBtn();
    return;
  }

  try {
    // 1. VALIDA CÓDIGO DE CONVITE
    btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Verificando código...';
    const codRef = doc(db, 'codigos_convite', dados.codigo);
    const codSnap = await getDoc(codRef);
    
    if (!codSnap.exists() || codSnap.data().usado) {
      throw new Error('Código de convite inválido ou já utilizado');
    }

    // 2. CRIA USUÁRIO NO AUTH
    btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Criando conta...';
    const cred = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
    const uid = cred.user.uid;

    // 3. CRIA ESCOLA
    const escolaId = `escola_${Date.now()}`;
    await setDoc(doc(db, 'escolas', escolaId), {
      nome: dados.nomeEscola,
      email: dados.email,
      telefone: dados.telefone,
      diretor: dados.nomeDiretor,
      logo: '',
      endereco: '',
      nif: '',
      anoLetivo: new Date().getFullYear(),
      criadoEm: serverTimestamp(),
      criadoPor: uid,
      ativo: true
    });

    // 4. CRIA USUÁRIO DIRETOR NO FIRESTORE
    await setDoc(doc(db, 'usuarios', uid), {
      nome: dados.nomeDiretor,
      email: dados.email,
      perfil: 'diretor',
      escolaId: escolaId,
      telefone: dados.telefone,
      ativo: true,
      criadoEm: serverTimestamp()
    });

    // 5. INVALIDA CÓDIGO - Não pode usar 2x
    await deleteDoc(codRef);

    alert('Escola cadastrada com sucesso! Redirecionando...');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);

  } catch (err) {
    alert('Erro: ' + err.message);
    console.error(err);
    resetBtn();
  }
}

function resetBtn() {
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="log-in"></i> Cadastrar Escola';
  lucide.createIcons();
}

lucide.createIcons(); 