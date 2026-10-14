const multer = require("multer");

const storage =
    multer.diskStorage({

        destination: function (
            req,
            file,
            cb
        ) {
            cb(null, "uploads/");
        },

        filename: function (
            req,
            file,
            cb
        ) {

            const uniqueName =
                Date.now() +
                "-" +
                Math.round(
                    Math.random() * 1E9
                ) +
                "-" +
                file.originalname;

            cb(
                null,
                uniqueName
            );
        }
    });

const upload =
    multer({
        storage,

        limits: {
            fileSize:
                10 * 1024 * 1024
        }
    });

module.exports = upload;