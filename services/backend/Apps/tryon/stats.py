"""What the 360° try-on costs the platform and what it brings in — the admin
Overview's "AI spend vs revenue".

Spend is every completed video priced at OpenRouter's list price for the model
that rendered it (the one picked in Settings → AI generation at the time),
converted to taka at `USD_TO_BDT_RATE`. Revenue is the same videos at the
360° try-on video price set in Settings. Neither is stored per video: both
are worked out from the log whenever the Overview asks.
"""

from __future__ import annotations

from django.conf import settings
from django.db.models import Count, QuerySet

from . import ai_service
from .ai_service import AIServiceError
from .models import TryOnSettings

#: The Overview waits this long for the price list at most, rather than the
#: full AI-service timeout — a slow AI service must not hold up the page.
CATALOGUE_TIMEOUT_SECONDS = 10


def spend_and_revenue(completed_videos: QuerySet) -> dict:
    row = TryOnSettings.load()
    # `.order_by()` clears the log's default ordering, which would otherwise
    # split the grouping by timestamp.
    per_model = dict(completed_videos.order_by().values_list('video_model').annotate(n=Count('id')))
    videos = sum(per_model.values())
    rate = settings.USD_TO_BDT_RATE

    spend_usd: float | None = 0.0
    unpriced = 0
    error = None
    if videos:
        try:
            catalogue = ai_service.video_models(timeout=CATALOGUE_TIMEOUT_SECONDS)
        except AIServiceError as exc:
            spend_usd = None
            error = {'code': exc.code, 'message': str(exc.detail)}
        else:
            prices = {m.get('id'): m.get('price_per_video_usd') for m in catalogue.get('models') or []}
            # A video logged without a model was rendered with the one in use.
            in_use = row.video_model or str(catalogue.get('default_model') or '')
            for model, count in per_model.items():
                price = prices.get(model or in_use)
                if price is None:
                    # The model has left the catalogue, or OpenRouter quotes
                    # no fixed price for it: left out, and said so.
                    unpriced += count
                else:
                    spend_usd += float(price) * count

    revenue_bdt = videos * row.video_price_bdt
    spend_bdt = None if spend_usd is None else round(spend_usd * rate, 2)
    margin_pct = (
        round((revenue_bdt - spend_bdt) / revenue_bdt * 100, 1)
        if spend_bdt is not None and revenue_bdt else None
    )
    return {
        'videos': videos,
        'spend_usd': None if spend_usd is None else round(spend_usd, 4),
        'spend_bdt': spend_bdt,
        'revenue_bdt': revenue_bdt,
        'margin_pct': margin_pct,
        'unpriced_videos': unpriced,
        'video_price_bdt': row.video_price_bdt,
        'usd_to_bdt': rate,
        'error': error,
    }
