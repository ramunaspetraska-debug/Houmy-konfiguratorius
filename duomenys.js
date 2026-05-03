const APP_VERSION = "V1.15 (Panning & Zoom-to-Cursor)";

const defaultSettings = {
    prodTerm: "6-8 savaitės",
    deliveryNote: "Kaina nurodyta be pristatymo paslaugos",
    additionalInfo: "",
    customPrices: {}
};

let appSettings = defaultSettings;
try {
    let saved = localStorage.getItem('houmySettings');
    if (saved) {
        let parsed = JSON.parse(saved);
        appSettings = { ...defaultSettings, ...parsed };
    }
} catch(e) { console.error("Settings error"); }

// Čia įklijuokite visą savo originalų 'rawModels' masyvą. 
// Nukopijuokite viską nuo 'const rawModels = {' iki pat '};' iš pirminio jūsų atsiųsto kodo.
const rawModels = {
    dizy: [
        { id: 'es15l', name: 'ES1,5 L', price: 916, prices: { gr2: 146, gr3: 225, gr4: 303, gr5: 383 }, w: 115, h: 110, svg: `<rect x="1" y="1" width="113" height="108" rx="3" fill="#fff" /><rect x="1" y="1" width="24" height="108" rx="3" fill="#fff" /><line x1="25" y1="25" x2="114" y2="25" stroke="#222" /><line x1="1" y1="55" x2="25" y2="55" stroke-dasharray="4,4" stroke="#aaa" /><rect x="30" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="30" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'es15p', name: 'ES1,5 P', price: 916, prices: { gr2: 146, gr3: 225, gr4: 303, gr5: 383 }, w: 115, h: 110, svg: `<rect x="1" y="1" width="113" height="108" rx="3" fill="#fff" /><rect x="91" y="1" width="24" height="108" rx="3" fill="#fff" /><line x1="1" y1="25" x2="91" y2="25" stroke="#222" /><line x1="91" y1="55" x2="114" y2="55" stroke-dasharray="4,4" stroke="#aaa" /><rect x="6" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="6" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'es15', name: 'ES1,5', price: 756, prices: { gr2: 122, gr3: 186, gr4: 252, gr5: 317 }, w: 91, h: 110, svg: `<rect x="1" y="1" width="89" height="108" rx="3" fill="#fff" /><line x1="1" y1="25" x2="90" y2="25" stroke="#222" /><rect x="6" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="6" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'ch15l', name: 'CH1,5 L', price: 1136, prices: { gr2: 182, gr3: 278, gr4: 377, gr5: 474 }, w: 115, h: 165, svg: `<rect x="1" y="1" width="113" height="163" rx="3" fill="#fff" /><rect x="1" y="1" width="24" height="109" rx="3" fill="#fff" /><line x1="25" y1="25" x2="114" y2="25" stroke="#222" /><line x1="1" y1="55" x2="25" y2="55" stroke-dasharray="4,4" stroke="#aaa" /><line x1="25" y1="110" x2="114" y2="110" stroke-dasharray="4,4" stroke="#aaa" /><rect x="30" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="30" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'ch15p', name: 'CH1,5 P', price: 1136, prices: { gr2: 182, gr3: 278, gr4: 377, gr5: 474 }, w: 115, h: 165, svg: `<rect x="1" y="1" width="113" height="163" rx="3" fill="#fff" /><rect x="91" y="1" width="24" height="109" rx="3" fill="#fff" /><line x1="1" y1="25" x2="91" y2="25" stroke="#222" /><line x1="91" y1="55" x2="114" y2="55" stroke-dasharray="4,4" stroke="#aaa" /><line x1="1" y1="110" x2="91" y2="110" stroke-dasharray="4,4" stroke="#aaa" /><rect x="6" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="6" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'ch15', name: 'CH1,5', price: 1009, w: 91, h: 165, svg: `<rect x="1" y="1" width="89" height="163" rx="3" fill="#fff" /><line x1="1" y1="25" x2="90" y2="25" stroke="#222" /><line x1="1" y1="110" x2="90" y2="110" stroke-dasharray="4,4" stroke="#aaa" /><rect x="6" y="5" width="79" height="20" rx="4" fill="#fff" /><rect x="6" y="25" width="79" height="14" rx="3" fill="#fff" />`},
        { id: 'en', name: 'EN', price: 979, w: 110, h: 110, svg: `<rect x="1" y="1" width="108" height="108" rx="3" fill="#fff" /><path d="M 1,1 L 25,25 M 25,25 L 109,25 M 25,25 L 25,109" stroke="#222" fill="none" /><rect x="30" y="5" width="74" height="20" rx="4" fill="#fff" /><rect x="30" y="25" width="74" height="14" rx="3" fill="#fff" /><rect x="5" y="30" width="20" height="74" rx="4" fill="#fff" /><rect x="25" y="30" width="14" height="74" rx="3" fill="#fff" /><rect x="35" y="35" width="40" height="14" rx="4" fill="#fff" transform="rotate(45 55 42)" />`},
        { id: 'ensl', name: 'ENS L', price: 1262, w: 136, h: 120, svg: `<polygon points="1,1 135,1 135,110 110,119 1,119" fill="#fff" stroke="#222" stroke-linejoin="round" /><path d="M 1,1 L 25,25 M 25,25 L 135,25 M 25,25 L 25,119" stroke="#222" fill="none" /><rect x="30" y="5" width="100" height="20" rx="4" fill="#fff" /><rect x="30" y="25" width="100" height="14" rx="3" fill="#fff" /><rect x="5" y="30" width="20" height="84" rx="4" fill="#fff" /><rect x="25" y="30" width="14" height="84" rx="3" fill="#fff" />`},
        { id: 'ensp', name: 'ENS P', price: 1262, w: 136, h: 120, svg: `<polygon points="1,1 135,1 135,119 26,119 1,110" fill="#fff" stroke="#222" stroke-linejoin="round" /><path d="M 135,1 L 111,25 M 111,25 L 1,25 M 111,25 L 111,119" stroke="#222" fill="none" /><rect x="6" y="5" width="100" height="20" rx="4" fill="#fff" /><rect x="6" y="25" width="100" height="14" rx="3" fill="#fff" /><rect x="111" y="30" width="20" height="84" rx="4" fill="#fff" /><rect x="97" y="30" width="14" height="84" rx="3" fill="#fff" />`},
        { id: 'pf1', name: 'PF1', price: 443, w: 91, h: 110, svg: `<rect x="1" y="1" width="89" height="108" rx="3" fill="#fff" />`},
        { id: 'pf2', name: 'PF2', price: 410, w: 91, h: 91, svg: `<rect x="1" y="1" width="89" height="89" rx="3" fill="#fff" />`}
    ],
    // PRIDĖKITE LIKUSIAS KOLEKCIJAS ČIA...
};
