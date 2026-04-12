"""
Aja tämä skripti kerran tuodaksesi Excel-datan tietokantaan:
    python import_data.py <excel-tiedosto.xlsx>
"""
import sys
import pandas as pd
import sqlite3
import os
from datetime import datetime

EXCEL_TO_DB = {
    'Kohde/Osoite': 'kohde_osoite',
    'Omistaja': 'omistaja',
    'Vuokranantajan \nkontakti': 'vuokranantajan_kontakti',
    'Vuokranantajan \nsähköposti': 'vuokranantajan_sahkoposti',
    'Vuokranantajan \npuhelinnumero': 'vuokranantajan_puhelin',
    'Tyyppi': 'tyyppi',
    'Koko': 'koko',
    'Kaupunki': 'kaupunki',
    'Postinumero': 'postinumero',
    'Huolenpito-\nsopimus': 'huolenpitosopimus',
    'Huolen-\npidossa': 'huolenpidossa',
    'Vuokrauksessa': 'vuokrauksessa',
    'Vuokravälittäjä': 'vuokravalittaja',
    'Vastuuhenkilö': 'vastuuhenkilo',
    'Laskutusperuste sis. alv (€/kk)': 'laskutusperuste',
    'Huolenpidon\nlaskutuksen status': 'laskutuksen_status',
    'Vuokratilitykset': 'vuokratilitykset',
    'Vuokrasopimus alkaen': 'vuokrasopimus_alkaen',
    'Vuokrasopimus päättyy': 'vuokrasopimus_paattyy',
    'Vuokrattu': 'vuokrattu',
    'Vuokra-\nmarkkinalla': 'vuokramarkkinalla',
    'Asunnon tila': 'asunnon_tila',
    'Vuokralaisen nimi': 'vuokralaisen_nimi',
    'Vuokralaisen puhelinnumero': 'vuokralaisen_puhelin',
    'Vuokralaisen sähköposti': 'vuokralaisen_sahkoposti',
    'Vuokran määrä sop. alkamisessa': 'vuokra_alussa',
    'Vuokran määrä (tänään)': 'vuokra_tanaan',
    'Vesimaksut': 'vesimaksut',
    'Muut maksut': 'muut_maksut',
    'Saunamaksut': 'saunamaksut',
    'Kokonaisumma': 'kokonaisumma',
    'Vuokravakuus': 'vuokravakuus',
    'Vakuuden maksupv.': 'vakuuden_maksupv',
    'Kenen tilillä vakuus': 'kenen_tililla_vakuus',
    'Avaimet luovutettu': 'avaimet_luovutettu',
    'Vesimittari\nluettu': 'vesimittari_luettu',
    'Välitys\nlaskutettu': 'valitys_laskutettu',
    'Välityshinta\nsis. alv': 'valityshinta',
    'Lisätietoja': 'lisatietoja',
}


def main():
    if len(sys.argv) < 2:
        print("Käyttö: python import_data.py <excel-tiedosto.xlsx>")
        sys.exit(1)

    excel_path = sys.argv[1]
    if not os.path.exists(excel_path):
        print(f"Tiedostoa ei löydy: {excel_path}")
        sys.exit(1)

    db_path = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), 'data', 'crm.db'))
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    print(f"Luetaan: {excel_path}")
    df = pd.read_excel(excel_path)
    print(f"Löydettiin {len(df)} riviä")

    conn = sqlite3.connect(db_path)
    count = 0

    for idx, row in df.iterrows():
        data = {}
        for excel_col, db_col in EXCEL_TO_DB.items():
            if excel_col in df.columns:
                val = row[excel_col]
                if pd.isna(val):
                    data[db_col] = None
                elif hasattr(val, 'strftime'):
                    data[db_col] = val.strftime('%Y-%m-%d')
                elif isinstance(val, (int, float)):
                    data[db_col] = val
                else:
                    data[db_col] = str(val).strip()

        data['luotu'] = datetime.now().isoformat()
        data['paivitetty'] = datetime.now().isoformat()

        cols = list(data.keys())
        placeholders = ', '.join(['?' for _ in cols])
        col_str = ', '.join(cols)
        values = [data[k] for k in cols]
        conn.execute(f'INSERT INTO properties ({col_str}) VALUES ({placeholders})', values)
        count += 1
        print(f"  Tuotu: {data.get('kohde_osoite', '?')}")

    conn.commit()
    conn.close()
    print(f"\nValmis! Tuotu {count} kohdetta tietokantaan: {db_path}")


if __name__ == '__main__':
    main()
