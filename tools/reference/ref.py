#!/usr/bin/env python3
"""
Mo hinh tham chieu (reference model) cho Web Rubik.
- Doc lap voi engine TypeScript; dung de sinh vectors.json va 07-tables.json
  va de doi chieu (differential test) o Giai doan 2.
- Quy uoc theo docs/spec/01..09 (hoac de xuat ro rang trong ghi chu).
"""
import json, re, sys, random, collections, subprocess, shutil, os

FN = "URFDLB"
NORM = [(0,1,0),(1,0,0),(0,0,1),(0,-1,0),(-1,0,0),(0,0,-1)]
RIGHT = [(1,0,0),(0,0,-1),(1,0,0),(1,0,0),(0,0,1),(-1,0,0)]   # huong cot tang (01-coordinates)
DOWN  = [(0,0,1),(0,-1,0),(0,-1,0),(0,0,-1),(0,-1,0),(0,-1,0)]  # huong hang tang

def add(a,b): return tuple(x+y for x,y in zip(a,b))
def scale(a,k): return tuple(x*k for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def rot_vec(v, n, sign):  # quay 90 do * sign quanh truc don vi n (sign=-1: thuan kim dong ho nhin tu ngoai)
    return add(scale(n, dot(n, v)), scale(cross(n, v), sign))

# ---------------------------------------------------------------- hinh hoc
class Geo:
    def __init__(self, N):
        self.N = N
        self.slots = []
        self.idx = {}
        for f in range(6):
            for r in range(N):
                for c in range(N):
                    # toa do cubie nhan doi de dung so nguyen: gia tri trong {-(N-1), ..., N-1} buoc 2
                    cub = add(add(scale(NORM[f], N-1), scale(RIGHT[f], 2*c-(N-1))), scale(DOWN[f], 2*r-(N-1)))
                    self.idx[(cub, NORM[f])] = len(self.slots)
                    self.slots.append((cub, NORM[f]))
_geo = {}
def geo(N):
    if N not in _geo: _geo[N] = Geo(N)
    return _geo[N]

def block_perm(N, axis, sign, lo, hi):
    g = geo(N)
    p = list(range(len(g.slots)))
    for i, (cub, nm) in enumerate(g.slots):
        if lo <= dot(cub, axis) <= hi:
            p[i] = g.idx[(rot_vec(cub, axis, sign), rot_vec(nm, axis, sign))]
    return p

def compose(p, q):  # ap dung p roi q
    return [q[x] for x in p]

def apply_state(state, perm):
    ns = [0]*len(state)
    for s, v in enumerate(state): ns[perm[s]] = v
    return ns

def solved_state(N): return [i // (N*N) for i in range(6*N*N)]
def state_str(st): return "".join(str(x) for x in st)

# ---------------------------------------------------------------- parser
class ParseError(Exception):
    def __init__(self, code, token): super().__init__(f"{code}: {token}"); self.code = code; self.token = token

SUF = r"(?P<s>2'|2|')?"
RE_FACE = re.compile(r"^(?P<n>\d+)?(?P<f>[URFDLB])(?P<w>w)?" + SUF + "$")
RE_LOW  = re.compile(r"^(?P<f>[urfdlb])" + SUF + "$")
RE_SLC  = re.compile(r"^(?P<m>[MES])" + SUF + "$")
RE_ROT  = re.compile(r"^(?P<r>[xyz])" + SUF + "$")

def turns_of(s):
    if s in (None, ""): return 1
    if s == "'": return 3
    return 2   # "2" hoac "2'"

def suffix_str(t): return {1: "", 2: "2", 3: "'"}[t]

def parse(text, N):
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    out = []
    for tok in text.split():
        m = RE_FACE.match(tok); low = RE_LOW.match(tok); sl = RE_SLC.match(tok); ro = RE_ROT.match(tok)
        if low:
            f = FN.index(low.group("f").upper()); t = turns_of(low.group("s"))
            m = None; kind = "wide"; n = 2
            if N < 3 or 2 > N-1: raise ParseError("WIDE_RANGE", tok)
            letter = FN[f]; a, b = 1, 2
        elif m:
            f = FN.index(m.group("f")); t = turns_of(m.group("s")); letter = FN[f]
            n = int(m.group("n")) if m.group("n") else None
            if m.group("w"):
                kind = "wide"; nn = 2 if n is None else n
                if not (2 <= nn <= N-1): raise ParseError("WIDE_RANGE", tok)
                a, b = 1, nn; n = nn
            else:
                kind = "face"; nn = 1 if n is None else n
                if not (1 <= nn <= (1 if N == 2 else N)): raise ParseError("LAYER_RANGE", tok)
                a, b = nn, nn; n = nn
        elif sl:
            if N != 3: raise ParseError("SLICE_ONLY_3X3", tok)
            kind = "slice"; t = turns_of(sl.group("s")); letter = sl.group("m")
        elif ro:
            kind = "rot"; t = turns_of(ro.group("s")); letter = ro.group("r")
        else:
            raise ParseError("BAD_TOKEN", tok)
        # ---- canonical string va khoi lop tuyet doi
        if kind in ("face", "wide"):
            n_ = NORM[f]; sigma = n_[[i for i in range(3) if n_[i]][0]]; ax = [i for i in range(3) if n_[i]][0]
            lo, hi = N+1-2*b, N+1-2*a          # toa do doc theo phap tuyen mat
            ab = sorted([sigma*lo, sigma*hi])
            s = -sigma*t                         # quay quanh truc duong
            if kind == "face": canon = (f"{a}" if a > 1 else "") + letter + suffix_str(t)
            else: canon = (f"{b}" if b > 2 else "") + letter + "w" + suffix_str(t)
            axis_vec, sign, plo, phi = n_, -1, lo, hi
        elif kind == "slice":
            ax = "MES".index(letter) if False else {"M":0,"E":1,"S":2}[letter]
            s = t if letter in "ME" else -t
            ab = [0, 0]; canon = letter + suffix_str(t)
            unit = [(1,0,0),(0,1,0),(0,0,1)][ax]
            axis_vec, sign, plo, phi = unit, (1 if letter in "ME" else -1), 0, 0
        else:
            ax = "xyz".index(letter); s = -t
            ab = [-(N-1), N-1]; canon = letter + suffix_str(t)
            unit = [(1,0,0),(0,1,0),(0,0,1)][ax]
            axis_vec, sign, plo, phi = unit, -1, -(N-1), N-1
        if ab[0] <= -(N-1) and ab[1] >= N-1: w = 0
        elif ab[0] == -(N-1) or ab[1] == N-1: w = 1
        else: w = 2
        out.append(dict(canon=canon, kind=kind, ax=ax, ab=ab, s=s, turns=t, weight=w,
                        axis_vec=axis_vec, sign=sign, lo=plo, hi=phi))
    return out

def canon_str(text, N): return [t["canon"] for t in parse(text, N)]

_perm_cache = {}
def token_perm(N, tk):
    key = (N, tk["canon"])
    if key in _perm_cache: return _perm_cache[key]
    base = block_perm(N, tk["axis_vec"], tk["sign"], tk["lo"], tk["hi"])
    p = list(range(len(base)))
    for _ in range(tk["turns"]): p = compose(p, base)
    _perm_cache[key] = p
    return p

def run(text, N, state=None):
    st = solved_state(N) if state is None else list(state)
    for tk in parse(text, N):
        st = apply_state(st, token_perm(N, tk))
    return st

# ---------------------------------------------------------------- metrics (03)
def press_count(tokens): return sum(t["weight"] for t in tokens)

def solution_length(tokens):
    stack = []
    for t in tokens:
        if t["kind"] == "rot":
            stack.append(dict(t)); continue
        if stack and stack[-1]["kind"] != "rot" and stack[-1]["ax"] == t["ax"] and stack[-1]["ab"] == t["ab"]:
            top = stack[-1]; top["s"] = (top["s"] + t["s"]) % 4
            if top["s"] == 0: stack.pop()
        else:
            u = dict(t); u["s"] = t["s"] % 4; stack.append(u)
            if u["s"] == 0: stack.pop()
    return sum(t["weight"] for t in stack if t["kind"] != "rot")

# ---------------------------------------------------------------- stats (04)
DNF = None
def eff(ms, pen): return None if pen == "DNF" else (ms + 2000 if pen == "+2" else ms)
def rnd_div(total, cnt): return (2*total + cnt) // (2*cnt)   # Math.round(total/cnt) cho so duong
def disp(ms):
    if ms is None: return "DNF"
    cs = ms // 10; sec = cs // 100; c = cs % 100
    return f"{sec//60}:{sec%60:02d}.{c:02d}" if sec >= 60 else f"{sec}.{c:02d}"
def mo3(items):
    v = [eff(a, b) for a, b in items]
    if any(x is None for x in v): return None
    return rnd_div(sum(v), 3)
def ao(items):
    n = len(items); v = [eff(a, b) for a, b in items]
    d = [x for x in v if x is None]
    if len(d) >= 2: return None
    ok = [x for x in v if x is not None]
    if len(d) == 1: ok.remove(min(ok))
    else: ok.remove(min(ok)); ok.remove(max(ok))
    return rnd_div(sum(ok), n-2)
def single(items):
    v = [eff(a, b) for a, b in items if eff(a, b) is not None]
    return min(v) if v else None

# ---------------------------------------------------------------- bang chi so 3x3 cho 07
EDGES = ["UF","UR","UB","UL","DF","DR","DB","DL","FR","FL","BR","BL"]
CORNERS = ["URF","UFL","ULB","UBR","DRF","DFL","DLB","DBR"]
def sticker(N, faces, f):
    cub = (0,0,0)
    for g in faces: cub = add(cub, scale(NORM[FN.index(g)], N-1))
    return geo(N).idx[(cub, NORM[FN.index(f)])]
def piece_table():
    e = {n: [sticker(3, n, ch) for ch in n] for n in EDGES}
    c = {n: [sticker(3, n, ch) for ch in n] for n in CORNERS}
    return e, c
def side_faces(X): return [f for f in range(6) if f != X and f != (X+3) % 6]
def tables07():
    e, c = piece_table()
    faces = {}
    for X in range(6):
        S = side_faces(X)
        cross = [dict(side=FN[A], stickers=[sticker(3, FN[X]+FN[A], FN[X]), sticker(3, FN[X]+FN[A], FN[A])]) for A in S]
        pairs = [(A, B) for A in S for B in S if A < B and (A+3) % 6 != B]
        slots = []
        for k, (A, B) in enumerate(pairs):
            slots.append(dict(slot=k, sides=[FN[A], FN[B]],
                              corner=[sticker(3, FN[X]+FN[A]+FN[B], FN[X]), sticker(3, FN[X]+FN[A]+FN[B], FN[A]), sticker(3, FN[X]+FN[A]+FN[B], FN[B])],
                              edge=[sticker(3, FN[A]+FN[B], FN[A]), sticker(3, FN[A]+FN[B], FN[B])]))
        faces[FN[X]] = dict(face=X, centerIndex=X*9+4, crossEdges=cross, slots=slots)
    return dict(edges=e, corners=c, faces=faces)
T07 = tables07()
def t_cross(st, X):
    ft = T07["faces"][FN[X]]
    for ce in ft["crossEdges"]:
        a = FN.index(ce["side"])
        if st[ce["stickers"][0]] != st[X*9+4] or st[ce["stickers"][1]] != st[a*9+4]: return False
    return True
def t_pair(st, X, k):
    sl = T07["faces"][FN[X]]["slots"][k]
    A, B = FN.index(sl["sides"][0]), FN.index(sl["sides"][1])
    cen = [st[X*9+4], st[A*9+4], st[B*9+4]]
    return (st[sl["corner"][0]], st[sl["corner"][1]], st[sl["corner"][2]]) == tuple(cen) and \
           st[sl["edge"][0]] == cen[1] and st[sl["edge"][1]] == cen[2]
def t_f2l(st, X): return t_cross(st, X) and all(t_pair(st, X, k) for k in range(4))
def is_solved(st, N):
    n2 = N*N
    return all(len(set(st[f*n2:(f+1)*n2])) == 1 for f in range(6))

# --- doi chieu bang tra voi dinh nghia hinh hoc
def g_cross(st, X):
    g = geo(3)
    for A in side_faces(X):
        cub = add(scale(NORM[X], 2), scale(NORM[A], 2))
        if st[g.idx[(cub, NORM[X])]] != st[X*9+4] or st[g.idx[(cub, NORM[A])]] != st[A*9+4]: return False
    return True
def g_pair(st, X, A, B):
    g = geo(3)
    cc = add(add(scale(NORM[X], 2), scale(NORM[A], 2)), scale(NORM[B], 2))
    ec = add(scale(NORM[A], 2), scale(NORM[B], 2))
    return st[g.idx[(cc, NORM[X])]] == st[X*9+4] and st[g.idx[(cc, NORM[A])]] == st[A*9+4] and \
           st[g.idx[(cc, NORM[B])]] == st[B*9+4] and st[g.idx[(ec, NORM[A])]] == st[A*9+4] and st[g.idx[(ec, NORM[B])]] == st[B*9+4]
def g_f2l(st, X):
    S = side_faces(X)
    return g_cross(st, X) and all(g_pair(st, X, A, B) for A in S for B in S if A < B and (A+3) % 6 != B)

# ---------------------------------------------------------------- PRNG (05)
M32 = 0xFFFFFFFF
def imul(a, b): return (a * b) & M32
def xmur3(s):
    h = (1779033703 ^ len(s)) & M32
    for ch in s:
        h = imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) | (h >> 19)) & M32
    def nxt():
        nonlocal h
        h = imul(h ^ (h >> 16), 2246822507)
        h = imul(h ^ (h >> 13), 3266489909)
        h ^= h >> 16
        return h & M32
    return nxt
def mulberry32(a):
    a &= M32
    def nxt():  # tra ve so nguyen 32-bit khong dau (chia 2^32 se ra so thuc)
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & M32
        return (t ^ (t >> 14)) & M32
    return nxt

# ---------------------------------------------------------------- scramble (DRAFT - cho duyet)
LENGTHS = {2: 9, 3: 20, 4: 40, 5: 60, 6: 80, 7: 100, 8: 100, 9: 110, 10: 120}
def gen_scramble(seed, size, k, j=0):
    N = size
    u32 = mulberry32(xmur3(f"{seed}|{size}|{k}|{j}")())
    faces = [0, 1, 2] if N == 2 else [0, 1, 2, 3, 4, 5]
    cands = []
    for f in faces:
        wmax = N // 2 if (N >= 4 and f in (0, 1, 2)) else 1
        for w in range(1, wmax + 1):
            for s in (1, 3, 2):   # thu tu hau to: "", "'", "2"
                cands.append((f, w, s))
    out = []; last = None; seg = 0
    for _ in range(LENGTHS[N]):
        def ok(c):
            if last is None: return True
            if c[0] % 3 != last % 3: return True
            return seg == 1 and last < c[0]
        pool = [c for c in cands if ok(c)]
        f, w, s = pool[(u32() * len(pool)) >> 32]
        if last is not None and f % 3 == last % 3: seg += 1
        else: seg = 1
        last = f
        letter = FN[f]
        body = letter if w == 1 else (letter + "w" if w == 2 else f"{w}{letter}w")
        out.append(body + suffix_str(s))
    return out

def valid_redundancy(moves):
    last = None; seg = 0
    for m in moves:
        f = FN.index(re.sub(r"[^URFDLB]", "", m))
        if last is not None and f % 3 == last % 3:
            if not (seg == 1 and last < f): return False
            seg += 1
        else: seg = 1
        last = f
    return True

# ---------------------------------------------------------------- cross optimal (BFS tren mat D)
_cross = {}
def cross_setup():
    if _cross: return _cross
    X = 3
    tag = []
    for A in side_faces(X):
        tag.append(sticker(3, FN[X]+FN[A], FN[X])); tag.append(sticker(3, FN[X]+FN[A], FN[A]))
    perms = []
    for f in range(6):
        for t in (1, 3, 2):
            tk = parse(FN[f] + suffix_str(t), 3)[0]
            perms.append(token_perm(3, tk))
    start = tuple(tag); dist = {start: 0}; q = collections.deque([start])
    while q:
        s = q.popleft(); d = dist[s]
        for p in perms:
            ns = tuple(p[x] for x in s)
            if ns not in dist: dist[ns] = d + 1; q.append(ns)
    rots = {}
    for seq in ["", "x", "x2", "x'", "z", "z'", "z2"]:
        p = list(range(54))
        for tk in parse(seq, 3): p = compose(p, token_perm(3, tk))
        for Xf in range(6):
            if p[Xf*9+4] == 3*9+4 and Xf not in rots: rots[Xf] = p
    assert len(rots) == 6
    _cross.update(dist=dist, tag=tag, rots=rots)
    return _cross
def cross_dist_per_face(moves):
    c = cross_setup()
    arr = list(range(54))
    for m in moves: arr = apply_state(arr, token_perm(3, parse(m, 3)[0]))
    res = []
    for X in range(6):
        a2 = apply_state(arr, c["rots"][X]); slot_of = [0]*54
        for s, i in enumerate(a2): slot_of[i] = s
        res.append(c["dist"][tuple(slot_of[i] for i in c["tag"])])
    return res
def match_scramble(seed, k, min_cross=5, max_candidates=1000):
    last = None
    for j in range(max_candidates):
        sc = gen_scramble(seed, 3, k, j); st = run(" ".join(sc), 3)
        last = (sc, j)
        if is_solved(st, 3): continue
        if any(t_f2l(st, X) for X in range(6)): continue
        if min(cross_dist_per_face(sc)) < min_cross: continue
        return sc, j
    return last

# ================================================================= TU KIEM
def selftest():
    S3 = solved_state(3)
    # nghich dao cua moi nuoc, moi kich thuoc
    for N in range(2, 11):
        toks = ["R","U","F","D","L","B","R2","x","y","z"]
        if N >= 3: toks += ["Rw", "Fw'", "Uw2"]
        if N >= 4: toks += ["2R", "3Rw", "4R" if N >= 4 else "R"]
        if N >= 5: toks += ["3R"]
        for t in toks:
            inv = {"": "'", "'": "", "2": "2"}
            base = re.match(r"^(\d*[URFDLBxyz]w?)(2|')?$", t); suf = base.group(2) or ""
            tinv = base.group(1) + inv[suf]
            assert run(f"{t} {tinv}", N) == solved_state(N), (N, t)
            assert run(" ".join([t]*4), N) == solved_state(N), (N, t)
    assert run("R U R' U' " * 6, 3) == S3
    assert run("R U " * 105, 3) == S3
    assert run("M", 3) == run("Rw' R", 3)
    assert run("x", 3) == run("R M' L'", 3)
    assert run("Rw", 3) == run("R M'", 3)
    assert run("y", 3) == run("U E' D'", 3)
    assert run("z", 3) == run("F S B'", 3)
    # 6 vi du sticker trong 02 (mau chuan, 3x3)
    def cell(f, r, c): return f*9 + r*3 + c
    assert [run("R",3)[cell(0,r,2)] for r in range(3)] == [2]*3
    assert [run("U",3)[cell(2,0,c)] for c in range(3)] == [1]*3
    assert [run("F",3)[cell(1,r,0)] for r in range(3)] == [0]*3
    assert [run("L",3)[cell(2,r,0)] for r in range(3)] == [0]*3
    assert [run("D",3)[cell(2,2,c)] for c in range(3)] == [4]*3
    assert [run("B",3)[cell(4,r,0)] for r in range(3)] == [0]*3
    # bang tra == dinh nghia hinh hoc
    rnd = random.Random(7)
    samples = [run("", 3)]
    for _ in range(4000):
        L = rnd.choice([1, 1, 2, 3, 4, 8, 20])
        mv = " ".join(rnd.choice(FN) + rnd.choice(["", "'", "2"]) for _ in range(L))
        samples.append(run(mv, 3))
    seen_true = 0
    for st in samples:
        for X in range(6):
            assert t_cross(st, X) == g_cross(st, X)
            assert t_f2l(st, X) == g_f2l(st, X)
            seen_true += t_f2l(st, X)
    assert seen_true > 100
    print("selftest OK; F2L-true samples:", seen_true)

# ================================================================= SINH VECTORS
def vec_parse():
    valid = [
        (3, "R U R' U2"), (3, "  R   U\nF  "), (3, "R2'"), (3, "R\u2019 U\u2018"), (3, "x y' z2"),
        (3, "M E' S2"), (3, "Rw"), (3, "r u'"), (3, "3R"), (4, "2R"), (4, "4R"), (4, "2Rw"), (4, "3Rw2"),
        (4, "r"), (5, "3Rw' 2L"), (2, "R U F2' x"), (10, "5Rw 9B"), (5, "1R"),
    ]
    invalid = [
        (3, "R3"), (3, "RU"), (3, "3r"), (3, "m"), (3, "(R U)"), (3, "R'2"), (3, "Mw"), (3, "xw"), (3, "2x"),
        (3, "3Rw"), (3, "4R"), (3, "K"), (3, "R @"),
        (4, "M"), (4, "5R"), (4, "4Rw"), (4, "E2"),
        (2, "Rw"), (2, "2R"), (2, "M"),
    ]
    res_v = [dict(size=n, input=t, canonical=canon_str(t, n)) for n, t in valid]
    res_i = []
    for n, t in invalid:
        try:
            parse(t, n); raise SystemExit(f"khong loi: {n} {t!r}")
        except ParseError as e:
            res_i.append(dict(size=n, input=t, errorCode=e.code, badToken=e.token))
    return dict(valid=res_v, invalid=res_i)

def vec_apply():
    cases = [(3, m) for m in ["", "R", "R'", "R2", "U", "F", "L", "D", "B", "M", "E", "S", "x", "y", "z", "Rw",
                              "R U R' U'", "R U R' U' R' F R2 U' R' U' R U R' F'"]]
    cases += [(3, "R U R' U' " * 6), (3, "R U " * 105)]
    cases += [(2, "R"), (2, "R U F'"), (2, "x"), (4, "R"), (4, "Rw"), (4, "2R"), (4, "3Rw"), (4, "R Rw'"),
              (5, "3R"), (5, "Rw"), (5, "3Rw'"), (5, "2R 2L'")]
    out = []
    for n, m in cases:
        out.append(dict(size=n, moves=m.strip(), state=state_str(run(m, n)), solved=is_solved(run(m, n), n)))
    return out

def vec_metrics():
    cases = [(3, "R R"), (3, "R R'"), (3, "R2 R"), (3, "R U U' R"), (3, "R x R"), (3, "M"), (3, "M M'"),
             (3, "Rw"), (3, "Rw' R"), (3, "x y z"), (3, "R L R'"), (3, "U D U'"), (3, "3R"),
             (4, "2R"), (4, "4R"), (4, "3Rw"), (4, "Rw 2R"), (4, "2R 2R'"), (5, "3R"), (5, "3Rw2"),
             (3, "R U R' U'"), (3, "R R R R")]
    out = []
    for n, m in cases:
        tk = parse(m, n)
        out.append(dict(size=n, moves=m, pressCount=press_count(tk), solutionLength=solution_length(tk)))
    return out

def vec_stats():
    def it(*xs): return [dict(ms=a, penalty=b) for a, b in xs]
    N = "none"
    cases = [
        ("ao5 co ban", "ao5", [(10000,N),(12000,N),(11000,N),(9000,N),(15000,N)]),
        ("ao5 1 DNF = worst", "ao5", [(10000,N),(12000,N),(0,"DNF"),(9000,N),(11000,N)]),
        ("ao5 2 DNF", "ao5", [(10000,N),(0,"DNF"),(0,"DNF"),(9000,N),(11000,N)]),
        ("ao5 co +2", "ao5", [(10000,"+2"),(12000,N),(11000,N),(9000,N),(15000,N)]),
        ("ao5 +2 doi thu tu best/worst", "ao5", [(8000,"+2"),(9500,N),(9600,N),(9700,N),(20000,"+2")]),
        ("ao5 lam tron len", "ao5", [(10000,N),(10001,N),(10001,N),(10000,N),(20000,N)]),
        ("ao12 lam tron .5 len", "ao12", [(10000,N),(30000,N),(9000,N)] + [(10000,N)]*8 + [(10005,N)]),
        ("ao12 1 DNF", "ao12", [(10000,N)]*10 + [(0,"DNF"),(9000,N)]),
        ("ao12 2 DNF", "ao12", [(10000,N)]*10 + [(0,"DNF"),(0,"DNF")]),
        ("mo3 co ban", "mo3", [(10000,N),(11000,N),(12001,N)]),
        ("mo3 co DNF", "mo3", [(10000,N),(0,"DNF"),(12000,N)]),
        ("mo3 co +2", "mo3", [(10000,"+2"),(11000,N),(12000,N)]),
        ("single", "single", [(10000,N),(9000,"+2"),(8500,"DNF"),(9500,N)]),
        ("single toan DNF", "single", [(10000,"DNF"),(9000,"DNF")]),
        ("hien thi >= 1 phut", "single", [(61234,N)]),
    ]
    out = []
    for name, kind, items in cases:
        its = [(a, b) for a, b in items]
        v = dict(ao5=ao, ao12=ao, mo3=mo3, single=single)[kind](its)
        out.append(dict(name=name, kind=kind, solves=[dict(ms=a, penalty=b) for a, b in its],
                        resultMs=v, display=disp(v) if v is not None else ("-" if kind == "single" else "DNF")))
    out.append(dict(name="khong du so lan", kind="ao5", solves=[dict(ms=10000, penalty="none")]*4, resultMs=None, display="-"))
    return out

def vec_predicates():
    seqs = ["", "R", "R'", "R2", "L", "U", "D", "F", "B", "x", "y", "z2", "M", "R U R' U'", "R U", "F R",
            "R U R' U' R' F R2 U' R' U' R U R' F'", "L' U' L U", "D R D' R'",
            "R y", "R y'", "R y2", "R x", "R z", "R z'", "U x", "U z2"]
    out = []
    for m in seqs:
        st = run(m, 3)
        out.append(dict(moves=m, state=state_str(st), isSolved=is_solved(st, 3),
                        crossSolved=[FN[X] for X in range(6) if t_cross(st, X)],
                        f2lSolved=[FN[X] for X in range(6) if t_f2l(st, X)],
                        f2lSolvedAny=any(t_f2l(st, X) for X in range(6))))
    return out

def score_run(cubes):
    done = [c for c in cubes if c["result"] in ("f2l", "solved")]
    score = len(done)
    last = done[-1]["endT"] if done else 0
    total = sum(press_count(parse(" ".join(e["m"] for e in c["events"]), 3)) for c in done)
    return dict(score=score, lastEndT=last, totalMoves=total)
def compare(a, b):
    ka = (-a["score"], a["lastEndT"] if a["score"] else 0, a["totalMoves"])
    kb = (-b["score"], b["lastEndT"] if b["score"] else 0, b["totalMoves"])
    return "A" if ka < kb else ("B" if kb < ka else "draw")
def vec_score():
    def ev(*xs): return [dict(m=m, t=t) for m, t in xs]
    runs = [
        ("2 khoi f2l + 1 khoi do", [
            dict(index=0, startT=0, endT=900, result="f2l", events=ev(("R",200),("U",500),("F",900))),
            dict(index=1, startT=900, endT=2000, result="f2l", events=ev(("x",950),("R'",1200),("U'",2000))),
            dict(index=2, startT=2000, endT=None, result="abandoned", events=ev(("R",2100)))]),
        ("khong khoi nao", [dict(index=0, startT=0, endT=None, result="abandoned", events=ev(("R",500)))]),
        ("fullSolve co nuoc lat", [
            dict(index=0, startT=0, endT=1500, result="solved", events=ev(("M",300),("R",800),("R",1500)))]),
    ]
    scored = [dict(name=n, cubes=c, expected=score_run(c)) for n, c in runs]
    cmp_cases = []
    A = dict(score=3, lastEndT=40000, totalMoves=60)
    for name, a, b in [
        ("score lon hon thang", A, dict(score=2, lastEndT=30000, totalMoves=10)),
        ("bang score: xong khoi cuoi som hon thang", A, dict(score=3, lastEndT=38000, totalMoves=90)),
        ("bang score va lastEndT: it nuoc hon thang", A, dict(score=3, lastEndT=40000, totalMoves=55)),
        ("bang het: hoa", A, dict(A)),
        ("ca hai 0 diem: hoa", dict(score=0, lastEndT=0, totalMoves=0), dict(score=0, lastEndT=0, totalMoves=0)),
    ]:
        cmp_cases.append(dict(name=name, a=a, b=b, winner=compare(a, b)))
    return dict(scoreRun=scored, compare=cmp_cases)

def js_check_prng(cases):
    node = shutil.which("node")
    if not node: return None
    js = r"""
function xmur3(str){for(var i=0,h=1779033703^str.length;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0;}}
function mulberry32(a){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}
const cases=JSON.parse(process.argv[1]);const out=[];
for(const s of cases){const h=xmur3(s)();const r=mulberry32(h);out.push({hash:h,floats:[r(),r(),r()]});}
console.log(JSON.stringify(out));"""
    res = subprocess.run([node, "-e", js, json.dumps(cases)], capture_output=True, text=True)
    return json.loads(res.stdout) if res.returncode == 0 else None

def vec_prng():
    strs = ["abc", "", "a1b2c3d4|3|0|0", "seed-uuid-0001|3|5|2", "Tieng Viet"]
    js = js_check_prng(strs)
    out = []
    for i, s in enumerate(strs):
        h = xmur3(s)(); r = mulberry32(h)
        u = [r(), r(), r()]
        entry = dict(input=s, hash32=h, u32=u, float=[x / 4294967296 for x in u])
        if js is not None:
            assert js[i]["hash"] == h and js[i]["floats"] == entry["float"], (s, js[i], entry)
        out.append(entry)
    return out, js is not None

def vec_scramble_draft():
    out = []
    for seed in ["a1b2c3d4", "550e8400-e29b-41d4-a716-446655440000"]:
        for size in (2, 3, 4, 5, 7, 10):
            for k in (0, 1):
                sc = gen_scramble(seed, size, k)
                assert len(sc) == LENGTHS[size] and valid_redundancy(sc)
                parse(" ".join(sc), size)   # hop le theo parser
                st = run(" ".join(sc), size)
                assert not is_solved(st, size)
                entry = dict(seed=seed, size=size, k=k, genVersion=1, scramble=sc)
                if size == 3: assert not any(t_f2l(st, X) for X in range(6))
                out.append(entry)
    return out

def vec_match_draft():
    out = []
    for seed in ["a1b2c3d4", "550e8400-e29b-41d4-a716-446655440000"]:
        for k in range(4):
            sc, j = match_scramble(seed, k)
            d = cross_dist_per_face(sc)
            out.append(dict(seed=seed, size=3, k=k, genVersion=1, filter=dict(minCrossOptimal=5, maxCrossOptimal=None, maxCandidates=1000),
                            candidateIndex=j, crossOptimalPerFace=dict(zip(FN, d)), crossOptimalMin=min(d), scramble=sc))
    return out

def main():
    selftest()
    prng, js_ok = vec_prng()
    vectors = dict(
        meta=dict(
            generatedBy="tools/reference/ref.py (mo hinh tham chieu)",
            conventions="docs/spec/01-coordinates.md .. 09; state = chuoi chu so 0-5 theo chi so face*N*N + r*N + c, thu tu mat U R F D L B; mau 0=U trang 1=R do 2=F luc 3=D vang 4=L cam 5=B lam",
            prngCrossCheckedWithNode=js_ok,
            status=dict(parse="theo 02 ban moi", apply="da kiem tra bang cac dong nhat thuc (selftest)",
                        metrics="theo 03 ban moi", stats="theo 04 ban moi (single toan DNF hien thi - ; ao/mo3 DNF hien thi DNF)",
                        predicates="theo 07; bang tra == dinh nghia hinh hoc",
                        score="theo 08", prng="khop voi JS (Node) neu prngCrossCheckedWithNode = true",
                        scramble="DA DUYET (genVersion 1): thu tuc chon nuoc theo docs/spec/05 muc 3.1 (gen_scramble trong ref.py)",
                        matchScramble_draft="HOAN toi Giai doan 7 (can bo giai cross); KHONG dung trong E1-E10. Cross toi uu = min tren 6 mat")),
        parse=vec_parse(), apply=vec_apply(), metrics=vec_metrics(), stats=vec_stats(),
        predicates=vec_predicates(), score=vec_score(), prng=prng,
        scramble=vec_scramble_draft(), matchScramble_draft=vec_match_draft())
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    with open(os.path.join(outdir, "vectors.json"), "w", encoding="utf-8") as f:
        json.dump(vectors, f, ensure_ascii=False, indent=1)
    tables = dict(note="Bang chi so sticker 3x3 cho 07-predicates. Chi so toan cuc = face*9 + r*3 + c, theo 01-coordinates. Thu tu sticker trong moi cubie theo thu tu chu cai cua ten.",
                  faceOrder="URFDLB", edges=T07["edges"], corners=T07["corners"], faces=T07["faces"])
    with open(os.path.join(outdir, "07-tables.json"), "w", encoding="utf-8") as f:
        json.dump(tables, f, ensure_ascii=False, indent=1)
    print("OK; node cross-check:", js_ok)

if __name__ == "__main__":
    main()
