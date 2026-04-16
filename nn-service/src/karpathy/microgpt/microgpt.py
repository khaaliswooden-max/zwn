#!/usr/bin/env python3
"""microgpt — A self-contained GPT in pure Python. Zero dependencies.

Inspired by Karpathy's microgpt (Feb 2026): the *full* algorithmic content
of training and inferencing a GPT-2-style transformer, in a single file
with no imports beyond the standard library.

This file demonstrates the Karpathy Loop on ZWM event sequences:
  forward → cross_entropy → numerical_gradient → weight_update

Run standalone:  python microgpt.py
"""
import math
import random

# -------------------------------------------------------------------------
# Section 1: Pure-Python matrix operations
# -------------------------------------------------------------------------

def zeros(rows, cols):
    return [[0.0] * cols for _ in range(rows)]

def randn(rows, cols, scale=0.02):
    return [[random.gauss(0, scale) for _ in range(cols)] for _ in range(rows)]

def randn_vec(n, scale=0.02):
    return [random.gauss(0, scale) for _ in range(n)]

def matmul(A, B):
    rA, cA = len(A), len(A[0])
    cB = len(B[0])
    C = zeros(rA, cB)
    for i in range(rA):
        for k in range(cA):
            a_ik = A[i][k]
            for j in range(cB):
                C[i][j] += a_ik * B[k][j]
    return C

def add_vec(a, b):
    return [ai + bi for ai, bi in zip(a, b)]

def scale_vec(a, s):
    return [ai * s for ai in a]

def transpose(A):
    rows, cols = len(A), len(A[0])
    return [[A[i][j] for i in range(rows)] for j in range(cols)]

# -------------------------------------------------------------------------
# Section 2: Activation functions
# -------------------------------------------------------------------------

def softmax(x):
    m = max(x)
    e = [math.exp(xi - m) for xi in x]
    s = sum(e)
    return [ei / s for ei in e]

def gelu(x):
    return 0.5 * x * (1.0 + math.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * x * x * x)))

def layer_norm(x, g, b, eps=1e-5):
    mu = sum(x) / len(x)
    var = sum((xi - mu) ** 2 for xi in x) / len(x)
    inv = 1.0 / math.sqrt(var + eps)
    return [g[i] * (x[i] - mu) * inv + b[i] for i in range(len(x))]

# -------------------------------------------------------------------------
# Section 3: Attention
# -------------------------------------------------------------------------

def attention(Q, K, V, n_head, d_head):
    """Multi-head causal self-attention. Q/K/V are (T, n_embd) as lists."""
    T = len(Q)
    n_embd = len(Q[0])
    out = [None] * T
    for h in range(n_head):
        lo, hi = h * d_head, (h + 1) * d_head
        for i in range(T):
            scores = []
            for j in range(i + 1):  # causal: attend only to past + self
                s = sum(Q[i][lo + k] * K[j][lo + k] for k in range(d_head))
                scores.append(s / math.sqrt(d_head))
            probs = softmax(scores)
            head_out = [0.0] * d_head
            for j, p in enumerate(probs):
                for k in range(d_head):
                    head_out[k] += p * V[j][lo + k]
            if out[i] is None:
                out[i] = [0.0] * n_embd
            for k in range(d_head):
                out[i][lo + k] = head_out[k]
    return out

# -------------------------------------------------------------------------
# Section 4: Transformer block and GPT forward pass
# -------------------------------------------------------------------------

def ffn(x, W1, b1, W2, b2):
    h = add_vec([sum(x[k] * W1[k][j] for k in range(len(x))) for j in range(len(W1[0]))], b1)
    h = [gelu(hi) for hi in h]
    o = add_vec([sum(h[k] * W2[k][j] for k in range(len(h))) for j in range(len(W2[0]))], b2)
    return o

def transformer_block(x_seq, Wqkv, bqkv, Wout, bout, W1, b1, W2, b2, ln1g, ln1b, ln2g, ln2b, n_head, d_head):
    T = len(x_seq)
    n_embd = len(x_seq[0])
    # Pre-norm + attention
    normed = [layer_norm(x_seq[t], ln1g, ln1b) for t in range(T)]
    # Compute Q, K, V: project each position
    QKV = [[sum(normed[t][k] * Wqkv[k][j] for k in range(n_embd)) + bqkv[j] for j in range(3 * n_embd)] for t in range(T)]
    Q = [[QKV[t][j] for j in range(n_embd)] for t in range(T)]
    K = [[QKV[t][n_embd + j] for j in range(n_embd)] for t in range(T)]
    V = [[QKV[t][2 * n_embd + j] for j in range(n_embd)] for t in range(T)]
    attn_out = attention(Q, K, V, n_head, d_head)
    # Output projection + residual
    proj = [add_vec([sum(attn_out[t][k] * Wout[k][j] for k in range(n_embd)) for j in range(n_embd)], bout) for t in range(T)]
    x_seq = [add_vec(x_seq[t], proj[t]) for t in range(T)]
    # Pre-norm + FFN + residual
    normed2 = [layer_norm(x_seq[t], ln2g, ln2b) for t in range(T)]
    ff_out = [ffn(normed2[t], W1, b1, W2, b2) for t in range(T)]
    x_seq = [add_vec(x_seq[t], ff_out[t]) for t in range(T)]
    return x_seq

def gpt_forward(token_ids, params):
    """Full GPT forward pass. Returns logits for each position."""
    T = len(token_ids)
    n_embd = params["n_embd"]
    n_head = params["n_head"]
    d_head = n_embd // n_head
    # Token + positional embeddings
    x_seq = [add_vec(params["wte"][token_ids[t]], params["wpe"][t]) for t in range(T)]
    # Transformer blocks
    for blk in params["blocks"]:
        x_seq = transformer_block(
            x_seq, blk["Wqkv"], blk["bqkv"], blk["Wout"], blk["bout"],
            blk["W1"], blk["b1"], blk["W2"], blk["b2"],
            blk["ln1g"], blk["ln1b"], blk["ln2g"], blk["ln2b"],
            n_head, d_head,
        )
    # Final layer norm
    x_seq = [layer_norm(x_seq[t], params["ln_f_g"], params["ln_f_b"]) for t in range(T)]
    # LM head (tied with wte)
    wte_T = transpose(params["wte"])
    logits = [[sum(x_seq[t][k] * wte_T[k][j] for k in range(n_embd)) for j in range(params["vocab_size"])] for t in range(T)]
    return logits

# -------------------------------------------------------------------------
# Section 5: Loss
# -------------------------------------------------------------------------

def cross_entropy(logits, target_id):
    probs = softmax(logits)
    return -math.log(max(probs[target_id], 1e-10))

def sequence_loss(token_ids, params):
    logits = gpt_forward(token_ids[:-1], params)
    total = 0.0
    for t in range(len(logits)):
        total += cross_entropy(logits[t], token_ids[t + 1])
    return total / len(logits)

# -------------------------------------------------------------------------
# Section 6: The Karpathy Loop — training with numerical gradients
# -------------------------------------------------------------------------

def _flatten(params):
    """Extract all trainable floats from param dict (wte, wpe, blocks)."""
    vals = []
    for row in params["wte"]:
        vals.extend(row)
    for row in params["wpe"]:
        vals.extend(row)
    for blk in params["blocks"]:
        for key in ("Wqkv", "Wout", "W1", "W2"):
            for row in blk[key]:
                vals.extend(row)
        for key in ("bqkv", "bout", "b1", "b2", "ln1g", "ln1b", "ln2g", "ln2b"):
            vals.extend(blk[key])
    vals.extend(params["ln_f_g"])
    vals.extend(params["ln_f_b"])
    return vals

def _unflatten(flat, template):
    """Write flat values back into param dict structure."""
    idx = 0
    for row in template["wte"]:
        for j in range(len(row)):
            row[j] = flat[idx]; idx += 1
    for row in template["wpe"]:
        for j in range(len(row)):
            row[j] = flat[idx]; idx += 1
    for blk in template["blocks"]:
        for key in ("Wqkv", "Wout", "W1", "W2"):
            for row in blk[key]:
                for j in range(len(row)):
                    row[j] = flat[idx]; idx += 1
        for key in ("bqkv", "bout", "b1", "b2", "ln1g", "ln1b", "ln2g", "ln2b"):
            vec = blk[key]
            for j in range(len(vec)):
                vec[j] = flat[idx]; idx += 1
    for j in range(len(template["ln_f_g"])):
        template["ln_f_g"][j] = flat[idx]; idx += 1
    for j in range(len(template["ln_f_b"])):
        template["ln_f_b"][j] = flat[idx]; idx += 1

def sgd_step(token_ids, params, lr=0.01, eps=1e-4):
    """One SGD step using finite-difference gradients. Slow but correct."""
    flat = _flatten(params)
    base_loss = sequence_loss(token_ids, params)
    grads = [0.0] * len(flat)
    # Sample a random subset of parameters to perturb (stochastic for speed)
    n_sample = min(len(flat), 200)
    indices = random.sample(range(len(flat)), n_sample)
    for i in indices:
        old = flat[i]
        flat[i] = old + eps
        _unflatten(flat, params)
        loss_plus = sequence_loss(token_ids, params)
        flat[i] = old
        _unflatten(flat, params)
        grads[i] = (loss_plus - base_loss) / eps
    # Update
    for i in indices:
        flat[i] -= lr * grads[i]
    _unflatten(flat, params)
    return base_loss

# -------------------------------------------------------------------------
# Section 7: Demo — train tiny GPT on ZWM event sequence
# -------------------------------------------------------------------------

# ZWM event vocabulary (12 types + 3 special)
ZWM_EVENTS = [
    "<PAD>", "<BOS>", "<EOS>",
    "COMPLIANCE", "PROCUREMENT", "RECONSTRUCTION", "BIO_ANOMALY",
    "MIGRATION", "COMPUTE", "SETTLEMENT", "FITIQ_THRESH",
    "TREATY", "SCALE_METRIC", "OBJECTIVE", "REASONING",
]

def init_params(vocab_size, n_embd, n_head, n_layer, block_size):
    inner = 4 * n_embd
    params = {
        "vocab_size": vocab_size,
        "n_embd": n_embd,
        "n_head": n_head,
        "wte": randn(vocab_size, n_embd),
        "wpe": randn(block_size, n_embd),
        "blocks": [],
        "ln_f_g": [1.0] * n_embd,
        "ln_f_b": [0.0] * n_embd,
    }
    for _ in range(n_layer):
        params["blocks"].append({
            "Wqkv": randn(n_embd, 3 * n_embd),
            "bqkv": [0.0] * (3 * n_embd),
            "Wout": randn(n_embd, n_embd),
            "bout": [0.0] * n_embd,
            "W1": randn(n_embd, inner),
            "b1": [0.0] * inner,
            "W2": randn(inner, n_embd),
            "b2": [0.0] * n_embd,
            "ln1g": [1.0] * n_embd,
            "ln1b": [0.0] * n_embd,
            "ln2g": [1.0] * n_embd,
            "ln2b": [0.0] * n_embd,
        })
    return params

def demo():
    random.seed(42)
    print("=" * 60)
    print("microgpt — Zero-dependency GPT on ZWM event sequences")
    print("=" * 60)

    vocab_size = len(ZWM_EVENTS)
    n_embd = 8
    n_head = 2
    n_layer = 1
    block_size = 12

    params = init_params(vocab_size, n_embd, n_head, n_layer, block_size)
    n_params = len(_flatten(params))
    print(f"Model: {n_layer} layer, {n_embd} dim, {n_head} heads, {n_params} params")
    print()

    # Training sequence: a plausible ZWM causal chain
    # COMPLIANCE → PROCUREMENT → SETTLEMENT → FITIQ → PROCUREMENT → SETTLEMENT
    train_seq = [1, 3, 4, 9, 10, 4, 9, 3, 4, 9]  # BOS + events

    print("Training sequence:", " → ".join(ZWM_EVENTS[t] for t in train_seq))
    print()

    # The Karpathy Loop
    print("Training (100 steps, stochastic finite-difference gradients):")
    for step in range(100):
        loss = sgd_step(train_seq, params, lr=0.05)
        if (step + 1) % 10 == 0:
            bar = "#" * int(max(0, 40 - loss * 10))
            print(f"  step {step+1:3d}  loss={loss:.4f}  {bar}")

    # Test: score a normal vs anomalous continuation
    print()
    normal_seq = [1, 3, 4, 9, 10, 4]  # expected pattern
    anomaly_seq = [1, 3, 4, 6, 11, 14]  # BIO_ANOMALY after PROCUREMENT = unusual

    normal_loss = sequence_loss(normal_seq, params)
    anomaly_loss = sequence_loss(anomaly_seq, params)

    print(f"Normal  sequence loss: {normal_loss:.4f}  ({' → '.join(ZWM_EVENTS[t] for t in normal_seq)})")
    print(f"Anomaly sequence loss: {anomaly_loss:.4f}  ({' → '.join(ZWM_EVENTS[t] for t in anomaly_seq)})")
    print()
    if anomaly_loss > normal_loss:
        print("Anomaly detected: unusual sequence has higher prediction loss.")
    else:
        print("Note: more training steps needed for clearer separation.")

    print()
    print("This is the Karpathy Loop: forward → loss → gradient → update.")
    print("The same loop powers makemore, nanoGPT, and the full ZWM detector.")

if __name__ == "__main__":
    demo()
