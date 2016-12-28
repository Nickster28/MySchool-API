var express = require("express");
var ParseDashboard = require("parse-dashboard");
var ParseServer = require("parse-server").ParseServer;
var path = require("path");

if (!process.env.MONGODB_URI || !process.env.APP_ID || !process.env.MASTER_KEY
	|| process.env.PARSE_DASHBOARD_CONFIG) {
	console.log("Error: one or more fields missing");
}

var api = new ParseServer({
  databaseURI: process.env.MONGODB_URI,
  cloud: __dirname + '/cloud/main.js',
  appId: process.env.APP_ID,
  masterKey: process.env.MASTER_KEY,
  serverURL: process.env.SERVER_URL || "http://localhost:1337/parse",
  liveQuery: {
    classNames: [] // List of classes to support for query subscriptions
  }
});

var dashboardConfig = JSON.parse(process.env.PARSE_DASHBOARD_CONFIG);
var dashboard = new ParseDashboard();

var app = express();

app.use('/parse', api);
app.use('/dashboard', dashboard);

app.get('*', function(req, res) {
  res.status(200).send('Hello world!');
});

var port = process.env.PORT || 1337;
var httpServer = require('http').createServer(app);
httpServer.listen(port, function() {
    console.log('parse-server-example running on port ' + port + '.');
});

// This will enable the Live Query real-time server
ParseServer.createLiveQueryServer(httpServer);