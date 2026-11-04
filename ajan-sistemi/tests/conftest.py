"""Testler yerel yapılandırmadan (ör. gerçek inbox/moveon klasörü) etkilenmesin."""
import pytest


@pytest.fixture(autouse=True)
def _yerel_moveon_kapali(monkeypatch):
    import orkestrator.akis as akis
    monkeypatch.setattr(akis, "moveon_ayari", lambda kok=None: None)
