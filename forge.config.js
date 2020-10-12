const token = process.env.GITHUB_SECRET_TOKEN !== undefined ? process.env.GITHUB_SECRET_TOKEN : "";


module.exports = {
    "packagerConfig": {},
    "makers": [
        {
            "name": "@electron-forge/maker-squirrel",
            "config": {
                "name": "Teleprompter"
            }
        },
        {
            "name": "@electron-forge/maker-zip",
            "platforms": [
                "darwin"
            ]
        },
        {
            "name": "@electron-forge/maker-deb",
            "config": {}
        },
        {
            "name": "@electron-forge/maker-rpm",
            "config": {}
        }
    ],
    "publishers": [
        {
            "name": "@electron-forge/publisher-github",
            "config": {
                "repository": {
                    "owner": "gsguglielmo",
                    "name": "Teleprompter-2.0"
                },
                "draft" : true,
                "prerelease": true,
                "authToken" : token
            }
        }

    ]
}
