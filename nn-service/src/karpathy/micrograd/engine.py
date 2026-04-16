"""Scalar-valued autograd engine — port of Karpathy's micrograd.

A tiny engine that implements reverse-mode autodiff over scalar values.
This is the educational foundation of the Karpathy Loop suite: every
operation builds a computation graph, and backward() walks it in reverse
to accumulate gradients.

Pure Python, zero dependencies.
"""
from __future__ import annotations

import math


class Value:
    """Wraps a scalar and tracks the computation graph for autograd."""

    __slots__ = ("data", "grad", "_backward", "_prev", "_op", "label")

    def __init__(
        self,
        data: float,
        _children: tuple[Value, ...] = (),
        _op: str = "",
        label: str = "",
    ) -> None:
        self.data = float(data)
        self.grad = 0.0
        self._backward = lambda: None
        self._prev = set(_children)
        self._op = _op
        self.label = label

    def __repr__(self) -> str:
        return f"Value(data={self.data:.4f}, grad={self.grad:.4f})"

    # ------------------------------------------------------------------
    # Arithmetic ops — each builds the local backward closure
    # ------------------------------------------------------------------

    def __add__(self, other: Value | float) -> Value:
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), "+")

        def _backward() -> None:
            self.grad += out.grad
            other.grad += out.grad

        out._backward = _backward
        return out

    def __mul__(self, other: Value | float) -> Value:
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), "*")

        def _backward() -> None:
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad

        out._backward = _backward
        return out

    def __pow__(self, other: int | float) -> Value:
        assert isinstance(other, (int, float)), "only int/float powers supported"
        out = Value(self.data ** other, (self,), f"**{other}")

        def _backward() -> None:
            self.grad += (other * self.data ** (other - 1)) * out.grad

        out._backward = _backward
        return out

    def __neg__(self) -> Value:
        return self * -1

    def __sub__(self, other: Value | float) -> Value:
        return self + (-other)

    def __truediv__(self, other: Value | float) -> Value:
        return self * (other ** -1 if isinstance(other, (int, float)) else other ** -1)

    def __radd__(self, other: float) -> Value:
        return self + other

    def __rmul__(self, other: float) -> Value:
        return self * other

    def __rsub__(self, other: float) -> Value:
        return Value(other) + (-self)

    def __rtruediv__(self, other: float) -> Value:
        return Value(other) * (self ** -1)

    # ------------------------------------------------------------------
    # Activation functions
    # ------------------------------------------------------------------

    def exp(self) -> Value:
        x = self.data
        t = math.exp(x)
        out = Value(t, (self,), "exp")

        def _backward() -> None:
            self.grad += t * out.grad

        out._backward = _backward
        return out

    def log(self) -> Value:
        assert self.data > 0, "log of non-positive value"
        out = Value(math.log(self.data), (self,), "log")

        def _backward() -> None:
            self.grad += (1.0 / self.data) * out.grad

        out._backward = _backward
        return out

    def tanh(self) -> Value:
        t = math.tanh(self.data)
        out = Value(t, (self,), "tanh")

        def _backward() -> None:
            self.grad += (1 - t * t) * out.grad

        out._backward = _backward
        return out

    def relu(self) -> Value:
        out = Value(max(0.0, self.data), (self,), "ReLU")

        def _backward() -> None:
            self.grad += (1.0 if out.data > 0 else 0.0) * out.grad

        out._backward = _backward
        return out

    # ------------------------------------------------------------------
    # Backward pass — topological sort then reverse accumulation
    # ------------------------------------------------------------------

    def backward(self) -> None:
        topo: list[Value] = []
        visited: set[int] = set()

        def _build(v: Value) -> None:
            vid = id(v)
            if vid not in visited:
                visited.add(vid)
                for child in v._prev:
                    _build(child)
                topo.append(v)

        _build(self)

        self.grad = 1.0
        for v in reversed(topo):
            v._backward()
