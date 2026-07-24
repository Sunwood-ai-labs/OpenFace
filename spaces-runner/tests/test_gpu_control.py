from gpu_control import worker_matches


def test_gpu_worker_matches_vram_and_features():
    capabilities = {
        "docker": True,
        "gpu_count": 1,
        "gpu_devices": [{"id": "0", "free_vram_mb": 16384}],
        "free_vram_mb": 16384,
        "features": ["nvidia", "cuda"],
    }
    assert worker_matches(
        capabilities,
        {"gpu": True, "min_vram_mb": 12288, "features": ["nvidia"]},
    )


def test_gpu_worker_rejects_insufficient_vram():
    capabilities = {
        "docker": True,
        "gpu_count": 1,
        "gpu_devices": [{"id": "0", "free_vram_mb": 8192}],
        "free_vram_mb": 8192,
        "features": ["nvidia"],
    }
    assert not worker_matches(
        capabilities,
        {"gpu": True, "min_vram_mb": 12288, "features": ["nvidia"]},
    )


def test_gpu_worker_rejects_missing_feature_or_docker():
    assert not worker_matches(
        {
            "docker": True,
            "gpu_count": 1,
            "free_vram_mb": 24576,
            "features": ["nvidia"],
        },
        {"gpu": True, "features": ["cuda"]},
    )


def test_gpu_worker_rejects_fragmented_vram():
    capabilities = {
        "docker": True,
        "gpu_count": 2,
        "gpu_devices": [
            {"id": "0", "free_vram_mb": 8192},
            {"id": "1", "free_vram_mb": 8192},
        ],
        "free_vram_mb": 16384,
        "features": ["nvidia"],
    }
    assert not worker_matches(
        capabilities,
        {"gpu": True, "gpu_count": 1, "min_vram_mb": 12288},
    )
    assert not worker_matches(
        {
            "docker": False,
            "gpu_count": 1,
            "free_vram_mb": 24576,
            "features": ["nvidia"],
        },
        {"gpu": True},
    )
