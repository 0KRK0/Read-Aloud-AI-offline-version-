# ============================================================
# Lexora AI - self-hosted translation service v2 (our own engine, no paid API)
#
# Runtime: Meta NLLB-200 on **CTranslate2, int8-quantized** - the industry
# standard CPU inference engine for MT. ~650 MB resident for the 600M model,
# 4-8x faster than fp32 torch, NO PyTorch in the runtime image. The model is
# converted once at Docker BUILD time (see Dockerfile) into /model.
#
# Engine chain (v2 - simplified so every tier can actually fire):
#   1. NLLB-200 int8 via CTranslate2 (fits in <1 GB - works on any small host)
#   2. LibreTranslate proxy - ONLY if LIBRETRANSLATE_FALLBACK_URL is set
#   (MarianMT tier REMOVED: it existed for "NLLB might not fit"; int8 NLLB now
#    fits anywhere Marian would have, so the tier was pure complexity.)
#
# Ops notes (the OOM-loop post-mortem):
#   - fp32 torch NLLB needed ~3.5 GB peak -> SIGKILL on a 2 GB container right
#     after "engine ready" (mmap'd weights page in on first inference). An
#     in-process fallback can never catch a SIGKILL - fixed by making the
#     workload fit, not by catching the uncatchable.
#   - /healthz returns 503 until the model is loaded: point the Railway
#     healthcheck at /healthz. / always answers (liveness + engine info).
#   - MAX_CONCURRENCY (default 2) caps simultaneous decodes; extra requests
#     queue briefly in waitress instead of multiplying activation memory.
#
# Contract (unchanged - convert-server needs no changes):
#   POST /translate {q, source:'auto'|iso, target: iso-639-1 or FLORES-200}
#     -> {translatedText, engine, detectedSource}
#   GET / -> {ok, engine, model}   GET /healthz -> 200 ready / 503 warming
#
# Env: PORT (host sets), MODEL_DIR (/model), MAX_SEGMENT_CHARS (900),
#      MAX_CONCURRENCY (default min(2, cpus)), INTRA_THREADS (default
#      cpus // MAX_CONCURRENCY - see effective_cpus()),
#      LIBRETRANSLATE_FALLBACK_URL (optional last resort)
#
# CPU detection: os.cpu_count() sees the HOST (48 cores on Railway's machines)
# because cgroup CPU quotas are invisible to it - v2 shipped with 48 intra
# threads throttled onto 2 vCPUs (the classic container bug the JVM fixed with
# UseContainerSupport and Go with automaxprocs). effective_cpus() resolves the
# REAL budget: env override > cgroup v2 quota > cgroup v1 quota > affinity
# mask > os.cpu_count(). Threads are then budgeted JOINTLY with concurrency:
# MAX_CONCURRENCY decodes x INTRA_THREADS each ~= effective cores, so the
# service is saturated but never oversubscribed - on any instance size.
# ============================================================
import math
import os
import re
import sys
import threading

from flask import Flask, jsonify, request

PORT = int(os.environ.get('PORT', 5000))
MODEL_DIR = os.environ.get('MODEL_DIR', '/model')
LT_URL = (os.environ.get('LIBRETRANSLATE_FALLBACK_URL') or '').rstrip('/')
MAX_SEG = int(os.environ.get('MAX_SEGMENT_CHARS', '900'))


def effective_cpus():
    """CPUs this CONTAINER may actually use (cgroup-aware), with the source."""
    try:                                            # cgroup v2: "200000 100000" = 2 CPUs
        with open('/sys/fs/cgroup/cpu.max') as f:
            quota, period = f.read().split()[:2]
            if quota != 'max' and int(period) > 0:
                return max(1, math.ceil(int(quota) / int(period))), 'cgroup-v2'
    except Exception:
        pass
    try:                                            # cgroup v1
        quota = int(open('/sys/fs/cgroup/cpu/cpu.cfs_quota_us').read())
        period = int(open('/sys/fs/cgroup/cpu/cpu.cfs_period_us').read())
        if quota > 0 and period > 0:
            return max(1, math.ceil(quota / period)), 'cgroup-v1'
    except Exception:
        pass
    try:                                            # cpuset pinning
        n = len(os.sched_getaffinity(0))
        if n:
            return n, 'affinity'
    except Exception:
        pass
    return (os.cpu_count() or 1), 'cpu_count'       # bare metal / last resort


CPUS, CPU_SRC = effective_cpus()
# concurrency first (how many requests decode at once), then split the CPU
# budget between them. Env overrides always win; defaults scale with the box:
#   2 vCPU  -> conc 2 x intra 1        8 vCPU  -> conc 2 x intra 4
MAX_CONC = max(1, int(os.environ.get('MAX_CONCURRENCY', '0')) or min(2, CPUS))
INTRA = max(1, int(os.environ.get('INTRA_THREADS', '0')) or (CPUS // MAX_CONC))

app = Flask(__name__)

# ISO 639-1 -> FLORES-200 (NLLB) codes. Raw FLORES codes (e.g. "hin_Deva") are
# accepted as-is, so ALL 200 NLLB languages work; this map covers short codes.
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

state = {'engine': 'loading', 'error': ''}
tok = None
translator = None
sem = threading.Semaphore(MAX_CONC)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def to_flores(code):
    c = (code or '').strip()
    if re.fullmatch(r'[a-z]{3}_[A-Za-z]{4}', c):
        return c
    return FLORES.get(c.lower())


def to_iso(code):
    c = (code or '').strip()
    return c.lower()[:2] if c else 'en'


def detect_lang(text):
    try:
        from langdetect import detect
        return detect(text[:2000])
    except Exception:
        return 'en'


def boot():
    global tok, translator
    try:
        import ctranslate2
        from transformers import AutoTokenizer   # tokenizer only - NO torch
        log('loading tokenizer + CT2 int8 model from %s ...' % MODEL_DIR)
        tok = AutoTokenizer.from_pretrained(os.path.join(MODEL_DIR, 'tok'))
        translator = ctranslate2.Translator(
            os.path.join(MODEL_DIR, 'ct2'),
            device='cpu', compute_type='int8',
            inter_threads=1, intra_threads=INTRA)
        state['engine'] = 'nllb'
        log('engine: NLLB-200 int8 on CTranslate2 ready '
            '(cpus=%d via %s, max_concurrency=%d, intra_threads=%d/decode, total=%d)'
            % (CPUS, CPU_SRC, MAX_CONC, INTRA, MAX_CONC * INTRA))
    except Exception as e:
        state['error'] = str(e)[:300]
        log('NLLB/CT2 unavailable (%s)' % e)
        state['engine'] = 'libretranslate' if LT_URL else 'none'
        log('engine: %s' % state['engine'])


def split_line(line):
    """Split one line into <= MAX_SEG-char pieces on sentence boundaries."""
    if len(line) <= MAX_SEG:
        return [line]
    sents = re.split(r'(?<=[\.\!\?।۔。])\s+', line)
    out, cur = [], ''
    for s in sents:
        while len(s) > MAX_SEG:
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
    tok.src_lang = src_flores
    source = tok.convert_ids_to_tokens(tok.encode(seg))
    with sem:                                     # cap concurrent decodes
        res = translator.translate_batch(
            [source], target_prefix=[[tgt_flores]],
            beam_size=1, max_decoding_length=512, max_input_length=512)
    target = res[0].hypotheses[0]
    if target and target[0] == tgt_flores:
        target = target[1:]
    return tok.decode(tok.convert_tokens_to_ids(target), skip_special_tokens=True)


def lt_tx(seg, src, tgt):
    import requests
    r = requests.post(LT_URL + '/translate',
                      json={'q': seg, 'source': src or 'auto', 'target': tgt, 'format': 'text'},
                      timeout=120)
    r.raise_for_status()
    return r.json().get('translatedText', '')


def translate_text(text, src_iso, target):
    eng = state['engine']
    if eng == 'nllb':
        src_f = to_flores(src_iso) or 'eng_Latn'
        tgt_f = to_flores(target)
        if not tgt_f:
            raise ValueError('unsupported target language: %s' % target)
        tx = lambda seg: nllb_tx(seg, src_f, tgt_f)
    elif eng == 'libretranslate':
        tx = lambda seg: lt_tx(seg, to_iso(src_iso), to_iso(target))
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
def root():
    return jsonify(ok=state['engine'] not in ('none', 'loading'),
                   engine=state['engine'],
                   model='nllb-200-600M-int8-ct2' if state['engine'] == 'nllb' else state['engine'],
                   error=state['error'] or None)


@app.get('/healthz')
def healthz():
    """Readiness probe - point the Railway healthcheck here."""
    if state['engine'] == 'nllb' or state['engine'] == 'libretranslate':
        return jsonify(ok=True), 200
    return jsonify(ok=False, engine=state['engine'], error=state['error'] or None), 503


@app.post('/translate')
def translate():
    data = request.get_json(force=True, silent=True) or {}
    q = str(data.get('q') or '')
    target = str(data.get('target') or 'en')
    source = str(data.get('source') or 'auto')
    if len(q) > 20000:
        return jsonify(error='chunk too large - send <= 20000 chars per request'), 413
    if not q.strip():
        return jsonify(translatedText='', engine=state['engine'], detectedSource=None)
    if state['engine'] == 'loading':
        return jsonify(error='translation engine is warming up - try again shortly'), 503
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
    threading.Thread(target=boot, daemon=True).start()  # bind the port at once;
    from waitress import serve                          # /healthz gates readiness
    log('lexora-translate v2 listening on %d (IPv4+IPv6)' % PORT)
    # listen='*' binds BOTH stacks. Railway's private mesh (*.railway.internal)
    # is IPv6-only - a plain 0.0.0.0 bind is unreachable over it.
    serve(app, listen='*:%d' % PORT, threads=4)
