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
