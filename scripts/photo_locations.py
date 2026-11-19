"""Enrich the generated grid with places from saved metadata, entirely offline."""
import hashlib
import json
import math
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile


def tag_value(tags, name):
    return next((value for key, value in tags.items()
                 if key.rsplit(":", 1)[-1] == name and value not in (None, "")), None)


def coordinate(tags, name, limit):
    signed = tags.get("Composite:" + name)
    value = signed if signed is not None else tag_value(tags, name)
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (ValueError, TypeError):
        return None
    if signed is None:
        ref = str(tag_value(tags, name + "Ref") or "").upper()
        if ref in ("S", "SOUTH", "W", "WEST"):
            value = -abs(value)
    return value if math.isfinite(value) and abs(value) <= limit else None


def place_id(*parts):
    key = json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(key.encode()).hexdigest()[:20]


def named_location(tags):
    city = tag_value(tags, "City")
    if not isinstance(city, str) or not city.strip():
        return None
    city = city.strip()
    if city.isupper():
        city = city.title()
    region = tag_value(tags, "State") or tag_value(tags, "Province-State") or ""
    country = tag_value(tags, "Country") or tag_value(tags, "Country-PrimaryLocationName") or ""
    region = region.strip() if isinstance(region, str) else ""
    country = country.strip() if isinstance(country, str) else ""
    return {"id": place_id("metadata", city, region, country), "label": city,
            "region": region, "country": country, "source": "metadata"}


def enrich_locations(root, images):
    points, targets = [], []
    for image in images:
        image.pop("location", None)
        metadata = root / image["metadataUrl"].lstrip("/")
        tags = json.loads(metadata.read_text())["ExifTool"]
        lat = coordinate(tags, "GPSLatitude", 90)
        lon = coordinate(tags, "GPSLongitude", 180)
        image["coordinates"] = {"latitude": lat, "longitude": lon} if lat is not None and lon is not None else None
        if lat is not None and lon is not None:
            points.append([lat, lon])
            targets.append(image)
        else:
            image["location"] = named_location(tags)
    if points:
        result = subprocess.run(["perl", str(root / "scripts/lookup-places.pl")],
                                input=json.dumps(points), text=True, capture_output=True, check=True)
        places = json.loads(result.stdout)
        if len(places) != len(points):
            raise ValueError("Place lookup returned an incomplete batch")
        for image, point, place in zip(targets, points, places):
            if place:
                image["location"] = {
                    "id": place_id("gps", place["city"], place["region"], place["countryCode"],
                                   place["latitude"], place["longitude"]),
                    "label": place["city"] + " area", "region": place["region"],
                    "country": place["country"], "source": "gps-nearest-place",
                    "distanceKm": place["distanceKm"],
                }
            else:
                # Distant/ocean coordinates still form a selectable area, rather
                # than being mislabeled as missing or assigned a faraway city.
                lat, lon = [round(value, 1) for value in point]
                label = f"{abs(lat):.1f}° {'N' if lat >= 0 else 'S'}, {abs(lon):.1f}° {'E' if lon >= 0 else 'W'}"
                image["location"] = {"id": place_id("gps-area", lat, lon), "label": label,
                                     "region": "", "country": "", "source": "gps-area"}


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    index = root / "media/grid/index.json"
    images = json.loads(index.read_text())
    enrich_locations(root, images)
    with NamedTemporaryFile(mode="w", dir=index.parent, delete=False) as temp:
        json.dump(images, temp, ensure_ascii=False, separators=(",", ":"))
        temp.write("\n")
    Path(temp.name).replace(index)
    known = [image["location"] for image in images if image.get("location")]
    print(f"Indexed locations for {len(known)} of {len(images)} images across {len({p['id'] for p in known})} places.")
