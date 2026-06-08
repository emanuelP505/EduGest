const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
const auth = getAuth();

// FUNÇÃO 1: CRIAR ESCOLA - usada no cadastro.js
exports.criarEscola = onCall(async (request) => {
  const { codigo, nomeEscola, nomeDiretor, email, senha } = request.data;

  if (!codigo ||!nomeEscola ||!nomeDiretor ||!email ||!senha) {
    throw new HttpsError('invalid-argument', 'Campos obrigatórios faltando.');
  }
  if (senha.length < 6) {
    throw new HttpsError('invalid-argument', 'Senha precisa ter mínimo 6 caracteres.');
  }

  const emailNormalizado = email.trim().toLowerCase();
  const codigoNormalizado = codigo.trim().toUpperCase();
  let userRecord;

  try {
    userRecord = await auth.createUser({
      email: emailNormalizado,
      password: senha,
      displayName: nomeDiretor.trim(),
    });
    const uid = userRecord.uid;

    const resultado = await db.runTransaction(async (transaction) => {
      const codRef = db.collection('codigos_convite').doc(codigoNormalizado);
      const codSnap = await transaction.get(codRef);

      if (!codSnap.exists()) {
        throw new HttpsError('not-found', 'Código de convite inválido.');
      }
      if (codSnap.data().usado === true) {
        throw new HttpsError('already-exists', 'Código já foi utilizado.');
      }

      const escolaRef = db.collection('escolas').doc();
      transaction.set(escolaRef, {
        nome: nomeEscola.trim(),
        email: emailNormalizado,
        diretorId: uid,
        anoLetivo: new Date().getFullYear(),
        plano: 'basico',
        valorMensal: 50,
        vencimento: null,
        inadimplente: false,
        criadoEm: FieldValue.serverTimestamp(),
        ativo: true
      });

      const userRef = db.collection('usuarios').doc(uid);
      transaction.set(userRef, {
        nome: nomeDiretor.trim(),
        email: emailNormalizado,
        perfil: 'diretor',
        escolaId: escolaRef.id,
        ativo: true,
        criadoEm: FieldValue.serverTimestamp()
      });

      transaction.update(codRef, {
        usado: true,
        usadoPor: uid,
        usadoEm: FieldValue.serverTimestamp()
      });

      return { escolaId: escolaRef.id };
    });

    return { success: true, escolaId: resultado.escolaId };

  } catch (error) {
    if (userRecord) {
      await auth.deleteUser(userRecord.uid).catch(e =>
        console.error('Falha ao deletar user órfão:', e)
      );
    }
    console.error("Erro ao criar escola:", error);
    if (error instanceof HttpsError) throw error;
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
    }
    throw new HttpsError('internal', 'Não foi possível criar a escola. Tente novamente.');
  }
});

// FUNÇÃO 2: CONGELAR ESCOLA - usada no admin.js
exports.congelarEscola = onCall(async (request) => {
  if (!request.auth || request.auth.token.perfil!== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas admin pode congelar escola.');
  }

  const { escolaId, motivo } = request.data;
  if (!escolaId) throw new HttpsError('invalid-argument', 'escolaId obrigatório');

  const escolaRef = db.collection('escolas').doc(escolaId);

  await escolaRef.update({
    ativo: false,
    motivoBloqueio: motivo || 'Suspenso pelo administrador',
    bloqueadoEm: FieldValue.serverTimestamp(),
    bloqueadoPor: request.auth.uid
  });

  // Revoga tokens de todos users da escola pra deslogar na hora
  const users = await db.collection('usuarios').where('escolaId', '==', escolaId).get();
  for (const user of users.docs) {
    await auth.revokeRefreshTokens(user.id).catch(() => {});
  }

  // Log de auditoria
  await db.collection('logs_admin').add({
    data: FieldValue.serverTimestamp(),
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email,
    acao: 'CONGELAR_ESCOLA',
    alvo: escolaId,
    motivo,
    ip: request.rawRequest.ip
  });

  return { success: true };
});

// FUNÇÃO 3: DESCONGELAR ESCOLA
exports.descongelarEscola = onCall(async (request) => {
  if (!request.auth || request.auth.token.perfil!== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas admin.');
  }

  const { escolaId } = request.data;
  if (!escolaId) throw new HttpsError('invalid-argument', 'escolaId obrigatório');

  await db.collection('escolas').doc(escolaId).update({
    ativo: true,
    motivoBloqueio: FieldValue.delete(),
    desbloqueadoEm: FieldValue.serverTimestamp(),
    desbloqueadoPor: request.auth.uid
  });

  await db.collection('logs_admin').add({
    data: FieldValue.serverTimestamp(),
    adminUid: request.auth.uid,
    adminEmail: request.auth.token.email,
    acao: 'DESCONGELAR_ESCOLA',
    alvo: escolaId,
    ip: request.rawRequest.ip
  });

  return { success: true };
});

// FUNÇÃO 4: MODO MANUTENÇÃO
exports.toggleManutencao = onCall(async (request) => {
  if (!request.auth || request.auth.token.perfil!== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas admin.');
  }

  const configRef = db.collection('config').doc('app');
  const config = await configRef.get();
  const novoStatus =!config.data()?.manutencao;

  await configRef.set({ 
    manutencao: novoStatus,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: request.auth.uid
  }, { merge: true });

  await db.collection('logs_admin').add({
    data: FieldValue.serverTimestamp(),
    adminEmail: request.auth.token.email,
    acao: novoStatus? 'ATIVAR_MANUTENCAO' : 'DESATIVAR_MANUTENCAO',
    alvo: 'SISTEMA',
    ip: request.rawRequest.ip
  });

  return { ativo: novoStatus };
});