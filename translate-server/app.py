# ============================================================
# Lexora AI - self-hosted translation service (our own engine, no paid API)
#
# Engine priority (automatic):
#   1. Meta NLLB-200 (default; env NLLB_MODEL, default facebook/nllb-200-distilled-600M)
#   2. MarianMT (Helsinki-NLP opus-mt, per language pair, lazy) - used automatically
#      if NLLB cannot load (hardware / RAM constraints)
#   3. LibreTranslate proxy - ONLY if neither model engine is available AND
#      LIBRETRANSLATE_FALLBACK_URL is set
#
# Contract (what convert-server calls):
#   POST /translate  {q, source:'auto'|iso, target: iso-639-1 or FLORES-200 code}
#     -> {translatedText, engine, detectedSource}
#   GET /  -> {ok, engine, model} health + which engine is active
#
# Env: PORT (host sets it), NLLB_MODEL, FORCE_ENGINE (''|nllb|marian|libretranslate),
#      LIBRETRANSLATE_FALLBACK_URL (optional last resort), MAX_SEGMENT_CHARS (900),
#      HF_HOME (model cache dir; the Dockerfile PRE-BAKES the NLLB model here at
#      build time, so boots load from disk - no download. Volume at /models only
#      when built with PREBAKE=0.)
# ============================================================
import os
import re
import sys
import threading

from flask import Flask, jsonify, request

PORT = int(os.environ.get('PORT', 5000))
NLLB_MODEL = os.environ.get('NLLB_MODEL', 'facebook/nllb-200-distilled-600M')
FORCE_ENGINE = (os.environ.get('FORCE_ENGINE') or '').strip().lower()
LT_URL = (os.environ.get('LIBRETRANSLATE_FALLBACK_URL') or '').rstrip('/')
MAX_SEG = int(os.environ.get('MAX_SEGMENT_CHARS', '900'))

app = Flask(__name__)

# ISO 639-1 -> FLORES-200 (NLLB) codes. A raw FLORES code (e.g. "hin_Deva") is
# accepted as-is, so ALL 200 NLLB languages work; this map covers the short codes
# the UI and language detection use.
FLORES = {
    'en': 'eng_Latn', 'hi': 'hin_Deva', 'bn': 'ben_Beng', 'ta': 'tam_Taml',
    'te': 'tel_Telu', 'mr': 'mar_Deva', 'gu': 'guj_Gujr', 'kn': 'kan_Knda',
    'ml': 'mal_Mlym', 'pa': 'pan_Guru', 'ur': 'urd_Arab', 'or': 'ory_Orya',
    'as': 'asm_Beng', 'ne': 'npi_Deva', 'si': 'sin_Sinh',
    'es': 'spa_Latn', 'fr': 'fra_Latn', 'de': 'deu_Latn', 'pt': 'por_Latn',
    'it': 'ita_Latn', 'nl': 'nld_Latn', 'ru': 'rus_Cyrl', 'uk': 'ukr_Cyrl',
    'pl': 'pol_Latn', 'cs': 'ces_Latn', 'ro': 'ron_Latn', 'el': 'ell_Grek',
    'sv': 'swe_Latn', 'da': 'dan_Latn', 'no': 'nob_Latn', 'fi': 'fin_Latn',
    'hu': 'hun_Latn', 'bg': 'bul_Cyrl', 'sr': 'srp_Cyrl', 'hr': 'hrv_Latn',
    'sk': 'slk_Latn', 'sl': 'slv_Latn', 'lt': 'lit_Latn', 'lv': 'lvs_Latn',
    'et': 'est_Latn', 'tr': 'tur_Latn', 'ar': 'arb_Arab', 'fa': 'pes_Arab',
    'he': 'heb_Hebr', 'zh': 'zho_Hans', 'zh-tw': 'zho_Hant', 'ja': 'jpn_Jpan',
    'ko': 'kor_Hang', 'vi': 'vie_Latn', 'th': 'tha_Thai', 'id': 'ind_Latn',
    'ms': 'zsm_Latn', 'tl': 'tgl_Latn', 'sw': 'swh_Latn', 'am': 'amh_Ethi',
    'ha': 'hau_Latn', 'yo': 'yor_Latn', 'ig': 'ibo_Latn', 'zu': 'zul_Latn',
    'af': 'afr_Latn', 'sq': 'als_Latn', 'az': 'azj_Latn', 'be': 'bel_Cyrl',
    'bs': 'bos_Latn', 'ca': 'cat_Latn', 'cy': 'cym_Latn', 'eo': 'epo_Latn',
    'eu': 'eus_Latn', 'ga': 'gle_Latn', 'gl': 'glg_Latn', 'hy': 'hye_Armn',
    'is': 'isl_Latn', 'ka': 'kat_Geor', 'kk': 'kaz_Cyrl', 'km': 'khm_Khmr',
    'ky': 'kir_Cyrl', 'lo': 'lao_Laoo', 'mk': 'mkd_Cyrl', 'mn': 'khk_Cyrl',
    'my': 'mya_Mymr', 'ps': 'pbt_Arab', 'so': 'som_Latn', 'tg': 'tgk_Cyrl',
    'tk': 'tuk_Latn', 'uz': 'uzn_Latn',
}
FLORES_TO_ISO = {v: k for k, v in FLORES.items()}

state = {'engine': 'loading', 'nllb': None, 'error': ''}
marian_cache = {}
marian_lock = threading.Lock()


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def to_flores(code):
    c = (code or '').strip()
    if re.fullmatch(r'[a-z]{3}_[A-Za-z]{4}', c):
        return c
    return FLORES.get(c.lower())


def to_iso(code):
    c = (code or '').strip()
    if re.fullmatch(r'[a-z]{3}_[A-Za-z]{4}', c):
        return FLORES_TO_ISO.get(c, 'en')
    return c.lower()[:2] if c else 'en'


def detect_lang(text):
    try:
        from langdetect import detect
        return detect(text[:2000])
    except Exception:
        return 'en'


def transformers_ok():
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
        return False


def load_nllb():
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    log('loading NLLB model %s (first boot downloads it)...' % NLLB_MODEL)
    tok = AutoTokenizer.from_pretrained(NLLB_MODEL)
    mdl = AutoModelForSeq2SeqLM.from_pretrained(NLLB_MODEL, low_cpu_mem_usage=True)
    mdl.eval()
    return (tok, mdl)


def boot():
    """Pick the best available engine: NLLB -> MarianMT -> LibreTranslate proxy."""
    if FORCE_ENGINE == 'marian':
        state['engine'] = 'marian' if transformers_ok() else ('libretranslate' if LT_URL else 'none')
        log('engine (forced): %s' % state['engine'])
        return
    if FORCE_ENGINE == 'libretranslate':
        state['engine'] = 'libretranslate' if LT_URL else 'none'
        log('engine (forced): %s' % state['engine'])
        return
    try:
        state['nllb'] = load_nllb()
        state['engine'] = 'nllb'
        log('engine: NLLB-200 ready (%s)' % NLLB_MODEL)
    except Exception as e:
        state['error'] = str(e)[:300]
        log('NLLB unavailable (%s)' % e)
        if transformers_ok():
            state['engine'] = 'marian'
            log('engine: MarianMT fallback (per-language-pair, lazy download)')
        elif LT_URL:
            state['engine'] = 'libretranslate'
            log('engine: LibreTranslate proxy fallback -> %s' % LT_URL)
        else:
            state['engine'] = 'none'
            log('engine: NONE available')


def split_line(line):
    """Split one line into <= MAX_SEG-char pieces on sentence boundaries."""
    if len(line) <= MAX_SEG:
        return [line]
    sents = re.split(r'(?<=[\.\!\?।۔。])\s+', line)
    out, cur = [], ''
    for s in sents:
        while len(s) > MAX_SEG:                      # pathological unpunctuated runs
            out.append(s[:MAX_SEG])
            s = s[MAX_SEG:]
        if cur and len(cur) + len(s) + 1 > MAX_SEG:
            out.append(cur)
            cur = s
        else:
            cur = (cur + ' ' + s).strip() if cur else s
    if cur:
        out.append(cur)
    return out


def nllb_tx(seg, src_flores, tgt_flores):
    import torch
    tok, mdl = state['nllb']
    tok.src_lang = src_flores
    with torch.no_grad():
        inputs = tok(seg, return_tensors='pt', truncation=True, max_length=512)
        bos = None
        if hasattr(tok, 'lang_code_to_id') and tgt_flores in getattr(tok, 'lang_code_to_id', {}):
            bos = tok.lang_code_to_id[tgt_flores]
        if bos is None:
            bos = tok.convert_tokens_to_ids(tgt_flores)
        gen = mdl.generate(**inputs, forced_bos_token_id=bos, max_length=512, num_beams=1)
    return tok.batch_decode(gen, skip_special_tokens=True)[0]


def marian_model(src, tgt):
    key = src + '-' + tgt
    with marian_lock:
        if key in marian_cache:
            return marian_cache[key]
    from transformers import MarianMTModel, MarianTokenizer
    name = 'Helsinki-NLP/opus-mt-%s-%s' % (src, tgt)
    log('loading MarianMT pair %s...' % name)
    tok = MarianTokenizer.from_pretrained(name)
    mdl = MarianMTModel.from_pretrained(name)
    mdl.eval()
    with marian_lock:
        marian_cache[key] = (tok, mdl)
    return (tok, mdl)


def marian_run(pair, seg):
    import torch
    tok, mdl = pair
    with torch.no_grad():
        batch = tok([seg], return_tensors='pt', truncation=True, max_length=512)
        gen = mdl.generate(**batch, max_length=512)
    return tok.batch_decode(gen, skip_special_tokens=True)[0]


def marian_tx(seg, src, tgt):
    """Direct pair if it exists, otherwise pivot through English."""
    try:
        return marian_run(marian_model(src, tgt), seg)
    except Exception:
        if src != 'en' and tgt != 'en':
            mid = marian_run(marian_model(src, 'en'), seg)
            return marian_run(marian_model('en', tgt), mid)
        raise


def lt_tx(seg, src, tgt):
    import requests
    r = requests.post(LT_URL + '/translate',
                      json={'q': seg, 'source': src or 'auto', 'target': tgt, 'format': 'text'},
                      timeout=120)
    r.raise_for_status()
    return r.json().get('translatedText', '')


def translate_text(text, src_iso, target):
    """Translate line-by-line (newlines preserved), sentence-packed segments."""
    eng = state['engine']
    if eng == 'nllb':
        src_f = to_flores(src_iso) or 'eng_Latn'
        tgt_f = to_flores(target)
        if not tgt_f:
            raise ValueError('unsupported target language: %s' % target)
        tx = lambda seg: nllb_tx(seg, src_f, tgt_f)
    elif eng == 'marian':
        tgt_i = to_iso(target)
        src_i = to_iso(src_iso)
        tx = lambda seg: marian_tx(seg, src_i, tgt_i)
    elif eng == 'libretranslate':
        tgt_i = to_iso(target)
        tx = lambda seg: lt_tx(seg, to_iso(src_iso), tgt_i)
    else:
        raise RuntimeError('no translation engine available')
    out = []
    for line in text.split('\n'):
        if not line.strip():
            out.append(line)
            continue
        out.append(' '.join(tx(p) for p in split_line(line)))
    return '\n'.join(out)


@app.get('/')
def health():
    return jsonify(ok=state['engine'] not in ('none', 'loading'),
                   engine=state['engine'],
                   model=NLLB_MODEL if state['engine'] == 'nllb' else state['engine'],
                   error=state['error'] or None)


@app.post('/translate')
def translate():
    data = request.get_json(force=True, silent=True) or {}
    q = str(data.get('q') or '')
    target = str(data.get('target') or 'en')
    source = str(data.get('source') or 'auto')
    if not q.strip():
        return jsonify(translatedText='', engine=state['engine'], detectedSource=None)
    if state['engine'] == 'loading':
        return jsonify(error='translation engine is warming up - try again in a minute'), 503
    if state['engine'] == 'none':
        return jsonify(error='no translation engine available on this host'), 500
    src_iso = detect_lang(q) if source == 'auto' else to_iso(source)
    try:
        out = translate_text(q, src_iso, target)
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except Exception as e:
        log('translate failed:', e)
        return jsonify(error=('translation failed: ' + str(e))[:300]), 500
    return jsonify(translatedText=out, engine=state['engine'], detectedSource=src_iso)


if __name__ == '__main__':
    threading.Thread(target=boot, daemon=True).start()   # bind the port immediately;
    from waitress import serve                           # 503 until the model is ready
    log('lexora-translate listening on %d' % PORT)
    serve(app, host='0.0.0.0', port=PORT, threads=4)
