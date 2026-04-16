"""ZWM-themed generation prompts for LTX-Video 2.3.

Each scene type maps to a prompt optimized for the ZWM visual language:
dark backgrounds, teal/purple/amber color palette, institutional-data aesthetic.
LTX-Video 2.3 generates 10-second videos at 24fps; COLMAP extracts ~20-40 frames.
"""

SCENE_PROMPTS: dict[str, dict[str, str]] = {
    "world-nebula": {
        "prompt": (
            "Cinematic deep space nebula environment, teal and violet luminescent dust clouds "
            "slowly drifting through dark void, subtle luminous particle streams, photorealistic "
            "volumetric lighting, dark background #0a0a0a, slow orbital camera movement, "
            "institutional data flow aesthetic, 4K, no text, no people"
        ),
        "negative_prompt": "text, watermark, logo, person, face, bright white background, daytime",
        "duration": 10,
        "resolution": "768x432",
    },
    "compliance-domain": {
        "prompt": (
            "Regulatory compliance data structure visualization, crystalline lattice of green "
            "glowing nodes on dark background, translucent blockchain-like geometric forms, "
            "slow rotation, ethereal glow, deep space aesthetic, 4K, no text"
        ),
        "negative_prompt": "text, watermark, person, face, bright background",
        "duration": 8,
        "resolution": "768x432",
    },
    "causal-flow": {
        "prompt": (
            "Energy transfer streams between luminous data nodes, particle flows tracing "
            "curved paths through dark void, teal and coral colored light trails, "
            "smooth slow camera drift, cinematic, 4K, no text"
        ),
        "negative_prompt": "text, watermark, person, face, white background",
        "duration": 8,
        "resolution": "768x432",
    },
    "procurement-lattice": {
        "prompt": (
            "Purple and amber geometric procurement network, interconnected data nodes "
            "forming a three-dimensional lattice, slow rotation through dark void, "
            "soft volumetric lighting, institutional data visualization, 4K, no text"
        ),
        "negative_prompt": "text, watermark, person, face, bright background",
        "duration": 8,
        "resolution": "768x432",
    },
    "biological-field": {
        "prompt": (
            "Abstract biological signal field, amber and green waveform structures "
            "pulsing slowly through dark space, organic curves, neural-like connections, "
            "bioluminescent glow, cinematic depth of field, 4K, no text"
        ),
        "negative_prompt": "text, watermark, person, face, bright background, medical imagery",
        "duration": 8,
        "resolution": "768x432",
    },
}

AVAILABLE_SCENES = list(SCENE_PROMPTS.keys())
