# Zuup World Model Adds Karpathy Loop Sequence Intelligence — Four Neural Architectures Learn the Behavioral Grammar of Institutional Events

## A nanoGPT-based sequence anomaly detector, trained directly on Neo4j SubstrateEvent histories, enables ZWM to recognize when institutional event patterns deviate from learned norms — moving from state monitoring to behavioral prediction.

**FOR IMMEDIATE RELEASE**

**HUNTSVILLE, AL -- April 16, 2026** -- Zuup Innovation Lab today announced the integration of a Karpathy Loop sequence intelligence system into the Zuup World Model (ZWM). The new module, housed within the existing `nn-service` microservice, trains four neural network architectures -- Bigram, MLP, WaveNet, and nanoGPT -- on sequences of ZWM SubstrateEvents extracted from Neo4j, enabling the system to learn the behavioral grammar of institutional event flows and score deviations from that grammar as anomalies.

Where the previously deployed VAE anomaly detector scores the state of individual biological readings at a single point in time, the Karpathy Loop operates across time -- measuring whether an event makes sense given everything that preceded it. This is the distinction between knowing that a value is unusual and knowing that a sequence of events is uncharacteristic.

### Why This Matters

The ZWM causal graph processes eight classes of SubstrateEvent: ComplianceStateChange, ProcurementStateChange, BiologicalReading, ReconstructionComplete, MigrationComplete, ComputeStateUpdate, ReasoningComplete, and SettlementEvent. Each event arrives embedded in a causal chain -- a compliance violation triggers procurement recalculation, which may flag a settlement, which may trigger reasoning. These chains have learned structure.

Prior to this release, causal rules evaluated individual events against fixed thresholds: a FitIQ below 50 flags a settlement, an availability below 0.90 triggers reasoning. These rules are correct but reactive -- they fire on the event that crosses the threshold, with no memory of the sequence that led there.

The Karpathy Loop trains a sequence model on the historical corpus of SubstrateEvent flows recorded in Neo4j. During inference, it assigns each incoming event a cross-entropy prediction loss given its preceding context: how likely was this event, given the last N events in this entity's causal history? That loss, normalized to a 0.0–1.0 anomaly score, surfaces sequences the model has never seen and was not trained to expect. These are the institutional behaviors that demand attention before a threshold rule fires.

### What the Karpathy Loop Does

Training begins with the `POST /karpathy/train` endpoint. The pipeline extracts SubstrateEvent sequences from Neo4j in causal-temporal order, tokenizes them using the 15-token ZWM vocabulary (12 event types plus padding, start-of-sequence, and end-of-sequence tokens), and trains the selected model architecture for the configured number of iterations. The anomaly threshold is then calibrated at the 95th percentile of training loss -- events that fall in the top 5% of prediction error for the training distribution will trigger an anomaly flag at inference time.

Inference runs through `POST /karpathy/detect`. The caller passes an ordered sequence of event type strings; the final element is the scored event and all preceding elements are its context window. The model computes cross-entropy loss on the scored event given that context, normalizes it, and returns an `anomaly_score` between 0.0 and 1.0 alongside a boolean `is_anomaly` flag, the raw loss, and the threshold value used.

`GET /karpathy/status` lists all loaded Karpathy models with their architecture type, training timestamp, vocabulary size, and loaded state.

### Technical Highlights

- **Four model architectures** -- BIGRAM (next-token from single prior token), MLP (context window with learned hidden representation), WAVENET (dilated convolutions for efficient receptive field expansion), NANOGPT (GPT-2 style causal transformer, default) -- selectable per training run (`nn-service/src/karpathy/`)
- **nanoGPT configuration** -- 4 transformer layers, 4 attention heads, 64-dimensional embeddings, 64-token block size, causal self-attention masking; vocabulary of 15 tokens covering all 8 ZWM event types plus specials (`nn-service/src/karpathy/nanogpt/model.py`)
- **EventTokenizer** -- maps SubstrateEvent type strings to vocabulary indices; handles padding, unknown tokens, and sequence boundaries (`nn-service/src/karpathy/makemore/dataset.py`)
- **Neo4j training pipeline** -- extracts SubstrateEvent sequences in causal-temporal order from the graph; falls back to synthetic Markov sequences (configurable actor count) when graph data is sparse (`nn-service/src/karpathy/karpathy_trainer.py`)
- **Percentile threshold calibration** -- training loss distribution is computed over the full training corpus; 95th-percentile threshold is persisted with the model checkpoint for consistent inference behavior
- **FastAPI endpoints** -- 3 endpoints added to existing `nn-service`: `POST /karpathy/train`, `POST /karpathy/detect`, `GET /karpathy/status` (`nn-service/src/api.py`)
- **KarpathyDetector and KarpathyModelRegistry** -- parallel to the existing VAE ModelRegistry; loads checkpoints from disk, manages model lifecycle, serves inference requests (`nn-service/src/karpathy/karpathy_detector.py`)
- **Graceful degradation** -- if the Karpathy model is unavailable or the endpoint fails, the caller receives null and causal propagation continues unimpeded; no event is dropped, no rule is blocked
- **Fully environment-configurable** -- model type, context length, block size, layer count, head count, embedding dimension, batch size, learning rate, epoch count, synthetic data toggle, and anomaly percentile are all set via environment variables in `config.py`
- **Micrograd reference implementation** -- a complete automatic differentiation engine and PyTorch-style neural network module (`nn-service/src/karpathy/micrograd/`) included as a first-principles foundation alongside the production models

### The Distinction from VAE Detection

The VAE anomaly detector and the Karpathy Loop are complementary, not redundant. The VAE operates on a single state vector -- it asks whether this biological reading, considered in isolation, is statistically unusual relative to the learned distribution of normal readings. It has no memory and no sequence context.

The Karpathy Loop operates on event sequences across all eight substrates. It asks whether this event, given the last N events in this entity's history, is behaviorally expected. A compliance violation followed by an immediate high-volume settlement may be individually explainable but sequentially anomalous. A series of compute degradation events followed by a reasoning cycle followed by a procurement recalculation may be the learned signature of a healthy response -- or it may not. The sequence model knows the difference.

Together, the two systems give ZWM two independent anomaly detection regimes: one that guards the present state, one that guards the behavioral arc.

> "Andrej Karpathy's contribution to ML education is that he made the internals legible -- the attention mechanism, the backward pass, the training loop. We took that legibility and applied it to a different sequence problem: not predicting the next character in Shakespeare, but predicting the next institutional event in a live causal graph. When the model is surprised by what an institution does next, that surprise is information. That is what we are harvesting."
>
> -- Aldrich Khaalis Wooden, Sr., Founder, Zuup Innovation Lab

### About Zuup Innovation Lab

Zuup Innovation Lab, a division of Visionblox LLC, builds the Zuup World Model (ZWM) -- an integration layer that transforms nine independent Solana-deployed platforms into a single, causally-coherent world model. The nine platforms span compliance verification (Civium), procurement intelligence (Aureon), historical reconstruction (QAL), biological monitoring (Symbion), code migration (Relian), edge compute orchestration (PodX), AI reasoning (Veyra), stablecoin settlement (ZUSDC), and on-chain attestation (ZuupHQ).

ZWM listens to all nine programs via Solana WebSocket, writes their state changes into a shared Neo4j graph, evaluates causal propagation rules across substrates, and exposes the resulting world state through GraphQL and REST APIs.

**Website:** zuup.org
**GitHub:** github.com/khaaliswooden-max/zwn
**Solana Network:** Devnet (Program ID: H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM)

### Contact

Aldrich Khaalis Wooden, Sr.
Zuup Innovation Lab · Visionblox LLC
khaaliswooden@gmail.com · zuup.org
Huntsville, Alabama

---

*Zuup Innovation Lab · "Where Ideas Collapse Into Reality"*
