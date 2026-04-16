"""
run_loop.py — ZWM Autoresearch Agent Loop
==========================================
Adapts Karpathy's autoresearch pattern for causal graph threshold optimization.

The loop:
  1. Read program.md + current train.py
  2. Call Claude claude-sonnet-4-6 to propose one change (DESCRIPTION + full CODE)
  3. Write proposed train.py, run it, parse val_metric
  4. If metric improved → git commit (kept)
  5. If metric regressed → git checkout train.py (reverted)
  6. Log to results/experiment_log.json
  7. Repeat --iterations times

Usage:
  python run_loop.py [--iterations N]   (default: 15)
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic package not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

# ── config ────────────────────────────────────────────────────────────────────

HERE = Path(__file__).parent
TRAIN_PY = HERE / 'train.py'
PROGRAM_MD = HERE / 'program.md'
RESULTS_DIR = HERE / 'results'
LOG_FILE = RESULTS_DIR / 'experiment_log.json'

MODEL = 'claude-sonnet-4-6'
EXPERIMENT_TIMEOUT = 120   # seconds to wait for train.py to complete


# ── helpers ───────────────────────────────────────────────────────────────────

def read_file(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def write_file(path: Path, content: str) -> None:
    path.write_text(content, encoding='utf-8')


def run_train() -> dict:
    """Execute train.py and return parsed outputs."""
    result = subprocess.run(
        [sys.executable, str(TRAIN_PY)],
        capture_output=True,
        text=True,
        timeout=EXPERIMENT_TIMEOUT,
        cwd=str(HERE),
    )
    output = result.stdout + result.stderr

    metric = None
    f1 = None
    precision = None
    recall = None

    for line in output.splitlines():
        line = line.strip()
        if line.startswith('val_metric:'):
            try:
                metric = float(line.split(':')[1].strip())
            except ValueError:
                pass
        elif line.startswith('val_f1:'):
            try:
                f1 = float(line.split(':')[1].strip())
            except ValueError:
                pass
        elif line.startswith('val_precision:'):
            try:
                precision = float(line.split(':')[1].strip())
            except ValueError:
                pass
        elif line.startswith('val_recall:'):
            try:
                recall = float(line.split(':')[1].strip())
            except ValueError:
                pass

    return {
        'metric': metric,
        'f1': f1,
        'precision': precision,
        'recall': recall,
        'stdout': result.stdout,
        'stderr': result.stderr,
        'returncode': result.returncode,
    }


def git_cmd(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ['git', *args],
        capture_output=True,
        text=True,
        cwd=str(HERE),
    )


def propose_change(client: anthropic.Anthropic, program_md: str, train_py: str,
                   history: list, baseline_metric: float) -> str:
    """Ask the model to propose one change to train.py."""
    history_lines = []
    for h in history[-8:]:   # last 8 experiments for context
        status_icon = '✓' if h['status'] == 'kept' else '✗'
        metric_str = f"{h['metric']:.4f}" if h['metric'] is not None else 'N/A'
        f1_str = f"{h.get('f1') or 0:.4f}"
        history_lines.append(
            f"  {status_icon} iter {h['iteration']:02d}: metric={metric_str} "
            f"(F1={f1_str})  [{h['status']}]  — {h['description']}"
        )
    history_str = '\n'.join(history_lines) if history_lines else '  (no experiments yet)'

    prompt = f"""You are optimizing the ZWM (Zuup World Model) causal rule engine.

=== RESEARCH PROGRAM ===
{program_md}

=== EXPERIMENT HISTORY ===
Baseline metric: {baseline_metric:.4f} (F1={-baseline_metric:.4f})
{history_str}

=== CURRENT train.py ===
```python
{train_py}
```

=== TASK ===
Propose ONE specific change to train.py that will improve val_metric (make it more negative).

Rules:
- Propose exactly one logical change per response
- Return the COMPLETE modified train.py (not just the diff)
- The file must still be runnable as-is
- Keep all imports and the main() entry point intact
- Do not modify prepare.py imports or the call to evaluate_model()

Respond in EXACTLY this format (no extra text before DESCRIPTION):

DESCRIPTION: <one concise sentence describing the change>
CODE:
```python
<complete contents of train.py>
```"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        messages=[{'role': 'user', 'content': prompt}],
    )
    return response.content[0].text


def parse_proposal(response_text: str) -> tuple[str, str] | tuple[None, None]:
    """Extract (description, code) from the model's response."""
    # Description
    desc_match = re.search(r'^DESCRIPTION:\s*(.+)$', response_text, re.MULTILINE)
    if not desc_match:
        return None, None
    description = desc_match.group(1).strip()

    # Code block
    code_match = re.search(r'```python\n(.*?)```', response_text, re.DOTALL)
    if not code_match:
        return None, None
    code = code_match.group(1)

    return description, code


def print_separator(char: str = '─', width: int = 70) -> None:
    print(char * width)


# ── main loop ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='ZWM Autoresearch Loop')
    parser.add_argument('--iterations', type=int, default=15,
                        help='Number of experiments to run (default: 15)')
    args = parser.parse_args()

    RESULTS_DIR.mkdir(exist_ok=True)

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.")
        print("  Export it before running: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key)

    print_separator('═')
    print('  ZWM Autoresearch — Causal Rule Threshold Optimizer')
    print(f'  Model: {MODEL}  |  Iterations: {args.iterations}')
    print(f'  Started: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print_separator('═')

    # ── baseline ──────────────────────────────────────────────────────────────
    print('\nRunning baseline...')
    baseline_result = run_train()

    if baseline_result['metric'] is None:
        print('ERROR: Could not parse val_metric from baseline run.')
        print('STDOUT:', baseline_result['stdout'])
        print('STDERR:', baseline_result['stderr'])
        sys.exit(1)

    baseline_metric = baseline_result['metric']
    best_metric = baseline_metric
    print(f'Baseline  val_metric={baseline_metric:.4f}  F1={-baseline_metric:.4f}')

    history = []
    kept_count = 0
    reverted_count = 0

    # ── experiment loop ────────────────────────────────────────────────────────
    for iteration in range(1, args.iterations + 1):
        print_separator()
        print(f'  Iteration {iteration}/{args.iterations}   best so far: {best_metric:.4f} (F1={-best_metric:.4f})')
        print_separator()

        program_md = read_file(PROGRAM_MD)
        train_py_current = read_file(TRAIN_PY)

        # Ask model to propose a change
        print('  Requesting proposal from model...')
        try:
            response_text = propose_change(
                client, program_md, train_py_current, history, baseline_metric
            )
        except Exception as e:
            print(f'  ERROR calling API: {e}')
            history.append({
                'iteration': iteration,
                'metric': None,
                'f1': None,
                'description': f'API error: {e}',
                'status': 'error',
                'timestamp': datetime.now().isoformat(),
            })
            continue

        description, code = parse_proposal(response_text)
        if description is None or code is None:
            print('  ERROR: Could not parse DESCRIPTION/CODE from response.')
            print('  Raw response:', response_text[:500])
            history.append({
                'iteration': iteration,
                'metric': None,
                'f1': None,
                'description': 'parse error',
                'status': 'error',
                'timestamp': datetime.now().isoformat(),
            })
            continue

        print(f'  Proposed: {description}')

        # Write proposed train.py
        original_code = train_py_current
        write_file(TRAIN_PY, code)

        # Run experiment
        print('  Running experiment...')
        try:
            result = run_train()
        except subprocess.TimeoutExpired:
            print(f'  ERROR: train.py timed out after {EXPERIMENT_TIMEOUT}s')
            write_file(TRAIN_PY, original_code)
            history.append({
                'iteration': iteration,
                'metric': None,
                'f1': None,
                'description': description,
                'status': 'timeout',
                'timestamp': datetime.now().isoformat(),
            })
            continue

        if result['metric'] is None:
            print('  ERROR: Could not parse val_metric from output')
            print('  STDOUT:', result['stdout'][:300])
            if result['stderr']:
                print('  STDERR:', result['stderr'][:300])
            write_file(TRAIN_PY, original_code)
            history.append({
                'iteration': iteration,
                'metric': None,
                'f1': None,
                'description': description,
                'status': 'parse_error',
                'timestamp': datetime.now().isoformat(),
            })
            continue

        new_metric = result['metric']
        delta = new_metric - best_metric

        print(f'  Result:   val_metric={new_metric:.4f}  F1={-new_metric:.4f}  '
              f'(Δ {delta:+.4f} vs best)')

        if new_metric < best_metric:
            # Keep the change
            best_metric = new_metric
            git_cmd('add', 'train.py')
            commit_msg = (
                f'[autoresearch iter {iteration:02d}] {description} '
                f'(metric: {new_metric:.4f}, F1: {-new_metric:.4f})'
            )
            git_cmd('commit', '-m', commit_msg)
            print(f'  ✓ KEPT  (new best!)')
            status = 'kept'
            kept_count += 1
        else:
            # Revert
            git_cmd('checkout', 'train.py')
            print(f'  ✗ REVERTED')
            status = 'reverted'
            reverted_count += 1

        history.append({
            'iteration': iteration,
            'metric': new_metric,
            'f1': result['f1'],
            'precision': result['precision'],
            'recall': result['recall'],
            'description': description,
            'status': status,
            'delta': delta,
            'timestamp': datetime.now().isoformat(),
        })

        # Persist log after each iteration
        LOG_FILE.write_text(json.dumps({
            'baseline_metric': baseline_metric,
            'baseline_f1': -baseline_metric,
            'best_metric': best_metric,
            'best_f1': -best_metric,
            'experiments': history,
        }, indent=2), encoding='utf-8')

    # ── summary ───────────────────────────────────────────────────────────────
    print_separator('═')
    print('  AUTORESEARCH COMPLETE')
    print_separator('═')
    print(f'  Iterations:     {args.iterations}')
    print(f'  Kept:           {kept_count}')
    print(f'  Reverted:       {reverted_count}')
    print(f'  Baseline F1:    {-baseline_metric:.4f}  (metric: {baseline_metric:.4f})')
    print(f'  Best F1:        {-best_metric:.4f}  (metric: {best_metric:.4f})')
    improvement = (-best_metric) - (-baseline_metric)
    print(f'  F1 improvement: {improvement:+.4f}')
    print_separator()
    print('  Kept experiments:')
    for h in history:
        if h['status'] == 'kept':
            print(f"    iter {h['iteration']:02d}: F1={h.get('f1', 0):.4f}  — {h['description']}")
    print_separator('═')
    print(f'  Full log: {LOG_FILE}')
    print_separator('═')


if __name__ == '__main__':
    main()
