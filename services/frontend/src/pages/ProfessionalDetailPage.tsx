import { useParams } from 'react-router-dom';
import { SalonProfile } from '../components/salon/SalonProfile';

/** `/professional/:id` — one salon, addressed by the listing id in the URL.

    Everything on the screen lives in `SalonProfile`, which the customer's
    Home now renders too, for the salon they are in and without the back
    arrow. This is only the route form of it: the id comes off the URL, and
    what it renders is pinned byte for byte by this page's test, taken from
    the screen as it stood before the extraction. */
export default function ProfessionalDetailPage() {
  const { id = '' } = useParams();
  return <SalonProfile listingId={id} />;
}
