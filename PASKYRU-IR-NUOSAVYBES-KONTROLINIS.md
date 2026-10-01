# HOUMY konfigūratorius — paskyrų ir nuosavybės kontrolinis dokumentas

Atnaujinta: 2026-10-01. Peržiūrėti kartą per metus arba pasikeitus žmonėms.

**Šiame dokumente NĖRA ir NEGALI būti slaptažodžių, API raktų ar atkūrimo kodų.**
Asmeniniai el. paštai čia nerašomi (saugykla vieša) — jie matomi pačiose paslaugose.
Dokumentas nepublikuojamas svetainėje (`_config.yml` → `exclude`).

Teisinis projekto savininkas: **MB „Praktiški baldai"** (įm. k. 303372464).

## Paslaugos

| Paslauga | Kas / kur | Owner (savininkas) | Apmokėjimas | 2FA | Perdavimo būsena |
|---|---|---|---|---|---|
| Domenas houmy.lt | ? (registratorius) | ? | ? | ? | **Užpildyti registratorių** |
| DNS houmy.lt | Cloudflare (nemokamas planas); įrašas `konfiguratorius` → GitHub Pages, „DNS only" | įmonės Cloudflare paskyra | nemokama | ? | — |
| Įmonės el. paštas info@houmy.lt | Google paskyra; iš jos siunčiami konfigūratoriaus laiškai (programos slaptažodis — Firebase slaptažodžių saugykloje) | įmonė | ? | ? | **Patikrinti 2FA ir atkūrimą** |
| Kodas (GitHub) | `ramunaspetraska-debug/Houmy-konfiguratorius` (viešas) | Ramūno asmeninė paskyra | nemokama | įjungta | **SKOLA:** perkelti į įmonės GitHub organizaciją su 2 savininkais |
| Svetainės talpinimas | GitHub Pages, adresas **https://konfiguratorius.houmy.lt** (nuo 2026-10-01; senos github.io nuorodos nukreipiamos) | Ramūno asmeninė paskyra | nemokama | — | **SKOLA:** perkelti į organizaciją |
| Firebase / Google Cloud | projektas `houmy-konfiguratorius` (Blaze planas) | Ramūno asmeninė Google paskyra | ? (kieno kortelė) | ? | **SKOLA:** įmonės Google paskyra kaip antras Owner; biudžeto įspėjimas |
| Duomenų bazė | Realtime Database `houmy-konfiguratorius-eu` (Belgija) | kartu su Firebase | kartu | — | — |
| Serverio funkcijos | 4 funkcijos, europe-west1 (žr. žemiau) | kartu su Firebase | kartu | — | — |
| Administratoriai | sąrašas duomenų bazėje `houmy_admins` (4 Google paskyros) | keičia Firebase savininkas | — | kiekvieno paskyroje | — |
| houmy.lt parduotuvė (PrestaShop) | įterpia konfigūratorių (iframe) | ? | ? | ? | **Užpildyti** |
| Slaptažodžių seifas | ? | ? | ? | ? | **Užpildyti** |

## Kas veikia automatiškai

| Kas | Kada | Ką daro |
|---|---|---|
| `uzklausoslaiskas` | gavus užklausą | laiškas į info@houmy.lt; jei klientas pažymėjo — nuoroda klientui |
| `uzklausuPatikra` | kas valandą (:15) | jei kurios užklausos laiškas neišėjo — atsiunčia suvestinę |
| `senuUzklausuValymas` | kasnakt 03:30 | trina užklausas ir pasiūlymus, senesnius nei 12 mėn.; šalina pašalinių prisijungimų paskyras; daro kainų kopiją (`houmy_kopijos`, 90 naujausių) |
| `technologijuPatikra` | kiekvieno mėnesio 1 d. 09:00 | tikrina versijas ir palaikymo datas; laiškas tik kai reikia veikti |

Administravimo skydelyje: „📨 Užklausos", „🕰 Istorija", „🔧 Technologijos".

## Avarinis perdavimas — jei kūrėjo nėra

1. **Kas turi Owner teises be kūrėjo?** Šiuo metu — **niekas kitas** (GitHub ir Firebase tik Ramūno asmeninėse paskyrose). Tai svarbiausia skola.
2. **Kaip patekti į kodą?** Saugykla vieša: https://github.com/ramunaspetraska-debug/Houmy-konfiguratorius — kodą gali parsisiųsti bet kas; keisti — tik savininkas.
3. **Kaip sustabdyti konfigūratorių?** houmy.lt puslapiuose pašalinti įterptą konfigūratorių (PrestaShop). Užklausų priėmimą galima išjungti Firebase konsolėje (duomenų bazės taisyklės).
4. **Kas moka?** Firebase (Blaze) — ? Mėnesio išlaidos įprastai artimos nuliui.
5. **Kur atkūrimo kodai?** ?
6. **Techninė pagalba be kūrėjo:** bet kuris JavaScript/Firebase programuotojas; šiame faile ir kode aprašyta, kas kur yra.
7. **Kiek veiks pats?** Konfigūratorius veiks be priežiūros. Pirmiausia gali sugesti:
   - Google Node.js palaikymas baigiasi **2027-04-30** (apie tai iš anksto praneš mėnesinis laiškas);
   - info@houmy.lt slaptažodžio pakeitimas panaikina programos slaptažodį — **nustotų eiti laiškai** (užklausos vis tiek matomos skydelyje „📨 Užklausos");
   - neapmokėta Google sąskaita.

## Techninė atmintinė

- Diegimas: `firebase deploy --only database,functions` (iš projekto aplanko); svetainė atsinaujina per `git push`.
- Kainų kopija atkuriama iš `houmy_kopijos/<data>/nustatymai` (Firebase konsolė arba CLI).
- Keičiant Firebase ar html2canvas versiją — perskaičiuoti kontrolinius kodus (`integrity`) abiejuose HTML failuose.
- Administratorių sąrašo raktas: el. paštas mažosiomis raidėmis, taškai pakeisti kableliais.
