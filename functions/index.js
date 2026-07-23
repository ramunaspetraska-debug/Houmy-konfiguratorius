// ============================================================================
// HOUMY konfigūratoriaus debesies funkcijos.
//
// uzklausoslaiskas — "robotas", kuris stebi duomenų bazės kelią
// houmy_uzklausos ir, atsiradus naujai kliento užklausai iš svetainės
// konfigūratoriaus, išsiunčia pranešimą el. paštu į info@houmy.lt.
//
// Prisijungimo prie Gmail duomenys laikomi Firebase slaptažodžių saugykloje
// (Secret Manager) — NE kode:
//   SMTP_PASTAS      — Gmail adresas, iš kurio siunčiama
//   SMTP_SLAPTAZODIS — to adreso "programos slaptažodis" (app password)
// ============================================================================

const { onValueCreated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

const smtpPastas = defineSecret("SMTP_PASTAS");
const smtpSlaptazodis = defineSecret("SMTP_SLAPTAZODIS");

// Kam siunčiami pranešimai apie naujas užklausas
const GAVEJAS = "info@houmy.lt";
// Kliento dėlionės peržiūros adresas
const PERZIUROS_BAZE = "https://ramunaspetraska-debug.github.io/Houmy-konfiguratorius/";

// Apsauga nuo HTML įterpimo į laišką (kliento įvestas tekstas rodomas kaip tekstas)
function saugu(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

exports.uzklausoslaiskas = onValueCreated(
    {
        ref: "/houmy_uzklausos/{uzklausosId}",
        instance: "houmy-konfiguratorius-eu",
        region: "europe-west1",
        secrets: [smtpPastas, smtpSlaptazodis],
        memory: "256MiB",
        maxInstances: 5
    },
    async (event) => {
        const u = event.data.val() || {};

        const kolekcija = (u.collection || "").toUpperCase();
        const suma = (typeof u.total === "number") ? u.total + " €" : "—";
        const vardas = u.name || "nenurodytas";
        const perziura = u.proposalId ? PERZIUROS_BAZE + "?proposal=" + encodeURIComponent(u.proposalId) : null;

        const tema = `Nauja užklausa iš konfigūratoriaus: ${kolekcija || "?"} — ${suma} (${vardas})`;

        const eilutes = [
            ["Vardas", u.name],
            ["El. paštas", u.email],
            ["Telefonas", u.phone],
            ["Kolekcija", kolekcija],
            ["Suma", suma],
            ["Komentaras", u.comment]
        ].filter(e => e[1]);

        const html =
            `<div style="font-family:Arial,sans-serif; font-size:14px; color:#222; line-height:1.6;">` +
            `<h2 style="margin:0 0 4px 0;">Nauja užklausa iš houmy.lt konfigūratoriaus</h2>` +
            `<table style="border-collapse:collapse; margin:12px 0;">` +
            eilutes.map(e =>
                `<tr><td style="padding:4px 14px 4px 0; color:#666;">${saugu(e[0])}:</td>` +
                `<td style="padding:4px 0;"><b>${saugu(e[1])}</b></td></tr>`).join("") +
            `</table>` +
            (perziura
                ? `<p><a href="${saugu(perziura)}" style="display:inline-block; padding:10px 18px; background:#111; color:#fff; text-decoration:none; border-radius:6px;">Peržiūrėti kliento sudėliotą variantą</a></p>` +
                  `<p style="font-size:12px; color:#888;">Nuoroda: ${saugu(perziura)}</p>`
                : "") +
            `<p style="font-size:12px; color:#888;">Atsakyti klientui galite tiesiog paspaudę „Atsakyti / Reply" — laiškas nukeliaus adresu ${saugu(u.email || "?")}.</p>` +
            `</div>`;

        const tekstas =
            "Nauja užklausa iš houmy.lt konfigūratoriaus\n\n" +
            eilutes.map(e => e[0] + ": " + e[1]).join("\n") +
            (perziura ? "\n\nKliento variantas: " + perziura : "");

        const transporteris = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: smtpPastas.value(),
                pass: smtpSlaptazodis.value()
            }
        });

        await transporteris.sendMail({
            from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
            to: GAVEJAS,
            replyTo: u.email || undefined,
            subject: tema,
            text: tekstas,
            html: html
        });

        console.log("Užklausos pranešimas išsiųstas:", event.params.uzklausosId);
    }
);
