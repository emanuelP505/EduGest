import { auth, db } from './firebase-config.js';
import {
  doc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let userAtual = null;
let escolaAtual = null;
let configEscola = null;
let unsubEscola;
let logoListenerAdded = false;

document.addEventListener('DOMContentLoaded', function () {
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
          escutarEscola();
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

    escutarEscola();
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

function escutarEscola() {
  unsubEscola = onSnapshot(doc(db, 'escolas', userAtual.escolaId), (snap) => {
    if (!snap.exists()) {
      alert('Escola não encontrada.');
      signOut(auth);
      return;
    }

    escolaAtual = { id: snap.id,...snap.data() };

    // TRAVA EM TEMPO REAL SE ADMIN CONGELAR
    if (escolaAtual.ativo === false && navigator.onLine) {
      window.location.href = 'bloqueado.html';
      return;
    }

    configEscola = escolaAtual.config || {
      escola: { nome: 'Minha Escola', nif: '', endereco: '', telefone: '', logo: '' },
      ano: { letivo: '2025/2026', trimestre: '1º Trimestre' },
      notificacoes: true,
      ultimoBackup: null
    };

    iniciarConfig();
  }, (error) => {
    if (error.code === 'permission-denied' && navigator.onLine) {
      window.location.href = 'bloqueado.html';
    }
  });
}

function iniciarConfig() {
  document.getElementById('userName').textContent = userAtual.nome;
  renderizarAvatar();
  lucide.createIcons();

  document.getElementById('btnPerfil').onclick = () => {
    if (confirm(`Sair?\n${userAtual.nome} - ${userAtual.perfil}`)) {
      signOut(auth).then(() => window.location.href = 'index.html');
    }
  };

  aplicarPermissoes(userAtual.perfil);
  carregarConfiguracoes();

  if (!logoListenerAdded) {
    const inputLogo = document.getElementById('logoEscola');
    if (inputLogo) {
      inputLogo.onchange = handleLogoUpload;
      logoListenerAdded = true;
    }
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

function carregarConfiguracoes() {
  const cfg = configEscola;
  const $ = id => document.getElementById(id);

  if ($('escolaInfo')) $('escolaInfo').textContent = `${cfg.escola.nome} - ${cfg.escola.telefone || 'Sem contacto'}`;
  if ($('anoInfo')) $('anoInfo').textContent = `${cfg.ano.letivo} - ${cfg.ano.trimestre}`;
  if ($('toggleNotif')) $('toggleNotif').classList.toggle('active',!!cfg.notificacoes);

  if ($('backupInfo')) {
    if (cfg.ultimoBackup &&!isNaN(new Date(cfg.ultimoBackup))) {
      $('backupInfo').textContent = `Último backup: ${new Date(cfg.ultimoBackup).toLocaleDateString('pt-AO')}`;
    } else {
      $('backupInfo').textContent = 'Nenhum backup feito';
    }
  }
}

function handleLogoUpload(e) {
  if (!navigator.onLine) {
    alert('Upload de logo indisponível offline');
    e.target.value = '';
    return;
  }

  const file = e.target.files[0];
  const preview = document.getElementById('previewLogo');
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Envie apenas imagens.');
    e.target.value = '';
    return;
  }

  if (file.size > 300 * 1024) {
    alert('Imagem muito grande. Máximo 300KB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const base64 = evt.target.result;
      preview.src = base64;
      preview.style.display = 'block';

      await updateDoc(doc(db, 'escolas', userAtual.escolaId), {
        'config.escola.logo': base64
      });
    } catch (err) {
      alert('Erro ao salvar logo. Verifique sua conexão.');
      console.error(err);
    }
  };
  reader.readAsDataURL(file);
}

window.abrirModalEscola = function() {
  if (!navigator.onLine) {
    alert('Edição indisponível offline');
    return;
  }
  const cfg = configEscola;
  document.getElementById('nomeEscola').value = cfg.escola.nome;
  document.getElementById('nifEscola').value = cfg.escola.nif;
  document.getElementById('endEscola').value = cfg.escola.endereco;
  document.getElementById('telEscola').value = cfg.escola.telefone;

  const preview = document.getElementById('previewLogo');
  if (cfg.escola.logo) {
    preview.src = cfg.escola.logo;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }

  document.getElementById('modalEscola').classList.add('active');
}

window.abrirModalAno = function() {
  if (!navigator.onLine) {
    alert('Edição indisponível offline');
    return;
  }
  const cfg = configEscola;
  document.getElementById('anoLetivo').value = cfg.ano.letivo;
  document.getElementById('trimestre').value = cfg.ano.trimestre;
  document.getElementById('modalAno').classList.add('active');
}

window.fecharModal = function(id) {
  document.getElementById(id).classList.remove('active');
}

window.salvarEscola = async function() {
  if (!navigator.onLine) {
    alert('Sem conexão. Não é possível salvar.');
    return;
  }

  const novaEscola = {
    nome: document.getElementById('nomeEscola').value.trim(),
    nif: document.getElementById('nifEscola').value.trim(),
    endereco: document.getElementById('endEscola').value.trim(),
    telefone: document.getElementById('telEscola').value.trim(),
    logo: configEscola.escola.logo
  };

  try {
    await updateDoc(doc(db, 'escolas', userAtual.escolaId), {
      'config.escola': novaEscola
    });
    fecharModal('modalEscola');
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  }
}

window.salvarAno = async function() {
  if (!navigator.onLine) {
    alert('Sem conexão. Não é possível salvar.');
    return;
  }

  const anoInput = document.getElementById('anoLetivo').value.trim();
  const regexAno = /^\d{4}\/\d{4}$/;

  if (!regexAno.test(anoInput)) {
    alert('Formato inválido. Use: 2025/2026');
    return;
  }

  const anos = anoInput.split('/');
  if (parseInt(anos[1])!== parseInt(anos[0]) + 1) {
    alert('Ano letivo inválido. Ex: 2025/2026');
    return;
  }

  const novoAno = {
    letivo: anoInput,
    trimestre: document.getElementById('trimestre').value
  };

  try {
    await updateDoc(doc(db, 'escolas', userAtual.escolaId), {
      'config.ano': novoAno
    });
    fecharModal('modalAno');
    alert('Ano letivo alterado!');
  } catch (err) {
    alert('Erro ao salvar. Verifique sua conexão.');
    console.error(err);
  }
}

window.toggleNotificacoes = async function() {
  if (!navigator.onLine) {
    alert('Sem conexão. Não é possível salvar.');
    return;
  }

  const toggle = document.getElementById('toggleNotif');
  toggle.classList.toggle('active');
  const ativo = toggle.classList.contains('active');

  try {
    await updateDoc(doc(db, 'escolas', userAtual.escolaId), {
      'config.notificacoes': ativo
    });
  } catch (err) {
    alert('Erro ao salvar.');
    toggle.classList.toggle('active');
  }
}

window.exportarBackup = async function() {
  if (!navigator.onLine) {
    alert('Backup indisponível offline');
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i> Exportando...';
  lucide.createIcons();

  try {
    const [estudantes, turmas, caixa, funcionarios] = await Promise.all([
      getDocs(query(collection(db, 'estudantes'), where('escolaId', '==', userAtual.escolaId))),
      getDocs(query(collection(db, 'turmas'), where('escolaId', '==', userAtual.escolaId))),
      getDocs(query(collection(db, 'caixa'), where('escolaId', '==', userAtual.escolaId))),
      getDocs(query(collection(db, 'funcionarios'), where('escolaId', '==', userAtual.escolaId)))
    ]);

    const dados = {
      meta: {
        versao: "EduGest v2.1",
        data: new Date().toISOString(),
        escola: configEscola.escola.nome,
        escolaId: userAtual.escolaId,
        totalAlunos: estudantes.size
      },
      escola: escolaAtual,
      estudantes: estudantes.docs.map(d => ({ id: d.id,...d.data() })),
      turmas: turmas.docs.map(d => ({ id: d.id,...d.data() })),
      caixa: caixa.docs.map(d => ({ id: d.id,...d.data() })),
      funcionarios: funcionarios.docs.map(d => ({ id: d.id,...d.data() }))
    };

    const checksum = btoa(JSON.stringify(dados)).slice(0, 8);
    dados.meta.checksum = checksum;

    const conteudo = JSON.stringify(dados, null, 2);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataNome = new Date().toLocaleDateString('pt-AO').replaceAll('/', '-');
    a.href = url;
    a.download = `EduGest_Backup_${dataNome}.gedu`;
    a.click();
    URL.revokeObjectURL(url);

    await updateDoc(doc(db, 'escolas', userAtual.escolaId), {
      'config.ultimoBackup': new Date().toISOString()
    });

    alert(`Backup feito! Arquivo: EduGest_Backup_${dataNome}.gedu`);
  } catch (err) {
    alert('Erro ao exportar backup.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download"></i>';
    lucide.createIcons();
  }
}

window.importarBackup = async function(event) {
  if (!navigator.onLine) {
    alert('Importação indisponível offline');
    event.target.value = '';
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.gedu') &&!file.name.endsWith('.json')) {
    alert('Arquivo inválido. Usa só backup.gedu ou.json do EduGest');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const conteudo = e.target.result;
      const dados = JSON.parse(conteudo);

      if (!dados.meta || dados.meta.escolaId!== userAtual.escolaId) {
        throw new Error('Este backup não pertence a esta escola!');
      }

      const checksumSalvo = dados.meta.checksum;
      delete dados.meta.checksum;
      const checksumCalculado = btoa(JSON.stringify(dados)).slice(0, 8);

      if (checksumSalvo && checksumSalvo!== checksumCalculado) {
        throw new Error('Arquivo corrompido ou modificado! Checksum não confere.');
      }

      if (!confirm(`CONFIRMAR RESTAURAÇÃO:\n\nEscola: ${dados.meta.escola}\nData: ${new Date(dados.meta.data).toLocaleString('pt-AO')}\nAlunos: ${dados.meta.totalAlunos}\n\nISTO APAGA TODOS DADOS ATUAIS. Continuar?`)) {
        event.target.value = '';
        return;
      }

      if (userAtual.perfil!== 'diretor') {
        throw new Error('Apenas diretores podem importar backup.');
      }

      alert('Restauração iniciada. Não feche a página.');
      alert('Importante: Por segurança, a restauração completa deve ser feita pelo suporte técnico.\nEnvie o arquivo.gedu pro administrador.');

    } catch (err) {
      alert('ERRO AO IMPORTAR: ' + err.message);
      console.error('Falha importação:', err);
    } finally {
      event.target.value = '';
    }
  };

  reader.onerror = function() {
    alert('Erro ao ler arquivo. Pode estar corrompido.');
  };

  reader.readAsText(file);
}

function aplicarPermissoes(perfil) {
  const paginasSoDiretor = ['funcionarios.html', 'config.html', 'disciplina.html'];
  if (perfil === 'secretario') {
    paginasSoDiretor.forEach(pagina => {
      const link = document.querySelector(`a[href="${pagina}"]`);
      if (link) link.style.display = 'none';
    });

    const paginaAtual = window.location.pathname.split('/').pop();
    if (paginasSoDiretor.includes(paginaAtual)) {
      alert('Acesso negado. Apenas diretores podem acessar Configurações.');
      window.location.href = 'dashboard.html';
    }
  }
}

window.addEventListener('beforeunload', () => {
  unsubEscola?.();
});