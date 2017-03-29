/* FILE: server
--------------------
The main MySchool API server starting point.  Launches an express server
and mounts the Parse API at /parse and the Parse Dashboard at /dashboard.
--------------------
*/


const express = require("express");
const ParseDashboard = require("parse-dashboard");
const ParseServer = require("parse-server").ParseServer;
const path = require("path");

// Make sure we have all necessary environment variables
if (!process.env.MONGODB_URI || !process.env.APP_ID || 
    !process.env.MASTER_KEY) {
    console.log("Error: Mongo URI, App ID, or Master Key missing.");
    process.exit(1);
}

const app = express();


/* OPTIONAL ENDPOINT: /dashboard
---------------------
If a dashboard config is provided, mount the Parse Dashboard at the /dashboard
endpoint endpoint.  Then, to view the dashboard, go to /dashboard.
---------------------
*/
const dashboardConfig = process.env.DASHBOARD_CONFIG;
if (dashboardConfig) {
    const dashboard = new ParseDashboard(JSON.parse(dashboardConfig));
    app.use("/dashboard", dashboard);
}


/* ENDPOINT: /parse
---------------------
Mount the Parse API at the appropriate endpoint (so all Parse API calls will go
to a URL beginning with PARSE_MOUNT_PATH).
---------------------
*/
const PARSE_MOUNT_PATH = "/parse";
var serverURL = process.env.SERVER_URL || "http://localhost:1337";
serverURL += PARSE_MOUNT_PATH;

// Configure optional iOS push notification support
var push = {}
if (process.env.IOS_PUSH_CERT && process.env.IOS_PUSH_PASSPHRASE &&
    process.env.IOS_BUNDLE_ID) {
    push = {
        ios: [
            {
                pfx: './' + process.env.IOS_PUSH_CERT,
                passphrase: process.env.IOS_PUSH_PASSPHRASE,
                bundleId: process.env.IOS_BUNDLE_ID,
                production: false
            }
        ]
    }
}

const api = new ParseServer({
    databaseURI: process.env.MONGODB_URI,
    cloud: __dirname + '/cloud/main.js',
    appId: process.env.APP_ID,
    masterKey: process.env.MASTER_KEY,
    serverURL: serverURL,
    push: push,
    liveQuery: {
        classNames: [] // List of classes to support for query subscriptions
    }
});

app.use(PARSE_MOUNT_PATH, api);


/* ENDPOINT:
----------------
A catch-all endpoint that sends back a link to the GitHub repo.
----------------
*/
app.get("*", function(req, res) {
    res.send("<html><h1>MySchool API</h1>See " +
        "<a href='https://github.com/Nickster28/MySchool-API'>" +
        "our GitHub repo</a> for this project's code.</html>");
});

// Start the server
const port = process.env.PORT || 1337;
const httpServer = require("http").createServer(app);
httpServer.listen(port, function() {
    console.log("API server running on port " + port + ".");
});

// This will enable the Live Query real-time server
ParseServer.createLiveQueryServer(httpServer);