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
