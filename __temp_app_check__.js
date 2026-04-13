
    let listaPokemons = [];
    let navegacaoAtual = [];
    let indiceNavegacaoAtual = -1;
    let pokemonAtual = null;
    let spriteAtualShiny = false;
    let sugestoesAbertas = false;
    let pokebolasAtuaisSugestao = {};
    let historicoAberto = false;
    let modoAtual = "pokemon";
    const pokebolasSugestao = ["classica", "great", "ultra", "master", "friend"];
    const chaveHistorico = "pokedex-historico-recente";
    const endpointTraducao = "https://translate.argosopentech.com/translate";
    const googleTranslateApiKey = ""; // Adicione sua chave do Google Cloud Translate aqui, se quiser usar o Google como fallback.
    const endpointTcg = "https://api.tcgdex.net/v2";
    let historicoPesquisas = [];
    const cacheTraducoes = new Map();
    const cacheCartasTcg = new Map();
    const cachePacotesTcg = new Map();
    const cacheCartasPacoteTcg = new Map();
    let abaResultadoAtual = "informacoes";
    let cartasTcgAtuais = [];
    let cartasTcgFiltradasAtuais = [];
    let paginaTcgAtual = 0;
    let nomeExibicaoTcgAtual = "";
    let listaPokemonsBusca = [];
    let debounceBuscaTimer = null;
    let debounceBuscaPacoteTimer = null;
    let sequenciaBuscaPokemon = 0;
    let sequenciaBuscaPacotes = 0;
    let sequenciaSelecaoPacote = 0;
    const cachePokemonDetalhes = new Map();
    const cacheDetalhesTipo = new Map();
    const cacheDetalhesCartaTcg = new Map();
    const tiltAnimationFrames = new WeakMap();
    const debounceBuscaMs = 120;
    const debounceBuscaPacoteMs = 220;
    const limiteConcorrenciaTcg = 6;

    const tiposPT = {
      fire: { nome: "Fogo", emoji: "??" },
      water: { nome: "Água", emoji: "??" },
      grass: { nome: "Planta", emoji: "??" },
      electric: { nome: "Elétrico", emoji: "?" },
      ice: { nome: "Gelo", emoji: "??" },
      fighting: { nome: "Lutador", emoji: "??" },
      poison: { nome: "Veneno", emoji: "??" },
      ground: { nome: "Terra", emoji: "??" },
      flying: { nome: "Voador", emoji: "??" },
      psychic: { nome: "Psíquico", emoji: "??" },
      bug: { nome: "Inseto", emoji: "??" },
      rock: { nome: "Pedra", emoji: "??" },
      ghost: { nome: "Fantasma", emoji: "??" },
      dragon: { nome: "Dragão", emoji: "??" },
      dark: { nome: "Sombrio", emoji: "??" },
      steel: { nome: "Aço", emoji: "??" },
      fairy: { nome: "Fada", emoji: "?" },
      normal: { nome: "Normal", emoji: "?" }
    };

    async function carregarLista() {
      const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1000");
      const data = await res.json();
      listaPokemons = data.results;
      listaPokemonsBusca = data.results.map(pokemon => ({
        ...pokemon,
        searchKey: pokemon.name.toLowerCase()
      }));
    }

    function mapearComLimite(itens, limite, iterador) {
      if (!Array.isArray(itens) || itens.length === 0) {
        return Promise.resolve([]);
      }

      const resultados = new Array(itens.length);
      let indiceAtual = 0;

      async function worker() {
        while (indiceAtual < itens.length) {
          const indice = indiceAtual++;
          resultados[indice] = await iterador(itens[indice], indice);
        }
      }

      const totalWorkers = Math.min(limite, itens.length);
      return Promise.all(Array.from({ length: totalWorkers }, worker)).then(() => resultados);
    }

    async function obterDetalhesTipo(url) {
      if (cacheDetalhesTipo.has(url)) {
        return cacheDetalhesTipo.get(url);
      }

      const promessa = buscarJson(url);
      cacheDetalhesTipo.set(url, promessa);
      return promessa;
    }

    async function obterDadosPokemon(nome) {
      const chave = String(nome || "").toLowerCase();

      if (cachePokemonDetalhes.has(chave)) {
        return cachePokemonDetalhes.get(chave);
      }

      const promessa = (async () => {
        const data = await buscarJson(`https://pokeapi.co/api/v2/pokemon/${chave}`);
        const [especie, relacoesDeDano] = await Promise.all([
          buscarJson(data.species.url),
          obterRelacoesDeDano(data.types)
        ]);
        const evolucaoData = await buscarJson(especie.evolution_chain.url);

        return { data, especie, evolucaoData, relacoesDeDano };
      })();

      cachePokemonDetalhes.set(chave, promessa);
      return promessa;
    }

    async function buscarDetalhesCartaTcg(cardId) {
      if (cacheDetalhesCartaTcg.has(cardId)) {
        return cacheDetalhesCartaTcg.get(cardId);
      }

      const promessa = (async () => {
        const cartaEn = await buscarJson(`${endpointTcg}/en/cards/${cardId}`);
        let cartaPt = null;

        try {
          cartaPt = await buscarJson(`${endpointTcg}/pt-br/cards/${cardId}`);
        } catch {
          try {
            cartaPt = await buscarJson(`${endpointTcg}/pt/cards/${cardId}`);
          } catch {
            cartaPt = null;
          }
        }

        return {
          nomePt: cartaPt?.name || cartaEn.name || "Carta Pokémon",
          nomeEn: cartaEn.name || "Carta Pokémon",
          possuiVersaoPt: Boolean(cartaPt),
          imagemSmallPt: montarUrlImagemTcg(cartaPt?.image, "low"),
          imagemLargePt: montarUrlImagemTcg(cartaPt?.image, "high"),
          imagemSmallEn: montarUrlImagemTcg(cartaEn.image, "low"),
          imagemLargeEn: montarUrlImagemTcg(cartaEn.image, "high"),
          imagemSmallPtPng: montarUrlImagemTcg(cartaPt?.image, "low", "png"),
          imagemLargePtPng: montarUrlImagemTcg(cartaPt?.image, "high", "png"),
          imagemSmallEnPng: montarUrlImagemTcg(cartaEn.image, "low", "png"),
          imagemLargeEnPng: montarUrlImagemTcg(cartaEn.image, "high", "png"),
          setPt: cartaPt?.set?.name || cartaEn.set?.name || "Set não informado",
          setEn: cartaEn.set?.name || "Set não informado",
          raridadePt: traduzirRaridadeTcg(cartaPt?.rarity || cartaEn.rarity || "Raridade não informada"),
          raridadeEn: cartaEn.rarity || "Raridade não informada",
          numero: cartaPt?.localId || cartaEn.localId || "-"
        };
      })();

      cacheDetalhesCartaTcg.set(cardId, promessa);
      return promessa;
    }

    carregarHistorico();
    carregarLista();
    renderizarHistorico();

    function buscarSugestoes() {
      clearTimeout(debounceBuscaTimer);
      debounceBuscaTimer = setTimeout(executarBuscaSugestoes, debounceBuscaMs);
    }

    function executarBuscaSugestoes() {
      const valor = document.getElementById("busca").value.toLowerCase();
      const sugestoesDiv = document.getElementById("sugestoes");

      sugestoesDiv.innerHTML = "";

      if (valor.length === 0) {
        sugestoesAbertas = false;
        pokebolasAtuaisSugestao = {};
        return;
      }

      if (!sugestoesAbertas) {
        sugestoesAbertas = true;
        pokebolasAtuaisSugestao = {};
      }

      const filtrados = listaPokemonsBusca
        .filter(pokemon => pokemon.searchKey.includes(valor))
        .slice(0, 10);

      const fragmento = document.createDocumentFragment();

      filtrados.forEach(pokemon => {
        if (!pokebolasAtuaisSugestao[pokemon.name]) {
          pokebolasAtuaisSugestao[pokemon.name] = sortearPokebola();
        }

        const div = document.createElement("div");
        div.classList.add("item");
        const pokebola = document.createElement("span");
        pokebola.className = `pokebola-mini pokebola-${pokebolasAtuaisSugestao[pokemon.name]}`;
        const texto = document.createElement("span");
        texto.textContent = pokemon.name;
        div.append(pokebola, texto);

        div.onclick = () => selecionarPokemon(pokemon.name, true);

        fragmento.appendChild(div);
      });

      sugestoesDiv.appendChild(fragmento);
    }

    function sortearPokebola() {
      const indice = Math.floor(Math.random() * pokebolasSugestao.length);
      return pokebolasSugestao[indice];
    }

    function carregarHistorico() {
      const salvo = localStorage.getItem(chaveHistorico);
      historicoPesquisas = salvo ? JSON.parse(salvo) : [];
    }

    function abrirHistorico() {
      historicoAberto = true;
      document.getElementById("historico").classList.add("aberto");
      document.getElementById("historicoOverlay").classList.add("ativo");
    }

    function fecharHistorico() {
      historicoAberto = false;
      document.getElementById("historico").classList.remove("aberto");
      document.getElementById("historicoOverlay").classList.remove("ativo");
    }

    function toggleHistorico() {
      if (historicoAberto) {
        fecharHistorico();
        return;
      }

      abrirHistorico();
    }

    function salvarNoHistorico(nome) {
      historicoPesquisas = [
        nome,
        ...historicoPesquisas.filter(item => item !== nome)
      ].slice(0, 8);

      localStorage.setItem(chaveHistorico, JSON.stringify(historicoPesquisas));
      renderizarHistorico();
    }

    function renderizarHistorico() {
      const historicoDiv = document.getElementById("historico");
      historicoDiv.innerHTML = `
        <div class="historico-card">
          <div class="historico-topo">
            <h3>Pesquisas recentes</h3>
            <button type="button" class="historico-limpar" onclick="limparHistorico()">Limpar</button>
          </div>
          <div class="historico-lista">
            ${historicoPesquisas.length > 0 ? historicoPesquisas.map(nome => `
              <button type="button" class="historico-item" onclick="selecionarPokemon('${nome}', true)">
                <span class="pokebola-mini pokebola-${sortearPokebola()}"></span>
                <span>${nome}</span>
              </button>
            `).join("") : `<p class="historico-vazio">Seu histórico vai aparecer aqui.</p>`}
          </div>
        </div>
      `;
    }

    function limparHistorico() {
      historicoPesquisas = [];
      localStorage.removeItem(chaveHistorico);
      renderizarHistorico();
    }

    function extrairCadeiaEvolucao(no, lista = []) {
      lista.push(no.species.name);

      no.evolves_to.forEach(proximaEvolucao => {
        extrairCadeiaEvolucao(proximaEvolucao, lista);
      });

      return lista;
    }

    function traduzirVersaoPokemon(sufixo) {
      const traducoes = {
        disguised: "Disfarçado",
        busted: "Revelado",
        starter: "Inicial",
        school: "Cardume",
        solo: "Solo",
        ordinary: "Comum",
        resolute: "Resoluto",
        aria: "Ária",
        pirouette: "Pirouette",
        attack: "Ataque",
        defense: "Defesa",
        speed: "Velocidade",
        normal: "Normal",
        origin: "Origem",
        altered: "Alterada",
        land: "Terrestre",
        sky: "Céu",
        red: "Vermelho",
        blue: "Azul",
        white: "Branco",
        black: "Preto",
        standard: "Padrão",
        zen: "Zen",
        incarnate: "Encarnada",
        therian: "Therian",
        male: "Macho",
        female: "Fêmea",
        average: "Médio",
        small: "Pequeno",
        large: "Grande",
        super: "Super",
        meteor: "Meteoro",
        core: "Núcleo",
        baile: "Baile",
        pompom: "Pompom",
        pau: "Pa'u",
        sensu: "Sensu",
        midday: "Meio-dia",
        midnight: "Meia-noite",
        dusk: "Crepúsculo",
        ice: "Gelo",
        noice: "Sem Gelo",
        hangry: "Faminto",
        full: "Completo",
        crown: "Coroa",
        hero: "Herói",
        zero: "Zero",
        palafin: "Palafin",
        aqua: "Aquático",
        blaze: "Chama",
        combat: "Combate",
        rapid: "Rápido",
        single: "Golpe Único",
        strike: "Golpe Decisivo"
      };

      return sufixo
        .split("-")
        .map(parte => traducoes[parte] || parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" ");
    }

    function formatarNomeExibicao(nomeBase, nomePokemon) {
      if (!nomePokemon.includes("-")) {
        return nomeBase;
      }

      const partes = nomePokemon.split("-");
      const sufixo = partes.slice(1).join(" ");
      const sufixoFormatadoEn = sufixo
        .replace(/\bmega\b/g, "Mega")
        .replace(/\bgmax\b/g, "Gigantamax")
        .replace(/\balola\b/g, "Alola")
        .replace(/\bgalar\b/g, "Galar")
        .replace(/\bhisui\b/g, "Hisui")
        .replace(/\bpaldea\b/g, "Paldea")
        .replace(/\bcap\b/g, "Cap")
        .replace(/\bx\b/g, "X")
        .replace(/\by\b/g, "Y")
        .replace(/\b([a-z])/g, letra => letra.toUpperCase());

      const sufixoFormatadoPt = traduzirVersaoPokemon(partes.slice(1).join("-"));

      if (sufixoFormatadoPt === sufixoFormatadoEn) {
        return `${nomeBase} (${sufixoFormatadoPt})`;
      }

      return `${nomeBase} (${sufixoFormatadoPt} / ${sufixoFormatadoEn})`;
    }

    function montarNavegacaoPokemon(cadeia, variedades, especieNome) {
      const listaFinal = [];

      cadeia.forEach(nomeDaCadeia => {
        if (nomeDaCadeia === especieNome) {
          variedades.forEach(variedade => {
            if (!listaFinal.includes(variedade)) {
              listaFinal.push(variedade);
            }
          });
          return;
        }

        if (!listaFinal.includes(nomeDaCadeia)) {
          listaFinal.push(nomeDaCadeia);
        }
      });

      return listaFinal;
    }

    function navegarEvolucao(direcao) {
      const proximoIndice = indiceNavegacaoAtual + direcao;

      if (proximoIndice < 0 || proximoIndice >= navegacaoAtual.length) {
        return;
      }

      selecionarPokemon(navegacaoAtual[proximoIndice], false);
    }

    function alternarShiny() {
      if (!pokemonAtual?.sprites?.front_shiny) {
        return;
      }

      spriteAtualShiny = !spriteAtualShiny;

      const imagemPokemon = document.getElementById("pokemonSprite");
      const botaoShiny = document.getElementById("botaoShiny");

      if (!imagemPokemon || !botaoShiny) {
        return;
      }

      imagemPokemon.src = spriteAtualShiny
        ? pokemonAtual.sprites.front_shiny
        : pokemonAtual.sprites.front_default;

      botaoShiny.classList.toggle("ativo", spriteAtualShiny);
      botaoShiny.setAttribute(
        "aria-pressed",
        spriteAtualShiny ? "true" : "false"
      );
      botaoShiny.title = spriteAtualShiny
        ? "Voltar para a versão normal"
        : "Mostrar versão shiny";

      atualizarFiltroCartasTcg();
    }

    function capitalizarTexto(texto) {
      return texto
        .split("-")
        .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" ");
    }

    function formatarHabilidade(nome) {
      const traducoes = {
        disguise: "Disfarce",
        cursed_body: "Corpo Amaldiçoado",
        levitate: "Levitação",
        overgrow: "Crescer Demais",
        blaze: "Chama",
        torrent: "Torrente",
        static: "Estática",
        adaptability: "Adaptabilidade",
        synchronize: "Sincronismo",
        pressure: "Pressão",
        sturdy: "Robustez",
        intimidate: "Intimidação",
        swarm: "Enxame",
        inner_focus: "Foco Interno",
        technician: "Técnico"
      };

      const chave = nome.replace(/-/g, "_");
      return traducoes[chave] || capitalizarTexto(nome);
    }

    function obterDescricaoPokemon(especie) {
      const idiomasPrioritarios = ["pt-BR", "pt", "en"];
      const entrada = idiomasPrioritarios
        .map(idioma =>
          especie.flavor_text_entries.find(
            item => item.language.name.toLowerCase() === idioma.toLowerCase()
          )
        )
        .find(Boolean);
      const texto = entrada?.flavor_text || "Descrição não disponível.";

      return {
        idioma: entrada?.language?.name?.toLowerCase() || "",
        texto: texto.replace(/[\n\f]/g, " ")
      };
    }

    async function traduzirComGoogleCloud(texto, idiomaOrigem = "auto", idiomaDestino = "pt") {
      if (!googleTranslateApiKey) {
        throw new Error("Google Translate API key não configurada.");
      }

      const url = `https://translation.googleapis.com/language/translate/v2?key=${googleTranslateApiKey}`;
      const body = {
        q: texto,
        target: idiomaDestino,
        format: "text"
      };

      if (idiomaOrigem && idiomaOrigem.toLowerCase() !== "auto") {
        body.source = idiomaOrigem;
      }

      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!resposta.ok) {
        throw new Error("Falha ao traduzir com Google Cloud.");
      }

      const dadosTraducao = await resposta.json();
      return dadosTraducao.data?.translations?.[0]?.translatedText?.trim() || texto;
    }

    async function traduzirComGoogleGratuito(texto, idiomaOrigem = "auto", idiomaDestino = "pt") {
      const source = idiomaOrigem && idiomaOrigem.toLowerCase() !== "auto"
        ? `&sl=${encodeURIComponent(idiomaOrigem)}`
        : "&sl=auto";
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx${source}&tl=${encodeURIComponent(idiomaDestino)}&dt=t&q=${encodeURIComponent(texto)}`;
      const resposta = await fetch(url);

      if (!resposta.ok) {
        throw new Error("Falha ao traduzir com Google gratuito.");
      }

      const dadosTraducao = await resposta.json();
      if (!Array.isArray(dadosTraducao) || !Array.isArray(dadosTraducao[0])) {
        throw new Error("Resposta de tradução inválida.");
      }

      return dadosTraducao[0].map(fragmento => fragmento[0]).join("").trim() || texto;
    }

    async function traduzirTextoParaPortugues(texto, idiomaOrigem = "auto") {
      const chaveCache = `${idiomaOrigem}:${texto}`;

      if (cacheTraducoes.has(chaveCache)) {
        return cacheTraducoes.get(chaveCache);
      }

      let textoTraduzido = texto;
      let ultimoErro;

      try {
        const resposta = await fetch(endpointTraducao, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            q: texto,
            source: idiomaOrigem || "auto",
            target: "pt",
            format: "text"
          })
        });

        if (!resposta.ok) {
          throw new Error("Falha no serviço de tradução padrão.");
        }

        const dadosTraducao = await resposta.json();
        textoTraduzido = dadosTraducao.translatedText?.trim() || dadosTraducao.data?.translations?.[0]?.translatedText?.trim() || texto;
      } catch (erro) {
        ultimoErro = erro;
        if (googleTranslateApiKey) {
          textoTraduzido = await traduzirComGoogleCloud(texto, idiomaOrigem || "auto", "pt");
        } else {
          textoTraduzido = await traduzirComGoogleGratuito(texto, idiomaOrigem || "auto", "pt");
        }
      }

      cacheTraducoes.set(chaveCache, textoTraduzido);
      return textoTraduzido;
    }

    async function traduzirTextoParaIngles(texto, idiomaOrigem = "auto") {
      const chaveCache = `en:${idiomaOrigem}:${texto}`;

      if (cacheTraducoes.has(chaveCache)) {
        return cacheTraducoes.get(chaveCache);
      }

      let textoTraduzido = texto;
      let ultimoErro;

      try {
        const resposta = await fetch(endpointTraducao, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            q: texto,
            source: idiomaOrigem || "auto",
            target: "en",
            format: "text"
          })
        });

        if (!resposta.ok) {
          throw new Error("Falha no serviço de tradução padrão.");
        }

        const dadosTraducao = await resposta.json();
        textoTraduzido = dadosTraducao.translatedText?.trim() || dadosTraducao.data?.translations?.[0]?.translatedText?.trim() || texto;
      } catch (erro) {
        ultimoErro = erro;
        if (googleTranslateApiKey) {
          textoTraduzido = await traduzirComGoogleCloud(texto, idiomaOrigem || "auto", "en");
        } else {
          textoTraduzido = await traduzirComGoogleGratuito(texto, idiomaOrigem || "auto", "en");
        }
      }

      cacheTraducoes.set(chaveCache, textoTraduzido);
      return textoTraduzido;
    }

    async function obterRelacoesDeDano(tipos) {
      const multiplicadores = {};

      tipos.forEach(tipo => {
        multiplicadores[tipo.type.name] = 1;
      });

      const respostas = await Promise.all(
        tipos.map(tipo => obterDetalhesTipo(tipo.type.url))
      );

      respostas.forEach(tipoData => {
        tipoData.damage_relations.double_damage_from.forEach(tipo => {
          multiplicadores[tipo.name] = (multiplicadores[tipo.name] || 1) * 2;
        });

        tipoData.damage_relations.half_damage_from.forEach(tipo => {
          multiplicadores[tipo.name] = (multiplicadores[tipo.name] || 1) * 0.5;
        });

        tipoData.damage_relations.no_damage_from.forEach(tipo => {
          multiplicadores[tipo.name] = 0;
        });
      });

      const fraquezas = [];
      const resistencias = [];
      const imunidades = [];

      Object.entries(multiplicadores).forEach(([tipo, valor]) => {
        const tipoFormatado = tiposPT[tipo]
          ? `${tiposPT[tipo].emoji} ${tiposPT[tipo].nome}`
          : capitalizarTexto(tipo);

        if (valor === 0) {
          imunidades.push(tipoFormatado);
          return;
        }

        if (valor > 1) {
          fraquezas.push(`${tipoFormatado} x${valor}`);
          return;
        }

        if (valor < 1) {
          resistencias.push(`${tipoFormatado} x${valor}`);
        }
      });

      return { fraquezas, resistencias, imunidades };
    }

    function renderizarListaChips(lista, classeVazia, textoVazio) {
      if (lista.length === 0) {
        return `<span class="${classeVazia}">${textoVazio}</span>`;
      }

      return lista.map(item => `<span class="chip-info">${item}</span>`).join("");
    }

    function escaparHtml(texto = "") {
      return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function montarUrlImagemTcg(urlBase, qualidade = "low", extensao = "webp") {
      if (!urlBase) {
        return "";
      }

      return `${urlBase}/${qualidade}.${extensao}`;
    }

    function tratarErroImagemTcg(imagem) {
      if (!imagem?.dataset?.fallbackPng) {
        return;
      }

      if (imagem.dataset.fallbackAplicado === "true") {
        imagem.style.display = "none";
        return;
      }

      imagem.dataset.fallbackAplicado = "true";
      imagem.src = imagem.dataset.fallbackPng;
    }

    function formatarCampoBilingue(valorPt, valorEn) {
      if (!valorPt && !valorEn) {
        return "-";
      }

      if (!valorPt) {
        return valorEn;
      }

      if (!valorEn || normalizarNomeComparacao(valorPt) === normalizarNomeComparacao(valorEn)) {
        return valorPt;
      }

      return `${valorPt} / ${valorEn}`;
    }

    function traduzirRaridadeTcg(valor) {
      const mapa = {
        none: "Sem raridade",
        common: "Comum",
        uncommon: "Incomum",
        rare: "Rara",
        "double rare": "Dupla rara",
        "triple rare": "Tripla rara",
        "ultra rare": "Ultra rara",
        "illustration rare": "Rara ilustrada",
        "special illustration rare": "Rara ilustrada especial",
        "hyper rare": "Hiper rara",
        promo: "Promocional"
      };

      const chave = String(valor || "").trim().toLowerCase();
      return mapa[chave] || valor;
    }

    function efeito3dCarta(evento, elemento) {
      if (elemento.classList.contains("ampliada")) {
        return;
      }

      const ultimoFrame = tiltAnimationFrames.get(elemento);
      if (ultimoFrame) {
        cancelAnimationFrame(ultimoFrame);
      }

      const clientX = evento.clientX;
      const clientY = evento.clientY;
      const frame = requestAnimationFrame(() => {
        const rect = elemento.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const rotateY = ((x / rect.width) - 0.5) * 16;
        const rotateX = ((y / rect.height) - 0.5) * -16;

        elemento.style.setProperty("--rot-x", `${rotateX}deg`);
        elemento.style.setProperty("--rot-y", `${rotateY}deg`);
      });

      tiltAnimationFrames.set(elemento, frame);
    }

    function resetarEfeito3dCarta(elemento) {
      const ultimoFrame = tiltAnimationFrames.get(elemento);
      if (ultimoFrame) {
        cancelAnimationFrame(ultimoFrame);
        tiltAnimationFrames.delete(elemento);
      }

      elemento.style.setProperty("--rot-x", "0deg");
      elemento.style.setProperty("--rot-y", "0deg");
    }

    function serializarPayloadHtml(objeto) {
      return encodeURIComponent(JSON.stringify(objeto)).replace(/'/g, "%27");
    }

    function formatarNomeBuscaTcg(nomePokemon) {
      return nomePokemon
        .split("-")[0]
        .split(" ")
        .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" ");
    }

    function normalizarNomeComparacao(texto = "") {
      return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
    }

    function montarBuscaEspecificaTcg(nomePokemon) {
      const partes = nomePokemon.split("-");
      const base = capitalizarTexto(partes[0]);
      const sufixos = partes.slice(1);
      const aliases = [base];
      let restrito = false;

      if (sufixos.includes("alola")) {
        aliases.unshift(`Alolan ${base}`);
        restrito = true;
      }

      if (sufixos.includes("galar")) {
        aliases.unshift(`Galarian ${base}`);
        restrito = true;
      }

      if (sufixos.includes("hisui")) {
        aliases.unshift(`Hisuian ${base}`);
        restrito = true;
      }

      if (sufixos.includes("paldea")) {
        aliases.unshift(`Paldean ${base}`);
        restrito = true;
      }

      if (sufixos.includes("mega")) {
        const temX = sufixos.includes("x");
        const temY = sufixos.includes("y");

        if (temX) {
          aliases.unshift(`Mega ${base} X`);
        }

        if (temY) {
          aliases.unshift(`Mega ${base} Y`);
        }

        aliases.unshift(`M ${base} EX`, `M ${base}-EX`);
        restrito = true;
      }

      if (sufixos.includes("gmax")) {
        aliases.unshift(`${base} VMAX`, `Gigantamax ${base}`);
        restrito = true;
      }

      return {
        base,
        aliases: [...new Set(aliases)],
        restrito
      };
    }

    function cartaCombinaComBusca(nomeCarta, busca) {
      const nomeNormalizado = normalizarNomeComparacao(nomeCarta);
      const aliasesNormalizados = busca.aliases.map(alias => normalizarNomeComparacao(alias));
      const baseNormalizada = normalizarNomeComparacao(busca.base);

      if (aliasesNormalizados.some(alias => nomeNormalizado === alias || nomeNormalizado.includes(alias))) {
        return true;
      }

      if (!busca.restrito) {
        return nomeNormalizado === baseNormalizada || nomeNormalizado.includes(baseNormalizada);
      }

      return false;
    }

    function deduplicarECurarCartas(cartas, limite = 6) {
      const vistas = new Set();
      const unicas = [];

      const cartasOrdenadas = [...cartas].sort((a, b) => {
        const scoreA = (a.imagemSmallPt ? 3 : 0) + (a.nomePt !== a.nomeEn ? 2 : 0);
        const scoreB = (b.imagemSmallPt ? 3 : 0) + (b.nomePt !== b.nomeEn ? 2 : 0);
        return scoreB - scoreA;
      });

      cartasOrdenadas.forEach(carta => {
        const chaveImagem = carta.imagemLargePt || carta.imagemLargeEn || carta.imagemSmallPt || carta.imagemSmallEn;
        const chaveTexto = `${normalizarNomeComparacao(carta.nomeEn)}|${normalizarNomeComparacao(carta.setEn)}|${carta.numero}`;
        const chave = `${chaveImagem}|${chaveTexto}`;

        if (vistas.has(chave)) {
          return;
        }

        vistas.add(chave);
        unicas.push(carta);
      });

      const porSet = [];
      const setsUsados = new Set();

      unicas.forEach(carta => {
        const setKey = normalizarNomeComparacao(carta.setEn);

        if (!setsUsados.has(setKey) && porSet.length < limite) {
          porSet.push(carta);
          setsUsados.add(setKey);
        }
      });

      if (porSet.length < limite) {
        unicas.forEach(carta => {
          if (porSet.length >= limite) {
            return;
          }

          if (!porSet.includes(carta)) {
            porSet.push(carta);
          }
        });
      }

      return porSet.slice(0, limite);
    }

    function cartaEhEspecialShinyTcg(carta) {
      const campos = [
        carta.nomePt,
        carta.nomeEn,
        carta.setPt,
        carta.setEn,
        carta.raridadePt,
        carta.raridadeEn
      ]
        .filter(Boolean)
        .map(valor => normalizarNomeComparacao(valor));

      const marcadores = [
        "shiny",
        "shining",
        "radiant",
        "shiny vault",
        "fates",
        "brilhante",
        "radiante",
        "cromatico"
      ];

      return campos.some(campo => marcadores.some(marcador => campo.includes(marcador)));
    }

    function atualizarFiltroCartasTcg() {
      const usarShiny = spriteAtualShiny;
      const cartasShiny = cartasTcgAtuais.filter(cartaEhEspecialShinyTcg);
      cartasTcgFiltradasAtuais = usarShiny ? cartasShiny : cartasTcgAtuais;

      paginaTcgAtual = 0;
      renderizarPainelTcgAtual();
    }

    function obterCartasPaginaAtual() {
      const itensPorPagina = 6;
      const inicio = paginaTcgAtual * itensPorPagina;
      return cartasTcgFiltradasAtuais.slice(inicio, inicio + itensPorPagina);
    }

    function renderizarPainelTcgAtual() {
      const painel = document.getElementById("painelTcgConteudo");

      if (!painel) {
        return;
      }

      painel.innerHTML = renderizarSecaoTcg(
        obterCartasPaginaAtual(),
        nomeExibicaoTcgAtual,
        cartasTcgFiltradasAtuais.length,
        paginaTcgAtual,
        spriteAtualShiny
      );
    }

    function navegarPaginaTcg(direcao) {
      const totalPaginas = Math.ceil(cartasTcgFiltradasAtuais.length / 6);
      const proximaPagina = paginaTcgAtual + direcao;

      if (proximaPagina < 0 || proximaPagina >= totalPaginas) {
        return;
      }

      paginaTcgAtual = proximaPagina;
      renderizarPainelTcgAtual();
    }

    async function buscarJson(url) {
      const resposta = await fetch(url);

      if (!resposta.ok) {
        throw new Error(`Falha ao buscar ${url}`);
      }

      return resposta.json();
    }

    async function buscarCartasTcg(nomePokemon) {
      const chave = nomePokemon.toLowerCase();

      if (cacheCartasTcg.has(chave)) {
        return cacheCartasTcg.get(chave);
      }

      const busca = montarBuscaEspecificaTcg(nomePokemon);
      const nomeBusca = formatarNomeBuscaTcg(nomePokemon);
      const itensPorPaginaApi = 100;
      let paginaApi = 1;
      let cartasBase = [];

      while (true) {
        const query = new URLSearchParams({
          name: nomeBusca,
          "pagination:itemsPerPage": `${itensPorPaginaApi}`,
          "pagination:page": `${paginaApi}`,
          "sort:field": "localId",
          "sort:order": "ASC"
        });

        const cartasEn = await buscarJson(`${endpointTcg}/en/cards?${query.toString()}`);
        const cartasFiltradas = Array.isArray(cartasEn)
          ? cartasEn.filter(carta => cartaCombinaComBusca(carta.name, busca))
          : [];

        cartasBase = cartasBase.concat(cartasFiltradas);

        if (!Array.isArray(cartasEn) || cartasEn.length < itensPorPaginaApi || paginaApi >= 5) {
          break;
        }

        paginaApi += 1;
      }

      const cartasDetalhadas = await mapearComLimite(
        cartasBase,
        limiteConcorrenciaTcg,
        cartaBase => buscarDetalhesCartaTcg(cartaBase.id)
      );

      const cartasCuradas = deduplicarECurarCartas(cartasDetalhadas, 999);

      cacheCartasTcg.set(chave, cartasCuradas);
      return cartasCuradas;
    }

    function renderizarSecaoTcg(cartas, nomePokemon, totalCartas = 0, paginaAtual = 0, modoShiny = false) {
      if (!cartas || cartas.length === 0) {
        return `
          <div class="bloco-info bloco-info-sem-borda">
            <h3>Cartas TCG</h3>
            <p class="mensagem-tcg">
              ${modoShiny
                ? `Nenhuma carta especial/shiny encontrada para ${escaparHtml(nomePokemon)}.`
                : `Nenhuma carta encontrada para ${escaparHtml(nomePokemon)}.`}
            </p>
          </div>
        `;
      }

      const cartasHtml = cartas.map(carta => {
        const payload = serializarPayloadHtml(carta);
        const imagemPrincipal = carta.imagemSmallPt || carta.imagemSmallEn || carta.imagemLargePt || carta.imagemLargeEn;
        const imagemFallback = carta.imagemSmallPtPng || carta.imagemSmallEnPng || carta.imagemLargePtPng || carta.imagemLargeEnPng;

        return `
          <button
            type="button"
            class="carta-tcg-item"
            onclick="abrirModalCarta(decodeURIComponent('${payload}'))"
            onmousemove="efeito3dCarta(event, this)"
            onmouseleave="resetarEfeito3dCarta(this)"
            aria-label="Abrir carta ${escaparHtml(carta.nomePt)}"
          >
            <img
              src="${escaparHtml(imagemPrincipal)}"
              data-fallback-png="${escaparHtml(imagemFallback)}"
              onerror="tratarErroImagemTcg(this)"
              alt="Carta TCG de ${escaparHtml(carta.nomePt)}"
            >
            <span class="carta-tcg-nome">${escaparHtml(carta.nomePt)}</span>
            <span class="carta-tcg-set">${escaparHtml(carta.setPt)}</span>
          </button>
        `;
      }).join("");

      return `
        <div class="bloco-info bloco-info-sem-borda">
          <div class="topo-tcg">
            <h3>Cartas TCG</h3>
            <span class="contador-tcg">${totalCartas} cartas</span>
          </div>
          <div class="grade-cartas-tcg">${cartasHtml}</div>
          <div class="paginacao-tcg">
            <button
              type="button"
              class="paginacao-tcg-botao"
              onclick="navegarPaginaTcg(-1)"
              ${paginaAtual <= 0 ? "disabled" : ""}
              aria-label="Página anterior das cartas"
            >
              ?
            </button>
            <span class="paginacao-tcg-info">Página ${paginaAtual + 1} de ${Math.max(1, Math.ceil(totalCartas / 6))}</span>
            <button
              type="button"
              class="paginacao-tcg-botao"
              onclick="navegarPaginaTcg(1)"
              ${paginaAtual >= Math.ceil(totalCartas / 6) - 1 ? "disabled" : ""}
              aria-label="Próxima página das cartas"
            >
              ?
            </button>
          </div>
        </div>
      `;
    }

    async function buscarCartasPacoteTcg(setId) {
      const chave = `pacote:${setId}`;

      if (cacheCartasPacoteTcg.has(chave)) {
        return cacheCartasPacoteTcg.get(chave);
      }

      const setDetalhe = await buscarJson(`${endpointTcg}/en/sets/${setId}`);
      const cartasBase = Array.isArray(setDetalhe.cards) ? setDetalhe.cards : [];

      const cartasDetalhadas = await mapearComLimite(cartasBase, limiteConcorrenciaTcg, async cartaBase => {
        try {
          return await buscarDetalhesCartaTcg(cartaBase.id);
        } catch {
          return {
            nomePt: cartaBase.name || "Carta Pokémon",
            nomeEn: cartaBase.name || "Carta Pokémon",
            possuiVersaoPt: false,
            imagemSmallPt: "",
            imagemLargePt: "",
            imagemSmallEn: montarUrlImagemTcg(cartaBase.image, "low"),
            imagemLargeEn: montarUrlImagemTcg(cartaBase.image, "high"),
            imagemSmallPtPng: "",
            imagemLargePtPng: "",
            imagemSmallEnPng: montarUrlImagemTcg(cartaBase.image, "low", "png"),
            imagemLargeEnPng: montarUrlImagemTcg(cartaBase.image, "high", "png"),
            setPt: "Set não informado",
            setEn: "Set não informado",
            raridadePt: "Raridade não informada",
            raridadeEn: "Raridade não informada",
            numero: cartaBase.localId || "-"
          };
        }
      });

      const resultado = { set: setDetalhe, cartas: cartasDetalhadas };
      cacheCartasPacoteTcg.set(chave, resultado);
      return resultado;
    }

    function abrirModalCarta(cartaJson) {
      const carta = JSON.parse(cartaJson);
      const modal = document.getElementById("modalCarta");
      const corpo = document.getElementById("modalCartaCorpo");
      const temVersaoPt = Boolean(carta.possuiVersaoPt);
      const idiomaInicial = temVersaoPt ? "pt" : "en";
      const tituloInicial = idiomaInicial === "pt" ? carta.nomePt : carta.nomeEn;
      const imagemPrincipal = idiomaInicial === "pt" ? (carta.imagemLargePt || carta.imagemLargeEn) : (carta.imagemLargeEn || carta.imagemLargePt);
      const imagemFallback = idiomaInicial === "pt" ? (carta.imagemLargePtPng || carta.imagemLargeEnPng) : (carta.imagemLargeEnPng || carta.imagemLargePtPng);
      const setExibicao = idiomaInicial === "pt" ? (carta.setPt || carta.setEn) : (carta.setEn || carta.setPt);
      const raridadeExibicao = idiomaInicial === "pt" ? (carta.raridadePt || carta.raridadeEn) : (carta.raridadeEn || carta.raridadePt);
      const payload = serializarPayloadHtml(carta);
      const avisoSemPt = temVersaoPt ? "" : `<p class="modal-carta-nota">Versão em Português não disponível para esta carta. Exibindo em Inglês.</p>`;

      corpo.innerHTML = `
        <div class="modal-carta-idioma">
          <button type="button" class="idioma-botao ${temVersaoPt ? "ativo" : "inativo"}" onclick="alternarIdiomaCarta('pt', decodeURIComponent('${payload}'))" ${temVersaoPt ? "" : "disabled"}>Português</button>
          <button type="button" class="idioma-botao ${temVersaoPt ? "" : "ativo"}" onclick="alternarIdiomaCarta('en', decodeURIComponent('${payload}'))">Inglês</button>
        </div>
        <h3 id="tituloCartaTcg">${escaparHtml(tituloInicial)}</h3>
        <img
          class="modal-carta-imagem"
          src="${escaparHtml(imagemPrincipal)}"
          data-fallback-png="${escaparHtml(imagemFallback)}"
          onclick="alternarZoomCarta()"
          onmousemove="efeito3dCarta(event, this)"
          onmouseleave="resetarEfeito3dCarta(this)"
          onerror="tratarErroImagemTcg(this)"
          alt="Carta ampliada de ${escaparHtml(tituloInicial)}"
        >
        <p class="modal-carta-dica">Clique na carta para ampliar.</p>
        ${avisoSemPt}
        <div class="modal-carta-meta">
          <p><strong>Set:</strong> <span data-campo="set">${escaparHtml(setExibicao)}</span></p>
          <p><strong>Raridade:</strong> <span data-campo="raridade">${escaparHtml(raridadeExibicao)}</span></p>
          <p><strong>Número:</strong> ${escaparHtml(carta.numero)}</p>
        </div>
      `;

      modal.classList.add("ativo");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-aberto");
    }

    function alternarIdiomaCarta(idioma, cartaJson) {
      const carta = JSON.parse(cartaJson);
      if (idioma === "pt" && !carta.possuiVersaoPt) {
        return;
      }

      const corpo = document.getElementById("modalCartaCorpo");
      const titulo = corpo.querySelector("#tituloCartaTcg");
      const imagem = corpo.querySelector(".modal-carta-imagem");
      const set = corpo.querySelector('[data-campo="set"]');
      const raridade = corpo.querySelector('[data-campo="raridade"]');
      const botoes = corpo.querySelectorAll(".idioma-botao");

      const emPortugues = idioma === "pt";
      const imagemPrincipal = emPortugues
        ? (carta.imagemLargePt || carta.imagemLargeEn)
        : (carta.imagemLargeEn || carta.imagemLargePt);
      const imagemFallback = emPortugues
        ? (carta.imagemLargePtPng || carta.imagemLargeEnPng)
        : (carta.imagemLargeEnPng || carta.imagemLargePtPng);

      titulo.textContent = emPortugues ? carta.nomePt : carta.nomeEn;
      imagem.dataset.fallbackAplicado = "false";
      imagem.dataset.fallbackPng = imagemFallback;
      imagem.src = imagemPrincipal;
      imagem.alt = `Carta ampliada de ${emPortugues ? carta.nomePt : carta.nomeEn}`;
      set.textContent = emPortugues
        ? (carta.setPt || carta.setEn)
        : (carta.setEn || carta.setPt);
      raridade.textContent = emPortugues
        ? (carta.raridadePt || carta.raridadeEn)
        : (carta.raridadeEn || carta.raridadePt);

      botoes.forEach(botao => {
        const ativo = botao.textContent === (emPortugues ? "Português" : "Inglês");
        botao.classList.toggle("ativo", ativo);
      });
    }

    function alternarZoomCarta() {
      const imagem = document.querySelector(".modal-carta-imagem");

      if (!imagem) {
        return;
      }

      imagem.classList.toggle("ampliada");
      resetarEfeito3dCarta(imagem);
    }

    function fecharModalCarta() {
      const modal = document.getElementById("modalCarta");
      modal.classList.remove("ativo");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-aberto");
    }

    function alternarAbaResultado(aba) {
      abaResultadoAtual = aba;

      document.querySelectorAll(".aba-resultado").forEach(botao => {
        const ativa = botao.dataset.aba === aba;
        botao.classList.toggle("ativa", ativa);
        botao.setAttribute("aria-selected", ativa ? "true" : "false");
      });

      document.querySelectorAll(".painel-resultado").forEach(painel => {
        painel.hidden = painel.dataset.painel !== aba;
      });
    }

    async function selecionarPokemon(nome, registrarHistorico = true) {
      const sequenciaAtual = ++sequenciaBuscaPokemon;
      document.getElementById("sugestoes").innerHTML = "";
      sugestoesAbertas = false;
      pokebolasAtuaisSugestao = {};
      fecharHistorico();

      try {
        const { data, especie, evolucaoData, relacoesDeDano } = await obterDadosPokemon(nome);

        if (sequenciaAtual !== sequenciaBuscaPokemon) {
          return;
        }

        const nomeBase = especie.names.find(n => n.language.name === "pt")?.name || especie.name;
        const nomeExibicao = formatarNomeExibicao(nomeBase, data.name);
        const cadeiaEvolucao = extrairCadeiaEvolucao(evolucaoData.chain);
        const variedades = especie.varieties.map(item => item.pokemon.name);
        navegacaoAtual = montarNavegacaoPokemon(cadeiaEvolucao, variedades, especie.name);
        indiceNavegacaoAtual = navegacaoAtual.indexOf(data.name);

        const numero = `#${data.id.toString().padStart(3, '0')}`;

        const tiposFormatados = data.types.map(t => {
          const tipo = tiposPT[t.type.name];
          return tipo ? `${tipo.emoji} ${tipo.nome}` : t.type.name;
        }).join(", ");

        const pesoKg = data.weight / 10;
        const alturaCm = data.height * 10;
        const descricaoOriginal = obterDescricaoPokemon(especie);
        let descricaoPokemon = descricaoOriginal.texto;
        let cartasTcg = [];
        let secaoTcgHtml = `
          <div class="bloco-info bloco-info-sem-borda">
            <h3>Cartas TCG</h3>
            <p class="mensagem-tcg">Não foi possível carregar as cartas agora.</p>
          </div>
        `;
        pokemonAtual = data;
        spriteAtualShiny = false;
        cartasTcgAtuais = [];
        cartasTcgFiltradasAtuais = [];
        paginaTcgAtual = 0;
        nomeExibicaoTcgAtual = nomeExibicao;

        if (
          descricaoOriginal.texto !== "Descrição não disponível." &&
          !["pt", "pt-br"].includes(descricaoOriginal.idioma)
        ) {
          try {
            descricaoPokemon = await traduzirTextoParaPortugues(
              descricaoOriginal.texto,
              descricaoOriginal.idioma || "auto"
            );

            if (sequenciaAtual !== sequenciaBuscaPokemon) {
              return;
            }
          } catch {
            descricaoPokemon = descricaoOriginal.texto;
          }
        }

        const habilidadesFormatadas = data.abilities.map(habilidade => {
          const nomeHabilidade = formatarHabilidade(habilidade.ability.name);
          return habilidade.is_hidden
            ? `${nomeHabilidade} (Oculta)`
            : nomeHabilidade;
        });
        const stats = {
          hp: data.stats.find(stat => stat.stat.name === "hp")?.base_stat ?? "-",
          ataque: data.stats.find(stat => stat.stat.name === "attack")?.base_stat ?? "-",
          defesa: data.stats.find(stat => stat.stat.name === "defense")?.base_stat ?? "-",
          ataqueEspecial: data.stats.find(stat => stat.stat.name === "special-attack")?.base_stat ?? "-",
          defesaEspecial: data.stats.find(stat => stat.stat.name === "special-defense")?.base_stat ?? "-",
          velocidade: data.stats.find(stat => stat.stat.name === "speed")?.base_stat ?? "-"
        };

        try {
          cartasTcg = await buscarCartasTcg(data.name);

          if (sequenciaAtual !== sequenciaBuscaPokemon) {
            return;
          }

          cartasTcgAtuais = cartasTcg;
          nomeExibicaoTcgAtual = nomeExibicao;
          cartasTcgFiltradasAtuais = cartasTcgAtuais;
          paginaTcgAtual = 0;
          secaoTcgHtml = renderizarSecaoTcg(
            obterCartasPaginaAtual(),
            nomeExibicao,
            cartasTcgFiltradasAtuais.length,
            paginaTcgAtual,
            spriteAtualShiny
          );
        } catch {
          cartasTcgAtuais = [];
          cartasTcgFiltradasAtuais = [];
          nomeExibicaoTcgAtual = nomeExibicao;
          paginaTcgAtual = 0;
          secaoTcgHtml = `
            <div class="bloco-info bloco-info-sem-borda">
              <h3>Cartas TCG</h3>
              <p class="mensagem-tcg">Não foi possível carregar as cartas agora.</p>
            </div>
          `;
        }

        if (registrarHistorico) {
          salvarNoHistorico(nome);
        }
        abaResultadoAtual = "informacoes";

        document.getElementById("resultado").innerHTML = `
          <div class="resultado-topo">
            <button
              type="button"
              class="evolucao-seta"
              onclick="navegarEvolucao(-1)"
              ${indiceNavegacaoAtual <= 0 ? "disabled" : ""}
              aria-label="Evolução anterior"
            >
              ?
            </button>

            <h2>${numero} - ${nomeExibicao}</h2>

            <button
              type="button"
              class="evolucao-seta"
              onclick="navegarEvolucao(1)"
              ${indiceNavegacaoAtual === -1 || indiceNavegacaoAtual >= navegacaoAtual.length - 1 ? "disabled" : ""}
              aria-label="Próxima evolução"
            >
              ?
            </button>
          </div>

          <div class="sprite-area">
            <img id="pokemonSprite" src="${data.sprites.front_default}" />
            <button
              type="button"
              id="botaoShiny"
              class="botao-shiny ${data.sprites.front_shiny ? "" : "desabilitado"}"
              onclick="alternarShiny()"
              ${data.sprites.front_shiny ? "" : "disabled"}
              aria-label="Alternar versão shiny"
              aria-pressed="false"
              title="${data.sprites.front_shiny ? "Mostrar versão shiny" : "Versão shiny indisponível"}"
            >
              ? Shiny
            </button>
          </div>

          <div class="abas-resultado" role="tablist" aria-label="Alternar entre informações e cartas TCG">
            <button type="button" class="aba-resultado ativa" data-aba="informacoes" role="tab" aria-selected="true" onclick="alternarAbaResultado('informacoes')">Informações</button>
            <button type="button" class="aba-resultado" data-aba="tcg" role="tab" aria-selected="false" onclick="alternarAbaResultado('tcg')">Cartas TCG</button>
          </div>

          <div class="painel-resultado" data-painel="informacoes">
            <div class="bloco-info bloco-info-sem-borda">
              <h3>Descrição</h3>
              <p class="descricao-pokemon">${descricaoPokemon}</p>
            </div>

            <div class="bloco-info">
              <h3>Informações básicas</h3>
              <p><strong>Tipo:</strong> ${tiposFormatados}</p>
              <p><strong>Habilidades:</strong> ${habilidadesFormatadas.join(", ")}</p>
              <p>?? <strong>Peso:</strong> ${pesoKg} kg</p>
              <p>?? <strong>Altura:</strong> ${alturaCm} cm</p>
            </div>

            <div class="bloco-info">
              <h3>Status base</h3>
              <div class="grade-status">
                <div class="status-item"><span>?? HP</span><strong>${stats.hp}</strong></div>
                <div class="status-item"><span>?? Ataque</span><strong>${stats.ataque}</strong></div>
                <div class="status-item"><span>??? Defesa</span><strong>${stats.defesa}</strong></div>
                <div class="status-item"><span>? Atq. Esp.</span><strong>${stats.ataqueEspecial}</strong></div>
                <div class="status-item"><span>?? Def. Esp.</span><strong>${stats.defesaEspecial}</strong></div>
                <div class="status-item"><span>?? Velocidade</span><strong>${stats.velocidade}</strong></div>
              </div>
            </div>

            <div class="bloco-info">
              <h3>Fraquezas e resistências</h3>
              <div class="grupo-relacao">
                <span class="titulo-relacao">Fraquezas</span>
                <div class="chips-linha">${renderizarListaChips(relacoesDeDano.fraquezas, "chip-vazio", "Nenhuma fraqueza relevante")}</div>
              </div>
              <div class="grupo-relacao">
                <span class="titulo-relacao">Resistências</span>
                <div class="chips-linha">${renderizarListaChips(relacoesDeDano.resistencias, "chip-vazio", "Nenhuma resistência relevante")}</div>
              </div>
              <div class="grupo-relacao">
                <span class="titulo-relacao">Imunidades</span>
                <div class="chips-linha">${renderizarListaChips(relacoesDeDano.imunidades, "chip-vazio", "Sem imunidades")}</div>
              </div>
            </div>
          </div>

          <div class="painel-resultado" data-painel="tcg" hidden>
            <div id="painelTcgConteudo">${secaoTcgHtml}</div>
          </div>
        `;
      } catch {
        if (sequenciaAtual !== sequenciaBuscaPokemon) {
          return;
        }

        document.getElementById("resultado").innerHTML = "? Pokémon não encontrado!";
      }
    }

    function alternarModo(modo) {
      modoAtual = modo;

      // Fechar sugestões e histórico
      document.getElementById("sugestoes").innerHTML = "";
      document.getElementById("sugestoesPacotes").innerHTML = "";
      fecharHistorico();

      document.querySelectorAll(".aba-modo-principal").forEach(botao => {
        const ativa = botao.dataset.modo === modo;
        botao.classList.toggle("ativa", ativa);
        botao.setAttribute("aria-selected", ativa ? "true" : "false");
      });

      const campoBuscaPokemon = document.getElementById("busca");
      const campoBuscaPacote = document.getElementById("buscaPacote");
      const resultado = document.getElementById("resultado");

      if (modo === "pokemon") {
        campoBuscaPokemon.hidden = false;
        campoBuscaPacote.hidden = true;
        document.getElementById("sugestoes").hidden = false;
        document.getElementById("sugestoesPacotes").hidden = true;
        // Limpar campos e sugestões de pacote
        campoBuscaPacote.value = "";
        document.getElementById("sugestoesPacotes").innerHTML = "";
        // Limpar resultado anterior
        resultado.innerHTML = "";
      } else {
        campoBuscaPokemon.hidden = true;
        campoBuscaPacote.hidden = false;
        document.getElementById("sugestoes").hidden = true;
        document.getElementById("sugestoesPacotes").hidden = false;
        // Limpar campos e sugestões de pokemon
        campoBuscaPokemon.value = "";
        document.getElementById("sugestoes").innerHTML = "";
        resultado.innerHTML = `
          <div class="painel-pacotes-tcg">
            <p style="text-align: center; margin-top: 32px; color: #5f6f84;">
              Digite o nome de um pacote TCG para começar a busca.
            </p>
          </div>
        `;
      }
    }

    function buscarSugestoesPacotes() {
      clearTimeout(debounceBuscaPacoteTimer);
      debounceBuscaPacoteTimer = setTimeout(executarBuscaSugestoesPacotes, debounceBuscaPacoteMs);
    }

    function executarBuscaSugestoesPacotes() {
      const sequenciaAtual = ++sequenciaBuscaPacotes;
      const valor = document.getElementById("buscaPacote")?.value.toLowerCase() || "";
      const sugestoesDiv = document.getElementById("sugestoesPacotes");

      sugestoesDiv.innerHTML = "";

      if (valor.length === 0) {
        return;
      }

      sugestoesDiv.style.display = "block";
      sugestoesDiv.innerHTML = `<div class="sugestao-carregando">Buscando pacotes...</div>`;

      buscarPacotesTcgSugestoes(valor)
        .then(pacotes => {
          if (sequenciaAtual !== sequenciaBuscaPacotes || document.getElementById("buscaPacote")?.value.toLowerCase() !== valor) {
            return;
          }

          if (pacotes.length === 0) {
            sugestoesDiv.innerHTML = `<div class="item">Nenhum pacote encontrado.</div>`;
            return;
          }

          sugestoesDiv.innerHTML = pacotes
            .slice(0, 10)
            .map(pacote => `
              <div class="item" data-set-id="${pacote.id}" data-set-name="${escaparHtml(pacote.name)}" onclick="selecionarPacoteClick(this)">
                <strong>${escaparHtml(pacote.name)}</strong>
                <span style="font-size: 0.85rem; color: #5f6f84;">${pacote.cardCount?.official ?? pacote.cardCount?.total ?? 0} cartas</span>
              </div>
            `)
            .join("");
        })
        .catch(() => {
          if (sequenciaAtual !== sequenciaBuscaPacotes) {
            return;
          }

          sugestoesDiv.innerHTML = `<div class="item">Erro ao buscar pacotes.</div>`;
        });
    }

    function selecionarPacoteClick(elemento) {
      const setId = elemento.dataset.setId;
      const setName = elemento.dataset.setName;
      selecionarPacote(setId, setName);
    }

    async function buscarPacotesTcgSugestoes(consulta) {
      const chaveConsulta = String(consulta || "").trim().toLowerCase();

      if (cachePacotesTcg.has(chaveConsulta)) {
        return cachePacotesTcg.get(chaveConsulta);
      }

      const promessa = (async () => {
      try {
        const pacotesMap = new Map(); // ID -> { pt: pacotePT, en: pacoteEN }
        
        // Primeiro buscar em português (prioridade)
        try {
          for (const idioma of ['pt-br', 'pt']) {
            try {
              const query = new URLSearchParams({
                name: consulta,
                "pagination:itemsPerPage": "20"
              });
              const endpoint = `${endpointTcg}/${idioma}/sets?${query.toString()}`;
              const pacotes = await buscarJson(endpoint);
              
              if (Array.isArray(pacotes)) {
                pacotes.forEach(pacote => {
                  if (!pacotesMap.has(pacote.id)) {
                    pacotesMap.set(pacote.id, { pt: pacote, en: null });
                  } else {
                    const existing = pacotesMap.get(pacote.id);
                    existing.pt = pacote;
                  }
                });
              }
              break; // Parar no primeiro idioma PT que funcionar
            } catch {
              continue;
            }
          }
        } catch {}
        
        // Depois buscar em inglês para completar dados faltantes
        try {
          const query = new URLSearchParams({
            name: consulta,
            "pagination:itemsPerPage": "20"
          });
          const pacotes = await buscarJson(`${endpointTcg}/en/sets?${query.toString()}`);
          
          if (Array.isArray(pacotes)) {
            pacotes.forEach(pacote => {
              if (!pacotesMap.has(pacote.id)) {
                pacotesMap.set(pacote.id, { pt: null, en: pacote });
              } else {
                const existing = pacotesMap.get(pacote.id);
                if (!existing.en) existing.en = pacote;
              }
            });
          }
        } catch {}
        
        // Retornar pacotes com nome em português (ou inglês se não houver PT)
        const resultado = Array.from(pacotesMap.values())
          .map(({ pt, en }) => pt || en)
          .filter(p => p !== null && p !== undefined)
          .slice(0, 10);
        
        return resultado;
      } catch {
        return [];
      }
      })();

      cachePacotesTcg.set(chaveConsulta, promessa);
      return promessa;
    }

    async function selecionarPacote(setId, nomePacote) {
      const sequenciaAtual = ++sequenciaSelecaoPacote;
      const resultado = document.getElementById("resultado");
      resultado.innerHTML = `
        <div style="padding: 32px 20px;">
          <h2>${escaparHtml(nomePacote)}</h2>
          <p style="color: #5f6f84;">Carregando cartas...</p>
        </div>
      `;

      document.getElementById("buscaPacote").value = nomePacote;
      document.getElementById("sugestoesPacotes").innerHTML = "";

      try {
        const setDetalhe = await buscarCartasPacoteTcg(setId);

        if (sequenciaAtual !== sequenciaSelecaoPacote) {
          return;
        }

        resultado.innerHTML = renderizarPacoteResultado(setDetalhe, nomePacote);
      } catch {
        if (sequenciaAtual !== sequenciaSelecaoPacote) {
          return;
        }

        resultado.innerHTML = `
          <div style="padding: 32px 20px; text-align: center;">
            <p style="color: #d62828;">Não foi possível carregar o pacote.</p>
          </div>
        `;
      }
    }

    function renderizarPacoteResultado({ set, cartas }, nomePacote) {
      const itensPorPagina = 6;
      const totalPaginas = Math.ceil(cartas.length / itensPorPagina);

      // Armazenar estado global para navegação
      window.paginaPacoteAtual = 0;
      window.setAtualPacote = set;
      window.cartasAtualPacote = cartas;

      function renderizarCartasPagina() {
        const paginaAtual = window.paginaPacoteAtual || 0;
        const inicio = paginaAtual * itensPorPagina;
        const cartasPagina = cartas.slice(inicio, inicio + itensPorPagina);

        const cartasHtml = cartasPagina.map(carta => {
          const payload = serializarPayloadHtml(carta);
          const imagemPrincipal = carta.imagemSmallPt || carta.imagemSmallEn || carta.imagemLargePt || carta.imagemLargeEn;
          const imagemFallback = carta.imagemSmallPtPng || carta.imagemSmallEnPng || carta.imagemLargePtPng || carta.imagemLargeEnPng;

          return `
            <button
              type="button"
              class="carta-tcg-item"
              onclick="abrirModalCarta(decodeURIComponent('${payload}'))"
              onmousemove="efeito3dCarta(event, this)"
              onmouseleave="resetarEfeito3dCarta(this)"
              aria-label="Abrir carta ${escaparHtml(carta.nomePt)}"
            >
              <img
                src="${escaparHtml(imagemPrincipal)}"
                data-fallback-png="${escaparHtml(imagemFallback)}"
                onerror="tratarErroImagemTcg(this)"
                alt="Carta TCG de ${escaparHtml(carta.nomePt)}"
              >
              <span class="carta-tcg-nome">${escaparHtml(carta.nomePt)}</span>
              <span class="carta-tcg-set">${escaparHtml(carta.setPt)}</span>
            </button>
          `;
        }).join("");

        return `
          <div class="bloco-info bloco-info-sem-borda">
            <div class="topo-tcg">
              <div>
                <h3>${escaparHtml(set.name)}</h3>
                <p style="margin: 0; font-size: 0.9rem; color: #5f6f84;">
                  ${set.releaseDate ? new Date(set.releaseDate).toLocaleDateString("pt-BR") : "Data desconhecida"}
                </p>
              </div>
              <span class="contador-tcg">${cartas.length} cartas</span>
            </div>
            <div class="grade-cartas-tcg">${cartasHtml}</div>
            <div class="paginacao-tcg" ${totalPaginas <= 1 ? "style='display:none;'" : ""}>
              <button
                type="button"
                class="paginacao-tcg-botao"
                onclick="navegarPaginaPacote(-1)"
                ${paginaAtual <= 0 ? "disabled" : ""}
              >
                ?
              </button>
              <span class="paginacao-tcg-info">Página ${paginaAtual + 1} de ${totalPaginas}</span>
              <button
                type="button"
                class="paginacao-tcg-botao"
                onclick="navegarPaginaPacote(1)"
                ${paginaAtual >= totalPaginas - 1 ? "disabled" : ""}
              >
                ?
              </button>
            </div>
          </div>
        `;
      }

      window.navegarPaginaPacote = function(direcao) {
        const totalPaginas = Math.ceil(cartas.length / itensPorPagina);
        const proximaPagina = (window.paginaPacoteAtual || 0) + direcao;

        if (proximaPagina < 0 || proximaPagina >= totalPaginas) {
          return;
        }

        window.paginaPacoteAtual = proximaPagina;
        const resultado = document.getElementById("resultado");
        resultado.innerHTML = renderizarCartasPagina();
      };

      return renderizarCartasPagina();
    }

  
