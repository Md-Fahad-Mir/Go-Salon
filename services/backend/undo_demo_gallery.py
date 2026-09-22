"""Remove the demo portfolio photographs.

Deletes exactly the 35 gallery rows the demo seed created and puts each
salon's logo row back where it was. Nothing else is touched — rows added
through the app after the seed keep their own ids and are not in this list.

    uv run python manage.py shell < undo_demo_gallery.py
"""

from Apps.portfolio.models import GalleryImage

SEEDED = [37,38,39,40,41,42,43,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,68,69,70,71,72,73]

#: pk -> the sort_order the row had before the seed pushed it to the back.
MOVED = {"30":0,"31":0,"32":0,"33":0,"34":0,"35":0,"36":0}

removed, _ = GalleryImage.objects.filter(pk__in=SEEDED).delete()
print('deleted', removed, 'seeded rows')

for pk, was in MOVED.items():
    GalleryImage.objects.filter(pk=int(pk)).update(sort_order=was)
print('restored', len(MOVED), 'logo rows to their original sort_order')
