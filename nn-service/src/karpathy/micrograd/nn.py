"""Neural network primitives built on the micrograd Value engine.

Port of Karpathy's micrograd/nn.py — Neuron, Layer, MLP using only
scalar Value operations. Educational reference; production models
use PyTorch (see makemore/ and nanogpt/).
"""
from __future__ import annotations

import random

from src.karpathy.micrograd.engine import Value


class Neuron:
    """Single neuron: weighted sum + optional non-linearity."""

    def __init__(self, nin: int, nonlin: bool = True) -> None:
        self.w = [Value(random.uniform(-1, 1), label=f"w{i}") for i in range(nin)]
        self.b = Value(0.0, label="b")
        self.nonlin = nonlin

    def __call__(self, x: list[Value]) -> Value:
        act = sum((wi * xi for wi, xi in zip(self.w, x)), self.b)
        return act.tanh() if self.nonlin else act

    def parameters(self) -> list[Value]:
        return self.w + [self.b]

    def __repr__(self) -> str:
        kind = "Tanh" if self.nonlin else "Linear"
        return f"{kind}Neuron({len(self.w)})"


class Layer:
    """A layer of neurons."""

    def __init__(self, nin: int, nout: int, **kwargs: bool) -> None:
        self.neurons = [Neuron(nin, **kwargs) for _ in range(nout)]

    def __call__(self, x: list[Value]) -> list[Value] | Value:
        out = [n(x) for n in self.neurons]
        return out[0] if len(out) == 1 else out

    def parameters(self) -> list[Value]:
        return [p for n in self.neurons for p in n.parameters()]

    def __repr__(self) -> str:
        return f"Layer([{', '.join(str(n) for n in self.neurons)}])"


class MLP:
    """Multi-layer perceptron — stack of layers with tanh activations."""

    def __init__(self, nin: int, nouts: list[int]) -> None:
        sz = [nin] + nouts
        self.layers = [
            Layer(sz[i], sz[i + 1], nonlin=(i != len(nouts) - 1))
            for i in range(len(nouts))
        ]

    def __call__(self, x: list[Value] | list[float]) -> Value | list[Value]:
        xv = [v if isinstance(v, Value) else Value(v) for v in x]
        for layer in self.layers:
            xv = layer(xv) if isinstance(layer(xv), list) else [layer(xv)]
        return xv[0] if len(xv) == 1 else xv

    def parameters(self) -> list[Value]:
        return [p for layer in self.layers for p in layer.parameters()]

    def zero_grad(self) -> None:
        for p in self.parameters():
            p.grad = 0.0

    def __repr__(self) -> str:
        return f"MLP([{', '.join(str(l) for l in self.layers)}])"
