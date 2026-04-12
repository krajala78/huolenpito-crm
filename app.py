from flask import Flask, render_template, request, jsonify
import sqlite3
import os
import pandas as pd
import io
from datetime import datetime

app = Flask(__name__)
DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), 'data', 'crm.db'))

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


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kohde_osoite TEXT,
        omistaja TEXT,
        vuokranantajan_kontakti TEXT,
        vuokranantajan_sahkoposti TEXT,
        vuokranantajan_puhelin TEXT,
        tyyppi TEXT,
        koko REAL,
        kaupunki TEXT,
        postinumero TEXT,
        huolenpitosopimus TEXT,
        huolenpidossa TEXT,
        vuokrauksessa TEXT,
        vuokravalittaja TEXT,
        vastuuhenkilo TEXT,
        laskutusperuste TEXT,
        laskutuksen_status TEXT,
        vuokratilitykset TEXT,
        vuokrasopimus_alkaen TEXT,
        vuokrasopimus_paattyy TEXT,
        vuokrattu TEXT,
        vuokramarkkinalla TEXT,
        asunnon_tila TEXT,
        vuokralaisen_nimi TEXT,
        vuokralaisen_puhelin TEXT,
        vuokralaisen_sahkoposti TEXT,
        vuokra_alussa REAL,
        vuokra_tanaan REAL,
        vesimaksut REAL,
        muut_maksut TEXT,
        saunamaksut TEXT,
        kokonaisumma REAL,
        vuokravakuus REAL,
        vakuuden_maksupv TEXT,
        kenen_tililla_vakuus TEXT,
        avaimet_luovutettu TEXT,
        vesimittari_luettu TEXT,
        valitys_laskutettu TEXT,
        valityshinta REAL,
        lisatietoja TEXT,
        luotu TEXT,
        paivitetty TEXT
    )''')
    conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row) if row else None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/stats')
def stats():
    conn = get_db()
    c = conn.cursor()
    total = c.execute('SELECT COUNT(*) FROM properties').fetchone()[0]
    vuokrattu = c.execute("SELECT COUNT(*) FROM properties WHERE LOWER(vuokrattu) = 'kyllä'").fetchone()[0]
    vapaat = total - vuokrattu
    vuokra_sum = c.execute(
        "SELECT SUM(kokonaisumma) FROM properties WHERE kokonaisumma IS NOT NULL AND LOWER(vuokrattu) = 'kyllä'"
    ).fetchone()[0] or 0
    huolenpidossa = c.execute(
        "SELECT COUNT(*) FROM properties WHERE LOWER(huolenpidossa) = 'kyllä'"
    ).fetchone()[0]
    conn.close()
    return jsonify({
        'total': total,
        'vuokrattu': vuokrattu,
        'vapaat': vapaat,
        'vuokra_sum': round(vuokra_sum, 2),
        'huolenpidossa': huolenpidossa,
    })


@app.route('/api/properties', methods=['GET'])
def get_properties():
    conn = get_db()
    search = request.args.get('search', '').strip()
    vuokrattu_f = request.args.get('vuokrattu', '').strip()
    kaupunki_f = request.args.get('kaupunki', '').strip()
    vastuuhenkilo_f = request.args.get('vastuuhenkilo', '').strip()

    query = 'SELECT * FROM properties WHERE 1=1'
    params = []

    if search:
        query += ''' AND (kohde_osoite LIKE ? OR omistaja LIKE ? OR vuokralaisen_nimi LIKE ?
                    OR vuokranantajan_kontakti LIKE ? OR kaupunki LIKE ?)'''
        params.extend([f'%{search}%'] * 5)
    if vuokrattu_f:
        query += ' AND LOWER(vuokrattu) = LOWER(?)'
        params.append(vuokrattu_f)
    if kaupunki_f:
        query += ' AND kaupunki = ?'
        params.append(kaupunki_f)
    if vastuuhenkilo_f:
        query += ' AND vastuuhenkilo = ?'
        params.append(vastuuhenkilo_f)

    query += ' ORDER BY id ASC'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/properties/<int:prop_id>', methods=['GET'])
def get_property(prop_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM properties WHERE id = ?', (prop_id,)).fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/properties', methods=['POST'])
def create_property():
    data = request.get_json()
    now = datetime.now().isoformat()
    data['luotu'] = now
    data['paivitetty'] = now
    data.pop('id', None)

    cols = list(data.keys())
    placeholders = ', '.join(['?' for _ in cols])
    col_str = ', '.join(cols)
    values = [data[k] for k in cols]

    conn = get_db()
    c = conn.cursor()
    c.execute(f'INSERT INTO properties ({col_str}) VALUES ({placeholders})', values)
    new_id = c.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': new_id, 'message': 'Luotu onnistuneesti'}), 201


@app.route('/api/properties/<int:prop_id>', methods=['PUT'])
def update_property(prop_id):
    data = request.get_json()
    data['paivitetty'] = datetime.now().isoformat()
    data.pop('id', None)
    data.pop('luotu', None)

    set_clause = ', '.join([f'{k} = ?' for k in data.keys()])
    values = list(data.values()) + [prop_id]

    conn = get_db()
    conn.execute(f'UPDATE properties SET {set_clause} WHERE id = ?', values)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Päivitetty onnistuneesti'})


@app.route('/api/properties/<int:prop_id>', methods=['DELETE'])
def delete_property(prop_id):
    conn = get_db()
    conn.execute('DELETE FROM properties WHERE id = ?', (prop_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Poistettu onnistuneesti'})


@app.route('/api/import', methods=['POST'])
def import_excel():
    if 'file' not in request.files:
        return jsonify({'error': 'Tiedostoa ei löydy'}), 400

    file = request.files['file']
    try:
        df = pd.read_excel(io.BytesIO(file.read()))
    except Exception as e:
        return jsonify({'error': f'Tiedoston luku epäonnistui: {str(e)}'}), 400

    conn = get_db()
    c = conn.cursor()
    count = 0
    errors = []

    for idx, row in df.iterrows():
        try:
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
            c.execute(f'INSERT INTO properties ({col_str}) VALUES ({placeholders})', values)
            count += 1
        except Exception as e:
            errors.append(f'Rivi {idx + 2}: {str(e)}')

    conn.commit()
    conn.close()

    result = {'message': f'Tuotu {count} kohdetta', 'count': count}
    if errors:
        result['errors'] = errors
    return jsonify(result)


@app.route('/api/filters')
def get_filters():
    conn = get_db()
    kaupungit = [r[0] for r in conn.execute(
        'SELECT DISTINCT kaupunki FROM properties WHERE kaupunki IS NOT NULL ORDER BY kaupunki'
    ).fetchall()]
    vastuuhenkilot = [r[0] for r in conn.execute(
        'SELECT DISTINCT vastuuhenkilo FROM properties WHERE vastuuhenkilo IS NOT NULL ORDER BY vastuuhenkilo'
    ).fetchall()]
    conn.close()
    return jsonify({'kaupungit': kaupungit, 'vastuuhenkilot': vastuuhenkilot})


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
