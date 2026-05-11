from flask import Flask, render_template, request, jsonify, session
import os
import io
import pandas as pd
from datetime import datetime
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

# ── DB driver selection ──────────────────────────────────────────────────────
# Railway sets DATABASE_URL automatically when a PostgreSQL service is added.
# Locally the app falls back to SQLite so no extra setup is needed.

DATABASE_URL = os.environ.get('DATABASE_URL', '')

if DATABASE_URL:
    import psycopg2
    import psycopg2.extras
    USE_PG = True
    # Railway sometimes gives 'postgres://' – psycopg2 needs 'postgresql://'
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
else:
    import sqlite3
    USE_PG = False

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'valueLKV-secret-key-2024-change-in-production')

# SQLite path (only used when DATABASE_URL is not set)
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


# ── DB helpers ───────────────────────────────────────────────────────────────

def get_db():
    """Return a DB connection. Works with both PostgreSQL and SQLite."""
    if USE_PG:
        return psycopg2.connect(DATABASE_URL)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def placeholder():
    """Return the correct placeholder for parameterised queries."""
    return '%s' if USE_PG else '?'


def execute_query(conn, sql, params=None):
    """Execute a SELECT and return list of dicts."""
    if USE_PG:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            return [dict(r) for r in cur.fetchall()]
    else:
        rows = conn.execute(sql, params or []).fetchall()
        return [dict(r) for r in rows]


def execute_one(conn, sql, params=None):
    """Execute a SELECT and return first row as dict, or None."""
    if USE_PG:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            row = cur.fetchone()
            return dict(row) if row else None
    else:
        row = conn.execute(sql, params or []).fetchone()
        return dict(row) if row else None


def execute_scalar(conn, sql, params=None):
    """Execute a SELECT and return the first column of the first row."""
    if USE_PG:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            row = cur.fetchone()
            return row[0] if row else None
    else:
        row = conn.execute(sql, params or []).fetchone()
        return row[0] if row else None


def execute_write(conn, sql, params=None):
    """Execute INSERT/UPDATE/DELETE. Returns new row id if RETURNING id is used (PG only)."""
    if USE_PG:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            if cur.description:
                row = cur.fetchone()
                return row[0] if row else None
            return None
    else:
        cur = conn.execute(sql, params or [])
        return cur.lastrowid


def init_db():
    if not USE_PG:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = get_db()

    if USE_PG:
        with conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                kohde_osoite TEXT, omistaja TEXT,
                vuokranantajan_kontakti TEXT, vuokranantajan_sahkoposti TEXT,
                vuokranantajan_puhelin TEXT, tyyppi TEXT, koko REAL,
                kaupunki TEXT, postinumero TEXT, huolenpitosopimus TEXT,
                huolenpidossa TEXT, vuokrauksessa TEXT, vuokravalittaja TEXT,
                vastuuhenkilo TEXT, laskutusperuste TEXT, laskutuksen_status TEXT,
                vuokratilitykset TEXT, vuokrasopimus_alkaen TEXT,
                vuokrasopimus_paattyy TEXT, vuokrattu TEXT, vuokramarkkinalla TEXT,
                asunnon_tila TEXT, vuokralaisen_nimi TEXT, vuokralaisen_puhelin TEXT,
                vuokralaisen_sahkoposti TEXT, vuokra_alussa REAL, vuokra_tanaan REAL,
                vesimaksut REAL, muut_maksut TEXT, saunamaksut TEXT,
                kokonaisumma REAL, vuokravakuus REAL, vakuuden_maksupv TEXT,
                kenen_tililla_vakuus TEXT, avaimet_luovutettu TEXT,
                vesimittari_luettu TEXT, valitys_laskutettu TEXT, valityshinta REAL,
                lisatietoja TEXT, luotu TEXT, paivitetty TEXT
            )''')
            cur.execute('''CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                fullname TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                active INTEGER NOT NULL DEFAULT 1,
                created TEXT NOT NULL
            )''')
        conn.commit()

        count = execute_scalar(conn, 'SELECT COUNT(*) FROM users')
        if count == 0:
            execute_write(conn,
                'INSERT INTO users (username, fullname, password_hash, role, active, created) '
                'VALUES (%s,%s,%s,%s,%s,%s)',
                ('admin', 'Pääkäyttäjä', generate_password_hash('admin123'), 'admin', 1,
                 datetime.now().strftime('%Y-%m-%d')))
            conn.commit()

    else:
        conn.execute('''CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kohde_osoite TEXT, omistaja TEXT, vuokranantajan_kontakti TEXT,
            vuokranantajan_sahkoposti TEXT, vuokranantajan_puhelin TEXT,
            tyyppi TEXT, koko REAL, kaupunki TEXT, postinumero TEXT,
            huolenpitosopimus TEXT, huolenpidossa TEXT, vuokrauksessa TEXT,
            vuokravalittaja TEXT, vastuuhenkilo TEXT, laskutusperuste TEXT,
            laskutuksen_status TEXT, vuokratilitykset TEXT,
            vuokrasopimus_alkaen TEXT, vuokrasopimus_paattyy TEXT,
            vuokrattu TEXT, vuokramarkkinalla TEXT, asunnon_tila TEXT,
            vuokralaisen_nimi TEXT, vuokralaisen_puhelin TEXT,
            vuokralaisen_sahkoposti TEXT, vuokra_alussa REAL, vuokra_tanaan REAL,
            vesimaksut REAL, muut_maksut TEXT, saunamaksut TEXT,
            kokonaisumma REAL, vuokravakuus REAL, vakuuden_maksupv TEXT,
            kenen_tililla_vakuus TEXT, avaimet_luovutettu TEXT,
            vesimittari_luettu TEXT, valitys_laskutettu TEXT, valityshinta REAL,
            lisatietoja TEXT, luotu TEXT, paivitetty TEXT
        )''')
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

        count = execute_scalar(conn, 'SELECT COUNT(*) FROM users')
        if count == 0:
            conn.execute(
                'INSERT INTO users (username, fullname, password_hash, role, active, created) '
                'VALUES (?,?,?,?,?,?)',
                ('admin', 'Pääkäyttäjä', generate_password_hash('admin123'), 'admin', 1,
                 datetime.now().strftime('%Y-%m-%d')))
            conn.commit()

    conn.close()


# ── Auth decorators ──────────────────────────────────────────────────────────

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


# ── Pages ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Auth API ─────────────────────────────────────────────────────────────────

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    p = placeholder()
    conn = get_db()
    row = execute_one(conn, f'SELECT * FROM users WHERE username = {p} AND active = 1', (username,))
    conn.close()

    if not row or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Väärä käyttäjätunnus tai salasana'}), 401

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
        return jsonify({'error': 'Salasanan on oltava vähintään 4 merkkiä'}), 400

    p = placeholder()
    conn = get_db()
    row = execute_one(conn, f'SELECT * FROM users WHERE id = {p}', (session['user_id'],))
    if not row or not check_password_hash(row['password_hash'], old_pw):
        conn.close()
        return jsonify({'error': 'Nykyinen salasana on väärä'}), 400

    execute_write(conn, f'UPDATE users SET password_hash = {p} WHERE id = {p}',
                  (generate_password_hash(new_pw), session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Salasana vaihdettu'})


# ── User management API (admin only) ─────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    conn = get_db()
    rows = execute_query(conn,
        'SELECT id, username, fullname, role, active, created FROM users ORDER BY id ASC')
    conn.close()
    return jsonify(rows)


@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    fullname = (data.get('fullname') or '').strip()
    password = data.get('password') or ''
    role     = data.get('role', 'user')
    active   = 1 if data.get('active', True) else 0

    if not username or not fullname:
        return jsonify({'error': 'Käyttäjätunnus ja nimi ovat pakollisia'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Salasanan on oltava vähintään 4 merkkiä'}), 400
    if role not in ('admin', 'user'):
        return jsonify({'error': 'Virheellinen rooli'}), 400

    p = placeholder()
    conn = get_db()
    existing = execute_one(conn, f'SELECT id FROM users WHERE username = {p}', (username,))
    if existing:
        conn.close()
        return jsonify({'error': 'Käyttäjätunnus on jo käytössä'}), 409

    if USE_PG:
        new_id = execute_write(conn,
            'INSERT INTO users (username, fullname, password_hash, role, active, created) '
            'VALUES (%s,%s,%s,%s,%s,%s) RETURNING id',
            (username, fullname, generate_password_hash(password), role, active,
             datetime.now().strftime('%Y-%m-%d')))
    else:
        new_id = execute_write(conn,
            'INSERT INTO users (username, fullname, password_hash, role, active, created) '
            'VALUES (?,?,?,?,?,?)',
            (username, fullname, generate_password_hash(password), role, active,
             datetime.now().strftime('%Y-%m-%d')))

    conn.commit()
    conn.close()
    return jsonify({'id': new_id, 'message': 'Käyttäjä luotu'}), 201


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    data = request.get_json()
    username     = (data.get('username') or '').strip()
    fullname     = (data.get('fullname') or '').strip()
    role         = data.get('role', 'user')
    active       = 1 if data.get('active', True) else 0
    new_password = data.get('password') or ''

    if not username or not fullname:
        return jsonify({'error': 'Käyttäjätunnus ja nimi ovat pakollisia'}), 400
    if role not in ('admin', 'user'):
        return jsonify({'error': 'Virheellinen rooli'}), 400

    p = placeholder()
    conn = get_db()
    existing = execute_one(conn,
        f'SELECT id FROM users WHERE username = {p} AND id != {p}', (username, user_id))
    if existing:
        conn.close()
        return jsonify({'error': 'Käyttäjätunnus on jo käytössä'}), 409

    if new_password:
        if len(new_password) < 4:
            conn.close()
            return jsonify({'error': 'Salasanan on oltava vähintään 4 merkkiä'}), 400
        execute_write(conn,
            f'UPDATE users SET username={p}, fullname={p}, role={p}, active={p}, password_hash={p} WHERE id={p}',
            (username, fullname, role, active, generate_password_hash(new_password), user_id))
    else:
        execute_write(conn,
            f'UPDATE users SET username={p}, fullname={p}, role={p}, active={p} WHERE id={p}',
            (username, fullname, role, active, user_id))

    conn.commit()
    conn.close()

    if user_id == session.get('user_id'):
        session['username'] = username
        session['fullname'] = fullname
        session['role'] = role

    return jsonify({'message': 'Käyttäjä päivitetty'})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == session.get('user_id'):
        return jsonify({'error': 'Et voi poistaa omaa tiliäsi'}), 400

    p = placeholder()
    conn = get_db()
    execute_write(conn, f'DELETE FROM users WHERE id = {p}', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Käyttäjä poistettu'})


# ── Stats ────────────────────────────────────────────────────────────────────

@app.route('/api/stats')
@login_required
def stats():
    conn = get_db()
    total     = execute_scalar(conn, 'SELECT COUNT(*) FROM properties')
    vuokrattu = execute_scalar(conn,
        "SELECT COUNT(*) FROM properties WHERE LOWER(vuokrattu) = 'kyllä'")
    vapaat    = total - vuokrattu
    vuokra_sum = execute_scalar(conn,
        "SELECT SUM(kokonaisumma) FROM properties "
        "WHERE kokonaisumma IS NOT NULL AND LOWER(vuokrattu) = 'kyllä'") or 0
    huolenpidossa = execute_scalar(conn,
        "SELECT COUNT(*) FROM properties WHERE LOWER(huolenpidossa) = 'kyllä'")
    conn.close()
    return jsonify({
        'total': total,
        'vuokrattu': vuokrattu,
        'vapaat': vapaat,
        'vuokra_sum': round(float(vuokra_sum), 2),
        'huolenpidossa': huolenpidossa,
    })


# ── Properties ───────────────────────────────────────────────────────────────

@app.route('/api/properties', methods=['GET'])
@login_required
def get_properties():
    search          = request.args.get('search', '').strip()
    vuokrattu_f     = request.args.get('vuokrattu', '').strip()
 