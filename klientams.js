// ============================================================================
// klientams.js — KLIENTO režimo pritaikymai (klientams.html).
//
// Šis failas paleidžiamas PO funkcijos.js. Jis nieko nekeičia redagavimo
// variklyje — tik paslepia vidinius įrankius ir prideda „Gauti pasiūlymą"
// užklausos srautą houmy.lt lankytojams:
//   1. URL parametras ?kolekcija=cloud — rodomi tik tos kolekcijos moduliai,
//      kolekcijos pasirinkimas paslepiamas.
//   2. Audinio grupė visada bazinė (I gr.), pasirinkimas paslepiamas.
//   3. Paslepiami: admin, archyvas, tinklelis, grupavimas, PDF/brėžinio
//      mygtukai, specifikacijos eilutė, dalinimosi mygtukas.
//   4. Naujas mygtukas „Gauti pasiūlymą": kliento dėlionė išsaugoma debesyje
//      (houmy_proposals), o kontaktai — į apsaugotą houmy_uzklausos kelią.
// ============================================================================

(function () {
    // --- 1. Kolekcija iš URL (?kolekcija=cloud) ---
    const params = new URLSearchParams(location.search);
    const kolekcija = (params.get('kolekcija') || '').toLowerCase();
    const kolekcijosSelect = document.getElementById('model-select');
    const galimos = Array.from(kolekcijosSelect.options).map(o => o.value);

    if (galimos.includes(kolekcija)) {
        kolekcijosSelect.value = kolekcija;
        kolekcijosSelect.dispatchEvent(new Event('change'));
        kolekcijosSelect.style.display = 'none';
    }
    // Jei parametro nėra — pasirinkimas lieka matomas (atsarginis variantas).

    // --- 2. Audinio grupė: visada bazinė, pasirinkimas paslepiamas ---
    const grupesSelect = document.getElementById('fabric-group-select');
    grupesSelect.value = '1';
    grupesSelect.style.display = 'none';

    // Antraštės „Kolekcija:" ir „Audinio grupė:" paslepiamos visada
    // (previousElementSibling nepatikimas, kai ?s= atkūrimas įterpia
    // kolekcijos ženkliuką prieš pasirinkimo sąrašą)
    document.querySelectorAll('.sidebar-header h2').forEach(h => { h.style.display = 'none'; });

    // --- 3. Įrankių juostos supaprastinimas ---
    document.querySelectorAll('#toolbar .tool-btn').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        if (oc.includes('toggleGrid') || oc.includes('openArchive') || oc.includes('openAdmin')) {
            btn.style.display = 'none';
        }
    });
    const grupavimas = document.getElementById('group-toggle');
    if (grupavimas && grupavimas.closest('label')) grupavimas.closest('label').style.display = 'none';

    // --- 4. Dešinė pusė: vietoj PDF/brėžinio mygtukų — „Gauti pasiūlymą" ---
    document.querySelectorAll('#sidebar-right .action-btn').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        if (oc.includes('openClientModal') || oc.includes('openBlueprintModal')) {
            btn.style.display = 'none';
        }
    });
    const uzklausosBtn = document.createElement('button');
    uzklausosBtn.className = 'action-btn';
    uzklausosBtn.id = 'uzklausa-btn';
    uzklausosBtn.innerHTML = '💬 Gauti pasiūlymą';
    uzklausosBtn.onclick = atidarytiUzklausosModal;
    document.getElementById('sidebar-right').appendChild(uzklausosBtn);

    // --- 5. „Per visą ekraną" mygtukas (rodomas TIK įterptame lange) ---
    // Naršyklės įterptam langui (iframe) skiria ATSKIRĄ atmintį nei atskiram
    // skirtukui, todėl paprastas mygtukas svetainėje atidaro ne tą būseną.
    // Šis mygtukas dabartinius modulius persiduoda per nuorodą (?s=...).
    if (window.self !== window.top) {
        const fsBtn = document.createElement('button');
        fsBtn.id = 'pilno-ekrano-btn';
        fsBtn.innerHTML = '⛶ Per visą ekraną';
        fsBtn.title = 'Atidaryti didesniame lange su jūsų sudėliotais moduliais';
        fsBtn.style.cssText = 'position:absolute; top:10px; left:10px; z-index:95; padding:8px 14px; background:#111; color:#fff; border:none; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.25);';
        fsBtn.onclick = atidarytiPilnaEkrana;
        document.getElementById('workspace').appendChild(fsBtn);
    }
})();

// Sudaro pilno ekrano nuorodą: kolekcija + dabartiniai moduliai (?s= formatu,
// tokiu pačiu kaip dalinimosi nuoroda — atkūrimo kodas jau moka jį perskaityti).
function pilnoEkranoNuoroda() {
    const baseUrl = window.location.href.split('?')[0];
    const kolekcijosRaktas = document.getElementById('model-select').value;
    let url = baseUrl + '?kolekcija=' + encodeURIComponent(kolekcijosRaktas);

    const moduleEls = Array.from(document.querySelectorAll('.canvas-module'));
    if (moduleEls.length > 0) {
        const cols = {};
        moduleEls.forEach(m => {
            const c = m.dataset.collection;
            if (!cols[c]) cols[c] = [];
            const x = Math.round((parseFloat(m.style.left) || 0) / scale);
            const y = Math.round((parseFloat(m.style.top) || 0) / scale);
            const a = parseInt(m.dataset.angle) || 0;
            const e = m.dataset.isExpanded === 'true' ? 1 : 0;
            cols[c].push(`${m.dataset.id},${x},${y},${a},${e}`);
        });
        const suspausta = Object.keys(cols).map(c => `${c}:${cols[c].join('!')}`).join('~');
        // encodeURIComponent BŪTINAS: base64 gali turėti +/= simbolius,
        // kurie be kodavimo URL'e virstų tarpais ir sugadintų atkūrimą.
        url += '&s=' + encodeURIComponent(btoa(suspausta));
    }
    return url;
}

function atidarytiPilnaEkrana() {
    window.open(pilnoEkranoNuoroda(), '_blank');
}

// --- 5. Modulių brėžinukai pasirinkimų meniu ---
// Kiekvieno modulio SVG piešinys (tas pats, kuris piešiamas ant stalo) įdedamas
// į meniu mygtuką virš pavadinimo. Plotis proporcingas tikram modulio pločiui
// (lyginant su plačiausiu kolekcijos moduliu), todėl klientas iškart mato
// modulių dydžių santykius.
function dekoruotiMeniuBreziniais() {
    const kolekcijosRaktas = document.getElementById('model-select').value;
    const moduliai = (typeof furnitureModels !== 'undefined') ? furnitureModels[kolekcijosRaktas] : null;
    if (!moduliai || !moduliai.length) return;

    // VIENODAS mastelis visiems kolekcijos moduliams (be jokių minimumų!),
    // todėl proporcijos tikros: siauras porankis atrodo siauras, platus
    // kampas — platus.
    const didziausiasPlotis = Math.max(...moduliai.map(m => m.w));
    const didziausiasAukstis = Math.max(...moduliai.map(m => m.h));
    const mobilus = window.innerWidth <= 768;

    // Kompiuteryje: kompaktiška eilutė — piešinys kairėje (fiksuotas stulpelis,
    // kad tekstas visose kortelėse lygiuotųsi), pavadinimas/matmenys/kaina dešinėje.
    // Mastelis: plačiausias modulis <=84px, aukščiausias <=76px.
    const K = Math.min(0.55, 84 / didziausiasPlotis, 76 / didziausiasAukstis);
    const stulpelisPx = Math.ceil(didziausiasPlotis * K);
    // Telefone: piešinys viršuje (kortelės siauros), mastelis procentais.
    const bazeProc = Math.min(55, 48 * didziausiasPlotis / didziausiasAukstis);

    // Visa kairė juosta susiaurinama pagal ŠIOS kolekcijos turinį: piešinių
    // stulpelis + vieta tekstui + tarpai/rėmeliai/slinkties juosta. Smulkių
    // modulių kolekcijoms juosta automatiškai siauresnė, stambių — platesnė.
    if (!mobilus) {
        const tekstoPlotis = 84;
        const kraštai = 68; // 8 tarpas + 16 kortelės paraštės + 2 rėmeliai + 30 juostos paraštės + ~12 slinkčiai
        document.getElementById('sidebar-left').style.width = (stulpelisPx + tekstoPlotis + kraštai) + 'px';
    }

    document.querySelectorAll('#module-list .menu-item').forEach((btn, i) => {
        const mod = moduliai[i];
        if (!mod || btn.querySelector('.menu-thumb')) return;
        const kaina = getModulePrice(kolekcijosRaktas, mod.id);
        const vardas = `${mod.name}${mod.expandable ? ' ⇕' : ''}`;

        if (mobilus) {
            const plotisProc = (mod.w / didziausiasPlotis * bazeProc).toFixed(1);
            btn.innerHTML =
                `<div class="menu-thumb" style="position:relative; width:${plotisProc}%; aspect-ratio:${mod.w}/${mod.h}; margin:0 auto;">${mod.svg}</div>` +
                `<div style="width:100%; text-align:center; line-height:1.3;">` +
                `<div>${vardas} <span class="menu-price">${kaina}€</span></div>` +
                `<small style="color:#888; font-weight:normal;">${mod.w}x${mod.h} cm</small></div>`;
        } else {
            const w = (mod.w * K).toFixed(1), h = (mod.h * K).toFixed(1);
            btn.innerHTML =
                `<div style="flex:0 0 ${stulpelisPx}px; display:flex; align-items:center; justify-content:center;">` +
                `<div class="menu-thumb" style="position:relative; width:${w}px; height:${h}px;">${mod.svg}</div></div>` +
                `<div style="flex:1; min-width:0; text-align:left; line-height:1.4;">` +
                `<div>${vardas}</div>` +
                `<small style="color:#888; font-weight:normal;">${mod.w}x${mod.h} cm</small>` +
                `<div class="menu-price" style="margin-top:2px;">${kaina}€</div></div>`;
        }
    });
}

// Meniu jau nupieštas užsikraunant — dekoruojam iškart, o loadModel apvyniojam,
// kad po bet kokio meniu perpiešimo brėžinukai atsirastų vėl.
dekoruotiMeniuBreziniais();
if (typeof loadModel === 'function') {
    const _origLoadModel = loadModel;
    loadModel = function (raktas) {
        _origLoadModel(raktas);
        dekoruotiMeniuBreziniais();
    };
}

// Atidaro užklausos langą (tik jei baldas sudėliotas ir be klaidų)
function atidarytiUzklausosModal() {
    const moduliai = document.querySelectorAll('.canvas-module');
    if (moduliai.length === 0) {
        return alert('Pirmiausia sudėliokite baldą — paspauskite norimą modulį kairėje.');
    }
    if (typeof validateWorkspace === 'function' && !validateWorkspace()) return;
    // Rodom formą (jei prieš tai buvo sėkmės žinutė — grąžinam formą)
    document.getElementById('uzklausa-forma').style.display = 'flex';
    document.getElementById('uzklausa-sekme').style.display = 'none';
    document.getElementById('uzklausa-modal').style.display = 'flex';
}

// Išsiunčia užklausą: dėlionė -> houmy_proposals, kontaktai -> houmy_uzklausos
async function siustiUzklausa(btn) {
    const vardas = document.getElementById('uzklausa-vardas').value.trim();
    const pastas = document.getElementById('uzklausa-pastas').value.trim();
    const telefonas = document.getElementById('uzklausa-telefonas').value.trim();
    const komentaras = document.getElementById('uzklausa-komentaras').value.trim();

    if (!pastas || !pastas.includes('@') || pastas.length < 5) {
        return alert('Įveskite teisingą el. pašto adresą.');
    }
    if (!window.houmyCloud || !window.houmyCloud.pasiruoses) {
        return alert('Nėra interneto ryšio — bandykite dar kartą.');
    }

    const originalusTekstas = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Siunčiama...';

    try {
        // Užpildom paslėptus laukus, kad pasiūlymo duomenys būtų pilni
        // (surinktiPasiulymoDuomenis skaito šiuos laukus)
        document.getElementById('client-name').value = vardas;
        document.getElementById('client-term').value = (typeof appSettings !== 'undefined' && appSettings.prodTerm) || '';
        document.getElementById('client-delivery').value = (typeof appSettings !== 'undefined' && appSettings.deliveryNote) || '';
        document.getElementById('client-additional').value = (typeof appSettings !== 'undefined' && appSettings.additionalInfo) || '';
        document.getElementById('client-discount').value = '';
        document.getElementById('client-manual-price').value = '';
        document.getElementById('client-fabric').value = '';

        const pasiulymas = surinktiPasiulymoDuomenis();
        const proposalId = await window.houmyCloud.issaugotiPasiulyma(pasiulymas);

        await window.houmyCloud.issaugotiUzklausa({
            name: vardas,
            email: pastas,
            phone: telefonas,
            comment: komentaras,
            collection: document.getElementById('model-select').value,
            total: pasiulymas.finalTotal,
            proposalId: proposalId
        });

        // Kliento nuoroda į jo dėlionę (atsidaro per pagrindinį peržiūros puslapį)
        const perziurosNuoroda = new URL('./', location.href).href + '?proposal=' + proposalId;
        document.getElementById('uzklausa-nuoroda').value = perziurosNuoroda;
        document.getElementById('uzklausa-forma').style.display = 'none';
        document.getElementById('uzklausa-sekme').style.display = 'flex';
    } catch (klaida) {
        console.error('Užklausos siuntimo klaida:', klaida);
        alert('Nepavyko išsiųsti užklausos. Patikrinkite interneto ryšį ir bandykite dar kartą, arba susisiekite: info@houmy.lt');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalusTekstas;
    }
}
