// ============================================================================
// meniu-breziniai.js — modulių brėžinukai pasirinkimų meniu.
//
// BENDRAS failas abiem versijoms:
//   - klientams.html (kliento konfigūratorius) — ijungtiMeniuBrezinius(true):
//     papildomai valdomas kairės juostos plotis (pritaikomas kolekcijai);
//   - index.html (vidinė programa) — ijungtiMeniuBrezinius(false):
//     juostos plotis paliekamas standartinis (styles.css), nes vidinėje
//     versijoje kolekcijos dažnai perjunginėjamos.
//
// Kiekvieno modulio SVG piešinys (tas pats, kuris piešiamas ant stalo)
// rodomas meniu kortelėje. VIENODAS mastelis visiems kolekcijos moduliams,
// todėl proporcijos tikros: siauras porankis atrodo siauras, platus — platus.
// ============================================================================

// Ar dabar telefono režimas? matchMedia — tas pats matavimas kaip CSS,
// todėl JS sudėliotas turinys visada sutampa su CSS išdėstymu.
const mobilausEkranoMedia = window.matchMedia('(max-width: 768px)');

// Ar šioje versijoje valdyti kairės juostos plotį (nustatoma per ijungti...)
let _valdytiJuostosPloti = false;

function dekoruotiMeniuBreziniais(kolekcijosRaktas) {
    // Kolekcija paduodama iš loadModel (kad visada sutaptų su nupieštu meniu);
    // jei nepaduota — imama iš pasirinkimo lauko.
    kolekcijosRaktas = kolekcijosRaktas || document.getElementById('model-select').value;
    const moduliai = (typeof furnitureModels !== 'undefined') ? furnitureModels[kolekcijosRaktas] : null;
    if (!moduliai || !moduliai.length) return;

    const didziausiasPlotis = Math.max(...moduliai.map(m => m.w));
    const didziausiasAukstis = Math.max(...moduliai.map(m => m.h));
    const mobilus = mobilausEkranoMedia.matches;

    // Kompiuteryje: kompaktiška eilutė — piešinys kairėje (fiksuotas stulpelis,
    // kad tekstas visose kortelėse lygiuotųsi), pavadinimas/matmenys/kaina dešinėje.
    // Mastelis: plačiausias modulis <=84px, aukščiausias <=76px.
    const K = Math.min(0.55, 84 / didziausiasPlotis, 76 / didziausiasAukstis);
    const stulpelisPx = Math.ceil(didziausiasPlotis * K);
    // Telefone: piešinys viršuje (kortelės siauros), mastelis procentais.
    const bazeProc = Math.min(55, 48 * didziausiasPlotis / didziausiasAukstis);

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
                `<small style="color:#888; font-weight:normal; white-space:nowrap;">${mod.w}x${mod.h} cm</small></div>`;
        } else {
            const w = (mod.w * K).toFixed(1), h = (mod.h * K).toFixed(1);
            btn.innerHTML =
                `<div style="flex:0 0 ${stulpelisPx}px; display:flex; align-items:center; justify-content:center;">` +
                `<div class="menu-thumb" style="position:relative; width:${w}px; height:${h}px;">${mod.svg}</div></div>` +
                `<div style="flex:1; min-width:0; text-align:left; line-height:1.4;">` +
                `<div>${vardas}</div>` +
                `<small style="color:#888; font-weight:normal; white-space:nowrap;">${mod.w}x${mod.h} cm</small>` +
                `<div class="menu-price" style="margin-top:2px;">${kaina}€</div></div>`;
        }
    });

    // Kairės juostos plotis (tik kliento versijoje): piešinių stulpelis +
    // ILGIAUSIAS realus tekstas (išmatuojamas, ne spėjamas) + paraštės.
    if (!_valdytiJuostosPloti) return;
    const juosta = document.getElementById('sidebar-left');
    if (mobilus) {
        juosta.style.width = '';
    } else {
        const tekstuBlokai = document.querySelectorAll('#module-list .menu-item > div:last-child');
        let ilgiausiasTekstas = 0;
        tekstuBlokai.forEach(d => { d.style.width = 'max-content'; d.style.flex = 'none'; });
        tekstuBlokai.forEach(d => { ilgiausiasTekstas = Math.max(ilgiausiasTekstas, d.offsetWidth); });
        tekstuBlokai.forEach(d => { d.style.width = ''; d.style.flex = '1'; });
        // 74 = 8 tarpas + 16 kortelės paraštės + 2 rėmeliai + 30 juostos paraštės + ~12 slinkties juostai + 6 atsarga
        juosta.style.width = Math.min(280, stulpelisPx + ilgiausiasTekstas + 74) + 'px';
    }
}

// Įjungia brėžinukus: dekoruoja esamą meniu, apvynioja loadModel (kad po
// kiekvieno meniu perpiešimo brėžinukai atsirastų vėl) ir perpiešia
// kirtus 768px ribą (pvz., PrestaShop iframe iš pradžių būna siauras).
function ijungtiMeniuBrezinius(valdytiJuostosPloti) {
    _valdytiJuostosPloti = !!valdytiJuostosPloti;

    dekoruotiMeniuBreziniais();

    if (typeof loadModel === 'function') {
        const _origLoadModel = loadModel;
        loadModel = function (raktas) {
            _origLoadModel(raktas);
            dekoruotiMeniuBreziniais(raktas);
        };
    }

    const perpiesti = function () {
        if (typeof loadModel === 'function') loadModel(document.getElementById('model-select').value);
    };
    try {
        mobilausEkranoMedia.addEventListener('change', perpiesti);
    } catch (e) {
        if (mobilausEkranoMedia.addListener) mobilausEkranoMedia.addListener(perpiesti);
    }
}
