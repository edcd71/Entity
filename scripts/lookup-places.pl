use strict;
use warnings;
use FindBin;
use lib "$FindBin::Bin/../node_modules/exiftool-vendored.pl/bin/lib";
use Image::ExifTool::Geolocation;
use JSON::PP;
use Encode qw(decode);

# Resolve the batch locally with ExifTool's bundled GeoNames database.
local $/;
my $coordinates = decode_json(<STDIN>);
my @places;
for my $point (@$coordinates) {
    my ($matches, $distances) = Image::ExifTool::Geolocation::Geolocate(
        join(',', @$point), {GeolocMaxDist => 100, GeolocFeature => '-PPLX'}
    );
    if (!$matches || !@$matches) { push @places, undef; next; }
    my @place = Image::ExifTool::Geolocation::GetEntry($matches->[0]);
    # ExifTool returns database labels as UTF-8 bytes; JSON expects characters.
    for my $field (0, 1, 3, 4) {
        $place[$field] = decode('UTF-8', $place[$field]) unless utf8::is_utf8($place[$field]);
    }
    push @places, {
        city => $place[0], region => $place[1], country => $place[4],
        countryCode => $place[3], latitude => $place[8], longitude => $place[9],
        distanceKm => 0 + sprintf('%.1f', $distances->[0][0]),
    };
}
print encode_json(\@places);
