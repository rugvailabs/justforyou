"""Directory seed data: categories and Toronto-area business listings.

Imported by scripts.seed so `python -m scripts.seed` populates everything.

All business names, addresses, phone numbers and websites below are invented.
They are shaped like real Toronto listings so the search, distance and rating
filters have something plausible to work on - they are not real businesses.

Coordinates are real neighbourhood centroids, which is what makes the "near me"
path testable: the reference point used in development is downtown Toronto at
(43.65, -79.38).
"""

from __future__ import annotations

from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.business import Business
from app.models.business_review import BusinessReview
from app.models.category import Category
from app.models.user import User, UserRole

# (slug, name, icon, sort_order, description)
CATEGORIES: List[Tuple[str, str, str, int, str]] = [
    ("plumbers", "Plumbers", "🔧", 10, "Leaks, drains, water heaters and emergency callouts."),
    ("electricians", "Electricians", "💡", 20, "Wiring, panel upgrades, lighting and ESA inspections."),
    ("restaurants", "Restaurants", "🍽️", 30, "Places to eat, from counter service to fine dining."),
    ("dentists", "Dentists", "🦷", 40, "General dentistry, hygiene and cosmetic work."),
    ("auto-repair", "Auto Repair", "🚗", 50, "Mechanics, bodywork, tires and safety certificates."),
    ("gyms", "Gyms & Fitness", "🏋️", 60, "Gyms, studios and personal training."),
    ("salons", "Salons & Spas", "💇", 70, "Hair, nails, skincare and massage."),
    ("movers", "Movers & Storage", "📦", 80, "Local and long-distance moving, packing and storage."),
    ("it-support", "IT Support", "💻", 90, "Managed IT, repairs and small-business networking."),
    ("legal", "Legal Services", "⚖️", 100, "Family, immigration, real estate and small-claims law."),
]

# (slug, name, category_slug, city, address, postal, lat, lng, phone, website,
#  rating, review_count, verified, description)
# rating None models a listing with no reviews yet - deliberately included so
# the NULL-handling in ?min_rating and the rating sort is exercised.
BUSINESSES = [
    # --- plumbers -----------------------------------------------------------
    ("harbourfront-plumbing", "Harbourfront Plumbing", "plumbers", "Toronto", "412 Queens Quay W", "M5V 3A6", 43.6387, -79.3860, "+1-416-555-0101", "https://example.com/harbourfront-plumbing", 4.7, 218, True, "24-hour emergency plumbing and drain clearing across the downtown core."),
    ("kensington-drain-works", "Kensington Drain Works", "plumbers", "Toronto", "88 Augusta Ave", "M5T 2K9", 43.6547, -79.4005, "+1-416-555-0102", None, 4.3, 96, True, "Drain snaking, camera inspection and backwater valve installation."),
    ("leslieville-pipe-co", "Leslieville Pipe Co.", "plumbers", "Toronto", "1043 Queen St E", "M4M 1K4", 43.6626, -79.3306, "+1-416-555-0103", "https://example.com/leslieville-pipe", 4.1, 54, False, "Residential repiping and water heater replacement."),
    ("north-york-plumbing-group", "North York Plumbing Group", "plumbers", "North York", "5150 Yonge St", "M2N 6L8", 43.7615, -79.4111, "+1-416-555-0104", None, 3.8, 41, False, "Condo and low-rise plumbing maintenance contracts."),
    ("mississauga-flow-services", "Mississauga Flow Services", "plumbers", "Mississauga", "201 City Centre Dr", "L5B 2T4", 43.5890, -79.6441, "+1-905-555-0105", "https://example.com/msg-flow", 4.5, 132, True, "Sump pumps, backflow testing and basement waterproofing."),

    # --- electricians -------------------------------------------------------
    ("queen-west-electric", "Queen West Electric", "electricians", "Toronto", "755 Queen St W", "M6J 1G1", 43.6465, -79.4021, "+1-416-555-0111", "https://example.com/queen-west-electric", 4.8, 305, True, "ESA-certified panel upgrades, knob-and-tube replacement and EV chargers."),
    ("liberty-village-electrical", "Liberty Village Electrical", "electricians", "Toronto", "171 East Liberty St", "M6K 3P6", 43.6379, -79.4200, "+1-416-555-0112", None, 4.4, 87, True, "Condo lighting design and smart-home wiring."),
    ("scarborough-current-co", "Scarborough Current Co.", "electricians", "Scarborough", "300 Borough Dr", "M1P 4P5", 43.7764, -79.2318, "+1-416-555-0113", None, 3.9, 63, False, "Residential rewiring and generator hookups."),
    ("etobicoke-voltage", "Etobicoke Voltage", "electricians", "Etobicoke", "5230 Dundas St W", "M9B 1A8", 43.6205, -79.5132, "+1-416-555-0114", "https://example.com/etobicoke-voltage", None, 0, False, "New electrical contractor serving south Etobicoke."),

    # --- restaurants --------------------------------------------------------
    ("the-annex-kitchen", "The Annex Kitchen", "restaurants", "Toronto", "512 Bloor St W", "M5S 1Y3", 43.6647, -79.4111, "+1-416-555-0121", "https://example.com/annex-kitchen", 4.6, 892, True, "Seasonal Ontario produce, open kitchen, walk-ins welcome."),
    ("kensington-taco-bar", "Kensington Taco Bar", "restaurants", "Toronto", "204 Augusta Ave", "M5T 2L4", 43.6552, -79.4020, "+1-416-555-0122", None, 4.5, 640, True, "Counter-service tacos and aguas frescas in the market."),
    ("distillery-pasta-house", "Distillery Pasta House", "restaurants", "Toronto", "55 Mill St", "M5A 3C4", 43.6503, -79.3596, "+1-416-555-0123", "https://example.com/distillery-pasta", 4.2, 411, True, "Hand-rolled pasta in the Distillery District."),
    ("beaches-brunch-room", "Beaches Brunch Room", "restaurants", "Toronto", "1962 Queen St E", "M4L 1H8", 43.6710, -79.2930, "+1-416-555-0124", None, 4.0, 228, False, "All-day breakfast a block from the boardwalk."),
    ("markham-dumpling-house", "Markham Dumpling House", "restaurants", "Markham", "3255 Highway 7", "L3R 3P9", 43.8561, -79.3370, "+1-905-555-0125", None, 4.7, 1204, True, "Hand-folded dumplings and hot-and-sour soup."),
    ("yorkville-steak-social", "Yorkville Steak Social", "restaurants", "Toronto", "128 Cumberland St", "M5R 1A6", 43.6709, -79.3933, "+1-416-555-0126", "https://example.com/yorkville-steak", 3.6, 176, False, "Dry-aged steaks and a long cocktail list."),

    # --- dentists -----------------------------------------------------------
    ("bay-street-dental", "Bay Street Dental", "dentists", "Toronto", "150 Bay St", "M5J 2X9", 43.6452, -79.3782, "+1-416-555-0131", "https://example.com/bay-street-dental", 4.9, 512, True, "Downtown practice with evening hours for office workers."),
    ("danforth-family-dentistry", "Danforth Family Dentistry", "dentists", "Toronto", "1420 Danforth Ave", "M4J 1N4", 43.6820, -79.3260, "+1-416-555-0132", None, 4.4, 198, True, "Family dentistry, hygiene and Invisalign."),
    ("north-york-smile-studio", "North York Smile Studio", "dentists", "North York", "4841 Yonge St", "M2N 5X2", 43.7601, -79.4108, "+1-416-555-0133", None, 4.1, 121, False, "Cosmetic dentistry and whitening."),

    # --- auto-repair --------------------------------------------------------
    ("dupont-auto-works", "Dupont Auto Works", "auto-repair", "Toronto", "899 Dupont St", "M6G 1Z6", 43.6698, -79.4270, "+1-416-555-0141", "https://example.com/dupont-auto", 4.6, 340, True, "Independent mechanics for European and Japanese cars."),
    ("scarborough-tire-centre", "Scarborough Tire Centre", "auto-repair", "Scarborough", "2201 Eglinton Ave E", "M1L 4S9", 43.7320, -79.2650, "+1-416-555-0142", None, 4.0, 156, False, "Tires, alignment and seasonal storage."),
    ("etobicoke-collision-care", "Etobicoke Collision Care", "auto-repair", "Etobicoke", "1155 The Queensway", "M8Z 1P7", 43.6215, -79.5240, "+1-416-555-0143", None, 3.7, 88, False, "Insurance-approved collision and paint work."),

    # --- gyms ---------------------------------------------------------------
    ("king-west-strength", "King West Strength", "gyms", "Toronto", "600 King St W", "M5V 1M3", 43.6444, -79.4008, "+1-416-555-0151", "https://example.com/king-west-strength", 4.8, 421, True, "Barbell-focused gym with coaching and open gym hours."),
    ("riverdale-yoga-loft", "Riverdale Yoga Loft", "gyms", "Toronto", "782 Broadview Ave", "M4K 2P7", 43.6770, -79.3585, "+1-416-555-0152", None, 4.5, 210, True, "Vinyasa, yin and beginner series."),
    ("mississauga-fitness-hub", "Mississauga Fitness Hub", "gyms", "Mississauga", "100 City Centre Dr", "L5B 2C9", 43.5930, -79.6420, "+1-905-555-0153", None, 3.9, 97, False, "24-hour access gym with cardio and free weights."),

    # --- salons -------------------------------------------------------------
    ("ossington-hair-atelier", "Ossington Hair Atelier", "salons", "Toronto", "88 Ossington Ave", "M6J 2Y7", 43.6470, -79.4200, "+1-416-555-0161", "https://example.com/ossington-hair", 4.7, 383, True, "Cuts, colour and balayage."),
    ("yorkville-skin-spa", "Yorkville Skin Spa", "salons", "Toronto", "99 Yorkville Ave", "M5R 3K5", 43.6712, -79.3940, "+1-416-555-0162", None, 4.3, 245, True, "Facials, peels and laser treatments."),
    ("north-york-nail-bar", "North York Nail Bar", "salons", "North York", "1800 Sheppard Ave E", "M2J 5A7", 43.7750, -79.3450, "+1-416-555-0163", None, 3.5, 74, False, "Manicures, pedicures and gel extensions."),

    # --- movers -------------------------------------------------------------
    ("six-city-movers", "Six City Movers", "movers", "Toronto", "222 Spadina Ave", "M5T 3B3", 43.6500, -79.3970, "+1-416-555-0171", "https://example.com/six-city-movers", 4.4, 289, True, "Local moves, packing services and short-term storage."),
    ("gta-storage-and-haul", "GTA Storage & Haul", "movers", "Etobicoke", "20 Carlingview Dr", "M9W 5E8", 43.6900, -79.5800, "+1-416-555-0172", None, 3.8, 112, False, "Heated storage units and junk removal."),

    # --- it-support ---------------------------------------------------------
    ("bloor-tech-support", "Bloor Tech Support", "it-support", "Toronto", "365 Bloor St E", "M4W 3L4", 43.6710, -79.3790, "+1-416-555-0181", "https://example.com/bloor-tech", 4.6, 167, True, "Managed IT and helpdesk for small offices."),
    ("scarborough-pc-clinic", "Scarborough PC Clinic", "it-support", "Scarborough", "1571 Sandhurst Cir", "M1V 1V2", 43.8050, -79.2790, "+1-416-555-0182", None, 4.2, 93, False, "Laptop repair, data recovery and virus removal."),

    # --- legal --------------------------------------------------------------
    ("adelaide-legal-partners", "Adelaide Legal Partners", "legal", "Toronto", "130 Adelaide St W", "M5H 3P5", 43.6495, -79.3830, "+1-416-555-0191", "https://example.com/adelaide-legal", 4.5, 143, True, "Real estate closings, wills and small-business law."),
    ("dundas-immigration-law", "Dundas Immigration Law", "legal", "Toronto", "376 Dundas St W", "M5T 1G6", 43.6540, -79.3930, "+1-416-555-0192", None, 4.1, 88, True, "Express Entry, sponsorship and study permits."),
    ("mississauga-family-law-office", "Mississauga Family Law Office", "legal", "Mississauga", "4 Robert Speck Pkwy", "L4Z 1S1", 43.5940, -79.6390, "+1-905-555-0193", None, None, 0, False, "Separation agreements and custody matters."),
]


def seed_categories(db: Session) -> Tuple[int, int]:
    """Create any missing categories, matching on slug. Returns (created, total)."""
    created = 0
    for slug, name, icon, sort_order, description in CATEGORIES:
        existing = db.scalar(select(Category).where(Category.slug == slug))
        if existing is None:
            db.add(
                Category(
                    slug=slug,
                    name=name,
                    icon=icon,
                    sort_order=sort_order,
                    description=description,
                    parent_id=None,
                )
            )
            created += 1
    db.flush()
    return created, len(CATEGORIES)


def seed_businesses(db: Session) -> Tuple[int, int]:
    """Create any missing listings, matching on slug. Returns (created, total)."""
    by_slug = {c.slug: c for c in db.scalars(select(Category)).all()}
    created = 0
    for row in BUSINESSES:
        (
            slug, name, category_slug, city, address, postal,
            lat, lng, phone, website, rating, review_count, verified, description,
        ) = row

        if db.scalar(select(Business).where(Business.slug == slug)) is not None:
            continue

        category = by_slug.get(category_slug)
        if category is None:
            # A typo in the fixture would otherwise fail with a confusing
            # NOT NULL violation on category_id much later.
            raise RuntimeError(
                f"business {slug!r} references unknown category {category_slug!r}"
            )

        db.add(
            Business(
                slug=slug,
                name=name,
                category_id=category.id,
                city=city,
                province="ON",
                address=address,
                postal_code=postal,
                latitude=lat,
                longitude=lng,
                phone=phone,
                website=website,
                rating=rating,
                review_count=review_count,
                verified=verified,
                is_active=True,
                description=description,
            )
        )
        created += 1
    db.flush()
    return created, len(BUSINESSES)


# (business slug, reviewer name, reviewer email, rating, title, body)
# Reviewers are ordinary customer accounts created by the seed so the
# one-review-per-user constraint has real users behind it.
SEED_REVIEWS = [
    ("harbourfront-plumbing", "Priya Raman", "priya.raman@example.ca", 5,
     "Came out at 11pm", "Burst pipe on a Sunday night and they were here within the hour. Fair price, no fuss."),
    ("harbourfront-plumbing", "Tom Beckett", "tom.beckett@example.ca", 4,
     "Solid work, slow to quote", "The repair itself was excellent. Took three days to get the written quote though."),
    ("harbourfront-plumbing", "Aisha Noor", "aisha.noor@example.ca", 3,
     "Fine, but pricey", "Job was done properly. Felt expensive for what turned out to be a 40 minute fix."),
    ("queen-west-electric", "Marcus Webb", "marcus.webb@example.ca", 5,
     "Panel upgrade done right", "ESA paperwork handled, site left spotless. Would use again."),
    ("the-annex-kitchen", "Sofia Marino", "sofia.marino@example.ca", 4,
     "Lovely room, tight tables", "Food was genuinely excellent. Bring a small bag, it is snug."),
]

SEED_REVIEWER_PASSWORD = "reviewerpass123"


def seed_reviews(db: Session) -> Tuple[int, int]:
    """Create missing reviews and refresh the affected listings' aggregates.

    Idempotent on (business, author). Recomputing the aggregate afterwards is
    what makes the seeded placeholder rating give way to the real one.
    """
    from app.core.security import hash_password
    from sqlalchemy import func

    created = 0
    touched: set[int] = set()

    for slug, name, email, rating, title, body in SEED_REVIEWS:
        business = db.scalar(select(Business).where(Business.slug == slug))
        if business is None:
            continue

        author = db.scalar(select(User).where(User.email == email))
        if author is None:
            author = User(
                name=name,
                email=email,
                hashed_password=hash_password(SEED_REVIEWER_PASSWORD),
                role=UserRole.customer,
            )
            db.add(author)
            db.flush()

        existing = db.scalar(
            select(BusinessReview).where(
                BusinessReview.business_id == business.id,
                BusinessReview.user_id == author.id,
            )
        )
        if existing is not None:
            touched.add(business.id)
            continue

        db.add(
            BusinessReview(
                business_id=business.id,
                user_id=author.id,
                rating=rating,
                title=title,
                body=body,
            )
        )
        created += 1
        touched.add(business.id)

    db.flush()

    for business_id in touched:
        business = db.get(Business, business_id)
        if business is None:
            continue
        avg, count = db.execute(
            select(func.avg(BusinessReview.rating), func.count(BusinessReview.id))
            .where(BusinessReview.business_id == business_id)
        ).one()
        business.rating = round(float(avg), 2) if avg is not None else None
        business.review_count = count or 0

    db.flush()
    return created, len(SEED_REVIEWS)
