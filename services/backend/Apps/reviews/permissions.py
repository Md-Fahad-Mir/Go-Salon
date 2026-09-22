"""Who may answer a review.

Kept out of the views because the serializer has to ask the same question:
the payload carries `can_reply`, so a screen never draws a Reply button the
API would refuse.
"""

from __future__ import annotations


def may_reply(appointment, review, user) -> str:
    """`''` if this account may answer this review, otherwise the refusal code.

    `access.runs_business` is the right gate for approving and completing work,
    but it is too wide for a reply: it passes the salon's owner *and* the
    stylist in the chair, and a reply is one field the customer reads as coming
    from the shop. So the owner and the lone barber may always answer, the
    stylist may answer about their own chair, and nobody may quietly overwrite
    somebody else's answer — which is the only way two people sharing one field
    can go wrong in public.
    """
    if appointment.salon_id and appointment.salon.owner_id == user.id:
        return ''
    if appointment.barber_id and appointment.barber.user_id == user.id:
        return ''
    if appointment.employee_id and appointment.employee.user_id == user.id:
        if review.replied_by_id and review.replied_by_id != user.id:
            return 'already_answered'
        return ''
    return 'not_yours'
