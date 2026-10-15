const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizedOriginal}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExtensions = /\.(jpg|jpeg|png|webp|pdf|csv|xlsx|xls)$/i;
    const isAllowedExt = allowedExtensions.test(file.originalname);
    
    // Check common MIME types
    const allowedMime = /^(image\/(jpeg|png|webp)|application\/pdf|text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/octet-stream)/i.test(file.mimetype);

    if (isAllowedExt || allowedMime) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only PDF, JPG, PNG, WEBP, CSV, and Excel spreadsheets are supported as activity evidence."));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit per file
    }
});

module.exports = upload;