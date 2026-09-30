/**
 * Interface for Map Providers to ensure loose coupling.
 * Implementations (e.g., geoapifyProvider) must adhere to these methods.
 */
class MapProvider {
  /**
   * @param {string} text Search text
   * @param {number} lat Current latitude (optional for bias)
   * @param {number} lon Current longitude (optional for bias)
   * @param {number} limit Number of results
   */
  async autocomplete(text, lat, lon, limit = 5) {
    throw new Error('Not implemented');
  }

  /**
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   */
  async reverseGeocode(lat, lon) {
    throw new Error('Not implemented');
  }

  /**
   * @param {object} pickup { latitude, longitude }
   * @param {object} drop { latitude, longitude }
   * @param {string} mode Routing mode (motorcycle, car, etc.)
   */
  async route(pickup, drop, mode) {
    throw new Error('Not implemented');
  }
}

module.exports = MapProvider;
