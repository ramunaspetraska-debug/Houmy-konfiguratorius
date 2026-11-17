// ============================================================================
// Automatinė katalogo ir kainų patikra. Paleidimas (iš projekto aplanko):
//     node --test testai/kainos.test.js
// Tikrina kodo katalogą (duomenys.js) ir — jei pasiekiamas internetas —
// DABARTINES debesies kainas: ar nėra klaidų, dėl kurių klientas pamatytų
// neteisingą kainą. Nieko nekeičia.
// ============================================================================
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// duomenys.js įkeliamas kaip naršyklėje (localStorage — tuščias pakaitalas)
const kontekstas = { localStorage: { getItem: () => null, setItem: () => {} }, console };
vm.createContext(kontekstas);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "duomenys.js"), "utf8") +
    "\n;globalThis.__rawModels = rawModels;", kontekstas);
const rawModels = kontekstas.__rawModels;

// Ta pati taisyklė kaip funkcijos.js getModulePrice
function kaina(kainos, kolekcija, modulis, grupe) {
    const raktas = kolekcija + "_" + modulis.id;
    const grupesRaktas = grupe === 1 ? raktas : raktas + "_gr" + grupe;
    if (kainos[grupesRaktas] !== undefined) return kainos[grupesRaktas];
    const bazine = kainos[raktas] !== undefined ? kainos[raktas] : modulis.price;
    const priedas = modulis.prices && grupe > 1 ? (modulis.prices["gr" + grupe] || 0) : 0;
    return bazine + priedas;
}

function patikrintiKainas(kainos, saltinis) {
    const klaidos = [];
    for (const [kolekcija, moduliai] of Object.entries(rawModels)) {
        for (const m of moduliai) {
            let ankstesne = -Infinity;
            for (let g = 1; g <= 5; g++) {
                const k = kaina(kainos, kolekcija, m, g);
                if (typeof k !== "number" || !Number.isFinite(k) || k <= 0) klaidos.push(`${kolekcija}/${m.id} gr${g}: netinkama kaina ${k}`);
                else if (k > 20000) klaidos.push(`${kolekcija}/${m.id} gr${g}: įtartinai didelė kaina ${k}`);
                if (k < ankstesne) klaidos.push(`${kolekcija}/${m.id}: gr${g} (${k}) pigesnė už gr${g - 1} (${ankstesne})`);
                ankstesne = k;
            }
        }
    }
    assert.deepStrictEqual(klaidos, [], saltinis + " kainų klaidos:\n" + klaidos.join("\n"));
}

test("katalogas: be pasikartojančių ID ir su skaitiniais matmenimis", () => {
    const klaidos = [];
    for (const [kolekcija, moduliai] of Object.entries(rawModels)) {
        const matyti = new Set();
        for (const m of moduliai) {
            if (matyti.has(m.id)) klaidos.push(`${kolekcija}: pasikartoja ${m.id}`);
            matyti.add(m.id);
            for (const laukas of ["w", "h", "price"]) {
                if (typeof m[laukas] !== "number" || !Number.isFinite(m[laukas])) klaidos.push(`${kolekcija}/${m.id}: ${laukas} = ${m[laukas]}`);
            }
            if (m.expandable && (m.expW < m.w || m.expH < m.h)) klaidos.push(`${kolekcija}/${m.id}: išskleistas mažesnis už suskleistą`);
        }
    }
    assert.deepStrictEqual(klaidos, [], klaidos.join("\n"));
});

test("katalogas: kairės ir dešinės (L/P) poros vienodos kainos ir dydžio", () => {
    const klaidos = [];
    for (const [kolekcija, moduliai] of Object.entries(rawModels)) {
        const pagalId = Object.fromEntries(moduliai.map(m => [m.id, m]));
        for (const m of moduliai) {
            if (!/_?l$/.test(m.id)) continue;
            const pora = pagalId[m.id.replace(/l$/, "p")];
            if (!pora || pora === m) continue;
            if (m.price !== pora.price || JSON.stringify(m.prices) !== JSON.stringify(pora.prices) || m.w !== pora.w || m.h !== pora.h) {
                klaidos.push(`${kolekcija}: ${m.id} ≠ ${pora.id}`);
            }
        }
    }
    assert.deepStrictEqual(klaidos, [], klaidos.join("\n"));
});

test("kodo kainos (be debesies): tinkamos ir nemažėja nuo I iki V grupės", () => {
    patikrintiKainas({}, "Kodo");
});

test("DABARTINĖS debesies kainos: tinkamos ir nemažėja nuo I iki V grupės", async (t) => {
    let kainos;
    try {
        const r = await fetch("https://houmy-konfiguratorius-eu.europe-west1.firebasedatabase.app/houmy_settings/customPrices.json", { signal: AbortSignal.timeout(15000) });
        kainos = await r.json();
    } catch (e) {
        t.skip("debesis nepasiekiamas: " + e.message);
        return;
    }
    // Debesies raktai turi atitikti esamus modulius
    const be = Object.keys(kainos || {}).filter(k => {
        const m = k.match(/^([a-z0-9]+)_(.+?)(_gr[2-5])?$/);
        return !m || !rawModels[m[1]] || !rawModels[m[1]].some(x => x.id === m[2]);
    });
    assert.deepStrictEqual(be, [], "Debesies kainos be modulio: " + be.join(", "));
    patikrintiKainas(kainos || {}, "Debesies");
});

test("PILLOVE: gamintojo išdėstymų plotis ir gylis kaip brėžinyje (PILLOVE.pdf p.4)", () => {
    const pagalId = Object.fromEntries(rawModels.pillove.map(m => [m.id, m]));
    // [moduliai iš kairės į dešinę, plotis cm, didžiausias gylis cm]
    const isdestymai = [
        [["al", "es15", "ch15", "ap"], 236, 157], [["al", "es15", "ch15", "bp"], 236, 157],
        [["al", "es1", "ch1", "ap"], 216, 157],   [["al", "es1", "es1", "ch1", "bp"], 298, 157],
        [["al", "es15", "es15", "ap"], 236, 102], [["al", "es15", "es15", "es15", "ap"], 328, 102],
        [["al", "es1", "es1", "ap"], 216, 102],   [["al", "es1", "es1", "es1", "ap"], 298, 102],
        [["al", "es15", "pf4", "ch15", "bp"], 328, 157], [["al", "es1", "pf3", "ch1", "bp"], 298, 157],
    ];
    const klaidos = [];
    for (const [ids, plotis, gylis] of isdestymai) {
        const mod = ids.map(id => pagalId[id]);
        const p = mod.reduce((s, m) => s + m.w, 0), g = Math.max(...mod.map(m => m.h));
        if (p !== plotis || g !== gylis) klaidos.push(`${ids.join(" + ")}: ${p}x${g}, turi būti ${plotis}x${gylis}`);
    }
    // Svetainėje parduodama sudėtis A L + ES1,5 + ES1,5 + A P = 1825 € (± apvalinimas)
    const suma = ["al", "es15", "es15", "ap"].reduce((s, id) => s + pagalId[id].price, 0);
    if (Math.abs(suma - 1825) > 4) klaidos.push(`A L + 2×ES1,5 + A P = ${suma} €, svetainėje 1825 €`);
    assert.deepStrictEqual(klaidos, [], klaidos.join("\n"));
});

test("DESO: gamintojo U forma 452/462 cm ir kainos pagal Wersal CANDELO kainininką", () => {
    const pagalId = Object.fromEntries(rawModels.deso.map(m => [m.id, m]));
    const klaidos = [];
    // OTM + 3×1BB + C (CANDELO ELEMENTS.pdf: A=452; B gamintojas rašo 460, modulių suma 462)
    for (const [v, plotis] of [["a", 452], ["b", 462]]) {
        const p = pagalId["otm_l_" + v].w + 3 * pagalId["1bb_" + v].w + pagalId["c_" + v].w;
        if (p !== plotis) klaidos.push(`U forma ${v.toUpperCase()}: ${p} cm, turi būti ${plotis}`);
        // OTM sėdimoji dalis + pufo dalis (70/80) = OTM gylis
        if (pagalId["otm_l_" + v].h !== pagalId["1bb_" + v].h + (v === "a" ? 70 : 80)) klaidos.push(`OTM ${v.toUpperCase()} gylis nesutampa su 1BB + pufo dalimi`);
    }
    // U forma A I gr.: OTM + 3×1BB + C + OTM1S = 2800 €
    const u = ["otm_l_a", "1bb_a", "1bb_a", "1bb_a", "c_a", "otm1s_p_a"].reduce((s, id) => s + kaina({}, "deso", pagalId[id], 1), 0);
    if (u !== 2800) klaidos.push(`U forma A = ${u} €, turi būti 2800 €`);
    // houmy.lt Candelo 70 XL 1990 € ≈ OTM + 2BB + 2P (Wersal 385+340+405 = 1130 = XL)
    const xl = ["otm_l_a", "2bb_a", "2p_a"].reduce((s, id) => s + kaina({}, "deso", pagalId[id], 1), 0);
    if (Math.abs(xl - 1990) > 10) klaidos.push(`OTM + 2BB + 2P A = ${xl} €, houmy.lt Candelo 70 XL 1990 €`);
    // I ir II audinio grupės kaina vienoda
    for (const m of rawModels.deso) if (kaina({}, "deso", m, 2) !== kaina({}, "deso", m, 1)) klaidos.push(`${m.id}: II gr. kaina skiriasi nuo I gr.`);
    assert.deepStrictEqual(klaidos, [], klaidos.join("\n"));
});
