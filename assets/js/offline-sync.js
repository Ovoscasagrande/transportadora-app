/* ==========================================================================
   OFFLINE-SYNC — fila persistente para o motorista no pátio sem sinal

   O problema real: o motorista chega no embarcador, abre o app, toca em
   "Iniciar jornada" e não tem internet. Sem isso ele perde o registro do dia
   e o custo do caminhão fica sem o km — que é o número travado que alimenta
   todo o resto.

   Como funciona:
   - A operação vai para IndexedDB (fallback localStorage) imediatamente.
   - Se houver rede, sincroniza na hora; se não, fica na fila e sobe depois.
   - Foto vai como Blob no IndexedDB (base64 no localStorage estoura ~5 MB).
   - Ao voltar a conexão, sobe em ORDEM CRONOLÓGICA — senão a despesa chega
     antes da jornada que a originou e a FK quebra.

   Regra: a fila é só do MOTORISTA. Gerência e conferente trabalham com rede;
   dar fila para eles esconderia erro de gravação em vez de resolver.
   ========================================================================== */

const OfflineSync = (() => {
  const DB_NOME = 'transp-offline', DB_VER = 1, STORE = 'fila';
  const CHAVE_LS = 'transp-fila-offline';
  let _db = null;

  function abreDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      if (!('indexedDB' in window)) return reject(new Error('sem IndexedDB'));
      const req = indexedDB.open(DB_NOME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function usaIDB(acao) {
    const db = await abreDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, acao.tx || 'readonly');
      const req = acao.run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  function lsLer() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LS) || '[]'); } catch (e) { return []; }
  }
  function lsGrava(l) {
    try { localStorage.setItem(CHAVE_LS, JSON.stringify(l)); } catch (e) {}
  }

  async function enfileira(op) {
    const item = Object.assign({}, op, {
      criadoEm: new Date().toISOString(), tentativas: 0
    });
    try {
      await usaIDB({ tx: 'readwrite', run: st => st.add(item) });
    } catch (e) {
      const l = lsLer();
      l.push(Object.assign({}, item, { foto: null, fotoNome: op.foto ? op.foto.name : null }));
      lsGrava(l);
    }
    atualizaBanner();
    if (navigator.onLine) sincroniza();
    return true;
  }

  async function tamanho() {
    try { return (await usaIDB({ run: st => st.count() })) || 0; }
    catch (e) { return lsLer().length; }
  }

  async function lista() {
    try { return (await usaIDB({ run: st => st.getAll() })) || []; }
    catch (e) { return lsLer(); }
  }

  async function remove(id) {
    try { await usaIDB({ tx: 'readwrite', run: st => st.delete(id) }); }
    catch (e) { lsGrava(lsLer().filter(x => x.id !== id)); }
  }

  async function marcaErro(item, msg) {
    try {
      const db = await abreDB();
      await new Promise(res => {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const r = st.get(item.id);
        r.onsuccess = () => {
          const a = r.result;
          if (a) {
            a.tentativas = (a.tentativas || 0) + 1;
            a.ultimoErro = msg;
            a.ultimoErroEm = new Date().toISOString();
            st.put(a);
          }
        };
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (e) {}
  }

  let _sincronizando = false;

  async function sincroniza() {
    if (_sincronizando || !navigator.onLine) return { enviados: 0 };
    _sincronizando = true;
    let enviados = 0;

    try {
      const fila = await lista();
      fila.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
      for (const item of fila) {
        if ((item.tentativas || 0) >= 3) continue;
        try {
          await executa(item);
          await remove(item.id);
          enviados++;
        } catch (e) {
          const msg = (e && e.message) || String(e);
          if (!navigator.onLine || /fetch|network|Failed to fetch/i.test(msg)) throw e;
          await marcaErro(item, msg);
        }
      }
    } catch (e) {
      /* rede caiu no meio: o que subiu já subiu */
    } finally {
      _sincronizando = false;
      atualizaBanner();
    }

    if (enviados > 0) {
      try { toast(enviados + (enviados > 1 ? ' registros sincronizados' : ' registro sincronizado')); } catch (e) {}
    }
    return { enviados: enviados };
  }

  async function executa(item) {
    const dados = Object.assign({}, item.dados || {});
    if (item.foto) {
      const ext = ((item.fotoNome || 'foto.jpg').split('.').pop() || 'jpg').toLowerCase();
      const caminho = 'comprovantes/' + ((ME && ME.id) || 'anon') + '/' + Date.now() + '.' + ext;
      const r = await sb.storage.from('documentos').upload(caminho, item.foto, {
        contentType: item.foto.type || 'image/jpeg', upsert: false
      });
      if (r.error && !/already exists|duplicate/i.test(r.error.message)) throw r.error;
      if (item.campoFoto) dados[item.campoFoto] = caminho;
    }
    if (item.acao === 'insert') {
      const r = await sb.from(item.tabela).insert(dados);
      if (r.error) throw r.error;
      return dados;
    }
    if (item.acao === 'update') {
      const r = await sb.from(item.tabela).update(dados).eq('id', item.alvoId);
      if (r.error) throw r.error;
      return true;
    }
    if (item.acao === 'rpc') {
      const r = await sb.rpc(item.funcao, dados);
      if (r.error) throw r.error;
      return true;
    }
    return true;
  }

  async function atualizaBanner() {
    const el = document.getElementById('offline-banner');
    if (!el) return;
    const n = await tamanho();
    const offline = !navigator.onLine;
    if (!offline && n === 0) { el.classList.add('esconde'); return; }
    el.classList.remove('esconde');
    el.innerHTML =
      '<div class="off-linha">' +
        '<span class="off-ic">' + icon(offline ? 'wifi-off' : 'refresh-cw') + '</span>' +
        '<span class="off-txt">' + (offline
          ? 'Sem sinal' + (n ? ' · ' + n + ' registro' + (n > 1 ? 's' : '') + ' aguardando envio' : '')
          : n + ' registro' + (n > 1 ? 's' : '') + ' aguardando envio') + '</span>' +
        (n ? '<button class="off-btn" id="off-sync">Sincronizar agora</button>' : '') +
      '</div>';
    const b = document.getElementById('off-sync');
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = 'Enviando…'; await sincroniza(); };
  }

  function inicia() {
    window.addEventListener('online', () => { atualizaBanner(); sincroniza(); });
    window.addEventListener('offline', atualizaBanner);
    atualizaBanner();
    if (navigator.onLine) setTimeout(sincroniza, 1500);
    setInterval(() => { if (navigator.onLine) sincroniza(); }, 60000);
  }

  return { enfileira, tamanho, lista, remove, sincroniza, atualizaBanner, inicia };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => OfflineSync.inicia());
} else { OfflineSync.inicia(); }
window.OfflineSync = OfflineSync;
