require('dotenv').config();

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

if (!GEOAPIFY_API_KEY) {
  console.warn('WARNING: GEOAPIFY_API_KEY is missing from environment variables.');
}

module.exports = {
  GEOAPIFY_API_KEY,
};
