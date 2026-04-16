"""nn-service configuration loaded from environment variables."""
import os
from pathlib import Path

PORT = int(os.getenv("NN_SERVICE_PORT", "5100"))
HOST = os.getenv("NN_SERVICE_HOST", "0.0.0.0")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

MODEL_DIR = Path(os.getenv("MODEL_DIR", "./models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# VAE hyperparameters (tunable via env)
VAE_INPUT_DIM = int(os.getenv("VAE_INPUT_DIM", "4"))  # serotonin, dopamine, cortisol, gaba
VAE_HIDDEN_DIM = int(os.getenv("VAE_HIDDEN_DIM", "16"))
VAE_LATENT_DIM = int(os.getenv("VAE_LATENT_DIM", "4"))
VAE_LEARNING_RATE = float(os.getenv("VAE_LEARNING_RATE", "1e-3"))
VAE_EPOCHS = int(os.getenv("VAE_EPOCHS", "100"))
VAE_BATCH_SIZE = int(os.getenv("VAE_BATCH_SIZE", "64"))
VAE_ANOMALY_PERCENTILE = float(os.getenv("VAE_ANOMALY_PERCENTILE", "95"))

# Cross-platform VAE (concatenated state vector from all substrates)
CROSS_PLATFORM_INPUT_DIM = int(os.getenv("CROSS_PLATFORM_INPUT_DIM", "20"))

# ---------------------------------------------------------------------------
# Karpathy Loop hyperparameters
# ---------------------------------------------------------------------------
KARPATHY_MODEL_TYPE = os.getenv("KARPATHY_MODEL_TYPE", "nanogpt")
KARPATHY_CONTEXT_LEN = int(os.getenv("KARPATHY_CONTEXT_LEN", "8"))
KARPATHY_USE_SYNTHETIC = os.getenv("KARPATHY_USE_SYNTHETIC", "false").lower() == "true"
KARPATHY_N_SYNTHETIC_ACTORS = int(os.getenv("KARPATHY_N_SYNTHETIC_ACTORS", "100"))
KARPATHY_EPOCHS = int(os.getenv("KARPATHY_EPOCHS", "50"))        # makemore models
KARPATHY_MAX_ITERS = int(os.getenv("KARPATHY_MAX_ITERS", "2000"))  # nanoGPT
KARPATHY_BATCH_SIZE = int(os.getenv("KARPATHY_BATCH_SIZE", "32"))
KARPATHY_LR = float(os.getenv("KARPATHY_LR", "1e-3"))
KARPATHY_ANOMALY_PERCENTILE = float(os.getenv("KARPATHY_ANOMALY_PERCENTILE", "95"))
# nanoGPT architecture
KARPATHY_N_LAYER = int(os.getenv("KARPATHY_N_LAYER", "4"))
KARPATHY_N_HEAD = int(os.getenv("KARPATHY_N_HEAD", "4"))
KARPATHY_N_EMBD = int(os.getenv("KARPATHY_N_EMBD", "64"))
KARPATHY_BLOCK_SIZE = int(os.getenv("KARPATHY_BLOCK_SIZE", "64"))
