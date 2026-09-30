const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Vercel uses a temporary writable filesystem.
// Local development continues to use the project's uploads folder.
const uploadDir =
  process.env.VERCEL === '1'
    ? path.join(os.tmpdir(), 'eaglefly-uploads')
    : path.join(__dirname, '../../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1E9);

    cb(
      null,
      file.fieldname +
        '-' +
        uniqueSuffix +
        path.extname(file.originalname)
    );
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return cb(
      new Error('Only image files are allowed!'),
      false
    );
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = {
  upload
};
