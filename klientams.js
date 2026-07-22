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
        // Paslepiam kolekcijos pasirinkimą (antraštę ir sąrašą)
        kolekcijosSelect.style.display = 'none';
        const antraste = kolekcijosSelect.previousElementSibling;
        if (antraste && antraste.tagName === 'H2') antraste.style.display = 'none';
    }
    // Jei parametro nėra — pasirinkimas lieka matomas (atsarginis variantas).

    // --- 2. Audinio grupė: visada bazinė, pasirinkimas paslepiamas ---
    const grupesSelect = document.getElementById('fabric-group-select');
    grupesSelect.value = '1';
    grupesSelect.style.display = 'none';
    const grupesAntraste = grupesSelect.previousElementSibling;
    if (grupesAntraste && grupesAntraste.tagName === 'H2') grupesAntraste.style.display = 'none';

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
})();

// --- 5. Modulių brėžinukai pasirinkimų meniu ---
// Kiekvieno modulio SVG piešinys (tas pats, kuris piešiamas ant stalo) įdedamas
// į meniu mygtuką virš pavadinimo. Plotis proporcingas tikram modulio pločiui
// (lyginant su plačiausiu kolekcijos moduliu), todėl klientas iškart mato
// modulių dydžių santykius.
function dekoruotiMeniuBreziniais() {
    const kolekcijosRaktas = document.getElementById('model-select').value;
    const moduliai = (typeof furnitureModels !== 'undefined') ? furnitureModels[kolekcijosRaktas] : null;
    if (!moduliai) return;

    const didziausiasPlotis = Math.max(...moduliai.map(m => m.w));
    document.querySelectorAll('#module-list .menu-item').forEach((btn, i) => {
        const mod = moduliai[i];
        if (!mod || btn.querySelector('.menu-thumb')) return;
        const plotisProc = Math.max(28, Math.round(mod.w / didziausiasPlotis * 100));
        const kaina = getModulePrice(kolekcijosRaktas, mod.id);
        btn.innerHTML =
            `<div class="menu-thumb" style="position:relative; width:${plotisProc}%; aspect-ratio:${mod.w}/${mod.h}; margin:0 auto;">${mod.svg}</div>` +
            `<div style="display:flex; justify-content:space-between; align-items:center; width:100%;">` +
            `<span>${mod.name}${mod.expandable ? ' ⇕' : ''}<br><small>${mod.w}x${mod.h} cm</small></span>` +
            `<span class="menu-price">${kaina}€</span></div>`;
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
