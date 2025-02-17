const fs = require('fs');

module.exports = async ({ src, dest, item }) => {
    return new Promise(async (resolve, reject) => {
        try {
            const iconPath = path.join(eagle.plugin.path, "assets", "fileIcon.png");
            // load image file
            const image = new Image();
            image.src = iconPath;

            // copy the icon to the dest
            fs.copyFileSync(iconPath, dest);

            // get size
            const size = {
                height: image.height,
                width: image.width
            };

            if (!fs.existsSync(dest)) {
                return reject(new Error(`icns file load fail.`));
            }
            item.height = size?.height || item.height;
            item.width = size?.width || item.width;

            return resolve(item);
        }
        catch (err) {
            return reject(err);
        }
    });
}