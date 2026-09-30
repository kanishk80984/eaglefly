const axios = require('axios');
const MapProvider = require('./mapProvider');
const { GEOAPIFY_API_KEY } = require('../../config/maps');

class GeoapifyProvider extends MapProvider {
  constructor() {
    super();
    this.baseUrl = 'https://api.geoapify.com/v1';
  }

  async autocomplete(text, lat, lon, limit = 5) {
    let url = `${this.baseUrl}/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${GEOAPIFY_API_KEY}&limit=${limit}`;
    
    // Add bias if coordinates are provided
    if (lat && lon) {
      url += `&bias=proximity:${lon},${lat}`;
    }

    try {
      const response = await axios.get(url);
      
      return response.data.features.map(feature => {
        const p = feature.properties;
        return {
          placeId: p.place_id,
          name: p.name || p.street || p.formatted,
          address: p.formatted,
          latitude: p.lat,
          longitude: p.lon,
          city: p.city,
          state: p.state,
          country: p.country
        };
      });
    } catch (error) {
      console.error('Geoapify Autocomplete Error:', error.message);
      throw new Error('Failed to fetch autocomplete results');
    }
  }

  async reverseGeocode(lat, lon) {
    const url = `${this.baseUrl}/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${GEOAPIFY_API_KEY}`;
    
    try {
      const response = await axios.get(url);
      if (!response.data.features || response.data.features.length === 0) {
        return null;
      }
      
      const p = response.data.features[0].properties;
      return {
        address: p.formatted,
        city: p.city,
        state: p.state,
        country: p.country,
        latitude: p.lat,
        longitude: p.lon
      };
    } catch (error) {
      console.error('Geoapify Reverse Geocode Error:', error.message);
      throw new Error('Failed to fetch reverse geocode results');
    }
  }

  async route(pickup, drop, mode = 'motorcycle') {
    // Geoapify routing uses 'waypoint' params and 'mode'
    // Modes: drive, light_truck, heavy_truck, bicycle, walk, scooter, motorcycle
    const url = `${this.baseUrl}/routing?waypoints=${pickup.latitude},${pickup.longitude}|${drop.latitude},${drop.longitude}&mode=${mode}&apiKey=${GEOAPIFY_API_KEY}`;
    
    try {
      const response = await axios.get(url);
      const feature = response.data.features[0];
      const p = feature.properties;
      
      return {
        distanceMeters: p.distance,
        distanceKm: +(p.distance / 1000).toFixed(2),
        durationSeconds: p.time,
        durationMinutes: Math.ceil(p.time / 60),
        geometry: feature.geometry // GeoJSON LineString
      };
    } catch (error) {
      console.error('Geoapify Route Error:', error.message);
      throw new Error('Failed to calculate route');
    }
  }
}

module.exports = new GeoapifyProvider();
