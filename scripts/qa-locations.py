"""Check coordinate handling, offline lookup, and coverage of the real index."""
import json
import subprocess
import unittest
from pathlib import Path
from photo_locations import coordinate, named_location

ROOT = Path(__file__).resolve().parent.parent


class LocationChecks(unittest.TestCase):
    def test_signed_coordinates_and_hemispheres(self):
        self.assertEqual(coordinate({"Composite:GPSLongitude": -122.3}, "GPSLongitude", 180), -122.3)
        self.assertEqual(coordinate({"GPS:Copy1:GPSLongitude": 122.3, "GPS:GPSLongitudeRef": "W"}, "GPSLongitude", 180), -122.3)
        self.assertEqual(coordinate({"GPS:GPSLatitude": 33.8, "GPS:GPSLatitudeRef": "S"}, "GPSLatitude", 90), -33.8)
        self.assertEqual(coordinate({"GPS:GPSLatitude": 0}, "GPSLatitude", 90), 0)
        for value in [None, "", "invalid", float("nan"), float("inf"), 91, True]:
            self.assertIsNone(coordinate({"Composite:GPSLatitude": value}, "GPSLatitude", 90))

    def test_city_fallback(self):
        self.assertIsNone(named_location({"IPTC:City": " "}))
        self.assertEqual(named_location({"IPTC:City": "PALMDALE", "IPTC:Province-State": "CA"})["label"], "Palmdale")

    def test_local_lookup_and_unicode(self):
        points = [[47.6062, -122.3321], [-23.5505, -46.6333], [0, -140]]
        result = subprocess.run(["perl", str(ROOT / "scripts/lookup-places.pl")], input=json.dumps(points), text=True, capture_output=True, check=True)
        places = json.loads(result.stdout)
        self.assertEqual(places[0]["city"], "Seattle")
        self.assertEqual(places[1]["city"], "São Paulo")
        self.assertIsNone(places[2])

    def test_archive_coverage(self):
        images = json.loads((ROOT / "media/grid/index.json").read_text())
        for image in images:
            tags = json.loads((ROOT / image["metadataUrl"].lstrip("/")).read_text())["ExifTool"]
            gps = coordinate(tags, "GPSLatitude", 90) is not None and coordinate(tags, "GPSLongitude", 180) is not None
            location = image.get("location")
            if gps:
                self.assertTrue(location and location["source"].startswith("gps-"), image["name"])
                self.assertEqual(image.get("coordinates"), {"latitude": coordinate(tags, "GPSLatitude", 90), "longitude": coordinate(tags, "GPSLongitude", 180)})
            elif named_location(tags):
                self.assertEqual(location["source"], "metadata")
                self.assertIsNone(image.get("coordinates"))
            else:
                self.assertIsNone(location, image["name"])
                self.assertIsNone(image.get("coordinates"))


if __name__ == "__main__":
    unittest.main()
