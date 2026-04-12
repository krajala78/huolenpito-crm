from flask import Flask, render_template, request, jsonify, session
import sqlite3
import os
import pandas as pd
import io
from datetime import datetime
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'valueLKV-secret-key-2024-change-in-production')

DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), 'data', 'crm.db'))

EXCEL_TO_DB = {
    'Kohde/Osoite': 'kohde_osoite',
    'Omistaja': 'omistaja',
    'Vuokranantajan \nkontakti': 'vuokranantajan_kontakti',
    'Vuokranantajan \nsÃ¤hkÃ¶posti': 'vuokranantajan_sahkoposti',
    'Vuokranantajan \npuhelinnumero': 'vuokranantajan_puhelin',
    'Tyyppi': 'tyyppi',
    'Koko': 'koko',
    'Kaupunki': 'kaupunki',
    'Postinumero': 'postinumero',
    'Huolenpito-\nsopimus': 'huolenpitosopimus',
    'Huolen-\npidossa': 'huolenpidossa',
    'Vuokrauksessa': 'vuokrauksessa',
    'VuokravÃ¤littÃ¤jÃ¤': 'vuokravalittaja',
    'VastuuhenkilÃ¶': 'vastuuhenkilo',
    'Laskutusperuste sis. alv (â¬/kk)': 'laskutusperuste',
    'Huolenpidon\nlaskutuksen status': 'laskutuksen_status',
    'Vuokratilitykset': 'vuokratilitykset',
    'Vuokrasopimus alkaen': 'vuokrasopimus_alkaen',
    'Vuokrasopimus pÃ¤Ã¤ttyy': 'vuokrasopimus_paattyy',
    'Vuokrattu': 'vuokrattu',
    'Vuokra-\nmarkkinalla': 'vuokramarkkinalla',
    'Asunnon tila': 'asunnon_tila',
    'Vuokralaisen nimi': 'vuokralaisen_nimi',
    'Vuokralaisen puhelinnumero': 'vuokralaisen_puhelin',
    'Vuokralaisen sÃ¤hkÃ¶posti': 'vuokralaisen_sahkoposti',
    'Vuokran mÃ¤Ã¤rÃ¤ sop. alkamisessa': 'vuokra_alussa',
    'Vuokran mÃ¤Ã¤rÃ¤ (tÃ¤nÃ¤Ã¤n)': 'vuokra_tanaan',
    'Vesimaksut': 'vesimaksut',
    'Muut maksut': 'muut_maksut',
    'Saunamaksut': 'saunamaksut',
    'Kokonaisumma': 'kokonaisumma',
    'Vuokravakuus': 'vuokravakuus',
    'Vakuuden maksupv.': 'vakuuden_maksupv',
    'Kenen tilillÃ¤ vakuus': 'kenen_tililla_vakuus',
    'Avaimet luovutettu': 'avaimet_luovutettu',
    'Vesimittari\nluettu': 'vesimittari_luettu',
    'VÃ¤litys\nlaskutettu': 'valitys_laskutettu',
    'VÃ¤lityshinta\nsis. alv': 'valityshinta',
    'LisÃ¤tietoja': 'lisatietoja',
}


# ââ DB helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()

    # Properties table
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

    # Users table
    conn.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        fullname TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        active INTEGER NOT NULL DEFAULT 1,
        created TEXT NOT NULL
    )''')

    conn.commit()

    # Create default admin user if no users exist
    count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    if count == 0:
        conn.execute(
            'INSERT INTO users (username, fullname, password_hash, role, active, created) VALUES (?, ?, ?, ?, ?, ?)',
            ('admin', 'PÃ¤Ã¤kÃ¤yttÃ¤jÃ¤', generate_password_hash('admin123'), 'admin', 1,
             datetime.now().strftime('%Y-%m-%d'))
        )
        conn.commit()

    conn.close()


# ââ Auth decorators ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Kirjautuminen vaaditaan', 'code': 'UNAUTHORIZED'}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Kirjautuminen vaaditaan', 'code': 'UNAUTHORIZED'}), 401
        if session.get('role') != 'admin':
            return jsonify({'error': 'Ei oikeuksia', 'code': 'FORBIDDEN'}), 403
        return f(*args, **kwargs)
    return decorated


# ââ Pages ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.route('/')
def index():
    return render_template('index.html')


# ââ Auth API âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    conn = get_db()
    row = conn.execute(
        'SELECT * FROM users WHERE username = ? AND active = 1', (username,)
    ).fetchone()
    conn.close()

    if not row or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'VÃ¤Ã¤rÃ¤ kÃ¤yttÃ¤jÃ¤tunnus tai salasana'}), 401

    session.permanent = True
    session['user_id'] = row['id']
    session['username'] = row['username']
    session['fullname'] = row['fullname']
    session['role'] = row['role']

    return jsonify({
        'id': row['id'],
        'username': row['username'],
        'fullname': row['fullname'],
        'role': row['role'],
    })


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'message': 'Kirjauduttu ulos'})


@app.route('/api/me')
def api_me():
    if 'user_id' not in session:
        return jsonify({'error': 'Ei kirjautunut', 'code': 'UNAUTHORIZED'}), 401
    return jsonify({
        'id': session['user_id'],
        'username': session['username'],
        'fullname': session['fullname'],
        'role': session['role'],
    })


@app.route('/api/change-password', methods=['POST'])
@login_required
def api_change_password():
    data = request.get_json()
    old_pw = data.get('old_password') or ''
    new_pw = data.get('new_password') or ''

    if len(new_pw) < 4:
        return jsonify({'error': 'Salasanan on oltava vÃ¤hintÃ¤Ã¤n 4 merkkiÃ¤'}), 400

    conn = get_db()
    row = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    if not row or not check_password_hash(row['password_hash'], old_pw):
        conn.close()
        return jsonify({'error': 'Nykyinen salasana on vÃ¤Ã¤rÃ¤'}), 400

    conn.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        (generate_password_hash(new_pw), session['user_id'])
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Salasana vaihdettu'})


# ââ User management API (admin only) âââââââââââââââââââââââââââââââââââââââââ

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    conn = get_db()
    rows = conn.execute(
        'SELECT id, username, fullname, role, active, created FROM users ORDER BY id ASC'
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    fullname = (data.get('fullname') or '').strip()
    password = data.get('password') or ''
    role = data.get('role', 'user')
    active = 1 if data.get('active', True) else 0

    if not username or not fullname:
        return jsonify({'error': 'KÃ¤yttÃ¤jÃ¤tunnus ja nimi ovat pakollisia'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Salasanan on oltava vÃ¤hintÃ¤Ã¤n 4 merkkiÃ¤'}), 400
    if role not in ('admin', 'user'):
        return jsonify({'error': 'Virheellinen rooli'}), 400

    conn = get_db()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'KÃ¤yttÃ¤jÃ¤tunnus on jo kÃ¤ytÃ¶ssÃ¤'}), 409

    conn.execute(
        'INSERT INTO users (username, fullname, password_hash, role, active, created) VALUES (?, ?, ?, ?, ?, ?)',
        (username, fullname, generate_password_hash(password), role, active,
         datetime.now().strftime('%Y-%m-%d'))
    )
    conn.commit()
    new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    conn.close()
    return jsonify({'id': new_id, 'message': 'KÃ¤yttÃ¤jÃ¤ luotu'}), 201


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    data = request.get_json()
    username = (data.get('username') or '').strip()
    fullname = (data.get('fullname') or '').strip()
    role = data.get('role', 'user')
    active = 1 if data.get('active', True) else 0
    new_password = data.get('password') or ''

    if not username or not fullname:
        return jsonify({'error': 'KÃ¤yttÃ¤jÃ¤tunnus ja nimi ovat pakollisia'}), 400
    if role not in ('admin', 'user'):
        return jsonify({'error': 'Virheellinen rooli'}), 400

    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?', (username, user_id)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'KÃ¤yttÃ¤jÃ¤tunnus on jo kÃ¤ytÃ¶ssÃ¤'}), 409

    if new_password:
        if len(new_password) < 4:
            conn.close()
            return jsonify({'error': 'Salasanan on oltava vÃ¤hintÃ¤Ã¤n 4 merkkiÃ¤'}), 400
        conn.execute(
            'UPDATE users SET username=?, fullname=?, role=?, active=?, password_hash=? WHERE id=?',
            (username, fullname, role, active, generate_password_hash(new_password), user_id)
        )
    else:
        conn.execute(
            'UPDATE users SET username=?, fullname=?, role=?, active=? WHERE id=?',
            (username, fullname, role, active, user_id)
        )

    conn.commit()
    conn.close()

    # Update session if editing self
    if user_id == session.get('user_id'):
        session['username'] = username
        session['fullname'] = fullname
        session['role'] = role

    return jsonify({'message': 'KÃ¤yttÃ¤jÃ¤ pÃ¤ivitetty'})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == session.get('user_id'):
        return jsonify({'error': 'Et voi poistaa omaa tiliÃ¤si'}), 400

    conn = get_db()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'KÃ¤yttÃ¤jÃ¤ poistettu'})


# ââ Stats ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.route('/api/stats')
@login_required
def stats():
    conn = get_db()
    c = conn.cursor()
    total = c.execute('SELECT COUNT(*) FROM properties').fetchone()[0]
    vuokrattu = c.execute("SELECT COUNT(*) FROM properties WHERE LOWER(vuokrattu) = 'kyllÃ¤'").fetchone()[0]
    vapaat = total - vuokrattu
    vuokra_sum = c.execute(
        "SELECT SUM(kokonaisumma) FROM properties WHERE kokonaisumma IS NOT NULL AND LOWER(vuokrattu) = 'kyllÃ¤'"
    ).fetchone()[0] or 0
    huolenpidossa = c.execute(
        "SELECT COUNT(*) FROM properties WHERE LOWER(huolenpidossa) = 'kyllÃ¤'"
    ).fetchone()[0]
    conn.close()
    return jsonify({
        'total': total,
        'vuokrattu': vuokrattu,
        'vapaat': vapaat,
        'vuokra_sum': round(vuokra_sum, 2),
        'huolenpidossa': huolenpidossa,
    })


# ââ Properties âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@app.route('/api/properties', methods=['GET'])
@login_required
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
@login_required
def get_property(prop_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM properties WHERE id = ?', (prop_id,)).fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/properties', methods=['POST'])
@login_required
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
@login_required
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
    return jsonify({'message': 'PÃ¤ivitetty onnistuneesti'})


@app.route('/api/properties/<int:prop_id>', methods=['DELETE'])
@login_required
def delete_property(prop_id):
    conn = get_db()
    conn.execute('DELETE FROM properties WHERE id = ?', (prop_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Poistettu onnistuneesti'})


@app.route('/api/import', methods=['POST'])
@login_required
def import_excel():
    if 'file' not in request.files:
        return jsonify({'error': 'Tiedostoa ei lÃ¶ydy'}), 400

    file = request.files['file']
    try:
        df = pd.read_excel(io.BytesIO(file.read()))
    except Exception as e:
        return jsonify({'error': f'Tiedoston luku epÃ¤onnistui: {str(e)}'}), 400

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
@login_required
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
