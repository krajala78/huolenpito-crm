# Huolenpito-CRM → GitHub + Railway

Nämä ohjeet vievät sovelluksen GitHubiin ja Railway-pilvipalveluun.

---

## VAIHE 1 — Git-repositorion alustus (tee kerran)

Avaa **Command Prompt** tai **PowerShell** ja siirry sovelluksen kansioon:

```
cd "C:\Users\kraja\Documents\ValueLKV_datamastering\huolenpito-crm"
```

Aja nämä komennot järjestyksessä:

```
git init
git branch -m main
git config user.email "kristianjrajala@gmail.com"
git config user.name "Kristian"
git add .
git commit -m "Ensimmäinen commit – huolenpito-crm"
```

> ⚠️ **Tietokanta (crm.db) ja data.xlsx jätetään pois** – ne sisältävät asiakastietoja,
> joita ei pidä laittaa julkiseen GitHubiin. Datan voi tuoda myöhemmin sovelluksen
> Tuo Excel -toiminnolla Railwayssä.

---

## VAIHE 2 — GitHub-repositorion luonti

1. Mene osoitteeseen **https://github.com/new**
2. Anna repositoriolle nimi, esim. `huolenpito-crm`
3. Valitse **Private** (suositeltava asiakastiedoille) tai Public
4. **ÄLÄ** rastita "Add a README file" — jätä tyhjäksi
5. Klikkaa **Create repository**

GitHub näyttää sinulle sivun, jossa on komennot. Kopioi ja aja terminaalissa:

```
git remote add origin https://github.com/SINUN-KÄYTTÄJÄNIMI/huolenpito-crm.git
git push -u origin main
```

Korvaa `SINUN-KÄYTTÄJÄNIMI` omalla GitHub-käyttäjänimelläsi.

GitHub pyytää kirjautumaan — käytä GitHub-tunnuksesi tai Personal Access Token.

---

## VAIHE 3 — Railway-deployment

### 3.1 Luo Railway-tili (jos ei ole)

Mene osoitteeseen **https://railway.app** ja luo tili (ilmainen).

### 3.2 Luo uusi projekti

1. Klikkaa **New Project**
2. Valitse **Deploy from GitHub repo**
3. Yhdistä GitHub-tilisi Railway-tiliin (kerran)
4. Valitse repositorio `huolenpito-crm`
5. Railway tunnistaa automaattisesti `railway.toml` ja `Procfile`
6. Klikkaa **Deploy**

### 3.3 Odota deploymentin valmistuminen

Railway rakentaa sovelluksen (noin 2–3 min). Kun status näyttää ✅ **Active**:

1. Klikkaa **Settings** → **Networking** → **Generate Domain**
2. Saat osoitteen muotoa `https://huolenpito-crm-xxx.up.railway.app`
3. Avaa linkki selaimessa — sovellus toimii! 🎉

---

## VAIHE 4 — Tuo data Railwayhin

Koska tietokanta ei ollut mukana gitissä:

1. Avaa sovellus selaimessa Railway-URL:lla
2. Klikkaa **"Tuo Excel"** -painiketta
3. Valitse `data.xlsx` omalta koneeltasi
4. Data latautuu Railway-palvelimelle

> ⚠️ **Huomio:** Railway käyttää väliaikaista levytilaa.
> Data nollautuu jos palvelu käynnistyy uudelleen deploymentissa.
> Tulevaisuudessa voidaan lisätä Railway PostgreSQL pysyvää tallennusta varten.

---

## Päivitys jatkossa

Kun muutat koodia, aja terminaalissa:

```
git add .
git commit -m "Kuvaus muutoksesta"
git push
```

Railway ottaa muutokset automaattisesti käyttöön (automaattinen deployment GitHubista).

---

## Yhteenveto

| Vaihe | Mitä tapahtuu |
|-------|--------------|
| Git init + commit | Koodi tallennetaan versionhallintaan |
| GitHub push | Koodi ladataan pilveen |
| Railway deploy | Sovellus käynnistyy internetissä |
| Excel-tuonti | Asiakasdata ladataan sovellukseen |
