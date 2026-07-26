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

    // --- Kolekcijų maišymosi apsauga ---
    // Naršyklė įsimena paskutinę dėlionę bendrai visiems puslapiams, todėl
    // atsidarius KITOS kolekcijos puslapį senas baldas "atsineštų" kartu.
    // Jei išsaugoti moduliai ne šios kolekcijos — pradedam tuščiu lapu.
    // Tos pačios kolekcijos darbas po puslapio atnaujinimo išlieka, o
    // ?s= nuoroda (pilno ekrano perdavimas) neliečiama.
    if (galimos.includes(kolekcija) && !params.has('s') && !params.has('proposal')) {
        const yraSvetimu = Array.from(document.querySelectorAll('.canvas-module'))
            .some(m => (m.dataset.collection || '') !== kolekcija);
        if (yraSvetimu) {
            document.getElementById('canvas-area').innerHTML = '';
            if (typeof currentPanX !== 'undefined') { currentPanX = 0; currentPanY = 0; }
            const cw = document.getElementById('canvas-wrapper');
            if (cw) cw.style.transform = 'translate(0px, 0px)';
            document.getElementById('workspace').style.backgroundPosition = '0px 0px';
            if (typeof updateOrderSummary === 'function') updateOrderSummary();
            if (typeof updateLabels === 'function') updateLabels();
            if (typeof updateDimensions === 'function') updateDimensions();
            if (typeof saveState === 'function') saveState();
        }
    }

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

    // Mygtukas „Kopijuoti nuorodą": klientas gali nusikopijuoti savo dėlionės
    // nuorodą (pvz., nusiųsti draugui ar per Messenger) be užklausos siuntimo.
    // Nuoroda atidaro dėlionę su galimybe toliau redaguoti.
    const dalinimosiBtn = document.createElement('button');
    dalinimosiBtn.className = 'action-btn';
    dalinimosiBtn.id = 'dalintis-btn';
    dalinimosiBtn.innerHTML = '🔗 Kopijuoti nuorodą';
    dalinimosiBtn.style.cssText = 'background:#6c757d; font-size:12px; padding:9px; margin-top:6px;';
    dalinimosiBtn.onclick = function () { kopijuotiDalinimosiNuoroda(this); };
    document.getElementById('sidebar-right').appendChild(dalinimosiBtn);

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
            const j = (typeof JUNGCIU_SEKA !== 'undefined') ? Math.max(0, JUNGCIU_SEKA.indexOf(m.dataset.jungtys || '')) : 0;
            cols[c].push(`${m.dataset.id},${x},${y},${a},${e},${j}`);
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

// Nukopijuoja dabartinės dėlionės nuorodą (redaguojamą) į iškarpinę
function kopijuotiDalinimosiNuoroda(btn) {
    if (document.querySelectorAll('.canvas-module').length === 0) {
        return alert('Pirmiausia sudėliokite baldą — tada galėsite nusikopijuoti jo nuorodą.');
    }
    const nuoroda = pilnoEkranoNuoroda();
    const originalusTekstas = btn.innerHTML;
    const pavyko = () => {
        btn.innerHTML = '✅ Nukopijuota!';
        setTimeout(() => { btn.innerHTML = originalusTekstas; }, 2000);
    };
    navigator.clipboard.writeText(nuoroda).then(pavyko).catch(() => {
        // Atsarginis kelias senesnėms naršyklėms
        try {
            const laukas = document.createElement('textarea');
            laukas.value = nuoroda;
            document.body.appendChild(laukas);
            laukas.select();
            document.execCommand('copy');
            laukas.remove();
            pavyko();
        } catch (e) {}
    });
}

// Nukopijuoja kliento varianto nuorodą iš padėkos lango vienu paspaudimu
function kopijuotiUzklausosNuoroda(btn) {
    const laukas = document.getElementById('uzklausa-nuoroda');
    const originalusTekstas = btn.innerHTML;
    const pavyko = () => {
        btn.innerHTML = '✅ Nukopijuota!';
        setTimeout(() => { btn.innerHTML = originalusTekstas; }, 2000);
    };
    navigator.clipboard.writeText(laukas.value).then(pavyko).catch(() => {
        // Atsarginis kelias senesnėms naršyklėms
        try { laukas.select(); document.execCommand('copy'); pavyko(); } catch (e) {}
    });
}

// --- 5. Modulių brėžinukai pasirinkimų meniu ---
// Bendra logika perkelta į meniu-breziniai.js (ją naudoja ir vidinė programa).
// Kliento versijoje papildomai valdomas kairės juostos plotis (true).
ijungtiMeniuBrezinius(true);

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
