"""
Geospatial Utility Functions

Functions for calculating polygon area, centroid, and validation
for geo-fencing boundaries.
"""

import math
from typing import List, Tuple, Optional


# Earth's radius in meters (WGS84 mean radius)
EARTH_RADIUS_METERS = 6371008.8


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth
    using the Haversine formula.

    Args:
        lat1, lon1: First point coordinates (degrees)
        lat2, lon2: Second point coordinates (degrees)

    Returns:
        Distance in meters
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Haversine formula
    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS_METERS * c


def calculate_polygon_area(coordinates: List[List[List[float]]]) -> float:
    """
    Calculate the area of a GeoJSON polygon in square meters.

    Uses the Shoelace formula adapted for spherical coordinates.
    For more accurate results on large polygons, uses geodesic calculation.

    Args:
        coordinates: GeoJSON polygon coordinates [[[lng, lat], [lng, lat], ...]]
                    First ring is exterior boundary, subsequent rings are holes

    Returns:
        Area in square meters
    """
    if not coordinates or not coordinates[0]:
        return 0.0

    # Get the exterior ring (first element)
    exterior_ring = coordinates[0]

    if len(exterior_ring) < 4:  # Minimum 3 unique points + closing point
        return 0.0

    # Calculate area using spherical excess formula (more accurate for geodesic)
    total_area = _calculate_ring_area(exterior_ring)

    # Subtract holes (if any)
    for hole in coordinates[1:]:
        if len(hole) >= 4:
            total_area -= _calculate_ring_area(hole)

    return abs(total_area)


def _calculate_ring_area(ring: List[List[float]]) -> float:
    """
    Calculate the area of a single ring using the spherical polygon area formula.

    Args:
        ring: List of [lng, lat] coordinates

    Returns:
        Area in square meters
    """
    n = len(ring)
    if n < 4:
        return 0.0

    total = 0.0

    for i in range(n - 1):
        # GeoJSON uses [lng, lat] order
        lon1, lat1 = ring[i]
        lon2, lat2 = ring[(i + 1) % (n - 1)]

        # Convert to radians
        lon1_rad = math.radians(lon1)
        lat1_rad = math.radians(lat1)
        lon2_rad = math.radians(lon2)
        lat2_rad = math.radians(lat2)

        # Spherical excess formula component
        total += (lon2_rad - lon1_rad) * (2 + math.sin(lat1_rad) + math.sin(lat2_rad))

    # Calculate area
    area = abs(total) * EARTH_RADIUS_METERS ** 2 / 2

    return area


def calculate_centroid(coordinates: List[List[List[float]]]) -> Tuple[float, float]:
    """
    Calculate the centroid (center point) of a GeoJSON polygon.

    Args:
        coordinates: GeoJSON polygon coordinates [[[lng, lat], [lng, lat], ...]]

    Returns:
        Tuple of (latitude, longitude) of the centroid
    """
    if not coordinates or not coordinates[0]:
        return (0.0, 0.0)

    # Get exterior ring
    exterior_ring = coordinates[0]

    if len(exterior_ring) < 4:
        return (0.0, 0.0)

    # Simple centroid calculation (average of vertices)
    # For more accuracy on large polygons, use area-weighted centroid
    sum_lng = 0.0
    sum_lat = 0.0
    count = len(exterior_ring) - 1  # Exclude closing point

    for i in range(count):
        lng, lat = exterior_ring[i]
        sum_lng += lng
        sum_lat += lat

    centroid_lng = sum_lng / count
    centroid_lat = sum_lat / count

    return (centroid_lat, centroid_lng)


def validate_polygon(coordinates: List[List[List[float]]]) -> Tuple[bool, Optional[str]]:
    """
    Validate a GeoJSON polygon structure and coordinates.

    Args:
        coordinates: GeoJSON polygon coordinates

    Returns:
        Tuple of (is_valid, error_message)
        error_message is None if valid
    """
    if not coordinates:
        return (False, "Coordinates array is empty")

    if not isinstance(coordinates, list):
        return (False, "Coordinates must be an array")

    # Check exterior ring exists
    if not coordinates[0]:
        return (False, "Exterior ring is empty")

    exterior_ring = coordinates[0]

    # Check minimum points (3 unique + 1 closing = 4)
    if len(exterior_ring) < 4:
        return (False, "Polygon must have at least 3 points (4 with closing point)")

    # Check if polygon is closed (first point == last point)
    first_point = exterior_ring[0]
    last_point = exterior_ring[-1]
    if first_point[0] != last_point[0] or first_point[1] != last_point[1]:
        return (False, "Polygon must be closed (first and last point must be identical)")

    # Validate each coordinate
    for i, point in enumerate(exterior_ring):
        if not isinstance(point, list) or len(point) < 2:
            return (False, f"Point {i} must be [longitude, latitude] array")

        lng, lat = point[0], point[1]

        # Validate longitude (-180 to 180)
        if not isinstance(lng, (int, float)) or lng < -180 or lng > 180:
            return (False, f"Point {i}: longitude must be between -180 and 180")

        # Validate latitude (-90 to 90)
        if not isinstance(lat, (int, float)) or lat < -90 or lat > 90:
            return (False, f"Point {i}: latitude must be between -90 and 90")

    # Check for reasonable area (not too small or too large)
    area = calculate_polygon_area(coordinates)

    if area < 1:  # Less than 1 square meter
        return (False, "Polygon area is too small (less than 1 square meter)")

    if area > 1e12:  # Larger than 1 million square kilometers
        return (False, "Polygon area is too large")

    return (True, None)


def point_in_polygon(
    point_lng: float,
    point_lat: float,
    coordinates: List[List[List[float]]]
) -> bool:
    """
    Check if a point is inside a polygon using the ray casting algorithm.

    Args:
        point_lng: Longitude of the point to check
        point_lat: Latitude of the point to check
        coordinates: GeoJSON polygon coordinates

    Returns:
        True if point is inside the polygon
    """
    if not coordinates or not coordinates[0]:
        return False

    exterior_ring = coordinates[0]
    n = len(exterior_ring)
    inside = False

    j = n - 1
    for i in range(n):
        xi, yi = exterior_ring[i][0], exterior_ring[i][1]
        xj, yj = exterior_ring[j][0], exterior_ring[j][1]

        if ((yi > point_lat) != (yj > point_lat)) and \
           (point_lng < (xj - xi) * (point_lat - yi) / (yj - yi) + xi):
            inside = not inside

        j = i

    return inside


def meters_to_hectares(meters_sq: float) -> float:
    """Convert square meters to hectares"""
    return meters_sq / 10000


def hectares_to_meters(hectares: float) -> float:
    """Convert hectares to square meters"""
    return hectares * 10000


def get_bounding_box(
    coordinates: List[List[List[float]]]
) -> Tuple[float, float, float, float]:
    """
    Get the bounding box of a polygon.

    Args:
        coordinates: GeoJSON polygon coordinates

    Returns:
        Tuple of (min_lng, min_lat, max_lng, max_lat)
    """
    if not coordinates or not coordinates[0]:
        return (0.0, 0.0, 0.0, 0.0)

    exterior_ring = coordinates[0]

    lngs = [point[0] for point in exterior_ring]
    lats = [point[1] for point in exterior_ring]

    return (min(lngs), min(lats), max(lngs), max(lats))
