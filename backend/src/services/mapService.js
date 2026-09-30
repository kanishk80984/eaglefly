// This is a MapService abstraction. 
// It can be implemented with Google Maps, Mapbox, or OSRM later.

const calculateDistance = async (pickupLat, pickupLng, dropLat, dropLng) => {
  // Dummy implementation using Haversine formula for straight-line distance
  // In production, replace with Maps API call (e.g., Google Maps Distance Matrix)
  const toRad = (value) => (value * Math.PI) / 180;
  
  const R = 6371; // km
  const dLat = toRad(dropLat - pickupLat);
  const dLon = toRad(dropLng - pickupLng);
  const lat1 = toRad(pickupLat);
  const lat2 = toRad(dropLat);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  const distance = R * c;
  
  // Adding a 30% multiplier to approximate road distance vs straight-line distance
  return distance * 1.3;
};

const calculateETA = async (distanceKm) => {
  // Assuming an average speed of 30 km/h in city traffic
  // Time = Distance / Speed
  const timeHours = distanceKm / 30;
  return timeHours * 60; // in minutes
};

const reverseGeocode = async (lat, lng) => {
  // Dummy implementation. Use Google Geocoding API here.
  return "Dummy Address, Tamil Nadu";
};

module.exports = {
  calculateDistance,
  calculateETA,
  reverseGeocode
};
