const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const path = require('path');

async function createEmptyEntity(){
    
    const uuid = uuidv4();
    await fs.writeFile(path.join(__dirname, "untitled.eentity"), JSON.stringify({"id": uuid}));
    await eagle.item.addFromPath(path.join(__dirname, "untitled.eentity"));
}

async function convertItemToEntity(item){

    const itemPath = item.filePath;
    if (itemPath.endsWith(".eentity")){
        await eagle.dialog.showMessageBox({
            title: "Error",
            message: "an entity cannot be converted to an entity",
            buttons: ["OK"]
        });
        return;
    }
    
    await eagle.dialog.showMessageBox({
        title: "Error",
        message: "Not yet implemented",
        buttons: ["OK"]
    });
}

module.exports = {
    createEmptyEntity,
    convertItemToEntity
}
